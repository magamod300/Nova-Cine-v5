/* NovaCine Service Worker
   v5.5.4: stale-while-revalidate para assets est\u00e1ticos (carga instant\u00e1nea + auto-refresh).
   HTML sigue siendo network-first (updates inmediatos). */
const CACHE = 'novacine-v10';
const ASSETS = [
  './manifest.json',
  './colors_and_type.css',
  './novacine.html',
  './index.html',
  './torrent.html',
  './assets/icons/icon.svg'
];

self.addEventListener('install', e => {
  /* v5.4.7: cada asset se cachea por separado para que UN fallo (404) no rompa todo el install */
  e.waitUntil(
    caches.open(CACHE).then(c =>
      Promise.all(ASSETS.map(a => c.add(a).catch(err => console.warn('[SW] skip', a, err.message))))
    ).then(()=>self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(()=>self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const req = e.request;
  /* Solo cacheamos GET; POST/HEAD/etc pasan directo */
  if (req.method !== 'GET') return;
  let u;
  try { u = new URL(req.url); } catch { return; }
  if (u.origin !== location.origin) return;

  const isHtml = req.mode === 'navigate' || req.destination === 'document' ||
                 u.pathname.endsWith('.html') || u.pathname === '/' || u.pathname.endsWith('/');

  if (isHtml) {
    /* Network-first para HTML \u2014 que los updates lleguen inmediatamente */
    e.respondWith(
      fetch(req).then(res => {
        if (res && res.ok && res.type !== 'opaque'){
          const copy = res.clone();
          caches.open(CACHE).then(c => c.put(req, copy)).catch(()=>{});
        }
        return res;
      }).catch(() => caches.match(req).then(r => r || caches.match('./novacine.html') || caches.match('./index.html')))
    );
    return;
  }

  /* v5.5.4: stale-while-revalidate para assets \u2014 devuelve cach\u00e9 inmediato si existe
     + actualiza en background. P\u00e1ginas que abren m\u00e1s r\u00e1pido sin perder updates. */
  e.respondWith(
    caches.match(req).then(cached => {
      const fetchPromise = fetch(req).then(res => {
        if (res && res.ok && res.type !== 'opaque'){
          const copy = res.clone();
          caches.open(CACHE).then(c => c.put(req, copy)).catch(()=>{});
        }
        return res;
      }).catch(() => cached);
      /* Devolver cach\u00e9 inmediato si existe, pero la req sigue corriendo en background */
      return cached || fetchPromise;
    })
  );
});
