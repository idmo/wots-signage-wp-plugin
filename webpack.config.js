const defaultConfig = require( '@wordpress/scripts/config/webpack.config' );
const path = require( 'path' );

// Three bundles: the wp-admin app, the standalone kiosk player, and the
// player's service worker (served at /signage/sw.js, see Player_Route.php).
module.exports = {
	...defaultConfig,
	entry: {
		admin: path.resolve( __dirname, 'src/admin/index.tsx' ),
		player: path.resolve( __dirname, 'src/player/index.tsx' ),
		sw: path.resolve( __dirname, 'src/sw/index.js' ),
	},
};
