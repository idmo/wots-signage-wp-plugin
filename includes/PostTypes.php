<?php
namespace WOTS\Signage;

defined( 'ABSPATH' ) || exit;

/**
 * Custom post types and taxonomy from PRD §10.
 * All are non-public and gated by the manage_signage capability.
 */
final class PostTypes {

	public const BLOCK    = 'signage_block';
	public const SEQUENCE = 'signage_sequence';
	public const TEMPLATE = 'signage_template';
	public const CATEGORY = 'signage_category';

	public static function register(): void {
		$caps = self::caps();

		$shared = array(
			'public'       => false,
			'show_ui'      => true,
			// The React admin (wp-admin → Signage) replaces the classic list screens.
			'show_in_menu' => false,
			'show_in_rest' => true,
			'capabilities' => $caps,
			'map_meta_cap' => false,
			'supports'     => array( 'title', 'custom-fields', 'revisions' ),
			'rewrite'      => false,
			'query_var'    => false,
		);

		register_post_type(
			self::BLOCK,
			$shared + array(
				'labels'     => self::labels( 'Block', 'Blocks' ),
				'taxonomies' => array( self::CATEGORY ),
			)
		);

		register_post_type( self::SEQUENCE, $shared + array( 'labels' => self::labels( 'Show', 'Shows' ) ) );
		register_post_type( self::TEMPLATE, $shared + array( 'labels' => self::labels( 'Template', 'Templates' ) ) );

		register_taxonomy(
			self::CATEGORY,
			self::BLOCK,
			array(
				'labels'            => self::labels( 'Category', 'Categories' ),
				'public'            => false,
				'show_ui'           => true,
				'show_in_rest'      => true,
				'show_admin_column' => true,
				'hierarchical'      => false,
				'rewrite'           => false,
				'capabilities'      => array(
					'manage_terms' => Plugin::CAPABILITY,
					'edit_terms'   => Plugin::CAPABILITY,
					'delete_terms' => Plugin::CAPABILITY,
					'assign_terms' => Plugin::CAPABILITY,
				),
			)
		);

		self::register_meta();
	}

	/**
	 * Block meta from PRD §10. Exposed to REST so the React admin can read/write it.
	 */
	private static function register_meta(): void {
		$enum = static fn( array $allowed, string $fallback ) => static fn( $v ) => in_array( $v, $allowed, true ) ? $v : $fallback;
		$int  = static fn( $v ) => max( 0, (int) $v );
		$hex  = static fn( $v ) => sanitize_hex_color( (string) $v ) ?? '';

		$block_meta = array(
			'_block_type'          => array( 'string', $enum( Blocks::TYPES, Resolver::TYPE_IMAGE ) ),
			'_start_date'          => array( 'string', array( Schedule::class, 'sanitize_date' ) ),
			'_end_date'            => array( 'string', array( Schedule::class, 'sanitize_date' ) ),
			'_duration_seconds'    => array( 'integer', $int ),
			'_fit_mode'            => array( 'string', $enum( Resolver::FIT_MODES, 'cover' ) ),
			'_archived'            => array( 'boolean', null ),
			'_image_id'            => array( 'integer', $int ),
			'_text_heavy'          => array( 'boolean', null ),
			'_video_id'            => array( 'integer', $int ),
			'_data_source'         => array( 'string', 'sanitize_key' ),
			'_template_id'         => array( 'integer', $int ),
			'_display_mode'        => array( 'string', $enum( array( 'carousel', 'list' ), 'carousel' ) ),
			'_per_item_duration'   => array( 'integer', $int ),
			'_max_items'           => array( 'integer', $int ),
			'_list_label'          => array( 'string', 'sanitize_text_field' ),
			'_featured_month_year' => array( 'string', 'sanitize_text_field' ),
			// Which events (see DataSources\Events) and which terms.
			'_event_range'         => array( 'string', $enum( DataSources\Events::RANGES, 'next' ), 'next' ),
			'_range_days'          => array( 'integer', $int ),
			'_range_start'         => array( 'string', array( Schedule::class, 'sanitize_date' ) ),
			'_range_end'           => array( 'string', array( Schedule::class, 'sanitize_date' ) ),
			'_term_filter'         => array( 'string', array( self::class, 'sanitize_term_filter' ) ), // JSON { taxonomy: [ids] }
			// Hand-picked posts of the source's type, in order: "12,7,40".
			'_post_ids'            => array( 'string', array( self::class, 'sanitize_post_ids' ) ),
			// Panel styling for dynamic blocks (ported from the Next.js build).
			'_bg_image_id'         => array( 'integer', $int ),
			'_panel_color'         => array( 'string', $hex, '#000000' ),
			'_panel_opacity'       => array( 'integer', static fn( $v ) => max( 0, min( 100, (int) $v ) ), 60 ),
			'_title_color'         => array( 'string', $hex, '#ffffff' ),
			'_body_color'          => array( 'string', $hex, '#ffffff' ),
			'_meta_color'          => array( 'string', $hex, '#ffffff' ),
			// '' = use the default from Settings.
			'_transition'          => array( 'string', $enum( array_merge( array( '' ), Settings::TRANSITIONS ), '' ) ),
			'_content_animation'   => array( 'string', $enum( array_merge( array( '' ), Settings::ANIMATIONS ), '' ) ),
		);
		foreach ( $block_meta as $key => $def ) {
			self::meta( self::BLOCK, $key, $def[0], $def[1], $def[2] ?? null );
		}

		self::meta( self::SEQUENCE, '_items', 'string' );     // JSON list of block_id + pinned.
		self::meta( self::SEQUENCE, '_autofill', 'string' );  // JSON (Phase 3)
		self::meta( self::TEMPLATE, '_data_source', 'string', 'sanitize_key' );
		self::meta( self::TEMPLATE, '_layout', 'string', $enum( array_keys( Templates::LAYOUTS ), 'stack' ) );
		self::meta( self::TEMPLATE, '_placements', 'string', array( Templates::class, 'sanitize_placements_json' ) ); // JSON
		self::meta( self::TEMPLATE, '_design', 'string', array( Templates::class, 'sanitize_design_json' ) ); // JSON

		foreach ( array(
			'_default_duration'    => array( 'integer', $int ),
			'_default_template_id' => array( 'integer', $int ),
			'_color'               => array( 'string', 'sanitize_hex_color' ),
		) as $key => list( $type, $sanitize ) ) {
			register_term_meta(
				self::CATEGORY,
				$key,
				array(
					'type'              => $type,
					'single'            => true,
					'show_in_rest'      => true,
					'sanitize_callback' => $sanitize,
					'auth_callback'     => static fn() => current_user_can( Plugin::CAPABILITY ),
				)
			);
		}
	}

