// 서버 계산 시험: node --test functions/lib.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { clientIp, sameNet, kst, prevDate, distM, judge } from './lib.js';

test('회선 주소: 위조된 맨 앞 값이 아니라 맨 뒤(구글이 붙인) 값', () => {
  assert.equal(clientIp({ headers: { 'x-forwarded-for': '1.2.3.4, 211.36.1.9' } }), '211.36.1.9');
  assert.equal(clientIp({ headers: {}, ip: '::ffff:10.0.0.1' }), '10.0.0.1');
});
test('같은 회선 판정', () => {
  assert.ok(sameNet('211.36.1.9', '211.36.1.9'));
  assert.ok(!sameNet('211.36.1.9', '211.36.1.10'));
  assert.ok(sameNet('2001:db8:1:2:aaaa::1', '2001:0db8:0001:0002:bbbb:cccc:dddd:eeee')); // 같은 /64
  assert.ok(!sameNet('2001:db8:1:3::1', '2001:db8:1:2::1'));
  assert.ok(!sameNet('211.36.1.9', '2001:db8::1'));
  assert.ok(!sameNet('', ''));
});
test('한국 날짜: 밤 11시 30분은 그날, 자정 넘으면 다음 날', () => {
  assert.deepEqual(kst(new Date('2026-11-19T14:30:00Z')), { date: '2026-11-19', hour: 23, min: 30 });
  assert.equal(kst(new Date('2026-11-19T15:10:00Z')).date, '2026-11-20');
  assert.equal(prevDate('2026-03-01'), '2026-02-28');
});
test('거리', () => {
  const a = { lat: 37.5665, lng: 126.978 };
  assert.equal(distM(a, a), 0);
  const d = distM(a, { lat: 37.5674, lng: 126.978 }); // 위도 0.0009도 ≈ 100m
  assert.ok(d > 95 && d < 105, d);
});
test('⚠ 판정: 출근은 와이파이만, 퇴근은 와이파이나 반경 안', () => {
  assert.equal(judge('in', true, null, 100).flag, false);
  assert.deepEqual(judge('in', false, 20, 100), { flag: true, why: 'nowifi' });   // 매장 앞 길에서 찍기
  assert.deepEqual(judge('in', false, null, 100), { flag: true, why: 'nowifi' });
  assert.equal(judge('out', false, 50, 100).flag, false);
  assert.deepEqual(judge('out', false, 1500, 100), { flag: true, why: 'far' });  // 집에서 퇴근
  assert.deepEqual(judge('out', false, null, 100), { flag: true, why: 'nowifi' });
});
