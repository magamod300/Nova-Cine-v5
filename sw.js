const CACHE = 'novacine-v7';
const ASSETS = [
  './manifest.json',
  './colors_and_type.css',
  './novacine.html',
  './index.html',
  './torrent.html',
  './assets/icons/icon.svg'
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)).then(()=>self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(()=>self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const req = e.request;
  const u = new URL(req.url);
  if (u.origin !== location.origin) return;

  const isHtml = req.mode === 'navigate' || req.destination === 'document' ||
                 u.pathname.endsWith('.html') || u.pathname === '/' || u.pathname.endsWith('/');

  if (isHtml) {
    // Network-first for HTML so updates land immediately
    e.respondWith(
      fetch(req).then(res => {
        const copy = res.clone();
        caches.open(CACHE).then(c => c.put(req, copy));
        return res;
      }).catch(() => caches.match(req).then(r => r || caches.match('./novacine.html')))
    );
    return;
  }

  // Cache-first for static assets
  e.respondWith(
    caches.match(req).then(r => r || fetch(req).then(res => {
      const copy = res.clone();
      caches.open(CACHE).then(c => c.put(req, copy));
      return res;
    }))
  );
});
