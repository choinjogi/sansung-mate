// 산성 앱에 없던 화면 (산성은 시트에서 하던 일) — 산성 화면 ☰ 더보기에 산성 모양 항목으로 붙임
// 화면 자체는 새 앱(multi)에서 만들고 시험한 것을 그대로 연다.
import * as api from '../multi/fb.js?v=27';
import * as sched from '../multi/sched.js?v=27';
import * as pay from '../multi/pay.js?v=27';
import * as records from '../multi/records.js?v=27';
import * as staff from '../multi/staff.js?v=27';
import * as info from '../multi/info.js?v=27';
import * as attend from '../multi/attend.js?v=27';
import * as rules from '../multi/rules.js?v=27';
import { STORE_RULES_DEFAULT } from '../multi/defaults.js?v=27';
import { $, esc, DOW, DOW_ORDER, BASE, ls, toast, show, top, wireTop, busy, linkCard, wireLinks } from '../multi/ui.js?v=27';

const item = (id, t) => `<a class="item" href="#" data-x="${id}" style="color:inherit;text-decoration:none"><span>${t}</span><span class="small">›</span></a>`;
const ROOT = location.origin + location.pathname;   // 이 앱 주소 (직원 초대 링크용)

// 더보기에 붙는 항목 (ME.role: '사장님' | '매니저')
function html(ME) {
  const own = ME.role === '사장님';
  return `<h2>근무표 · 직원</h2><div class="card list">
      ${item('edit', '🗓️ 근무표 짜기 · 확정')}${item('need', '👥 요일별 인원 (정직원·알바)')}${item('notice', '📢 공지 올리기')}${item('staff', '📋 입사 등록 (여러 명 한 번에)')}</div>
    <h2>기록 · 급여</h2><div class="card list">
      ${own ? item('pay', '💵 급여 · 정산표 · 엑셀') : ''}${item('month', '📊 월 근무 기록 · 엑셀')}</div>
    ${own ? `<h2>매장</h2><div class="card list">${item('store', '⚙️ 매장 설정 (규칙 · 와이파이 · 직원 가입 링크)')}${item('stores', '🏪 매장 목록 · 새 매장')}</div>` : ''}`;
}
async function wire(ME, back) {
  const c = await window.API._ctx(), s = c.store, own = ME.role === '사장님';
  const go = { edit: () => sched.scheduleEditor(s, back), need: () => sched.staffingScreen(s, back), notice: () => info.noticeScreen(s, back, ME.name),
    staff: () => staff.staffScreen(s, back, own), pay: () => pay.payrollScreen(s, back), month: () => records.monthScreen(s, back, null, own),
    store: () => storeSettings(s, back), stores: () => storesScreen(back) };
  document.querySelectorAll('[data-x]').forEach(a => { a.onclick = e => { e.preventDefault(); const f = go[a.dataset.x]; if (f) Promise.resolve(f()).catch(x => toast(x.message)); }; });
}

// ---------- ⚙️ 매장 설정 (사장님): 직원 가입 링크 · 매장 규칙 · 와이파이·위치 ----------
async function storeSettings(store, back) {
  const s = await api.getStore(store.id), [rr, att] = await Promise.all([api.rulesOf(s.id), attend.ownerSection(s)]), r = rr.current;
  const again = () => storeSettings(store, back);
  show(`${top('매장 설정', true)}
    ${linkCard({ title: '직원 가입', desc: `직원은 앱 첫 화면에서 매장 이름 <b>${esc(s.name)}</b>을 찾아 [처음 가입]해요. 이 링크나 QR로 들어오면 찾지 않아도 돼요.`,
      url: `${ROOT}?join=${s.joinCode}`, qr: true, extra: '<button class="sm ghost" id="regen">새 링크로 바꾸기</button>' })}
    <h2>매장 규칙</h2>
    <div class="card">${r ? `<table class="kv">
      <tr><td>영업 요일</td><td>${DOW_ORDER.filter(d => r.open.days.includes(d)).map(d => DOW[d]).join(' ')}</td></tr>
      <tr><td>정시 출근</td><td>${esc(r.open.startTime)}${r.open.lateGraceMin ? ` (${r.open.lateGraceMin}분까지 지각 아님)` : ''}</td></tr>
      <tr><td>기본 시급</td><td>${r.pay.baseWage ? r.pay.baseWage.toLocaleString() + '원' : '-'}</td></tr>
      <tr><td>주휴수당</td><td>${r.pay.juhu.on ? '줌' : '안 줌'}</td></tr>
      <tr><td>급여일</td><td>${r.pay.payday ? '매달 ' + r.pay.payday + '일' : '-'}</td></tr>
      <tr><td>휴무신청</td><td>${DOW[r.leave.opensDow]} ${esc(r.leave.opensTime)} ~ ${DOW[r.leave.closesDow]} ${esc(r.leave.closesTime)}</td></tr></table>
      <p class="small">${r.id}부터 적용${rr.next ? ` · <b>${rr.next.id}부터 바뀐 규칙 예약됨</b>` : ''}</p>` : '<p class="small">규칙이 없어요.</p>'}
      <button class="ghost" id="editRules" style="margin-top:10px">규칙 바꾸기</button></div>
    ${att.head}${att.settings}`);
  wireTop(back); wireLinks();
  attend.wireOwnerSection(s, again);
  $('regen').onclick = e => { if (confirm('지금 링크는 더 이상 안 돼요. 새 링크로 바꿀까요?')) busy(e.target, async () => { await api.newJoinCode(s); await again(); }); };
  $('editRules').onclick = () => rules.rulesScreen(s, rr.next || r || { ...STORE_RULES_DEFAULT }, again);
}

