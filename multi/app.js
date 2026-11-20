// 산성 MATE 여러 매장용 화면: 로그인, 매장 만들기, 초대 가입, 승인, 매장 규칙 (출퇴근은 attend.js)
import * as api from './fb.js?v=14';
import { STORE_RULES_DEFAULT } from './defaults.js?v=14';
import { $, esc, DOW, DOW_ORDER, BASE, ls, clone, toast, show, top, wireTop, busy, niceErr, linkCard, wireLinks, copy, setNav } from './ui.js?v=14';
import * as attend from './attend.js?v=14';
import * as sched from './sched.js?v=14';
import * as records from './records.js?v=14';
import * as pay from './pay.js?v=14';
import * as sales from './sales.js?v=14';
import * as dash from './dash.js?v=14';
import * as staff from './staff.js?v=14';
import * as info from './info.js?v=14';
// ---------- 주소로 들어온 정보 (초대 링크) ----------
const params = new URLSearchParams(location.search);
if (params.get('join')) ls.set('mate_join', params.get('join').toUpperCase());
if (params.get('owner')) ls.set('mate_owner', params.get('owner').toUpperCase());
if (params.get('s')) ls.set('mate_store', params.get('s'));
if ([...params.keys()].length) history.replaceState(null, '', location.pathname); // 주소창 깔끔하게

// ---------- 시작 ----------
let hold = false; // 가입 중에는 로그인 알림으로 화면이 먼저 바뀌지 않게
let lastPw = null; // 방금 로그인에 쓴 비밀번호 (임시 비밀번호를 새 비밀번호로 또 넣는 것 막기)
if (!api.configured) {
  show(`<div class="splash"><div class="t2">MATE</div><p>서버 설정 전이에요.<br><code>multi/config.js</code>에 Firebase 값을 넣어 주세요.</p></div>`);
} else {
  show('<div class="splash"><div class="t2">MATE</div><p class="small">불러오는 중…</p></div>');
  api.onUser(user => hold || route(user).catch(e => { console.error(e); show(`<div class="card"><b>오류</b><p>${esc(niceErr(e))}</p><button id="rt">다시 시도</button></div>`); $('rt').onclick = () => route(api.auth.currentUser); }));
}

async function route(user) {
  setNav(null); CTX = null;
  if (!user) {
    if (ls.get('mate_join')) return joinScreen(ls.get('mate_join'));
    if (ls.get('mate_owner')) return landing('invite');
    if (ls.get('mate_store')) return staffAuthScreen({ storeId: ls.get('mate_store'), storeName: ls.get('mate_store_name') || '내 매장' }, 'login');
    return landing();
  }
  if (api.isGoogle(user)) return ownerHome();
  const storeId = api.storeOfStaff(user);
  if (!storeId) { await api.logout(); return; }
  ls.set('mate_store', storeId);
  return staffHome(storeId);
}

// ---------- 처음 화면 ----------
function landing(mode) {
  show(`<div class="splash">
    <div class="t2">MATE</div><p class="t1">매장 근무 앱</p>
    ${mode === 'invite' ? '<div class="card hero" style="width:100%"><b>매장 만들기 초대를 받으셨어요</b><p class="small">구글 계정으로 로그인하면 매장을 만들 수 있어요.</p></div>' : ''}
    <div style="width:100%;margin-top:18px"><button id="st">직원 · 로그인 / 가입</button>
    <button class="ghost" id="g" style="margin-top:10px">사장님 · 구글로 로그인</button></div></div>`);
  $('g').onclick = e => busy(e.target, () => api.googleLogin());
  $('st').onclick = () => (ls.get('mate_store')
    ? staffAuthScreen({ storeId: ls.get('mate_store'), storeName: ls.get('mate_store_name') || '내 매장' }, 'login')
    : storeFindScreen());
}

// ---------- 직원: 매장 찾기 → 처음 가입 / 로그인 ----------
// 매장 이름을 정확히 쳐야 나옴 (띄어쓰기·대소문자 상관없음). 사장님 초대 링크·코드를 넣어도 됨
function storeFindScreen() {
  show(`${top('내 매장 찾기', true)}<div class="card">
      <label>일하는 매장 이름</label><input id="sc" placeholder="예: 산성식육점">
      <button id="scGo" style="margin-top:16px">찾기</button>
      <p class="small">매장 이름을 정확히 넣어 주세요. 모르면 사장님께 물어보세요.</p></div>`);
  wireTop(() => landing());
  $('scGo').onclick = e => busy(e.target, async () => {
    const v = $('sc').value.trim();
    if (!v) throw new Error('매장 이름을 넣어 주세요');
    const st = await api.findStore(v).catch(() => null);
    if (st) return staffAuthScreen(st, 'join');
    const m = v.match(/[?&]join=([A-Za-z0-9]+)/), code = (m ? m[1] : v).toUpperCase();
    if (/^[A-Z0-9]{6,12}$/.test(code) && (await api.joinInfo(code).catch(() => null))) return joinScreen(code, 'join');
    throw new Error('그 이름의 매장이 없어요. 사장님께 매장 이름을 다시 물어봐 주세요');
  });
}

// 초대 링크로 들어온 경우 (예전 방식, 계속 됨)
async function joinScreen(code, tab = 'join') {
  const j = await api.joinInfo(code).catch(() => null);
  if (!j) {
    ls.del('mate_join');
    show(`${top('MATE')}<div class="card"><b>초대 링크가 바뀌었거나 없어졌어요</b><p>앱 첫 화면에서 [직원 · 로그인 / 가입] → 매장 이름으로 찾아 주세요.</p></div>`);
    return wireTop();
  }
  return staffAuthScreen({ storeId: j.storeId, storeName: j.storeName, joinCode: code }, tab);
}

