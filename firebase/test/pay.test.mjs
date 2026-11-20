// 급여 계산 시험 (지금 산성 결산 시트 수식과 같은지): node --test test/pay.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { albaPay, fullPay, wageOf, weekNo } from '../../multi/paycalc.js';

const d = (date, h) => ({ date, min: Math.round(h * 60) });
test('주 나누기 = 1~7일, 8~14일, … 29일~', () => {
  assert.deepEqual(['2026-11-01', '2026-11-07', '2026-11-08', '2026-11-28', '2026-11-29', '2026-11-30'].map(weekNo), [0, 0, 1, 3, 4, 4]);
});
test('주휴: 15시간 이상만, 40시간 상한, 시급 × 20%', () => {
  const days = [d('2026-11-01', 8), d('2026-11-03', 8),               // 1주 16시간 → 16 × 10500 × 0.2 = 33,600
    ...[8, 9, 10, 11, 12, 13].map(n => d(`2026-11-${String(n).padStart(2, '0')}`, 7.5)), // 2주 45시간 → 40시간 → 84,000
    d('2026-11-15', 7.49), d('2026-11-16', 7.49)];                   // 3주 14.98시간 → 0
  const r = albaPay(days, 10500);
  assert.equal(Math.round(r.juhuW[0]), 33600);
  assert.equal(Math.round(r.juhuW[1]), 84000);
  assert.equal(r.juhuW[2], 0);
  assert.equal(Math.round(r.base), Math.round(r.totalMin / 60 * 10500));
  assert.equal(Math.round(r.pay), Math.round(r.base + 33600 + 84000));
});
test('주휴 없음 직원(최고정) = 주휴 0', () => {
  const r = albaPay([d('2026-11-01', 20)], 10500, { noJuhu: true });
  assert.equal(r.juhu, 0); assert.equal(r.pay, 210000);
});
test('시트 예: 25시간 29분 × 10,500 = 267,575원 (주마다 15시간 안 됨)', () => {
  const r = albaPay([d('2026-11-02', 6), d('2026-11-09', 6.4833333), d('2026-11-16', 6.5), d('2026-11-23', 6.5)], 10500);
  assert.equal(r.totalMin, 1529); assert.equal(Math.round(r.pay), 267575);
});
test('정직원 월급: 한 달 다 = 월급, 중간 퇴사 = 날짜 수만큼', () => {
  assert.equal(fullPay('2026-11', 3000000).pay, 3000000);
  assert.equal(Math.round(fullPay('2026-11', 3000000, { endDate: '2026-11-10' }).pay), 1000000);
});
test('시급 이력: 그 달 이전 가장 최근, 없으면 매장 기본', () => {
  const w = { history: [{ from: '2026-10', wage: 10030 }, { from: '2026-12', wage: 10500 }] };
  assert.equal(wageOf(w, '2026-11', null, false), 10030);
  assert.equal(wageOf(w, '2026-12', null, false), 10500);
  assert.equal(wageOf(null, '2026-11', { pay: { baseWage: 10030 } }, false), 10030);
  assert.equal(wageOf(null, '2026-11', { pay: { baseWage: 10030 } }, true), null);
});
