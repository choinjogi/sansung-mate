// 산성 MATE 서비스 워커: 화면 파일만 저장해 두고(빠르게 열기), 데이터는 항상 새로 받는다
const CACHE = 'mate-v17';
const FILES = ['./', './index.html', './app.js?v=17', './data-live.js?v=17', './manifest.webmanifest', './icons/icon-192.png', './icons/icon-512.png', './icons/icon-maskable-512.png', './icons/apple-touch-icon.png', './icons/emblem.png',
  './img/deco.png', './img/calli-line.png', './img/bear-grill.png', './img/bear-eat.png'];

self.addEventListener('install', e => {
  // 깃허브 서버가 10분 캐시를 걸어서, 설치할 때·평소에 모두 캐시 무시하고 새로 받는다
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES.map(f => new Request(f, { cache: 'reload' })))).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;  // 구글 서버 데이터는 건드리지 않음
  // 새 버전 우선, 안 되면(인터넷 끊김) 저장해 둔 화면
  e.respondWith(fetch(e.request, { cache: 'no-cache' }).then(r => {
    const copy = r.clone(); caches.open(CACHE).then(c => c.put(e.request, copy)); return r;
  }).catch(() => caches.match(e.request)));
});