function staffAuthScreen(st, tab = 'join') {
  ls.set('mate_store', st.storeId); ls.set('mate_store_name', st.storeName);
  const isJoin = tab === 'join';
  show(`<div class="top"><div class="brand"><span>MATE</span></div></div>
    <div class="card hero"><div class="small">매장</div><div class="big">${esc(st.storeName)}</div></div>
    <div class="row" style="margin:10px 0"><button class="sm ${isJoin ? 'ghost' : ''}" id="tl">로그인</button><button class="sm ${isJoin ? '' : 'ghost'}" id="tj">처음 가입</button></div>
    <div class="card">
      <label>이름 (실명)</label><input id="nm" autocomplete="name" maxlength="20" placeholder="홍길동">
      <label>비밀번호 (숫자 6자리) ${isJoin ? '<span class="small">(내가 정해요. 로그인할 때 써요)</span>' : ''}</label>
      <input id="pw" type="password" inputmode="numeric" maxlength="6" autocomplete="${isJoin ? 'new-password' : 'current-password'}" placeholder="●●●●●●">
      ${isJoin ? '<label>한 번 더</label><input id="pw2" type="password" inputmode="numeric" maxlength="6" autocomplete="new-password" placeholder="●●●●●●">' : ''}
      <button id="go" style="margin-top:16px">${isJoin ? '가입 신청' : '로그인'}</button>
      ${isJoin ? '<p class="small">신청하면 사장님이 확인하고 승인해요.</p>' : '<p class="small">비밀번호를 잊었으면 사장님께 "비밀번호 임의 재설정"을 부탁해 주세요.</p>'}
    </div>
    <p class="small" style="text-align:center"><a href="#" id="other" style="color:var(--sub)">다른 매장이에요</a> · <a href="#" id="own" style="color:var(--sub)">사장님 로그인</a></p>`);
  $('tj').onclick = () => staffAuthScreen(st, 'join');
  $('tl').onclick = () => staffAuthScreen(st, 'login');
  $('other').onclick = ev => { ev.preventDefault(); ls.del('mate_store'); ls.del('mate_store_name'); ls.del('mate_join'); storeFindScreen(); };
  $('own').onclick = ev => { ev.preventDefault(); ls.del('mate_join'); landing(); };
  $('go').onclick = e => busy(e.target, async () => {
    const name = $('nm').value.trim(), pw = $('pw').value;
    if (!name) throw new Error('이름을 넣어 주세요');
    if (!/^\d{6}$/.test(pw)) throw new Error('비밀번호는 숫자 6자리예요');
    if (isJoin) {
      if (pw !== $('pw2').value) throw new Error('두 비밀번호가 달라요');
      hold = true;
      try { await api.staffSignup(st.storeId, st.joinCode || null, name, pw); }
      catch (err) { if (api.auth.currentUser) await api.logout(); throw err; }
      finally { hold = false; }
      ls.del('mate_join');
      await route(api.auth.currentUser);
    } else {
      lastPw = pw;
      await api.staffLogin(st.storeId, name, pw);
      ls.del('mate_join');
    }
  });
}

// ---------- 직원 홈 (승인 전·퇴사 안내, 승인 뒤에는 출퇴근 화면) ----------
async function staffHome(storeId) {
  const m = await api.myMember(storeId);
  if (!m) {
    show(`${top('MATE')}<div class="card"><b>가입 신청이 없어요</b><p>사장님이 거절했거나 지웠을 수 있어요. 초대 링크로 다시 신청해 주세요.</p></div>`);
    return wireTop();
  }
  if (m.status === 'pending') {
    show(`${top('MATE')}<div class="card hero"><div class="small">${esc(ls.get('mate_store_name') || '')}</div><div class="big">승인 기다리는 중</div>
      <p>${esc(m.name)}님, 가입 신청을 보냈어요. 사장님이 승인하면 쓸 수 있어요.</p></div><button class="ghost" id="rf">승인됐는지 다시 보기</button>`);
    wireTop();
    $('rf').onclick = e => busy(e.target, () => staffHome(storeId));
    return;
  }
  if (m.pinReset && !api.isGone(m)) return newPinScreen(storeId, m);
  if (api.isGone(m)) {
    show(`${top('MATE')}<div class="card"><b>퇴사 처리된 계정이에요</b><p>다시 일하게 되면 사장님께 말해 주세요.</p></div>`);
    return wireTop();
  }
  const s = await api.getStore(storeId);
  ls.set('mate_store_name', s.name);
  return startTabs({ store: s, me: m, admin: m.role === 'manager', owner: false });
}

// ---------- 아래 탭 (산성 앱과 같은 구성) ----------
// 직원: 홈 · 근무표 · 휴무신청 · 내 기록 / 사장님·매니저: 오늘 · 승인 · 매출 · 대시보드 · 더보기
const STAFF_TABS = [['home', '🏠', '홈'], ['sched', '📅', '근무표'], ['leave', '📝', '휴무신청'], ['rec', '⏱️', '내 기록']];
const ADMIN_TABS = [['today', '👀', '오늘'], ['ok', '✅', '승인'], ['sales', '💰', '매출'], ['dash', '📊', '대시보드'], ['more', '☰', '더보기']];
let CTX = null;
function startTabs(ctx, tab) {
  CTX = ctx;
  const tabs = ctx.admin ? ADMIN_TABS : STAFF_TABS, saved = ls.get('mate_tab');
  return goTab(tab || (tabs.some(t => t[0] === saved) ? saved : tabs[0][0]));
}
async function goTab(k) {
  const ctx = CTX, tabs = ctx.admin ? ADMIN_TABS : STAFF_TABS;
  ls.set('mate_tab', k);
  setNav(tabs, k, goTab);
  const again = () => goTab(k), s = ctx.store, me = ctx.me;
  try {
    if (k === 'home') return await attend.staffHome(s, me, again);
    if (k === 'sched') return await sched.scheduleView(s, me.id, null);
    if (k === 'leave') return await sched.leaveForm(s, me, null);
    if (k === 'rec') return await attend.myRecords(s, me, null);
    if (k === 'today') return await todayTab(ctx, again);
    if (k === 'ok') return await approvalTab(ctx, again);
    if (k === 'sales') return await sales.salesScreen(s, null);
    if (k === 'dash') return await dash.dashScreen(s, null, !!ctx.owner);
    if (k === 'more') return ctx.owner ? await ownerMore(s.id, again) : await managerMore(ctx, again);
  } catch (e) {
    console.error(e);
    if (!api.auth.currentUser || CTX !== ctx) return; // 불러오는 중에 로그아웃·화면 바뀜 → 오류 안 띄움
    show(`<div class="card"><b>오류</b><p>${esc(niceErr(e))}</p><button id="rt">다시 시도</button></div>`);
    $('rt').onclick = again;
  }
}

