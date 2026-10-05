<?php
namespace WOTS\Signage;

defined( 'ABSPATH' ) || exit;

/**
 * Show and full backups as a zip: manifest.json plus the media files
 * (PRD §14).
 *
 * Import runs in two steps. analyze() unpacks nothing; it reads the
 * manifest, matches media by SHA-1 against the library, and reports
 * name conflicts. commit() applies the person's choice for each conflict:
 * skip (use what's there), overwrite, or import as a copy. The default is
 * to merge: existing items are kept and new ones added.
 */
final class Import_Export {

	public const FORMAT     = 'wots-signage';
	public const VERSION    = 1;
	private const HASH_META = '_wots_sha1';

	/** Block meta holding attachment IDs / template IDs. */
	private const MEDIA_META    = array( '_image_id', '_video_id', '_bg_image_id' );
	private const TEMPLATE_META = '_template_id';

	/** Block meta copied as-is. */
	private const BLOCK_META = array(
		'_block_type',
		'_start_date',
		'_end_date',
		'_duration_seconds',
		'_fit_mode',
		'_archived',
		'_text_heavy',
		'_data_source',
		'_display_mode',
		'_per_item_duration',
		'_max_items',
		'_list_label',
		'_featured_month_year',
		'_panel_color',
		'_panel_opacity',
		'_title_color',
		'_body_color',
		'_meta_color',
		'_transition',
		'_content_animation',
		'_shuffle',
		'_event_range',
		'_range_days',
		'_range_start',
		'_range_end',
	);

	/** Holds term IDs, so it travels as slugs (see term_filter_*()). */
	private const TERM_FILTER_META = '_term_filter';

	// -----------------------------------------------------------------------
	// Export
	// -----------------------------------------------------------------------

	public static function register(): void {
		add_action( 'admin_post_wots_signage_export', array( self::class, 'download' ) );
	}

	/**
	 * admin-post.php?action=wots_signage_export&sequence=ID (or &full=1)
	 */
	public static function download(): void {
		if ( ! current_user_can( Plugin::CAPABILITY ) ) {
			wp_die( 'Not allowed.', 403 );
		}
		check_admin_referer( 'wots_signage_export' );
		if ( ! class_exists( '\ZipArchive' ) ) {
			wp_die( 'This server is missing PHP’s Zip extension, which export needs.' );
		}

		// phpcs:disable WordPress.Security.NonceVerification.Recommended -- checked above.
		$full     = ! empty( $_GET['full'] );
		$sequence = isset( $_GET['sequence'] ) ? absint( $_GET['sequence'] ) : 0;
		// phpcs:enable

		$manifest = $full ? self::build_manifest( null ) : self::build_manifest( array( $sequence ) );
		if ( ! $full && empty( $manifest['sequences'] ) ) {
			wp_die( 'Show not found.' );
		}

		$name = $full
			? 'signage-backup-' . wp_date( 'Y-m-d' )
			: 'signage-show-' . sanitize_title( $manifest['sequences'][0]['title'] ) . '-' . wp_date( 'Y-m-d' );
		$path = wp_tempnam( $name . '.zip' );

		$zip = new \ZipArchive();
		if ( true !== $zip->open( $path, \ZipArchive::OVERWRITE ) ) {
			wp_die( 'Could not create the export file.' );
		}
		foreach ( $manifest['media'] as $media ) {
			$zip->addFile( $media['_source'], $media['file'] );
		}
		$manifest['media'] = array_map(
			static function ( $m ) {
				unset( $m['_source'] );
				return $m;
			},
			$manifest['media']
		);
		$zip->addFromString( 'manifest.json', (string) wp_json_encode( $manifest, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE ) );
		$zip->close();

		nocache_headers();
		header( 'Content-Type: application/zip' );
		header( 'Content-Disposition: attachment; filename="' . $name . '.zip"' );
		header( 'Content-Length: ' . filesize( $path ) );
		readfile( $path ); // phpcs:ignore WordPress.WP.AlternativeFunctions.file_system_operations_readfile -- temp export file.
		wp_delete_file( $path );
		exit;
	}

