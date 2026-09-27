/*
 * Map tile cache for the vehicles ground station (registered with scope
 * /iot-control-center/vehicles/). Only requests to the tile hosts below are
 * touched; everything else goes straight to the network.
 *
 * Tiles are served cache-first, so a field without internet still shows every
 * area viewed or pre-fetched before. Requests are made with CORS (all hosts
 * send Access-Control-Allow-Origin) so the cache stores real responses rather
 * than opaque ones, which browsers count at several MB each against quota.
 */
const CACHE = "gcs-tiles-v1";
const HOSTS = ["wmts.nlsc.gov.tw", "server.arcgisonline.com", "tile.openstreetmap.org"];
const MAX_ENTRIES = 20000;

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

function isTile(url) {
  try {
    return HOSTS.includes(new URL(url).hostname);
  } catch {
    return false;
  }
}

async function fromCacheOrNetwork(url) {
  const cache = await caches.open(CACHE);
  const hit = await cache.match(url);
  if (hit) return hit;
  const res = await fetch(url, { mode: "cors", credentials: "omit" });
  if (res.ok && res.type === "cors") await cache.put(url, res.clone());
  return res;
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET" || !isTile(request.url)) return;
  event.respondWith(fromCacheOrNetwork(request.url).catch(() => fetch(request)));
});

async function trim() {
  const cache = await caches.open(CACHE);
  const keys = await cache.keys();
  const extra = keys.length - MAX_ENTRIES;
  for (let i = 0; i < extra; i++) await cache.delete(keys[i]);
}

// Pre-fetch: { type: "prefetch", urls: [...] } → progress messages back.
self.addEventListener("message", (event) => {
  const data = event.data || {};
  const port = event.ports && event.ports[0];
  if (data.type === "prefetch" && Array.isArray(data.urls)) {
    event.waitUntil(
      (async () => {
        let done = 0;
        let failed = 0;
        const urls = data.urls.filter(isTile);
        const queue = urls.slice();
        async function worker() {
          while (queue.length) {
            const url = queue.shift();
            try {
              await fromCacheOrNetwork(url);
            } catch {
              failed++;
            }
            done++;
            if (port && done % 25 === 0) port.postMessage({ done, failed, total: urls.length });
          }
        }
        await Promise.all([worker(), worker(), worker(), worker()]);
        await trim();
        if (port) port.postMessage({ done, failed, total: urls.length, finished: true });
      })()
    );
  } else if (data.type === "stats" && port) {
    event.waitUntil(caches.open(CACHE).then((c) => c.keys()).then((keys) => port.postMessage({ entries: keys.length })));
  } else if (data.type === "clear" && port) {
    event.waitUntil(caches.delete(CACHE).then(() => port.postMessage({ cleared: true })));
  }
});