// 오늘 탭: (사장님) 처음 할 일 · 와이파이 경고 / (매니저) 내 출퇴근 카드 → 오늘 출근 현황
async function todayTab(ctx, again) {
  const s = ctx.store;
  let pre;
  if (ctx.owner) {
    const wk = api.mondayOf(api.kst().date);
    const [ms, att, schNow, schNext] = await Promise.all([api.members(s.id), attend.ownerSection(s), api.getSchedule(s.id, wk), api.getSchedule(s.id, api.addDays(wk, 7))]);
    const act = ms.filter(m => api.isActive(m));
    const steps = [
      ['매장 와이파이 등록', '매장 안에서 폰을 매장 와이파이에 연결하고, ☰ 더보기 → 출퇴근 확인의 등록 버튼', att.wifiN > 0],
      ['매장 위치 저장', '매장 안에서 ☰ 더보기 → 출퇴근 확인의 위치 버튼 (퇴근 확인용)', att.place],
      ['직원 가입 · 승인', `직원에게 매장 이름 "${s.name}"을 알려 주고, 가입 신청이 오면 ✅ 승인 탭에서 승인`, act.length > 0],
      ['정직원·매니저 정하기', '☰ 더보기 → 직원 옆 [설정]에서 정직원/알바, 매니저 고르기', act.some(m => m.role === 'manager' || m.type === '정')],
      ['근무표 확정', '☰ 더보기 → 근무표 짜기에서 이번 주나 다음 주 근무표를 만들고 확정', !!((schNow && schNow.published) || (schNext && schNext.published))],
    ];
    const left = steps.filter(x => !x[2]).length;
    pre = { html: (left ? `<div class="card" id="steps"><div class="row between"><b>처음 할 일</b><span class="pill">${steps.length - left}/${steps.length}</span></div>
      <div class="list">${steps.map(([t, d, ok]) => `<div class="item" style="display:block"><b style="color:${ok ? 'var(--ok)' : 'var(--text)'}">${ok ? '✓' : '○'} ${t}</b>${ok ? '' : `<div class="small">${esc(d)}</div>`}</div>`).join('')}</div>
      <p class="small"><a href="guide.html" target="_blank" style="color:var(--sub)">사장님 안내서 보기 ›</a></p></div>` : '') + att.head, wire() {}, again };
  } else {
    const pc = await attend.punchCard(s, ctx.me, again);
    pre = { html: `<div class="row between" style="margin-top:6px"><h1 style="margin:0">${esc(ctx.me.name)}님</h1><span class="pill on">매니저</span></div>${pc.html}`, wire: pc.wire, again };
  }
  return attend.todayScreen(s, null, null, pre);
}

// 승인 탭: 가입 신청 (사장님·매니저) + ⚠ 확인 필요
async function approvalTab(ctx, again) {
  const s = ctx.store;
  const [ms, hires, early] = await Promise.all([api.members(s.id), api.hiresOf(s.id), api.earlyWaiting(s.id).catch(() => [])]);
  const pending = ms.filter(m => m.status === 'pending'), H = Object.fromEntries(hires.map(h => [h.id, h]));
  const hireOf = m => H[api.nameKey(m.name)] || null;
  const html = `<h2>가입 신청${pending.length ? ` <span class="small">· ${pending.length}명</span>` : ''}</h2>
    ${pending.length ? `<div class="card hero"><div class="list">${pending.map(m => `
      <div class="item"><span><b>${esc(m.name)}</b><br>${hireOf(m) ? `<span class="small" style="color:var(--ok)">✓ 입사 등록됨 · ${hireOf(m).type === '정' ? '정직원' : '알바'} · ${esc(hireOf(m).startDate.slice(5).replace('-', '/'))} 입사</span>` : '<span class="small" style="color:var(--warn)">입사 등록 없음 — 본인 맞는지 꼭 확인</span>'}</span><span class="row" style="gap:6px">
        <button class="sm" data-jok="${m.id}">승인</button><button class="sm ghost" data-jno="${m.id}" data-name="${esc(m.name)}">거절</button></span></div>`).join('')}</div>
      <p class="small">본인이 맞는지 확인하고 승인해 주세요. 거절하면 가입 신청이 지워져요.</p></div>`
      : '<div class="card"><p class="small">새 가입 신청이 없어요.</p></div>'}`;
  const inf = ctx.owner ? await info.infoApprovals(s, ms) : { html: '', wire() {} };
  const md = d => `${+d.slice(5, 7)}/${+d.slice(8)}`;
  const earlyHtml = early.length ? `<h2>조기 출근 승인 <span class="small">· ${early.length}건</span></h2>${early.sort((a, b) => (a.date < b.date ? 1 : -1)).map(p => `<div class="card">
      <div class="row between"><b>${esc(p.name)}</b><span class="small">${md(p.date)}</span></div>
      <p>매장 요청으로 <b style="color:var(--text)">${esc(p.earlyReq.hm)}</b> 출근 (찍은 시각 ${esc(api.hmOf(p.at))})</p>
      <div class="row" style="gap:8px"><button class="sm" data-eok="${p.id}">승인</button><button class="sm ghost" data-eno="${p.id}">거절 (정시부터)</button></div></div>`).join('')}` : '';
  const wire = () => {
    inf.wire(again);
    document.querySelectorAll('[data-eok],[data-eno]').forEach(b => { b.onclick = () => busy(b, async () => { const ok = !!b.dataset.eok, p = early.find(x => x.id === (b.dataset.eok || b.dataset.eno)); await api.decideEarly(s.id, p, ok); toast(ok ? '승인했어요' : '거절했어요'); await again(); }); });
    document.querySelectorAll('[data-jok]').forEach(b => { b.onclick = () => busy(b, async () => { const m = pending.find(x => x.id === b.dataset.jok); await staff.approveWithHire(s, m, hireOf(m), !!ctx.owner); toast('승인했어요'); await again(); }); });
    document.querySelectorAll('[data-jno]').forEach(b => { b.onclick = () => { if (confirm(b.dataset.name + '님 가입 신청을 거절할까요?')) busy(b, async () => { await api.removeMember(s.id, b.dataset.jno); await again(); }); }; });
  };
  return attend.reviewScreen(s, null, { html: html + earlyHtml + inf.html, wire, again });
}

