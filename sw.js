/* sw.js — offline cache. CACHE_ID is stamped by tools/stamp_sw.mjs; run `npm run stamp` before committing. */
const CACHE_ID = "hanziflow-v2-e9b178e4b8";
const SHELL = [
  "./", "index.html", "assets/theme.css", "vendor/chart.umd.min.js", "vendor/pinyin-pro.min.js",
  "data/dictionary.js", "js/lookup.js", "js/srs.js", "js/app.js"
];
self.addEventListener("install", e => {
  e.waitUntil(caches.open(CACHE_ID).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", e => {
  e.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k.startsWith("hanziflow-") && k !== CACHE_ID).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});
/* Cache-first; anything fetched later (the 11 MB full dictionary) is kept after its first use. */
self.addEventListener("fetch", e => {
  if (e.request.method !== "GET" || new URL(e.request.url).origin !== location.origin) return;
  e.respondWith(caches.match(e.request, { ignoreSearch: true }).then(hit => hit || fetch(e.request).then(res => {
    if (res.ok) { const copy = res.clone(); caches.open(CACHE_ID).then(c => c.put(e.request, copy)); }
    return res;
  })));
});
