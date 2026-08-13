/* FastTrack service worker.
 *
 * Two jobs: keep the shell available offline, and host the reminder
 * notifications (they only fire from an installed PWA).
 *
 * Cache strategy is network-first for the shell so a deploy is picked up
 * on the next online load — a stale-first cache on a single-file app means
 * shipping a fix the user never sees.
 */
"use strict";

var VERSION = "ft-2.5.0";
var SHELL = [
  "./",
  "./index.html",
  "./assets/icon-192.png",
  "./assets/icon-512.png",
  "./assets/manifest.webmanifest"
];

self.addEventListener("install", function (e) {
  e.waitUntil(
    caches.open(VERSION).then(function (c) {
      // don't let one 404 (e.g. a renamed asset) abort the whole install
      return Promise.all(SHELL.map(function (u) {
        return c.add(u).catch(function () { return null; });
      }));
    }).then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener("activate", function (e) {
  e.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.map(function (k) {
        return k === VERSION ? null : caches.delete(k);
      }));
    }).then(function () { return self.clients.claim(); })
  );
});

self.addEventListener("fetch", function (e) {
  var req = e.request;
  if (req.method !== "GET") return;
  var url = new URL(req.url);
  // Google Fonts is the only allowed external host; let it go to network
  // and fall back to cache so an offline launch still has a usable face.
  if (url.origin !== location.origin) {
    e.respondWith(
      fetch(req).then(function (res) {
        var copy = res.clone();
        caches.open(VERSION).then(function (c) { c.put(req, copy); });
        return res;
      }).catch(function () { return caches.match(req); })
    );
    return;
  }
  /* Bypass the browser HTTP cache for our own code and shell.
   *
   * A plain fetch() here can be satisfied from the HTTP cache, which means a
   * deployed fix is invisible until that entry expires — the exact failure
   * this network-first strategy exists to avoid. It bit during development:
   * a stale app.js kept being served after the source had changed.
   * Vercel also sends no-cache for these paths; this makes it not depend on
   * the host getting that right. */
  var isCode = /\.(?:js|html)$|\/$/.test(url.pathname);
  var request = isCode ? new Request(req, { cache: "no-store" }) : req;

  e.respondWith(
    fetch(request).then(function (res) {
      var copy = res.clone();
      caches.open(VERSION).then(function (c) { c.put(req, copy); });
      return res;
    }).catch(function () {
      return caches.match(req).then(function (hit) {
        return hit || caches.match("./index.html");
      });
    })
  );
});

/* ---- reminders ----
 * The page posts the schedule; the worker holds the timers. A worker can be
 * killed at any time, so the page re-posts its schedule on every load —
 * treat these timers as best-effort, never as a guarantee. The in-app banner
 * is the floor that does not depend on any of this.
 */
var timers = [];

function clearTimers() {
  timers.forEach(function (t) { clearTimeout(t); });
  timers = [];
}

function msUntil(hhmm) {
  var parts = String(hhmm || "08:00").split(":");
  var now = new Date();
  var target = new Date(now);
  target.setHours(Number(parts[0]) || 8, Number(parts[1]) || 0, 0, 0);
  if (target <= now) target.setDate(target.getDate() + 1);
  return target - now;
}

self.addEventListener("message", function (e) {
  var d = e.data || {};
  if (d.type === "schedule") {
    clearTimers();
    if (!d.enabled) return;

    if (d.weighIn) {
      timers.push(setTimeout(function () {
        self.registration.showNotification("FastTrack", {
          body: "שקילת בוקר — לפני אוכל ושתייה.",
          tag: "ft-weigh", icon: "./assets/icon-192.png", badge: "./assets/icon-192.png",
          dir: "rtl", lang: "he"
        });
      }, msUntil(d.weighIn)));
    }

    if (isFinite(d.fastTargetInMs) && d.fastTargetInMs > 0) {
      timers.push(setTimeout(function () {
        self.registration.showNotification("FastTrack", {
          body: "הגעת ליעד הצום.",
          tag: "ft-target", icon: "./assets/icon-192.png", badge: "./assets/icon-192.png",
          dir: "rtl", lang: "he"
        });
      }, d.fastTargetInMs));
    }
  }
  if (d.type === "cancel") clearTimers();
});

self.addEventListener("notificationclick", function (e) {
  e.notification.close();
  e.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(function (list) {
      for (var i = 0; i < list.length; i++) {
        if ("focus" in list[i]) return list[i].focus();
      }
      if (self.clients.openWindow) return self.clients.openWindow("./index.html");
    })
  );
});
