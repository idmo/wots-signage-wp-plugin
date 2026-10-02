<?php
namespace WOTS\Signage;

defined( 'ABSPATH' ) || exit;

/**
 * Shows (PRD §5). Phase 1 runs a single show; the live-sequence option is
 * already in place for multiple shows in Phase 2.
 */
final class Sequences {

	public const LIVE_OPTION = 'wots_signage_live_sequence';

	/**
	 * The live show's ID. If none is set (fresh install), the first existing
	 * show becomes live, or a "Main Show" is created when $create is true.
	 */
	public static function live_id( bool $create = false ): int {
		$id = (int) get_option( self::LIVE_OPTION, 0 );
		if ( $id && PostTypes::SEQUENCE === get_post_type( $id ) && 'trash' !== get_post_status( $id ) ) {
			return $id;
		}

		$existing = get_posts(
			array(
				'post_type'      => PostTypes::SEQUENCE,
				'post_status'    => 'publish',
				'posts_per_page' => 1,
				'orderby'        => 'ID',
				'order'          => 'ASC',
				'fields'         => 'ids',
			)
		);
		if ( $existing ) {
			update_option( self::LIVE_OPTION, (int) $existing[0], false );
			return (int) $existing[0];
		}

		if ( ! $create ) {
			return 0;
		}

		$new_id = wp_insert_post(
			array(
				'post_type'   => PostTypes::SEQUENCE,
				'post_status' => 'publish',
				'post_title'  => 'Main Show',
				'meta_input'  => array( '_items' => '[]' ),
			)
		);
		if ( is_wp_error( $new_id ) || ! $new_id ) {
			return 0;
		}
		update_option( self::LIVE_OPTION, (int) $new_id, false );
		return (int) $new_id;
	}

	/**
	 * Ordered items: [ [ 'block_id' => int, 'pinned' => bool ], ... ].
	 */
	public static function items( int $sequence_id ): array {
		$raw   = get_post_meta( $sequence_id, '_items', true );
		$items = is_string( $raw ) ? json_decode( $raw, true ) : null;
		return self::sanitize_items( is_array( $items ) ? $items : array() );
	}

	public static function save_items( int $sequence_id, array $items ): array {
		$clean = self::sanitize_items( $items );
		update_post_meta( $sequence_id, '_items', wp_slash( wp_json_encode( $clean ) ) );
		return $clean;
	}

	/**
	 * Drop malformed entries and blocks that no longer exist. A block may
	 * appear more than once in a show (e.g. a promo at the top and middle).
	 */
	public static function sanitize_items( array $items ): array {
		$clean = array();
		foreach ( $items as $item ) {
			$block_id = (int) ( is_array( $item ) ? ( $item['block_id'] ?? 0 ) : $item );
			if ( $block_id <= 0 || PostTypes::BLOCK !== get_post_type( $block_id ) ) {
				continue;
			}
			$clean[] = array(
				'block_id' => $block_id,
				'pinned'   => ! empty( $item['pinned'] ),
			);
		}
		return $clean;
	}

	public static function summaries(): array {
		$live  = self::live_id();
		$posts = get_posts(
			array(
				'post_type'      => PostTypes::SEQUENCE,
				'post_status'    => 'publish',
				'posts_per_page' => 100, // phpcs:ignore WordPress.WP.PostsPerPage -- admin only.
				'orderby'        => 'title',
				'order'          => 'ASC',
			)
		);
		return array_map(
			static fn( \WP_Post $p ) => array(
				'id'       => $p->ID,
				'title'    => html_entity_decode( get_the_title( $p ), ENT_QUOTES, 'UTF-8' ),
				'count'    => count( self::items( $p->ID ) ),
				'is_live'  => $p->ID === $live,
				'modified' => get_post_modified_time( DATE_ATOM, true, $p ),
			),
			$posts
		);
	}

	/**
	 * Copy a show (same blocks, same order) as "<title> (copy)".
	 */
	public static function duplicate( int $sequence_id ): int {
		if ( PostTypes::SEQUENCE !== get_post_type( $sequence_id ) ) {
			return 0;
		}
		$new_id = wp_insert_post(
			array(
				'post_type'   => PostTypes::SEQUENCE,
				'post_status' => 'publish',
				'post_title'  => get_the_title( $sequence_id ) . ' (copy)',
			)
		);
		if ( is_wp_error( $new_id ) || ! $new_id ) {
			return 0;
		}
		self::save_items( (int) $new_id, self::items( $sequence_id ) );
		return (int) $new_id;
	}

	public static function activate( int $sequence_id ): bool {
		if ( PostTypes::SEQUENCE !== get_post_type( $sequence_id ) ) {
			return false;
		}
		update_option( self::LIVE_OPTION, $sequence_id, false );
		return true;
	}
}
