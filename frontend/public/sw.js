/* Order reminder Web Push service worker.
 * Receives push messages, shows system notifications and routes clicks
 * to the order page. Works while the site is closed (as long as the
 * browser allows background push for this origin).
 */

const DEFAULT_URL = '/order';
const ICON_URL = '/phantom-logo-1.png';

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

function readPayload(event) {
  try {
    return event.data ? event.data.json() : {};
  } catch {
    let text = '';
    try {
      text = event.data ? event.data.text() : '';
    } catch {
      /* ignore */
    }
    return { body: text };
  }
}

self.addEventListener('push', (event) => {
  const payload = readPayload(event);
  const title = payload.title || '\u23F0 Order Reminder';
  const body =
    payload.body ||
    "Your team's order deadline is in 15 minutes. Please submit your order.";
  const url = payload.url || DEFAULT_URL;

  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      tag: payload.type || 'order-deadline-reminder',
      renotify: true,
      icon: ICON_URL,
      badge: ICON_URL,
      data: { url },
      requireInteraction: false
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = new URL(
    (event.notification.data && event.notification.data.url) || DEFAULT_URL,
    self.location.origin
  ).href;

  event.waitUntil(
    (async () => {
      const clientList = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      for (const client of clientList) {
        if ('focus' in client) {
          await client.focus();
          if ('navigate' in client && new URL(client.url).href !== target) {
            try {
              await client.navigate(target);
            } catch {
              /* cross-origin or transient failure: focused window is still useful */
            }
          }
          return;
        }
      }
      if (self.clients.openWindow) await self.clients.openWindow(target);
    })()
  );
});
