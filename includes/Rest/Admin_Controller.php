<?php
namespace WOTS\Signage\Rest;

use WOTS\Signage\Block_Preview;
use WOTS\Signage\Blocks;
use WOTS\Signage\Import_Export;
use WOTS\Signage\DataSources\Filterable;
use WOTS\Signage\DataSources\Helpers;
use WOTS\Signage\DataSources\Pickable;
use WOTS\Signage\DataSources\Registry;
use WOTS\Signage\Player_Route;
use WOTS\Signage\Plugin;
use WOTS\Signage\PostTypes;
use WOTS\Signage\Sequences;
use WOTS\Signage\Settings;
use WOTS\Signage\Templates;
use WOTS\Signage\Version;

defined( 'ABSPATH' ) || exit;

/**
 * Admin endpoints (PRD §11.3). Cookie + nonce auth, manage_signage required.
 * Block CRUD itself uses core /wp/v2/signage_block routes.
 */
final class Admin_Controller {

	public static function register_routes(): void {
		$ns   = Player_Controller::NS;
		$perm = static fn() => current_user_can( Plugin::CAPABILITY );

		register_rest_route(
			$ns,
			'/blocks/summary',
			array(
				'methods'             => \WP_REST_Server::READABLE,
				'callback'            => static fn() => new \WP_REST_Response( Blocks::summaries() ),
				'permission_callback' => $perm,
			)
		);

		register_rest_route(
			$ns,
			'/blocks/preview',
			array(
				'methods'             => \WP_REST_Server::CREATABLE,
				'callback'            => array( self::class, 'preview_block' ),
				'permission_callback' => $perm,
				'args'                => array(
					'id'     => array(
						'type'    => 'integer',
						'default' => 0,
					),
					'record' => array(
						'type'    => array( 'object', 'null' ),
						'default' => null,
					),
				),
			)
		);

		register_rest_route(
			$ns,
			'/lineup',
			array(
				'methods'             => 'PUT',
				'callback'            => array( self::class, 'save_lineup' ),
				'permission_callback' => $perm,
				'args'                => array(
					'shows' => array(
						'type'     => 'array',
						'required' => true,
						'items'    => array( 'type' => 'integer' ),
					),
				),
			)
		);

		register_rest_route(
			$ns,
			'/data-sources/(?P<key>[a-z0-9_-]+)/posts',
			array(
				'methods'             => \WP_REST_Server::READABLE,
				'callback'            => array( self::class, 'source_posts' ),
				'permission_callback' => $perm,
			)
		);

		register_rest_route(
			$ns,
			'/data-sources/(?P<key>[a-z0-9_-]+)/terms',
			array(
				'methods'             => \WP_REST_Server::READABLE,
				'callback'            => array( self::class, 'source_terms' ),
				'permission_callback' => $perm,
			)
		);

		register_rest_route(
			$ns,
			'/show',
			array(
				'methods'             => \WP_REST_Server::READABLE,
				'callback'            => array( self::class, 'live_show' ),
				'permission_callback' => $perm,
			)
		);

		register_rest_route(
			$ns,
			'/sequences',
			array(
				'methods'             => \WP_REST_Server::READABLE,
				'callback'            => static fn() => new \WP_REST_Response( Sequences::summaries() ),
				'permission_callback' => $perm,
			)
		);

		register_rest_route(
			$ns,
			'/sequences/(?P<id>\d+)',
			array(
				'methods'             => \WP_REST_Server::READABLE,
				'callback'            => array( self::class, 'get_sequence' ),
				'permission_callback' => $perm,
			)
		);

		register_rest_route(
			$ns,
			'/sequences/(?P<id>\d+)/duplicate',
			array(
				'methods'             => \WP_REST_Server::CREATABLE,
				'callback'            => array( self::class, 'duplicate_sequence' ),
				'permission_callback' => $perm,
			)
		);

		register_rest_route(
			$ns,
			'/import/analyze',
			array(
				'methods'             => \WP_REST_Server::CREATABLE,
				'callback'            => array( self::class, 'import_analyze' ),
				'permission_callback' => $perm,
			)
		);

		register_rest_route(
			$ns,
			'/import/commit',
			array(
				'methods'             => \WP_REST_Server::CREATABLE,
				'callback'            => array( self::class, 'import_commit' ),
				'permission_callback' => $perm,
				'args'                => array(
					'token'     => array(
						'type'     => 'string',
						'required' => true,
					),
					'decisions' => array(
						'type'    => 'object',
						'default' => array(),
					),
					'settings'  => array(
						'type'    => 'boolean',
						'default' => false,
					),
				),
			)
		);

		register_rest_route(
			$ns,
			'/layouts',
			array(
				array(
					'methods'             => \WP_REST_Server::READABLE,
					'callback'            => static fn() => new \WP_REST_Response( Templates::saved_layouts() ),
					'permission_callback' => $perm,
				),
				array(
					'methods'             => \WP_REST_Server::CREATABLE,
					'callback'            => static fn( \WP_REST_Request $r ) => new \WP_REST_Response( Templates::save_layout( (string) $r['name'], $r['rows'] ) ),
					'permission_callback' => $perm,
					'args'                => array(
						'name' => array(
							'type'     => 'string',
							'required' => true,
						),
						'rows' => array(
							'type'     => 'array',
							'required' => true,
						),
					),
				),
			)
		);

		register_rest_route(
			$ns,
			'/layouts/(?P<id>[a-z0-9]+)',
			array(
				'methods'             => \WP_REST_Server::DELETABLE,
				'callback'            => static fn( \WP_REST_Request $r ) => new \WP_REST_Response( Templates::delete_layout( (string) $r['id'] ) ),
				'permission_callback' => $perm,
			)
		);

		register_rest_route(
			$ns,
			'/templates',
			array(
				'methods'             => \WP_REST_Server::READABLE,
				'callback'            => static fn() => new \WP_REST_Response( Templates::summaries() ),
				'permission_callback' => $perm,
			)
		);

		register_rest_route(
			$ns,
			'/sequences/(?P<id>\d+)/items',
			array(
				'methods'             => 'PUT',
				'callback'            => array( self::class, 'save_items' ),
				'permission_callback' => $perm,
				'args'                => array(
					'items' => array(
						'type'     => 'array',
						'required' => true,
						'items'    => array(
							'type'       => 'object',
							'properties' => array(
								'block_id' => array( 'type' => 'integer' ),
								'pinned'   => array( 'type' => 'boolean' ),
							),
						),
					),
				),
			)
		);

		register_rest_route(
			$ns,
			'/sequences/(?P<id>\d+)/activate',
			array(
				'methods'             => \WP_REST_Server::CREATABLE,
				'callback'            => array( self::class, 'activate' ),
				'permission_callback' => $perm,
			)
		);

		register_rest_route(
			$ns,
			'/data-sources',
			array(
				'methods'             => \WP_REST_Server::READABLE,
				'callback'            => static fn() => new \WP_REST_Response( Registry::describe() ),
				'permission_callback' => $perm,
			)
		);

		register_rest_route(
			$ns,
			'/data-sources/(?P<key>[a-z0-9_-]+)/preview',
			array(
				'methods'             => \WP_REST_Server::READABLE,
				'callback'            => array( self::class, 'preview_source' ),
				'permission_callback' => $perm,
			)
		);

		register_rest_route(
			$ns,
			'/player/refresh-now',
			array(
				'methods'             => \WP_REST_Server::CREATABLE,
				'callback'            => static fn() => new \WP_REST_Response( array( 'version' => Version::force_bump() ) ),
				'permission_callback' => $perm,
			)
		);

		register_rest_route(
			$ns,
			'/admin/status',
			array(
				'methods'             => \WP_REST_Server::READABLE,
				'callback'            => array( self::class, 'status' ),
				'permission_callback' => $perm,
			)
		);
	}

