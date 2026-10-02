<?php
namespace WOTS\Signage;

defined( 'ABSPATH' ) || exit;

/**
 * Updates from GitHub releases.
 *
 * Each release on github.com/idmo/wots-signage-wp-plugin carries a built
 * wots-signage.zip (made by .github/workflows/release.yml). WordPress checks
 * about twice a day and shows the usual "update available" notice on the
 * Plugins screen; "Check for updates" under the plugin's row checks now.
 *
 * Uses Plugin Update Checker (MIT, lib/plugin-update-checker).
 */
final class Updater {

	public const REPO = 'https://github.com/idmo/wots-signage-wp-plugin/';

	public static function boot(): void {
		$loader = WOTS_SIGNAGE_DIR . 'lib/plugin-update-checker/plugin-update-checker.php';

		/**
		 * Turn update checks off, e.g. on a local development copy.
		 *
		 * @param bool $enabled Whether to check GitHub for updates.
		 */
		if ( ! is_readable( $loader ) || ! apply_filters( 'wots_signage_check_for_updates', true ) ) {
			return;
		}
		require_once $loader;

		$checker = \YahnisElsts\PluginUpdateChecker\v5\PucFactory::buildUpdateChecker(
			self::REPO,
			WOTS_SIGNAGE_FILE,
			'wots-signage'
		);
		// Install the built zip attached to the release, not GitHub's source
		// archive (which has no build/ folder).
		$checker->getVcsApi()->enableReleaseAssets( '/^wots-signage\.zip$/' );
	}
}
