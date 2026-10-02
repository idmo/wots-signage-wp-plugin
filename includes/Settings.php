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
