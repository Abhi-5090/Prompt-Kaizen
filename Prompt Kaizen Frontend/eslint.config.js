import globals from 'globals';
import react from 'eslint-plugin-react';
import reactHooks from 'eslint-plugin-react-hooks';

/**
 * Lint config shared by both frontends.
 *
 * The point of this file is `no-undef`. Vite/esbuild do not do scope analysis,
 * so a component or helper that is used but never imported compiles cleanly
 * and throws ReferenceError only when that code path runs. It happened twice
 * here: a navbar icon that broke the nav, and an error helper that silently
 * swallowed every toast. In both cases the build was green.
 *
 * Stylistic rules are deliberately left off. This is a correctness gate, not
 * a formatting opinion, and a noisy linter is one people stop reading.
 */
export default [
  {
    files: ['src/**/*.{js,jsx}'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: { ...globals.browser, ...globals.es2021 },
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    plugins: { react, 'react-hooks': reactHooks },
    settings: { react: { version: 'detect' } },
    rules: {
      // The rules that catch real breakage.
      'no-undef': 'error',
      'react/jsx-no-undef': 'error',
      'react/jsx-uses-vars': 'error',      // stops JSX usage reading as "unused"
      'react/jsx-uses-react': 'off',       // React 17+ JSX transform
      'no-unused-vars': ['warn', {
        varsIgnorePattern: '^_',
        argsIgnorePattern: '^_',
        ignoreRestSiblings: true,
      }],
      'no-const-assign': 'error',
      'no-dupe-keys': 'error',
      'no-unreachable': 'error',
      'react-hooks/rules-of-hooks': 'error',
    },
  },
];
