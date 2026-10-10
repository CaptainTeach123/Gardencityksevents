/* Service worker: lets the app open offline and keeps events fresh when online.
 * Bump VERSION when this file's caching rules change. */
const VERSION = "v2";
const SHELL = `gc-shell-${VERSION}`;      // our own files (network first, so new events show up right away)
const LIBS = `gc-libs-${VERSION}`;        // Google Fonts (cached as they are used)

const SHELL_FILES = ["./", "index.html", "events.js", "ics.js", "manifest.webmanifest", "icons/icon-192.png", "icons/icon-512.png", "icons/icon.svg", "vendor/leaflet/leaflet.js", "vendor/leaflet/leaflet.css"];
const CDN_HOSTS = ["fonts.googleapis.com", "fonts.gstatic.com"];   // Google Fonts only

self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    const shell = await caches.open(SHELL);
    await Promise.all(SHELL_FILES.map((f) => shell.add(f).catch(() => {})));
    await self.skipWaiting();
  })());
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    for (const k of await caches.keys()) if (k !== SHELL && k !== LIBS) await caches.delete(k);
    await self.clients.claim();
  })());
});

const cacheable = (res) => res && (res.ok || res.type === "opaque");

async function networkFirst(req) {
  const cache = await caches.open(SHELL);
  try {
    const res = await Promise.race([fetch(req), new Promise((_, rej) => setTimeout(() => rej(new Error("timeout")), 4000))]);
    if (cacheable(res)) cache.put(req, res.clone());
    return res;
  } catch (_) {
    return (await cache.match(req, { ignoreSearch: true }))
      || (req.mode === "navigate" ? await cache.match("index.html") : undefined)
      || Response.error();
  }
}

async function staleWhileRevalidate(req) {
  const cache = await caches.open(LIBS);
  const hit = await cache.match(req);
  const refresh = fetch(req).then((res) => { if (cacheable(res)) cache.put(req, res.clone()); return res; }).catch(() => undefined);
  return hit || (await refresh) || Response.error();
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin === self.location.origin) event.respondWith(networkFirst(req));
  else if (CDN_HOSTS.includes(url.hostname)) event.respondWith(staleWhileRevalidate(req));
  // map tiles and everything else go straight to the network
});
