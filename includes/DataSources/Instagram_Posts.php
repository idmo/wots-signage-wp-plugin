<?php
namespace WOTS\Signage\DataSources;

use WOTS\Signage\Instagram;

defined( 'ABSPATH' ) || exit;

/**
 * Recent posts and reels from the connected Instagram account. Photos show
 * as images; videos and reels play muted. Albums show their first slide.
 */
final class Instagram_Posts implements Data_Source {

	public const DEFAULT_MAX = 6;

	public function key(): string {
		return 'instagram';
	}

	public function label(): string {
		return 'Instagram Posts';
	}

	public function is_available(): bool {
		return Instagram::connected();
	}

	public function elements(): array {
		return array(
			Helpers::block_name_element(),
			Helpers::element( 'media', 'Post (photo or video)', 'media', 'Videos and reels play muted' ),
			Helpers::element( 'caption', 'Caption', 'text' ),
			Helpers::element( 'username', 'Username', 'text', '@yourshop' ),
			Helpers::element( 'posted', 'Date posted', 'text' ),
			Helpers::element( 'qr_code', 'QR Code', 'qr', 'Links to the post' ),
		);
	}

	public function items( array $block_config ): array {
		if ( ! $this->is_available() ) {
			return array();
		}
		$max     = (int) ( $block_config['max_items'] ?? 0 );
		$max     = $max > 0 ? min( $max, 25 ) : self::DEFAULT_MAX;
		$profile = Instagram::profile();
		$handle  = '' !== (string) ( $profile['username'] ?? '' ) ? '@' . $profile['username'] : '';
		// Instagram's media links are signed and expire, so re-resolve the
		// playlist when the cached list is due for a refresh.
		$refresh = time() + Instagram::MEDIA_TTL;

		$items = array();
		foreach ( Instagram::media() as $post ) {
			$media = self::media( (array) $post );
			if ( ! $media ) {
				continue;
			}
			$timestamp = strtotime( (string) ( $post['timestamp'] ?? '' ) );
			$items[]   = array(
				'id'      => 'ig-' . sanitize_key( (string) ( $post['id'] ?? '' ) ),
				'ends_at' => $refresh,
				'fields'  => array(
					'media'    => $media,
					'caption'  => Helpers::truncate( trim( wp_strip_all_tags( (string) ( $post['caption'] ?? '' ) ) ), 600 ),
					'username' => $handle,
					'posted'   => $timestamp ? wp_date( 'M j, Y', $timestamp ) : '',
					'qr_code'  => esc_url_raw( (string) ( $post['permalink'] ?? '' ) ),
				),
			);
			if ( count( $items ) >= $max ) {
				break;
			}
		}
		return $items;
	}

	/**
	 * { kind: image|video, url, poster } for a post, or null if Instagram
	 * didn't give us anything we can show (e.g. a reel with licensed music
	 * and no thumbnail).
	 */
	public static function media( array $post ): ?array {
		if ( 'CAROUSEL_ALBUM' === ( $post['media_type'] ?? '' ) && ! empty( $post['children']['data'][0] ) ) {
			$post = (array) $post['children']['data'][0];
		}
		$type   = (string) ( $post['media_type'] ?? '' );
		$url    = esc_url_raw( (string) ( $post['media_url'] ?? '' ) );
		$poster = esc_url_raw( (string) ( $post['thumbnail_url'] ?? '' ) );

		if ( 'VIDEO' === $type ) {
			if ( '' !== $url ) {
				return array(
					'kind'   => 'video',
					'url'    => $url,
					'poster' => '' !== $poster ? $poster : null,
				);
			}
			// Some reels hide the video; fall back to the cover image.
			return '' !== $poster ? array(
				'kind'   => 'image',
				'url'    => $poster,
				'poster' => null,
			) : null;
		}
		return '' !== $url ? array(
			'kind'   => 'image',
			'url'    => $url,
			'poster' => null,
		) : null;
	}
}
