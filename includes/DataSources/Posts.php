<?php
namespace WOTS\Signage\DataSources;

use WOTS\Signage\Media;

defined( 'ABSPATH' ) || exit;

/**
 * Regular WordPress posts, newest first. Narrow them by category or tag
 * (Filterable), or hand-pick posts (Pickable), shown in the order picked.
 */
final class Posts implements Data_Source, Filterable, Pickable {

	public const DEFAULT_MAX = 5;

	public function key(): string {
		return 'posts';
	}

	public function label(): string {
		return 'Posts';
	}

	public function is_available(): bool {
		return true;
	}

	public function taxonomies(): array {
		return Helpers::taxonomies_for( array( 'post' ) );
	}

	public function pick_post_type(): string {
		return 'post';
	}

	public function pick_label(): string {
		return 'posts';
	}

	public function elements(): array {
		return array(
			Helpers::block_name_element(),
			Helpers::element( 'featured_image', 'Featured Image', 'image' ),
			Helpers::element( 'title', 'Title', 'text' ),
			Helpers::element( 'date', 'Date', 'text', 'e.g. "Oct 2, 2026"' ),
			Helpers::element( 'author', 'Author', 'text' ),
			Helpers::element( 'categories', 'Categories', 'text', 'Comma-separated' ),
			Helpers::element( 'excerpt', 'Excerpt', 'text', 'Plain text, trimmed' ),
			Helpers::element( 'content_html', 'Content (HTML)', 'html', 'The full post, formatted' ),
			Helpers::element( 'qr_code', 'QR Code', 'qr', 'Links to the post' ),
		);
	}

	public function items( array $block_config ): array {
		$ids    = Helpers::post_ids( $block_config );
		$max    = (int) ( $block_config['max_items'] ?? 0 );
		$max    = $max > 0 ? min( $max, 50 ) : ( $ids ? count( $ids ) : self::DEFAULT_MAX );
		$filter = Helpers::term_filter( $block_config['terms'] ?? array(), $this->taxonomies() );

		$args = array(
			'post_type'           => 'post',
			'post_status'         => 'publish',
			'posts_per_page'      => $max,
			'ignore_sticky_posts' => true,
			'orderby'             => 'date',
			'order'               => 'DESC',
			'has_password'        => false,
		);
		if ( $ids ) {
			$args['post__in'] = $ids;
			$args['orderby']  = 'post__in';
		}
		$exclude_ids   = Helpers::exclude_ids( $block_config );
		$exclude_terms = Helpers::term_filter( $block_config['exclude_terms'] ?? array(), $this->taxonomies() );
		if ( $exclude_ids ) {
			$args['post__not_in'] = $exclude_ids; // phpcs:ignore WordPressVIPMinimum.Performance.WPQueryParams.PostNotIn_post__not_in -- small, capped query.
		}
		if ( $filter || $exclude_terms ) {
			$tax_query = Helpers::tax_query( $filter );
			foreach ( $exclude_terms as $taxonomy => $ids ) {
				$tax_query[] = array(
					'taxonomy' => $taxonomy,
					'field'    => 'term_id',
					'terms'    => $ids,
					'operator' => 'NOT IN',
				);
			}
			$args['tax_query'] = $tax_query; // phpcs:ignore WordPress.DB.SlowDBQuery.slow_db_query_tax_query -- small, capped query.
		}

		return array_map( array( $this, 'normalize' ), get_posts( $args ) );
	}

	private function normalize( \WP_Post $post ): array {
		$content = (string) $post->post_content;
		$excerpt = has_excerpt( $post ) ? (string) $post->post_excerpt : $content;
		$terms   = get_the_terms( $post, 'category' );
		return array(
			'id'     => 'post-' . $post->ID,
			'fields' => array(
				'featured_image' => Media::image( (int) get_post_thumbnail_id( $post ), 'full' ),
				'title'          => Helpers::plain( get_the_title( $post ) ),
				'date'           => (string) get_the_date( 'M j, Y', $post ),
				'author'         => Helpers::plain( (string) get_the_author_meta( 'display_name', (int) $post->post_author ) ),
				'categories'     => is_array( $terms ) ? implode( ', ', wp_list_pluck( $terms, 'name' ) ) : '',
				'excerpt'        => Helpers::truncate( Helpers::plain( strip_shortcodes( excerpt_remove_blocks( $excerpt ) ) ), 320 ),
				'content_html'   => Helpers::html( $content ),
				'qr_code'        => (string) get_permalink( $post ),
			),
		);
	}
}
