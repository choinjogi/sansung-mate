// punchCore 단위 시험 (에뮬레이터 없이): 혼자 퇴근(alone) → ⚠, 확인받은 퇴근 → ✓
import test from 'node:test';
import assert from 'node:assert/strict';
import { punchCore, resetPinCore } from './core.js';

function fakeDb(init) {
  const m = new Map(Object.entries(init));
  return {
    m,
    get: async p => m.get(p) || null,
    create: async (p, d) => { if (m.has(p)) throw Object.assign(new Error('x'), { code: 'already-exists' }); m.set(p, d); },
    set: async (p, d) => { m.set(p, d); },
    patch: async (p, d) => { if (!m.has(p)) throw new Error('없음'); m.set(p, { ...m.get(p), ...d }); },
  };
}
const base = () => fakeDb({
  'stores/st1/members/u1': { status: 'active', name: '알바' },
  'stores/st1/settings/wifi': { ips: ['1.2.3.4'] },
});
const at = new Date('2026-11-20T13:00:00Z'); // 한국 22:00

test('매장 와이파이 + 확인받은 퇴근 → ✓', async () => {
  const db = base();
  const r = await punchCore(db, { uid: 'u1', storeId: 'st1', kind: 'out', ip: '1.2.3.4', alone: false, now: at });
  assert.equal(r.flag, false); assert.equal(r.alone, false);
  assert.equal(db.m.get('stores/st1/punches/2026-11-20_u1_out').alone, false);
});
test('혼자 퇴근 → ⚠ why=alone', async () => {
  const db = base();
  const r = await punchCore(db, { uid: 'u1', storeId: 'st1', kind: 'out', ip: '1.2.3.4', alone: true, now: at });
  assert.equal(r.flag, true); assert.equal(r.why, 'alone'); assert.equal(r.alone, true);
});
test('혼자 퇴근 + 와이파이 아님 → ⚠ 와이파이 이유 유지, alone 표시', async () => {
  const db = base();
  const r = await punchCore(db, { uid: 'u1', storeId: 'st1', kind: 'out', ip: '9.9.9.9', alone: true, now: at });
  assert.equal(r.flag, true); assert.notEqual(r.why, 'alone'); assert.equal(r.alone, true);
});
test('출근에는 alone이 무시됨', async () => {
  const db = base();
  const r = await punchCore(db, { uid: 'u1', storeId: 'st1', kind: 'in', ip: '1.2.3.4', alone: true, now: at });
  assert.equal(r.flag, false); assert.equal(r.alone, false);
});

// ---------- 번호 다시 정하기 ----------
const pinDb = () => fakeDb({
  'stores/st1': { ownerUids: ['boss'] },
  'stores/st1/members/u1': { status: 'active', name: '알바', role: 'staff' },
  'stores/st1/members/mg': { status: 'active', name: '매니저', role: 'manager' },
});
const fakeAuth = () => { const set = []; return { set, setPassword: async (u, p) => { set.push([u, p]); } }; };

test('사장님이 번호 다시 정하기 → 6자리 임시 번호, 계정 비번 바뀜, pinReset 표시', async () => {
  const db = pinDb(), a = fakeAuth();
  const r = await resetPinCore(db, a, { uid: 'boss', storeId: 'st1', target: 'u1' });
  assert.match(r.pin, /^\d{6}$/); assert.equal(r.name, '알바');
  assert.deepEqual(a.set, [['u1', r.pin]]);
  const m = db.m.get('stores/st1/members/u1');
  assert.equal(m.pinReset, true); assert.equal(m.pinResetBy, 'boss'); assert.equal(m.name, '알바');
});
test('매니저·직원·다른 사람은 번호 못 바꿈, 없는 직원·사장님 계정도 거절', async () => {
  const rej = (args, code) => { const a = fakeAuth(); return assert.rejects(resetPinCore(pinDb(), a, { storeId: 'st1', ...args }), e => e.code === code).then(() => assert.equal(a.set.length, 0)); };
  await rej({ uid: 'mg', target: 'u1' }, 'permission-denied');
  await rej({ uid: 'u1', target: 'u1' }, 'permission-denied');
  await rej({ uid: 'boss', target: 'boss' }, 'permission-denied');
  await rej({ uid: 'boss', target: 'nobody' }, 'failed-precondition');
  await rej({ uid: 'boss', target: '../x' }, 'invalid-argument');
  await rej({ uid: null, target: 'u1' }, 'unauthenticated');
});
