<?php
namespace WOTS\Signage;

defined( 'ABSPATH' ) || exit;

/**
 * Top-level "Signage" menu (PRD §9). The main page mounts the React admin
 * (Show, Blocks, Preview); Settings and Categories are classic screens.
 */
final class Admin_Menu {

	public const SLUG = 'wots-signage';

	public static function register(): void {
		add_menu_page(
			'Signage',
			'Signage',
			Plugin::CAPABILITY,
			self::SLUG,
			array( self::class, 'render_app' ),
			'dashicons-format-video',
			26
		);

		add_submenu_page( self::SLUG, 'Signage', 'Shows & Blocks', Plugin::CAPABILITY, self::SLUG, array( self::class, 'render_app' ) );

		add_submenu_page(
			self::SLUG,
			'Signage Categories',
			'Categories',
			Plugin::CAPABILITY,
			'edit-tags.php?taxonomy=' . PostTypes::CATEGORY . '&post_type=' . PostTypes::BLOCK
		);

		add_submenu_page( self::SLUG, 'Signage Settings', 'Settings', Plugin::CAPABILITY, self::SLUG . '-settings', array( self::class, 'render_settings' ) );

		// Keep Signage → Categories highlighted on the taxonomy screens.
		add_filter(
			'parent_file',
			static function ( $parent_file ) {
				$screen = get_current_screen();
				return ( $screen && PostTypes::CATEGORY === $screen->taxonomy ) ? self::SLUG : $parent_file;
			}
		);
		add_filter(
			'submenu_file',
			static function ( $submenu ) {
				$screen = get_current_screen();
				return ( $screen && PostTypes::CATEGORY === $screen->taxonomy )
					? 'edit-tags.php?taxonomy=' . PostTypes::CATEGORY . '&post_type=' . PostTypes::BLOCK
					: $submenu;
			}
		);
	}

	/**
	 * Form handlers. Registered from Plugin::boot(), not register():
	 * admin-post.php never fires admin_menu.
	 */
	public static function register_handlers(): void {
		add_action( 'admin_post_wots_signage_rotate_key', array( self::class, 'rotate_key' ) );
		add_action( 'admin_post_wots_signage_save_settings', array( self::class, 'save_settings' ) );
	}

	public static function enqueue( string $hook ): void {
		if ( 'toplevel_page_' . self::SLUG !== $hook ) {
			return;
		}
		wp_enqueue_media(); // Media library picker for image/video blocks.
		Plugin::enqueue_build( 'wots-signage-admin', 'admin' );
		wp_add_inline_script(
			'wots-signage-admin',
			'window.wotsSignageAdmin = ' . wp_json_encode(
				array(
					'restRoot'    => esc_url_raw( rest_url() ),
					'nonce'       => wp_create_nonce( 'wp_rest' ),
					'playerUrl'   => Player_Route::player_url(),
					// No key: the preview authenticates as the logged-in admin, so
					// its heartbeats aren't mistaken for the shop TV.
					'previewUrl'  => home_url( '/signage/player/' ),
					// add_query_arg, not wp_nonce_url(), which HTML-escapes the "&".
					'exportUrl'   => add_query_arg(
						array(
							'action'   => 'wots_signage_export',
							'_wpnonce' => wp_create_nonce( 'wots_signage_export' ),
						),
						admin_url( 'admin-post.php' )
					),
					'maxUpload'   => wp_max_upload_size(),
					'settingsUrl' => admin_url( 'admin.php?page=' . self::SLUG . '-settings' ),
					'settings'    => Settings::all(),
					'stage'       => Settings::stage(),
					'today'       => Schedule::today(),
				)
			) . ';',
			'before'
		);
	}

	public static function render_app(): void {
		echo '<div class="wrap"><div id="wots-signage-admin">';
		if ( ! is_readable( WOTS_SIGNAGE_DIR . 'build/admin.asset.php' ) ) {
			echo '<p>Admin app not built yet. Run <code>npm start</code> in the plugin folder.</p>';
		}
		echo '</div></div>';
	}

