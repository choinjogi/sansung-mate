// 폰 알림 시험: node --test worker/push.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { leaveWindowNow, dueKind, runCron } from './push.js';

const kst = s => Date.parse(s + '+09:00');
const SET = { opensBeforeMin: 4320, closesBeforeMin: 1560 };   // 기본: 금 0시 열림, 토 22시 마감 (월요일 0시 기준)

test('대상 주 = 다음 주 월요일, 열림 금 0시 · 마감 토 22시', () => {
  const w = leaveWindowNow(kst('2026-11-20T10:00:00'), SET);   // 금요일
  assert.equal(w.week, '2026-11-23');
  assert.equal(w.opens, kst('2026-11-20T00:00:00'));
  assert.equal(w.closes, kst('2026-11-21T22:00:00'));
  assert.equal(leaveWindowNow(kst('2026-11-23T01:00:00'), SET).week, '2026-11-30');   // 월요일 새벽 → 그다음 주
});
test('보낼 때: 열림 뒤 30분 안·마감 1시간 전, 같은 주는 한 번만', () => {
  assert.deepEqual(dueKind(kst('2026-11-20T00:05:00'), SET), { kind: 'open', week: '2026-11-23' });
  assert.equal(dueKind(kst('2026-11-20T00:35:00'), SET), null);
  assert.equal(dueKind(kst('2026-11-20T00:05:00'), SET, { open: '2026-11-23' }), null);
  assert.deepEqual(dueKind(kst('2026-11-21T21:10:00'), SET), { kind: 'remind', week: '2026-11-23' });
  assert.equal(dueKind(kst('2026-11-21T22:00:00'), SET), null);
  assert.equal(dueKind(kst('2026-11-21T20:50:00'), SET), null);
  assert.equal(dueKind(kst('2026-11-21T21:10:00'), null), null);
});

function fakeDb(docs) {
  const m = new Map(Object.entries(docs));
  return {
    m,
    get: async p => m.get(p) || null,
    set: async (p, d) => { m.set(p, d); },
    del: async p => { m.delete(p); },
    list: async p => [...m.entries()].filter(([k]) => k.startsWith(p + '/') && !k.slice(p.length + 1).includes('/')).map(([k, v]) => ({ id: k.split('/').pop(), ...v })),
  };
}
async function env() {
  const k = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
  const j = await crypto.subtle.exportKey('jwk', k.privateKey);
  return { VAPID_PRIVATE: JSON.stringify({ kty: j.kty, crv: j.crv, x: j.x, y: j.y, d: j.d }), VAPID_PUBLIC: 'PUB' };
}

test('cron: 마감 1시간 전엔 안 낸 알바에게만, 서명된 빈 알림, 없어진 구독은 지움, 두 번 안 보냄', async () => {
  const db = fakeDb({
    'stores/st1': { name: '시험' },
    'stores/st1/settings/leave': SET,
    'stores/st1/members/a1': { status: 'active', type: '알', name: '안냄' },
    'stores/st1/members/a2': { status: 'active', type: '알', name: '냄' },
    'stores/st1/members/j1': { status: 'active', type: '정', name: '정직원' },
    'stores/st1/members/a3': { status: 'active', type: '알', name: '퇴사', leaveDate: '2026-11-01' },
    'stores/st1/leaves/2026-11-23_a2': { off: [] },
    'stores/st1/push/a1_x': { uid: 'a1', endpoint: 'https://push.example/ok' },
    'stores/st1/push/a1_y': { uid: 'a1', endpoint: 'https://push.example/gone' },
    'stores/st1/push/a2_x': { uid: 'a2', endpoint: 'https://push.example/a2' },
    'stores/st1/push/j1_x': { uid: 'j1', endpoint: 'https://push.example/j1' },
  });
  const calls = [], real = globalThis.fetch;
  globalThis.fetch = async (url, o) => { calls.push({ url, auth: o.headers.Authorization, len: o.headers['Content-Length'] }); return new Response(null, { status: url.endsWith('gone') ? 410 : 201 }); };
  try {
    const e = await env(), now = kst('2026-11-21T21:05:00');
    const r = await runCron(e, db, now);
    assert.equal(r.length, 1); assert.equal(r[0].kind, 'remind'); assert.equal(r[0].target, 1); assert.equal(r[0].sent, 1);
    assert.deepEqual(calls.map(c => c.url).sort(), ['https://push.example/gone', 'https://push.example/ok']);
    assert.match(calls[0].auth, /^vapid t=[\w-]+\.[\w-]+\.[\w-]+, k=PUB$/);
    assert.equal(calls[0].len, '0');
    assert.equal(db.m.has('stores/st1/push/a1_y'), false);                       // 없어진 구독 지움
    assert.equal(db.m.get('stores/st1/settings/pushMsg').title, '1시간 뒤 신청 닫힘');
    assert.equal((await runCron(e, db, now + 60e3)).length, 0);                   // 같은 주 두 번 안 보냄
    calls.length = 0;
    const o = await runCron(e, db, kst('2026-11-27T00:03:00'));                  // 다음 주 열림 = 알바 전원(퇴사·정직원 빼고)
    assert.equal(o[0].kind, 'open'); assert.equal(o[0].target, 2);
    assert.deepEqual(calls.map(c => c.url).sort(), ['https://push.example/a2', 'https://push.example/ok']);
  } finally { globalThis.fetch = real; }
});
