// Cloudflare 서버 판 (무료, 카드 필요 없음). 출퇴근 기록·매장 와이파이 등록·주소 확인 페이지.
// 처리 내용은 ../functions/core.js 를 Firebase 판과 같이 쓴다. 이 파일은 Cloudflare에 연결하는 부분만.
//   POST /punch         { storeId, kind, geo, alone }   (Authorization: Bearer <Firebase 로그인 토큰>)
//   POST /registerWifi  { storeId, reset }
//   POST /resetPin      { storeId, target }   직원 번호 다시 정하기 (사장님만) → { pin, name }
//   GET  /myIp          주소 확인 페이지
//   GET  /pushMsg?s=매장  폰 알림 글 (폰이 빈 알림을 받으면 여기서 글을 받아 띄움)
//   POST /pushTest      { storeId }  내 폰에 시험 알림 (사장님·매니저)
//   cron 10분마다       휴무신청 열림·마감 1시간 전 알림 (push.js) + 당일 미출근·매일 10시 요약 (attend.js)
//   GET  /ipSig         { ip, t, sig }  예전 NFC 출퇴근용 (sig = HMAC-SHA256(IP_SECRET, ip|t))
// 회선 주소는 Cloudflare가 붙여 주는 CF-Connecting-IP (보내는 쪽이 위조할 수 없음)
import { punchCore, registerWifiCore, resetPinCore, myIpPage, Fail } from '../functions/core.js';
import { normIp } from '../functions/lib.js';
import { verifyIdToken, firestore, authAdmin } from './google.js';
import { runCron, pushTo, MSG } from './push.js';
import { runAttend } from './attend.js';

const CODES = { unauthenticated: 401, 'permission-denied': 403, 'invalid-argument': 400, 'failed-precondition': 400, 'already-exists': 409 };
const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'POST, GET, OPTIONS', 'Access-Control-Allow-Headers': 'Authorization, Content-Type', 'Access-Control-Max-Age': '86400' };
const out = (status, body) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' } });

export async function hmacHex(secret, msg) {
  const enc = new TextEncoder();
  const k = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return [...new Uint8Array(await crypto.subtle.sign('HMAC', k, enc.encode(msg)))].map(b => b.toString(16).padStart(2, '0')).join('');
}

export default {
  async scheduled(event, env, ctx) {
    const db = firestore(env);
    ctx.waitUntil(runCron(env, db).then(r => { if (r.length) console.log('알림', JSON.stringify(r)); }).catch(e => console.error('알림 실패', e)));
    ctx.waitUntil(runAttend(env, db).then(r => { if (r.length) console.log('근태 알림', JSON.stringify(r)); }).catch(e => console.error('근태 알림 실패', e)));
  },
  async fetch(request, env) {
    const url = new URL(request.url), emu = env.EMULATOR === '1';
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
    const realIp = normIp(request.headers.get('CF-Connecting-IP') || '');
    if (url.pathname === '/myIp') {
      return new Response(myIpPage(realIp, 'Cloudflare'), { headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' } });
    }
    // 예전 출퇴근(구글 Apps Script)용: 그 서버는 폰 주소를 못 보므로, 폰이 여기서 "서명된 주소"를 받아 함께 보낸다
    if (url.pathname === '/ipSig') {
      if (!env.IP_SECRET) return out(500, { ok: false, code: 'internal', message: '서명 열쇠 없음' });
      const t = Date.now();
      return out(200, { ok: true, ip: realIp, t, sig: await hmacHex(env.IP_SECRET, realIp + '|' + t) });
    }
    if (url.pathname === '/pushMsg') {
      const sid = url.searchParams.get('s') || '';
      const m = /^[a-z0-9]{3,30}$/.test(sid) ? await firestore(env).get(`stores/${sid}/settings/pushMsg`).catch(() => null) : null;
      return out(200, m ? { title: m.title, body: m.body } : {});
    }
    const fn = { '/punch': punchCore, '/registerWifi': registerWifiCore, '/resetPin': (db, a) => resetPinCore(db, authAdmin(env), a),
      '/pushTest': async (db, a) => {
        if (!/^[a-z0-9]{3,30}$/.test(a.storeId || '')) throw new Fail('invalid-argument', '매장 정보가 없어요');
        const st = await db.get(`stores/${a.storeId}`), me = await db.get(`stores/${a.storeId}/members/${a.uid}`);
        if (!st || !((st.ownerUids || []).includes(a.uid) || (me && me.status === 'active' && me.role === 'manager'))) throw new Fail('permission-denied', '사장님·매니저만 시험할 수 있어요');
        return pushTo(env, db, a.storeId, [a.uid], MSG.test);
      } }[url.pathname];
    if (!fn || request.method !== 'POST') return out(404, { ok: false, code: 'not-found', message: '없는 주소예요' });
    try {
      let body = {};
      try { body = await request.json(); } catch (e) { throw new Fail('invalid-argument', '요청 모양이 틀렸어요'); }
      const token = (request.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
      const uid = await verifyIdToken(token, { projectId: env.PROJECT_ID, emulator: emu });
      // 연습용 서버에서만 시험용 주소를 받음. 보내는 쪽이 정할 수 있는 칸은 storeId·kind·geo·alone·reset·target 뿐
      const ip = (emu && body._testIp) || realIp;
      const data = await fn(firestore(env), { storeId: body.storeId, kind: body.kind, geo: body.geo, alone: body.alone, reset: body.reset, target: body.target, uid, ip });
      return out(200, { ok: true, data });
    } catch (e) {
      if (e instanceof Fail) return out(CODES[e.code] || 400, { ok: false, code: e.code, message: e.message });
      console.error(e);
      return out(500, { ok: false, code: 'internal', message: '서버 오류가 났어요. 잠시 뒤에 다시 해 주세요' });
    }
  },
};