	/**
	 * @param int[]|null $sequence_ids Shows to include, or null for everything.
	 */
	public static function build_manifest( ?array $sequence_ids ): array {
		$full = null === $sequence_ids;

		$sequences = get_posts(
			array(
				'post_type'      => PostTypes::SEQUENCE,
				'post_status'    => 'publish',
				'posts_per_page' => -1, // phpcs:ignore WordPress.WP.PostsPerPage -- export.
				'post__in'       => $full ? array() : ( $sequence_ids ? $sequence_ids : array( 0 ) ),
				'orderby'        => 'ID',
				'order'          => 'ASC',
			)
		);

		// Which blocks: every block (full) or those in the chosen shows.
		$block_ids = array();
		foreach ( $sequences as $seq ) {
			foreach ( Sequences::items( $seq->ID ) as $item ) {
				$block_ids[ $item['block_id'] ] = true;
			}
		}
		if ( $full ) {
			foreach (
				get_posts(
					array(
						'post_type'      => PostTypes::BLOCK,
						'post_status'    => array( 'publish', 'draft', 'private' ),
						'posts_per_page' => -1, // phpcs:ignore WordPress.WP.PostsPerPage -- export.
						'fields'         => 'ids',
					)
				) as $id
			) {
				$block_ids[ $id ] = true;
			}
		}

		$media        = array();
		$templates    = array();
		$categories   = array();
		$blocks       = array();
		$add_media    = static function ( int $id ) use ( &$media ): ?string {
			if ( $id <= 0 ) {
				return null;
			}
			$ref = 'm' . $id;
			if ( ! isset( $media[ $ref ] ) ) {
				$file = get_attached_file( $id );
				if ( ! $file || ! is_readable( $file ) ) {
					return null;
				}
				$media[ $ref ] = array(
					'ref'      => $ref,
					'file'     => 'media/' . $ref . '-' . wp_basename( $file ),
					'filename' => wp_basename( $file ),
					'mime'     => (string) get_post_mime_type( $id ),
					'sha1'     => self::attachment_hash( $id ),
					'title'    => get_the_title( $id ),
					'alt'      => (string) get_post_meta( $id, '_wp_attachment_image_alt', true ),
					'_source'  => $file,
				);
			}
			return $ref;
		};
		$add_template = static function ( int $id ) use ( &$templates ): ?string {
			$post = $id > 0 ? get_post( $id ) : null;
			if ( ! $post || PostTypes::TEMPLATE !== $post->post_type ) {
				return null;
			}
			$ref = 't' . $id;
			if ( ! isset( $templates[ $ref ] ) ) {
				$templates[ $ref ] = array(
					'ref'         => $ref,
					'title'       => $post->post_title,
					'data_source' => (string) get_post_meta( $id, '_data_source', true ),
					'layout'      => (string) get_post_meta( $id, '_layout', true ),
					'placements'  => Templates::normalize_placements( (string) get_post_meta( $id, '_placements', true ) ),
					'design'      => Templates::normalize_design( (string) get_post_meta( $id, '_design', true ) ),
				);
			}
			return $ref;
		};
		$add_category = static function ( \WP_Term $term ) use ( &$categories, $add_template ): string {
			$ref = 'c' . $term->term_id;
			if ( ! isset( $categories[ $ref ] ) ) {
				$categories[ $ref ] = array(
					'ref'              => $ref,
					'name'             => $term->name,
					'slug'             => $term->slug,
					'default_duration' => (int) get_term_meta( $term->term_id, '_default_duration', true ),
					'default_template' => $add_template( (int) get_term_meta( $term->term_id, '_default_template_id', true ) ),
					'color'            => (string) get_term_meta( $term->term_id, '_color', true ),
				);
			}
			return $ref;
		};

		if ( $full ) {
			foreach ( get_posts( array( 'post_type' => PostTypes::TEMPLATE, 'post_status' => 'publish', 'posts_per_page' => -1, 'fields' => 'ids' ) ) as $tid ) { // phpcs:ignore WordPress.WP.PostsPerPage, WordPress.Arrays.ArrayDeclarationSpacing
				$add_template( (int) $tid );
			}
			$all_terms = get_terms( array( 'taxonomy' => PostTypes::CATEGORY, 'hide_empty' => false ) );
			foreach ( is_array( $all_terms ) ? $all_terms : array() as $term ) {
				$add_category( $term );
			}
		}

		foreach ( array_keys( $block_ids ) as $block_id ) {
			$post = get_post( $block_id );
			if ( ! $post || PostTypes::BLOCK !== $post->post_type ) {
				continue;
			}
			$meta = array();
			foreach ( self::BLOCK_META as $key ) {
				$meta[ $key ] = get_post_meta( $block_id, $key, true );
			}
			$media_refs = array();
			foreach ( self::MEDIA_META as $key ) {
				$media_refs[ $key ] = $add_media( (int) get_post_meta( $block_id, $key, true ) );
			}
			// Every image of a multi-image block, in order.
			$image_refs = array_values( array_filter( array_map( $add_media, Resolver::image_ids( $block_id ) ) ) );
			$terms      = get_the_terms( $block_id, PostTypes::CATEGORY );

			$blocks[ 'b' . $block_id ] = array(
				'ref'        => 'b' . $block_id,
				'title'      => $post->post_title,
				'status'     => $post->post_status,
				'meta'       => $meta,
				'media'      => array_filter( $media_refs ),
				'template'   => $add_template( (int) get_post_meta( $block_id, self::TEMPLATE_META, true ) ),
				'images'     => $image_refs,
				'filter'     => self::term_filter_to_slugs( (string) get_post_meta( $block_id, self::TERM_FILTER_META, true ) ),
				'exclude'    => self::term_filter_to_slugs( (string) get_post_meta( $block_id, '_exclude_terms', true ) ),
				'categories' => is_array( $terms ) ? array_map( $add_category, $terms ) : array(),
			);
		}

		$lineup = Sequences::lineup();
		$out    = array(
			'format'      => self::FORMAT,
			'version'     => self::VERSION,
			'kind'        => $full ? 'full' : 'show',
			'exported_at' => gmdate( DATE_ATOM ),
			'site'        => home_url(),
			'plugin'      => WOTS_SIGNAGE_VERSION,
			'categories'  => array_values( $categories ),
			'templates'   => array_values( $templates ),
			'media'       => array_values( $media ),
			'blocks'      => array_values( $blocks ),
			'sequences'   => array_map(
				static fn( \WP_Post $s ) => array(
					'ref'   => 's' . $s->ID,
					'title' => $s->post_title,
					'live'  => in_array( $s->ID, $lineup, true ),
					'items' => array_map(
						static fn( $i ) => array(
							'block'  => 'b' . $i['block_id'],
							'pinned' => (bool) $i['pinned'],
						),
						Sequences::items( $s->ID )
					),
				),
				$sequences
			),
		);
		if ( $full ) {
			// Everything but the player key.
			$out['settings'] = Settings::all();
		}
		return $out;
	}

