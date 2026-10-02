<?php
namespace WOTS\Signage\Rest;

use WOTS\Signage\Blocks;
use WOTS\Signage\Import_Export;
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
		$id = Sequences::live_id( true );
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
				'is_live' => Sequences::live_id() === $id,
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
		$max = max( 1, min( 10, (int) ( $request->get_param( 'max_items' ) ?? 3 ) ) );
		return new \WP_REST_Response(
			array(
				'available' => $source->is_available(),
				'items'     => $source->items(
					array(
						'max_items'           => $max,
						'featured_month_year' => sanitize_text_field( (string) $request->get_param( 'featured_month_year' ) ),
					)
				),
			)
		);
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
