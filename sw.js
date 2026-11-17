/* sw.js — offline cache. CACHE_ID is stamped by tools/stamp_sw.mjs; run `npm run stamp` before committing. */
const CACHE_ID = "hanziflow-v2-a30344ae9e";
const SHELL = [
  "./", "index.html", "assets/theme.css", "vendor/chart.umd.min.js", "vendor/pinyin-pro.min.js", "vendor/hanzi-writer.min.js",
  "data/dictionary.js", "js/lookup.js", "js/srs.js", "js/sync.js", "js/app.js"
];
self.addEventListener("install", e => {
  e.waitUntil(caches.open(CACHE_ID).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", e => {
  e.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k.startsWith("hanziflow-") && k !== CACHE_ID).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});
/* Stroke-order data from jsDelivr lives in its own cache so it survives app updates. */
const STROKES = "hzw-strokes-v1", STROKE_PREFIX = "https://cdn.jsdelivr.net/npm/hanzi-writer-data@";
/* Cache-first; anything fetched later (the 11 MB full dictionary) is kept after its first use. */
self.addEventListener("fetch", e => {
  if (e.request.method === "GET" && e.request.url.startsWith(STROKE_PREFIX)) {
    e.respondWith(caches.open(STROKES).then(c => c.match(e.request).then(hit => hit || fetch(e.request).then(res => {
      if (res.ok) c.put(e.request, res.clone());
      return res;
    }))));
    return;
  }
  if (e.request.method !== "GET" || new URL(e.request.url).origin !== location.origin) return;
  e.respondWith(caches.match(e.request, { ignoreSearch: true }).then(hit => hit || fetch(e.request).then(res => {
    if (res.ok) { const copy = res.clone(); caches.open(CACHE_ID).then(c => c.put(e.request, copy)); }
    return res;
  })));
});
