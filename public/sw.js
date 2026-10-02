/* 3SKRINO service worker — deliberately small.
 *  - /_next/static, fonts, icons, images → cache-first (content-hashed / immutable)
 *  - page navigations                    → network-first, cached copy when offline
 *  - /api, /admin, video, range requests → never touched
 */
const VERSION = "v1";
const STATIC = `3skrino-static-${VERSION}`;
const PAGES = `3skrino-pages-${VERSION}`;
const MAX_PAGES = 40;

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(PAGES).then((c) => c.add("/").catch(() => undefined)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith("3skrino-") && ![STATIC, PAGES].includes(k)).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

function isStatic(url, request) {
  return (
    url.pathname.startsWith("/_next/static/") ||
    url.pathname.startsWith("/_next/image") ||
    /\.(?:woff2?|ttf|otf|png|jpe?g|webp|avif|svg|ico)$/i.test(url.pathname) ||
    ["/icon", "/apple-icon", "/manifest.webmanifest"].includes(url.pathname) ||
    request.destination === "font"
  );
}

async function trim(cacheName, max) {
  const cache = await caches.open(cacheName);
  const keys = await cache.keys();
  await Promise.all(keys.slice(0, Math.max(0, keys.length - max)).map((k) => cache.delete(k)));
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET" || request.headers.has("range")) return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/api/") || url.pathname.startsWith("/admin")) return;
  if (request.destination === "video" || request.destination === "audio") return;

  if (isStatic(url, request)) {
    event.respondWith(
      caches.open(STATIC).then(async (cache) => {
        const hit = await cache.match(request);
        if (hit) return hit;
        const res = await fetch(request);
        if (res.ok) cache.put(request, res.clone());
        return res;
      }),
    );
    return;
  }

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((res) => {
          if (res.ok) {
            const copy = res.clone();
            caches.open(PAGES).then((c) => c.put(request, copy).then(() => trim(PAGES, MAX_PAGES)));
          }
          return res;
        })
        .catch(async () => (await caches.match(request)) || (await caches.match("/")) || Response.error()),
    );
  }
});