	public static function render_settings(): void {
		$s = Settings::all();
		// phpcs:ignore WordPress.Security.NonceVerification.Recommended -- display-only flag.
		$saved = isset( $_GET['updated'] );
		?>
		<div class="wrap">
			<h1>Signage Settings</h1>
			<?php if ( $saved ) : ?>
				<div class="notice notice-success is-dismissible"><p>Settings saved.</p></div>
			<?php endif; ?>

			<h2>Player URL</h2>
			<p>Open this on the kiosk Mac. Anyone with this link can view the live show.</p>
			<p><input type="text" class="large-text code" readonly value="<?php echo esc_attr( Player_Route::player_url() ); ?>" onclick="this.select()"></p>
			<form method="post" action="<?php echo esc_url( admin_url( 'admin-post.php' ) ); ?>">
				<?php wp_nonce_field( 'wots_signage_rotate_key' ); ?>
				<input type="hidden" name="action" value="wots_signage_rotate_key">
				<?php submit_button( 'Rotate player key', 'secondary', 'rotate', false ); ?>
				<span class="description">The old URL stops working immediately.</span>
			</form>

			<h2>Playback</h2>
			<form method="post" action="<?php echo esc_url( admin_url( 'admin-post.php' ) ); ?>">
				<?php wp_nonce_field( 'wots_signage_save_settings' ); ?>
				<input type="hidden" name="action" value="wots_signage_save_settings">
				<table class="form-table" role="presentation">
					<tr>
						<th scope="row"><label for="aspect">Screen shape</label></th>
						<td>
							<select name="aspect" id="aspect">
								<?php foreach ( Settings::ASPECT_LABELS as $value => $label ) : ?>
									<option value="<?php echo esc_attr( $value ); ?>" <?php selected( $s['aspect'], $value ); ?>><?php echo esc_html( $label ); ?></option>
								<?php endforeach; ?>
							</select>
							<p class="description">Match how the TV is mounted. For portrait, also rotate the display in the computer's display settings.</p>
						</td>
					</tr>
					<tr>
						<th scope="row"><label for="poll_interval">Check for changes every</label></th>
						<td><input name="poll_interval" id="poll_interval" type="number" min="5" max="300" value="<?php echo esc_attr( $s['poll_interval'] ); ?>" class="small-text"> seconds
							<p class="description">How quickly saved edits reach the TV. 15–30 seconds is plenty.</p></td>
					</tr>
					<tr>
						<th scope="row"><label for="default_image_duration">Default image duration</label></th>
						<td><input name="default_image_duration" id="default_image_duration" type="number" min="1" value="<?php echo esc_attr( $s['default_image_duration'] ); ?>" class="small-text"> seconds</td>
					</tr>
					<tr>
						<th scope="row"><label for="default_item_duration">Default time per event/item</label></th>
						<td><input name="default_item_duration" id="default_item_duration" type="number" min="1" value="<?php echo esc_attr( $s['default_item_duration'] ); ?>" class="small-text"> seconds</td>
					</tr>
					<tr>
						<th scope="row"><label for="default_video_duration">Fallback video duration</label></th>
						<td><input name="default_video_duration" id="default_video_duration" type="number" min="1" value="<?php echo esc_attr( $s['default_video_duration'] ); ?>" class="small-text"> seconds
							<p class="description">Only used when WordPress couldn't read a video's length.</p></td>
					</tr>
					<tr>
						<th scope="row"><label for="brand_color">Brand color</label></th>
						<td><input name="brand_color" id="brand_color" type="color" value="<?php echo esc_attr( $s['brand_color'] ); ?>">
							<p class="description">Background for slides without an image.</p></td>
					</tr>
					<tr>
						<th scope="row"><label for="block_transition">Transition between blocks</label></th>
						<td>
							<select name="block_transition" id="block_transition">
								<?php foreach ( array( 'cut' => 'Cut', 'crossfade' => 'Crossfade', 'slide' => 'Slide', 'zoom' => 'Zoom' ) as $value => $label ) : ?>
									<option value="<?php echo esc_attr( $value ); ?>" <?php selected( $s['block_transition'], $value ); ?>><?php echo esc_html( $label ); ?></option>
								<?php endforeach; ?>
							</select>
							<input name="transition_ms" id="transition_ms" type="number" min="0" max="5000" step="50" value="<?php echo esc_attr( $s['transition_ms'] ); ?>" class="small-text" aria-label="Transition length in milliseconds"> ms
							<p class="description">Blocks can choose their own transition.</p>
						</td>
					</tr>
					<tr>
						<th scope="row"><label for="content_animation">Dynamic content animation</label></th>
						<td>
							<select name="content_animation" id="content_animation">
								<?php foreach ( array( 'none' => 'None', 'fade' => 'Fade', 'slide' => 'Slide up', 'zoom' => 'Zoom' ) as $value => $label ) : ?>
									<option value="<?php echo esc_attr( $value ); ?>" <?php selected( $s['content_animation'], $value ); ?>><?php echo esc_html( $label ); ?></option>
								<?php endforeach; ?>
							</select>
							<input name="content_animation_ms" id="content_animation_ms" type="number" min="0" max="5000" step="50" value="<?php echo esc_attr( $s['content_animation_ms'] ); ?>" class="small-text" aria-label="Animation length in milliseconds"> ms
							<p class="description">How each event, posting, or book enters within its block.</p>
						</td>
					</tr>
				</table>
				<p class="description">Categories can override the default duration (Signage → Categories).</p>
				<?php submit_button( 'Save settings' ); ?>
			</form>
		</div>
		<?php
	}

