/* Wingman web push SW — display only. No phone numbers, no selfies.
   ASSET_V is stamped at deploy so browsers pick up a new worker. */
var ASSET_V = 'dev';

self.addEventListener('install', function (event) {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', function (event) {
  event.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.map(function (k) { return caches.delete(k); }));
    }).then(function () {
      return self.clients.claim();
    }),
  );
});

function looksPrivate(text) {
  var s = String(text || '');
  return /\+\d{8,}/.test(s) || /selfie/i.test(s) || /phoneE164|phoneNumber/i.test(s);
}

function isAppAsset(url) {
  try {
    var u = new URL(url);
    if (u.origin !== self.location.origin) return false;
    return (
      u.pathname === '/' ||
      u.pathname === '/index.html' ||
      /\.(js|css|webmanifest|html)$/.test(u.pathname)
    );
  } catch (_) {
    return false;
  }
}

self.addEventListener('fetch', function (event) {
  var req = event.request;
  if (req.method !== 'GET') return;
  if (req.mode !== 'navigate' && !isAppAsset(req.url)) return;
  event.respondWith(
    fetch(req, { cache: 'no-store' }).catch(function () {
      return fetch(req);
    }),
  );
});

self.addEventListener('push', function (event) {
  var data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch (_) {
    data = {};
  }
  var title = 'Wingman';
  var body = data.body || data.summary || 'You have a new update';
  if (looksPrivate(body) || looksPrivate(JSON.stringify(data))) {
    body = 'You have a new update';
  }
  event.waitUntil(
    self.registration.showNotification(title, {
      body: body,
      data: { url: '/', assetV: ASSET_V },
    }),
  );
});

self.addEventListener('notificationclick', function (event) {
  event.notification.close();
  var url = (event.notification.data && event.notification.data.url) || '/';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (clients) {
      for (var i = 0; i < clients.length; i++) {
        if (clients[i].url && 'focus' in clients[i]) return clients[i].focus();
      }
      if (self.clients.openWindow) return self.clients.openWindow(url);
      return undefined;
    }),
  );
});
