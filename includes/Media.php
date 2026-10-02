<?php
namespace WOTS\Signage;

defined( 'ABSPATH' ) || exit;

/**
 * Media library helpers. Assets are always attachments referenced by ID (PRD §3).
 */
final class Media {

	/** 1920×1080 hard crop for template images (PRD §7). */
	public const SIZE_169 = 'signage_169';

	public static function register_sizes(): void {
		add_image_size( self::SIZE_169, 1920, 1080, true );
	}

	/**
	 * Image payload for the player, or null if the attachment is gone.
	 *
	 * @param string $size A registered size; WordPress falls back to the
	 *                     original when that size wasn't generated (e.g. the
	 *                     upload predates the plugin or is smaller than 1920×1080).
	 */
	public static function image( int $attachment_id, string $size = 'full' ): ?array {
		if ( $attachment_id <= 0 || ! wp_attachment_is_image( $attachment_id ) ) {
			return null;
		}
		$src = wp_get_attachment_image_src( $attachment_id, $size );
		if ( ! $src ) {
			return null;
		}
		return array(
			'id'     => $attachment_id,
			'url'    => $src[0],
			'width'  => (int) $src[1],
			'height' => (int) $src[2],
			'alt'    => (string) get_post_meta( $attachment_id, '_wp_attachment_image_alt', true ),
		);
	}

	/**
	 * Video payload, or null if the attachment is gone or isn't a video.
	 * Duration comes from attachment metadata, which WordPress fills on
	 * upload (PRD §3) — no ffprobe.
	 */
	public static function video( int $attachment_id ): ?array {
		if ( $attachment_id <= 0 || 'attachment' !== get_post_type( $attachment_id ) ) {
			return null;
		}
		$mime = (string) get_post_mime_type( $attachment_id );
		if ( ! str_starts_with( $mime, 'video/' ) ) {
			return null;
		}
		$url = wp_get_attachment_url( $attachment_id );
		if ( ! $url ) {
			return null;
		}
		return array(
			'id'       => $attachment_id,
			'url'      => $url,
			'mime'     => $mime,
			'duration' => self::video_length( $attachment_id ),
			'poster'   => self::image( (int) get_post_thumbnail_id( $attachment_id ), 'full' ),
		);
	}

	/**
	 * Length in seconds from metadata, or null when WordPress couldn't read it.
	 */
	public static function video_length( int $attachment_id ): ?int {
		$meta = wp_get_attachment_metadata( $attachment_id );
		if ( is_array( $meta ) && ! empty( $meta['length'] ) ) {
			return (int) ceil( (float) $meta['length'] );
		}
		return null;
	}
}
