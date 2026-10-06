<?php
namespace WOTS\Signage;

defined( 'ABSPATH' ) || exit;

/**
 * Updates from GitHub releases.
 *
 * Each release on github.com/idmo/wots-signage-wp-plugin carries a built
 * wots-signage.zip and a small wots-signage.json describing it (both made by
 * .github/workflows/release.yml). WordPress checks about twice a day and
 * shows the usual "update available" notice on the Plugins screen; "Check
 * for updates" under the plugin's row checks now.
 *
 * The check reads the JSON file as an ordinary download instead of calling
 * the GitHub API. GitHub allows only 60 anonymous API calls an hour per
 * server address, which shared hosts like Pressable run out of, and that
 * showed up as "GitHub API error … 403".
 *
 * Uses Plugin Update Checker (MIT, lib/plugin-update-checker).
 */
final class Updater {

	public const REPO = 'https://github.com/idmo/wots-signage-wp-plugin/';

	/** Always the newest release's metadata (GitHub redirects "latest"). */
	public const METADATA = self::REPO . 'releases/latest/download/wots-signage.json';

	/** @var object|null The Plugin Update Checker instance, once booted. */
	private static $checker = null;

	public static function checker() {
		return self::$checker;
	}

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

		// A plain JSON URL (not a repository URL), so the library reads it
		// as metadata; its download_url points at that release's zip.
		self::$checker = \YahnisElsts\PluginUpdateChecker\v5\PucFactory::buildUpdateChecker(
			self::METADATA,
			WOTS_SIGNAGE_FILE,
			'wots-signage'
		);
	}
}
