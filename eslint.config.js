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
    /* Apps Script: los servicios de Google y las funciones que viven en otros archivos del mismo proyecto (no en este repositorio) */
    files: ['backend/**/*.gs', 'comentarios/**/*.gs'],
    languageOptions: { ecmaVersion: 2020, sourceType: 'script', globals: { ContentService: 'readonly', PropertiesService: 'readonly', LockService: 'readonly', SpreadsheetApp: 'readonly', MailApp: 'readonly', Utilities: 'readonly', DriveApp: 'readonly', UrlFetchApp: 'readonly', ScriptApp: 'readonly', Session: 'readonly', Logger: 'readonly', computeFileSha256: 'readonly', extractTextFromDriveFileId: 'readonly', processDocumentWithDriveOcr: 'readonly', parseReceipt: 'readonly' } },
    rules: { 'no-undef': 'error', 'no-unreachable': 'error', 'no-dupe-keys': 'error', 'no-redeclare': 'error' }
  },
  {
    /* WebApi.gs llama a callCloudVision_, que se define en CloudOcrAdapter.gs; ese archivo no la declara como global */
    files: ['backend/WebApi.gs'],
    languageOptions: { globals: { callCloudVision_: 'readonly' } }
  },
  {
    /* pruebas de Apps Script para la hoja de prueba: se pegan junto a comentarios/Comentarios.gs */
    files: ['test/apps-script/**/*.gs'],
    languageOptions: { ecmaVersion: 2020, sourceType: 'script', globals: { SpreadsheetApp: 'readonly', Logger: 'readonly', COMENTARIOS: 'readonly', doPost: 'readonly', hoja_: 'readonly' } },
    rules: { 'no-undef': 'error', 'no-redeclare': 'error' }
  },
  {
    files: ['test/**/*.mjs', 'tools/**/*.mjs'],
    languageOptions: { ecmaVersion: 2022, sourceType: 'module', globals: { ...globals.node, ...globals.browser, RF: 'writable' } },
    rules: { 'no-undef': 'error', 'no-unreachable': 'error', 'no-dupe-keys': 'error' }
  }
];
