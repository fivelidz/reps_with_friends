/* RWF Figma Test — service worker.
   Cache-first for same-origin GETs. The app is fully static + vendored
   (fonts, icons, no CDNs), so after first load it works with the network
   off — the founder's "offline app" requirement, delivered literally. */
const CACHE = "rwf-figma-app-v4";
const CORE = [
  "./",
  "./index.html",
  "./app.css",
  "./app.js",
  "./daily.css",
  "./daily.js",
  "./engine.js",
  "./state.js",
  "./verify.js",
  "./figma-components.css",
  "./fonts.css",
  "./tokens.css",
  "./manifest.webmanifest",
  "./fonts/anton-regular.woff2",
  "./fonts/inter-var.woff2",
  "./fonts/sg-var.woff2",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/icon-maskable-512.png",
];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(CORE)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // never cache cross-origin (there is none)

  // Hash routes are same-document navigations; serve the shell.
  if (req.mode === "navigate") {
    e.respondWith(
      caches.match("./index.html").then((hit) => hit || fetch(req))
    );
    return;
  }

  e.respondWith(
    caches.match(req).then((hit) => {
      if (hit) return hit;
      return fetch(req).then((res) => {
        if (res && res.ok) {
          const clone = res.clone();
          caches.open(CACHE).then((c) => c.put(req, clone));
        }
        return res;
      });
    })
  );
});
