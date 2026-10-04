<?php
namespace WOTS\Signage;

defined( 'ABSPATH' ) || exit;

/**
 * The shop's Instagram account, through the official Instagram API (with
 * Instagram Login). Needs a Business or Creator account and an access
 * token generated in a Meta developer app; see the README.
 *
 * Tokens last 60 days. A daily cron job renews ours well before then, so
 * once it's pasted in it keeps working.
 *
 * Every read is cached, and the last good answer is kept, so a slow or
 * failed call to Instagram never blanks the TV.
 */
final class Instagram {

	public const OPTION = 'wots_signage_instagram';
	public const CRON   = 'wots_signage_instagram_refresh';

	private const API = 'https://graph.instagram.com';

	/** Seconds a follower count is reused. Instagram allows ~200 calls an hour. */
	public const PROFILE_TTL = 30;
	/** Seconds the post list is reused. */
	public const MEDIA_TTL = 600;

	/** Renew the token when it has less than this left. */
	private const RENEW_WITHIN = 30 * DAY_IN_SECONDS;

	public static function register(): void {
		add_action( self::CRON, array( self::class, 'maybe_refresh' ) );
		add_action(
			'init',
			static function () {
				if ( self::connected() && ! wp_next_scheduled( self::CRON ) ) {
					wp_schedule_event( time() + HOUR_IN_SECONDS, 'daily', self::CRON );
				}
			}
		);
	}

	/**
	 * Stored state: token, when it expires, the account, last error.
	 */
	private static function state(): array {
		$state = get_option( self::OPTION, array() );
		return is_array( $state ) ? $state : array();
	}

	private static function save_state( array $state ): void {
		update_option( self::OPTION, $state, false );
	}

	public static function connected(): bool {
		return '' !== (string) ( self::state()['token'] ?? '' );
	}

	/**
	 * For the Settings screen: who we're connected as and when the token
	 * runs out. Never includes the token itself.
	 */
	public static function status(): array {
		$state = self::state();
		return array(
			'connected' => self::connected(),
			'username'  => (string) ( $state['username'] ?? '' ),
			'expires'   => (int) ( $state['expires'] ?? 0 ),
			'error'     => (string) ( $state['error'] ?? '' ),
		);
	}

	/**
	 * Check a pasted token by reading the account with it, then store it.
	 *
	 * @return array|\WP_Error The account profile.
	 */
	public static function connect( string $token ) {
		$token = trim( $token );
		if ( '' === $token ) {
			return new \WP_Error( 'wots_signage_instagram', 'Paste an access token first.' );
		}
		$profile = self::request( '/me', array( 'fields' => self::PROFILE_FIELDS ), $token );
		if ( is_wp_error( $profile ) ) {
			return $profile;
		}
		self::save_state(
			array(
				'token'     => $token,
				// Tokens from the app dashboard are long-lived (60 days).
				'expires'   => time() + 60 * DAY_IN_SECONDS,
				'refreshed' => 0,
				'username'  => (string) ( $profile['username'] ?? '' ),
				'error'     => '',
			)
		);
		self::forget_cache();
		self::remember( 'profile', $profile );
		if ( ! wp_next_scheduled( self::CRON ) ) {
			wp_schedule_event( time() + HOUR_IN_SECONDS, 'daily', self::CRON );
		}
		Version::force_bump();
		return $profile;
	}

	public static function disconnect(): void {
		delete_option( self::OPTION );
		self::forget_cache();
		wp_clear_scheduled_hook( self::CRON );
		Version::force_bump();
	}

	/**
	 * Daily: swap the token for a fresh 60-day one when it's within a month
	 * of expiring. Instagram only renews tokens at least a day old.
	 */
	public static function maybe_refresh(): void {
		$state = self::state();
		if ( empty( $state['token'] ) ) {
			return;
		}
		$expires = (int) ( $state['expires'] ?? 0 );
		$age     = time() - (int) ( $state['refreshed'] ?? 0 );
		if ( $expires - time() > self::RENEW_WITHIN && $age < 7 * DAY_IN_SECONDS ) {
			return;
		}
		$response = self::request(
			'/refresh_access_token',
			array( 'grant_type' => 'ig_refresh_token' ),
			(string) $state['token']
		);
		if ( is_wp_error( $response ) || empty( $response['access_token'] ) ) {
			$state['error'] = is_wp_error( $response ) ? $response->get_error_message() : 'Instagram didn’t return a new token.';
			self::save_state( $state );
			return;
		}
		$state['token']     = (string) $response['access_token'];
		$state['expires']   = time() + (int) ( $response['expires_in'] ?? 60 * DAY_IN_SECONDS );
		$state['refreshed'] = time();
		$state['error']     = '';
		self::save_state( $state );
	}

