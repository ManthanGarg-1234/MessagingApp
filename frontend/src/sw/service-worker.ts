/// <reference lib="webworker" />
declare const self: ServiceWorkerGlobalScope;

import { precacheAndRoute } from "workbox-precaching";
import { registerRoute } from "workbox-routing";
import { NetworkFirst, CacheFirst, StaleWhileRevalidate } from "workbox-strategies";
import { ExpirationPlugin } from "workbox-expiration";

// webpack's InjectManifest plugin replaces this with the actual list of
// hashed build assets at build time — precache = installable, offline app shell.
precacheAndRoute(self.__WB_MANIFEST);

// App shell / static assets: cache-first (fast repeat loads, rarely change since hashed).
registerRoute(
  ({ request }) => request.destination === "script" || request.destination === "style",
  new CacheFirst({ cacheName: "static-resources" })
);

// API calls: network-first so users see fresh data online, with a cache fallback offline.
registerRoute(
  ({ url }) => url.pathname.startsWith("/api/conversations"),
  new NetworkFirst({
    cacheName: "api-cache",
    plugins: [new ExpirationPlugin({ maxEntries: 100, maxAgeSeconds: 60 * 60 })],
  })
);

// Media downloads: stale-while-revalidate to balance freshness and offline access.
registerRoute(
  ({ url }) => url.pathname.startsWith("/api/media"),
  new StaleWhileRevalidate({ cacheName: "media-cache" })
);

/**
 * Background sync outbox: when a message is sent while offline, the app writes
 * it to an IndexedDB "outbox" store (see wsClient outbox). On reconnect, the
 * client flushes the outbox via POST /api/conversations/:id/messages (idempotent
 * by clientMsgId), so this SW mainly guarantees the app shell stays usable offline.
 */
self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});
