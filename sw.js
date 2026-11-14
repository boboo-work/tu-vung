// Service worker: lưu sẵn toàn bộ app để chạy offline.
// Chiến lược: ưu tiên mạng (luôn nhận bản mới khi online), rớt mạng hoặc quá 3 giây thì dùng bản đã lưu.
// Khi phát hành bản mới, tăng VERSION để dọn cache cũ.
const VERSION = 'v39';
const CACHE = `tu-vung-${VERSION}`;
const ASSETS = [
  './', './index.html', './manifest.webmanifest', './css/app.css',
  './js/app.js', './js/ui.js', './js/store.js', './js/srs.js', './js/util.js', './js/study.js', './js/game.js', './js/drop.js', './js/games2.js', './js/lookup.js',
  './js/views.js', './js/views2.js', './js/io.js', './js/ai.js', './js/seed.js', './js/fx.js', './js/grammar.js', './js/writing.js', './js/reading.js',
  './content/grammar/course1.json', './content/grammar/course2.json', './content/grammar/course3.json', './content/grammar/course4.json',
  './content/writing/writing.json', './content/writing/rules.json', './content/grammar/placement.json', './content/reading/index.json', './content/reading/cam20-t1.json',
  './icons/icon-192.png', './icons/icon-512.png', './icons/apple-touch-icon.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS.map((u) => new Request(u, { cache: 'reload' })))).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return; // không đụng tới lời gọi API bên ngoài
  e.respondWith(
    (async () => {
      const cache = await caches.open(CACHE);
      const cached = await cache.match(req, { ignoreSearch: true });
      // File đã lưu sẵn chỉ được thay khi phát hành VERSION mới, để bản offline luôn đồng bộ với nhau.
      // 'no-cache': luôn hỏi lại máy chủ, không dùng bản HTTP cache cũ (GitHub Pages cho phép giữ tới 10 phút).
      const network = fetch(req.url, { cache: 'no-cache' }).then((res) => {
        if (res.ok && !cached) cache.put(req, res.clone());
        return res;
      });
      if (!cached) return network;
      network.catch(() => {});
      const timeout = new Promise((resolve) => setTimeout(() => resolve(cached), 3000));
      return Promise.race([network.catch(() => cached), timeout]);
    })()
  );
});