	public static function save_settings(): void {
		if ( ! current_user_can( Plugin::CAPABILITY ) ) {
			wp_die( 'Not allowed.' );
		}
		check_admin_referer( 'wots_signage_save_settings' );
		$fields = array( 'aspect', 'poll_interval', 'default_image_duration', 'default_item_duration', 'default_video_duration', 'brand_color', 'block_transition', 'transition_ms', 'content_animation', 'content_animation_ms' );
		$input  = array();
		foreach ( $fields as $field ) {
			if ( isset( $_POST[ $field ] ) ) {
				$input[ $field ] = sanitize_text_field( wp_unslash( $_POST[ $field ] ) );
			}
		}
		Settings::update( $input );
		wp_safe_redirect( admin_url( 'admin.php?page=' . self::SLUG . '-settings&updated=1' ) );
		exit;
	}

	public static function rotate_key(): void {
		if ( ! current_user_can( Plugin::CAPABILITY ) ) {
			wp_die( 'Not allowed.' );
		}
		check_admin_referer( 'wots_signage_rotate_key' );
		update_option( Player_Route::KEY_OPTION, wp_generate_password( 32, false ), false );
		wp_safe_redirect( admin_url( 'admin.php?page=' . self::SLUG . '-settings' ) );
		exit;
	}

	private static function template_select( int $selected ): void {
		echo '<select name="wots_default_template" id="wots_default_template"><option value="0">None (built-in layout)</option>';
		foreach ( Templates::summaries() as $t ) {
			printf(
				'<option value="%d" %s>%s (%s)</option>',
				(int) $t['id'],
				selected( $selected, (int) $t['id'], false ),
				esc_html( $t['title'] ),
				esc_html( $t['source_label'] )
			);
		}
		echo '</select>';
	}

	/**
	 * "Default duration" and "Default template" fields on the category screens.
	 */
	public static function register_category_fields(): void {
		$tax = PostTypes::CATEGORY;

		add_action(
			"{$tax}_add_form_fields",
			static function () {
				?>
				<div class="form-field">
					<label for="wots_default_duration">Default duration (seconds)</label>
					<input type="number" min="0" name="wots_default_duration" id="wots_default_duration" value="">
					<p>Used by blocks in this category that don't set their own duration. Leave blank for the global default.</p>
				</div>
				<div class="form-field">
					<label for="wots_default_template">Default template</label>
					<?php self::template_select( 0 ); ?>
					<p>Dynamic blocks in this category use this template when they don't pick one.</p>
				</div>
				<?php
				wp_nonce_field( 'wots_signage_category', 'wots_signage_category_nonce' );
			}
		);

		add_action(
			"{$tax}_edit_form_fields",
			static function ( \WP_Term $term ) {
				$value = (int) get_term_meta( $term->term_id, '_default_duration', true );
				?>
				<tr class="form-field">
					<th scope="row"><label for="wots_default_template">Default template</label></th>
					<td>
						<?php self::template_select( (int) get_term_meta( $term->term_id, '_default_template_id', true ) ); ?>
						<p class="description">Dynamic blocks in this category use this template when they don't pick one, if it's built for the same data source.</p>
					</td>
				</tr>
				<tr class="form-field">
					<th scope="row"><label for="wots_default_duration">Default duration (seconds)</label></th>
					<td>
						<input type="number" min="0" name="wots_default_duration" id="wots_default_duration" value="<?php echo $value ? esc_attr( (string) $value ) : ''; ?>">
						<p class="description">Used by blocks in this category that don't set their own duration. Leave blank for the global default.</p>
						<?php wp_nonce_field( 'wots_signage_category', 'wots_signage_category_nonce' ); ?>
					</td>
				</tr>
				<?php
			}
		);

		$save = static function ( int $term_id ) {
			if ( ! isset( $_POST['wots_signage_category_nonce'] ) || ! current_user_can( Plugin::CAPABILITY ) ) {
				return;
			}
			if ( ! wp_verify_nonce( sanitize_text_field( wp_unslash( $_POST['wots_signage_category_nonce'] ) ), 'wots_signage_category' ) ) {
				return;
			}
			$template = isset( $_POST['wots_default_template'] ) ? absint( $_POST['wots_default_template'] ) : 0;
			if ( $template > 0 && PostTypes::TEMPLATE === get_post_type( $template ) ) {
				update_term_meta( $term_id, '_default_template_id', $template );
			} else {
				delete_term_meta( $term_id, '_default_template_id' );
			}

			$value = isset( $_POST['wots_default_duration'] ) ? absint( $_POST['wots_default_duration'] ) : 0;
			if ( $value > 0 ) {
				update_term_meta( $term_id, '_default_duration', $value );
			} else {
				delete_term_meta( $term_id, '_default_duration' );
			}
		};
		add_action( "created_{$tax}", $save );
		add_action( "edited_{$tax}", $save );
	}
}
