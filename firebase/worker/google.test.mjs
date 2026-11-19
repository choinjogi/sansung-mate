// Cloudflare 서버 도구 시험: node --test worker/google.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { verifyIdToken, signJwt, toValue, fromValue } from './google.js';

const RS = { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]) };
const enc = new TextEncoder();
const b64u = b => Buffer.from(b).toString('base64url');
const now = Math.floor(Date.now() / 1000);
const good = { iss: 'https://securetoken.google.com/proj', aud: 'proj', sub: 'user1', iat: now - 10, exp: now + 3000, auth_time: now - 10 };

async function setup() {
  const kp = await crypto.subtle.generateKey(RS, true, ['sign', 'verify']);
  const jwk = { ...(await crypto.subtle.exportKey('jwk', kp.publicKey)), kid: 'k1' };
  const sign = async (claims, head = { alg: 'RS256', kid: 'k1' }) => {
    const h = b64u(enc.encode(JSON.stringify(head))), p = b64u(enc.encode(JSON.stringify(claims)));
    return `${h}.${p}.${b64u(await crypto.subtle.sign(RS, kp.privateKey, enc.encode(h + '.' + p)))}`;
  };
  return { kp, keys: [jwk], sign };
}
const opt = keys => ({ projectId: 'proj', keys, now });

test('진짜 로그인 토큰은 통과, uid를 돌려줌', async () => {
  const { keys, sign } = await setup();
  assert.equal(await verifyIdToken(await sign(good), opt(keys)), 'user1');
});
test('가짜·만료·다른 프로젝트·서명 없는 토큰은 거절', async () => {
  const { keys, sign } = await setup();
  const other = await setup();
  const reject = async t => assert.rejects(verifyIdToken(t, opt(keys)), e => e.code === 'unauthenticated');
  await reject(await sign({ ...good, exp: now - 1 }));                     // 만료
  await reject(await sign({ ...good, aud: 'other' }));                     // 다른 프로젝트
  await reject(await sign({ ...good, iss: 'https://evil.example/proj' }));
  await reject(await other.sign(good));                                     // 다른 열쇠로 서명
  const t = await sign(good), [h, , s] = t.split('.');
  await reject(`${h}.${b64u(enc.encode(JSON.stringify({ ...good, sub: 'boss' })))}.${s}`); // 내용 바꿔치기
  await reject(`${b64u(enc.encode('{"alg":"none"}'))}.${b64u(enc.encode(JSON.stringify(good)))}.`); // 서명 없음
  await reject('');
});
test('연습용 서버 모드에서만 서명 없는 토큰을 받음', async () => {
  const t = `${b64u(enc.encode('{"alg":"none"}'))}.${b64u(enc.encode(JSON.stringify(good)))}.`;
  assert.equal(await verifyIdToken(t, { projectId: 'proj', emulator: true, now }), 'user1');
});
test('서비스 계정 열쇠로 만든 서명이 맞음', async () => {
  const { kp } = await setup();
  const der = Buffer.from(await crypto.subtle.exportKey('pkcs8', kp.privateKey)).toString('base64');
  const pem = `-----BEGIN PRIVATE KEY-----\n${der.match(/.{1,64}/g).join('\n')}\n-----END PRIVATE KEY-----\n`;
  const jwt = await signJwt({ private_key: pem, private_key_id: 'x' }, { a: 1 });
  const [h, p, s] = jwt.split('.');
  assert.ok(await crypto.subtle.verify(RS, kp.publicKey, Buffer.from(s, 'base64url'), enc.encode(h + '.' + p)));
});
test('Firestore 값 변환이 왕복됨', () => {
  const o = { a: null, b: true, c: 3, d: 1.5, e: '한글', f: ['1.2.3.4', 5], g: { lat: 37.5, n: { x: 'y' } } };
  assert.deepEqual(fromValue(toValue(o)), o);
});
