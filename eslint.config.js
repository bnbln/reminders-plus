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
]);
