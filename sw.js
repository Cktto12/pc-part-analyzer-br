// GCA Promo Radar Service Worker (supports GitHub Pages background periodic sync + notification click actions)
const CACHE_TOPIC_KEY = 'gca_sw_ntfy_topic';
let activeTopic = 'alerta_deal_jz265i';
const seenMsgIds = new Set();

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SET_TOPIC' && event.data.topic) {
    activeTopic = String(event.data.topic).trim();
  }
});

self.addEventListener('periodicsync', (event) => {
  if (event.tag === 'promo-radar-sync') {
    event.waitUntil(pollNtfyForClosedTabAlerts());
  }
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = (event.notification.data && event.notification.data.url) || './';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientsArr) => {
      for (const client of clientsArr) {
        if (client.url === targetUrl && 'focus' in client) return client.focus();
      }
      if (self.clients.openWindow) return self.clients.openWindow(targetUrl);
    })
  );
});

async function pollNtfyForClosedTabAlerts() {
  if (!activeTopic) return;
  try {
    const resp = await fetch(`https://ntfy.sh/${encodeURIComponent(activeTopic)}/json?poll=1&since=15m`, {
      cache: 'no-store'
    });
    if (!resp.ok) return;
    const text = await resp.text();
    const lines = text.trim().split('\n').filter(Boolean);
    for (const ln of lines) {
      try {
        const msg = JSON.parse(ln);
        if (msg.event !== 'message' || !msg.id || seenMsgIds.has(msg.id)) continue;
        seenMsgIds.add(msg.id);
        await self.registration.showNotification(msg.title || '🔥 Nova Oferta GPU/CPU', {
          body: msg.message || '',
          tag: `gca_${msg.id}`,
          requireInteraction: true,
          data: { url: msg.click || './' }
        });
      } catch (_) {}
    }
  } catch (_) {}
}
