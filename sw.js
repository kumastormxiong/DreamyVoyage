const CACHE_NAME = 'dreamy-v1';
const ASSETS = [
  './index.html',
  './style.css',
  './main.js',
  './cover.png'
];

// 安装阶段：拉取静态外壳
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS))
  );
});

// fetch 阶段：Stale-While-Revalidate 静态资源，网络劫持音频
self.addEventListener('fetch', (event) => {
  event.respondWith(
    caches.match(event.request).then((response) => {
      return response || fetch(event.request);
    })
  );
});
