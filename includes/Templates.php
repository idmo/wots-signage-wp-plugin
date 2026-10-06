<?php
namespace WOTS\Signage;

use WOTS\Signage\DataSources\Registry;

defined( 'ABSPATH' ) || exit;

/**
 * Template Builder storage and resolution (PRD §7).
 *
 * A template is a signage_template post:
 *   _data_source  events | community_board | featured_readers
 *   _layout       full | stack | split_left | split_right | custom
 *   _placements   JSON { region: [ { element, options }, … ] }
 *   _design       JSON { col, row, background, dim } — region sizes (percent
 *                 of the width/height given to the first column/row), an
 *                 image element shown full-screen behind the panel, and how
 *                 much to darken it; inset (panel padding, px), gap (space
 *                 between zones, px), fill (panel fills the screen); and for
 *                 the custom layout, rows: [ { h, cols: [ w, … ] }, … ] in
 *                 percent, with zones named r{row}c{col}.
 *
 * Layouts mirror lib/templates.ts from the Next.js build so its templates
 * can be imported unchanged. Keep src/shared/templates.ts in step.
 */
final class Templates {

	public const LAYOUTS = array(
		'full'        => array( 'main' ),
		// Rows of zones built in the editor; regions come from _design rows.
		'custom'      => array(),
		'stack'       => array( 'top', 'bl', 'br' ),
		'split_left'  => array( 'lt', 'lb', 'right' ),
		'split_right' => array( 'left', 'rt', 'rb' ),
	);

	/**
	 * Accepts either the PRD shape ({ region: [ { element, options } ] }) or
	 * the Next.js shape ({ region: [ "key" ] }) and returns the PRD shape.
	 */
	public static function normalize_placements( $placements ): array {
		if ( is_string( $placements ) ) {
			$placements = json_decode( $placements, true );
		}
		$out = array();
		if ( ! is_array( $placements ) ) {
			return $out;
		}
		foreach ( $placements as $region => $elements ) {
			$region = sanitize_key( (string) $region );
			if ( '' === $region || ! is_array( $elements ) ) {
				continue;
			}
			$out[ $region ] = array();
			foreach ( $elements as $element ) {
				$key = is_array( $element ) ? (string) ( $element['element'] ?? '' ) : (string) $element;
				$key = sanitize_key( $key );
				if ( '' === $key ) {
					continue;
				}
				$options          = is_array( $element ) && is_array( $element['options'] ?? null ) ? $element['options'] : array();
				$out[ $region ][] = array(
					'element' => $key,
					// An object even when empty, so JSON has {} not [].
					'options' => (object) self::sanitize_options( $options ),
				);
			}
		}
		return $out;
	}

	public static function sanitize_placements_json( $value ): string {
		return (string) wp_json_encode( self::normalize_placements( $value ) );
	}

	/**
	 * Per-element options. Only a small, known set is kept.
	 */
	private static function sanitize_options( array $options ): array {
		$clean = array();
		if ( isset( $options['size'] ) && in_array( $options['size'], array( 's', 'm', 'l', 'xl' ), true ) ) {
			$clean['size'] = $options['size'];
		}
		if ( isset( $options['fit'] ) && in_array( $options['fit'], array( 'cover', 'contain' ), true ) ) {
			$clean['fit'] = $options['fit'];
		}
		if ( isset( $options['align'] ) && in_array( $options['align'], array( 'left', 'center', 'right' ), true ) ) {
			$clean['align'] = $options['align'];
		}
		// The "Text" element: its words, and which text style it borrows.
		if ( isset( $options['text'] ) && is_string( $options['text'] ) ) {
			$clean['text'] = mb_substr( sanitize_textarea_field( $options['text'] ), 0, 300 );
		}
		if ( isset( $options['role'] ) && in_array( $options['role'], array( 'title', 'meta', 'body' ), true ) ) {
			$clean['role'] = $options['role'];
		}
		return $clean;
	}

	public const DESIGN_DEFAULTS = array(
		'col'        => 50,
		'row'        => 50,
		'background' => '',
		'dim'        => 30,
	);

