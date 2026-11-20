// 여러 매장용 서버(Firebase) 호출을 한곳에 모음. 화면(app.js)은 이 파일의 API만 쓴다.
import * as F from './vendor/firebase.js';
import { FIREBASE, USE_EMULATOR, SERVER_URL } from './config.js';

export const configured = USE_EMULATOR || FIREBASE.apiKey !== 'TODO';
const app = F.initializeApp(USE_EMULATOR ? { apiKey: 'demo', projectId: 'demo-mate', authDomain: 'localhost' } : FIREBASE);
export const auth = F.getAuth(app);
export const db = F.getFirestore(app);
const fns = F.getFunctions(app, 'asia-northeast3'); // 서버 함수 (서울)
if (USE_EMULATOR) {
  F.connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
  F.connectFirestoreEmulator(db, '127.0.0.1', 8080);
  F.connectFunctionsEmulator(fns, '127.0.0.1', 5001);
}

const ref = p => F.doc(db, p);
const col = p => F.collection(db, p);
const data = s => (s.exists() ? { id: s.id, ...s.data() } : null);
const list = q => F.getDocs(q).then(r => r.docs.map(d => ({ id: d.id, ...d.data() })));

// 헷갈리는 글자(0/O, 1/I/L) 뺀 코드
const rand = (n, abc) => { const a = crypto.getRandomValues(new Uint32Array(n)); return Array.from(a, x => abc[x % abc.length]).join(''); };
export const newCode = (n = 8) => rand(n, 'ABCDEFGHJKMNPQRSTUVWXYZ23456789');
const newStoreId = () => 's' + rand(10, 'abcdefghijkmnpqrstuvwxyz23456789'); // 소문자만 (직원 이메일에 들어감)

export const month = (d = new Date(), add = 0) => { const x = new Date(d.getFullYear(), d.getMonth() + add, 1); return x.getFullYear() + '-' + String(x.getMonth() + 1).padStart(2, '0'); };

// ---------- 로그인 ----------
// 직원: 이름 + 6자리. Firebase 이메일 계정으로 바꿔 씀. 매장 ID가 앞에 붙어 다른 매장 같은 이름과 안 겹침
const hex = s => Array.from(new TextEncoder().encode(s), b => b.toString(16).padStart(2, '0')).join('');
export const staffEmail = (storeId, name) => `${storeId}.${hex(name.trim())}@staff.mate.invalid`;
export const storeOfStaff = user => (user && user.email && user.email.endsWith('@staff.mate.invalid') ? user.email.split('.')[0] : null);
export const isGoogle = user => !!user && user.providerData.some(p => p.providerId === 'google.com');

export const onUser = cb => F.onAuthStateChanged(auth, cb);
export const logout = () => F.signOut(auth);
export const staffLogin = (storeId, name, pw) => F.signInWithEmailAndPassword(auth, staffEmail(storeId, name), pw);
export async function googleLogin() {
  const p = new F.GoogleAuthProvider();
  p.setCustomParameters({ prompt: 'select_account' });
  return F.signInWithPopup(auth, p);
}
// 연습용 서버에서만: 구글 창 없이 가짜 구글 계정으로 로그인 (자동 시험용)
export const testGoogle = USE_EMULATOR
  ? (email, name) => F.signInWithCredential(auth, F.GoogleAuthProvider.credential(JSON.stringify({ sub: email, email, email_verified: true, name })))
  : null;

// 직원 가입: 계정 만들고 → 매장에 "승인 대기"로 신청. 이미 계정이 있으면(거절 뒤 다시 신청) 로그인해서 다시 신청
export async function staffSignup(storeId, joinCode, name, pw) {
  try {
    await F.createUserWithEmailAndPassword(auth, staffEmail(storeId, name), pw);
  } catch (e) {
    if (e.code !== 'auth/email-already-in-use') throw e;
    await staffLogin(storeId, name, pw).catch(() => { throw Object.assign(new Error('이미 가입한 이름이에요. 로그인하거나, 이름 뒤에 숫자를 붙여 주세요.'), { code: 'taken' }); });
    if (await myMember(storeId)) return;
  }
  await F.setDoc(ref(`stores/${storeId}/members/${auth.currentUser.uid}`), {
    name: name.trim(), role: 'staff', status: 'pending', joinCode, joinedAt: F.serverTimestamp(),
  });
}

