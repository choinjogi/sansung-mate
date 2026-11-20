// Cloudflare 서버에서 Firebase를 쓰기 위한 도구 (Cloudflare에는 Firebase 관리 도구가 없어서 직접 구현)
// 1) 직원·사장님의 Firebase 로그인 토큰이 진짜인지 확인 (구글 공개 열쇠로 서명 검사)
// 2) 서비스 계정 열쇠로 구글 접속 토큰 받기 (Firestore 기록용)
// 3) Firestore REST로 읽기·만들기·덮어쓰기
import { NOW, Fail } from '../functions/core.js';

const enc = new TextEncoder(), dec = new TextDecoder();
const b64u = buf => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const unb64u = s => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4)), c => c.charCodeAt(0));
const json64 = s => JSON.parse(dec.decode(unb64u(s)));
const RS256 = { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' };

// ---------- 1) 로그인 토큰 확인 ----------
const JWK_URL = 'https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com';
let KEYS = null, KEYS_UNTIL = 0;
async function googleKeys() {
  if (KEYS && Date.now() < KEYS_UNTIL) return KEYS;
  const r = await fetch(JWK_URL);
  if (!r.ok) throw new Error('구글 공개 열쇠를 못 받음 ' + r.status);
  const age = +((r.headers.get('cache-control') || '').match(/max-age=(\d+)/) || [0, 3600])[1];
  KEYS = (await r.json()).keys; KEYS_UNTIL = Date.now() + Math.min(age, 6 * 3600) * 1000;
  return KEYS;
}
// 맞으면 uid, 아니면 Fail('unauthenticated'). emulator=true면 연습용 서버의 서명 없는 토큰도 받음 (실제 서버에서는 절대 켜지 않음)
export async function verifyIdToken(token, { projectId, emulator = false, keys, now = Date.now() / 1000 }) {
  const bad = why => new Fail('unauthenticated', '다시 로그인해 주세요' + (emulator ? ` (${why})` : ''));
  if (typeof token !== 'string') throw bad('토큰 없음');
  const parts = token.split('.');
  if (parts.length !== 3) throw bad('모양');
  let h, p;
  try { h = json64(parts[0]); p = json64(parts[1]); } catch (e) { throw bad('해석'); }
  if (!emulator) {
    if (h.alg !== 'RS256' || !h.kid) throw bad('알고리즘');
    const jwk = (keys || (await googleKeys())).find(k => k.kid === h.kid);
    if (!jwk) throw bad('열쇠');
    const key = await crypto.subtle.importKey('jwk', { kty: jwk.kty, n: jwk.n, e: jwk.e, alg: 'RS256', ext: true }, RS256, false, ['verify']);
    const ok = await crypto.subtle.verify(RS256, key, unb64u(parts[2]), enc.encode(parts[0] + '.' + parts[1]));
    if (!ok) throw bad('서명');
  }
  if (p.aud !== projectId || p.iss !== 'https://securetoken.google.com/' + projectId) throw bad('프로젝트');
  if (!(p.exp > now) || !(p.iat <= now + 300) || (p.auth_time && p.auth_time > now + 300)) throw bad('시간');
  if (typeof p.sub !== 'string' || !p.sub || p.sub.length > 128) throw bad('uid');
  return p.sub;
}

// ---------- 2) 서비스 계정 → 접속 토큰 ----------
let TOKEN = null, TOKEN_UNTIL = 0;
function pemToDer(pem) { return unb64u(pem.replace(/-----[^-]+-----/g, '').replace(/\s+/g, '').replace(/\+/g, '-').replace(/\//g, '_')); }
export async function signJwt(sa, claims) {
  const key = await crypto.subtle.importKey('pkcs8', pemToDer(sa.private_key), RS256, false, ['sign']);
  const head = b64u(enc.encode(JSON.stringify({ alg: 'RS256', typ: 'JWT', kid: sa.private_key_id })));
  const body = b64u(enc.encode(JSON.stringify(claims)));
  return `${head}.${body}.${b64u(await crypto.subtle.sign(RS256, key, enc.encode(head + '.' + body)))}`;
}
async function accessToken(sa) {
  if (TOKEN && Date.now() < TOKEN_UNTIL) return TOKEN;
  const iat = Math.floor(Date.now() / 1000);
  const assertion = await signJwt(sa, { iss: sa.client_email, scope: 'https://www.googleapis.com/auth/datastore https://www.googleapis.com/auth/identitytoolkit', aud: 'https://oauth2.googleapis.com/token', iat, exp: iat + 3600 });
  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: 'grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=' + assertion,
  });
  if (!r.ok) throw new Error('구글 접속 토큰을 못 받음 ' + r.status + ' ' + (await r.text()).slice(0, 200));
  const j = await r.json();
  TOKEN = j.access_token; TOKEN_UNTIL = Date.now() + (j.expires_in - 120) * 1000;
  return TOKEN;
}

// ---------- 3) Firestore REST ----------
export function toValue(v) {
  if (v === null || v === undefined) return { nullValue: null };
  if (typeof v === 'boolean') return { booleanValue: v };
  if (typeof v === 'number') return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
  if (typeof v === 'string') return { stringValue: v };
  if (Array.isArray(v)) return { arrayValue: { values: v.map(toValue) } };
  if (typeof v === 'object') return { mapValue: { fields: Object.fromEntries(Object.entries(v).map(([k, x]) => [k, toValue(x)])) } };
  throw new Error('저장할 수 없는 값');
}
export function fromValue(v) {
  if ('nullValue' in v) return null;
  if ('booleanValue' in v) return v.booleanValue;
  if ('integerValue' in v) return Number(v.integerValue);
  if ('doubleValue' in v) return v.doubleValue;
  if ('stringValue' in v) return v.stringValue;
  if ('timestampValue' in v) return v.timestampValue;
  if ('arrayValue' in v) return (v.arrayValue.values || []).map(fromValue);
  if ('mapValue' in v) return Object.fromEntries(Object.entries(v.mapValue.fields || {}).map(([k, x]) => [k, fromValue(x)]));
  return null;
}

// env: PROJECT_ID, SERVICE_ACCOUNT(JSON 문자열, 비밀값) / 연습용: FIRESTORE_EMULATOR('http://127.0.0.1:8080')
export function firestore(env) {
  const P = env.PROJECT_ID, emu = env.FIRESTORE_EMULATOR;
  const root = `projects/${P}/databases/(default)/documents`;
  const base = (emu || 'https://firestore.googleapis.com') + '/v1/' + root;
  const auth = async () => ({ Authorization: 'Bearer ' + (emu ? 'owner' : await accessToken(JSON.parse(env.SERVICE_ACCOUNT))) });
  // mode: 'new' = 없을 때만 만듦 / 'set' = 통째로 덮어씀 / 'patch' = 있는 문서의 그 칸들만 바꿈
  async function commit(path, obj, mode) {
    const mustBeNew = mode === 'new', fields = {}, transforms = [];
    for (const [k, v] of Object.entries(obj)) { if (v === NOW) transforms.push({ fieldPath: k, setToServerValue: 'REQUEST_TIME' }); else fields[k] = toValue(v); }
    const write = { update: { name: `${root}/${path}`, fields }, updateTransforms: transforms };
    if (mustBeNew) write.currentDocument = { exists: false };
    if (mode === 'patch') { write.updateMask = { fieldPaths: Object.keys(fields) }; write.currentDocument = { exists: true }; }
    const r = await fetch(base + ':commit', { method: 'POST', headers: { ...(await auth()), 'Content-Type': 'application/json' }, body: JSON.stringify({ writes: [write] }) });
    if (r.ok) return;
    const t = await r.text();
    if (mustBeNew && (r.status === 409 || /ALREADY_EXISTS|FAILED_PRECONDITION/.test(t))) throw new Fail('already-exists', '이미 있어요');
    throw new Error('Firestore 기록 실패 ' + r.status + ' ' + t.slice(0, 200));
  }
  return {
    async get(path) {
      const r = await fetch(`${base}/${path}`, { headers: await auth() });
      if (r.status === 404) return null;
      if (!r.ok) throw new Error('Firestore 읽기 실패 ' + r.status);
      return fromValue({ mapValue: { fields: (await r.json()).fields || {} } });
    },
    create: (path, obj) => commit(path, obj, 'new'),
    set: (path, obj) => commit(path, obj, 'set'),
    patch: (path, obj) => commit(path, obj, 'patch'),
  };
}

// ---------- 4) 로그인 계정 관리 (직원 번호 다시 정하기) ----------
// 서비스 계정에 "Firebase 인증 관리자"(roles/firebaseauth.admin) 역할이 있어야 함. 연습용: AUTH_EMULATOR('127.0.0.1:9099')
export function authAdmin(env) {
  const P = env.PROJECT_ID, emu = env.AUTH_EMULATOR;
  const base = emu ? `http://${emu}/identitytoolkit.googleapis.com` : 'https://identitytoolkit.googleapis.com';
  return {
    async setPassword(uid, password) {
      const token = emu ? 'owner' : await accessToken(JSON.parse(env.SERVICE_ACCOUNT));
      const r = await fetch(`${base}/v1/projects/${P}/accounts:update`, {
        method: 'POST', headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
        body: JSON.stringify({ localId: uid, password }),
      });
      if (r.ok) return;
      const t = await r.text();
      if (r.status === 403) throw new Fail('failed-precondition', '서버에 비밀번호 재설정 권한이 아직 없어요 (운영자 설정 필요)');
      throw new Error('계정 번호 바꾸기 실패 ' + r.status + ' ' + t.slice(0, 200));
    },
  };
}
