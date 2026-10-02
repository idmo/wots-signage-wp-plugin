<?php
namespace WOTS\Signage\DataSources;

use WOTS\Signage\Media;

defined( 'ABSPATH' ) || exit;

/**
 * Upcoming events from The Events Calendar (PRD §6.1), queried directly with
 * tribe_get_events(). Events that have ended drop out on their own.
 */
final class Events implements Data_Source {

	public const DEFAULT_MAX = 5;

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

	public function items( array $block_config ): array {
		if ( ! $this->is_available() ) {
			return array();
		}

		$max = (int) ( $block_config['max_items'] ?? 0 );
		$max = $max > 0 ? min( $max, 50 ) : self::DEFAULT_MAX;

		$events = tribe_get_events(
			array(
				'posts_per_page' => $max,
				'post_status'    => 'publish',
				'ends_after'     => 'now', // Includes events in progress.
				'orderby'        => 'event_date',
				'order'          => 'ASC',
			)
		);

		$items = array();
		foreach ( (array) $events as $event ) {
			$event = get_post( $event );
			if ( ! $event ) {
				continue;
			}
			$items[] = $this->normalize( $event );
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
