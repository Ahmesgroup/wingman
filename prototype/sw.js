/* Wingman web push SW — display only. No phone numbers, no selfies. */
self.addEventListener('install', function (event) {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', function (event) {
  event.waitUntil(self.clients.claim());
});

function looksPrivate(text) {
  var s = String(text || '');
  return /\+\d{8,}/.test(s) || /selfie/i.test(s) || /phoneE164|phoneNumber/i.test(s);
}

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
      data: { url: '/' },
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