// ---------- 🏪 매장 목록 · 새 매장 (사장님 · 대표님) ----------
async function storesScreen(back) {
  const uid = api.auth.currentUser.uid, [orgs, mine] = await Promise.all([api.myOrgs(), api.myStores()]), org = orgs[0] || null;
  const all = new Map(mine.map(s => [s.id, s]));
  if (org) (await api.orgStores(org.id)).forEach(s => { if (!all.has(s.id)) all.set(s.id, s); });
  const stores = [...all.values()].sort((a, b) => (a.name < b.name ? -1 : 1)), cur = ls.get('mate_store');
  show(`${top('매장 목록', true)}
    <div class="card list">${stores.map(s => { const own = s.ownerUids.includes(uid);
      return `<a href="#" class="item" data-sid="${s.id}" style="color:inherit;text-decoration:none"><div><b>${esc(s.name)}</b>${s.id === cur ? ' <span class="pill on">지금</span>' : ''}<div class="small">${s.direct ? '직영' : own ? '내 매장' : '다른 사장님 매장 · 합계만 보기'}</div></div><span class="small">›</span></a>`; }).join('')}</div>
    ${org ? `<h2>대표님</h2><button id="mkDirect">새 직영 매장 만들기</button>
      <div class="card"><b>다른 사장님께 매장 만들기 초대</b><p class="small">링크를 받은 사장님이 구글로 로그인해서 매장을 만들어요. 링크 하나에 매장 하나, 한 번만 쓸 수 있어요.</p>
      <button class="ghost" id="mkInv" style="margin-top:8px">초대 링크 만들기</button><div id="invOut"></div></div>` : ''}`);
  wireTop(back);
  document.querySelectorAll('[data-sid]').forEach(a => {
    a.onclick = e => { e.preventDefault(); const s = all.get(a.dataset.sid);
      if (s.ownerUids.includes(uid)) { window.API.setStore(s.id, s.name); location.reload(); } else statsScreen(s, () => storesScreen(back)); };
  });
  if ($('mkDirect')) $('mkDirect').onclick = () => rules.storeForm({ orgId: org.id, direct: true }, () => storesScreen(back), (id, name) => { window.API.setStore(id, name); location.reload(); });
  if ($('mkInv')) $('mkInv').onclick = e => busy(e.target, async () => {
    const code = await api.createOwnerInvite(org.id);
    $('invOut').innerHTML = linkCard({ title: '매장 만들기 초대', desc: '이 링크를 사장님께 보내 주세요.', url: `${ROOT}?owner=${code}`, qr: false })
      + linkCard({ title: '사장님 안내서', desc: '처음 쓰는 방법이에요. 초대 링크와 같이 보내 주세요.', url: new URL('../multi/guide.html', ROOT).href, qr: false });
    wireLinks();
  });
}
async function statsScreen(s, back) {
  const st = (await api.stats(s.id)).sort((a, b) => (a.id < b.id ? 1 : -1)), pct = v => (v == null ? '-' : Math.round(v * 1000) / 10 + '%');
  show(`${top(s.name, true)}<p class="small">다른 사장님 매장이라 월 합계와 요일별 숫자만 보여요.</p>
    ${st.length ? st.map(m => `<div class="card"><b>${esc(m.id)}</b><table class="kv">
      <tr><td>매출</td><td>${m.sales != null ? m.sales.toLocaleString() + '원' : '-'}</td></tr><tr><td>인건비</td><td>${m.laborCost != null ? m.laborCost.toLocaleString() + '원' : '-'}</td></tr>
      <tr><td>인건비율</td><td>${pct(m.laborRatio)}</td></tr><tr><td>근무 시간</td><td>${m.hours != null ? m.hours + '시간' : '-'}</td></tr></table></div>`).join('')
      : '<div class="card"><p class="small">아직 정산한 달이 없어요.</p></div>'}`);
  wireTop(back);
}

// 초대받은 사장님(?owner=코드)이 구글로 로그인했는데 매장이 없으면: 새 매장 만들기
async function tryInvite(done) {
  const code = ls.get('mate_owner'); if (!code || !api.auth.currentUser) return false;
  const inv = await api.ownerInvite(code).catch(() => null);
  if (!inv || inv.usedBy) { ls.del('mate_owner'); return false; }
  rules.storeForm({ orgId: inv.orgId, direct: false, inviteCode: code }, () => { ls.del('mate_owner'); done(); }, (id, name) => { window.API.setStore(id, name); location.reload(); });
  return true;
}
// 대표님(총괄)인데 매장이 아직 없으면: 매장 목록(새 직영 매장 만들기)으로
async function tryOrg(done) {
  if (!api.auth.currentUser) return false;
  const orgs = await api.myOrgs().catch(() => []);
  if (!orgs.length) return false;
  await storesScreen(done); return true;
}

window.EXTRA = { html, wire, tryInvite, tryOrg };
