<?php
namespace WOTS\Signage;

defined( 'ABSPATH' ) || exit;

/**
 * Serves the kiosk player at /signage/player/?key=... (PRD §8.2).
 */
final class Player_Route {

	public const KEY_OPTION = 'wots_signage_player_key';
	public const QUERY_VAR  = 'wots_signage_player';
	public const SW_VAR     = 'wots_signage_sw';

	/** Bump when rewrite rules change so existing installs flush once. */
	private const REWRITE_VERSION = '2';

	public static function register_rewrites(): void {
		add_rewrite_rule( '^signage/player/?$', 'index.php?' . self::QUERY_VAR . '=1', 'top' );
		add_rewrite_rule( '^signage/sw\.js$', 'index.php?' . self::SW_VAR . '=1', 'top' );

		// Plugin updates don't run the activation hook, so flush when the
		// rules above change.
		if ( get_option( 'wots_signage_rewrite_version' ) !== self::REWRITE_VERSION ) {
			add_action(
				'wp_loaded',
				static function () {
					flush_rewrite_rules( false );
					update_option( 'wots_signage_rewrite_version', self::REWRITE_VERSION, true );
				}
			);
		}
	}

	public static function query_vars( array $vars ): array {
		$vars[] = self::QUERY_VAR;
		$vars[] = self::SW_VAR;
		return $vars;
	}

	/**
	 * The service worker (PRD §8.4). Served from /signage/ so its default
	 * scope covers the player page.
	 */
	private static function serve_service_worker(): void {
		$file = WOTS_SIGNAGE_DIR . 'build/sw.js';
		if ( function_exists( 'batcache_cancel' ) ) {
			batcache_cancel();
		}
		if ( ! is_readable( $file ) ) {
			status_header( 404 );
			exit;
		}
		status_header( 200 );
		header( 'Content-Type: application/javascript; charset=utf-8' );
		header( 'Service-Worker-Allowed: ' . wp_parse_url( home_url( '/signage/' ), PHP_URL_PATH ) );
		// Browsers re-check the worker on every load; never let a cache answer.
		header( 'Cache-Control: no-store, no-cache, must-revalidate, max-age=0' );
		readfile( $file ); // phpcs:ignore WordPress.WP.AlternativeFunctions.file_system_operations_readfile -- static build file.
		exit;
	}

	public static function player_url(): string {
		return add_query_arg( 'key', rawurlencode( (string) get_option( self::KEY_OPTION, '' ) ), home_url( '/signage/player/' ) );
	}

	public static function key_is_valid( ?string $key ): bool {
		$stored = (string) get_option( self::KEY_OPTION, '' );
		return '' !== $stored && is_string( $key ) && hash_equals( $stored, $key );
	}

	public static function maybe_render(): void {
		if ( get_query_var( self::SW_VAR ) ) {
			self::serve_service_worker();
		}
		if ( ! get_query_var( self::QUERY_VAR ) ) {
			return;
		}

		// Never let a page/edge cache hold onto the player (PRD §12).
		nocache_headers();
		header( 'Cache-Control: no-store, no-cache, must-revalidate, max-age=0' );
		if ( function_exists( 'batcache_cancel' ) ) {
			batcache_cancel(); // Pressable's page cache.
		}
		show_admin_bar( false );

		// phpcs:ignore WordPress.Security.NonceVerification.Recommended -- key auth, not a form.
		$key        = isset( $_GET['key'] ) ? sanitize_text_field( wp_unslash( $_GET['key'] ) ) : null;
		$key_ok     = self::key_is_valid( $key );
		$is_admin   = current_user_can( Plugin::CAPABILITY );
		$authorized = $key_ok || $is_admin;

		$asset_file = WOTS_SIGNAGE_DIR . 'build/player.asset.php';
		$asset      = is_readable( $asset_file ) ? require $asset_file : null;
		$settings   = Settings::all();
		$config     = array(
			'restRoot'     => esc_url_raw( rest_url( 'wots-signage/v1/' ) ),
			'key'          => $key_ok ? $key : null,
			// Logged-in admins without a key (preview) authenticate by cookie + nonce.
			'nonce'        => ( ! $key_ok && $is_admin ) ? wp_create_nonce( 'wp_rest' ) : null,
			'authorized'   => $authorized,
			'pollInterval' => (int) $settings['poll_interval'],
			'brandColor'   => (string) $settings['brand_color'],
			'stage'        => Settings::stage(),
			// Esc takes a logged-in admin back to the Signage screen.
			'exitUrl'      => $is_admin ? admin_url( 'admin.php?page=' . Admin_Menu::SLUG ) : null,
			'build'        => Rest\Player_Controller::player_build(),
			'swUrl'        => $key_ok ? home_url( '/signage/sw.js' ) : null,
			'swScope'      => wp_parse_url( home_url( '/signage/' ), PHP_URL_PATH ),
		);
		?>
<!doctype html>
<html lang="en">
<head>
	<meta charset="utf-8">
	<meta name="viewport" content="width=device-width, initial-scale=1">
	<meta name="robots" content="noindex, nofollow">
	<title>Signage Player</title>
		<?php if ( $asset && is_readable( WOTS_SIGNAGE_DIR . 'build/style-player.css' ) ) : ?>
			<?php
			// The player is standalone (no wp_head), so print its stylesheet directly.
			wp_register_style( 'wots-signage-player', WOTS_SIGNAGE_URL . 'build/style-player.css', array(), $asset['version'] );
			wp_print_styles( 'wots-signage-player' );
			?>
	<?php endif; ?>
	<style>html,body{margin:0;height:100%;background:#000;color:#fff;font-family:system-ui,sans-serif;overflow:hidden}</style>
</head>
<body>
	<div id="wots-signage-player"></div>
	<script>window.wotsSignagePlayer = <?php echo wp_json_encode( $config ); ?>;</script>
		<?php if ( $asset ) : ?>
			<?php
			// The player is standalone (no wp_head), so load its WP script deps directly.
			wp_enqueue_script( 'wots-signage-player', WOTS_SIGNAGE_URL . 'build/player.js', $asset['dependencies'], $asset['version'], true );
			wp_print_scripts( 'wots-signage-player' );
			?>
	<?php else : ?>
		<p style="padding:2rem">Player not built yet. Run <code>npm start</code> in the plugin folder.</p>
	<?php endif; ?>
</body>
</html>
		<?php
		exit;
	}
}