	/**
	 * { taxonomy: [ term_id, … ] } as JSON, with empty lists dropped.
	 *
	 * @param mixed $value JSON string or array.
	 */
	public static function sanitize_term_filter( $value ): string {
		if ( is_string( $value ) ) {
			$value = json_decode( $value, true );
		}
		$out = array();
		foreach ( is_array( $value ) ? $value : array() as $taxonomy => $ids ) {
			$taxonomy = sanitize_key( (string) $taxonomy );
			$ids      = array_values( array_unique( array_filter( array_map( 'intval', (array) $ids ) ) ) );
			if ( '' !== $taxonomy && $ids ) {
				$out[ $taxonomy ] = $ids;
			}
		}
		return $out ? (string) wp_json_encode( $out ) : '';
	}

	/**
	 * "12, 7, 40" (or an array) → "12,7,40": positive IDs, once each, in order.
	 *
	 * @param mixed $value String or array of IDs.
	 */
	public static function sanitize_post_ids( $value ): string {
		$ids = is_array( $value ) ? $value : preg_split( '/[\s,]+/', (string) $value );
		return implode( ',', array_values( array_unique( array_filter( array_map( 'intval', (array) $ids ), static fn( $id ) => $id > 0 ) ) ) );
	}

	private static function meta( string $post_type, string $key, string $type, $sanitize = null, $default_value = null ): void {
		$args = array(
			'type'          => $type,
			'single'        => true,
			'show_in_rest'  => true,
			'auth_callback' => static fn() => current_user_can( Plugin::CAPABILITY ),
		);
		if ( $sanitize ) {
			$args['sanitize_callback'] = $sanitize;
		}
		if ( null !== $default_value ) {
			$args['default'] = $default_value;
		}
		register_post_meta( $post_type, $key, $args );
	}

	private static function caps(): array {
		$cap = Plugin::CAPABILITY;
		return array(
			'edit_post'              => $cap,
			'read_post'              => $cap,
			'delete_post'            => $cap,
			'edit_posts'             => $cap,
			'edit_others_posts'      => $cap,
			'edit_published_posts'   => $cap,
			'publish_posts'          => $cap,
			'read_private_posts'     => $cap,
			'delete_posts'           => $cap,
			'delete_others_posts'    => $cap,
			'delete_published_posts' => $cap,
			'create_posts'           => $cap,
		);
	}

	private static function labels( string $singular, string $plural ): array {
		return array(
			'name'          => $plural,
			'singular_name' => $singular,
			'add_new_item'  => "Add New {$singular}",
			'edit_item'     => "Edit {$singular}",
			'all_items'     => $plural,
			'menu_name'     => $plural,
			'not_found'     => 'No ' . strtolower( $plural ) . ' found.',
			'search_items'  => "Search {$plural}",
		);
	}
}
