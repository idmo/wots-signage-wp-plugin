<?php
namespace WOTS\Signage;

use WOTS\Signage\DataSources\Registry;

defined( 'ABSPATH' ) || exit;

/**
 * Live show -> eligible blocks -> expanded playlist (PRD §5, §8.3).
 *
 * PHP resolves and normalizes data; the React player renders it. The output
 * is plain data so the player and (Phase 2) builder preview share a renderer.
 */
final class Resolver {

	public const TYPE_IMAGE   = 'static_image';
	public const TYPE_VIDEO   = 'video';
	public const TYPE_DYNAMIC = 'dynamic_template';

	public const FIT_MODES = array( 'cover', 'contain', 'contain-blur' );

	/**
	 * The full playlist: every show in the TV lineup, back to back.
	 */
	public static function playlist(): array {
		// Read the version first: if a time boundary just passed, this bumps
		// it, and the payload below is resolved against the new state.
		$version    = Version::current();
		$lineup     = Sequences::lineup();
		$boundaries = array( Schedule::next_midnight() );
		$items      = array();
		$today      = Schedule::today();

		foreach ( $lineup as $sequence_id ) {
			foreach ( Sequences::items( $sequence_id ) as $position => $entry ) {
				foreach ( self::resolve_block( (int) $entry['block_id'], $today, $boundaries ) as $item ) {
					// Unique even when the same block appears twice in a
					// show, or in two shows.
					$prefix        = $sequence_id . '.' . $position . ':';
					$item['key']   = $prefix . $item['key'];
					$item['group'] = $prefix . $item['group'];
					$item['show']  = $sequence_id;
					$items[]       = $item;
				}
			}
		}

		$now    = time();
		$future = array_filter( $boundaries, static fn( $t ) => $t > $now );
		Version::set_next_change( $future ? (int) min( $future ) : Schedule::next_midnight() );

		$shows = array_map(
			static fn( int $id ) => array(
				'id'    => $id,
				'title' => html_entity_decode( get_the_title( $id ), ENT_QUOTES, 'UTF-8' ),
			),
			$lineup
		);
		return array(
			'version'      => $version,
			'generated_at' => gmdate( DATE_ATOM ),
			// First show, kept for players from before 0.3.
			'show'         => $shows[0] ?? null,
			'shows'        => $shows,
			'settings'     => self::player_settings(),
			'items'        => $items,
		);
	}

	public static function player_settings(): array {
		$settings = Settings::all();
		return array(
			'poll_interval' => (int) $settings['poll_interval'],
			'brand_color'   => (string) $settings['brand_color'],
			'stage'         => Settings::stage(),
		);
	}

	/**
	 * A playlist of one block, for the admin's block preview. Ignores the
	 * block's dates and status so you can check it before it goes live.
	 */
	public static function preview( int $block_id, string $name = '' ): array {
		$boundaries = array();
		$items      = self::resolve_block( $block_id, Schedule::today(), $boundaries, true, $name );
		return array(
			'version'      => 'preview',
			'generated_at' => gmdate( DATE_ATOM ),
			'show'         => null,
			'shows'        => array(),
			'settings'     => self::player_settings(),
			'items'        => $items,
		);
	}

	/**
	 * Expand one block into zero or more playlist items.
	 *
	 * @param int[]  $boundaries Collects future timestamps at which output changes.
	 * @param bool   $preview    Skip the published/date checks (admin preview).
	 * @param string $name       Name to show instead of the saved title (preview).
	 */
	public static function resolve_block( int $block_id, string $today, array &$boundaries = array(), bool $preview = false, string $name = '' ): array {
		if ( ! $preview ) {
			$block = get_post( $block_id );
			if ( ! $block || PostTypes::BLOCK !== $block->post_type || 'publish' !== $block->post_status ) {
				return array();
			}
			if ( Schedule::ACTIVE !== Schedule::block_status( $block_id, $today ) ) {
				return array();
			}
		}

		$type = (string) get_post_meta( $block_id, '_block_type', true );
		if ( '' === $name ) {
			$name = html_entity_decode( get_the_title( $block_id ), ENT_QUOTES, 'UTF-8' );
		}
		$base = array(
			'key'        => 'b' . $block_id,
			// Items expanded from one block share a group: the player keeps
			// the panel and background, and only animates the content.
			'group'      => 'b' . $block_id,
			'block_id'   => $block_id,
			'block_name' => $name,
			'transition' => self::transition( $block_id ),
		);

		switch ( $type ) {
			case self::TYPE_IMAGE:
				$image = Media::image( (int) get_post_meta( $block_id, '_image_id', true ), 'full' );
				if ( ! $image ) {
					return array();
				}
				return array(
					$base + array(
						'type'     => 'image',
						'duration' => self::duration( $block_id, 'image' ),
						'fit'      => self::fit( $block_id ),
						'image'    => $image,
					),
				);

			case self::TYPE_VIDEO:
				$video = Media::video( (int) get_post_meta( $block_id, '_video_id', true ) );
				if ( ! $video ) {
					return array();
				}
				return array(
					$base + array(
						'type'     => 'video',
						// Metadata length wins; manual duration only fills the gap (PRD §3).
						'duration' => $video['duration'] ?? self::duration( $block_id, 'video' ),
						'fit'      => self::fit( $block_id ),
						'video'    => $video,
					),
				);

			case self::TYPE_DYNAMIC:
				return self::resolve_dynamic( $block_id, $name, $base, $boundaries );
		}

		return array();
	}

