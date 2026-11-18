// 산성 MATE 서비스 워커: 화면 파일만 저장해 두고(빠르게 열기), 데이터는 항상 새로 받는다
const CACHE = 'mate-v5';
const FILES = ['./', './index.html', './app.js', './data-demo.js', './manifest.webmanifest', './icons/icon-192.png', './icons/icon-512.png', './icons/icon-maskable-512.png', './icons/apple-touch-icon.png', './icons/emblem.png',
  './img/deco.png', './img/calli-line.png', './img/bear-grill.png', './img/bear-eat.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;  // 구글 서버 데이터는 건드리지 않음
  // 새 버전 우선, 안 되면(인터넷 끊김) 저장해 둔 화면
  e.respondWith(fetch(e.request).then(r => {
    const copy = r.clone(); caches.open(CACHE).then(c => c.put(e.request, copy)); return r;
  }).catch(() => caches.match(e.request)));
});
