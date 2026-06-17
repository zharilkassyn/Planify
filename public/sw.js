const CACHE_NAME = 'planify-v1';

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(clients.claim()));

// Open the app when user taps a notification
self.addEventListener('notificationclick', e => {
  e.notification.close();
  e.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
      for (const c of list) {
        if ('focus' in c) return c.focus();
      }
      return clients.openWindow('/');
    })
  );
});

// Handle server-sent push events (future use)
self.addEventListener('push', e => {
  if (!e.data) return;
  const { title, body, tag } = e.data.json();
  e.waitUntil(
    self.registration.showNotification(title, { body, tag: tag || 'planify' })
  );
});
