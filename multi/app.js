// 산성 MATE 여러 매장용 화면: 로그인, 매장 만들기, 초대 가입, 승인, 매장 규칙 (출퇴근은 attend.js)
import * as api from './fb.js';
import { STORE_RULES_DEFAULT } from './defaults.js';
import { $, esc, DOW, DOW_ORDER, BASE, ls, clone, toast, show, top, wireTop, busy, niceErr, linkCard, wireLinks } from './ui.js';
import * as attend from './attend.js';
// ---------- 주소로 들어온 정보 (초대 링크) ----------
const params = new URLSearchParams(location.search);
if (params.get('join')) ls.set('mate_join', params.get('join').toUpperCase());
if (params.get('owner')) ls.set('mate_owner', params.get('owner').toUpperCase());
if (params.get('s')) ls.set('mate_store', params.get('s'));
if ([...params.keys()].length) history.replaceState(null, '', location.pathname); // 주소창 깔끔하게

// ---------- 시작 ----------
let hold = false; // 가입 중에는 로그인 알림으로 화면이 먼저 바뀌지 않게
if (!api.configured) {
  show(`<div class="splash"><div class="t2">MATE</div><p>서버 설정 전이에요.<br><code>multi/config.js</code>에 Firebase 값을 넣어 주세요.</p></div>`);
} else {
  show('<div class="splash"><div class="t2">MATE</div><p class="small">불러오는 중…</p></div>');
  api.onUser(user => hold || route(user).catch(e => { console.error(e); show(`<div class="card"><b>오류</b><p>${esc(niceErr(e))}</p><button id="rt">다시 시도</button></div>`); $('rt').onclick = () => route(api.auth.currentUser); }));
}

