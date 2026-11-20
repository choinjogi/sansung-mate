// 폰 알림 켜기·끄기 카드 (직원 홈, 사장님·매니저 더보기). 산성 앱 "🔔 폰 알림"과 같은 방식
//  알림 2개: 휴무신청 열림(알바 전원) · 마감 1시간 전(안 낸 알바만) — 보내는 건 Cloudflare 서버(worker/push.js)
//  구독 = stores/{매장}/push/{uid}_{주소 해시16} = { uid, endpoint, at }
import * as api from './fb.js?v=29';
import { $, toast, busy } from './ui.js?v=29';
import { PUSH_KEY } from './config.js?v=29';

const isStandalone = () => window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
const isIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent);
const keyBytes = k => { const s = atob(k.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((k.length + 3) % 4)); return Uint8Array.from(s, c => c.charCodeAt(0)); };
const supported = () => 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window && !!PUSH_KEY;
async function remember(storeId) { try { await (await caches.open('mate-multi-meta')).put('store', new Response(storeId)); } catch (e) {} }

export const pushHtml = '<div class="card"><div class="row between"><b>🔔 폰 알림</b><button class="sm" id="pushbtn">알림 받기</button></div><p class="small" id="pushst">휴무신청 열림 · 마감 1시간 전에 알려 줘요</p></div>';

export async function wirePush(store, canTest) {
  const st = $('pushst'), btn = $('pushbtn'); if (!st || !btn) return;
  remember(store.id);
  if (!supported() || (isIOS() && !isStandalone())) {
    st.textContent = isIOS() ? '아이폰은 홈 화면에 추가한 앱에서만 받을 수 있어요 (사파리 → 공유 → 홈 화면에 추가)' : '이 브라우저는 알림을 못 받아요. 크롬으로 열어 주세요.';
    btn.hidden = true; return;
  }
  const reg = await navigator.serviceWorker.ready, sub = await reg.pushManager.getSubscription();
  if (Notification.permission === 'denied') { st.textContent = '알림이 막혀 있어요. 폰 설정 → 알림에서 허용해 주세요.'; btn.hidden = true; return; }
  if (sub && Notification.permission === 'granted') {
    st.textContent = '켜짐 · 휴무신청 열림 · 마감 1시간 전';
    api.savePushSub(store.id, sub.endpoint).catch(() => {});   // 서버 목록에 계속 있게
    btn.textContent = canTest ? '시험' : '끄기'; btn.className = 'sm ghost';
    btn.onclick = () => busy(btn, async () => {
      if (canTest) { const r = await api.pushTest(store.id); return toast(r.sent ? '시험 알림을 보냈어요' : '보낼 폰이 없어요. 알림을 다시 켜 주세요'); }
      if (!confirm('알림을 끌까요?')) return;
      await api.removePushSub(store.id, sub.endpoint); await sub.unsubscribe(); toast('알림을 껐어요'); await wirePush(store, canTest);
    });
    return;
  }
  btn.onclick = () => busy(btn, async () => {
    const p = await Notification.requestPermission();
    if (p !== 'granted') { toast('알림을 허용해야 받을 수 있어요'); return wirePush(store, canTest); }
    const s = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(PUSH_KEY) });
    await api.savePushSub(store.id, s.endpoint);
    toast('알림을 켰어요'); await wirePush(store, canTest);
  });
}
