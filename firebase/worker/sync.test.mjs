// 병행 자동 복사(받는 쪽) 시험: 연습용 Firestore에 실제로 씀 (npm test). 다른 시험이 데이터를 지우므로 프로젝트 이름을 따로 씀
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { firestore } from './google.js';
import { syncCore, sameKey } from './sync.js';

const db = firestore({ PROJECT_ID: 'demo-sync', FIRESTORE_EMULATOR: 'http://127.0.0.1:8080' });
const S = 'stores/syncst';
const staff = [
  { name: '한가람', kind: '알바', start: '18:00', wage: 10500, bank: '시험은행', account: '000-1', email: '', disp: '가람', group: '알', offDays: [], minDays: 4, priority: true, noJuhu: false },
  { name: '오나래', kind: '알바', start: '18:00', wage: 10030, bank: '', account: '', email: '', disp: '나래', group: '정', offDays: ['목'], minDays: null, priority: false, noJuhu: true },
  { name: '박반직', kind: '반직원', start: '11:30', wage: 0, bank: '', account: '', email: '', disp: '반직', group: '정', offDays: ['화'] },
  { name: '홍사장', kind: '정직원', start: '11:30', wage: 0, disp: '홍사', group: '정', offDays: ['월'], owner: true },
];
const ms = async () => Object.fromEntries((await db.list(`${S}/members`)).map(m => [m.name, m]));

test('자동 복사: 가입 전 직원 만들기 · 근무표 · 매출 · 출퇴근 · 일찍 부름 · 지우기', async () => {
  await db.set(S, { name: '시험점', ownerUids: ['boss'] });
  await db.set(`${S}/members/real1`, { name: '한가람', role: 'staff', status: 'active', type: '알' });   // 이미 가입한 사람
  await db.set(`${S}/members/x_boss1`, { name: '홍사장', role: 'staff', status: 'active', type: '정', noLogin: true });
  await db.set(`${S}/hires/오나래`, { name: '오나래', type: '알' });
  await db.set(`${S}/schedules/2026-11-16`, { week: '2026-11-16', early: { '2026-11-20': { keep: '17:00' } } });

  const r = await syncCore(db, { storeId: 'syncst', month: '2026-11', staffChanged: true, staff,
    schedules: { '2026-11-16': { 한가람: ['O', '', '', '', '', '', ''], 오나래: ['', 'O', '', '', '', '', ''], 홍사장: ['O', '', '', '', '', '', ''], 없는사람: ['O', '', '', '', '', '', ''] } },
    sales: { '2026-11-16': 1234000 },
    punches: [
      { name: '한가람', date: '2026-11-16', full: false, in: '17:00', out: '22:30', shift: { kind: 'extra' } },
      { name: '오나래', date: '2026-11-17', full: false, in: '18:00', out: '00:30' },
      { name: '박반직', date: '2026-11-17', full: true, in: '', out: '21:00' },
      { name: '홍사장', date: '2026-11-17', full: true, in: '', out: '23:00' }] });
  assert.equal(r.made, 2); assert.deepEqual(r.missing, ['없는사람']);
  const m = await ms();
  assert.equal(m['한가람'].id, 'real1'); assert.ok(m['한가람'].priority); assert.equal(m['한가람'].minDays, 4);
  assert.ok(m['오나래'].pre); assert.equal(m['오나래'].sgroup, '정'); assert.ok(m['오나래'].noJuhu); assert.equal(m['오나래'].disp, '나래');
  assert.ok(m['박반직'].half); assert.equal(m['박반직'].type, '정');
  assert.equal(await db.get(`${S}/hires/오나래`), null);   // 입사 등록은 정리
  assert.deepEqual((await db.get(`${S}/wages/real1`)).history, [{ from: '2026-11', wage: 10500 }]);
  assert.equal((await db.get(`${S}/private/real1`)), null);   // 가입한 사람 계좌는 안 건드림
  const nr = m['오나래'].id;
  const sch = await db.get(`${S}/schedules/2026-11-16`);
  assert.deepEqual(Object.keys(sch.cells).sort(), [nr, 'real1', m['홍사장'].id].sort());
  assert.ok(sch.published); assert.equal(sch.early['2026-11-20'].keep, '17:00'); assert.equal(sch.early['2026-11-16'].real1, '17:00');
  assert.equal((await db.get(`${S}/sales/2026-11-16`)).amount, 1234000);
  const out = await db.get(`${S}/punches/2026-11-17_${nr}_out`);
  assert.equal(Date.parse(out.at), Date.parse('2026-11-18T00:30:00+09:00'));
  assert.equal((await db.get(`${S}/punches/2026-11-16_real1_out`)).shift, 'extra');
  assert.ok(await db.get(`${S}/punches/2026-11-17_${m['박반직'].id}_out`));
  assert.equal(await db.get(`${S}/punches/2026-11-17_${m['박반직'].id}_in`), null);   // 정직원·반직원 = 퇴근만
  assert.equal((await db.list(`${S}/punches`)).filter(p => p.name === '홍사장').length, 0);   // 근무표 전용은 안 넣음
  assert.ok((await db.get(S)).mirror);

  // 시트에서 고침: 한가람 정시 출근으로 → 일찍 부름 지움 / 오나래 줄 삭제 / 매출 삭제
  const r2 = await syncCore(db, { storeId: 'syncst', month: '2026-11', staffChanged: false, staff,
    punches: [{ name: '한가람', date: '2026-11-16', full: false, in: '18:00', out: '22:30' }], punchDel: [{ name: '오나래', date: '2026-11-17' }], salesDel: ['2026-11-16'] });
  assert.equal(r2.made, 0);
  const sch2 = await db.get(`${S}/schedules/2026-11-16`);
  assert.ok(!sch2.early['2026-11-16'] || !sch2.early['2026-11-16'].real1); assert.equal(sch2.early['2026-11-20'].keep, '17:00');
  assert.equal(await db.get(`${S}/punches/2026-11-17_${nr}_out`), null);
  assert.equal(await db.get(`${S}/sales/2026-11-16`), null);
  assert.equal((await db.get(`${S}/punches/2026-11-16_real1_out`)).shift, undefined);
  assert.ok((await db.get(`${S}/settings/sync`)).at);
});

test('자동 복사 열쇠 비교', () => {
  assert.ok(sameKey('abc123', 'abc123'));
  assert.ok(!sameKey('abc123', 'abc124')); assert.ok(!sameKey('', '')); assert.ok(!sameKey('abc', 'abcd'));
});