	public static function live_show(): \WP_REST_Response {
		$lineup = Sequences::lineup( true );
		$id     = $lineup[0] ?? Sequences::live_id( true );
		return new \WP_REST_Response(
			array(
				'id'      => $id,
				'title'   => $id ? html_entity_decode( get_the_title( $id ), ENT_QUOTES, 'UTF-8' ) : '',
				'items'   => $id ? Sequences::items( $id ) : array(),
				'is_live' => true,
			)
		);
	}

	public static function get_sequence( \WP_REST_Request $request ) {
		$id = (int) $request['id'];
		if ( PostTypes::SEQUENCE !== get_post_type( $id ) ) {
			return new \WP_Error( 'wots_signage_not_found', 'Show not found.', array( 'status' => 404 ) );
		}
		return new \WP_REST_Response(
			array(
				'id'      => $id,
				'title'   => html_entity_decode( get_the_title( $id ), ENT_QUOTES, 'UTF-8' ),
				'items'   => Sequences::items( $id ),
				'is_live' => Sequences::in_lineup( $id ),
			)
		);
	}

	public static function duplicate_sequence( \WP_REST_Request $request ) {
		$copy = Sequences::duplicate( (int) $request['id'] );
		if ( ! $copy ) {
			return new \WP_Error( 'wots_signage_not_found', 'Show not found.', array( 'status' => 404 ) );
		}
		return new \WP_REST_Response( array( 'id' => $copy ) );
	}

	public static function import_analyze( \WP_REST_Request $request ) {
		$files = $request->get_file_params();
		$file  = $files['file'] ?? null;
		if ( ! $file || ! empty( $file['error'] ) || empty( $file['tmp_name'] ) || ! is_uploaded_file( $file['tmp_name'] ) ) {
			return new \WP_Error( 'wots_signage_upload', 'The upload didn’t arrive. The file may be larger than the server allows.', array( 'status' => 400 ) );
		}
		$result = Import_Export::analyze( $file['tmp_name'] );
		if ( is_wp_error( $result ) ) {
			$result->add_data( array( 'status' => 400 ) );
			return $result;
		}
		return new \WP_REST_Response( $result );
	}

