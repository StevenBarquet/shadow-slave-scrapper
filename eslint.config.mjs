// eslint.config.js
import perfectionist from 'eslint-plugin-perfectionist';
import tsParser from '@typescript-eslint/parser'

export default [
  {
    files: ['**/*.ts', '**/*.tsx', '**/*.mts'],
    languageOptions: {
      // 2. Necesitas el parser de TS para que entienda tus archivos
      parser: tsParser,
      ecmaVersion: 'latest',
      sourceType: 'module',
    },
    plugins: {
      perfectionist
    },
    rules: {
      'perfectionist/sort-imports': 'error'
    }
  }
];
