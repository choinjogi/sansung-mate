// Cloudflare 서버 판 (무료, 카드 필요 없음). 출퇴근 기록·매장 와이파이 등록·주소 확인 페이지.
// 처리 내용은 ../functions/core.js 를 Firebase 판과 같이 쓴다. 이 파일은 Cloudflare에 연결하는 부분만.
//   POST /punch         { storeId, kind, geo, alone }   (Authorization: Bearer <Firebase 로그인 토큰>)
//   POST /registerWifi  { storeId, reset }
//   GET  /myIp          주소 확인 페이지
// 회선 주소는 Cloudflare가 붙여 주는 CF-Connecting-IP (보내는 쪽이 위조할 수 없음)
import { punchCore, registerWifiCore, myIpPage, Fail } from '../functions/core.js';
import { normIp } from '../functions/lib.js';
import { verifyIdToken, firestore } from './google.js';

const CODES = { unauthenticated: 401, 'permission-denied': 403, 'invalid-argument': 400, 'failed-precondition': 400, 'already-exists': 409 };
const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'POST, GET, OPTIONS', 'Access-Control-Allow-Headers': 'Authorization, Content-Type', 'Access-Control-Max-Age': '86400' };
const out = (status, body) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' } });

export default {
  async fetch(request, env) {
    const url = new URL(request.url), emu = env.EMULATOR === '1';
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
    const realIp = normIp(request.headers.get('CF-Connecting-IP') || '');
    if (url.pathname === '/myIp') {
      return new Response(myIpPage(realIp, 'Cloudflare'), { headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' } });
    }
    const fn = { '/punch': punchCore, '/registerWifi': registerWifiCore }[url.pathname];
    if (!fn || request.method !== 'POST') return out(404, { ok: false, code: 'not-found', message: '없는 주소예요' });
    try {
      let body = {};
      try { body = await request.json(); } catch (e) { throw new Fail('invalid-argument', '요청 모양이 틀렸어요'); }
      const token = (request.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
      const uid = await verifyIdToken(token, { projectId: env.PROJECT_ID, emulator: emu });
      // 연습용 서버에서만 시험용 주소를 받음. 보내는 쪽이 정할 수 있는 칸은 storeId·kind·geo·alone·reset 뿐
      const ip = (emu && body._testIp) || realIp;
      const data = await fn(firestore(env), { storeId: body.storeId, kind: body.kind, geo: body.geo, alone: body.alone, reset: body.reset, uid, ip });
      return out(200, { ok: true, data });
    } catch (e) {
      if (e instanceof Fail) return out(CODES[e.code] || 400, { ok: false, code: e.code, message: e.message });
      console.error(e);
      return out(500, { ok: false, code: 'internal', message: '서버 오류가 났어요. 잠시 뒤에 다시 해 주세요' });
    }
  },
};
