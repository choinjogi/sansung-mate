// 권한 규칙 시험. 실행: npm test (Firestore 에뮬레이터 위에서 돌아감, 실제 데이터와 무관)
import { test, before, beforeEach, after } from 'node:test';
import { readFileSync } from 'node:fs';
import { initializeTestEnvironment, assertSucceeds, assertFails } from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, updateDoc, deleteDoc, addDoc, collection, getDocs, query, where, writeBatch, serverTimestamp, Timestamp } from 'firebase/firestore';

let env;
const G = { firebase: { sign_in_provider: 'google.com' } };   // 구글 로그인(사장님·총괄)
const P = { firebase: { sign_in_provider: 'password' } };     // 이름+6자리(직원)

// 등장인물
// boss: 총괄(대표님). 직영 '산성' 사장님 겸함
// kim: 다른 사장님. '두번째' 매장 (총괄 초대로 만듦)
// alba: 산성 직원, mgr: 산성 매니저, newbie: 산성 승인 대기, other: 두번째 매장 직원
const as = (uid, tok) => env.authenticatedContext(uid, tok).firestore();

before(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-mate',
    firestore: { rules: readFileSync(new URL('../firestore.rules', import.meta.url), 'utf8') },
  });
});
after(() => env.cleanup());

beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async c => {
    const db = c.firestore();
    const now = Timestamp.now();
    await setDoc(doc(db, 'orgs/org1'), { name: '산성 그룹', adminUids: ['boss'] });
    await setDoc(doc(db, 'stores/sansung'), { orgId: 'org1', name: '산성', ownerUids: ['boss'], direct: true, inviteCode: null, createdAt: now });
    await setDoc(doc(db, 'stores/second'), { orgId: 'org1', name: '두번째', ownerUids: ['kim'], direct: false, inviteCode: 'inv0', createdAt: now });
    await setDoc(doc(db, 'stores/sansung/members/alba'), { name: '알바', role: 'staff', status: 'active' });
    await setDoc(doc(db, 'stores/sansung/members/mgr'), { name: '매니저', role: 'manager', status: 'active' });
    await setDoc(doc(db, 'stores/sansung/members/newbie'), { name: '신입', role: 'staff', status: 'pending' });
    await setDoc(doc(db, 'stores/second/members/other'), { name: '다른알바', role: 'staff', status: 'active' });
    await setDoc(doc(db, 'stores/sansung/wages/alba'), { history: [{ from: '2026-11', wage: 10030 }] });
    await setDoc(doc(db, 'stores/sansung/private/alba'), { bank: '국민', account: '123', email: 'a@x.com', req: null });
    await setDoc(doc(db, 'stores/second/private/other'), { bank: '신한', account: '999', req: null });
    await setDoc(doc(db, 'stores/sansung/punches/p1'), { uid: 'alba', date: '2026-11-19', kind: 'in', at: now, via: 'nfc', by: 'alba' });
    await setDoc(doc(db, 'stores/sansung/punches/p2'), { uid: 'mgr', date: '2026-11-19', kind: 'in', at: now, via: 'nfc', by: 'mgr' });
    await setDoc(doc(db, 'stores/second/stats/2026-11'), { month: '2026-11', laborRatio: 0.28, byWeekday: { 5: 4 } });
    await setDoc(doc(db, 'stores/second/payroll/2026-11'), { rows: [] });
    await setDoc(doc(db, 'joinCodes/JOINSS'), { storeId: 'sansung', storeName: '산성' });
    await setDoc(doc(db, 'ownerInvites/inv1'), { orgId: 'org1', createdBy: 'boss', createdAt: now, usedBy: null, storeId: null });
    const ms = Date.now();
    await setDoc(doc(db, 'stores/sansung/schedules/2026-11-23'), { leaveOpensAt: Timestamp.fromMillis(ms - 3600e3), leaveClosesAt: Timestamp.fromMillis(ms + 3600e3) });
    await setDoc(doc(db, 'stores/sansung/schedules/2026-11-16'), { leaveOpensAt: Timestamp.fromMillis(ms - 9 * 86400e3), leaveClosesAt: Timestamp.fromMillis(ms - 3 * 86400e3) });
  });
});

