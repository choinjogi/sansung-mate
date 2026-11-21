// 근태 알림 시험: node --test worker/attend.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runAttend } from './attend.js';

const kst = s => Date.parse(s + '+09:00');
function fakeDb(docs) {
  const m = new Map(Object.entries(docs));
  return { m, get: async p => m.get(p) || null, set: async (p, d) => { m.set(p, d); }, del: async p => { m.delete(p); },
    list: async p => [...m.entries()].filter(([k]) => k.startsWith(p + '/') && !k.slice(p.length + 1).includes('/')).map(([k, v]) => ({ id: k.split('/').pop(), ...v })) };
}
async function env() {
  const k = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
  const j = await crypto.subtle.exportKey('jwk', k.privateKey);
  return { VAPID_PRIVATE: JSON.stringify({ kty: j.kty, crv: j.crv, x: j.x, y: j.y, d: j.d }), VAPID_PUBLIC: 'PUB' };
}
const base = () => ({
  'stores/st1': { name: '시험', ownerUids: ['boss'] },
  'stores/st1/rules/2026-11': { open: { startTime: '18:00', lateGraceMin: 0 }, staffing: { amStart: '12:00' } },
  'stores/st1/members/a1': { status: 'active', type: '알', name: '한가람' },
  'stores/st1/members/a2': { status: 'active', type: '알', name: '오나래' },
  'stores/st1/members/mg': { status: 'active', type: '정', role: 'manager', name: '김매니' },
  'stores/st1/members/x_1': { status: 'active', type: '정', noLogin: true, name: '홍사장' },
  'stores/st1/members/nb': { status: 'pending', type: '알', name: '신입' },
  'stores/st1/schedules/2026-11-16': { published: true, cells: { a1: ['O', 'O', '', '', '', '', ''], a2: ['O', '', '', '', '', '', ''], x_1: ['O', '', '', '', '', '', ''] } },
  'stores/st1/punches/2026-11-16_a1_in': { uid: 'a1', date: '2026-11-16', kind: 'in', at: '2026-11-16T09:10:00Z' },   // 18:10 지각
  'stores/st1/push/boss_x': { uid: 'boss', endpoint: 'https://push.example/boss' },
  'stores/st1/push/mg_x': { uid: 'mg', endpoint: 'https://push.example/mg' },
  'stores/st1/push/a1_x': { uid: 'a1', endpoint: 'https://push.example/a1' },
});

test('당일 미출근: 기준+30분 지나면 사장님·매니저에게 1인 1회, 9시대엔 안 함', async () => {
  const db = fakeDb(base()), calls = [], real = globalThis.fetch;
  globalThis.fetch = async url => { calls.push(url); return new Response(null, { status: 201 }); };
  try {
    const e = await env();
    assert.equal((await runAttend(e, db, kst('2026-11-16T18:20:00'))).length, 0);
    const r = await runAttend(e, db, kst('2026-11-16T18:31:00'));
    assert.equal(r.length, 1); assert.equal(r[0].names, '오나래'); assert.equal(r[0].sent, 2);
    assert.deepEqual(calls.sort(), ['https://push.example/boss', 'https://push.example/mg']);
    assert.match(db.m.get('stores/st1/settings/pushMsg').body, /오나래 18:00 출근인데/);
    assert.equal((await runAttend(e, db, kst('2026-11-16T18:41:00'))).length, 0);   // 같은 사람 두 번 안 보냄
  } finally { globalThis.fetch = real; }
});

test('매일 요약: 10시대 한 번, 어제 기준, 사장님만', async () => {
  const db = fakeDb(base()), calls = [], real = globalThis.fetch;
  globalThis.fetch = async url => { calls.push(url); return new Response(null, { status: 201 }); };
  try {
    const e = await env();
    const r = await runAttend(e, db, kst('2026-11-17T10:05:00'));
    const s = r.find(x => x.kind === 'summary');
    assert.equal(s.text, '미출근 1 · 지각 1 · 퇴근 없음 1 · 새 가입 1');
    assert.ok(calls.includes('https://push.example/boss') && !calls.includes('https://push.example/a1'));
    assert.equal((await runAttend(e, db, kst('2026-11-17T10:15:00'))).filter(x => x.kind === 'summary').length, 0);
  } finally { globalThis.fetch = real; }
});
