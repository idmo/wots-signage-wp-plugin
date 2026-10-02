<?php
namespace WOTS\Signage;

defined( 'ABSPATH' ) || exit;

/**
 * Shelf-life scheduling (PRD §4). Status is computed at resolve time in the
 * site's timezone — no cron job sweeps anything.
 */
final class Schedule {

	public const ACTIVE    = 'active';
	public const SCHEDULED = 'scheduled'; // Start date is in the future.
	public const EXPIRED   = 'expired';
	public const ARCHIVED  = 'archived';

	/**
	 * Today's date (Y-m-d) in the site timezone.
	 */
	public static function today(): string {
		return wp_date( 'Y-m-d' );
	}

	/**
	 * Eligible when start <= today and (end empty or end >= today).
	 */
	public static function status( string $start, string $end, bool $archived = false, ?string $today = null ): string {
		if ( $archived ) {
			return self::ARCHIVED;
		}
		$today = $today ?? self::today();
		if ( '' !== $start && $start > $today ) {
			return self::SCHEDULED;
		}
		if ( '' !== $end && $end < $today ) {
			return self::EXPIRED;
		}
		return self::ACTIVE;
	}

	public static function block_status( int $block_id, ?string $today = null ): string {
		return self::status(
			(string) get_post_meta( $block_id, '_start_date', true ),
			(string) get_post_meta( $block_id, '_end_date', true ),
			(bool) get_post_meta( $block_id, '_archived', true ),
			$today
		);
	}

	/**
	 * Unix timestamp of the next site-local midnight — the next moment any
	 * date-based schedule can change.
	 */
	public static function next_midnight(): int {
		$tomorrow = new \DateTimeImmutable( 'tomorrow', wp_timezone() );
		return $tomorrow->getTimestamp();
	}

	/**
	 * Accept Y-m-d or empty; anything else becomes empty.
	 */
	public static function sanitize_date( $value ): string {
		$value = is_string( $value ) ? trim( $value ) : '';
		if ( '' === $value ) {
			return '';
		}
		$date = \DateTimeImmutable::createFromFormat( '!Y-m-d', $value );
		return ( $date && $date->format( 'Y-m-d' ) === $value ) ? $value : '';
	}
}
