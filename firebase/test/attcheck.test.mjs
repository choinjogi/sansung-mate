// 근태 점검 시험: 스케줄과 비교 · 당일 미출근 · 매일 요약 (산성 NFC와 같은 기준)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compare, noShowNow, summaryText, planOf } from '../../multi/attcheck.js';

const at = (d, hm) => Date.parse(`${d}T${hm}:00+09:00`);
const W = '2026-11-16';   // 월요일
const M = [
  { id: 'a', name: '한가람', type: '알', status: 'active' },
  { id: 'b', name: '오나래', type: '알', status: 'active' },
  { id: 'c', name: '알바셋', type: '알', status: 'active' },
  { id: 'j', name: '이주방', type: '정', status: 'active', startTime: '11:30' },
  { id: 'x', name: '홍사장', type: '정', status: 'active', noLogin: true },
];
const sch = { published: true, cells: { a: ['O', 'O', '', '', '', '오전', ''], b: ['O', '', '', '', '', '', ''], c: ['', '', '', '', '', '', ''], j: ['O', 'O', '', '', '', '', ''], x: ['O', '', '', '', '', '', ''] },
  early: { '2026-11-17': { a: '17:00' } } };
const rules = { open: { startTime: '18:00', lateGraceMin: 0 }, staffing: { amStart: '12:00' } };
const P = [
  { uid: 'a', date: '2026-11-16', kind: 'in', atMs: at('2026-11-16', '18:05') },                  // 지각 5분, 퇴근 없음
  { uid: 'a', date: '2026-11-17', kind: 'in', atMs: at('2026-11-17', '16:50') },                  // 일찍 부름 17:00 → 지각 아님
  { uid: 'a', date: '2026-11-17', kind: 'out', atMs: at('2026-11-17', '22:00') },
  { uid: 'c', date: '2026-11-16', kind: 'in', atMs: at('2026-11-16', '18:00') },                  // 스케줄 없이 출근
  { uid: 'c', date: '2026-11-16', kind: 'out', atMs: at('2026-11-16', '22:00') },
  { uid: 'c', date: '2026-11-17', kind: 'out', atMs: at('2026-11-17', '22:00'), shift: 'sub', subFor: '오나래' }, // 대타 = 이상 아님
  { uid: 'j', date: '2026-11-16', kind: 'out', atMs: at('2026-11-16', '22:30') },                 // 정직원 퇴근만
];

test('스케줄과 비교: 지각·미출근·스케줄 외·퇴근 없음·대타·일찍 부름', () => {
  const r = compare({ members: M, schedules: { [W]: sch }, punches: P, rules, from: W, to: '2026-11-22', today: '2026-11-21' });
  const k = r.rows.map(x => `${x.date.slice(8)} ${x.name} ${x.kind}`);
  assert.deepEqual(k, [
    '16 오나래 noshow', '16 한가람 late', '16 한가람 noout', '16 알바셋 unsched',
    '17 이주방 noshow', '17 알바셋 sub', '17 한가람 early',
  ]);
  assert.ok(!r.people.some(p => p.name === '홍사장'), '근무표 전용 직원은 빼기');
  const ga = r.people.find(p => p.name === '한가람');
  assert.deepEqual([ga.sched, ga.came, ga.late, ga.lateMin, ga.early, ga.noOut], [2, 2, 1, 5, 1, 1]); // 토 오전(21일)은 오늘이라 안 셈
  assert.equal(r.people.find(p => p.name === '이주방').noShow, 1);
});

test('확정 안 된 근무표는 비교하지 않는다', () => {
  const r = compare({ members: M, schedules: { [W]: { ...sch, published: false } }, punches: P, rules, from: W, to: '2026-11-22', today: '2026-11-21' });
  assert.ok(!r.rows.some(x => x.kind === 'noshow'));
});

test('주말 오전은 12:00 기준, 일찍 부르기가 먼저', () => {
  assert.equal(planOf(sch, rules, M[0], '2026-11-21').start, '12:00');
  assert.equal(planOf(sch, rules, M[0], '2026-11-17').start, '17:00');
  assert.equal(planOf(sch, rules, M[3], '2026-11-16').start, '11:30');
});

test('당일 미출근: 기준 + 30분 지나도 기록 없는 알바만 (정직원 제외)', () => {
  const base = { members: M, sch, rules, punches: P, date: '2026-11-16' };
  assert.deepEqual(noShowNow({ ...base, nowHm: '18:29' }).map(x => x.name), []);
  assert.deepEqual(noShowNow({ ...base, nowHm: '18:30' }).map(x => x.name), ['오나래']);
  assert.deepEqual(noShowNow({ ...base, date: '2026-11-21', punches: [], nowHm: '12:30' }).map(x => x.name), ['한가람']); // 토 오전
});

test('매일 요약 문구, 확인할 게 없으면 빈 글', () => {
  const r = compare({ members: M, schedules: { [W]: sch }, punches: P, rules, from: '2026-11-16', to: '2026-11-16', today: '2026-11-17' });
  assert.equal(summaryText(r, { earlyWait: 1 }), '미출근 1 · 지각 1 · 퇴근 없음 1 · 스케줄 외 1 · 조기 출근 승인 대기 1');
  assert.equal(summaryText({ rows: [] }), '');
});
