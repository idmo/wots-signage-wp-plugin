<?php
namespace WOTS\Signage\DataSources;

use WOTS\Signage\Instagram;

defined( 'ABSPATH' ) || exit;

/**
 * The connected account's follower count, as one slide. On screen, the
 * player re-checks the count every few seconds and counts up to the new
 * number, so someone who follows from the shop sees it change.
 */
final class Instagram_Followers implements Data_Source {

	public function key(): string {
		return 'instagram_followers';
	}

	public function label(): string {
		return 'Instagram Followers';
	}

	public function is_available(): bool {
		return Instagram::connected();
	}

	/** Always one item; the editor hides "Show up to" and List. */
	public function single(): bool {
		return true;
	}

	public function elements(): array {
		return array(
			Helpers::block_name_element(),
			Helpers::element( 'followers', 'Follower count', 'followers', 'Counts up live while on screen' ),
			Helpers::element( 'username', 'Username', 'text', '@yourshop' ),
			Helpers::element( 'profile_photo', 'Profile photo', 'image' ),
			Helpers::element( 'qr_code', 'QR Code', 'qr', 'Links to your profile' ),
		);
	}

	public function items( array $block_config ): array {
		$profile = $this->is_available() ? Instagram::profile() : null;
		if ( ! $profile || ! isset( $profile['followers_count'] ) ) {
			return array();
		}
		$username = (string) ( $profile['username'] ?? '' );
		$photo    = esc_url_raw( (string) ( $profile['profile_picture_url'] ?? '' ) );
		return array(
			array(
				'id'      => 'ig-followers',
				// The profile photo link expires too.
				'ends_at' => time() + Instagram::MEDIA_TTL,
				'fields'  => array(
					'followers'     => (int) $profile['followers_count'],
					'username'      => '' !== $username ? '@' . $username : '',
					'profile_photo' => '' !== $photo ? array(
						'id'     => 0,
						'url'    => $photo,
						'width'  => 320,
						'height' => 320,
						'alt'    => '',
					) : null,
					'qr_code'       => '' !== $username ? 'https://www.instagram.com/' . rawurlencode( $username ) . '/' : '',
				),
			),
		);
	}
}
