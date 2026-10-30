// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');

module.exports = defineConfig([
  expoConfig,
  {
    ignores: ['dist/*'],
  },
  {
    // TypeScript already resolves namespace members; the import plugin
    // cannot follow expo-notifications' compiled `export *` enums.
    rules: {
      'import/namespace': 'off',
    },
  },
  {
    // React-Compiler-Regeln aus eslint-config-expo 58. Bestehender Code verletzt
    // sie an einigen Stellen; bis das aufgeraeumt ist, nur als Warnung, damit CI
    // echte Fehler blockiert, aber nicht an diesen Altlasten haengt.
    rules: {
      'react-hooks/set-state-in-effect': 'warn',
      'react-hooks/refs': 'warn',
      'react-hooks/immutability': 'warn',
      'react-hooks/purity': 'warn',
      'react-hooks/preserve-manual-memoization': 'warn',
    },
  },
]);
