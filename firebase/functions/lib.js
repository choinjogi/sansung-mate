// 서버 함수에서 쓰는 계산 (따로 떼어 둬서 시험하기 쉽게)

// 요청이 들어온 인터넷 회선 주소. 구글 서버 앞단은 x-forwarded-for 맨 뒤에 실제 주소를 붙인다.
// 맨 앞은 보내는 쪽이 마음대로 넣을 수 있어서(위조) 쓰지 않는다.
// ⏳ 실제 서버에 올린 뒤 registerWifi 결과의 주소가 매장 회선 주소와 같은지 한 번 확인할 것
export function clientIp(req) {
  const xf = String(req.headers['x-forwarded-for'] || '').split(',').map(s => s.trim()).filter(Boolean).pop() || '';
  return normIp(xf || req.ip || (req.socket && req.socket.remoteAddress) || '');
}
export function normIp(ip) {
  ip = String(ip || '').trim().toLowerCase();
  if (ip.startsWith('::ffff:') && ip.includes('.')) ip = ip.slice(7); // IPv4를 IPv6 모양으로 준 경우
  return ip;
}
// 같은 매장 회선인가. IPv4는 주소가 같아야 하고, IPv6는 폰마다 뒷부분이 달라서 앞 4칸(/64)만 비교
export function sameNet(a, b) {
  a = normIp(a); b = normIp(b);
  if (!a || !b) return false;
  if (a.includes(':') !== b.includes(':')) return false;
  if (!a.includes(':')) return a === b;
  const p = x => expand6(x).slice(0, 4).join(':');
  return p(a) === p(b);
}
function expand6(ip) {
  const [h, t = ''] = ip.split('::');
  const hs = h ? h.split(':') : [], ts = t ? t.split(':') : [];
  const mid = ip.includes('::') ? Array(8 - hs.length - ts.length).fill('0') : [];
  return [...hs, ...mid, ...ts].map(x => x.replace(/^0+(?=.)/, ''));
}

// 한국 시각 기준 날짜·시각
const KST = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
export function kst(date) {
  const o = Object.fromEntries(KST.formatToParts(date).map(p => [p.type, p.value]));
  return { date: `${o.year}-${o.month}-${o.day}`, hour: +o.hour, min: +o.minute };
}
export function prevDate(d) {
  const t = new Date(d + 'T12:00:00Z'); t.setUTCDate(t.getUTCDate() - 1);
  return t.toISOString().slice(0, 10);
}

// 두 위치 사이 거리(m)
export function distM(a, b) {
  const R = 6371000, r = x => (x * Math.PI) / 180;
  const dLat = r(b.lat - a.lat), dLng = r(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(r(a.lat)) * Math.cos(r(b.lat)) * Math.sin(dLng / 2) ** 2;
  return Math.round(2 * R * Math.asin(Math.sqrt(h)));
}

// ⚠ 판정. 출근: 매장 와이파이여야 ✓ (GPS로는 "도착 직전 찍기"를 못 잡음)
// 퇴근: 매장 와이파이이거나 매장 반경 안이면 ✓ (막을 것은 "집에 가서 늦게 찍기")
export function judge(kind, wifi, dist, radius) {
  if (wifi) return { flag: false, why: null };
  if (kind === 'out' && dist != null && dist <= radius) return { flag: false, why: null };
  return { flag: true, why: dist == null ? 'nowifi' : dist <= radius ? 'nowifi' : 'far' };
}