	/** SHA-1 of an attachment's file, cached in post meta. */
	public static function attachment_hash( int $id ): string {
		$hash = (string) get_post_meta( $id, self::HASH_META, true );
		$file = get_attached_file( $id );
		if ( '' === $hash && $file && is_readable( $file ) ) {
			$hash = (string) sha1_file( $file );
			update_post_meta( $id, self::HASH_META, $hash );
		}
		return $hash;
	}

	// -----------------------------------------------------------------------
	// Import
	// -----------------------------------------------------------------------

	/**
	 * Read an uploaded zip and report what it holds and what conflicts.
	 *
	 * @return array|\WP_Error
	 */
	public static function analyze( string $uploaded_path ) {
		if ( ! class_exists( '\ZipArchive' ) ) {
			return new \WP_Error( 'wots_signage_no_zip', 'This server is missing PHP’s Zip extension, which import needs.' );
		}
		$manifest = self::read_manifest( $uploaded_path );
		if ( is_wp_error( $manifest ) ) {
			return $manifest;
		}

		// Keep the upload for commit(), outside the web root's public URLs.
		$token = wp_generate_password( 20, false );
		$dest  = trailingslashit( get_temp_dir() ) . 'wots-signage-import-' . $token . '.zip';
		if ( ! copy( $uploaded_path, $dest ) ) {
			return new \WP_Error( 'wots_signage_tmp', 'Could not store the upload for import.' );
		}
		set_transient( 'wots_signage_import_' . $token, $dest, HOUR_IN_SECONDS );

		$conflicts = array();
		foreach ( $manifest['templates'] as $t ) {
			$existing = self::find_post( PostTypes::TEMPLATE, (string) $t['title'] );
			if ( $existing ) {
				$conflicts[] = self::conflict( 'template', $t['ref'], (string) $t['title'], $existing );
			}
		}
		foreach ( $manifest['blocks'] as $b ) {
			$existing = self::find_post( PostTypes::BLOCK, (string) $b['title'] );
			if ( $existing ) {
				$conflicts[] = self::conflict( 'block', $b['ref'], (string) $b['title'], $existing );
			}
		}
		foreach ( $manifest['sequences'] as $s ) {
			$existing = self::find_post( PostTypes::SEQUENCE, (string) $s['title'] );
			if ( $existing ) {
				$conflicts[] = self::conflict( 'show', $s['ref'], (string) $s['title'], $existing );
			}
		}

		$reused = 0;
		foreach ( $manifest['media'] as $m ) {
			if ( self::find_media_by_hash( (string) ( $m['sha1'] ?? '' ), (string) $m['filename'] ) ) {
				++$reused;
			}
		}

		return array(
			'token'     => $token,
			'kind'      => $manifest['kind'],
			'site'      => $manifest['site'] ?? '',
			'exported'  => $manifest['exported_at'] ?? '',
			'counts'    => array(
				'shows'        => count( $manifest['sequences'] ),
				'blocks'       => count( $manifest['blocks'] ),
				'templates'    => count( $manifest['templates'] ),
				'categories'   => count( $manifest['categories'] ),
				'media'        => count( $manifest['media'] ),
				'media_reused' => $reused,
			),
			'settings'  => isset( $manifest['settings'] ),
			'conflicts' => $conflicts,
		);
	}

