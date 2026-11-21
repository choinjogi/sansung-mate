// 월말 출력 시험: 세무사 근태기록부(줄·주간/야간/합·엑셀) + 월말결제 이미지 내용
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { taxRows, taxXlsx, taxHtml, payModel, rateText } from '../../multi/taxout.js';

const days = [
  { date: '2026-11-01', in: '17:58', calcStart: '18:00', out: '22:45', min: 285 },   // 일요일 = 1주
  { date: '2026-11-02', in: '18:00', calcStart: '18:00', out: '00:30', min: 390 },   // 월요일 → 2주, 자정 넘김
  { date: '2026-11-03', in: '18:10', calcStart: '18:10', out: '', min: 0, noOut: true }, // 퇴근 없음 → 줄 없음
  { date: '2026-11-09', in: '11:30', calcStart: '11:30', out: '21:00', min: 570 },   // 월요일 → 3주 = 마지막
];

test('근태기록부 줄: 주차(월요일마다)·출근=계산 시작·야간=22시 넘은 시간·자정 넘김', () => {
  const r = taxRows(days);
  assert.deepEqual(r.map(x => [x.week, x.day, x.dow, x.start, x.out, x.day_h, x.night, x.sum]), [
    ['1주', 1, '일', '18:00', '22:45', 4, 0.8, 4.8],
    ['2주', 2, '월', '18:00', '00:30', 4, 2.5, 6.5],
    ['마지막', 9, '월', '11:30', '21:00', 9.5, 0, 9.5],
  ]);
  assert.equal(rateText({ full: true, wage: 2100000 }), '월급 2,100,000');
  assert.equal(rateText({ full: false, wage: 10500 }), 10500);
});

const pr = { rows: [
  { uid: 'a', name: '한가람', full: false, wage: 10500, pay: 100000.4, days },
  { uid: 'h', name: '박반직', full: true, half: true, wage: 2100000, pay: 2100000, days: [] },
  { uid: 'j', name: '이주방', full: true, wage: 3000000, pay: 3000000, days: [{ date: '2026-11-01', calcStart: '11:30', out: '22:00' }] },
] };

test('월말결제: 알바 + 반직원만, 알바 합계·송금 총합', () => {
  const m = payModel(pr, { a: { bank: '은행A', account: '000-1' } }, new Set(['h']));
  assert.deepEqual(m.alba, [{ name: '한가람', pay: 100000, bank: '은행A', account: '000-1' }]);
  assert.deepEqual(m.half.map(x => x.name), ['박반직']);
  assert.equal(m.albaSum, 100000); assert.equal(m.total, 2200000);
});

test('PDF(인쇄) 화면: 요약 + 퇴근 기록 있는 사람만 1명 1쪽', () => {
  const h = taxHtml('시험매장', '2026-11', pr);
  assert.match(h, /시험매장 2026\.11 전직원 근무내역/);
  assert.equal((h.match(/<section>/g) || []).length, 3);   // 요약 + 한가람 + 이주방 (박반직은 기록 없음)
  assert.match(h, /월급 3,000,000/);
});

let X = null; try { X = createRequire(import.meta.url)('xlsx-js-style'); } catch (e) {}
test('엑셀: 요약 시트 + 사람별 시트, 수식·값', { skip: !X && 'xlsx-js-style 없음 (npm i --no-save xlsx-js-style@1.2.0)' }, async () => {
  globalThis.window = { XLSX: X };
  const b = await taxXlsx('시험매장', '2026-11', pr);
  const wb = X.read(new Uint8Array(await b.arrayBuffer()), { type: 'array', cellFormula: true });
  assert.deepEqual(wb.SheetNames, ['요약', '한가람', '이주방']);
  const s = wb.Sheets['한가람'];
  assert.equal(s.E4.v, '한가람'); assert.equal(s.C4.v, '2026.11'); assert.equal(s.H4.v, 10500);
  assert.equal(s.J9.f, '(G9-F9)*24'); assert.equal(s.J9.v, 6.5);
  assert.equal(s.J11.f, 'SUM(J8:J10)'); assert.equal(s.J11.v, 20.8);
  assert.equal(wb.Sheets['이주방'].H4.v, '월급 3,000,000');
  delete globalThis.window;
});
