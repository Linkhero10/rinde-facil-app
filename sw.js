/* Rinde Fácil: guarda los archivos de la app para que abra sin conexión. Los datos del usuario NO pasan por aquí. */
var VERSION = 'rf-v3-6';
var CORE = ['./', 'index.html', 'css/app.css', 'manifest.webmanifest', 'assets/icon.svg', 'vendor/parser.js', 'js/00-service-trust.js', 'js/01-util.js', 'js/02-store.js', 'js/03-crypto.js', 'js/04-vault.js', 'js/05-auth.js', 'js/10-data.js', 'js/11-tramites.js', 'js/12-needs.js', 'js/20-logic.js', 'js/26-receipt.js', 'js/27-search.js','js/21-export.js', 'js/30-ui.js', 'js/31-forms.js', 'js/32-tools-plan.js', 'js/33-cloud.js', 'js/34-tools-gastos.js', 'js/36-drive.js', 'js/38-tools-needs.js', 'js/37-repo.js', 'js/35-flow.js', 'js/39-auth-ui.js', 'js/41-tools-share.js', 'js/42-tools-calendar.js', 'js/40-views.js', 'js/50-search.js','js/60-app.js'];
self.addEventListener('install', function (e) { e.waitUntil(caches.open(VERSION).then(function (c) { return c.addAll(CORE); }).then(function () { return self.skipWaiting(); })); });
self.addEventListener('activate', function (e) { e.waitUntil(caches.keys().then(function (ks) { return Promise.all(ks.filter(function (k) { return k !== VERSION; }).map(function (k) { return caches.delete(k); })); }).then(function () { return self.clients.claim(); })); });
self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET') return;
  var url = new URL(req.url);
  if (url.origin !== location.origin) return; /* fuentes de Google y servicio de la comunidad: directo a la red */
  e.respondWith(fetch(req, { cache: 'no-cache' }).then(function (res) { var copy = res.clone(); caches.open(VERSION).then(function (c) { c.put(req, copy); }); return res; }).catch(function () { return caches.match(req).then(function (r) { return r || caches.match('index.html'); }); }));
});