// ---------- 읽기 ----------
export const joinInfo = code => F.getDoc(ref('joinCodes/' + code)).then(data);
export const ownerInvite = code => F.getDoc(ref('ownerInvites/' + code)).then(data);
export const myMember = storeId => F.getDoc(ref(`stores/${storeId}/members/${auth.currentUser.uid}`)).then(data);
export const getStore = id => F.getDoc(ref('stores/' + id)).then(data);
export const myOrgs = () => list(F.query(col('orgs'), F.where('adminUids', 'array-contains', auth.currentUser.uid)));
export const myStores = () => list(F.query(col('stores'), F.where('ownerUids', 'array-contains', auth.currentUser.uid)));
export const orgStores = orgId => list(F.query(col('stores'), F.where('orgId', '==', orgId)));
export const members = storeId => list(col(`stores/${storeId}/members`));
export const stats = storeId => list(col(`stores/${storeId}/stats`));
// 지금 적용 중인 규칙 = 이번 달 이전(포함) 중 가장 최근 것. 다음 달부터 예약된 규칙도 같이 돌려줌
export async function rulesOf(storeId) {
  const all = (await list(col(`stores/${storeId}/rules`))).sort((a, b) => (a.id < b.id ? -1 : 1));
  const now = month();
  return { current: all.filter(r => r.id <= now).pop() || null, next: all.find(r => r.id > now) || null };
}

// 그 달에 적용되는 규칙 (그 달 이전(포함) 중 가장 최근 것)
export async function rulesFor(storeId, m) {
  const all = (await list(col(`stores/${storeId}/rules`))).sort((a, b) => (a.id < b.id ? -1 : 1));
  return all.filter(r => r.id <= m).pop() || all[0] || null;
}

// ---------- 쓰기 ----------
// 매장 + 규칙 + 직원 초대 코드를 한 번에 (초대받은 사장님이면 초대도 "사용됨" 표시)
export async function createStore({ orgId, name, direct, inviteCode, rules }) {
  const id = newStoreId(), joinCode = newCode(8), uid = auth.currentUser.uid, b = F.writeBatch(db);
  b.set(ref('stores/' + id), { orgId, name, ownerUids: [uid], direct, inviteCode: inviteCode || null, joinCode, createdAt: F.serverTimestamp() });
  if (!direct) b.update(ref('ownerInvites/' + inviteCode), { usedBy: uid, storeId: id });
  b.set(ref(`stores/${id}/rules/${month()}`), { from: month(), ...rules });
  b.set(ref('joinCodes/' + joinCode), { storeId: id, storeName: name });
  b.set(ref(`stores/${id}/settings/leave`), leaveMins(rules.leave));
  await b.commit();
  return id;
}
export async function createOwnerInvite(orgId) {
  const code = newCode(10);
  await F.setDoc(ref('ownerInvites/' + code), { orgId, createdBy: auth.currentUser.uid, createdAt: F.serverTimestamp(), usedBy: null, storeId: null });
  return code;
}
export async function newJoinCode(store) {
  const code = newCode(8), b = F.writeBatch(db);
  if (store.joinCode) b.delete(ref('joinCodes/' + store.joinCode));
  b.set(ref('joinCodes/' + code), { storeId: store.id, storeName: store.name });
  b.update(ref('stores/' + store.id), { joinCode: code });
  await b.commit();
  return code;
}
// 월 합계 (총괄이 보는 숫자). 매출·인건비는 급여 단계에서 같이 채움 → merge
export const saveStats = (storeId, m, v) => F.setDoc(ref(`stores/${storeId}/stats/${m}`), { month: m, ...v, updatedAt: F.serverTimestamp() }, { merge: true });
export const setMember = (storeId, uid, patch) => F.updateDoc(ref(`stores/${storeId}/members/${uid}`), patch);
export const removeMember = (storeId, uid) => F.deleteDoc(ref(`stores/${storeId}/members/${uid}`));
export async function saveRules(storeId, from, rules) {
  const b = F.writeBatch(db);
  b.set(ref(`stores/${storeId}/rules/${from}`), { from, ...rules });
  b.set(ref(`stores/${storeId}/settings/leave`), leaveMins(rules.leave)); // 휴무신청 시간은 저장하면 바로 바뀜
  await b.commit();
}
// 휴무신청 시간 → "그 주 월요일 0시 기준 몇 분 전" (권한 규칙이 이 값으로 마감을 지킴)
export function leaveMins(l) {
  const before = (dow, hm) => { const days = (1 - dow + 7) % 7 || 7; const [h, m] = hm.split(':').map(Number); return days * 1440 - (h * 60 + m); };
  return { opensBeforeMin: before(l.opensDow, l.opensTime), closesBeforeMin: before(l.closesDow, l.closesTime) };
}

