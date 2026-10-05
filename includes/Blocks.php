<?php
namespace WOTS\Signage;

use WOTS\Signage\DataSources\Registry;

defined( 'ABSPATH' ) || exit;

/**
 * Read model for blocks, shaped for the admin library (PRD §9.1).
 * Writes go through the core /wp/v2/signage_block routes with registered meta.
 */
final class Blocks {

	public const TYPES = array( Resolver::TYPE_IMAGE, Resolver::TYPE_VIDEO, Resolver::TYPE_DYNAMIC );

	public static function summaries(): array {
		$posts = get_posts(
			array(
				'post_type'      => PostTypes::BLOCK,
				'post_status'    => array( 'publish', 'draft', 'private' ),
				'posts_per_page' => 500, // phpcs:ignore WordPress.WP.PostsPerPage -- small library; admin only.
				'orderby'        => 'modified',
				'order'          => 'DESC',
			)
		);

		$live_ids = array();
		foreach ( Sequences::lineup() as $show_id ) {
			foreach ( Sequences::items( $show_id ) as $item ) {
				$live_ids[] = (int) $item['block_id'];
			}
		}

		$today = Schedule::today();
		return array_map( static fn( \WP_Post $p ) => self::summary( $p, $today, $live_ids ), $posts );
	}

	private static function duration_kind( string $type ): string {
		if ( Resolver::TYPE_DYNAMIC === $type ) {
			return 'item';
		}
		return Resolver::TYPE_VIDEO === $type ? 'video' : 'image';
	}

	public static function summary( \WP_Post $post, string $today, array $live_ids = array() ): array {
		$id   = $post->ID;
		$type = (string) get_post_meta( $id, '_block_type', true );

		$thumb    = null;
		$detail   = '';
		$duration = null;
		$issue    = '';
		switch ( $type ) {
			case Resolver::TYPE_IMAGE:
				$image_ids = array_values( array_filter( Resolver::image_ids( $id ), static fn( $i ) => (bool) wp_get_attachment_image_src( $i, 'medium' ) ) );
				$src       = $image_ids ? wp_get_attachment_image_src( $image_ids[0], 'medium' ) : false;
				$thumb     = $src ? $src[0] : null;
				$issue     = $src ? '' : 'No image selected';
				if ( count( $image_ids ) > 1 ) {
					$each     = Resolver::duration( $id, 'image' );
					$detail   = count( $image_ids ) . ' images · ' . $each . 's each' . ( get_post_meta( $id, '_shuffle', true ) ? ' · shuffled' : '' );
					$duration = $each * count( $image_ids );
				}
				break;
			case Resolver::TYPE_VIDEO:
				$video = Media::video( (int) get_post_meta( $id, '_video_id', true ) );
				$thumb = $video['poster']['url'] ?? null;
				if ( ! $video ) {
					$issue = 'No video selected';
				} elseif ( null === $video['duration'] && (int) get_post_meta( $id, '_duration_seconds', true ) <= 0 ) {
					$issue = 'Video length unknown — set a duration';
				}
				$detail   = $video ? wp_basename( $video['url'] ) : '';
				$duration = $video['duration'] ?? null;
				break;
			case Resolver::TYPE_DYNAMIC:
				$source = Registry::get( (string) get_post_meta( $id, '_data_source', true ) );
				$mode   = 'list' === get_post_meta( $id, '_display_mode', true ) ? 'List' : 'Carousel';
				$detail = $source ? $source->label() . ' · ' . $mode : '';
				$bg_id  = (int) get_post_meta( $id, '_bg_image_id', true );
				$bg     = $bg_id ? wp_get_attachment_image_src( $bg_id, 'medium' ) : false;
				$thumb  = $bg ? $bg[0] : null;
				// Carousel: seconds per item. List: seconds for the whole list.
				$duration = Resolver::duration( $id, 'List' === $mode ? 'list' : 'item' );
				if ( ! $source ) {
					$issue = 'No data source';
				} elseif ( ! $source->is_available() ) {
					$issue = str_starts_with( $source->key(), 'instagram' )
						? 'Instagram isn’t connected (Signage → Settings)'
						: $source->label() . ' plugin is not active';
				}
				break;
		}

		$terms = get_the_terms( $id, PostTypes::CATEGORY );

		return array(
			'id'           => $id,
			'title'        => html_entity_decode( get_the_title( $post ), ENT_QUOTES, 'UTF-8' ),
			'post_status'  => $post->post_status,
			'type'         => $type,
			'status'       => Schedule::block_status( $id, $today ),
			'start_date'   => (string) get_post_meta( $id, '_start_date', true ),
			'end_date'     => (string) get_post_meta( $id, '_end_date', true ),
			'duration'     => $duration ?? Resolver::duration( $id, self::duration_kind( $type ) ),
			'thumbnail'    => $thumb,
			'detail'       => $detail,
			'issue'        => $issue,
			'categories'   => is_array( $terms ) ? array_map(
				static fn( $t ) => array(
					'id'   => $t->term_id,
					'name' => $t->name,
				),
				$terms
			) : array(),
			'display_mode' => (string) get_post_meta( $id, '_display_mode', true ),
			'in_live_show' => in_array( $id, $live_ids, true ),
			'modified'     => get_post_modified_time( DATE_ATOM, true, $post ),
		);
	}
}
