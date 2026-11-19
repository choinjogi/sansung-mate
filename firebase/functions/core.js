// 출퇴근 서버의 핵심 처리. Cloudflare(worker/index.js)와 Firebase 함수(index.js)가 똑같이 쓴다.
// 저장소는 바깥에서 넣어 준다: db.get(path) → 문서|null, db.create(path, doc) → 이미 있으면 Fail('already-exists'),
// db.set(path, doc). 값이 NOW인 칸은 저장소가 서버 시각으로 바꿔 넣는다.
import { sameNet, kst, prevDate, distM, judge } from './lib.js';

export const NOW = Symbol('서버 시각');
export class Fail extends Error {
  constructor(code, message) { super(message); this.code = code; }
}
const need = (cond, code, msg) => { if (!cond) throw new Fail(code, msg); };
const okStore = id => typeof id === 'string' && /^[a-z0-9]{3,30}$/.test(id);

export async function punchCore(db, { uid, storeId, kind, geo, ip, now = new Date() }) {
  need(uid, 'unauthenticated', '다시 로그인해 주세요');
  need(okStore(storeId), 'invalid-argument', '매장 정보가 없어요');
  need(kind === 'in' || kind === 'out', 'invalid-argument', '출근/퇴근을 골라 주세요');
  const S = `stores/${storeId}`;
  const [mem, wifiDoc, place] = await Promise.all([db.get(`${S}/members/${uid}`), db.get(`${S}/settings/wifi`), db.get(`${S}/settings/place`)]);
  need(mem && mem.status === 'active', 'permission-denied', '이 매장 직원으로 승인된 뒤에 찍을 수 있어요');

  const wifi = ((wifiDoc && wifiDoc.ips) || []).some(x => sameNet(x, ip));
  let dist = null, acc = null;
  if (geo && typeof geo.lat === 'number' && typeof geo.lng === 'number' && Math.abs(geo.lat) <= 90 && Math.abs(geo.lng) <= 180) {
    acc = typeof geo.acc === 'number' ? Math.round(geo.acc) : null;
    if (place && typeof place.lat === 'number') dist = distM(place, geo);
  }
  const radius = (place && place.radius) || 100;
  const { flag, why } = judge(kind, wifi, dist, radius);

  // 근무 날짜: 한국 시각 기준. 퇴근은 자정을 넘겨도 전날 출근에 붙임
  const t = kst(now), id = (d, k) => `${S}/punches/${d}_${uid}_${k}`;
  let date = t.date;
  if (kind === 'out' && t.hour < 12) {
    const y = prevDate(t.date);
    const [todayIn, yIn, yOut] = await Promise.all([db.get(id(t.date, 'in')), db.get(id(y, 'in')), db.get(id(y, 'out'))]);
    if (!todayIn && yIn && !yOut) date = y;
  }
  try {
    await db.create(id(date, kind), {
      uid, name: mem.name, date, kind, at: NOW, via: 'app', by: uid, wifi, dist, acc, flag, why, ip: ip || null, reviewed: false,
    });
  } catch (e) {
    if (e.code === 'already-exists') throw new Fail('already-exists', kind === 'in' ? '오늘 출근은 이미 찍었어요' : '오늘 퇴근은 이미 찍었어요. 잘못 찍었으면 매니저에게 말해 주세요');
    throw e;
  }
  return { date, kind, wifi, dist, flag, why, time: `${String(t.hour).padStart(2, '0')}:${String(t.min).padStart(2, '0')}` };
}

export async function registerWifiCore(db, { uid, storeId, reset, ip }) {
  need(uid, 'unauthenticated', '다시 로그인해 주세요');
  need(okStore(storeId), 'invalid-argument', '매장 정보가 없어요');
  const s = await db.get(`stores/${storeId}`);
  need(s && (s.ownerUids || []).includes(uid), 'permission-denied', '매장 사장님만 등록할 수 있어요');
  need(ip, 'failed-precondition', '회선 주소를 알 수 없어요');
  const old = reset ? [] : ((await db.get(`stores/${storeId}/settings/wifi`)) || {}).ips || [];
  const has = old.some(x => sameNet(x, ip));
  const ips = has ? old : [...old, ip].slice(-3); // 최근 3개까지 (와이파이가 둘이거나 주소가 바뀐 경우)
  await db.set(`stores/${storeId}/settings/wifi`, { ips, updatedAt: NOW });
  return { count: ips.length, added: !has, ip };
}

// 와이파이 확인용 페이지 (로그인 필요 없음, 본인 주소만 보임)
export function myIpPage(ip, raw) {
  const e = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  return `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>회선 주소 확인</title><body style="font-family:sans-serif;padding:24px;line-height:1.6">
<p>서버가 본 이 폰의 회선 주소</p><h1 style="font-size:30px;word-break:break-all">${e(ip || '알 수 없음')}</h1>
<p style="color:#888;font-size:13px">${e(raw || '')}</p></body>`;
}
