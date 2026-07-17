// Push notification handlers, imported by the workbox-generated /sw.js
// via `importScripts: ["/push-sw.js"]` in vite.config.ts.

self.addEventListener("push", (event) => {
  let payload = {};
  try { payload = event.data ? event.data.json() : {}; } catch { payload = { title: "86Paper", body: event.data ? event.data.text() : "" }; }
  const title = payload.title || "86Paper";
  const options = {
    body: payload.body || "",
    icon: "/icons/icon-192.png",
    badge: "/icons/icon-192.png",
    tag: payload.tag || undefined,
    data: { url: payload.url || "/employee" },
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const targetUrl = (event.notification.data && event.notification.data.url) || "/employee";
  event.waitUntil((async () => {
    const all = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const client of all) {
      try {
        const url = new URL(client.url);
        if (url.pathname.startsWith("/employee")) {
          await client.focus();
          if ("navigate" in client) await client.navigate(targetUrl);
          return;
        }
      } catch { /* ignore */ }
    }
    await self.clients.openWindow(targetUrl);
  })());
});
