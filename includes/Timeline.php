<?php
namespace WOTS\Signage;

defined( 'ABSPATH' ) || exit;

/**
 * What the TV plays: one ordered timeline that repeats. Each item is
 *
 *   { id, kind: show,  show_id,              periods: [ period ids ] }
 *   { id, kind: block, block_id,             periods }
 *   { id, kind: break, image_id, seconds, fit, periods }
 *
 * An item with periods only plays while one of them is on (Periods);
 * an item without periods always plays. A "break" is a still image shown
 * for a set time (artwork, a logo) without making a block for it.
 *
 * Installs from before 0.8 had a lineup of shows; the first read turns it
 * into timeline items.
 */
final class Timeline {

	public const OPTION = 'wots_signage_timeline';
	public const KINDS  = array( 'show', 'block', 'break' );

	/**
	 * @return array<int, array> Sanitized items, in play order.
	 */
	public static function items(): array {
		$saved = get_option( self::OPTION, null );
		if ( ! is_array( $saved ) ) {
			// First run after upgrading: the old lineup becomes the timeline.
			return array_map(
				static fn( int $show_id ) => array(
					'id'      => 'i' . $show_id,
					'kind'    => 'show',
					'show_id' => $show_id,
					'periods' => array(),
				),
				Sequences::legacy_lineup()
			);
		}
		return self::sanitize( $saved );
	}

	public static function save( array $items ): array {
		$clean = self::sanitize( $items );
		update_option( self::OPTION, $clean, false );
		return $clean;
	}

	public static function sanitize( array $items ): array {
		$periods = Periods::by_id();
		$out     = array();
		$ids     = array();
		foreach ( $items as $item ) {
			if ( ! is_array( $item ) || ! in_array( $item['kind'] ?? '', self::KINDS, true ) ) {
				continue;
			}
			$id = sanitize_key( (string) ( $item['id'] ?? '' ) );
			if ( '' === $id || isset( $ids[ $id ] ) ) {
				$id = 'i' . substr( md5( uniqid( '', true ) ), 0, 8 );
			}
			$ids[ $id ] = true;
			$clean      = array(
				'id'      => $id,
				'kind'    => $item['kind'],
				'periods' => array_values( array_filter( array_map( 'sanitize_key', (array) ( $item['periods'] ?? array() ) ), static fn( $p ) => isset( $periods[ $p ] ) ) ),
			);
			switch ( $item['kind'] ) {
				case 'show':
					$clean['show_id'] = (int) ( $item['show_id'] ?? 0 );
					if ( PostTypes::SEQUENCE !== get_post_type( $clean['show_id'] ) ) {
						continue 2;
					}
					break;
				case 'block':
					$clean['block_id'] = (int) ( $item['block_id'] ?? 0 );
					if ( PostTypes::BLOCK !== get_post_type( $clean['block_id'] ) ) {
						continue 2;
					}
					break;
				case 'break':
					$clean['image_id'] = (int) ( $item['image_id'] ?? 0 );
					$clean['seconds']  = max( 1, min( 3600, (int) ( $item['seconds'] ?? 15 ) ) );
					$clean['fit']      = in_array( $item['fit'] ?? '', Resolver::FIT_MODES, true ) ? $item['fit'] : 'contain-blur';
					$clean['label']    = mb_substr( sanitize_text_field( (string) ( $item['label'] ?? '' ) ), 0, 80 );
					break;
			}
			$out[] = $clean;
		}
		return $out;
	}

	/**
	 * Is the item playing now: no periods, or any of them on?
	 *
	 * @param array<string, array> $periods Periods::by_id().
	 */
	public static function item_active( array $item, array $periods, ?int $now = null ): bool {
		if ( ! $item['periods'] ) {
			return true;
		}
		foreach ( $item['periods'] as $pid ) {
			if ( isset( $periods[ $pid ] ) && Periods::active( $periods[ $pid ], $now ) ) {
				return true;
			}
		}
		return false;
	}

	/**
	 * The next time any period used by the timeline turns on or off, so the
	 * playlist is rebuilt then (Version's time boundaries).
	 */
	public static function next_change( ?int $now = null ): ?int {
		$periods = Periods::by_id();
		$used    = array();
		foreach ( self::items() as $item ) {
			foreach ( $item['periods'] as $pid ) {
				$used[ $pid ] = true;
			}
		}
		$next = null;
		foreach ( array_keys( $used ) as $pid ) {
			if ( isset( $periods[ $pid ] ) ) {
				$t = Periods::next_change( $periods[ $pid ], $now );
				if ( $t && ( null === $next || $t < $next ) ) {
					$next = $t;
				}
			}
		}
		return $next;
	}

