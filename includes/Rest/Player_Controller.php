<?php
namespace WOTS\Signage\Rest;

use WOTS\Signage\Player_Route;
use WOTS\Signage\Plugin;
use WOTS\Signage\Resolver;
use WOTS\Signage\Settings;
use WOTS\Signage\Version;

defined( 'ABSPATH' ) || exit;

/**
 * Kiosk-facing endpoints (PRD §8.3, §8.5). Authorized by the player key, or
 * by a logged-in user with manage_signage (admin preview).
 */
final class Player_Controller {

	public const NS            = 'wots-signage/v1';
	public const HEARTBEAT_OPT = 'wots_signage_heartbeat';

	public static function register_routes(): void {
		$key_arg = array(
			'key' => array(
				'type'     => 'string',
				'required' => false,
			),
		);

		register_rest_route(
			self::NS,
			'/player/version',
			array(
				'methods'             => \WP_REST_Server::READABLE,
				'callback'            => array( self::class, 'version' ),
				'permission_callback' => array( self::class, 'authorize' ),
				'args'                => $key_arg,
			)
		);

		register_rest_route(
			self::NS,
			'/player/playlist',
			array(
				'methods'             => \WP_REST_Server::READABLE,
				'callback'            => array( self::class, 'playlist' ),
				'permission_callback' => array( self::class, 'authorize' ),
				'args'                => $key_arg,
			)
		);

		register_rest_route(
			self::NS,
			'/player/heartbeat',
			array(
				'methods'             => \WP_REST_Server::CREATABLE,
				'callback'            => array( self::class, 'heartbeat' ),
				'permission_callback' => array( self::class, 'authorize' ),
				'args'                => $key_arg,
			)
		);
	}

	public static function authorize( \WP_REST_Request $request ): bool {
		$key = $request->get_param( 'key' );
		return Player_Route::key_is_valid( is_string( $key ) ? $key : null ) || current_user_can( Plugin::CAPABILITY );
	}

	public static function version(): \WP_REST_Response {
		return new \WP_REST_Response(
			array(
				'version'       => Version::current(),
				'poll_interval' => (int) Settings::get( 'poll_interval' ),
				// Lets the kiosk reload itself after a plugin update.
				'build'         => self::player_build(),
			)
		);
	}

	public static function player_build(): string {
		$asset_file = WOTS_SIGNAGE_DIR . 'build/player.asset.php';
		$asset      = is_readable( $asset_file ) ? require $asset_file : array();
		return WOTS_SIGNAGE_VERSION . '-' . ( $asset['version'] ?? '0' );
	}

	public static function playlist(): \WP_REST_Response {
		return new \WP_REST_Response( Resolver::playlist() );
	}

	public static function heartbeat( \WP_REST_Request $request ): \WP_REST_Response {
		$body = $request->get_json_params();
		$body = is_array( $body ) ? $body : array();

		$payload = array(
			'time'       => time(),
			'version'    => sanitize_text_field( (string) ( $body['version'] ?? '' ) ),
			'item_key'   => sanitize_text_field( (string) ( $body['item_key'] ?? '' ) ),
			'item_name'  => sanitize_text_field( (string) ( $body['item_name'] ?? '' ) ),
			'last_error' => sanitize_text_field( substr( (string) ( $body['last_error'] ?? '' ), 0, 500 ) ),
			'offline'    => ! empty( $body['offline'] ),
			'screen'     => sanitize_text_field( (string) ( $body['screen'] ?? '' ) ),
			'user_agent' => sanitize_text_field( substr( (string) $request->get_header( 'user-agent' ), 0, 300 ) ),
			'preview'    => ! Player_Route::key_is_valid( is_string( $request->get_param( 'key' ) ) ? $request->get_param( 'key' ) : null ),
		);

		// Admin previews shouldn't masquerade as the shop TV.
		if ( ! $payload['preview'] ) {
			update_option( self::HEARTBEAT_OPT, $payload, false );
		}
		return new \WP_REST_Response( array( 'ok' => true ) );
	}

	/**
	 * Every wots-signage/v1 response is uncacheable so Pressable's page/edge
	 * cache never serves a stale playlist (PRD §12).
	 */
	public static function no_store( $response, $server, \WP_REST_Request $request ) {
		if ( str_starts_with( $request->get_route(), '/' . self::NS ) && $response instanceof \WP_REST_Response ) {
			$response->header( 'Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0' );
			$response->header( 'Pragma', 'no-cache' );
			$response->header( 'Expires', '0' );
			if ( function_exists( 'batcache_cancel' ) ) {
				batcache_cancel(); // Pressable's page cache.
			}
		}
		return $response;
	}
}