	private static function conflict( string $kind, string $ref, string $title, int $existing ): array {
		return array(
			'kind'        => $kind,
			'ref'         => $ref,
			'title'       => $title,
			'existing_id' => $existing,
		);
	}

	/**
	 * Apply an analyzed import.
	 *
	 * @param array $decisions "kind:ref" => skip | overwrite | copy.
	 * @return array|\WP_Error Counts of what was created/updated.
	 */
	public static function commit( string $token, array $decisions, bool $import_settings ) {
		$path = get_transient( 'wots_signage_import_' . sanitize_key( $token ) );
		if ( ! $path || ! is_readable( $path ) ) {
			return new \WP_Error( 'wots_signage_import_expired', 'That upload has expired. Choose the file again.' );
		}
		$manifest = self::read_manifest( $path );
		if ( is_wp_error( $manifest ) ) {
			return $manifest;
		}
		$zip = new \ZipArchive();
		if ( true !== $zip->open( $path ) ) {
			return new \WP_Error( 'wots_signage_zip', 'Could not open the zip file.' );
		}

		$decide = static function ( string $kind, string $ref ) use ( $decisions ): string {
			$d = $decisions[ $kind . ':' . $ref ] ?? 'skip';
			return in_array( $d, array( 'skip', 'overwrite', 'copy' ), true ) ? $d : 'skip';
		};
		$stats  = array(
			'created' => 0,
			'updated' => 0,
			'skipped' => 0,
			'media'   => 0,
		);

		// Media: reuse identical files, else add to the library.
		$media_map = array();
		foreach ( $manifest['media'] as $m ) {
			$existing = self::find_media_by_hash( (string) ( $m['sha1'] ?? '' ), (string) $m['filename'] );
			if ( $existing ) {
				$media_map[ $m['ref'] ] = $existing;
				continue;
			}
			$id = self::import_media( $zip, $m );
			if ( $id ) {
				$media_map[ $m['ref'] ] = $id;
				++$stats['media'];
			}
		}

		// Templates.
		$template_map = array();
		foreach ( $manifest['templates'] as $t ) {
			$meta                      = array(
				'_data_source' => sanitize_key( (string) $t['data_source'] ),
				'_layout'      => sanitize_key( (string) $t['layout'] ),
				'_placements'  => Templates::sanitize_placements_json( $t['placements'] ?? array() ),
				'_design'      => Templates::sanitize_design_json( $t['design'] ?? array() ),
			);
			$template_map[ $t['ref'] ] = self::upsert( PostTypes::TEMPLATE, 'template', $t['ref'], (string) $t['title'], 'publish', $meta, $decide, $stats );
		}

		// Categories merge by slug.
		$category_map = array();
		foreach ( $manifest['categories'] as $c ) {
			$term = get_term_by( 'slug', sanitize_title( (string) $c['slug'] ), PostTypes::CATEGORY );
			if ( ! $term ) {
				$created = wp_insert_term( sanitize_text_field( (string) $c['name'] ), PostTypes::CATEGORY, array( 'slug' => sanitize_title( (string) $c['slug'] ) ) );
				if ( is_wp_error( $created ) ) {
					continue;
				}
				$term_id = (int) $created['term_id'];
				if ( ! empty( $c['default_duration'] ) ) {
					update_term_meta( $term_id, '_default_duration', absint( $c['default_duration'] ) );
				}
				if ( ! empty( $c['default_template'] ) && ! empty( $template_map[ $c['default_template'] ] ) ) {
					update_term_meta( $term_id, '_default_template_id', (int) $template_map[ $c['default_template'] ] );
				}
			} else {
				$term_id = (int) $term->term_id;
			}
			$category_map[ $c['ref'] ] = $term_id;
		}

		// Blocks.
		$block_map = array();
		foreach ( $manifest['blocks'] as $b ) {
			$meta = array();
			foreach ( self::BLOCK_META as $key ) {
				if ( array_key_exists( $key, (array) $b['meta'] ) ) {
					$meta[ $key ] = $b['meta'][ $key ];
				}
			}
			foreach ( self::MEDIA_META as $key ) {
				$ref          = $b['media'][ $key ] ?? null;
				$meta[ $key ] = $ref && isset( $media_map[ $ref ] ) ? $media_map[ $ref ] : 0;
			}
			$images             = array_values( array_filter( array_map( static fn( $r ) => $media_map[ $r ] ?? 0, (array) ( $b['images'] ?? array() ) ) ) );
			$meta['_image_ids'] = implode( ',', $images );
			if ( $images ) {
				$meta['_image_id'] = $images[0];
			}
			$meta[ self::TEMPLATE_META ]    = ! empty( $b['template'] ) && ! empty( $template_map[ $b['template'] ] ) ? $template_map[ $b['template'] ] : 0;
			$meta[ self::TERM_FILTER_META ] = self::term_filter_from_slugs( $b['filter'] ?? array() );
			$meta['_exclude_terms']         = self::term_filter_from_slugs( $b['exclude'] ?? array() );

			$status   = in_array( $b['status'] ?? 'publish', array( 'publish', 'draft', 'private' ), true ) ? $b['status'] : 'publish';
			$decision = '';
			$id       = self::upsert( PostTypes::BLOCK, 'block', $b['ref'], (string) $b['title'], $status, $meta, $decide, $stats, $decision );
			if ( $id ) {
				$block_map[ $b['ref'] ] = $id;
				$terms                  = array_values( array_filter( array_map( static fn( $r ) => $category_map[ $r ] ?? 0, (array) $b['categories'] ) ) );
				if ( $terms && 'skip' !== $decision ) {
					wp_set_object_terms( $id, $terms, PostTypes::CATEGORY );
				}
			}
		}

		// Shows.
		foreach ( $manifest['sequences'] as $s ) {
			$items = array();
			foreach ( (array) $s['items'] as $item ) {
				if ( isset( $block_map[ $item['block'] ] ) ) {
					$items[] = array(
						'block_id' => $block_map[ $item['block'] ],
						'pinned'   => ! empty( $item['pinned'] ),
					);
				}
			}
			$meta = array( '_items' => wp_json_encode( Sequences::sanitize_items( $items ) ) );
			self::upsert( PostTypes::SEQUENCE, 'show', $s['ref'], (string) $s['title'], 'publish', $meta, $decide, $stats );
		}

		if ( $import_settings && isset( $manifest['settings'] ) && is_array( $manifest['settings'] ) ) {
			Settings::update( $manifest['settings'] );
		}

		$zip->close();
		wp_delete_file( $path );
		delete_transient( 'wots_signage_import_' . sanitize_key( $token ) );
		Version::force_bump();
		return $stats;
	}

