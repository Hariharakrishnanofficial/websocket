module.exports = {
  root: true,
  env: { browser: true, es2020: true },
  extends: [
    'eslint:recommended',
    'plugin:react/recommended',
    'plugin:react/jsx-runtime',
    'plugin:react-hooks/recommended',
  ],
  ignorePatterns: ['dist', '.eslintrc.cjs', 'dev-dist'],
  parserOptions: { ecmaVersion: 'latest', sourceType: 'module' },
  settings: { react: { version: '18.2' } },
  plugins: ['react-refresh'],
  globals: {
    // Vite-injected build-time constants (see vite.config.js define:).
    __APP_VERSION__: 'readonly',
    __BUILD_TIME__:  'readonly',
    process:         'readonly',
  },
  rules: {
    'react/jsx-no-target-blank': 'off',
    // Internal JS-only app — runtime prop checks add bundle weight without
    // catching anything the build doesn't already catch. We standardise on
    // descriptive default args + JSDoc instead.
    'react/prop-types': 'off',
    'react-refresh/only-export-components': [
      'warn',
      { allowConstantExport: true },
    ],
  },
};