async function route(user) {
  if (!user) {
    if (ls.get('mate_join')) return joinScreen(ls.get('mate_join'));
    if (ls.get('mate_owner')) return landing('invite');
    if (ls.get('mate_store')) return staffLoginScreen();
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
    <div style="width:100%;margin-top:18px"><button id="g">사장님 · 구글로 로그인</button>
    <p class="small" style="margin-top:14px">직원은 사장님이 보낸 <b>초대 링크</b>로 들어와 주세요.<br>이미 가입했다면 그 링크로 열면 로그인 화면이 나와요.</p></div></div>`);
  $('g').onclick = e => busy(e.target, () => api.googleLogin());
}

// ---------- 직원: 초대 링크로 가입 / 로그인 ----------
async function joinScreen(code, tab = 'join') {
  const j = await api.joinInfo(code).catch(() => null);
  if (!j) {
    ls.del('mate_join');
    show(`${top('MATE')}<div class="card"><b>초대 링크가 바뀌었거나 없어졌어요</b><p>사장님께 새 초대 링크를 받아 주세요.</p></div>`);
    return wireTop();
  }
  ls.set('mate_store', j.storeId); ls.set('mate_store_name', j.storeName);
  const isJoin = tab === 'join';
  show(`<div class="top"><div class="brand"><span>MATE</span></div></div>
    <div class="card hero"><div class="small">초대받은 매장</div><div class="big">${esc(j.storeName)}</div></div>
    <div class="row" style="margin:10px 0"><button class="sm ${isJoin ? '' : 'ghost'}" id="tj">처음 가입</button><button class="sm ${isJoin ? 'ghost' : ''}" id="tl">이미 가입했어요</button></div>
    <div class="card">
      <label>이름 (실명)</label><input id="nm" autocomplete="name" maxlength="20" placeholder="홍길동">
      <label>내 번호 6자리 ${isJoin ? '<span class="small">(로그인할 때 써요. 잊지 마세요)</span>' : ''}</label>
      <input id="pw" type="password" inputmode="numeric" maxlength="6" autocomplete="${isJoin ? 'new-password' : 'current-password'}" placeholder="●●●●●●">
      ${isJoin ? '<label>한 번 더</label><input id="pw2" type="password" inputmode="numeric" maxlength="6" autocomplete="new-password" placeholder="●●●●●●">' : ''}
      <button id="go" style="margin-top:16px">${isJoin ? '가입 신청' : '로그인'}</button>
      ${isJoin ? '<p class="small">신청하면 사장님이 확인하고 승인해요.</p>' : ''}
    </div>`);
  $('tj').onclick = () => joinScreen(code, 'join');
  $('tl').onclick = () => joinScreen(code, 'login');
  $('go').onclick = e => busy(e.target, async () => {
    const name = $('nm').value.trim(), pw = $('pw').value;
    if (!name) throw new Error('이름을 넣어 주세요');
    if (!/^\d{6}$/.test(pw)) throw new Error('번호는 숫자 6자리예요');
    if (isJoin) {
      if (pw !== $('pw2').value) throw new Error('두 번호가 달라요');
      hold = true;
      try { await api.staffSignup(j.storeId, code, name, pw); }
      catch (err) { if (api.auth.currentUser) await api.logout(); throw err; }
      finally { hold = false; }
      ls.del('mate_join');
      await route(api.auth.currentUser);
    } else {
      await api.staffLogin(j.storeId, name, pw);
      ls.del('mate_join');
    }
  });
}

function staffLoginScreen() {
  const storeId = ls.get('mate_store'), storeName = ls.get('mate_store_name');
  show(`<div class="top"><div class="brand"><span>MATE</span></div></div>
    <div class="card hero"><div class="small">매장</div><div class="big">${esc(storeName || '내 매장')}</div></div>
    <div class="card"><label>이름</label><input id="nm" autocomplete="name" maxlength="20">
      <label>내 번호 6자리</label><input id="pw" type="password" inputmode="numeric" maxlength="6" autocomplete="current-password">
      <button id="go" style="margin-top:16px">로그인</button></div>
    <p class="small" style="text-align:center">처음이면 사장님이 보낸 초대 링크로 가입해 주세요.<br><a href="#" id="own" style="color:var(--sub)">사장님 로그인</a></p>`);
  $('go').onclick = e => busy(e.target, async () => {
    const name = $('nm').value.trim(), pw = $('pw').value;
    if (!name || !/^\d{6}$/.test(pw)) throw new Error('이름과 번호 6자리를 넣어 주세요');
    await api.staffLogin(storeId, name, pw);
  });
  $('own').onclick = ev => { ev.preventDefault(); landing(); };
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
  if (m.status === 'left') {
    show(`${top('MATE')}<div class="card"><b>퇴사 처리된 계정이에요</b><p>다시 일하게 되면 사장님께 말해 주세요.</p></div>`);
    return wireTop();
  }
  const s = await api.getStore(storeId);
  ls.set('mate_store_name', s.name);
  return attend.staffHome(storeId, m, s, () => staffHome(storeId));
}

// ---------- 사장님·총괄 홈 ----------
async function ownerHome() {
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
    $('ownerInvOut').innerHTML = linkCard({ title: '매장 만들기 초대', desc: '이 링크를 사장님께 보내 주세요.', url: `${BASE}?owner=${code}`, qr: false });
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
    <p class="small">야간·휴일 수당, 시간 올림/내림은 매장 규칙 화면에서 더 바꿀 수 있게 이어서 만들 예정이에요.</p>`;
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
async function storeScreen(id) {
  const s = await api.getStore(id);
  const [ms, rules, attendHtml] = await Promise.all([api.members(id), api.rulesOf(id), attend.ownerSection(s)]);
  const pending = ms.filter(m => m.status === 'pending');
  const act = ms.filter(m => m.status === 'active').sort((a, b) => (a.name < b.name ? -1 : 1));
  const r = rules.current;
  show(`${top(s.name, true)}${attendHtml.head}
    ${pending.length ? `<div class="card hero"><b>가입 신청 ${pending.length}명</b><div class="list">${pending.map(m => `
      <div class="item"><span><b>${esc(m.name)}</b></span><span class="row" style="gap:6px">
        <button class="sm" data-ok="${m.id}">승인</button><button class="sm ghost" data-no="${m.id}" data-name="${esc(m.name)}">거절</button></span></div>`).join('')}</div>
      <p class="small">본인이 맞는지 확인하고 승인해 주세요. 거절하면 가입 신청이 지워져요.</p></div>` : ''}
    ${linkCard({ title: '직원 초대', desc: '단톡방에 이 링크나 QR을 올려 주세요. 직원이 이름과 번호 6자리로 가입하면 위에 승인 요청이 떠요.',
      url: `${BASE}?join=${s.joinCode}`, qr: true, extra: '<button class="sm ghost" id="regen">새 링크로 바꾸기</button>' })}
    <h2>직원 ${act.length}명</h2>
    <div class="card">${act.length ? `<div class="list">${act.map(m => `
      <div class="item"><span><b>${esc(m.name)}</b> ${m.role === 'manager' ? '<span class="pill on">매니저</span>' : ''}</span>
        <button class="sm ghost" data-role="${m.id}" data-to="${m.role === 'manager' ? 'staff' : 'manager'}">${m.role === 'manager' ? '직원으로' : '매니저로'}</button></div>`).join('')}</div>`
      : '<p class="small">아직 승인된 직원이 없어요.</p>'}
      <p class="small">매니저는 스케줄·출퇴근 고치기·휴무신청·매출을 다뤄요. 시급·계좌·정산표는 사장님만 봐요.</p></div>
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
    ${attendHtml.settings}`);
  wireTop(ownerHome); wireLinks();
  attend.wireOwnerSection(s, () => storeScreen(id));
  document.querySelectorAll('[data-ok]').forEach(b => { b.onclick = () => busy(b, async () => { await api.setMember(id, b.dataset.ok, { status: 'active' }); toast('승인했어요'); storeScreen(id); }); });
  document.querySelectorAll('[data-no]').forEach(b => { b.onclick = () => { if (confirm(b.dataset.name + '님 가입 신청을 거절할까요?')) busy(b, async () => { await api.removeMember(id, b.dataset.no); storeScreen(id); }); }; });
  document.querySelectorAll('[data-role]').forEach(b => { b.onclick = () => busy(b, async () => { await api.setMember(id, b.dataset.role, { role: b.dataset.to }); storeScreen(id); }); });
  $('regen').onclick = e => { if (confirm('지금 링크는 더 이상 안 돼요. 새 링크로 바꿀까요?')) busy(e.target, async () => { await api.newJoinCode(s); storeScreen(id); }); };
  $('editRules').onclick = () => rulesScreen(s, (rules.next || r || { ...STORE_RULES_DEFAULT }));
}

function rulesScreen(s, base) {
  const now = api.month(), next = api.month(new Date(), 1);
  show(`${top('매장 규칙 바꾸기', true)}<div class="card">${rulesFields(base)}
    <label>언제부터</label><div class="row"><button class="sm ghost" id="fNow">이번 달부터 (${now})</button><button class="sm" id="fNext">다음 달부터 (${next})</button></div>
    <p class="small">이번 달부터 = 이번 달 1일부터 다시 계산. 다음 달부터 = 지금 달 급여는 그대로.</p></div>`);
  wireTop(() => storeScreen(s.id));
  const save = from => async e => busy(e.target, async () => {
    const { id, from: _f, ...plain } = base;
    const r = readRules({ ...clone(STORE_RULES_DEFAULT), ...clone(plain) });
    await api.saveRules(s.id, from, r);
    toast(from + '부터 적용돼요'); storeScreen(s.id);
  });
  $('fNow').onclick = save(now); $('fNext').onclick = save(next);
}

// ---------- 총괄: 다른 사장님 매장 = 합계만 ----------
async function statsScreen(s) {
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