	/**
	 * Region sizes and background, clamped to sensible values.
	 *
	 * @param mixed $design JSON string or array.
	 */
	public static function normalize_design( $design ): array {
		if ( is_string( $design ) ) {
			$design = json_decode( $design, true );
		}
		$design = is_array( $design ) ? $design : array();
		$clamp  = static fn( $v, int $lo, int $hi, int $fallback ) => is_numeric( $v ) ? max( $lo, min( $hi, (int) round( (float) $v ) ) ) : $fallback;
		return array(
			'col'        => $clamp( $design['col'] ?? null, 15, 85, 50 ),
			'row'        => $clamp( $design['row'] ?? null, 15, 85, 50 ),
			'background' => sanitize_key( (string) ( $design['background'] ?? '' ) ),
			'dim'        => $clamp( $design['dim'] ?? null, 0, 90, 30 ),
			'inset'      => $clamp( $design['inset'] ?? null, 0, 160, 48 ),
			'gap'        => $clamp( $design['gap'] ?? null, 0, 120, 32 ),
			'fill'       => ! empty( $design['fill'] ),
			'rows'       => self::normalize_rows( $design['rows'] ?? null ),
		);
	}

	public const MAX_ROWS = 4;
	public const MAX_COLS = 4;

	/**
	 * Custom-grid rows: 1–4 rows of 1–4 zones, sizes as whole percents
	 * that add up to 100 (each at least 5).
	 *
	 * @param mixed $rows [ { h, cols: [ w, … ] }, … ].
	 */
	public static function normalize_rows( $rows ): array {
		$rows = is_array( $rows ) ? array_slice( array_values( $rows ), 0, self::MAX_ROWS ) : array();
		$out  = array();
		foreach ( $rows as $row ) {
			$cols  = is_array( $row['cols'] ?? null ) ? array_slice( array_values( $row['cols'] ), 0, self::MAX_COLS ) : array( 100 );
			$out[] = array(
				'h'    => is_numeric( $row['h'] ?? null ) ? (float) $row['h'] : 0,
				'cols' => self::percents( $cols ? $cols : array( 100 ) ),
			);
		}
		if ( ! $out ) {
			return array();
		}
		$heights = self::percents( array_column( $out, 'h' ) );
		foreach ( $out as $i => $row ) {
			$out[ $i ]['h'] = $heights[ $i ];
		}
		return $out;
	}

	/**
	 * Scale numbers to whole percents summing to 100, none below 5.
	 * Missing or zero values share the space evenly.
	 *
	 * @param array $values Sizes.
	 * @return int[]
	 */
	private static function percents( array $values ): array {
		$values = array_map( static fn( $v ) => is_numeric( $v ) && $v > 0 ? (float) $v : 0.0, $values );
		$count  = count( $values );
		if ( 0 === $count ) {
			return array();
		}
		$total = array_sum( $values );
		if ( $total <= 0 ) {
			$values = array_fill( 0, $count, 1.0 );
			$total  = (float) $count;
		}
		$out = array_map( static fn( $v ) => max( 5, (int) round( $v / $total * 100 ) ), $values );
		// Put any rounding difference on the largest zone.
		$max         = array_keys( $out, max( $out ), true )[0];
		$out[ $max ] = max( 5, $out[ $max ] + 100 - array_sum( $out ) );
		return $out;
	}

	/**
	 * Zone names for a layout: the preset's, or r1c1… for a custom grid.
	 *
	 * @return string[]
	 */
	public static function regions_for( string $layout, array $design ): array {
		if ( 'custom' !== $layout ) {
			return self::LAYOUTS[ $layout ] ?? self::LAYOUTS['stack'];
		}
		$regions = array();
		foreach ( $design['rows'] ?? array() as $r => $row ) {
			foreach ( array_keys( $row['cols'] ) as $c ) {
				$regions[] = 'r' . ( $r + 1 ) . 'c' . ( $c + 1 );
			}
		}
		return $regions ? $regions : array( 'r1c1' );
	}

	// -----------------------------------------------------------------------
	// Saved grid layouts, reusable across templates.
	// -----------------------------------------------------------------------

	public const LAYOUTS_OPTION = 'wots_signage_layouts';

	/**
	 * @return array<int, array{id: string, name: string, rows: array}>
	 */
	public static function saved_layouts(): array {
		$saved = get_option( self::LAYOUTS_OPTION, array() );
		return is_array( $saved ) ? array_values( $saved ) : array();
	}

	/**
	 * Add or replace (same name) a saved layout.
	 */
	public static function save_layout( string $name, $rows ): array {
		$name = trim( sanitize_text_field( $name ) );
		$rows = self::normalize_rows( $rows );
		if ( '' === $name || ! $rows ) {
			return self::saved_layouts();
		}
		$layouts   = array_values( array_filter( self::saved_layouts(), static fn( $l ) => strtolower( $l['name'] ) !== strtolower( $name ) ) );
		$layouts[] = array(
			'id'   => substr( md5( $name . wp_rand() ), 0, 10 ),
			'name' => $name,
			'rows' => $rows,
		);
		update_option( self::LAYOUTS_OPTION, $layouts, false );
		return $layouts;
	}

