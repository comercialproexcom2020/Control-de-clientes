import js from '@eslint/js';
import tsParser from '@typescript-eslint/parser';
import tsPlugin from '@typescript-eslint/eslint-plugin';

export default [
  { ignores: ['dist/**', 'node_modules/**'] },
  js.configs.recommended,
  {
    files: ['scripts/**/*.mjs'],
    languageOptions: { globals: { process: 'readonly' } },
  },
  {
    files: ['src/**/*.ts', 'src/**/*.tsx', 'test/**/*.ts'],
    languageOptions: { parser: tsParser, parserOptions: { ecmaVersion: 'latest', sourceType: 'module', ecmaFeatures: { jsx: true } }, globals: { console: 'readonly', fetch: 'readonly', Request: 'readonly', Response: 'readonly', URL: 'readonly', Intl: 'readonly', Map: 'readonly', Error: 'readonly', process: 'readonly' } },
    plugins: { '@typescript-eslint': tsPlugin },
    rules: { ...tsPlugin.configs.recommended.rules, 'no-undef': 'off' },
  },
];
