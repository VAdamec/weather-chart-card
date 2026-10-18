import js from '@eslint/js';
import globals from 'globals';

export default [
  js.configs.recommended,
  {
    files: ['tests/*.spec.js'],
    languageOptions: { globals: Object.fromEntries(
      ['card', 'hass', 'harness', 'oldChart', 'makeForecasts', 'editor', 'edits', 'original'].map(name => [name, 'readonly'])
    ) },
  },
  {
    files: ['**/*.js', '**/*.mjs'],
    languageOptions: { ecmaVersion: 'latest', sourceType: 'module', globals: { ...globals.browser, ...globals.node } },
    rules: {
      'no-unused-vars': ['error', { args: 'none', varsIgnorePattern: '^_' }],
    },
  },
];
