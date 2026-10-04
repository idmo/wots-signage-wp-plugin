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

	/**
	 * Fixed text typed into the template, e.g. "Scan for details". Its
	 * words live in the placement's options, not in the data.
	 */
	public static function text_element(): array {
		return self::element( 'free_text', 'Text', 'static', 'Your own words, the same on every item. Add as many as you like.' );
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

	/**
	 * Taxonomies registered on these post types that an editor would
	 * recognize (they have an admin screen), as slug => label.
	 *
	 * @param string[] $post_types Post types the items come from.
	 * @param string   $prefix     Label prefix, e.g. "Book: ".
	 */
	public static function taxonomies_for( array $post_types, string $prefix = '' ): array {
		$out = array();
		foreach ( $post_types as $post_type ) {
			if ( ! post_type_exists( $post_type ) ) {
				continue;
			}
			foreach ( get_object_taxonomies( $post_type, 'objects' ) as $tax ) {
				if ( ! $tax->show_ui || in_array( $tax->name, array( 'post_format', 'product_type', 'product_visibility', 'product_shipping_class' ), true ) ) {
					continue;
				}
				$out[ $tax->name ] = $prefix . $tax->labels->name;
			}
		}
		return $out;
	}

	/**
	 * The block's term filter limited to taxonomies the source allows, with
	 * empty selections dropped.
	 *
	 * @param mixed $filter  { taxonomy: [ term_id, … ] }.
	 * @param array $allowed Taxonomy slug => label.
	 * @return array<string, int[]>
	 */
	public static function term_filter( $filter, array $allowed ): array {
		$out = array();
		if ( ! is_array( $filter ) ) {
			return $out;
		}
		foreach ( $filter as $taxonomy => $ids ) {
			$ids = array_values( array_filter( array_map( 'intval', (array) $ids ) ) );
			if ( $ids && isset( $allowed[ $taxonomy ] ) && taxonomy_exists( (string) $taxonomy ) ) {
				$out[ (string) $taxonomy ] = $ids;
			}
		}
		return $out;
	}

	/**
	 * Does a post pass the filter? Taxonomies the post type doesn't use are
	 * checked against $other_id instead (e.g. a recommendation's book).
	 *
	 * @param array<string, int[]> $filter From term_filter().
	 */
	public static function matches_terms( int $post_id, array $filter, int $other_id = 0 ): bool {
		foreach ( $filter as $taxonomy => $ids ) {
			$target = is_object_in_taxonomy( (string) get_post_type( $post_id ), $taxonomy ) ? $post_id : $other_id;
			if ( ! $target || ! has_term( $ids, $taxonomy, $target ) ) {
				return false;
			}
		}
		return true;
	}

	/**
	 * Terms per taxonomy for the admin's filter picker.
	 *
	 * @param array $taxonomies Taxonomy slug => label.
	 */
	public static function describe_terms( array $taxonomies ): array {
		$out = array();
		foreach ( $taxonomies as $taxonomy => $label ) {
			$terms = get_terms(
				array(
					'taxonomy'   => $taxonomy,
					'hide_empty' => false,
					'number'     => 300,
				)
			);
			$out[] = array(
				'taxonomy' => $taxonomy,
				'label'    => $label,
				'terms'    => is_array( $terms ) ? array_map(
					static fn( \WP_Term $t ) => array(
						'id'    => $t->term_id,
						'name'  => html_entity_decode( $t->name, ENT_QUOTES, 'UTF-8' ),
						'count' => (int) $t->count,
					),
					$terms
				) : array(),
			);
		}
		return $out;
	}

	/**
	 * The block's hand-picked post IDs, in order.
	 *
	 * @return int[]
	 */
	public static function post_ids( array $block_config ): array {
		return array_values( array_unique( array_filter( array_map( 'intval', (array) ( $block_config['post_ids'] ?? array() ) ) ) ) );
	}

	/**
	 * A WP_Query tax_query for a term_filter(): any term within a taxonomy,
	 * every taxonomy.
	 *
	 * @param array<string, int[]> $filter From term_filter().
	 */
	public static function tax_query( array $filter ): array {
		$query = array( 'relation' => 'AND' );
		foreach ( $filter as $taxonomy => $ids ) {
			$query[] = array(
				'taxonomy' => $taxonomy,
				'field'    => 'term_id',
				'terms'    => $ids,
			);
		}
		return $query;
	}

	/**
	 * Titles for the editor's post picker: a search, or specific IDs.
	 *
	 * @param int[] $ids IDs to look up instead of searching.
	 */
	public static function search_posts( string $post_type, string $search, array $ids = array() ): array {
		if ( ! post_type_exists( $post_type ) ) {
			return array();
		}
		$args = array(
			'post_type'      => $post_type,
			'post_status'    => 'publish',
			'posts_per_page' => 20,
			'orderby'        => 'date',
			'order'          => 'DESC',
		);
		if ( $ids ) {
			$args['post__in']       = $ids;
			$args['orderby']        = 'post__in';
			$args['posts_per_page'] = count( $ids );
			$args['post_status']    = 'any';
		} elseif ( '' !== $search ) {
			if ( ctype_digit( $search ) ) {
				$args['p'] = (int) $search; // Typed an ID.
			} else {
				$args['s'] = $search;
			}
		}
		return array_map(
			static fn( \WP_Post $p ) => array(
				'id'     => $p->ID,
				'title'  => html_entity_decode( get_the_title( $p ), ENT_QUOTES, 'UTF-8' ),
				'date'   => get_the_date( 'M j, Y', $p ),
				'status' => $p->post_status,
			),
			get_posts( $args )
		);
	}
}
