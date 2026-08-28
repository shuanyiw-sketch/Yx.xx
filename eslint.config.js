module.exports = [
  {
    ignores: ['node_modules/**', 'outputs/**', 'work/**', '.worktrees/**'],
  },
  {
    files: ['**/*.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'commonjs',
      globals: {
        App: 'readonly',
        Component: 'readonly',
        Page: 'readonly',
        beforeEach: 'readonly',
        console: 'readonly',
        describe: 'readonly',
        expect: 'readonly',
        getApp: 'readonly',
        it: 'readonly',
        module: 'readonly',
        process: 'readonly',
        require: 'readonly',
        vi: 'readonly',
        wx: 'readonly'
      }
    },
    rules: {
      'no-unused-vars': ['error', { argsIgnorePattern: '^_' }]
    }
  }
];