// 더보기 (매니저): 근무표·휴무신청 현황·기록, 내 것
async function managerMore(ctx, again) {
  const s = ctx.store, me = ctx.me;
  show(`${top(s.name)}
    <div class="row between" style="margin-top:6px"><h1 style="margin:0">${esc(me.name)}님</h1><span class="pill on">매니저</span></div>
    <h2>근무표</h2>
    <div class="card list">
      <a href="#" class="item" id="goNeed">👥 요일별 인원<span class="small">›</span></a>
      <a href="#" class="item" id="goEdit">📅 근무표 짜기<span class="small">›</span></a>
      <a href="#" class="item" id="goLvAdm">📝 휴무신청 현황<span class="small">›</span></a>
      <a href="#" class="item" id="goSched">🗓️ 확정된 근무표 보기<span class="small">›</span></a></div>
    <h2>직원</h2>
    <div class="card list"><a href="#" class="item" id="goStaff">🙋 입사 · 퇴사<span class="small">›</span></a>
      <a href="#" class="item" id="goNotice">📢 공지<span class="small">›</span></a></div>
    <h2>기록</h2>
    <div class="card list">
      <a href="#" class="item" id="goMonth">📊 월 근무 기록<span class="small">›</span></a></div>
    <h2>내 것</h2>
    <div class="card list">
      <a href="#" class="item" id="goMyRec">⏱️ 내 출퇴근 기록<span class="small">›</span></a>
      <a href="#" class="item" id="goMyInfo">👤 내 정보 (계좌·이메일)<span class="small">›</span></a>
      ${sched.isAlba(me) ? '<a href="#" class="item" id="goMyLeave">📝 내 휴무신청<span class="small">›</span></a>' : ''}</div>`);
  wireTop();
  const on = (id, fn) => { if ($(id)) $(id).onclick = ev => { ev.preventDefault(); fn(); }; };
  on('goNeed', () => sched.staffingScreen(s, again));
  on('goEdit', () => sched.scheduleEditor(s, again));
  on('goLvAdm', () => sched.leaveAdmin(s, again));
  on('goSched', () => sched.scheduleView(s, me.id, again));
  on('goMonth', () => records.monthScreen(s, again, null, false));
  on('goStaff', () => staff.staffScreen(s, again, false));
  on('goNotice', () => info.noticeScreen(s, again, me.name));
  on('goMyInfo', () => info.myInfoScreen(s, me, again));
  on('goMyRec', () => attend.myRecords(s, me, again));
  on('goMyLeave', () => sched.leaveForm(s, me, again));
}

// 사장님이 번호를 다시 정해 준 뒤 임시 비밀번호로 로그인하면: 새 비밀번호 정하기
function newPinScreen(storeId, m) {
  show(`${top('MATE')}<div class="card hero"><div class="small">로그인 됐어요</div><div class="big">새 비밀번호 정하기</div>
      <p>${esc(m.name)}님, 사장님이 만든 <b>임시 비밀번호</b>로 들어왔어요.<br>임시 비밀번호는 한 번만 써요. 앞으로 쓸 <b>내 비밀번호</b>(숫자 6자리)를 새로 정해 주세요.</p></div>
    <div class="card"><label>앞으로 쓸 새 비밀번호 (임시 비밀번호와 다르게)</label><input id="np" type="password" inputmode="numeric" maxlength="6" autocomplete="new-password">
      <label>새 비밀번호 한 번 더</label><input id="np2" type="password" inputmode="numeric" maxlength="6" autocomplete="new-password">
      <button id="npGo" style="margin-top:16px">이 비밀번호로 정하기</button></div>`);
  wireTop();
  $('npGo').onclick = e => busy(e.target, async () => {
    const pw = $('np').value;
    if (!/^\d{6}$/.test(pw)) throw new Error('비밀번호는 숫자 6자리예요');
    if (pw !== $('np2').value) throw new Error('두 비밀번호가 달라요');
    if (pw === lastPw) throw new Error('임시 비밀번호와 다른, 앞으로 쓸 새 비밀번호를 넣어 주세요');
    await api.changePin(storeId, pw);
    ls.del('mate_tab');
    // 비밀번호를 바꾸면 로그인이 풀리기도 함 → 그때는 로그인 화면에서 새 비밀번호로
    if (!api.auth.currentUser) return toast('새 비밀번호로 바꿨어요. 새 비밀번호로 다시 로그인해 주세요');
    toast('새 비밀번호로 바꿨어요');
    await staffHome(storeId).catch(err => { if (api.auth.currentUser) throw err; });
  });
}

