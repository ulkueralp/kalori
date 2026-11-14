// Kalori – service worker: internetsiz açılma + su bildirimleri
const CACHE = "kalori-v3";
const FILES = ["./", "./index.html", "./manifest.json", "./icon-192.png", "./icon-512.png"];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", e => {
  const req = e.request;
  if (req.method !== "GET" || new URL(req.url).origin !== location.origin) return;
  // Önce internetten dene (güncel sürüm), olmazsa önbellekten aç
  e.respondWith(
    fetch(req).then(res => {
      const copy = res.clone();
      caches.open(CACHE).then(c => c.put(req, copy));
      return res;
    }).catch(() => caches.match(req).then(r => r || caches.match("./index.html")))
  );
});

// Sunucudan (Cloudflare Worker) gelen bildirim
self.addEventListener("push", e => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch { d = { body: e.data && e.data.text() }; }
  const meal = d.type === "meal";
  const title = d.title || "💧 Su içme zamanı!";
  e.waitUntil(self.registration.showNotification(title, {
    body: d.body || "Bir bardak su iç ve uygulamaya ekle.",
    icon: "icon-192.png",
    badge: "icon-192.png",
    tag: meal ? "kalori-meal" : "kalori-water",
    renotify: true,
    data: { url: d.url || "./" },
    // Android'de görünür, iPhone'da görünmez
    actions: meal ? [] : [{ action: "add", title: "+1 bardak içtim" }],
  }));
});

self.addEventListener("notificationclick", e => {
  e.notification.close();
  const url = e.action === "add" ? "./#su-ekle" : ((e.notification.data && e.notification.data.url) || "./");
  const target = new URL(url, self.registration.scope).href;
  const hash = new URL(target).hash;
  e.waitUntil((async () => {
    const cs = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const c of cs) {
      if (e.action === "add") c.postMessage({ type: "add-water" });
      else if (hash) c.postMessage({ type: "open", hash });
      if ("focus" in c) return c.focus();
    }
    return self.clients.openWindow(target);
  })());
});