	/**
	 * Shows on the timeline, in first-appearance order (whatever their
	 * periods). Used where the old "lineup" was.
	 *
	 * @return int[]
	 */
	public static function show_ids(): array {
		$ids = array();
		foreach ( self::items() as $item ) {
			if ( 'show' === $item['kind'] && ! in_array( $item['show_id'], $ids, true ) ) {
				$ids[] = $item['show_id'];
			}
		}
		return $ids;
	}

	/**
	 * Every block the timeline can play, directly or through a show.
	 *
	 * @return int[]
	 */
	public static function block_ids(): array {
		$ids = array();
		foreach ( self::items() as $item ) {
			if ( 'block' === $item['kind'] ) {
				$ids[] = $item['block_id'];
			} elseif ( 'show' === $item['kind'] ) {
				foreach ( Sequences::items( $item['show_id'] ) as $entry ) {
					$ids[] = (int) $entry['block_id'];
				}
			}
		}
		return array_values( array_unique( $ids ) );
	}

	/**
	 * Replace the timeline's shows with these (in order), keeping blocks and
	 * breaks where they were. For the old lineup API and "Play on the TV".
	 *
	 * @param int[] $show_ids Shows in order.
	 */
	public static function set_shows( array $show_ids ): array {
		$show_ids = array_values( array_unique( array_map( 'intval', $show_ids ) ) );
		$items    = self::items();
		$existing = array();
		foreach ( $items as $item ) {
			if ( 'show' === $item['kind'] ) {
				$existing[ $item['show_id'] ] = $item;
			}
		}
		$out   = array();
		$queue = $show_ids;
		foreach ( $items as $item ) {
			if ( 'show' !== $item['kind'] ) {
				$out[] = $item;
			} elseif ( $queue ) {
				$id    = array_shift( $queue );
				$out[] = $existing[ $id ] ?? array(
					'id'      => '',
					'kind'    => 'show',
					'show_id' => $id,
					'periods' => array(),
				);
			}
		}
		foreach ( $queue as $id ) {
			$out[] = $existing[ $id ] ?? array(
				'id'      => '',
				'kind'    => 'show',
				'show_id' => $id,
				'periods' => array(),
			);
		}
		return self::save( $out );
	}

	/**
	 * Drop items pointing at a deleted show or block.
	 */
	public static function forget( int $post_id ): void {
		$type = get_post_type( $post_id );
		if ( PostTypes::SEQUENCE !== $type && PostTypes::BLOCK !== $type ) {
			return;
		}
		$saved = get_option( self::OPTION, null );
		if ( ! is_array( $saved ) ) {
			return;
		}
		$key  = PostTypes::SEQUENCE === $type ? 'show_id' : 'block_id';
		$kept = array_values( array_filter( $saved, static fn( $i ) => (int) ( $i[ $key ] ?? 0 ) !== $post_id ) );
		if ( count( $kept ) !== count( $saved ) ) {
			update_option( self::OPTION, $kept, false );
		}
	}

	/**
	 * For the admin: items with a title, detail line, thumbnail, and
	 * whether each is playing right now.
	 */
	public static function describe(): array {
		$periods = Periods::by_id();
		$now     = time();
		$out     = array();
		foreach ( self::items() as $item ) {
			$d = $item + array(
				'title'  => '',
				'detail' => '',
				'thumb'  => null,
				'active' => self::item_active( $item, $periods, $now ),
			);
			switch ( $item['kind'] ) {
				case 'show':
					$d['title']  = html_entity_decode( get_the_title( $item['show_id'] ), ENT_QUOTES, 'UTF-8' );
					$count       = count( Sequences::items( $item['show_id'] ) );
					$d['detail'] = 'Show · ' . $count . ' block' . ( 1 === $count ? '' : 's' );
					break;
				case 'block':
					$post        = get_post( $item['block_id'] );
					$summary     = $post ? Blocks::summary( $post, Schedule::today() ) : null;
					$d['title']  = $summary ? $summary['title'] : '(deleted block)';
					$d['detail'] = $summary ? trim( 'Block · ' . ( $summary['detail'] ? $summary['detail'] : ucfirst( str_replace( array( 'static_', '_template' ), '', $summary['type'] ) ) ) ) : '';
					$d['thumb']  = $summary['thumbnail'] ?? null;
					break;
				case 'break':
					$src         = $item['image_id'] ? wp_get_attachment_image_src( $item['image_id'], 'medium' ) : false;
					$d['title']  = '' !== $item['label'] ? $item['label'] : 'Break';
					$d['detail'] = 'Still image · ' . $item['seconds'] . 's';
					$d['thumb']  = $src ? $src[0] : null;
					break;
			}
			$out[] = $d;
		}
		return $out;
	}
}