	/**
	 * { taxonomy: [ term_id ] } JSON → { taxonomy: [ slug ] }, since term IDs
	 * differ between sites.
	 */
	private static function term_filter_to_slugs( string $json ): array {
		$out = array();
		foreach ( (array) json_decode( $json, true ) as $taxonomy => $ids ) {
			foreach ( (array) $ids as $id ) {
				$term = get_term( (int) $id, (string) $taxonomy );
				if ( $term instanceof \WP_Term ) {
					$out[ $taxonomy ][] = $term->slug;
				}
			}
		}
		return $out;
	}

	/**
	 * The reverse, on the importing site. Terms it doesn't have are dropped.
	 *
	 * @param mixed $filter { taxonomy: [ slug ] }.
	 */
	private static function term_filter_from_slugs( $filter ): string {
		$out = array();
		foreach ( is_array( $filter ) ? $filter : array() as $taxonomy => $slugs ) {
			if ( ! taxonomy_exists( (string) $taxonomy ) ) {
				continue;
			}
			foreach ( (array) $slugs as $slug ) {
				$term = get_term_by( 'slug', sanitize_title( (string) $slug ), (string) $taxonomy );
				if ( $term ) {
					$out[ $taxonomy ][] = (int) $term->term_id;
				}
			}
		}
		return PostTypes::sanitize_term_filter( $out );
	}

