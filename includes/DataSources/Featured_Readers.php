<?php
namespace WOTS\Signage\DataSources;

use WOTS\Signage\Media;

defined( 'ABSPATH' ) || exit;

/**
 * Featured Readers (PRD §6.3), ported from docs/featured-readers-endpoint.php
 * in the Next.js repo:
 *
 *   reader (Pods) <- "reader" relationship - recommendation (Pods) - "book" relationship -> WooCommerce product
 *
 * A reader is featured for the month in their free-text featured_month_year
 * field ("September 2025", "Sept 2025", "9/2025", …). Every published
 * recommendation of a featured reader is included, grouped so a reader's
 * recommendations play back to back. Book title, cover, and link come live
 * from the WooCommerce product.
 */
final class Featured_Readers implements Data_Source, Filterable, Pickable {

	public const DEFAULT_MAX = 20;

	public static function fields(): array {
		/**
		 * Filter the Featured Readers post type and field slugs.
		 *
		 * @param array $fields Slugs keyed by role.
		 */
		return (array) apply_filters(
			'wots_signage_featured_readers_fields',
			array(
				'reader_post_type'         => 'reader',
				'recommendation_post_type' => 'recommendation',
				'featured_month_year'      => 'featured_month_year',
				'rec_reader'               => 'reader',
				'rec_book'                 => 'book',
				// The live site uses book_author; the old mu-plugin read "author".
				'rec_author'               => array( 'book_author', 'author' ),
			)
		);
	}

	public function key(): string {
		return 'featured_readers';
	}

	public function label(): string {
		return 'Featured Readers';
	}

	public function is_available(): bool {
		$f = self::fields();
		return post_type_exists( (string) $f['reader_post_type'] )
			&& post_type_exists( (string) $f['recommendation_post_type'] )
			&& function_exists( 'wc_get_product' );
	}

	public function elements(): array {
		return array(
			Helpers::block_name_element(),
			Helpers::element( 'book_cover', 'Book Cover', 'image' ),
			Helpers::element( 'book_title', 'Book Title', 'text' ),
			Helpers::element( 'book_author', 'Author', 'text' ),
			Helpers::element( 'reader_name', 'Reader Name', 'text', 'Who\'s recommending it' ),
			Helpers::element( 'reader_photo', 'Reader Photo', 'image' ),
			Helpers::element( 'blurb_html', 'Blurb (HTML)', 'html', 'The reader\'s write-up, formatted' ),
			Helpers::element( 'qr_code', 'QR Code', 'qr', 'Links to the book\'s store page' ),
		);
	}

	/**
	 * The recommendation's own taxonomies, plus the book's (WooCommerce
	 * product categories and tags).
	 */
	public function taxonomies(): array {
		$f    = self::fields();
		$book = Helpers::taxonomies_for( array( 'product' ), 'Book: ' );
		foreach ( array(
			'product_cat' => 'Book categories',
			'product_tag' => 'Book tags',
		) as $taxonomy => $label ) {
			if ( isset( $book[ $taxonomy ] ) ) {
				$book[ $taxonomy ] = $label;
			}
		}
		return Helpers::taxonomies_for( array( (string) $f['recommendation_post_type'] ) ) + $book;
	}

	/** Picking readers features them whatever their month. */
	public function pick_post_type(): string {
		return (string) self::fields()['reader_post_type'];
	}

	public function pick_label(): string {
		return 'readers';
	}

	/**
	 * Target month as "Y-m": the block's pinned "Month & Year", or the
	 * current month in the site timezone. Null if the pin can't be parsed.
	 */
	public static function target_month( string $pinned ): ?string {
		$pinned = trim( $pinned );
		return '' === $pinned || 'current' === strtolower( $pinned ) ? current_time( 'Y-m' ) : self::parse_month_year( $pinned );
	}

	/**
	 * Loosely parse "September 2025", "Sept 2025", "9/2025", or "2025-09"
	 * into "Y-m". Ported from signage_parse_month_year(), namespaced so it
	 * can't collide with the mu-plugin while both are active (PRD §15).
	 */
	public static function parse_month_year( $text ): ?string {
		$text = trim( (string) $text );
		if ( '' === $text ) {
			return null;
		}
		foreach ( array( 'F Y', 'M Y', 'n/Y', 'Y-m', 'Y-n' ) as $format ) {
			$date   = \DateTime::createFromFormat( '!' . $format, $text );
			$errors = \DateTime::getLastErrors();
			if ( false !== $date && ( false === $errors || 0 === $errors['warning_count'] ) ) {
				return $date->format( 'Y-m' );
			}
		}
		// "Sept 2025" and friends: let strtotime try, with a day in front.
		$ts = strtotime( '1 ' . $text );
		if ( false === $ts ) {
			$ts = strtotime( $text );
		}
		return false === $ts ? null : gmdate( 'Y-m', $ts );
	}

	public function items( array $block_config ): array {
		if ( ! $this->is_available() ) {
			return array();
		}
		$readers = Helpers::post_ids( $block_config );
		$target  = $readers ? '' : self::target_month( (string) ( $block_config['featured_month_year'] ?? '' ) );
		if ( ! $readers && ! $target ) {
			return array();
		}

		$entries = $this->entries( (string) $target, Helpers::term_filter( $block_config['terms'] ?? array(), $this->taxonomies() ), $readers );
		if ( Helpers::excludes_any( $block_config ) ) {
			$taxonomies = $this->taxonomies();
			$entries    = array_values(
				array_filter(
					$entries,
					static function ( $entry ) use ( $block_config, $taxonomies ) {
						// Leaving out a reader drops all their books.
						if ( in_array( (int) $entry['fields']['reader_id'], Helpers::exclude_ids( $block_config ), true ) ) {
							return false;
						}
						$config = array( 'exclude_terms' => $block_config['exclude_terms'] ?? array() );
						return ! Helpers::excluded( (int) $entry['rec_id'], $config, $taxonomies, (int) $entry['book_id'] );
					}
				)
			);
		}
		$entries = self::group_by_reader( $entries );
		if ( $readers ) {
			// Picked readers play in the order they were picked.
			$rank = array_flip( $readers );
			usort( $entries, static fn( $a, $b ) => ( $rank[ (int) $a['fields']['reader_id'] ] ?? 0 ) <=> ( $rank[ (int) $b['fields']['reader_id'] ] ?? 0 ) );
		}

		$max = (int) ( $block_config['max_items'] ?? 0 );
		$max = $max > 0 ? min( $max, 100 ) : self::DEFAULT_MAX;
		return array_slice( $entries, 0, $max );
	}

