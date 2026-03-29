// Harvest Time Church of Baytown — Service Worker
const CACHE_NAME = 'htcb-v2';
const SUPABASE_URL = 'https://cgkmibegfxlhoapxofvl.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNna21pYmVnZnhsaG9hcHhvZnZsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM2Mjg1NjcsImV4cCI6MjA4OTIwNDU2N30.3SjIE5Dd64J-DIWbqe77-kPFM9K-GeYZgLWtvy_UjE4';

// Install — cache shell
self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(['/']))
  );
  self.skipWaiting();
});

// Activate — clean old caches
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys => Promise.all(
      keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))
    ))
  );
  self.clients.claim();
});

// Fetch — network first, cache fallback
self.addEventListener('fetch', e => {
  e.respondWith(
    fetch(e.request).then(r => {
      const clone = r.clone();
      caches.open(CACHE_NAME).then(cache => cache.put(e.request, clone));
      return r;
    }).catch(() => caches.match(e.request))
  );
});

// Periodic badge check (runs when browser allows)
async function checkBadge() {
  try {
    const lastAnn = await getLastCheck('ann');
    const lastMsg = await getLastCheck('msg');
    const lastPray = await getLastCheck('pray');

    const [anns, msgs, prays] = await Promise.all([
      fetchCount('ht_announcements', lastAnn),
      fetchCount('ht_messages', lastMsg),
      fetchCount('ht_prayer_wall', lastPray)
    ]);

    const total = anns + msgs + prays;

    if ('setAppBadge' in navigator && total > 0) {
      navigator.setAppBadge(total);
    }

    // Notify clients to update dots
    const clients = await self.clients.matchAll();
    clients.forEach(client => {
      client.postMessage({ type: 'BADGE_UPDATE', anns, msgs, prays, total });
    });
  } catch (e) {
    console.log('Badge check err', e);
  }
}

async function fetchCount(table, since) {
  try {
    const r = await fetch(
      `${SUPABASE_URL}/rest/v1/${table}?select=id&created_at=gt.${since}&limit=100`,
      { headers: { 'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + SUPABASE_KEY } }
    );
    const data = await r.json();
    return Array.isArray(data) ? data.length : 0;
  } catch { return 0; }
}

async function getLastCheck(key) {
  // Use a simple approach — store in indexedDB-like via cache API
  try {
    const cache = await caches.open('htcb-timestamps');
    const r = await cache.match('/ts-' + key);
    if (r) return await r.text();
  } catch {}
  return '2000-01-01T00:00:00Z';
}

// Listen for messages from the app
self.addEventListener('message', e => {
  if (e.data === 'CHECK_BADGE') checkBadge();
  if (e.data && e.data.type === 'CLEAR_BADGE') {
    if ('clearAppBadge' in navigator) navigator.clearAppBadge();
  }
  if (e.data && e.data.type === 'SET_TIMESTAMP') {
    caches.open('htcb-timestamps').then(cache => {
      cache.put('/ts-' + e.data.key, new Response(e.data.value));
    });
  }
});

// Periodic sync (if browser supports it)
self.addEventListener('periodicsync', e => {
  if (e.tag === 'htcb-badge-check') {
    e.waitUntil(checkBadge());
  }
});
