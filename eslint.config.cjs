const wpConfig = require( '@wordpress/scripts/config/eslint.config.cjs' );

module.exports = [
	...wpConfig,
	{
		rules: {
			// TypeScript props types document component params; JSDoc @param would duplicate them.
			'jsdoc/require-param': 'off',
			// REST payloads use snake_case keys (block_id, poll_interval…).
			camelcase: [ 'error', { properties: 'never', ignoreDestructuring: true } ],
		},
	},
	{ ignores: [ 'build/**', 'vendor/**', 'node_modules/**' ] },
];
