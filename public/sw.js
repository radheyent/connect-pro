const CACHE = 'connect-pro-v1';
const ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/icon.svg',
];

// Install: cache core assets
self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting())
  );
});

// Activate: clean old caches
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

// Push: show native notification when server sends a push
self.addEventListener('push', e => {
  let data = {};
  try { data = e.data ? e.data.json() : {}; } catch (err) { data = { title: 'Connect Pro', body: e.data ? e.data.text() : '' }; }

  const title = data.title || 'Connect Pro';
  const options = {
    body: data.body || '',
    icon: data.icon || '/icon-192.png',
    badge: '/icon-192.png',
    data: { url: data.url || '/' },
    vibrate: [200, 100, 200],
    tag: data.tag || undefined,
    renotify: !!data.tag,
  };

  e.waitUntil(self.registration.showNotification(title, options));
});

// Notification click: focus existing tab or open a new one
self.addEventListener('notificationclick', e => {
  e.notification.close();
  const rawUrl = (e.notification.data && e.notification.data.url) || '/';
  const destUrl = new URL(rawUrl, self.location.origin).href;

  e.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(async clientsArr => {
      const existing = clientsArr.find(c => c.url.startsWith(self.location.origin));
      if (existing) {
        try {
          await existing.focus();
          if ('navigate' in existing) {
            await existing.navigate(destUrl);
            return;
          }
        } catch (err) {
          // navigate not supported/failed — fall through to opening a new window
        }
      }
      return self.clients.openWindow(destUrl);
    })
  );
});

// Fetch: network first, fallback to cache
self.addEventListener('fetch', e => {
  // Skip non-GET and Supabase API calls (always need fresh data)
  if (e.request.method !== 'GET') return;
  if (e.request.url.includes('supabase.co')) return;
  if (e.request.url.includes('/api/')) return;

  e.respondWith(
    fetch(e.request)
      .then(res => {
        // Cache successful responses
        if (res.ok) {
          const clone = res.clone();
          caches.open(CACHE).then(c => c.put(e.request, clone));
        }
        return res;
      })
      .catch(() =>
        // Offline: serve from cache or fallback to index.html
        caches.match(e.request).then(cached => cached || caches.match('/index.html'))
      )
  );
});
