<?php
namespace WOTS\Signage;

defined( 'ABSPATH' ) || exit;

/**
 * Plugin settings stored in one option (PRD §10: wots_signage_settings).
 */
final class Settings {

	public const OPTION = 'wots_signage_settings';

	public static function defaults(): array {
		return array(
			'poll_interval'          => 20, // Seconds between version polls (PRD §8.3: 15–30).
			'default_image_duration' => 10, // Static image blocks.
			'default_item_duration'  => 12, // Each item of a dynamic block (one event, etc.).
			'default_video_duration' => 30, // Only used when the video has no length metadata.
			'brand_color'            => '#1d3557',
			// How one block replaces the previous one (PRD v8 transitions).
			'block_transition'       => 'crossfade',
			'transition_ms'          => 800,
			// Entrance animation for a dynamic block's content panel.
			'content_animation'      => 'fade',
			'content_animation_ms'   => 500,
			// Shape of the screen. Everything is laid out on a canvas of
			// this shape and scaled to fit the display.
			'aspect'                 => '16:9',
			// Hide unapproved / not-started / ended Community Board postings
			// from the public site's lists (Board_Visibility).
			'board_visibility'       => true,
		);
	}

	/** Canvas size in stage pixels for each screen shape. */
	public const ASPECTS = array(
		'16:9' => array( 1920, 1080 ),
		'9:16' => array( 1080, 1920 ),
		'4:3'  => array( 1440, 1080 ),
		'3:4'  => array( 1080, 1440 ),
	);

	public const ASPECT_LABELS = array(
		'16:9' => 'Landscape 16:9 (most TVs)',
		'9:16' => 'Portrait 9:16 (TV turned on its side)',
		'4:3'  => 'Landscape 4:3',
		'3:4'  => 'Portrait 3:4',
	);

	/**
	 * The canvas for the current screen shape.
	 *
	 * @return array{aspect: string, width: int, height: int}
	 */
	public static function stage(): array {
		$aspect = (string) self::get( 'aspect' );
		if ( ! isset( self::ASPECTS[ $aspect ] ) ) {
			$aspect = '16:9';
		}
		return array(
			'aspect' => $aspect,
			'width'  => self::ASPECTS[ $aspect ][0],
			'height' => self::ASPECTS[ $aspect ][1],
		);
	}

	public const TRANSITIONS = array( 'cut', 'crossfade', 'slide', 'zoom' );
	public const ANIMATIONS  = array( 'none', 'fade', 'slide', 'zoom' );

	public static function all(): array {
		$saved = get_option( self::OPTION, array() );
		return array_merge( self::defaults(), is_array( $saved ) ? $saved : array() );
	}

	public static function get( string $key ) {
		$all = self::all();
		return $all[ $key ] ?? null;
	}

	/**
	 * Validate and save. Unknown keys are dropped.
	 */
	public static function update( array $input ): array {
		$clean = self::all();

		if ( isset( $input['poll_interval'] ) ) {
			$clean['poll_interval'] = max( 5, min( 300, (int) $input['poll_interval'] ) );
		}
		foreach ( array( 'default_image_duration', 'default_item_duration', 'default_video_duration' ) as $key ) {
			if ( isset( $input[ $key ] ) ) {
				$clean[ $key ] = max( 1, min( 3600, (int) $input[ $key ] ) );
			}
		}
		if ( isset( $input['block_transition'] ) && in_array( $input['block_transition'], self::TRANSITIONS, true ) ) {
			$clean['block_transition'] = $input['block_transition'];
		}
		if ( isset( $input['content_animation'] ) && in_array( $input['content_animation'], self::ANIMATIONS, true ) ) {
			$clean['content_animation'] = $input['content_animation'];
		}
		foreach ( array( 'transition_ms', 'content_animation_ms' ) as $key ) {
			if ( isset( $input[ $key ] ) ) {
				$clean[ $key ] = max( 0, min( 5000, (int) $input[ $key ] ) );
			}
		}
		if ( isset( $input['board_visibility'] ) ) {
			$clean['board_visibility'] = (bool) $input['board_visibility'];
		}
		if ( isset( $input['aspect'] ) && isset( self::ASPECTS[ $input['aspect'] ] ) ) {
			$clean['aspect'] = $input['aspect'];
		}
		if ( isset( $input['brand_color'] ) ) {
			$color = sanitize_hex_color( (string) $input['brand_color'] );
			if ( $color ) {
				$clean['brand_color'] = $color;
			}
		}

		update_option( self::OPTION, $clean );
		return $clean;
	}
}
