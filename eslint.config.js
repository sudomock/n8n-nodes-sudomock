const tsParser = require('@typescript-eslint/parser');

// Flat config for ESLint v9. Scoped to the node/credential TypeScript sources.
// Kept intentionally light: the goal is a green, structurally-valid lint pass,
// not the full eslint-plugin-n8n-nodes-base ruleset (which would be a new dependency).
module.exports = [
	{
		ignores: ['dist/**', 'node_modules/**', 'gulpfile.js'],
	},
	{
		files: ['nodes/**/*.ts', 'credentials/**/*.ts'],
		languageOptions: {
			parser: tsParser,
			ecmaVersion: 2022,
			sourceType: 'module',
		},
		linterOptions: {
			reportUnusedDisableDirectives: 'off',
		},
		rules: {
			'no-unused-vars': 'off',
			'no-undef': 'off',
		},
	},
];