// ---------- 출퇴근 ----------
// 한국 시각 기준 오늘 날짜·시각 문자열
const KST = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
export function kst(date = new Date()) {
  const o = Object.fromEntries(KST.formatToParts(date).map(p => [p.type, p.value]));
  return { date: `${o.year}-${o.month}-${o.day}`, hm: `${o.hour}:${o.minute}`, hour: +o.hour };
}
export const addDays = (d, n) => { const t = new Date(d + 'T12:00:00Z'); t.setUTCDate(t.getUTCDate() + n); return t.toISOString().slice(0, 10); };
export const hmOf = ts => (ts && ts.toDate ? kst(ts.toDate()).hm : null);
// 근무 날짜 + "HH:MM"(한국 시각) → 시각. 퇴근이 출근보다 이르면 자정 넘긴 것으로 봄
export function atOf(date, hm, afterHm) {
  const d = afterHm && hm < afterHm ? addDays(date, 1) : date;
  return F.Timestamp.fromDate(new Date(`${d}T${hm}:00+09:00`));
}

// 위치: 허용 안 하거나 못 잡으면 null (막지 않음)
export function getGeo(ms = 8000) {
  return new Promise(res => {
    if (!navigator.geolocation) return res(null);
    navigator.geolocation.getCurrentPosition(
      p => res({ lat: p.coords.latitude, lng: p.coords.longitude, acc: p.coords.accuracy }),
      () => res(null), { enableHighAccuracy: true, timeout: ms, maximumAge: 0 });
  });
}
const testIp = () => (USE_EMULATOR && window.__mateTestIp) || undefined; // 연습용 서버 시험에서만
// 출퇴근 서버 부르기: Cloudflare(SERVER_URL) 또는 Firebase 서버 함수. 연습용 서버에서는 Cloudflare 판이 기본
const serverUrl = () => (USE_EMULATOR ? (localStorage.getItem('mate_use_functions') === '1' ? '' : 'http://127.0.0.1:8787') : SERVER_URL);
async function server(name, args) {
  const url = serverUrl();
  if (!url) return (await F.httpsCallable(fns, name)(args)).data;
  let r;
  try {
    r = await fetch(`${url}/${name}`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + (await auth.currentUser.getIdToken()) }, body: JSON.stringify(args) });
  } catch (e) { throw Object.assign(new Error('인터넷 연결을 확인해 주세요'), { code: 'functions/unavailable' }); }
  const j = await r.json().catch(() => ({}));
  if (!j.ok) throw Object.assign(new Error(j.message || '서버 오류가 났어요'), { code: 'functions/' + (j.code || 'internal') });
  return j.data;
}
export async function punch(storeId, kind, alone) {
  const geo = await getGeo();
  return { ...(await server('punch', { storeId, kind, geo, alone: !!alone, _testIp: testIp() })), geo: !!geo };
}
// 직원 비밀번호 임의 재설정 (사장님만, 서버가 임시 비밀번호 6자리를 만들어 돌려줌)
export const resetPin = (storeId, target) => server('resetPin', { storeId, target });
// 임시 비밀번호로 로그인한 직원이 새 번호를 정함 → 표시 지움
export async function changePin(storeId, pw) {
  await F.updatePassword(auth.currentUser, pw);
  await F.updateDoc(ref(`stores/${storeId}/members/${auth.currentUser.uid}`), { pinReset: false });
}
export const registerWifi = (storeId, reset) => server('registerWifi', { storeId, reset: !!reset, _testIp: testIp() });
export const getSetting = (storeId, k) => F.getDoc(ref(`stores/${storeId}/settings/${k}`)).then(data);
export const savePlace = (storeId, place) => F.setDoc(ref(`stores/${storeId}/settings/place`), place);