// ---------- 사장님·총괄 홈 ----------
async function ownerHome() {
  setNav(null);
  const [orgs, mine] = await Promise.all([api.myOrgs(), api.myStores()]);
  const org = orgs[0] || null;
  const all = new Map(mine.map(s => [s.id, s]));
  if (org) (await api.orgStores(org.id)).forEach(s => { if (!all.has(s.id)) all.set(s.id, s); });
  const stores = [...all.values()].sort((a, b) => (a.name < b.name ? -1 : 1));
  const inviteCode = ls.get('mate_owner');
  let invite = null;
  if (inviteCode) {
    invite = await api.ownerInvite(inviteCode).catch(() => null);
    if (!invite || invite.usedBy) { ls.del('mate_owner'); if (inviteCode) toast(invite ? '이미 사용한 초대예요' : '초대를 찾을 수 없어요'); invite = null; }
  }
  const uid = api.auth.currentUser.uid;
  const name = api.auth.currentUser.displayName || '';
  show(`${top('MATE')}
    <h1>${esc(name)} ${org ? '<span class="pill on">총괄</span>' : '<span class="pill">사장님</span>'}</h1>
    ${invite ? `<div class="card hero"><b>매장 만들기 초대를 받으셨어요</b><p class="small">아래 버튼으로 내 매장을 만들어 주세요.</p><button id="mkInv" style="margin-top:8px">초대받은 매장 만들기</button></div>` : ''}
    <h2>매장</h2>
    ${stores.length ? stores.map(s => {
      const own = s.ownerUids.includes(uid);
      return `<a href="#" class="card row between" data-store="${s.id}" style="color:inherit;text-decoration:none;display:flex">
        <div><b>${esc(s.name)}</b><div class="small">${s.direct ? '직영' : own ? '내 매장' : '다른 사장님 매장 · 합계만 보기'}</div></div><span class="small">›</span></a>`;
    }).join('') : '<div class="card"><p class="small">아직 매장이 없어요.</p></div>'}
    ${org ? `<h2>총괄</h2>
      <button id="mkDirect">새 직영 매장 만들기</button>
      <div class="card"><b>다른 사장님께 매장 만들기 초대</b><p class="small">링크를 받은 사장님이 구글로 로그인해서 매장을 만들어요. 링크 하나에 매장 하나, 한 번만 쓸 수 있어요.</p>
      <button class="ghost" id="mkOwnerInv" style="margin-top:8px">초대 링크 만들기</button><div id="ownerInvOut"></div></div>` : ''}
    ${!org && !invite && !stores.length ? '<div class="card"><p>매장을 만들려면 대표님의 <b>매장 만들기 초대 링크</b>가 필요해요.</p></div>' : ''}`);
  wireTop();
  document.querySelectorAll('[data-store]').forEach(a => {
    a.onclick = ev => { ev.preventDefault(); const s = all.get(a.dataset.store); s.ownerUids.includes(uid) ? storeScreen(s.id) : statsScreen(s); };
  });
  if ($('mkInv')) $('mkInv').onclick = () => storeForm({ orgId: invite.orgId, direct: false, inviteCode });
  if ($('mkDirect')) $('mkDirect').onclick = () => storeForm({ orgId: org.id, direct: true });
  if ($('mkOwnerInv')) $('mkOwnerInv').onclick = e => busy(e.target, async () => {
    const code = await api.createOwnerInvite(org.id);
    $('ownerInvOut').innerHTML = linkCard({ title: '매장 만들기 초대', desc: '이 링크를 사장님께 보내 주세요.', url: `${BASE}?owner=${code}`, qr: false })
      + linkCard({ title: '사장님 안내서', desc: '처음 쓰는 방법이에요. 초대 링크와 같이 보내 주세요.', url: new URL('guide.html', BASE).href, qr: false });
    wireLinks();
  });
}