// ---------- 매장 만들기 ----------
test('총괄은 직영 매장을 만들 수 있다', async () => {
  await assertSucceeds(setDoc(doc(as('boss', G), 'stores/third'), { orgId: 'org1', name: '세번째', ownerUids: ['boss'], direct: true, inviteCode: null, createdAt: serverTimestamp() }));
});
test('아무나 직영 매장을 만들 수 없다', async () => {
  await assertFails(setDoc(doc(as('stranger', G), 'stores/x'), { orgId: 'org1', name: 'X', ownerUids: ['stranger'], direct: true, inviteCode: null, createdAt: serverTimestamp() }));
});
test('총괄 초대를 받은 사장님은 초대 사용과 함께 매장을 만들 수 있다', async () => {
  const db = as('lee', G), b = writeBatch(db);
  b.set(doc(db, 'stores/lee1'), { orgId: 'org1', name: '이사장 매장', ownerUids: ['lee'], direct: false, inviteCode: 'inv1', createdAt: serverTimestamp() });
  b.update(doc(db, 'ownerInvites/inv1'), { usedBy: 'lee', storeId: 'lee1' });
  await assertSucceeds(b.commit());
});
test('초대를 사용 표시하지 않고 매장만 만들 수는 없다', async () => {
  await assertFails(setDoc(doc(as('lee', G), 'stores/lee1'), { orgId: 'org1', name: '이사장 매장', ownerUids: ['lee'], direct: false, inviteCode: 'inv1', createdAt: serverTimestamp() }));
});
test('이미 쓴 초대로는 또 못 만든다', async () => {
  await env.withSecurityRulesDisabled(c => updateDoc(doc(c.firestore(), 'ownerInvites/inv1'), { usedBy: 'lee', storeId: 'lee1' }));
  const db = as('park', G), b = writeBatch(db);
  b.set(doc(db, 'stores/park1'), { orgId: 'org1', name: '박', ownerUids: ['park'], direct: false, inviteCode: 'inv1', createdAt: serverTimestamp() });
  b.update(doc(db, 'ownerInvites/inv1'), { usedBy: 'park', storeId: 'park1' });
  await assertFails(b.commit());
});
test('직원 계정(구글 아님)은 매장을 만들 수 없다', async () => {
  await assertFails(setDoc(doc(as('boss', P), 'stores/y'), { orgId: 'org1', name: 'Y', ownerUids: ['boss'], direct: true, inviteCode: null, createdAt: serverTimestamp() }));
});
test('사장님 초대는 총괄만 만든다', async () => {
  await assertSucceeds(setDoc(doc(as('boss', G), 'ownerInvites/inv9'), { orgId: 'org1', createdBy: 'boss', createdAt: serverTimestamp(), usedBy: null, storeId: null }));
  await assertFails(setDoc(doc(as('kim', G), 'ownerInvites/inv8'), { orgId: 'org1', createdBy: 'kim', createdAt: serverTimestamp(), usedBy: null, storeId: null }));
});
test('아무도 앱에서 총괄을 만들거나 바꿀 수 없다', async () => {
  await assertFails(setDoc(doc(as('kim', G), 'orgs/org2'), { adminUids: ['kim'] }));
  await assertFails(updateDoc(doc(as('boss', G), 'orgs/org1'), { adminUids: ['boss', 'kim'] }));
});

// ---------- 직원 가입 ----------
test('초대 코드로 가입 신청할 수 있다 (승인 대기)', async () => {
  await assertSucceeds(setDoc(doc(as('n2', P), 'stores/sansung/members/n2'), { name: '새직원', role: 'staff', status: 'pending', joinCode: 'JOINSS', joinedAt: serverTimestamp() }));
});
test('가입하면서 스스로 승인·매니저가 될 수 없다', async () => {
  await assertFails(setDoc(doc(as('n2', P), 'stores/sansung/members/n2'), { name: '새직원', role: 'staff', status: 'active', joinCode: 'JOINSS', joinedAt: serverTimestamp() }));
  await assertFails(setDoc(doc(as('n2', P), 'stores/sansung/members/n2'), { name: '새직원', role: 'manager', status: 'pending', joinCode: 'JOINSS', joinedAt: serverTimestamp() }));
});
test('다른 매장 초대 코드로는 가입할 수 없다', async () => {
  await assertFails(setDoc(doc(as('n2', P), 'stores/second/members/n2'), { name: '새직원', role: 'staff', status: 'pending', joinCode: 'JOINSS', joinedAt: serverTimestamp() }));
});
test('승인은 그 매장 사장님만', async () => {
  await assertSucceeds(updateDoc(doc(as('boss', G), 'stores/sansung/members/newbie'), { status: 'active' }));
  await assertFails(updateDoc(doc(as('mgr', P), 'stores/sansung/members/newbie'), { status: 'active' }));
  await assertFails(updateDoc(doc(as('kim', G), 'stores/sansung/members/newbie'), { status: 'active' }));
  await assertFails(updateDoc(doc(as('newbie', P), 'stores/sansung/members/newbie'), { status: 'active' }));
});
test('승인 대기 중에는 매장 정보와 스케줄을 못 본다', async () => {
  await assertFails(getDoc(doc(as('newbie', P), 'stores/sansung')));
  await assertFails(getDoc(doc(as('newbie', P), 'stores/sansung/schedules/2026-11-23')));
  await assertSucceeds(getDoc(doc(as('newbie', P), 'stores/sansung/members/newbie')));
});
test('초대 코드 목록은 아무도 못 훑는다', async () => {
  await assertFails(getDocs(collection(as('alba', P), 'joinCodes')));
  await assertSucceeds(getDoc(doc(env.unauthenticatedContext().firestore(), 'joinCodes/JOINSS')));
});

