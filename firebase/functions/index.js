// Firebase 서버 함수 판 (Blaze 요금제 필요). 지금은 Cloudflare 판(../worker)을 쓰고, 카드가 생기면 이쪽으로 바꿀 수 있다.
// 처리 내용은 core.js 하나를 같이 쓴다. 이 파일은 Firebase에 연결하는 부분만.
import { onCall, onRequest, HttpsError } from 'firebase-functions/v2/https';
import { initializeApp } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';
import { clientIp } from './lib.js';
import { punchCore, registerWifiCore, resetPinCore, myIpPage, NOW, Fail } from './core.js';

initializeApp();
const fs = getFirestore();
const REGION = 'asia-northeast3'; // 서울
const EMU = process.env.FUNCTIONS_EMULATOR === 'true';
const opts = { region: REGION, cors: true, maxInstances: 5 };

const fill = o => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, v === NOW ? FieldValue.serverTimestamp() : v]));
const db = {
  get: async p => { const s = await fs.doc(p).get(); return s.exists ? s.data() : null; },
  create: async (p, o) => { try { await fs.doc(p).create(fill(o)); } catch (e) { if (e.code === 6) throw new Fail('already-exists', '이미 있어요'); throw e; } },
  set: (p, o) => fs.doc(p).set(fill(o)),
  patch: (p, o) => fs.doc(p).update(fill(o)),
};
const authApi = { setPassword: (uid, password) => getAuth().updateUser(uid, { password }) };
// 연습용 서버에서만: 시험에서 "매장 와이파이 / 다른 회선"을 흉내 내려고 주소를 바꿔 넣을 수 있음
const ipOf = req => (EMU && req.data && req.data._testIp) || clientIp(req.rawRequest);
// 보내는 쪽이 정할 수 있는 칸은 이것뿐 (uid·시각·주소는 서버가 정함)
const pick = d => { d = d || {}; return { storeId: d.storeId, kind: d.kind, geo: d.geo, alone: d.alone, reset: d.reset, target: d.target }; };
const wrap = fn => async req => {
  try { return await fn(req); } catch (e) { if (e instanceof Fail) throw new HttpsError(e.code, e.message); throw e; }
};

export const punch = onCall(opts, wrap(req => punchCore(db, { ...pick(req.data), uid: req.auth && req.auth.uid, ip: ipOf(req) })));
export const registerWifi = onCall(opts, wrap(req => registerWifiCore(db, { ...pick(req.data), uid: req.auth && req.auth.uid, ip: ipOf(req) })));
export const resetPin = onCall(opts, wrap(req => resetPinCore(db, authApi, { ...pick(req.data), uid: req.auth && req.auth.uid })));
export const myIp = onRequest({ region: REGION, maxInstances: 2 }, (req, res) => {
  res.set('Cache-Control', 'no-store').type('html').send(myIpPage(clientIp(req), 'x-forwarded-for: ' + (req.headers['x-forwarded-for'] || '(없음)')));
});
