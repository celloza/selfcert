const js = require('@eslint/js');
const tseslint = require('@typescript-eslint/eslint-plugin');
const parser = require('@typescript-eslint/parser');
const reactHooks = require('eslint-plugin-react-hooks');

module.exports = [
  { ignores: ['dist/**','node_modules/**'] },
  js.configs.recommended,
  {
    files: ['**/*.ts','**/*.tsx'],
    languageOptions: {
      parser,
      parserOptions: { ecmaVersion: 2020, sourceType: 'module', ecmaFeatures: { jsx: true } },
      globals: {
        document: 'readonly', window: 'readonly', console: 'readonly',
        atob: 'readonly', localStorage: 'readonly', setTimeout: 'readonly',
        HTMLDivElement: 'readonly', HTMLFormElement: 'readonly', HTMLElement: 'readonly', KeyboardEvent: 'readonly'
      }
    },
    plugins: { '@typescript-eslint': tseslint, 'react-hooks': reactHooks },
    rules: {
      'no-unused-vars': 'off',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      '@typescript-eslint/no-explicit-any': 'off',
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn'
    }
  }
];
