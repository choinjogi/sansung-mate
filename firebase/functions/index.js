// 산성 MATE 서버 함수 (Firebase Blaze 요금제 필요, 사용량은 무료 한도 안)
// punch: 출퇴근 찍기. 요청이 매장 와이파이(등록한 회선 주소)에서 왔는지 서버가 확인하고 기록한다.
//        직원은 출퇴근 기록을 직접 쓸 수 없고(권한 규칙), 반드시 이 함수를 거친다.
// registerWifi: 사장님이 매장 와이파이에 붙은 채로 누르면 지금 회선 주소를 매장 와이파이로 등록.
import { onCall, onRequest, HttpsError } from 'firebase-functions/v2/https';
import { initializeApp } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { clientIp, sameNet, kst, prevDate, distM, judge } from './lib.js';

initializeApp();
const db = getFirestore();
const REGION = 'asia-northeast3'; // 서울
const EMU = process.env.FUNCTIONS_EMULATOR === 'true';
const opts = { region: REGION, cors: true, maxInstances: 5 };

// 연습용 서버에서만: 시험에서 "매장 와이파이 / 다른 회선"을 흉내 내려고 주소를 바꿔 넣을 수 있음
const ipOf = req => (EMU && req.data && req.data._testIp) || clientIp(req.rawRequest);

function need(cond, msg, code = 'failed-precondition') { if (!cond) throw new HttpsError(code, msg); }

export const punch = onCall(opts, async req => {
  need(req.auth, '다시 로그인해 주세요', 'unauthenticated');
  const uid = req.auth.uid, { storeId, kind, geo } = req.data || {};
  need(typeof storeId === 'string' && /^[a-z0-9]{3,30}$/.test(storeId), '매장 정보가 없어요', 'invalid-argument');
  need(kind === 'in' || kind === 'out', '출근/퇴근을 골라 주세요', 'invalid-argument');

  const store = db.doc(`stores/${storeId}`);
  const [mem, wifiDoc, placeDoc] = await Promise.all([
    store.collection('members').doc(uid).get(), store.collection('settings').doc('wifi').get(), store.collection('settings').doc('place').get(),
  ]);
  need(mem.exists && mem.data().status === 'active', '이 매장 직원으로 승인된 뒤에 찍을 수 있어요', 'permission-denied');

  const ip = ipOf(req);
  const wifi = ((wifiDoc.exists && wifiDoc.data().ips) || []).some(x => sameNet(x, ip));
  const place = placeDoc.exists ? placeDoc.data() : null;
  let dist = null, acc = null;
  if (geo && typeof geo.lat === 'number' && typeof geo.lng === 'number' && Math.abs(geo.lat) <= 90 && Math.abs(geo.lng) <= 180) {
    acc = typeof geo.acc === 'number' ? Math.round(geo.acc) : null;
    if (place) dist = distM(place, geo);
  }
  const radius = (place && place.radius) || 100;
  const { flag, why } = judge(kind, wifi, dist, radius);

  // 근무 날짜: 한국 시각 기준. 퇴근은 자정을 넘겨도 전날 출근에 붙임
  const now = new Date(), t = kst(now);
  let date = t.date;
  const id = (d, k) => `${d}_${uid}_${k}`;
  const punches = store.collection('punches');
  if (kind === 'out' && t.hour < 12) {
    const y = prevDate(t.date);
    const [todayIn, yIn, yOut] = await Promise.all([punches.doc(id(t.date, 'in')).get(), punches.doc(id(y, 'in')).get(), punches.doc(id(y, 'out')).get()]);
    if (!todayIn.exists && yIn.exists && !yOut.exists) date = y;
  }

  const doc = {
    uid, name: mem.data().name, date, kind, at: FieldValue.serverTimestamp(), via: 'app', by: uid,
    wifi, dist, acc, flag, why, ip, reviewed: false,
  };
  try {
    await punches.doc(id(date, kind)).create(doc);
  } catch (e) {
    if (e.code === 6) throw new HttpsError('already-exists', kind === 'in' ? '오늘 출근은 이미 찍었어요' : '오늘 퇴근은 이미 찍었어요. 잘못 찍었으면 매니저에게 말해 주세요');
    throw e;
  }
  return { date, kind, wifi, dist, flag, why, time: `${String(t.hour).padStart(2, '0')}:${String(t.min).padStart(2, '0')}` };
});

export const registerWifi = onCall(opts, async req => {
  need(req.auth, '다시 로그인해 주세요', 'unauthenticated');
  const { storeId, reset } = req.data || {};
  need(typeof storeId === 'string' && /^[a-z0-9]{3,30}$/.test(storeId), '매장 정보가 없어요', 'invalid-argument');
  const s = await db.doc(`stores/${storeId}`).get();
  need(s.exists && (s.data().ownerUids || []).includes(req.auth.uid), '매장 사장님만 등록할 수 있어요', 'permission-denied');
  const ip = ipOf(req);
  need(ip, '회선 주소를 알 수 없어요');
  const ref = db.doc(`stores/${storeId}/settings/wifi`);
  const old = reset ? [] : ((await ref.get()).data() || {}).ips || [];
  const ips = old.some(x => sameNet(x, ip)) ? old : [...old, ip].slice(-3); // 최근 3개까지 (와이파이가 둘이거나 주소가 바뀐 경우)
  await ref.set({ ips, updatedAt: FieldValue.serverTimestamp() });
  return { count: ips.length, added: ips !== old, ip };
});

// 와이파이 확인용 페이지: 폰 브라우저로 열면 서버가 본 회선 주소를 보여 준다 (로그인 필요 없음, 본인 주소만 보임)
// 매장 와이파이로 연 폰들은 같은 주소, 모바일 데이터로 연 폰은 다른 주소가 나와야 정상
export const myIp = onRequest({ region: REGION, maxInstances: 2 }, (req, res) => {
  const ip = clientIp(req), xff = String(req.headers['x-forwarded-for'] || '');
  const e = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  res.set('Cache-Control', 'no-store').type('html').send(`<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>회선 주소 확인</title><body style="font-family:sans-serif;padding:24px;line-height:1.6">
<p>서버가 본 이 폰의 회선 주소</p><h1 style="font-size:30px;word-break:break-all">${e(ip || '알 수 없음')}</h1>
<p style="color:#888;font-size:13px">x-forwarded-for: ${e(xff || '(없음)')}</p></body>`);
});