	/**
	 * Create, update, or reuse a post by title according to the decision.
	 *
	 * @return int The post ID the import should refer to.
	 */
	private static function upsert( string $post_type, string $kind, string $ref, string $title, string $status, array $meta, callable $decide, array &$stats, string &$decision = '' ): int {
		$title    = sanitize_text_field( $title );
		$existing = self::find_post( $post_type, $title );
		$decision = $existing ? $decide( $kind, $ref ) : 'new';

		if ( 'skip' === $decision ) {
			++$stats['skipped'];
			return $existing;
		}

		if ( 'overwrite' === $decision ) {
			wp_update_post(
				array(
					'ID'          => $existing,
					'post_status' => $status,
				)
			);
			foreach ( $meta as $key => $value ) {
				update_post_meta( $existing, $key, is_string( $value ) ? wp_slash( $value ) : $value );
			}
			++$stats['updated'];
			return $existing;
		}

		$id = wp_insert_post(
			array(
				'post_type'   => $post_type,
				'post_status' => $status,
				'post_title'  => 'copy' === $decision ? $title . ' (imported)' : $title,
			)
		);
		if ( is_wp_error( $id ) || ! $id ) {
			return 0;
		}
		foreach ( $meta as $key => $value ) {
			update_post_meta( $id, $key, is_string( $value ) ? wp_slash( $value ) : $value );
		}
		++$stats['created'];
		return (int) $id;
	}

	private static function find_post( string $post_type, string $title ): int {
		$found = get_posts(
			array(
				'post_type'      => $post_type,
				'post_status'    => array( 'publish', 'draft', 'private' ),
				'title'          => $title,
				'posts_per_page' => 1,
				'fields'         => 'ids',
			)
		);
		return $found ? (int) $found[0] : 0;
	}

