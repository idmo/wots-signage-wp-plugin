<?php
namespace WOTS\Signage\DataSources;

defined( 'ABSPATH' ) || exit;

/**
 * Small helpers shared by the data sources.
 */
final class Helpers {

	/** Palette entry for the Template Builder (PRD §7). */
	public static function element( string $key, string $label, string $type, string $hint = '' ): array {
		return array(
			'key'   => $key,
			'label' => $label,
			'type'  => $type, // image | text | html | qr.
			'hint'  => $hint,
		);
	}

	/** Every source offers the block's own name, e.g. as a heading. */
	public static function block_name_element(): array {
		return self::element( 'block_name', 'Block Name', 'text', 'The block\'s own name, the same on every item' );
	}

	/** WordPress text (titles, excerpts) arrives HTML-encoded. */
	public static function plain( string $text ): string {
		return trim( preg_replace( '/\s+/u', ' ', html_entity_decode( wp_strip_all_tags( $text ), ENT_QUOTES, 'UTF-8' ) ) );
	}

	/** Plain text cut at a word boundary, with an ellipsis. */
	public static function truncate( string $text, int $max ): string {
		if ( mb_strlen( $text ) <= $max ) {
			return $text;
		}
		$cut   = mb_substr( $text, 0, $max );
		$space = mb_strrpos( $cut, ' ' );
		return rtrim( $space > 0 ? mb_substr( $cut, 0, $space ) : $cut, ' ,.;:' ) . '…';
	}

	/** Post content as safe HTML for the screen. Block markup comments are dropped. */
	public static function html( string $content, bool $apply_the_content = false ): string {
		if ( $apply_the_content ) {
			$content = apply_filters( 'the_content', $content ); // phpcs:ignore WordPress.NamingConventions.PrefixAllGlobals.NonPrefixedHooknameFound -- core hook.
		} else {
			$content = wpautop( strip_shortcodes( do_blocks( $content ) ) );
		}
		$html = trim( wp_kses_post( $content ) );
		// Empty paragraphs left behind by the block editor.
		return trim( preg_replace( '#<p>(\s|&nbsp;)*</p>#i', '', $html ) );
	}

	/** A single meta value, unwrapping Pods-style arrays. */
	public static function meta( int $post_id, string $key ) {
		if ( '' === $key ) {
			return null;
		}
		$value = get_post_meta( $post_id, $key, true );
		if ( is_array( $value ) ) {
			$value = reset( $value );
			if ( is_array( $value ) ) { // Pods may store [ 'ID' => …, … ].
				$value = $value['ID'] ?? $value['id'] ?? reset( $value );
			}
		}
		return $value;
	}

	/** Pods checkbox values: "1"/"0", 1/0, true/false, "yes". */
	public static function truthy( $value ): bool {
		if ( is_bool( $value ) ) {
			return $value;
		}
		return in_array( strtolower( trim( (string) $value ) ), array( '1', 'yes', 'true', 'on' ), true );
	}

	/**
	 * Parse a Pods date or datetime field in the site timezone. A bare date
	 * is the start of that day; with $end_of_day, the end of it.
	 */
	public static function local_timestamp( $value, bool $end_of_day = false ): ?int {
		$value = trim( (string) $value );
		if ( '' === $value || str_starts_with( $value, '0000-00-00' ) ) {
			return null;
		}
		try {
			$date = new \DateTimeImmutable( $value, wp_timezone() );
		} catch ( \Exception $e ) {
			return null;
		}
		if ( $end_of_day && preg_match( '/^\d{4}-\d{2}-\d{2}$/', $value ) ) {
			$date = $date->setTime( 23, 59, 59 );
		}
		return $date->getTimestamp();
	}
}