export const punchDoc = (storeId, date, uid, kind) => F.getDoc(ref(`stores/${storeId}/punches/${date}_${uid}_${kind}`)).then(data);
export const myPunches = (storeId, from, to) => list(F.query(col(`stores/${storeId}/punches`), F.where('uid', '==', auth.currentUser.uid), F.where('date', '>=', from), F.where('date', '<=', to)));
export const punchesBetween = (storeId, from, to) => list(F.query(col(`stores/${storeId}/punches`), F.where('date', '>=', from), F.where('date', '<=', to)));
export const flaggedSince = (storeId, from) => list(F.query(col(`stores/${storeId}/punches`), F.where('flag', '==', true), F.where('date', '>=', from)));
export const reviewPunch = (storeId, id) => F.updateDoc(ref(`stores/${storeId}/punches/${id}`), { reviewed: true, reviewedBy: auth.currentUser.uid, reviewedAt: F.serverTimestamp() });
export const editPunch = (storeId, id, at) => F.updateDoc(ref(`stores/${storeId}/punches/${id}`), { at, editedBy: auth.currentUser.uid, editedAt: F.serverTimestamp() });
export const addPunch = (storeId, { uid, name, date, kind, at }) =>
  F.setDoc(ref(`stores/${storeId}/punches/${date}_${uid}_${kind}`), { uid, name, date, kind, at, via: 'manual', by: auth.currentUser.uid });

// ---------- 근무표·휴무신청 ----------
// 주 = 그 주 월요일 날짜. 칸: 'O' 근무(저녁) · '오전' 주말 오전 · 'O+오전' 둘 다 · 'X' 휴무/불가 · '' 미배정
export const mondayOf = date => { const t = new Date(date + 'T12:00:00Z'); return addDays(date, -((t.getUTCDay() + 6) % 7)); };
export const weekDates = week => [0, 1, 2, 3, 4, 5, 6].map(i => addDays(week, i));
export const dowOf = date => new Date(date + 'T12:00:00Z').getUTCDay();
export const getSchedule = (storeId, week) => F.getDoc(ref(`stores/${storeId}/schedules/${week}`)).then(data);
export const saveSchedule = (storeId, week, cells, published) =>
  F.setDoc(ref(`stores/${storeId}/schedules/${week}`), { week, cells, published: !!published, updatedBy: auth.currentUser.uid, updatedAt: F.serverTimestamp() }, { merge: true });
export const setEarly = (storeId, date, uid, hm) =>
  F.setDoc(ref(`stores/${storeId}/schedules/${mondayOf(date)}`), { week: mondayOf(date), early: { [date]: { [uid]: hm } } }, { merge: true });
export const leaveSetting = storeId => F.getDoc(ref(`stores/${storeId}/settings/leave`)).then(data);
// 신청 받는 시간 (그 주 월요일 0시 KST 기준)
export function leaveWindow(week, s) {
  const mon = new Date(`${week}T00:00:00+09:00`).getTime();
  return { opens: new Date(mon - s.opensBeforeMin * 60e3), closes: new Date(mon - s.closesBeforeMin * 60e3) };
}
export const myLeave = (storeId, week) => F.getDoc(ref(`stores/${storeId}/leaves/${week}_${auth.currentUser.uid}`)).then(data);
export const submitLeave = (storeId, week, name, off, am) =>
  F.setDoc(ref(`stores/${storeId}/leaves/${week}_${auth.currentUser.uid}`), { uid: auth.currentUser.uid, name, week, off, am, at: F.serverTimestamp() });
export const leavesOf = (storeId, week) => list(F.query(col(`stores/${storeId}/leaves`), F.where('week', '==', week)));
export const fmtWhen = d => { const k = kst(d); return `${+k.date.slice(5, 7)}/${+k.date.slice(8)}(${'일월화수목금토'[dowOf(k.date)]}) ${k.hm}`; };

export { F };