	/**
	 * An attachment with this exact file content. Hashes are computed lazily
	 * for attachments with the same file name, then cached.
	 */
	private static function find_media_by_hash( string $hash, string $filename ): int {
		if ( ! preg_match( '/^[a-f0-9]{40}$/', $hash ) ) {
			return 0;
		}
		$found = get_posts(
			array(
				'post_type'      => 'attachment',
				'post_status'    => 'inherit',
				'posts_per_page' => 1,
				'fields'         => 'ids',
				'meta_key'       => self::HASH_META, // phpcs:ignore WordPress.DB.SlowDBQuery.slow_db_query_meta_key
				'meta_value'     => $hash, // phpcs:ignore WordPress.DB.SlowDBQuery.slow_db_query_meta_value
			)
		);
		if ( $found ) {
			return (int) $found[0];
		}
		// Same name, not hashed yet (WordPress may have added -1, -scaled…).
		$stem       = pathinfo( $filename, PATHINFO_FILENAME );
		$candidates = get_posts(
			array(
				'post_type'      => 'attachment',
				'post_status'    => 'inherit',
				'posts_per_page' => 20,
				'fields'         => 'ids',
				'meta_query'     => array( // phpcs:ignore WordPress.DB.SlowDBQuery.slow_db_query_meta_query
					array(
						'key'     => '_wp_attached_file',
						'value'   => $stem,
						'compare' => 'LIKE',
					),
				),
			)
		);
		foreach ( $candidates as $id ) {
			if ( self::attachment_hash( (int) $id ) === $hash ) {
				return (int) $id;
			}
		}
		return 0;
	}

	private static function import_media( \ZipArchive $zip, array $m ): int {
		$entry = (string) $m['file'];
		// Only files the manifest names, inside media/, no traversal.
		if ( ! str_starts_with( $entry, 'media/' ) || str_contains( $entry, '..' ) ) {
			return 0;
		}
		$data = $zip->getFromName( $entry );
		if ( false === $data ) {
			return 0;
		}
		$filename = sanitize_file_name( (string) $m['filename'] );
		$tmp      = wp_tempnam( $filename );
		file_put_contents( $tmp, $data ); // phpcs:ignore WordPress.WP.AlternativeFunctions.file_system_operations_file_put_contents -- temp file for sideload.

		require_once ABSPATH . 'wp-admin/includes/file.php';
		require_once ABSPATH . 'wp-admin/includes/media.php';
		require_once ABSPATH . 'wp-admin/includes/image.php';

		$id = media_handle_sideload(
			array(
				'name'     => $filename,
				'tmp_name' => $tmp,
			),
			0,
			sanitize_text_field( (string) ( $m['title'] ?? '' ) )
		);
		if ( is_wp_error( $id ) ) {
			wp_delete_file( $tmp );
			return 0;
		}
		if ( ! empty( $m['alt'] ) ) {
			update_post_meta( $id, '_wp_attachment_image_alt', sanitize_text_field( (string) $m['alt'] ) );
		}
		update_post_meta( $id, self::HASH_META, sha1( $data ) );
		return (int) $id;
	}

	/**
	 * @return array|\WP_Error The validated manifest.
	 */
	private static function read_manifest( string $path ) {
		$zip = new \ZipArchive();
		if ( true !== $zip->open( $path ) ) {
			return new \WP_Error( 'wots_signage_zip', 'That isn’t a zip file.' );
		}
		$raw = $zip->getFromName( 'manifest.json' );
		$zip->close();
		if ( false === $raw || strlen( $raw ) > 5 * MB_IN_BYTES ) {
			return new \WP_Error( 'wots_signage_manifest', 'No manifest.json found. Is this a signage export?' );
		}
		$manifest = json_decode( $raw, true );
		if ( ! is_array( $manifest ) || self::FORMAT !== ( $manifest['format'] ?? '' ) ) {
			return new \WP_Error( 'wots_signage_manifest', 'This file isn’t a signage export.' );
		}
		if ( (int) ( $manifest['version'] ?? 0 ) > self::VERSION ) {
			return new \WP_Error( 'wots_signage_manifest', 'This export is from a newer version of the plugin. Update the plugin first.' );
		}
		foreach ( array( 'categories', 'templates', 'media', 'blocks', 'sequences' ) as $key ) {
			if ( ! isset( $manifest[ $key ] ) || ! is_array( $manifest[ $key ] ) ) {
				$manifest[ $key ] = array();
			}
		}
		$manifest['kind'] = 'full' === ( $manifest['kind'] ?? '' ) ? 'full' : 'show';
		return $manifest;
	}
}
