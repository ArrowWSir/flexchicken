// Flex Chicken service worker. Only shows the kitchen's new-order
// notifications for now (phones need a service worker to show one at all);
// it does not cache pages. Phase 2 adds a "push" handler here so orders
// notify even with the admin closed.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

// Tapping a notification brings the orders board forward, or opens it.
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = new URL(event.notification.data?.url || "/admin/orders", self.location.origin).href;
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((windows) => {
      const open = windows.find((w) => w.url === target) || windows.find((w) => new URL(w.url).pathname.startsWith("/admin"));
      if (!open) return self.clients.openWindow(target);
      return open.focus().then((w) => (w && w.url !== target && "navigate" in w ? w.navigate(target) : w));
    })
  );
});
