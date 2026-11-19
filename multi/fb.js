// 여러 매장용 서버(Firebase) 호출을 한곳에 모음. 화면(app.js)은 이 파일의 API만 쓴다.
import * as F from './vendor/firebase.js';
import { FIREBASE, USE_EMULATOR } from './config.js';

export const configured = USE_EMULATOR || FIREBASE.apiKey !== 'TODO';
const app = F.initializeApp(USE_EMULATOR ? { apiKey: 'demo', projectId: 'demo-mate', authDomain: 'localhost' } : FIREBASE);
export const auth = F.getAuth(app);
export const db = F.getFirestore(app);
if (USE_EMULATOR) {
  F.connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
  F.connectFirestoreEmulator(db, '127.0.0.1', 8080);
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

// ---------- 쓰기 ----------
// 매장 + 규칙 + 직원 초대 코드를 한 번에 (초대받은 사장님이면 초대도 "사용됨" 표시)
export async function createStore({ orgId, name, direct, inviteCode, rules }) {
  const id = newStoreId(), joinCode = newCode(8), uid = auth.currentUser.uid, b = F.writeBatch(db);
  b.set(ref('stores/' + id), { orgId, name, ownerUids: [uid], direct, inviteCode: inviteCode || null, joinCode, createdAt: F.serverTimestamp() });
  if (!direct) b.update(ref('ownerInvites/' + inviteCode), { usedBy: uid, storeId: id });
  b.set(ref(`stores/${id}/rules/${month()}`), { from: month(), ...rules });
  b.set(ref('joinCodes/' + joinCode), { storeId: id, storeName: name });
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
export const setMember = (storeId, uid, patch) => F.updateDoc(ref(`stores/${storeId}/members/${uid}`), patch);
export const removeMember = (storeId, uid) => F.deleteDoc(ref(`stores/${storeId}/members/${uid}`));
export const saveRules = (storeId, from, rules) => F.setDoc(ref(`stores/${storeId}/rules/${from}`), { from, ...rules });

export { F };
