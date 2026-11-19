// punchCore 단위 시험 (에뮬레이터 없이): 혼자 퇴근(alone) → ⚠, 확인받은 퇴근 → ✓
import test from 'node:test';
import assert from 'node:assert/strict';
import { punchCore } from './core.js';

function fakeDb(init) {
  const m = new Map(Object.entries(init));
  return {
    m,
    get: async p => m.get(p) || null,
    create: async (p, d) => { if (m.has(p)) throw Object.assign(new Error('x'), { code: 'already-exists' }); m.set(p, d); },
    set: async (p, d) => { m.set(p, d); },
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