// ---------- 매장 사이 벽 ----------
test('다른 매장 사장님은 산성을 전혀 못 본다', async () => {
  const db = as('kim', G);
  await assertFails(getDoc(doc(db, 'stores/sansung')));
  await assertFails(getDocs(collection(db, 'stores/sansung/members')));
  await assertFails(getDoc(doc(db, 'stores/sansung/private/alba')));
  await assertFails(getDocs(collection(db, 'stores/sansung/punches')));
});
test('총괄은 다른 사장님 매장의 합계(stats)만 보고 직원별 정보는 못 본다', async () => {
  const db = as('boss', G);
  await assertSucceeds(getDoc(doc(db, 'stores/second')));
  await assertSucceeds(getDoc(doc(db, 'stores/second/stats/2026-11')));
  await assertFails(getDocs(collection(db, 'stores/second/members')));
  await assertFails(getDoc(doc(db, 'stores/second/private/other')));
  await assertFails(getDoc(doc(db, 'stores/second/payroll/2026-11')));
  await assertFails(getDocs(collection(db, 'stores/second/punches')));
});
test('합계(stats)에는 정해진 칸 말고 넣을 수 없다 (개인정보가 총괄에게 새지 않게)', async () => {
  const db = as('kim', G);
  await assertSucceeds(setDoc(doc(db, 'stores/second/stats/2026-12'), { month: '2026-12', laborRatio: 0.3, byWeekday: { 6: 5 } }));
  await assertFails(setDoc(doc(db, 'stores/second/stats/2026-12'), { month: '2026-12', laborRatio: 0.3, staff: [{ name: '다른알바', pay: 1 }] }));
});

// ---------- 계좌·시급 ----------
test('계좌는 본인과 그 매장 사장님만 본다', async () => {
  await assertSucceeds(getDoc(doc(as('alba', P), 'stores/sansung/private/alba')));
  await assertSucceeds(getDoc(doc(as('boss', G), 'stores/sansung/private/alba')));
  await assertFails(getDoc(doc(as('mgr', P), 'stores/sansung/private/alba')));
  await assertFails(getDoc(doc(as('newbie', P), 'stores/sansung/private/alba')));
});
test('직원은 계좌를 직접 못 바꾸고 변경 요청(req)만 낸다', async () => {
  const db = as('alba', P);
  await assertFails(updateDoc(doc(db, 'stores/sansung/private/alba'), { account: '777' }));
  await assertSucceeds(updateDoc(doc(db, 'stores/sansung/private/alba'), { req: { bank: '국민', account: '777', at: serverTimestamp() } }));
  await assertSucceeds(updateDoc(doc(as('boss', G), 'stores/sansung/private/alba'), { account: '777', req: null }));
});
test('시급은 사장님과 본인만, 바꾸기는 사장님만', async () => {
  await assertSucceeds(getDoc(doc(as('alba', P), 'stores/sansung/wages/alba')));
  await assertFails(getDoc(doc(as('mgr', P), 'stores/sansung/wages/alba')));
  await assertFails(setDoc(doc(as('alba', P), 'stores/sansung/wages/alba'), { history: [{ from: '2026-11', wage: 99999 }] }));
  await assertSucceeds(setDoc(doc(as('boss', G), 'stores/sansung/wages/alba'), { history: [{ from: '2026-12', wage: 10500 }] }));
});

