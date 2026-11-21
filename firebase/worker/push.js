// 폰 알림 (Cloudflare 서버, 10분마다 cron) — 지금 산성 앱과 같은 알림 2개
//  · 휴무신청 열림: 열리는 시각(매장 설정 settings/leave) 30분 안에 1번, 재직 알바 전원
//  · 마감 1시간 전: 마감 60분 전 ~ 마감 사이에 1번, 그 주 휴무신청을 아직 안 낸 알바만
// 빈 알림만 보내고(내용 암호화 없이), 폰(multi/sw.js)이 /pushMsg?s=매장 에서 최근 글을 받아 띄움 (산성 앱과 같은 방식)
// VAPID 열쇠: 비밀값 VAPID_PRIVATE(JWK), 공개값 VAPID_PUBLIC(base64url, multi/config.js PUSH_KEY와 같음)
const enc = new TextEncoder();
const b64u = buf => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

export const MSG = {
  open: { title: '휴무신청 열림', body: '까먹으면 책임 안짐.' },
  remind: { title: '1시간 뒤 신청 닫힘', body: '까먹으면 오히려 고맙데이' },
  test: { title: '시험 알림', body: '알림이 잘 와요!' },
};

// 지금(ms) 기준 휴무신청 대상 주(다음 주 월요일, 한국 시각) + 열림·마감 시각
export function leaveWindowNow(now, setting) {
  const k = new Date(now + 9 * 3600e3);                      // 한국 시각으로 본 날짜
  const dow = k.getUTCDay(), add = ((8 - dow) % 7) || 7;     // 다음 주 월요일까지 며칠
  const monK = Date.UTC(k.getUTCFullYear(), k.getUTCMonth(), k.getUTCDate() + add);
  const week = new Date(monK).toISOString().slice(0, 10), mon = monK - 9 * 3600e3;
  return { week, opens: mon - setting.opensBeforeMin * 60e3, closes: mon - setting.closesBeforeMin * 60e3 };
}
// 지금 보낼 알림 종류 (없으면 null). log = settings/pushLog { open: 주, remind: 주 }
export function dueKind(now, setting, log = {}) {
  if (!setting || typeof setting.opensBeforeMin !== 'number') return null;
  const w = leaveWindowNow(now, setting);
  if (now >= w.opens && now < w.opens + 30 * 60e3 && log.open !== w.week) return { kind: 'open', week: w.week };
  if (now >= w.closes - 60 * 60e3 && now < w.closes && log.remind !== w.week) return { kind: 'remind', week: w.week };
  return null;
}

let KEY = null;
async function vapidHeader(env, endpoint) {
  if (!KEY) KEY = await crypto.subtle.importKey('jwk', { ...JSON.parse(env.VAPID_PRIVATE), key_ops: ['sign'], ext: true }, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
  const aud = new URL(endpoint).origin, exp = Math.floor(Date.now() / 1000) + 12 * 3600;
  const h = b64u(enc.encode(JSON.stringify({ typ: 'JWT', alg: 'ES256' }))), p = b64u(enc.encode(JSON.stringify({ aud, exp, sub: 'https://choinjogi.github.io/sansung-mate/multi/' })));
  const sig = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, KEY, enc.encode(h + '.' + p));
  return `vapid t=${h}.${p}.${b64u(sig)}, k=${env.VAPID_PUBLIC}`;
}
// 구독 하나에 빈 알림. 없어진 구독(404·410)이면 'gone'
export async function sendPush(env, endpoint) {
  const r = await fetch(endpoint, { method: 'POST', headers: { TTL: '86400', Urgency: 'high', Authorization: await vapidHeader(env, endpoint), 'Content-Length': '0' } });
  return r.status === 404 || r.status === 410 ? 'gone' : r.ok ? 'ok' : 'fail ' + r.status;
}

// 매장 하나에 알림: 대상 uid들의 구독에 보내고, 글을 settings/pushMsg 에 남김
export async function pushTo(env, db, storeId, uids, msg) {
  await db.set(`stores/${storeId}/settings/pushMsg`, { ...msg, at: Date.now() });
  const subs = (await db.list(`stores/${storeId}/push`)).filter(s => uids.includes(s.uid));
  let ok = 0;
  for (const s of subs) {
    const r = await sendPush(env, s.endpoint).catch(e => 'fail ' + e.message);
    if (r === 'gone') await db.del(`stores/${storeId}/push/${s.id}`).catch(() => {});
    if (r === 'ok') ok++;
  }
  return { sent: ok, subs: subs.length };
}

// 휴무신청 대상 = 근무표 알 그룹 (고정 근무 알바 sgroup '정'·근무표 전용 직원은 빼기)
const isActiveAlba = (m, today) => m.status === 'active' && !m.noLogin && (m.sgroup || (m.type === '정' ? '정' : '알')) === '알' && !(m.leaveDate && m.leaveDate < today);

// cron: 매장마다 지금 보낼 알림이 있으면 보냄
export async function runCron(env, db, now = Date.now()) {
  const out = [], today = new Date(now + 9 * 3600e3).toISOString().slice(0, 10);
  for (const st of await db.list('stores')) {
    if (st.mirror) continue;   // 병행 중: 휴무신청은 예전 폼으로 받음
    const S = `stores/${st.id}`;
    const [setting, log] = await Promise.all([db.get(`${S}/settings/leave`), db.get(`${S}/settings/pushLog`)]);
    const due = dueKind(now, setting, log || {});
    if (!due) continue;
    const albas = (await db.list(`${S}/members`)).filter(m => isActiveAlba(m, today));
    let target = albas.map(m => m.id);
    if (due.kind === 'remind') {
      const sent = await Promise.all(albas.map(m => db.get(`${S}/leaves/${due.week}_${m.id}`)));
      target = albas.filter((m, i) => !sent[i]).map(m => m.id);
    }
    await db.set(`${S}/settings/pushLog`, { ...(log || {}), [due.kind]: due.week });   // 먼저 적어서 두 번 안 보냄
    const r = target.length ? await pushTo(env, db, st.id, target, MSG[due.kind]) : { sent: 0, subs: 0 };
    out.push({ store: st.id, ...due, target: target.length, ...r });
  }
  return out;
}
