// 근무표 자동 짜기 시험: 예전 시트 엔진(assign_)과 결과가 같은지 + 산성 규칙
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { assign, autoSchedule, historyOf, wasOverflow, SCHED_DEFAULT, applyAlbaTarget, isWork } from '../../multi/autosched.js';
const { assign_ } = createRequire(import.meta.url)('./fixtures/old-assign.cjs');

const DATES = ['2026-10-12', '2026-10-13', '2026-10-14', '2026-10-15', '2026-10-16', '2026-10-17', '2026-10-18'];
let seed = 7; const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);

function randomCase() {
  const n = 5 + Math.floor(rnd() * 6);
  const al = Array.from({ length: n }, (_, k) => ({
    name: 'a' + k, codes: Array.from({ length: 7 }, () => (rnd() < 0.25 ? 'X' : '')),
    minDays: rnd() < 0.3 ? 4 : 3, priority: rnd() < 0.2, amOk: { 5: rnd() < 0.3, 6: rnd() < 0.3 },
  }));
  const jungCnt = [4, 3, 4, 4, 5, 5, 4].map(x => x - (rnd() < 0.15 ? 1 : 0));
  const cfg = applyAlbaTarget(SCHED_DEFAULT, jungCnt);
  const hist = Object.fromEntries(al.map(p => [p.name, Math.round(rnd() * 16) / 4]));
  return { al, jungCnt, cfg, hist };
}
const key = r => r.map(l => `${l.p.name}:${l.day}:${l.am ? 'am' : 'ev'}`).sort().join(',');
const clone = al => al.map(p => ({ ...p, codes: [...p.codes], amOk: { ...p.amOk } }));

test('배정 결과가 예전 시트 엔진과 같다 (무작위 300주)', () => {
  for (let t = 0; t < 300; t++) {
    const { al, jungCnt, cfg, hist } = randomCase();
    assert.equal(key(assign(clone(al), jungCnt, cfg, hist)), key(assign_(clone(al), jungCnt, cfg, hist)), '경우 ' + t);
  }
});

// 산성 10/12 주 모양: 정 그룹 5명(고정휴무), 알바 8명
const JUNG = [['홍사장', '사장', ['월']], ['김매니', '매니', ['화']], ['이주방', '주방', ['수']], ['박반직', '반직', ['화']], ['최고정', '고정', ['목', '일']]];
const ALBA = [['한가람', '가람', 4, true], ['오나래', '나래', 4, true], ['알바셋', '셋'], ['알바넷', '넷'], ['알바닷', '닷'], ['알바엿', '엿'], ['알바칠', '칠'], ['알바팔', '팔']];
const people = () => [
  ...JUNG.map(([name, disp, offDays], i) => ({ id: 'j' + i, name, disp, group: '정', offDays })),
  ...ALBA.map(([name, disp, minDays, priority], i) => ({ id: 'a' + i, name, disp, group: '알', minDays: minDays || null, priority: !!priority })),
];
const CFG = { ...SCHED_DEFAULT, pairs: [['최고정', '이주방'], ['박반직', '이주방'], ['홍사장', '김매니']] };

test('정 그룹 고정휴무 → 월~목 알바 4명, 최소출근일 보장, 과인원 없음', () => {
  const r = autoSchedule({ people: people(), cells: {}, dates: DATES, cfg: CFG });
  assert.equal(r.ok, true);
  const P = people(), col = i => P.map(p => ({ p, c: r.cells[p.id][i] }));
  const jung = i => col(i).filter(x => x.p.group === '정' && x.c === 'O').length, alba = i => col(i).filter(x => x.p.group === '알' && x.c === 'O').length;
  assert.deepEqual([0, 1, 2, 3].map(alba), [4, 4, 4, 4]);
  assert.deepEqual([0, 1, 2, 3].map(jung), [4, 3, 4, 4]);
  for (let i = 0; i < 7; i++) { const t = jung(i) + alba(i); assert.ok(t >= CFG.min[i] || i < 4, `${i} 최소`); }
  P.filter(p => p.group === '알').forEach(p => assert.ok(r.cells[p.id].filter(isWork).length >= (p.minDays || 3), p.name));
  assert.ok(!r.msgs.some(m => m.text.includes('과인원')));
  assert.equal(r.cells.j0[0], 'X');   // 홍사장 월 고정휴무
});

test('동시휴무 금지 위반이면 멈춘다', () => {
  const r = autoSchedule({ people: people(), cells: { j2: ['', '', '', 'X', '', '', ''] }, dates: DATES, cfg: CFG }); // 주방 목 휴무 + 고정 알바 목 고정휴무
  assert.equal(r.ok, false);
  assert.match(r.msgs[0].text, /목요일 최고정·이주방/);
});

test('정 그룹이 직접 고친 칸은 그대로 둔다', () => {
  const r = autoSchedule({ people: people(), cells: { j3: ['', 'O', '', '', '', '', ''] }, dates: DATES, cfg: CFG }); // 반직원 화(고정휴무)에 출근
  assert.equal(r.cells.j3[1], 'O');
});

test('휴무신청 ✕ 반영 + 인원 부족일엔 단톡 공지 멘트', () => {
  const off = Object.fromEntries(ALBA.map((_, i) => ['a' + i, { off: i < 6 ? ['2026-10-12'] : [] }])); // 월 6명 불가 → 가능 2명
  const r = autoSchedule({ people: people(), cells: {}, leaves: off, dates: DATES, cfg: CFG });
  ALBA.slice(0, 6).forEach((_, i) => assert.equal(r.cells['a' + i][0], 'X'));
  const n = r.msgs.find(m => m.kind === 'notice');
  assert.ok(n, '공지 있음');
  assert.match(n.text, /10\/12\(월\) 저녁 근무 인원이 2명 부족/);
  assert.match(n.text, /가람, 나래/);
});

test('오전은 오전 가능한 사람만, 최소출근일 때문에 넘치면 과인원 순서대로', () => {
  // 토·금 빼고 대부분 불가 → 최소출근일 채우려면 상한을 넘겨야 함
  const leaves = {}; ALBA.forEach((_, i) => { leaves['a' + i] = { off: ['2026-10-12', '2026-10-13', '2026-10-14', '2026-10-18'], am: i === 0 ? ['토'] : [] }; });
  const r = autoSchedule({ people: people(), cells: {}, leaves, dates: DATES, cfg: CFG });
  ALBA.forEach((_, i) => { if (i) assert.notEqual(r.cells['a' + i][5], '오전'); });
  assert.ok(r.msgs.some(m => m.text.includes('과인원')));
  assert.ok(r.msgs.some(m => m.text.includes('1주 연속')));
});

test('지난 4주 기록 · 과인원 주 판단', () => {
  const h = historyOf([{ cells: { a0: ['O', 'O', '', '', '', '', ''] } }, { cells: { a0: ['O', '', '', '', '', '', ''] } }], id => ({ a0: '한가람' }[id]));
  assert.equal(h['한가람'], 0.75);
  const P = people(), cells = {}; P.forEach(p => { cells[p.id] = ['O', 'O', 'O', 'O', 'O', 'O', 'O']; });
  assert.equal(wasOverflow({ cells }, P, CFG), true);
  assert.equal(wasOverflow({ cells: {} }, P, CFG), false);
});