	public static function delete_layout( string $id ): array {
		$layouts = array_values( array_filter( self::saved_layouts(), static fn( $l ) => $l['id'] !== $id ) );
		update_option( self::LAYOUTS_OPTION, $layouts, false );
		return $layouts;
	}

	public static function sanitize_design_json( $value ): string {
		return (string) wp_json_encode( self::normalize_design( $value ) );
	}

	/**
	 * A template ready for the player, or null if it's missing, not
	 * published, or built for a different data source.
	 */
	public static function resolve( int $template_id, string $source_key ): ?array {
		if ( $template_id <= 0 ) {
			return null;
		}
		$post = get_post( $template_id );
		if ( ! $post || PostTypes::TEMPLATE !== $post->post_type || 'publish' !== $post->post_status ) {
			return null;
		}
		if ( (string) get_post_meta( $template_id, '_data_source', true ) !== $source_key ) {
			return null;
		}
		$layout = (string) get_post_meta( $template_id, '_layout', true );
		if ( ! isset( self::LAYOUTS[ $layout ] ) ) {
			return null;
		}
		$placements = self::normalize_placements( (string) get_post_meta( $template_id, '_placements', true ) );
		$design     = self::normalize_design( (string) get_post_meta( $template_id, '_design', true ) );

		// Only the layout's own regions, in order.
		$regions = array();
		foreach ( self::regions_for( $layout, $design ) as $region ) {
			$regions[ $region ] = $placements[ $region ] ?? array();
		}
		return array(
			'id'      => $template_id,
			'layout'  => $layout,
			'regions' => $regions,
			'design'  => $design,
		);
	}

	/**
	 * The block's own template, else its category's default template for
	 * the same data source, else null (built-in layout).
	 */
	public static function for_block( int $block_id, string $source_key ): ?array {
		$template = self::resolve( (int) get_post_meta( $block_id, '_template_id', true ), $source_key );
		if ( $template ) {
			return $template;
		}
		$terms = get_the_terms( $block_id, PostTypes::CATEGORY );
		if ( is_array( $terms ) ) {
			foreach ( $terms as $term ) {
				$template = self::resolve( (int) get_term_meta( $term->term_id, '_default_template_id', true ), $source_key );
				if ( $template ) {
					return $template;
				}
			}
		}
		return null;
	}

	/**
	 * Admin listing: every template with its source label and usage count.
	 */
	public static function summaries(): array {
		$posts = get_posts(
			array(
				'post_type'      => PostTypes::TEMPLATE,
				'post_status'    => array( 'publish', 'draft' ),
				'posts_per_page' => 200, // phpcs:ignore WordPress.WP.PostsPerPage -- admin only.
				'orderby'        => 'title',
				'order'          => 'ASC',
			)
		);
		$out   = array();
		foreach ( $posts as $post ) {
			$source = (string) get_post_meta( $post->ID, '_data_source', true );
			$used   = get_posts(
				array(
					'post_type'      => PostTypes::BLOCK,
					'post_status'    => 'any',
					'posts_per_page' => -1, // phpcs:ignore WordPress.WP.PostsPerPage -- admin only.
					'fields'         => 'ids',
					'meta_key'       => '_template_id', // phpcs:ignore WordPress.DB.SlowDBQuery.slow_db_query_meta_key
					'meta_value'     => (string) $post->ID, // phpcs:ignore WordPress.DB.SlowDBQuery.slow_db_query_meta_value
				)
			);
			$out[]  = array(
				'id'           => $post->ID,
				'title'        => html_entity_decode( get_the_title( $post ), ENT_QUOTES, 'UTF-8' ),
				'data_source'  => $source,
				'source_label' => Registry::get( $source ) ? Registry::get( $source )->label() : $source,
				'layout'       => (string) get_post_meta( $post->ID, '_layout', true ),
				'placements'   => self::normalize_placements( (string) get_post_meta( $post->ID, '_placements', true ) ),
				'design'       => self::normalize_design( (string) get_post_meta( $post->ID, '_design', true ) ),
				'used_by'      => count( $used ),
				'modified'     => get_post_modified_time( DATE_ATOM, true, $post ),
			);
		}
		return $out;
	}
}