// ---------- 매장 규칙 입력 (만들기·바꾸기 같이 씀) ----------
function rulesFields(r) {
  const days = new Set(r.open.days);
  const dowSel = (id, v) => `<select id="${id}">${DOW_ORDER.map(d => `<option value="${d}" ${d === v ? 'selected' : ''}>${DOW[d]}요일</option>`).join('')}</select>`;
  return `
    <label>영업 요일</label>
    <div class="chk chk7">${DOW_ORDER.map(d => `<label><input type="checkbox" name="day" value="${d}" ${days.has(d) ? 'checked' : ''}><span>${DOW[d]}</span></label>`).join('')}</div>
    <div class="row"><div style="flex:1"><label>정시 출근</label><input id="st" type="time" step="300" value="${esc(r.open.startTime)}"></div>
      <div style="flex:1"><label>지각 아닌 시간(분)</label><input id="gr" type="number" min="0" max="60" inputmode="numeric" value="${r.open.lateGraceMin}"></div></div>
    <div class="row"><div style="flex:1"><label>기본 시급(원)</label><input id="wg" type="number" min="0" step="10" inputmode="numeric" value="${r.pay.baseWage ?? ''}" placeholder="10030"></div>
      <div style="flex:1"><label>급여일(매달)</label><input id="pd" type="number" min="1" max="31" inputmode="numeric" value="${r.pay.payday ?? ''}" placeholder="10"></div></div>
    <label class="row" style="gap:8px;margin-top:14px"><input type="checkbox" id="jh" style="width:auto" ${r.pay.juhu.on ? 'checked' : ''}> 주휴수당 줌 (한 주 ${r.pay.juhu.minWeekHours}시간 이상)</label>
    <label>휴무신청 열림</label><div class="row">${dowSel('lo', r.leave.opensDow)}<input id="lot" type="time" step="1800" value="${esc(r.leave.opensTime)}"></div>
    <label>휴무신청 마감</label><div class="row">${dowSel('lc', r.leave.closesDow)}<input id="lct" type="time" step="1800" value="${esc(r.leave.closesTime)}"></div>
    <p class="small" style="margin-top:12px">요일별 정직원·알바 인원은 ☰ 더보기 → 👥 요일별 인원에서 정해요.</p>
    <p class="small">야간·휴일 수당, 시간 올림/내림은 급여 단계에서 더 바꿀 수 있게 이어서 만들 예정이에요.</p>`;
}
function readRules(base) {
  const r = clone(base);
  r.open.days = [...document.querySelectorAll('input[name=day]:checked')].map(i => +i.value);
  r.open.startTime = $('st').value || '18:00';
  r.open.lateGraceMin = Math.max(0, +$('gr').value || 0);
  r.pay.baseWage = $('wg').value ? +$('wg').value : null;
  r.pay.payday = $('pd').value ? +$('pd').value : null;
  r.pay.juhu.on = $('jh').checked;
  r.leave.opensDow = +$('lo').value; r.leave.opensTime = $('lot').value || '00:00';
  r.leave.closesDow = +$('lc').value; r.leave.closesTime = $('lct').value || '22:00';
  r.staffing = r.staffing || clone(STORE_RULES_DEFAULT.staffing);
  document.querySelectorAll('input[name=need]').forEach(i => { r.staffing.need[+i.dataset.d] = Math.max(0, Math.round(+i.value || 0)); });
  if (!r.open.days.length) throw new Error('영업 요일을 하루 이상 골라 주세요');
  if (!r.pay.baseWage) throw new Error('기본 시급을 넣어 주세요');
  return r;
}

function storeForm(ctx) {
  show(`${top('새 매장 만들기', true)}
    <div class="card"><label>매장 이름</label><input id="sn" maxlength="40" placeholder="예: 산성 2호점">
    <p class="small">처음 값은 산성 규칙이에요. 다른 것만 바꾸세요. 나중에도 바꿀 수 있어요.</p>
    ${rulesFields(STORE_RULES_DEFAULT)}
    <button id="save" style="margin-top:16px">매장 만들기</button></div>`);
  wireTop(ownerHome);
  $('save').onclick = e => busy(e.target, async () => {
    const name = $('sn').value.trim();
    if (!name) throw new Error('매장 이름을 넣어 주세요');
    const rules = readRules(STORE_RULES_DEFAULT);
    const id = await api.createStore({ ...ctx, name, rules });
    if (!ctx.direct) ls.del('mate_owner');
    toast('매장을 만들었어요');
    storeScreen(id);
  });
}

// ---------- 매장 화면 (그 매장 사장님) ----------
// 사장님: 매장 열기 → 아래 탭 (오늘 · 승인 · 더보기)
async function storeScreen(id, tab) {
  const s = await api.getStore(id);
  api.ensureStoreName(s).catch(e => console.error('매장 이름 등록', e)); // 예전에 만든 매장도 이름 검색되게
  return startTabs({ store: s, me: null, admin: true, owner: true }, tab);
}