	/**
	 * A dynamic block: Carousel = one item per source item; List = one item
	 * showing all of them (PRD v8 §3). Empty sources are skipped.
	 */
	private static function resolve_dynamic( int $block_id, string $name, array $base, array &$boundaries ): array {
		$source = Registry::get( (string) get_post_meta( $block_id, '_data_source', true ) );
		if ( ! $source ) {
			return array();
		}
		$mode   = 'list' === get_post_meta( $block_id, '_display_mode', true ) ? 'list' : 'carousel';
		$config = self::source_config( $block_id ) + array( 'display_mode' => $mode );

		$source_items = $source->items( $config );
		if ( ! $source_items ) {
			return array();
		}
		foreach ( $source_items as $source_item ) {
			if ( ! empty( $source_item['ends_at'] ) ) {
				$boundaries[] = (int) $source_item['ends_at'];
			}
		}

		$slide = $base + array(
			'type'     => 'slide',
			'source'   => $source->key(),
			'mode'     => $mode,
			'template' => 'carousel' === $mode ? Templates::for_block( $block_id, $source->key() ) : null,
			'panel'    => self::panel( $block_id ),
		);

		if ( 'list' === $mode ) {
			return array(
				$slide + array(
					'duration' => self::duration( $block_id, 'list' ),
					'label'    => (string) get_post_meta( $block_id, '_list_label', true ),
					'items'    => array_map(
						static fn( $i ) => array( 'id' => $i['id'] ) + array( 'block_name' => $name ) + (array) $i['fields'],
						$source_items
					),
				),
			);
		}

		$duration = self::duration( $block_id, 'item' );
		$out      = array();
		foreach ( $source_items as $source_item ) {
			$out[] = array_merge(
				$slide,
				array(
					'key'      => 'b' . $block_id . '-' . $source_item['id'],
					'duration' => $duration,
					'fields'   => array( 'block_name' => $name ) + (array) $source_item['fields'],
				)
			);
		}
		return $out;
	}

	/**
	 * What a dynamic block asks its data source for.
	 */
	public static function source_config( int $block_id ): array {
		$terms = json_decode( (string) get_post_meta( $block_id, '_term_filter', true ), true );
		return array(
			'max_items'           => (int) get_post_meta( $block_id, '_max_items', true ),
			'featured_month_year' => (string) get_post_meta( $block_id, '_featured_month_year', true ),
			'event_range'         => (string) get_post_meta( $block_id, '_event_range', true ),
			'range_days'          => (int) get_post_meta( $block_id, '_range_days', true ),
			'range_start'         => (string) get_post_meta( $block_id, '_range_start', true ),
			'range_end'           => (string) get_post_meta( $block_id, '_range_end', true ),
			'terms'               => is_array( $terms ) ? $terms : array(),
		);
	}

	/**
	 * Panel styling for the built-in and template layouts.
	 */
	public static function panel( int $block_id ): array {
		$settings  = Settings::all();
		$animation = (string) get_post_meta( $block_id, '_content_animation', true );
		return array(
			'background'   => Media::image( (int) get_post_meta( $block_id, '_bg_image_id', true ), 'full' ),
			'color'        => (string) get_post_meta( $block_id, '_panel_color', true ),
			'opacity'      => (int) get_post_meta( $block_id, '_panel_opacity', true ),
			'title'        => (string) get_post_meta( $block_id, '_title_color', true ),
			'body'         => (string) get_post_meta( $block_id, '_body_color', true ),
			'meta'         => (string) get_post_meta( $block_id, '_meta_color', true ),
			'animation'    => in_array( $animation, Settings::ANIMATIONS, true ) ? $animation : (string) $settings['content_animation'],
			'animation_ms' => (int) $settings['content_animation_ms'],
		);
	}

	/**
	 * How this block replaces the previous one: its own choice, else the default.
	 */
	public static function transition( int $block_id ): array {
		$settings = Settings::all();
		$own      = (string) get_post_meta( $block_id, '_transition', true );
		return array(
			'type' => in_array( $own, Settings::TRANSITIONS, true ) ? $own : (string) $settings['block_transition'],
			'ms'   => (int) $settings['transition_ms'],
		);
	}

	/**
	 * Seconds on screen: the block's own value, else its category default,
	 * else the global default for that kind.
	 *
	 * @param string $kind image | video | item.
	 */
	public static function duration( int $block_id, string $kind ): int {
		// List mode shows everything on one slide, for "Seconds on screen".
		$meta_key = 'item' === $kind ? '_per_item_duration' : '_duration_seconds';
		$own      = (int) get_post_meta( $block_id, $meta_key, true );
		if ( $own <= 0 && in_array( $kind, array( 'item', 'list' ), true ) ) {
			$own = (int) get_post_meta( $block_id, 'item' === $kind ? '_duration_seconds' : '_per_item_duration', true );
		}
		if ( $own > 0 ) {
			return $own;
		}

		$terms = get_the_terms( $block_id, PostTypes::CATEGORY );
		if ( is_array( $terms ) ) {
			foreach ( $terms as $term ) {
				$default = (int) get_term_meta( $term->term_id, '_default_duration', true );
				if ( $default > 0 ) {
					return $default;
				}
			}
		}

		$settings = Settings::all();
		$map      = array(
			'image' => 'default_image_duration',
			'video' => 'default_video_duration',
			'item'  => 'default_item_duration',
			'list'  => 'default_item_duration',
		);
		return (int) $settings[ $map[ $kind ] ?? 'default_image_duration' ];
	}

	private static function fit( int $block_id ): string {
		$fit = (string) get_post_meta( $block_id, '_fit_mode', true );
		return in_array( $fit, self::FIT_MODES, true ) ? $fit : 'cover';
	}
}
