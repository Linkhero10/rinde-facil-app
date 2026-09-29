/* Reglas mínimas para atrapar errores reales (variables sin declarar, código inalcanzable, comparaciones raras).
   Los scripts de la app son clásicos (sin módulos): comparten el espacio global RF. */
import globals from 'globals';

const appGlobals = { RF: 'writable', parseReceipt: 'readonly' };

export default [
  { ignores: ['vendor/**', 'node_modules/**', 'test/private/**'] },
  {
    files: ['js/**/*.js', 'sw.js'],
    languageOptions: { ecmaVersion: 2020, sourceType: 'script', globals: { ...globals.browser, ...globals.serviceworker, ...appGlobals } },
    rules: { 'no-undef': 'error', 'no-unreachable': 'error', 'no-dupe-keys': 'error', 'no-dupe-args': 'error', 'no-redeclare': 'error', 'no-self-assign': 'error', 'no-unsafe-finally': 'error', 'use-isnan': 'error', 'valid-typeof': 'error', 'no-cond-assign': 'error', 'no-func-assign': 'error', 'no-const-assign': 'error', 'no-empty': ['warn', { allowEmptyCatch: true }], 'no-unused-vars': ['warn', { args: 'none', caughtErrors: 'none' }] }
  },
  {
    files: ['backend/**/*.gs'],
    languageOptions: { ecmaVersion: 2020, sourceType: 'script', globals: { ContentService: 'readonly', PropertiesService: 'readonly', LockService: 'readonly', Utilities: 'readonly', DriveApp: 'readonly', UrlFetchApp: 'readonly', ScriptApp: 'readonly', Session: 'readonly', Logger: 'readonly', callCloudVision_: 'readonly' } },
    rules: { 'no-undef': 'error', 'no-unreachable': 'error', 'no-dupe-keys': 'error', 'no-redeclare': 'error' }
  },
  {
    files: ['test/**/*.mjs', 'tools/**/*.mjs'],
    languageOptions: { ecmaVersion: 2022, sourceType: 'module', globals: { ...globals.node, ...globals.browser, RF: 'writable' } },
    rules: { 'no-undef': 'error', 'no-unreachable': 'error', 'no-dupe-keys': 'error' }
  }
];