	public static function import_commit( \WP_REST_Request $request ) {
		$result = Import_Export::commit(
			(string) $request['token'],
			(array) $request['decisions'],
			(bool) $request['settings']
		);
		if ( is_wp_error( $result ) ) {
			$result->add_data( array( 'status' => 400 ) );
			return $result;
		}
		return new \WP_REST_Response( $result );
	}

	public static function save_items( \WP_REST_Request $request ) {
		$id = (int) $request['id'];
		if ( PostTypes::SEQUENCE !== get_post_type( $id ) ) {
			return new \WP_Error( 'wots_signage_not_found', 'Show not found.', array( 'status' => 404 ) );
		}
		$items = Sequences::save_items( $id, (array) $request->get_param( 'items' ) );
		return new \WP_REST_Response(
			array(
				'id'    => $id,
				'items' => $items,
			)
		);
	}

	public static function activate( \WP_REST_Request $request ) {
		if ( ! Sequences::activate( (int) $request['id'] ) ) {
			return new \WP_Error( 'wots_signage_not_found', 'Show not found.', array( 'status' => 404 ) );
		}
		return new \WP_REST_Response( array( 'live' => (int) $request['id'] ) );
	}

	public static function preview_source( \WP_REST_Request $request ) {
		$source = Registry::get( (string) $request['key'] );
		if ( ! $source ) {
			return new \WP_Error( 'wots_signage_not_found', 'Unknown data source.', array( 'status' => 404 ) );
		}
		$max     = max( 1, min( 100, (int) ( $request->get_param( 'max_items' ) ?? 3 ) ) );
		$terms   = json_decode( (string) $request->get_param( 'terms' ), true );
		$exclude = json_decode( (string) $request->get_param( 'exclude_terms' ), true );
		return new \WP_REST_Response(
			array(
				'available' => $source->is_available(),
				'items'     => $source->items(
					array(
						'max_items'           => $max,
						'featured_month_year' => sanitize_text_field( (string) $request->get_param( 'featured_month_year' ) ),
						'event_range'         => sanitize_key( (string) $request->get_param( 'event_range' ) ),
						'range_days'          => (int) $request->get_param( 'range_days' ),
						'range_start'         => sanitize_text_field( (string) $request->get_param( 'range_start' ) ),
						'range_end'           => sanitize_text_field( (string) $request->get_param( 'range_end' ) ),
						'terms'               => is_array( $terms ) ? $terms : array(),
						'post_ids'            => array_filter( array_map( 'intval', explode( ',', (string) $request->get_param( 'post_ids' ) ) ) ),
						'exclude_ids'         => array_filter( array_map( 'intval', explode( ',', (string) $request->get_param( 'exclude_ids' ) ) ) ),
						'exclude_terms'       => is_array( $exclude ) ? $exclude : array(),
					)
				),
			)
		);
	}

	public static function preview_block( \WP_REST_Request $request ): \WP_REST_Response {
		$record = $request->get_param( 'record' );
		return new \WP_REST_Response( Block_Preview::playlist( (int) $request->get_param( 'id' ), is_array( $record ) ? $record : null ) );
	}

	public static function save_lineup( \WP_REST_Request $request ): \WP_REST_Response {
		return new \WP_REST_Response(
			array(
				'lineup' => Sequences::save_lineup( (array) $request->get_param( 'shows' ) ),
				'shows'  => Sequences::summaries(),
			)
		);
	}

	/**
	 * The post picker: ?search=… (title, or an ID), or ?include=1,2,3 to
	 * name already-picked posts.
	 */
	public static function source_posts( \WP_REST_Request $request ) {
		$source = Registry::get( (string) $request['key'] );
		if ( ! $source instanceof Pickable ) {
			return new \WP_Error( 'wots_signage_not_found', 'This data source can’t pick posts.', array( 'status' => 404 ) );
		}
		$include = array_filter( array_map( 'intval', explode( ',', (string) $request->get_param( 'include' ) ) ) );
		return new \WP_REST_Response(
			Helpers::search_posts( $source->pick_post_type(), sanitize_text_field( (string) $request->get_param( 'search' ) ), $include )
		);
	}

	public static function source_terms( \WP_REST_Request $request ) {
		$source = Registry::get( (string) $request['key'] );
		if ( ! $source ) {
			return new \WP_Error( 'wots_signage_not_found', 'Unknown data source.', array( 'status' => 404 ) );
		}
		return new \WP_REST_Response( $source instanceof Filterable ? Helpers::describe_terms( $source->taxonomies() ) : array() );
	}

	public static function status(): \WP_REST_Response {
		$heartbeat = get_option( Player_Controller::HEARTBEAT_OPT, null );
		return new \WP_REST_Response(
			array(
				'version'    => Version::current(),
				'player_url' => Player_Route::player_url(),
				'heartbeat'  => is_array( $heartbeat ) ? $heartbeat : null,
				'now'        => time(),
				'settings'   => Settings::all(),
			)
		);
	}
}
