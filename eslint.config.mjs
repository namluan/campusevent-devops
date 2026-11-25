import js from '@eslint/js';
import stylistic from '@stylistic/eslint-plugin';
import simpleImportSort from 'eslint-plugin-simple-import-sort';
import globals from 'globals';

export default [
  { ignores: ['**/node_modules/', '**/build/', '**/dist/'] },
  js.configs.recommended,
  {
    files: ['services/**/*.js'],
    languageOptions: { globals: globals.node },
    plugins: { '@stylistic': stylistic, 'simple-import-sort': simpleImportSort },
    rules: {
      // Express reconnaît un gestionnaire d'erreurs à ses 4 paramètres : « next » doit rester
      // déclaré même s'il ne sert pas. Les imports et variables inutilisés restent interdits.
      'no-unused-vars': ['error', { args: 'none' }],
      curly: ['error', 'all'],
      '@stylistic/no-extra-semi': 'error',
      '@stylistic/max-len': ['error', { code: 100 }],
      'simple-import-sort/imports': 'error',
    },
  },
];
