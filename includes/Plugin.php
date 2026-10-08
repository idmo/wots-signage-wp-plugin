<?php
namespace WOTS\Signage;

defined( 'ABSPATH' ) || exit;

/**
 * Wires the plugin together. Keep this thin — each concern lives in its own class.
 */
final class Plugin {

	public const CAPABILITY = 'manage_signage';

	public static function boot(): void {
		add_action( 'init', array( PostTypes::class, 'register' ) );
		add_action( 'init', array( Player_Route::class, 'register_rewrites' ) );
		add_action( 'after_setup_theme', array( Media::class, 'register_sizes' ) );
		add_filter( 'query_vars', array( Player_Route::class, 'query_vars' ) );
		// Before redirect_canonical(), which would add a slash to /signage/sw.js.
		add_action( 'template_redirect', array( Player_Route::class, 'maybe_render' ), 1 );

		add_action( 'rest_api_init', array( Rest\Player_Controller::class, 'register_routes' ) );
		add_action( 'rest_api_init', array( Rest\Admin_Controller::class, 'register_routes' ) );
		add_filter( 'rest_post_dispatch', array( Rest\Player_Controller::class, 'no_store' ), 10, 3 );

		Version::register_hooks();
		add_action( 'trashed_post', array( Sequences::class, 'forget' ) );
		add_action( 'before_delete_post', array( Sequences::class, 'forget' ) );
		Import_Export::register();
		Updater::boot();
		Instagram::register();
		Board_Visibility::register();

		add_action( 'admin_menu', array( Admin_Menu::class, 'register' ) );
		Admin_Menu::register_handlers();
		add_action( 'admin_enqueue_scripts', array( Admin_Menu::class, 'enqueue' ) );
		Admin_Menu::register_category_fields();
	}

	/**
	 * Load a built asset from /build with its generated dependency list.
	 */
	public static function enqueue_build( string $handle, string $entry ): void {
		$asset_file = WOTS_SIGNAGE_DIR . "build/{$entry}.asset.php";
		if ( ! is_readable( $asset_file ) ) {
			return; // Not built yet — run `npm run build` or `npm start`.
		}
		$asset = require $asset_file;

		wp_enqueue_script(
			$handle,
			WOTS_SIGNAGE_URL . "build/{$entry}.js",
			$asset['dependencies'],
			$asset['version'],
			true
		);

		if ( is_readable( WOTS_SIGNAGE_DIR . "build/style-{$entry}.css" ) ) {
			wp_enqueue_style( $handle, WOTS_SIGNAGE_URL . "build/style-{$entry}.css", array(), $asset['version'] );
		}
	}
}
