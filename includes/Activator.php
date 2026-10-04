<?php
namespace WOTS\Signage;

defined( 'ABSPATH' ) || exit;

final class Activator {

	public static function activate(): void {
		$admin = get_role( 'administrator' );
		if ( $admin ) {
			$admin->add_cap( Plugin::CAPABILITY );
		}

		if ( ! get_option( Player_Route::KEY_OPTION ) ) {
			update_option( Player_Route::KEY_OPTION, wp_generate_password( 32, false ), false );
		}

		// Register rewrites before flushing so /signage/player works immediately.
		PostTypes::register();
		Player_Route::register_rewrites();
		flush_rewrite_rules();
	}

	public static function deactivate(): void {
		wp_clear_scheduled_hook( Instagram::CRON );
		flush_rewrite_rules();
	}
}