// 더보기 (사장님): 직원 가입 링크·직원 목록·근무표·기록·매장 규칙·출퇴근 확인
async function ownerMore(id, again) {
  const s = await api.getStore(id);
  CTX.store = s;
  const [ms, rules, attendHtml, wages] = await Promise.all([api.members(id), api.rulesOf(id), attend.ownerSection(s), api.wagesAll(id)]);
  const W = Object.fromEntries(wages.map(w => [w.id, w]));
  staff.finishHires(s, ms).catch(e => console.error('입사 시급', e));
  const act = ms.filter(m => api.isActive(m)).sort((a, b) => (a.name < b.name ? -1 : 1));
  const gone = ms.filter(m => api.isGone(m)).sort((a, b) => (a.name < b.name ? -1 : 1));
  const r = rules.current;
  show(`${top(s.name)}
    ${linkCard({ title: '직원 가입', desc: `직원은 앱 첫 화면 [직원 · 로그인 / 가입] → 매장 이름 <b>${esc(s.name)}</b> 검색 → 이름·비밀번호로 가입 신청하면 ✅ 승인 탭에 떠요. 이 링크나 QR로 들어오면 검색 없이 바로 돼요.`,
      url: `${BASE}?join=${s.joinCode}`, qr: true, extra: '<button class="sm ghost" id="regen">새 링크로 바꾸기</button>' })}
    <div class="row between"><h2>직원 ${act.length}명</h2><span class="row" style="gap:6px"><button class="sm ghost" id="goNotice">📢 공지</button><button class="sm" id="goStaff">🙋 입사 · 퇴사</button></span></div>
    <div class="card">${act.length ? `<div class="list">${act.map(m => `
      <div class="item" style="display:block"><div class="row between"><span><b>${esc(m.name)}</b> <span class="pill">${m.type === '정' ? '정직원' : '알바'}</span>
        ${m.role === 'manager' ? '<span class="pill on">매니저</span>' : ''}${m.startTime ? ` <span class="small">정시 ${esc(m.startTime)}</span>` : ''}${(() => { const w = pay.wageOf(W[m.id], api.month(), r, m.type === '정'); return w ? ` <span class="small">${m.type === '정' ? '월급' : '시급'} ${w.toLocaleString()}</span>` : ''; })()}${m.noJuhu ? ' <span class="small">주휴 없음</span>' : ''}${m.leaveDate ? ` <span class="pill warn">${esc(m.leaveDate.slice(5).replace('-', '/'))} 퇴사</span>` : ''}</span>
        <button class="sm ghost" data-mset="${m.id}">설정</button></div><div id="ms_${m.id}"></div></div>`).join('')}</div>`
      : '<p class="small">아직 승인된 직원이 없어요.</p>'}
      <p class="small">매니저는 근무표·출퇴근 고치기·휴무신청·매출을 다뤄요. 시급·계좌·정산표는 사장님만 봐요. 휴무신청은 알바만 내요.</p>
      ${gone.length ? `<details style="margin-top:10px"><summary class="small">퇴사한 직원 ${gone.length}명</summary><div class="list">${gone.map(m => `
        <div class="item"><span>${esc(m.name)}</span><button class="sm ghost" data-back="${m.id}" data-name="${esc(m.name)}">다시 일함</button></div>`).join('')}</div>
        <p class="small">퇴사해도 지난 출퇴근 기록은 그대로 남아요.</p></details>` : ''}</div>
    <h2>근무표</h2>
    <button class="ghost" id="goNeed" style="margin-bottom:8px">👥 요일별 인원 (정직원·알바)</button>
    <div class="row" style="gap:8px"><button class="ghost" id="goEdit">근무표 짜기</button><button class="ghost" id="goLvAdm">휴무신청 현황</button></div>
    <button class="ghost" id="goSched" style="margin-top:8px">확정된 근무표 보기</button>
    <h2>기록 · 급여</h2>
    <button id="goPay">💰 급여 · 정산표</button>
    <button class="ghost" id="goMonth" style="margin-top:8px">월 근무 기록 · 엑셀</button>
    <h2>매장 규칙</h2>
    <div class="card">${r ? `<table class="kv">
      <tr><td>영업 요일</td><td>${DOW_ORDER.filter(d => r.open.days.includes(d)).map(d => DOW[d]).join(' ')}</td></tr>
      <tr><td>정시 출근</td><td>${esc(r.open.startTime)}${r.open.lateGraceMin ? ` (${r.open.lateGraceMin}분까지 지각 아님)` : ''}</td></tr>
      <tr><td>기본 시급</td><td>${r.pay.baseWage ? r.pay.baseWage.toLocaleString() + '원' : '-'}</td></tr>
      <tr><td>주휴수당</td><td>${r.pay.juhu.on ? '줌' : '안 줌'}</td></tr>
      <tr><td>급여일</td><td>${r.pay.payday ? '매달 ' + r.pay.payday + '일' : '-'}</td></tr>
      <tr><td>휴무신청</td><td>${DOW[r.leave.opensDow]} ${esc(r.leave.opensTime)} ~ ${DOW[r.leave.closesDow]} ${esc(r.leave.closesTime)}</td></tr></table>
      <p class="small">${r.id}부터 적용${rules.next ? ` · <b>${rules.next.id}부터 바뀐 규칙 예약됨</b>` : ''}</p>` : '<p class="small">규칙이 없어요.</p>'}
      <button class="ghost" id="editRules" style="margin-top:10px">규칙 바꾸기</button></div>
    ${attendHtml.settings}
    <h2>다른 매장</h2><button class="ghost" id="goStores">매장 목록 · 총괄 화면</button>
    <p class="small" style="text-align:center"><a href="guide.html" target="_blank" style="color:var(--sub)">사장님 안내서 보기 ›</a></p>`);
  wireTop(); wireLinks();
  attend.wireOwnerSection(s, again);
  $('goStores').onclick = () => ownerHome();
  $('goMonth').onclick = () => records.monthScreen(s, again, null, true);
  $('goPay').onclick = () => pay.payrollScreen(s, again);
  document.querySelectorAll('[data-mset]').forEach(b => {
    b.onclick = () => {
      const m = act.find(x => x.id === b.dataset.mset), host = $('ms_' + m.id);
      if (host.innerHTML) { host.innerHTML = ''; return; }
      host.innerHTML = `<div class="card" style="margin:8px 0 0">
        <label>구분</label><select id="mt"><option value="알" ${m.type !== '정' ? 'selected' : ''}>알바 (휴무신청 냄)</option><option value="정" ${m.type === '정' ? 'selected' : ''}>정직원</option></select>
        <label>역할</label><select id="mr"><option value="staff" ${m.role !== 'manager' ? 'selected' : ''}>직원</option><option value="manager" ${m.role === 'manager' ? 'selected' : ''}>매니저</option></select>
        <label>개인 정시 출근 <span class="small">(비우면 매장 정시 ${esc(r ? r.open.startTime : '18:00')})</span></label><input type="time" id="mst" step="300" value="${esc(m.startTime || '')}">
        <label id="mwl">${m.type === '정' ? '월급(원)' : '시급(원)'} <span class="small">${m.type === '정' ? '' : `(비우면 매장 기본 ${r && r.pay.baseWage ? r.pay.baseWage.toLocaleString() : '-'}원)`}</span></label>
        <input type="number" id="mw" min="0" step="10" inputmode="numeric" value="${(() => { const h = ((W[m.id] || {}).history || []).filter(x => x.from <= api.month()).pop(); return h ? h.wage : ''; })()}">
        <div class="row" style="gap:6px;margin-top:6px"><label style="margin:0;display:flex;gap:6px;align-items:center"><input type="radio" name="mwf" value="now" checked style="width:auto">이번 달부터</label>
          <label style="margin:0;display:flex;gap:6px;align-items:center"><input type="radio" name="mwf" value="next" style="width:auto">다음 달부터</label></div>
        <label style="display:flex;gap:8px;align-items:center;margin-top:10px"><input type="checkbox" id="mnj" ${m.noJuhu ? 'checked' : ''} style="width:auto">주휴수당 없음 <span class="small">(계약상 주휴 미포함인 알바)</span></label>
        <button id="msv" style="margin-top:12px">저장</button>
        <div class="row" style="gap:8px;margin-top:12px"><button class="sm ghost" id="mpin">비밀번호 임의 재설정</button></div>
        <div id="mpinOut"></div></div>`;
      $('msv').onclick = e => busy(e.target, async () => {
        await api.setMember(id, m.id, { type: $('mt').value, role: $('mr').value, startTime: $('mst').value || null, noJuhu: $('mnj').checked });
        const curW = (((W[m.id] || {}).history || []).filter(x => x.from <= api.month()).pop() || {}).wage || '';
        const nw = $('mw').value ? Math.round(+$('mw').value) : '', from = document.querySelector('input[name=mwf]:checked').value === 'next' ? api.month(new Date(), 1) : api.month();
        if (String(nw) !== String(curW) || from !== api.month()) await api.setWage(id, m.id, from, nw || null);
        toast('저장했어요'); again();
      });
      $('mpin').onclick = e => {
        if (!confirm(m.name + '님이 비밀번호를 잊었나요? 임시 비밀번호를 만들면 지금 비밀번호는 더 이상 안 돼요.')) return;
        busy(e.target, async () => {
          const { pin } = await api.resetPin(id, m.id);
          const msg = `${m.name}님, MATE 임시 비밀번호는 ${pin} 이에요. 앱에서 이름과 이 비밀번호로 로그인하면 새 비밀번호를 정할 수 있어요.`;
          $('mpinOut').innerHTML = `<div class="card hero" style="margin:10px 0 0"><div class="small">임시 비밀번호 (본인에게만 알려 주세요)</div>
            <div class="big" style="letter-spacing:4px">${pin}</div><button class="sm" id="mpinCp" style="margin-top:8px">카톡 문구 복사</button></div>`;
          $('mpinCp').onclick = () => copy(msg);
        });
      };
    };
  });
  document.querySelectorAll('[data-back]').forEach(b => { b.onclick = () => { if (confirm(b.dataset.name + '님을 다시 직원으로 돌릴까요?')) busy(b, async () => { await api.setMember(id, b.dataset.back, { status: 'active', leaveDate: null }); toast('다시 직원이 됐어요'); again(); }); }; });
  $('goStaff').onclick = () => staff.staffScreen(s, again, true);
  $('goNeed').onclick = () => sched.staffingScreen(s, again);
  $('goNotice').onclick = () => info.noticeScreen(s, again, '사장님');
  $('goEdit').onclick = () => sched.scheduleEditor(s, again);
  $('goLvAdm').onclick = () => sched.leaveAdmin(s, () => again());
  $('goSched').onclick = () => sched.scheduleView(s, null, () => again());
  $('regen').onclick = e => { if (confirm('지금 링크는 더 이상 안 돼요. 새 링크로 바꿀까요?')) busy(e.target, async () => { await api.newJoinCode(s); again(); }); };
  $('editRules').onclick = () => rulesScreen(s, (rules.next || r || { ...STORE_RULES_DEFAULT }));
}