	/**
	 * Recommendations of every reader featured for $target, in the same
	 * order the mu-plugin returned them.
	 */
	/**
	 * @param int[] $reader_ids Hand-picked readers; when given, the month is ignored.
	 */
	private function entries( string $target, array $filter = array(), array $reader_ids = array() ): array {
		$f = self::fields();

		$readers = array();
		$query   = array(
			'post_type'      => $f['reader_post_type'],
			'post_status'    => 'publish',
			'posts_per_page' => -1, // phpcs:ignore WordPress.WP.PostsPerPage -- small set of readers.
		);
		if ( $reader_ids ) {
			$query['post__in'] = $reader_ids;
			$query['orderby']  = 'post__in';
		}
		foreach ( get_posts( $query ) as $reader ) {
			if ( ! $reader_ids && self::parse_month_year( Helpers::meta( $reader->ID, $f['featured_month_year'] ) ) !== $target ) {
				continue;
			}
			$readers[ $reader->ID ] = array(
				'id'    => $reader->ID,
				'name'  => Helpers::plain( get_the_title( $reader ) ),
				'photo' => Media::image( (int) get_post_thumbnail_id( $reader ), 'large' ),
			);
		}
		if ( ! $readers ) {
			return array();
		}

		$recommendations = get_posts(
			array(
				'post_type'      => $f['recommendation_post_type'],
				'post_status'    => 'publish',
				'posts_per_page' => -1, // phpcs:ignore WordPress.WP.PostsPerPage -- small set of recommendations.
			)
		);

		$out = array();
		foreach ( $recommendations as $rec ) {
			$reader_id = (int) Helpers::meta( $rec->ID, $f['rec_reader'] );
			if ( ! isset( $readers[ $reader_id ] ) ) {
				continue;
			}
			$book_id = (int) Helpers::meta( $rec->ID, $f['rec_book'] );
			$product = $book_id ? wc_get_product( $book_id ) : null;
			if ( ! $product ) {
				continue; // Incomplete, or the product is gone: skip, don't fail.
			}
			if ( $filter && ! Helpers::matches_terms( $rec->ID, $filter, $book_id ) ) {
				continue;
			}

			$reader = $readers[ $reader_id ];
			$out[]  = array(
				'id'      => 'rec-' . $rec->ID,
				// For filtering; not sent to the player.
				'rec_id'  => $rec->ID,
				'book_id' => $book_id,
				'ends_at' => null,
				'fields'  => array(
					'book_cover'   => Media::image( (int) $product->get_image_id(), 'full' ),
					'book_title'   => Helpers::plain( $product->get_name() ),
					'book_author'  => $this->author( $rec->ID ),
					'reader_name'  => $reader['name'],
					'reader_photo' => $reader['photo'],
					'blurb_html'   => Helpers::html( (string) $rec->post_content, true ),
					'qr_code'      => (string) $product->get_permalink(),
					// Not a template element; groups a reader's books together.
					'reader_id'    => $reader_id,
				),
			);
		}
		return $out;
	}

	private function author( int $rec_id ): string {
		foreach ( (array) self::fields()['rec_author'] as $key ) {
			$value = Helpers::plain( (string) Helpers::meta( $rec_id, (string) $key ) );
			if ( '' !== $value ) {
				return $value;
			}
		}
		return '';
	}

	/**
	 * Every recommendation from the same reader becomes consecutive,
	 * preserving first-seen reader order and each reader's own order.
	 * Ported from groupEntriesByReader(); applied before max_items so a
	 * reader's books aren't split by the cutoff.
	 */
	public static function group_by_reader( array $entries ): array {
		$order = array();
		$by    = array();
		foreach ( $entries as $entry ) {
			$reader_id = (int) ( $entry['fields']['reader_id'] ?? 0 );
			if ( ! isset( $by[ $reader_id ] ) ) {
				$by[ $reader_id ] = array();
				$order[]          = $reader_id;
			}
			$by[ $reader_id ][] = $entry;
		}
		$out = array();
		foreach ( $order as $reader_id ) {
			array_push( $out, ...$by[ $reader_id ] );
		}
		return $out;
	}

	/**
	 * Is $product_id the book of any recommendation? Used to invalidate the
	 * playlist when a referenced product changes (PRD §8.3).
	 */
	public static function references_product( int $product_id ): bool {
		$f = self::fields();
		if ( ! post_type_exists( (string) $f['recommendation_post_type'] ) ) {
			return false;
		}
		$found = get_posts(
			array(
				'post_type'      => $f['recommendation_post_type'],
				'post_status'    => 'any',
				'posts_per_page' => 1,
				'fields'         => 'ids',
				'meta_query'     => array( // phpcs:ignore WordPress.DB.SlowDBQuery.slow_db_query_meta_query -- only on product saves.
					array(
						'key'   => $f['rec_book'],
						'value' => (string) $product_id,
					),
				),
			)
		);
		return ! empty( $found );
	}
}
