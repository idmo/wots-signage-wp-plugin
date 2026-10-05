<?php
/**
 * Plugin Name:       WOTS Signage
 * Description:       Digital signage for Word on the Street Books — blocks, shows, templates, and a kiosk player.
 * Version:           0.5.0
 * Requires at least: 6.5
 * Requires PHP:      8.3
 * Author:            Brian Maggi
 * Text Domain:       wots-signage
 */

defined( 'ABSPATH' ) || exit;

define( 'WOTS_SIGNAGE_VERSION', '0.5.0' );
define( 'WOTS_SIGNAGE_FILE', __FILE__ );
define( 'WOTS_SIGNAGE_DIR', plugin_dir_path( __FILE__ ) );
define( 'WOTS_SIGNAGE_URL', plugin_dir_url( __FILE__ ) );

// Simple PSR-4 autoloader: WOTS\Signage\Foo\Bar -> includes/Foo/Bar.php
spl_autoload_register(
	static function ( $class_name ) {
		$prefix = 'WOTS\\Signage\\';
		if ( strncmp( $class_name, $prefix, strlen( $prefix ) ) !== 0 ) {
			return;
		}
		$relative = substr( $class_name, strlen( $prefix ) );
		$file     = WOTS_SIGNAGE_DIR . 'includes/' . str_replace( '\\', '/', $relative ) . '.php';
		if ( is_readable( $file ) ) {
			require $file;
		}
	}
);

// Composer dependencies (e.g. QR library), once added.
if ( is_readable( WOTS_SIGNAGE_DIR . 'vendor/autoload.php' ) ) {
	require WOTS_SIGNAGE_DIR . 'vendor/autoload.php';
}

register_activation_hook( __FILE__, array( WOTS\Signage\Activator::class, 'activate' ) );
register_deactivation_hook( __FILE__, array( WOTS\Signage\Activator::class, 'deactivate' ) );

add_action( 'plugins_loaded', array( WOTS\Signage\Plugin::class, 'boot' ) );
