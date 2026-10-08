<?php
namespace WOTS\Signage;

use WOTS\Signage\DataSources\Community_Board;

defined( 'ABSPATH' ) || exit;

/**
 * Makes Community Board postings behave like events on the public site:
 *
 *  - Lists (the archive, search, feeds, sitemaps, Query Loop blocks, the
 *    REST API) only include postings that are approved and inside their
 *    start/end dates.
 *  - A posting's own page keeps working after it ends, with a short "This
 *    posting has ended" note, like The Events Calendar does for past
 *    events. Unapproved postings return "page not found".
 *
 * The dates only decide visibility; templates don't need to show them.
 * Turn it off in Signage → Settings, or with the
 * wots_signage_board_visibility filter.
 */
final class Board_Visibility {

	/** @var int[]|null Postings to keep out of lists, worked out once per request. */
	private static ?array $hidden = null;

	public static function register(): void {
		add_action( 'init', array( self::class, 'maybe_hook' ), 20 );
	}

	public static function enabled(): bool {
		/**
		 * Whether Community Board postings are hidden from the public site
		 * when unapproved or outside their dates.
		 *
		 * @param bool $enabled From Signage → Settings.
		 */
		return (bool) apply_filters( 'wots_signage_board_visibility', (bool) Settings::get( 'board_visibility' ) );
	}

	public static function maybe_hook(): void {
		$type = self::post_type();
		if ( ! self::enabled() || ! post_type_exists( $type ) ) {
			return;
		}
		add_action( 'pre_get_posts', array( self::class, 'filter_query' ) );
		add_action( 'template_redirect', array( self::class, 'guard_single' ) );
		add_filter( 'the_content', array( self::class, 'ended_note' ), 30 );
		add_filter( "rest_{$type}_query", array( self::class, 'filter_rest_query' ) );
		add_filter( 'wp_sitemaps_posts_query_args', array( self::class, 'filter_sitemap' ), 10, 2 );
	}

	private static function post_type(): string {
		return (string) Community_Board::fields()['post_type'];
	}

	/**
	 * IDs of published postings that shouldn't appear in lists right now.
	 *
	 * @return int[]
	 */
	public static function hidden_ids(): array {
		if ( null === self::$hidden ) {
			$ids          = get_posts(
				array(
					'post_type'        => self::post_type(),
					'post_status'      => 'publish',
					'posts_per_page'   => 500, // phpcs:ignore WordPress.WP.PostsPerPage -- a community board; small.
					'fields'           => 'ids',
					'suppress_filters' => true,
					'no_found_rows'    => true,
				)
			);
			$now          = time();
			self::$hidden = array_values(
				array_filter(
					array_map( 'intval', $ids ),
					static fn( int $id ) => Community_Board::VISIBLE !== Community_Board::status( $id, $now )
				)
			);
		}
		return self::$hidden;
	}

	/**
	 * Does this query list posts that could include postings?
	 */
	private static function lists_postings( \WP_Query $query ): bool {
		if ( $query->is_singular() ) {
			return false; // A posting's own page is handled by guard_single().
		}
		$types = $query->get( 'post_type' );
		if ( '' === $types || null === $types || array() === $types ) {
			// Searches and feeds without a type cover every searchable type.
			return $query->is_search() || $query->is_feed();
		}
		$types = (array) $types;
		return in_array( 'any', $types, true ) || in_array( self::post_type(), $types, true );
	}

	/**
	 * Front-end queries (main and secondary, e.g. Query Loop blocks).
	 */
	public static function filter_query( \WP_Query $query ): void {
		// get_posts() calls (including ours below, and the TV's) suppress
		// filters; themes' and blocks' listings don't.
		if ( is_admin() || $query->get( 'suppress_filters' ) || ! self::lists_postings( $query ) ) {
			return;
		}
		self::exclude( $query );
	}

	private static function exclude( \WP_Query $query ): void {
		$hidden = self::hidden_ids();
		if ( $hidden ) {
			$query->set( 'post__not_in', array_values( array_unique( array_merge( array_map( 'intval', (array) $query->get( 'post__not_in' ) ), $hidden ) ) ) );
		}
	}

	/**
	 * Public REST listings (/wp/v2/{type}). Editors still see everything.
	 *
	 * @param array $args WP_Query arguments.
	 */
	public static function filter_rest_query( array $args ): array {
		if ( current_user_can( 'edit_posts' ) ) {
			return $args;
		}
		$hidden = self::hidden_ids();
		if ( $hidden ) {
			$args['post__not_in'] = array_values( array_unique( array_merge( array_map( 'intval', (array) ( $args['post__not_in'] ?? array() ) ), $hidden ) ) );
		}
		return $args;
	}

	/**
	 * WordPress's built-in sitemap (/wp-sitemap.xml).
	 *
	 * @param array  $args      Query arguments.
	 * @param string $post_type The sitemap's post type.
	 */
	public static function filter_sitemap( array $args, string $post_type ): array {
		if ( self::post_type() === $post_type ) {
			$hidden = self::hidden_ids();
			if ( $hidden ) {
				$args['post__not_in'] = array_values( array_unique( array_merge( (array) ( $args['post__not_in'] ?? array() ), $hidden ) ) );
			}
		}
		return $args;
	}

	/**
	 * A posting's own page: unapproved ones are "not found" to the public
	 * (editors can still preview them).
	 */
	public static function guard_single(): void {
		if ( ! is_singular( self::post_type() ) || current_user_can( 'edit_post', get_queried_object_id() ) ) {
			return;
		}
		if ( Community_Board::UNAPPROVED === Community_Board::status( get_queried_object_id() ) ) {
			global $wp_query;
			$wp_query->set_404();
			status_header( 404 );
			nocache_headers();
		}
	}

	/**
	 * "This posting has ended." above an ended posting's content.
	 *
	 * @param string $content Post content (after any Pods template).
	 */
	public static function ended_note( $content ) {
		if ( ! is_singular( self::post_type() ) || ! in_the_loop() || ! is_main_query() || get_the_ID() !== get_queried_object_id() ) {
			return $content;
		}
		if ( Community_Board::ENDED !== Community_Board::status( (int) get_the_ID() ) ) {
			return $content;
		}
		/**
		 * The note shown on a Community Board posting that has ended.
		 *
		 * @param string $html Note markup.
		 */
		$note = (string) apply_filters( 'wots_signage_board_ended_note', '<p class="wots-board-ended"><em>This posting has ended.</em></p>' );
		return $note . $content;
	}
}
