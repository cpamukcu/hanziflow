/* sw.js — offline cache. CACHE_ID is stamped by tools/stamp_sw.mjs; run `npm run stamp` before committing. */
const CACHE_ID = "hanziflow-v2-fc7526c66f";
const SHELL = [
  "./", "index.html", "assets/theme.css", "vendor/chart.umd.min.js", "vendor/pinyin-pro.min.js", "vendor/hanzi-writer.min.js",
  "data/dictionary.js", "js/lookup.js", "js/srs.js", "js/sync.js", "js/app.js", "data/hsk-content.js", "js/lesson-core.js", "js/lessons.js",
  "manifest.webmanifest", "assets/icons/logo-96.png", "assets/icons/favicon-32.png", "assets/icons/apple-touch-icon.png"
];
self.addEventListener("install", e => {
  // cache: "reload" skips the browser's HTTP cache, so a new version never stores stale files.
  e.waitUntil(caches.open(CACHE_ID).then(c => c.addAll(SHELL.map(u => new Request(u, { cache: "reload" }))))
    .then(() => self.skipWaiting()));
});
self.addEventListener("activate", e => {
  e.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k.startsWith("hanziflow-") && k !== CACHE_ID).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});
/* Stroke-order data from jsDelivr lives in its own cache so it survives app updates. */
const STROKES = "hzw-strokes-v1", STROKE_PREFIX = "https://cdn.jsdelivr.net/npm/hanzi-writer-data@";
/* The app's own small files (page, scripts, styles) are network-first, so an update shows on the very
 * next open; offline or on a slow network (> 4 s) the cached copy is used. The large dictionary files,
 * libraries and icons stay cache-first; anything fetched later (the 11 MB full dictionary) is kept. */
const CACHE_FIRST = /\/(data|vendor|assets\/icons)\//;
function networkFirst(req) {
  const key = req.url.split("?")[0]; // one cached copy per file, whatever ?v= the page asked for
  const net = fetch(req, { cache: "no-cache" }).then(res => {
    if (res.ok) { const copy = res.clone(); caches.open(CACHE_ID).then(c => c.put(key, copy)); }
    return res;
  });
  const cached = () => caches.match(key);
  const slow = new Promise(r => setTimeout(r, 4000)).then(cached).then(hit => hit || net);
  return Promise.race([net.catch(() => cached().then(hit => hit || Promise.reject())), slow])
    .catch(() => cached());
}
self.addEventListener("fetch", e => {
  if (e.request.method === "GET" && e.request.url.startsWith(STROKE_PREFIX)) {
    e.respondWith(caches.open(STROKES).then(c => c.match(e.request).then(hit => hit || fetch(e.request).then(res => {
      if (res.ok) c.put(e.request, res.clone());
      return res;
    }))));
    return;
  }
  if (e.request.method !== "GET" || new URL(e.request.url).origin !== location.origin) return;
  if (!CACHE_FIRST.test(new URL(e.request.url).pathname)) { e.respondWith(networkFirst(e.request)); return; }
  e.respondWith(caches.match(e.request, { ignoreSearch: true }).then(hit => hit || fetch(e.request).then(res => {
    if (res.ok) { const copy = res.clone(); caches.open(CACHE_ID).then(c => c.put(e.request, copy)); }
    return res;
  })));
});
