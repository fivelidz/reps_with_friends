/* RWF app — service worker (module worker).
   Cache-first for same-origin GETs. The app is fully static + vendored
   (fonts, icons, no CDNs), so after first load it works with the network
   off — the founder's "offline app" requirement, delivered literally.

   STALE-CACHE FIX (the phone deploy note): the cache name is derived from
   version.js's BUILD_STAMP, which scripts/build-deploy.sh regenerates on
   every deploy (git hash + UTC minute). So any rebuild → new stamp → new
   cache name → old caches evicted. The SW also self-checks for updates on
   activate, and the page (a) pings registration.update() on load + every
   30 min, (b) toasts "APP UPDATED — RELOAD" on controllerchange, so old
   tabs pick the new version up instead of rotting on a dead cache. */
import { BUILD_STAMP } from "./version.js";

const CACHE = `rwf-figma-app-${BUILD_STAMP}`;
const CORE = [
  "./",
  "./index.html",
  "./app.css",
  "./app.js",
  "./app-demo.css",
  "./demo.js",
  "./daily.css",
  "./daily.js",
  "./engine.js",
  "./state.js",
  "./verify.js",
  "./version.js",
  "./figma-components.css",
  "./fonts.css",
  "./tokens.css",
  "./themes.css",
  "./manifest.webmanifest",
  "./fonts/anton-regular.woff2",
  "./fonts/inter-var.woff2",
  "./fonts/sg-var.woff2",
  "./fonts/archivo-var.woff2",
  "./fonts/jetbrains-mono-var.woff2",
  "./fonts/fredoka-var.woff2",
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
      .then(() => {
        // self-update check: fetch sw.js + its imports (version.js) with
        // cache-bypass — if a NEW build is deployed, this worker is
        // already the new one; if an older tab holds this worker, its
        // page-side update() ping is what wakes the swap. Harmless either way.
        try { self.registration?.update().catch(() => {}); } catch {}
        return Promise.resolve();
      })
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
