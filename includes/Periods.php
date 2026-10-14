<?php
namespace WOTS\Signage;

defined( 'ABSPATH' ) || exit;

/**
 * Named time periods for the timeline ("Weekday mornings", "Fri 5–9pm"),
 * all in the site's timezone.
 *
 * A period is { id, name, days: [0–6, 0 = Sunday], start: "HH:MM",
 * end: "HH:MM", from: "Y-m-d", until: "Y-m-d" }.
 *  - Empty start and end = all day. An end earlier than the start runs
 *    past midnight (e.g. 22:00–02:00 belongs to the day it starts).
 *  - from / until (optional) limit it to a date range, inclusive.
 */
final class Periods {

	public const OPTION = 'wots_signage_periods';

	/**
	 * @return array<int, array> Sanitized periods.
	 */
	public static function all(): array {
		$saved = get_option( self::OPTION, array() );
		return is_array( $saved ) ? self::sanitize( $saved ) : array();
	}

	/**
	 * @param array $periods As sent by the editor.
	 * @return array What was saved.
	 */
	public static function save( array $periods ): array {
		$clean = self::sanitize( $periods );
		update_option( self::OPTION, $clean, false );
		return $clean;
	}

	public static function sanitize( array $periods ): array {
		$out = array();
		$ids = array();
		foreach ( $periods as $p ) {
			if ( ! is_array( $p ) ) {
				continue;
			}
			$id = sanitize_key( (string) ( $p['id'] ?? '' ) );
			if ( '' === $id || isset( $ids[ $id ] ) ) {
				$id = 'p' . substr( md5( uniqid( '', true ) ), 0, 8 );
			}
			$ids[ $id ] = true;
			$days       = array_values( array_unique( array_filter( array_map( 'intval', (array) ( $p['days'] ?? array() ) ), static fn( $d ) => $d >= 0 && $d <= 6 ) ) );
			sort( $days );
			$out[] = array(
				'id'    => $id,
				'name'  => mb_substr( sanitize_text_field( (string) ( $p['name'] ?? '' ) ), 0, 60 ) ?: 'Untitled period', // phpcs:ignore Universal.Operators.DisallowShortTernary.Found -- fallback name.
				'days'  => $days ? $days : array( 0, 1, 2, 3, 4, 5, 6 ),
				'start' => self::time( $p['start'] ?? '' ),
				'end'   => self::time( $p['end'] ?? '' ),
				'from'  => Schedule::sanitize_date( $p['from'] ?? '' ),
				'until' => Schedule::sanitize_date( $p['until'] ?? '' ),
			);
		}
		return $out;
	}

	/** "9:05" / "09:05" → "09:05"; anything else → "". */
	private static function time( $value ): string {
		return preg_match( '/^([01]?\d|2[0-3]):([0-5]\d)$/', trim( (string) $value ), $m ) ? sprintf( '%02d:%s', (int) $m[1], $m[2] ) : '';
	}

	/** @return array<string, array> Periods keyed by id. */
	public static function by_id(): array {
		$out = array();
		foreach ( self::all() as $p ) {
			$out[ $p['id'] ] = $p;
		}
		return $out;
	}

	/**
	 * The stretches of time a period covers that start on a given day, as
	 * [ start, end ) timestamps. Empty if it doesn't run that day.
	 *
	 * @return array{0: int, 1: int}|null
	 */
	private static function span_on( array $period, \DateTimeImmutable $day ): ?array {
		$date = $day->format( 'Y-m-d' );
		if ( ! in_array( (int) $day->format( 'w' ), $period['days'], true ) ) {
			return null;
		}
		if ( ( '' !== $period['from'] && $date < $period['from'] ) || ( '' !== $period['until'] && $date > $period['until'] ) ) {
			return null;
		}
		$midnight = $day->setTime( 0, 0 );
		if ( '' === $period['start'] && '' === $period['end'] ) {
			return array( $midnight->getTimestamp(), $midnight->modify( '+1 day' )->getTimestamp() );
		}
		list( $sh, $sm ) = array_map( 'intval', explode( ':', '' === $period['start'] ? '00:00' : $period['start'] ) );
		$start           = $midnight->setTime( $sh, $sm );
		if ( '' === $period['end'] ) {
			$end = $midnight->modify( '+1 day' );
		} else {
			list( $eh, $em ) = array_map( 'intval', explode( ':', $period['end'] ) );
			$end             = $midnight->setTime( $eh, $em );
			if ( $end <= $start ) {
				$end = $end->modify( '+1 day' ); // Runs past midnight.
			}
		}
		return array( $start->getTimestamp(), $end->getTimestamp() );
	}

	/**
	 * Is the period on at $now? Checks today's span and yesterday's (for
	 * spans that run past midnight).
	 */
	public static function active( array $period, ?int $now = null ): bool {
		$now   = $now ?? time();
		$today = ( new \DateTimeImmutable( '@' . $now ) )->setTimezone( wp_timezone() );
		foreach ( array( $today, $today->modify( '-1 day' ) ) as $day ) {
			$span = self::span_on( $period, $day );
			if ( $span && $now >= $span[0] && $now < $span[1] ) {
				return true;
			}
		}
		return false;
	}

	/**
	 * The next moment (after $now) the period turns on or off, looking a
	 * week and a bit ahead. Null if it never changes in that window.
	 */
	public static function next_change( array $period, ?int $now = null ): ?int {
		$now   = $now ?? time();
		$today = ( new \DateTimeImmutable( '@' . $now ) )->setTimezone( wp_timezone() );
		$next  = null;
		for ( $i = -1; $i <= 8; $i++ ) {
			$span = self::span_on( $period, $today->modify( "{$i} day" ) );
			if ( ! $span ) {
				continue;
			}
			foreach ( $span as $t ) {
				if ( $t > $now && ( null === $next || $t < $next ) ) {
					$next = $t;
				}
			}
		}
		return $next;
	}

	/**
	 * Week view data: for each day (0 = Sunday), the [ start, end ) minutes
	 * the period covers in a typical week, ignoring from/until.
	 *
	 * @return array<int, array<int, array{0: int, 1: int}>>
	 */
	public static function week_spans( array $period ): array {
		$out   = array_fill( 0, 7, array() );
		$start = '' === $period['start'] ? 0 : self::minutes( $period['start'] );
		$end   = '' === $period['end'] ? 1440 : self::minutes( $period['end'] );
		foreach ( $period['days'] as $day ) {
			if ( $end > $start ) {
				$out[ $day ][] = array( $start, $end );
			} else {
				$out[ $day ][]             = array( $start, 1440 );
				$out[ ( $day + 1 ) % 7 ][] = array( 0, $end );
			}
		}
		return $out;
	}

	private static function minutes( string $hhmm ): int {
		list( $h, $m ) = array_map( 'intval', explode( ':', $hhmm ) );
		return $h * 60 + $m;
	}
}
