const CACHE = 'echovue-drive-shell-v0.1';
const SHELL = ['./','./index.html','./app.js','./styles.css','./config.js','./manifest.webmanifest'];
self.addEventListener('install', e => e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL))));
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));
self.addEventListener('fetch', e => {
  const u = new URL(e.request.url);
  // Jangan cache respons Google Drive / OAuth atau data pasien.
  if (u.hostname.includes('googleapis.com') || u.hostname.includes('accounts.google.com')) return;
  if (e.request.method !== 'GET') return;
  e.respondWith(caches.match(e.request).then(r => r || fetch(e.request)));
});
