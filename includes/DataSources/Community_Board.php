<?php
namespace WOTS\Signage\DataSources;

use WOTS\Signage\Media;

defined( 'ABSPATH' ) || exit;

/**
 * Community Board postings (PRD §6.2): a Pods post type, published and
 * approved, inside its own start/end window.
 *
 * On the live site the post type is `bulletin_board_item` with fields
 * start_date (date), end_date (datetime), website, and approved. The slugs
 * can be changed with the `wots_signage_community_board_fields` filter.
 */
final class Community_Board implements Data_Source, Filterable {

	public const DEFAULT_MAX = 10;

	public static function fields(): array {
		/**
		 * Filter the Community Board post type and field slugs.
		 *
		 * Set 'approved' to '' to rely on Draft → Publish alone.
		 *
		 * @param array $fields Slugs keyed by role.
		 */
		return (array) apply_filters(
			'wots_signage_community_board_fields',
			array(
				'post_type'    => 'bulletin_board_item',
				'approved'     => 'approved',
				'start_date'   => 'start_date',
				'end_date'     => 'end_date',
				'website'      => 'website',
				'organization' => 'organization',
			)
		);
	}

	public function key(): string {
		return 'community_board';
	}

	public function label(): string {
		return 'Community Board';
	}

	public function is_available(): bool {
		return post_type_exists( (string) self::fields()['post_type'] );
	}

	public function elements(): array {
		return array(
			Helpers::block_name_element(),
			Helpers::element( 'featured_image', 'Featured Image', 'image' ),
			Helpers::element( 'title', 'Title', 'text' ),
			Helpers::element( 'organization', 'Organization', 'text', 'Custom field' ),
			Helpers::element( 'content_html', 'Content (HTML)', 'html', 'Full posting, formatted' ),
			Helpers::element( 'qr_code', 'QR Code', 'qr', 'Links to the posting\'s website' ),
		);
	}

	public function taxonomies(): array {
		return Helpers::taxonomies_for( array( (string) self::fields()['post_type'] ) );
	}

	public function items( array $block_config ): array {
		$f      = self::fields();
		$filter = Helpers::term_filter( $block_config['terms'] ?? array(), $this->taxonomies() );
		if ( ! post_type_exists( (string) $f['post_type'] ) ) {
			return array();
		}

		$max   = (int) ( $block_config['max_items'] ?? 0 );
		$max   = $max > 0 ? min( $max, 50 ) : self::DEFAULT_MAX;
		$now   = time();
		$posts = get_posts(
			array(
				'post_type'      => $f['post_type'],
				'post_status'    => 'publish',
				'posts_per_page' => 200, // phpcs:ignore WordPress.WP.PostsPerPage -- filtered below; small set.
				'orderby'        => 'date',
				'order'          => 'DESC',
			)
		);

		$items = array();
		foreach ( $posts as $post ) {
			if ( '' !== $f['approved'] && ! Helpers::truthy( Helpers::meta( $post->ID, $f['approved'] ) ) ) {
				continue;
			}
			$starts = Helpers::local_timestamp( Helpers::meta( $post->ID, $f['start_date'] ) );
			$ends   = Helpers::local_timestamp( Helpers::meta( $post->ID, $f['end_date'] ), true );
			if ( ( $starts && $starts > $now ) || ( $ends && $ends < $now ) ) {
				continue;
			}
			if ( $filter && ! Helpers::matches_terms( $post->ID, $filter ) ) {
				continue;
			}

			$items[] = $this->normalize( $post, $ends );
			if ( count( $items ) >= $max ) {
				break;
			}
		}
		return $items;
	}

	private function normalize( \WP_Post $post, ?int $ends ): array {
		$f            = self::fields();
		$website      = trim( (string) Helpers::meta( $post->ID, $f['website'] ) );
		$organization = Helpers::plain( (string) Helpers::meta( $post->ID, $f['organization'] ) );
		$content      = (string) $post->post_content;

		return array(
			'id'      => 'post-' . $post->ID,
			'ends_at' => $ends,
			'fields'  => array(
				'featured_image' => Media::image( (int) get_post_thumbnail_id( $post ), 'full' ),
				'title'          => Helpers::plain( get_the_title( $post ) ),
				'organization'   => $organization,
				'content_html'   => Helpers::html( $content ),
				'qr_code'        => esc_url_raw( $website ),
				// Not a template element; used by the built-in layouts.
				'body'           => Helpers::truncate( Helpers::plain( strip_shortcodes( do_blocks( $content ) ) ), 600 ),
			),
		);
	}
}
