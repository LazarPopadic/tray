/* Tray service worker.
   Cache-first for everything, because the whole point is that it works in airplane mode.
   Bump VERSION whenever you change any file, or the phone keeps serving the old one. */

var VERSION = "tray-v2";
var SCOPE = self.registration.scope;

var PRECACHE = [
  "", "index.html", "404.html", "tests.html", "manifest.webmanifest",
  "assets/css/styles.css",
  "assets/js/app.js",
  "assets/js/config.js",
  "assets/js/lib/macros.js",
  "assets/js/lib/dates.js",
  "assets/js/lib/store.js",
  "assets/js/lib/recommend.js",
  "assets/js/lib/streak.js",
  "assets/js/data/foods.js",
  "assets/js/data/home.js",
  "assets/js/ui/common.js",
  "assets/js/ui/today.js",
  "assets/js/ui/tray.js",
  "assets/js/ui/recipes.js",
  "assets/js/ui/calendar.js",
  "assets/js/ui/streakview.js",
  "assets/js/ui/settings.js",
  "assets/js/tests.js",
  "assets/img/icons/favicon.png",
  "assets/img/icons/icon-180.png",
  "assets/img/icons/icon-192.png",
  "assets/img/icons/icon-512.png",
  "assets/img/icons/icon-maskable-512.png"
].map(function (p) { return new URL(p, SCOPE).toString(); });

self.addEventListener("install", function (e) {
  e.waitUntil(
    caches.open(VERSION).then(function (c) {
      return Promise.allSettled(PRECACHE.map(function (u) { return c.add(u); }));
    }).then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener("activate", function (e) {
  e.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.filter(function (k) { return k !== VERSION; })
        .map(function (k) { return caches.delete(k); }));
    }).then(function () { return self.clients.claim(); })
  );
});

self.addEventListener("fetch", function (e) {
  var req = e.request;
  if (req.method !== "GET") return;
  var url = new URL(req.url);
  if (url.origin !== location.origin) return;

  e.respondWith(
    caches.match(req, { ignoreSearch: true }).then(function (hit) {
      if (hit) {
        /* Refresh in the background so the next cold start is current. */
        fetch(req).then(function (res) {
          if (res && res.ok) caches.open(VERSION).then(function (c) { c.put(req, res.clone()); });
        }).catch(function () {});
        return hit;
      }
      return fetch(req).then(function (res) {
        if (res && res.ok && res.type === "basic") {
          var copy = res.clone();
          caches.open(VERSION).then(function (c) { c.put(req, copy); });
        }
        return res;
      }).catch(function () {
        if (req.mode === "navigate") return caches.match(new URL("index.html", SCOPE).toString());
        return new Response("", { status: 504, statusText: "Offline" });
      });
    })
  );
});