function rulesScreen(s, base) {
  const now = api.month(), next = api.month(new Date(), 1);
  show(`${top('매장 규칙 바꾸기', true)}<div class="card">${rulesFields(base)}
    <label>언제부터</label><div class="row"><button class="sm ghost" id="fNow">이번 달부터 (${now})</button><button class="sm" id="fNext">다음 달부터 (${next})</button></div>
    <p class="small">이번 달부터 = 이번 달 1일부터 다시 계산. 다음 달부터 = 지금 달 급여는 그대로.</p></div>`);
  wireTop(() => storeScreen(s.id, 'more'));
  const save = from => async e => busy(e.target, async () => {
    const { id, from: _f, ...plain } = base;
    const r = readRules({ ...clone(STORE_RULES_DEFAULT), ...clone(plain) });
    await api.saveRules(s.id, from, r);
    toast(from + '부터 적용돼요'); storeScreen(s.id, 'more');
  });
  $('fNow').onclick = save(now); $('fNext').onclick = save(next);
}

// ---------- 총괄: 다른 사장님 매장 = 합계만 ----------
async function statsScreen(s) {
  setNav(null);
  const st = (await api.stats(s.id)).sort((a, b) => (a.id < b.id ? 1 : -1));
  const pct = v => (v == null ? '-' : Math.round(v * 1000) / 10 + '%');
  show(`${top(s.name, true)}<p class="small">다른 사장님 매장이라 월 합계와 요일별 숫자만 보여요.</p>
    ${st.length ? st.map(m => `<div class="card"><b>${esc(m.id)}</b><table class="kv">
      <tr><td>매출</td><td>${m.sales != null ? m.sales.toLocaleString() + '원' : '-'}</td></tr>
      <tr><td>인건비</td><td>${m.laborCost != null ? m.laborCost.toLocaleString() + '원' : '-'}</td></tr>
      <tr><td>인건비율</td><td>${pct(m.laborRatio)}</td></tr>
      <tr><td>근무 시간</td><td>${m.hours != null ? m.hours + '시간' : '-'}</td></tr></table>
      ${m.byWeekday ? `<div class="week" style="margin-top:10px">${DOW_ORDER.map(d => `<div class="day"><b>${DOW[d]}</b><span>${m.byWeekday[d] ?? '-'}</span></div>`).join('')}</div><p class="small">요일별 평균 근무 인원</p>` : ''}</div>`).join('')
      : '<div class="card"><p class="small">아직 정산한 달이 없어요. 그 매장 사장님이 월말 정산표를 만들면 여기에 쌓여요.</p></div>'}`);
  wireTop(ownerHome);
}

// 연습용 서버 자동 시험에서만 쓰는 손잡이
if (api.testGoogle) window.__mate = { testGoogle: api.testGoogle, auth: api.auth };