	private const PROFILE_FIELDS = 'user_id,username,followers_count,media_count,profile_picture_url';

	/**
	 * The account: username, followers_count, profile_picture_url, …
	 * Null if not connected and nothing was ever fetched.
	 */
	public static function profile(): ?array {
		return self::cached(
			'profile',
			self::PROFILE_TTL,
			static fn() => self::request( '/me', array( 'fields' => self::PROFILE_FIELDS ) )
		);
	}

	/**
	 * Recent posts, newest first, as Instagram returns them.
	 */
	public static function media(): array {
		$data = self::cached(
			'media',
			self::MEDIA_TTL,
			static function () {
				$response = self::request(
					'/me/media',
					array(
						'fields' => 'id,caption,media_type,media_url,thumbnail_url,permalink,timestamp,children{media_type,media_url,thumbnail_url}',
						'limit'  => 25,
					)
				);
				return is_wp_error( $response ) ? $response : array( 'data' => (array) ( $response['data'] ?? array() ) );
			}
		);
		return (array) ( $data['data'] ?? array() );
	}

	/**
	 * Fresh enough cached value, else fetch; on failure fall back to the
	 * last good value and record the error.
	 */
	private static function cached( string $key, int $ttl, callable $fetch ): ?array {
		$fresh = get_transient( 'wots_signage_ig_' . $key );
		if ( is_array( $fresh ) ) {
			return $fresh;
		}
		if ( ! self::connected() ) {
			return null;
		}
		$value = $fetch();
		if ( is_wp_error( $value ) ) {
			$state          = self::state();
			$state['error'] = $value->get_error_message();
			self::save_state( $state );
			// Don't hammer Instagram while it's failing.
			$last = get_option( 'wots_signage_ig_last_' . $key, null );
			set_transient( 'wots_signage_ig_' . $key, is_array( $last ) ? $last : array(), min( $ttl, 60 ) );
			return is_array( $last ) ? $last : null;
		}
		self::remember( $key, $value, $ttl );
		$state = self::state();
		if ( ! empty( $state['error'] ) ) {
			$state['error'] = '';
			self::save_state( $state );
		}
		return $value;
	}

	private static function remember( string $key, array $value, int $ttl = self::PROFILE_TTL ): void {
		set_transient( 'wots_signage_ig_' . $key, $value, $ttl );
		update_option( 'wots_signage_ig_last_' . $key, $value, false );
	}

	private static function forget_cache(): void {
		foreach ( array( 'profile', 'media' ) as $key ) {
			delete_transient( 'wots_signage_ig_' . $key );
			delete_option( 'wots_signage_ig_last_' . $key );
		}
	}

	/**
	 * GET graph.instagram.com{$path}.
	 *
	 * @return array|\WP_Error Decoded JSON.
	 */
	private static function request( string $path, array $query, ?string $token = null ) {
		$token = $token ?? (string) ( self::state()['token'] ?? '' );
		$url   = add_query_arg( array_map( 'rawurlencode', $query + array( 'access_token' => $token ) ), self::API . $path );
		$res   = wp_remote_get( $url, array( 'timeout' => 10 ) );
		if ( is_wp_error( $res ) ) {
			return new \WP_Error( 'wots_signage_instagram', 'Couldn’t reach Instagram: ' . $res->get_error_message() );
		}
		$body = json_decode( (string) wp_remote_retrieve_body( $res ), true );
		if ( ! is_array( $body ) ) {
			return new \WP_Error( 'wots_signage_instagram', 'Instagram sent an unreadable reply (HTTP ' . wp_remote_retrieve_response_code( $res ) . ').' );
		}
		if ( isset( $body['error'] ) ) {
			$message = (string) ( $body['error']['message'] ?? 'Unknown error' );
			// 190 = the token is invalid or expired.
			if ( 190 === (int) ( $body['error']['code'] ?? 0 ) ) {
				$message = 'The Instagram token has expired or was revoked. Paste a new one in Signage → Settings. (' . $message . ')';
			}
			return new \WP_Error( 'wots_signage_instagram', $message );
		}
		return $body;
	}
}
