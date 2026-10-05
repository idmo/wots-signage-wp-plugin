<?php
namespace WOTS\Signage\DataSources;

use WOTS\Signage\Media;

defined( 'ABSPATH' ) || exit;

/**
 * Upcoming events from The Events Calendar (PRD §6.1), queried directly with
 * tribe_get_events(). Events that have ended drop out on their own.
 *
 * A block picks which events with event_range:
 *   next   the next N events (max_items, default 5)
 *   days   everything in the next range_days days (default 30)
 *   month  everything left in this calendar month
 *   dates  everything between range_start and range_end (Y-m-d)
 * In the last three, max_items is an optional cap.
 */
final class Events implements Data_Source, Filterable, Pickable {

	public const DEFAULT_MAX = 5;
	public const RANGES      = array( 'next', 'days', 'month', 'dates' );

	/** Safety cap when a range has no "Show up to". */
	private const RANGE_CAP = 100;

	public function key(): string {
		return 'events';
	}

	public function label(): string {
		return 'Upcoming Events';
	}

	public function is_available(): bool {
		return function_exists( 'tribe_get_events' );
	}

	public function elements(): array {
		return array(
			Helpers::block_name_element(),
			Helpers::element( 'featured_image', 'Featured Image', 'image' ),
			Helpers::element( 'title', 'Title', 'text' ),
			Helpers::element( 'date_time', 'Date & Time', 'text', 'e.g. "Tomorrow · 6 – 8 PM"' ),
			Helpers::element( 'excerpt', 'Excerpt', 'text', 'Plain text, trimmed' ),
			Helpers::element( 'content_html', 'Description (HTML)', 'html', 'Full description, formatted' ),
			Helpers::element( 'qr_code', 'QR Code', 'qr', 'Links to the event\'s page' ),
		);
	}

	public function taxonomies(): array {
		return Helpers::taxonomies_for( array( 'tribe_events' ) );
	}

	public function pick_post_type(): string {
		return 'tribe_events';
	}

	public function pick_label(): string {
		return 'events';
	}

	/**
	 * The window a block asks for, in the site timezone. Null ends mean
	 * "no limit" (the next-N mode).
	 *
	 * @return array{0: ?\DateTimeImmutable, 1: ?\DateTimeImmutable}
	 */
	public static function window( array $block_config ): array {
		$tz    = wp_timezone();
		$today = new \DateTimeImmutable( 'today', $tz );
		switch ( (string) ( $block_config['event_range'] ?? 'next' ) ) {
			case 'days':
				$days = (int) ( $block_config['range_days'] ?? 0 );
				$days = $days > 0 ? min( $days, 366 ) : 30;
				// "Next 7 days" = today plus the six days after it.
				return array( null, $today->modify( '+' . ( $days - 1 ) . ' days' )->setTime( 23, 59, 59 ) );
			case 'month':
				return array( null, $today->modify( 'last day of this month' )->setTime( 23, 59, 59 ) );
			case 'dates':
				$start = \DateTimeImmutable::createFromFormat( '!Y-m-d', (string) ( $block_config['range_start'] ?? '' ), $tz );
				$end   = \DateTimeImmutable::createFromFormat( '!Y-m-d', (string) ( $block_config['range_end'] ?? '' ), $tz );
				return array( $start ? $start : null, $end ? $end->setTime( 23, 59, 59 ) : null );
		}
		return array( null, null );
	}

	public function items( array $block_config ): array {
		if ( ! $this->is_available() ) {
			return array();
		}

		$range = (string) ( $block_config['event_range'] ?? 'next' );
		$range = in_array( $range, self::RANGES, true ) ? $range : 'next';
		$max   = (int) ( $block_config['max_items'] ?? 0 );
		if ( 'next' === $range ) {
			$max = $max > 0 ? min( $max, 50 ) : self::DEFAULT_MAX;
		} else {
			$max = $max > 0 ? min( $max, self::RANGE_CAP ) : self::RANGE_CAP;
		}
		list( $from, $to ) = self::window( $block_config + array( 'event_range' => $range ) );
		$filter            = Helpers::term_filter( $block_config['terms'] ?? array(), $this->taxonomies() );

		$args = array(
			// Over-fetch when we filter in PHP below, so the cap still fills.
			'posts_per_page' => ( $filter || $from || $to || Helpers::excludes_any( $block_config ) ) ? 200 : $max,
			'post_status'    => 'publish',
			'ends_after'     => 'now', // Includes events in progress.
			'orderby'        => 'event_date',
			'order'          => 'ASC',
		);
		if ( $to ) {
			$args['starts_before'] = $to->format( 'Y-m-d H:i:s' );
		}

		// Hand-picked events: just those, soonest first. Ones that have
		// ended still drop out.
		$ids = Helpers::post_ids( $block_config );
		if ( $ids ) {
			$events = array_filter(
				array_map( 'get_post', $ids ),
				static fn( $p ) => $p instanceof \WP_Post && 'tribe_events' === $p->post_type && 'publish' === $p->post_status
			);
			usort(
				$events,
				static fn( $a, $b ) => strcmp( (string) get_post_meta( $a->ID, '_EventStartDate', true ), (string) get_post_meta( $b->ID, '_EventStartDate', true ) )
			);
			// Picking replaces "Which events": no window, no default cap.
			$from = new \DateTimeImmutable( 'now', wp_timezone() );
			$to   = null;
			$max  = (int) ( $block_config['max_items'] ?? 0 ) > 0 ? $max : count( $events );
		} else {
			$events = (array) tribe_get_events( $args );
		}

		$items = array();
		foreach ( $events as $event ) {
			$event = get_post( $event );
			if ( ! $event ) {
				continue;
			}
			// Checked here as well as in the query, so the result doesn't
			// depend on which arguments this TEC version understands.
			$start = $this->local_datetime( $event->ID, 'start' );
			$end   = $this->local_datetime( $event->ID, 'end' ) ?? $start;
			if ( $start && $to && $start > $to ) {
				continue;
			}
			if ( $from && $end && $end < $from ) {
				continue;
			}
			if ( $filter && ! Helpers::matches_terms( $event->ID, $filter ) ) {
				continue;
			}
			if ( Helpers::excluded( $event->ID, $block_config, $this->taxonomies() ) ) {
				continue;
			}
			$items[] = $this->normalize( $event );
			if ( count( $items ) >= $max ) {
				break;
			}
		}
		return $items;
	}

