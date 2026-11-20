// 새 앱(multi) 폰 알림 받기. 서버는 빈 알림만 보냄 → 서버에서 그 매장의 최근 알림 글을 받아 띄움 (산성 앱과 같은 방식)
// 매장 ID는 앱이 Cache Storage "mate-multi-meta"의 "store"에 적어 둠 (notify.js)
const SERVER = 'https://mate-server.choinjogi.workers.dev';
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));
self.addEventListener('push', e => {
  e.waitUntil((async () => {
    let sid = '', m = null;
    try { const r = await (await caches.open('mate-multi-meta')).match('store'); sid = r ? await r.text() : ''; } catch (x) {}
    try { m = await (await fetch(`${SERVER}/pushMsg?s=${encodeURIComponent(sid)}&t=${Date.now()}`)).json(); } catch (x) {}
    m = m && m.title ? m : { title: 'MATE', body: '새 소식이 있어요. 앱을 열어 확인해 주세요.' };
    await self.registration.showNotification(m.title, { body: m.body, icon: '../icons/icon-192.png', badge: '../icons/icon-192.png', tag: 'mate', renotify: true });
  })());
});
self.addEventListener('notificationclick', e => {
  e.notification.close();
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(cs => {
    const c = cs.find(x => x.url.indexOf(self.registration.scope) === 0); return c ? c.focus() : self.clients.openWindow('./');
  }));
});
