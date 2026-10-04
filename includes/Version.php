<?php
namespace WOTS\Signage;

defined( 'ABSPATH' ) || exit;

/**
 * Playlist version (PRD §8.3).
 *
 * The player polls a short token and only re-downloads the playlist when it
 * changes. The token changes when:
 *  - any signage-relevant post, its meta, or its terms are saved or deleted;
 *  - settings or the TV lineup change;
 *  - "Refresh Now" is pressed;
 *  - time passes a boundary the resolver recorded (next midnight for date
 *    schedules, an event ending) — see maybe_expire().
 */
final class Version {

	public const OPTION      = 'wots_signage_version';
	public const NEXT_CHANGE = 'wots_signage_next_change';

	/** Avoid writing the option dozens of times during one request (e.g. a REST save touching many meta keys). */
	private static bool $bumped_this_request = false;

	public static function register_hooks(): void {
		add_action( 'save_post', array( self::class, 'on_post_change' ), 10, 1 );
		add_action( 'deleted_post', array( self::class, 'on_post_change' ), 10, 1 );
		add_action( 'trashed_post', array( self::class, 'on_post_change' ), 10, 1 );
		add_action( 'untrashed_post', array( self::class, 'on_post_change' ), 10, 1 );

		// Meta saved through REST lands after save_post, so watch meta too.
		foreach ( array( 'added_post_meta', 'updated_post_meta', 'deleted_post_meta' ) as $hook ) {
			add_action( $hook, array( self::class, 'on_meta_change' ), 10, 2 );
		}

		add_action( 'set_object_terms', array( self::class, 'on_post_change' ), 10, 1 );
		add_action( 'edited_' . PostTypes::CATEGORY, array( self::class, 'bump' ) );
		add_action( 'delete_' . PostTypes::CATEGORY, array( self::class, 'bump' ) );

		// A WooCommerce product used as a Featured Readers book (PRD §8.3).
		add_action( 'save_post_product', array( self::class, 'on_product_change' ), 10, 1 );
		add_action( 'woocommerce_update_product', array( self::class, 'on_product_change' ), 10, 1 );

		// Media replaced/edited or deleted.
		add_action( 'edit_attachment', array( self::class, 'bump' ) );
		add_action( 'delete_attachment', array( self::class, 'bump' ) );

		foreach ( array( Settings::OPTION, Sequences::LIVE_OPTION, Sequences::LINEUP_OPTION ) as $option ) {
			add_action( "update_option_{$option}", array( self::class, 'bump' ) );
			add_action( "add_option_{$option}", array( self::class, 'bump' ) );
		}
	}

	/**
	 * Post types whose changes can alter what's on screen.
	 * Phase 2 adds reader/recommendation/product handling through this filter.
	 */
	public static function watched_post_types(): array {
		$types = array(
			PostTypes::BLOCK,
			PostTypes::SEQUENCE,
			PostTypes::TEMPLATE,
			'tribe_events',
			DataSources\Community_Board::fields()['post_type'],
			DataSources\Featured_Readers::fields()['reader_post_type'],
			DataSources\Featured_Readers::fields()['recommendation_post_type'],
		);
		/**
		 * Filter the post types that invalidate the playlist version when saved.
		 *
		 * @param string[] $types Post type slugs.
		 */
		return (array) apply_filters( 'wots_signage_version_post_types', $types );
	}

	public static function on_post_change( $post_id ): void {
		$type = get_post_type( (int) $post_id );
		if ( $type && in_array( $type, self::watched_post_types(), true ) && ! wp_is_post_revision( (int) $post_id ) ) {
			self::bump();
		}
	}

	public static function on_product_change( $product_id ): void {
		if ( ! self::$bumped_this_request && DataSources\Featured_Readers::references_product( (int) $product_id ) ) {
			self::bump();
		}
	}

	public static function on_meta_change( $meta_id, $post_id ): void {
		self::on_post_change( $post_id );
	}

	/**
	 * Change the version token. Safe to call repeatedly; writes once per request.
	 */
	public static function bump(): string {
		if ( self::$bumped_this_request ) {
			return (string) get_option( self::OPTION, '' );
		}
		self::$bumped_this_request = true;
		$token                     = self::new_token();
		update_option( self::OPTION, $token, true );
		delete_option( self::NEXT_CHANGE );
		return $token;
	}

	/**
	 * Force a fresh token even if one was already written this request
	 * (used by Refresh Now and by time-boundary expiry).
	 */
	public static function force_bump(): string {
		self::$bumped_this_request = false;
		return self::bump();
	}

	/**
	 * The current token. Near-free: one autoloaded option read, plus a
	 * timestamp comparison.
	 */
	public static function current(): string {
		self::maybe_expire();
		$token = (string) get_option( self::OPTION, '' );
		if ( '' === $token ) {
			$token = self::force_bump();
		}
		return $token;
	}

	/**
	 * Called by the resolver with the earliest future moment at which the
	 * resolved playlist would change on its own.
	 */
	public static function set_next_change( int $timestamp ): void {
		update_option( self::NEXT_CHANGE, $timestamp, true );
	}

	private static function maybe_expire(): void {
		$next = (int) get_option( self::NEXT_CHANGE, 0 );
		if ( $next > 0 && time() >= $next ) {
			self::force_bump();
		}
	}

	private static function new_token(): string {
		return substr( md5( uniqid( '', true ) . wp_rand() ), 0, 12 );
	}
}
