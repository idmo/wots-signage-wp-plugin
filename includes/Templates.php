<?php
namespace WOTS\Signage;

use WOTS\Signage\DataSources\Registry;

defined( 'ABSPATH' ) || exit;

/**
 * Template Builder storage and resolution (PRD §7).
 *
 * A template is a signage_template post:
 *   _data_source  events | community_board | featured_readers
 *   _layout       full | stack | split_left | split_right
 *   _placements   JSON { region: [ { element, options }, … ] }
 *   _design       JSON { col, row, background, dim } — region sizes (percent
 *                 of the width/height given to the first column/row), an
 *                 image element shown full-screen behind the panel, and how
 *                 much to darken it.
 *
 * Layouts mirror lib/templates.ts from the Next.js build so its templates
 * can be imported unchanged. Keep src/shared/templates.ts in step.
 */
final class Templates {

	public const LAYOUTS = array(
		'full'        => array( 'main' ),
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
		);
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

		// Only the layout's own regions, in order.
		$regions = array();
		foreach ( self::LAYOUTS[ $layout ] as $region ) {
			$regions[ $region ] = $placements[ $region ] ?? array();
		}
		return array(
			'id'      => $template_id,
			'layout'  => $layout,
			'regions' => $regions,
			'design'  => self::normalize_design( (string) get_post_meta( $template_id, '_design', true ) ),
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