// ---------- 출퇴근 ----------
const P_IN = { uid: 'alba', name: '알바', date: '2026-11-19', kind: 'in', via: 'manual' };
test('직원은 출퇴근 기록을 직접 못 쓴다 (서버 함수가 와이파이 확인 후 기록)', async () => {
  const db = as('alba', P);
  await assertFails(setDoc(doc(db, 'stores/sansung/punches/2026-11-20_alba_in'), { uid: 'alba', date: '2026-11-20', kind: 'in', at: serverTimestamp(), via: 'app', by: 'alba', wifi: true, flag: false }));
  await assertFails(updateDoc(doc(db, 'stores/sansung/punches/p1'), { flag: false }));
});
test('승인 대기·다른 매장 사람은 산성 기록을 못 쓴다', async () => {
  await assertFails(setDoc(doc(as('newbie', P), 'stores/sansung/punches/2026-11-19_newbie_in'), { ...P_IN, uid: 'newbie', at: serverTimestamp(), by: 'newbie' }));
  await assertFails(setDoc(doc(as('other', P), 'stores/sansung/punches/2026-11-19_other_in'), { ...P_IN, uid: 'other', at: serverTimestamp(), by: 'other' }));
});
test('매니저는 빠진 기록을 넣을 수 있다 (문서 이름 규칙 지킴)', async () => {
  const db = as('mgr', P);
  await assertSucceeds(setDoc(doc(db, 'stores/sansung/punches/2026-11-19_alba_out'), { ...P_IN, kind: 'out', at: Timestamp.now(), by: 'mgr' }));
  await assertFails(setDoc(doc(db, 'stores/sansung/punches/아무거나'), { ...P_IN, at: Timestamp.now(), by: 'mgr' }));
  await assertFails(setDoc(doc(db, 'stores/sansung/punches/2026-11-19_alba_in'), { ...P_IN, at: Timestamp.now(), by: 'mgr', flag: false }));
});
test('직원은 찍은 기록을 고치거나 지울 수 없고, 매니저는 고친 사람이 남는다', async () => {
  await assertFails(updateDoc(doc(as('alba', P), 'stores/sansung/punches/p1'), { at: Timestamp.fromMillis(0) }));
  await assertFails(deleteDoc(doc(as('alba', P), 'stores/sansung/punches/p1')));
  await assertFails(updateDoc(doc(as('mgr', P), 'stores/sansung/punches/p1'), { at: Timestamp.fromMillis(0) }));
  await assertFails(updateDoc(doc(as('mgr', P), 'stores/sansung/punches/p1'), { uid: 'mgr', editedBy: 'mgr', editedAt: serverTimestamp() }));
  await assertSucceeds(updateDoc(doc(as('mgr', P), 'stores/sansung/punches/p1'), { at: Timestamp.fromMillis(0), editedBy: 'mgr', editedAt: serverTimestamp() }));
});
test('⚠ 기록 확인 표시는 매니저 이상, 확인한 사람이 남는다', async () => {
  await assertFails(updateDoc(doc(as('alba', P), 'stores/sansung/punches/p1'), { reviewed: true, reviewedBy: 'alba', reviewedAt: serverTimestamp() }));
  await assertFails(updateDoc(doc(as('mgr', P), 'stores/sansung/punches/p1'), { reviewed: true, reviewedBy: 'boss', reviewedAt: serverTimestamp() }));
  await assertSucceeds(updateDoc(doc(as('mgr', P), 'stores/sansung/punches/p1'), { reviewed: true, reviewedBy: 'mgr', reviewedAt: serverTimestamp() }));
});
test('직원은 자기 출퇴근만 본다', async () => {
  const db = as('alba', P);
  await assertSucceeds(getDocs(query(collection(db, 'stores/sansung/punches'), where('uid', '==', 'alba'))));
  await assertSucceeds(getDoc(doc(db, 'stores/sansung/punches/p1')));
  await assertSucceeds(getDoc(doc(db, 'stores/sansung/punches/2026-12-01_alba_in'))); // 아직 없는 오늘 기록
  await assertFails(getDoc(doc(as('newbie', P), 'stores/sansung/punches/2026-12-01_newbie_in')));
  await assertFails(getDocs(collection(db, 'stores/sansung/punches')));
  await assertFails(getDoc(doc(db, 'stores/sansung/punches/p2')));
  await assertSucceeds(getDocs(collection(as('mgr', P), 'stores/sansung/punches')));
});
test('매장 와이파이 주소는 사장님만 보고, 아무도 앱에서 직접 못 바꾼다', async () => {
  await assertFails(setDoc(doc(as('boss', G), 'stores/sansung/settings/wifi'), { ips: ['1.2.3.4'] }));
  await assertFails(getDoc(doc(as('mgr', P), 'stores/sansung/settings/wifi')));
  await assertSucceeds(getDoc(doc(as('boss', G), 'stores/sansung/settings/wifi')));
});
test('매장 위치는 사장님만 정한다', async () => {
  await assertSucceeds(setDoc(doc(as('boss', G), 'stores/sansung/settings/place'), { lat: 37.5, lng: 127.0, radius: 100 }));
  await assertFails(setDoc(doc(as('boss', G), 'stores/sansung/settings/place'), { lat: 37.5, lng: 127.0, radius: 5 }));
  await assertFails(setDoc(doc(as('mgr', P), 'stores/sansung/settings/place'), { lat: 37.5, lng: 127.0, radius: 100 }));
});

