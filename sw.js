const CACHE = 'taxi-v15';
// Tout ce qu'il faut pour fonctionner sans internet, polices comprises.
const FICHIERS = ['./', 'index.html', 'style.css', 'app.js', 'meter.js', 'donnees.js', 'recu.js', 'couleur.js', 'manifest.webmanifest',
  'icons/icon-192.png', 'icons/icon-512.png', 'icons/apple-touch-icon.png',
  'fonts/archivo-400-latin-ext.woff2','fonts/archivo-400-latin.woff2','fonts/archivo-black-400-latin-ext.woff2','fonts/archivo-black-400-latin.woff2','fonts/chakra-petch-500-latin-ext.woff2','fonts/chakra-petch-500-latin.woff2','fonts/chakra-petch-600-latin-ext.woff2','fonts/chakra-petch-600-latin.woff2','fonts/chakra-petch-700-latin-ext.woff2','fonts/chakra-petch-700-latin.woff2','fonts/fonts.css','fonts/manrope-500-latin-ext.woff2','fonts/manrope-500-latin.woff2','fonts/share-tech-mono-400-latin.woff2'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(FICHIERS)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});
// Réseau d'abord (mises à jour), cache si hors ligne.
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  e.respondWith(fetch(e.request, { cache: 'no-cache' }).then((r) => {
    const copie = r.clone(); caches.open(CACHE).then((c) => c.put(e.request, copie)); return r;
  }).catch(() => caches.match(e.request, { ignoreSearch: true })));
});