	private function normalize( \WP_Post $event ): array {
		$tz      = wp_timezone();
		$all_day = $this->is_all_day( $event->ID );
		$start   = $this->local_datetime( $event->ID, 'start' );
		$end     = $this->local_datetime( $event->ID, 'end' ) ?? $start;

		$ends_at = null;
		if ( $end ) {
			// All-day events run through the end of their last day.
			$ends_at = $all_day ? $end->setTime( 23, 59, 59 )->getTimestamp() + 1 : $end->getTimestamp();
		}

		$content = (string) $event->post_content;
		// Most events have no manual excerpt, so fall back to the description.
		$excerpt = has_excerpt( $event ) ? (string) $event->post_excerpt : $content;

		return array(
			'id'      => 'event-' . $event->ID,
			'ends_at' => $ends_at,
			'fields'  => array(
				'featured_image' => Media::image( (int) get_post_thumbnail_id( $event ), 'full' ),
				'title'          => Helpers::plain( get_the_title( $event ) ),
				'date_time'      => $start ? self::format_range( $start, $end ?? $start, $all_day, $tz ) : '',
				'excerpt'        => Helpers::truncate( Helpers::plain( strip_shortcodes( $excerpt ) ), 280 ),
				'content_html'   => Helpers::html( $content ),
				'qr_code'        => (string) get_permalink( $event ),
				// Not template elements; used by the built-in layouts.
				'start'          => $start ? $start->format( DATE_ATOM ) : null,
				'end'            => $end ? $end->format( DATE_ATOM ) : null,
				'all_day'        => $all_day,
			),
		);
	}

	private function is_all_day( int $id ): bool {
		if ( function_exists( 'tribe_event_is_all_day' ) ) {
			return (bool) tribe_event_is_all_day( $id );
		}
		return 'yes' === strtolower( (string) get_post_meta( $id, '_EventAllDay', true ) );
	}

	/**
	 * TEC stores _EventStartDate / _EventEndDate in the event's local time.
	 */
	private function local_datetime( int $id, string $which ): ?\DateTimeImmutable {
		$value = (string) get_post_meta( $id, 'start' === $which ? '_EventStartDate' : '_EventEndDate', true );
		if ( '' === $value ) {
			return null;
		}
		try {
			return new \DateTimeImmutable( $value, wp_timezone() );
		} catch ( \Exception $e ) {
			return null;
		}
	}

	/**
	 * Human date line for a 10-foot screen, e.g.
	 *   "Today · 7:00 PM"
	 *   "Fri, Oct 10 · 7:00 – 9:30 PM"
	 *   "Sat, Oct 11 – Sun, Oct 12"
	 */
	public static function format_range( \DateTimeImmutable $start, \DateTimeImmutable $end, bool $all_day, \DateTimeZone $tz ): string {
		$day  = static function ( \DateTimeImmutable $d ) use ( $tz ): string {
			$today = new \DateTimeImmutable( 'today', $tz );
			$diff  = (int) $today->diff( $d->setTime( 0, 0 ) )->format( '%r%a' );
			if ( 0 === $diff ) {
				return 'Today';
			}
			if ( 1 === $diff ) {
				return 'Tomorrow';
			}
			return $d->format( 'D, M j' );
		};
		$time = static function ( \DateTimeImmutable $d, bool $with_meridiem = true ): string {
			$format = '00' === $d->format( 'i' ) ? 'g' : 'g:i';
			return $d->format( $format ) . ( $with_meridiem ? ' ' . $d->format( 'A' ) : '' );
		};

		$same_day = $start->format( 'Y-m-d' ) === $end->format( 'Y-m-d' );

		if ( $all_day ) {
			return $same_day ? $day( $start ) : $day( $start ) . ' – ' . $day( $end );
		}
		if ( ! $same_day ) {
			return $day( $start ) . ' · ' . $time( $start ) . ' – ' . $day( $end );
		}
		if ( $start == $end ) { // phpcs:ignore Universal.Operators.StrictComparisons -- DateTime value comparison.
			return $day( $start ) . ' · ' . $time( $start );
		}
		$same_meridiem = $start->format( 'A' ) === $end->format( 'A' );
		return $day( $start ) . ' · ' . $time( $start, ! $same_meridiem ) . ' – ' . $time( $end );
	}
}