// ---------- 휴무신청 ----------
test('휴무신청은 열린 동안만, 자기 것만 낸다', async () => {
  const db = as('alba', P);
  await assertSucceeds(setDoc(doc(db, 'stores/sansung/leaves/2026-11-23_alba'), { uid: 'alba', week: '2026-11-23', off: ['2026-11-25'], am: [], at: serverTimestamp() }));
  await assertFails(setDoc(doc(db, 'stores/sansung/leaves/2026-11-16_alba'), { uid: 'alba', week: '2026-11-16', off: [], am: [], at: serverTimestamp() }));
  await assertFails(setDoc(doc(db, 'stores/sansung/leaves/2026-11-23_mgr'), { uid: 'mgr', week: '2026-11-23', off: [], am: [], at: serverTimestamp() }));
});
test('마감 뒤에는 매니저가 대신 고칠 수 있다', async () => {
  await assertSucceeds(setDoc(doc(as('mgr', P), 'stores/sansung/leaves/2026-11-16_alba'), { uid: 'alba', week: '2026-11-16', off: ['2026-11-18'], am: [] }));
});

// ---------- 매출·정산·규칙 ----------
test('매출은 매니저 이상, 정산표는 사장님만', async () => {
  await assertSucceeds(setDoc(doc(as('mgr', P), 'stores/sansung/sales/2026-11-19'), { amount: 1500000 }));
  await assertFails(getDoc(doc(as('alba', P), 'stores/sansung/sales/2026-11-19')));
  await assertFails(getDoc(doc(as('mgr', P), 'stores/sansung/payroll/2026-11')));
  await assertSucceeds(setDoc(doc(as('boss', G), 'stores/sansung/payroll/2026-11'), { rows: [] }));
});
test('매장 규칙은 사장님만 바꾸고, 직원은 읽을 수 있다', async () => {
  await assertSucceeds(setDoc(doc(as('boss', G), 'stores/sansung/rules/2026-12'), { from: '2026-12', open: {} }));
  await assertFails(setDoc(doc(as('mgr', P), 'stores/sansung/rules/2027-01'), { from: '2027-01' }));
  await assertSucceeds(getDoc(doc(as('alba', P), 'stores/sansung/rules/2026-12')));
});

// ---------- 2단계 화면에서 쓰는 조회·묶음 저장 ----------
test('사장님은 내 매장 목록을, 총괄은 그룹 전체 매장 목록을 불러온다', async () => {
  await assertSucceeds(getDocs(query(collection(as('kim', G), 'stores'), where('ownerUids', 'array-contains', 'kim'))));
  await assertSucceeds(getDocs(query(collection(as('boss', G), 'stores'), where('orgId', '==', 'org1'))));
  await assertFails(getDocs(query(collection(as('kim', G), 'stores'), where('orgId', '==', 'org1'))));
  await assertSucceeds(getDocs(query(collection(as('boss', G), 'orgs'), where('adminUids', 'array-contains', 'boss'))));
  await assertFails(getDocs(collection(as('kim', G), 'orgs')));
});
test('매장 + 규칙 + 직원 초대 코드를 한 번에 만든다', async () => {
  const db = as('lee', G), b = writeBatch(db);
  b.set(doc(db, 'stores/lee1'), { orgId: 'org1', name: '이사장 매장', ownerUids: ['lee'], direct: false, inviteCode: 'inv1', createdAt: serverTimestamp() });
  b.update(doc(db, 'ownerInvites/inv1'), { usedBy: 'lee', storeId: 'lee1' });
  b.set(doc(db, 'stores/lee1/rules/2026-11'), { from: '2026-11', open: {} });
  b.set(doc(db, 'joinCodes/LEEJOIN1'), { storeId: 'lee1', storeName: '이사장 매장' });
  await assertSucceeds(b.commit());
});
test('남의 매장 초대 코드는 못 만든다', async () => {
  await assertFails(setDoc(doc(as('kim', G), 'joinCodes/FAKE'), { storeId: 'sansung', storeName: '산성' }));
});
