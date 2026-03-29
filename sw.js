// Harvest Time Church of Baytown — Service Worker
const CACHE_NAME = 'htcb-v2';
let SUPABASE_URL = '';
let SUPABASE_KEY = '';

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
  if (e.request.url.includes('/api/')) return;
  e.respondWith(
    fetch(e.request).then(r => {
      const clone = r.clone();
      caches.open(CACHE_NAME).then(cache => cache.put(e.request, clone));
      return r;
    }).catch(() => caches.match(e.request))
  );
});

// Badge check
async function checkBadge() {
  if (!SUPABASE_URL || !SUPABASE_KEY) return;
  try {
    const lastAnn = await getTS('ann');
    const lastMsg = await getTS('msg');
    const lastPray = await getTS('pray');
    const [anns, msgs, prays] = await Promise.all([
      fetchCount('ht_announcements', lastAnn),
      fetchCount('ht_messages', lastMsg),
      fetchCount('ht_prayer_wall', lastPray)
    ]);
    const total = anns + msgs + prays;
    if ('setAppBadge' in navigator && total > 0) navigator.setAppBadge(total);
    const clients = await self.clients.matchAll();
    clients.forEach(client => {
      client.postMessage({ type: 'BADGE_UPDATE', anns, msgs, prays, total });
    });
  } catch (e) { /* silent */ }
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

async function getTS(key) {
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
  if (e.data && e.data.type === 'CONFIG') {
    SUPABASE_URL = e.data.supabaseUrl;
    SUPABASE_KEY = e.data.supabaseKey;
  }
  if (e.data && e.data.type === 'CLEAR_BADGE') {
    if ('clearAppBadge' in navigator) navigator.clearAppBadge();
  }
  if (e.data && e.data.type === 'SET_TIMESTAMP') {
    caches.open('htcb-timestamps').then(cache => {
      cache.put('/ts-' + e.data.key, new Response(e.data.value));
    });
  }
});

// Periodic sync
self.addEventListener('periodicsync', e => {
  if (e.tag === 'htcb-badge-check') e.waitUntil(checkBadge());
});
