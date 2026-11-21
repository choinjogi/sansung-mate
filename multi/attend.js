// 출퇴근 화면: 직원 출근·퇴근 버튼, 오늘 출근 현황(매니저·사장님), 확인 필요 목록, 매장 와이파이·위치 설정
// 출근 ✓ = 매장 와이파이에서 찍음. 퇴근 ✓ = 매장 와이파이이거나 매장 반경 안. 나머지는 막지 않고 ⚠ (서버 함수가 판정)
import * as api from './fb.js?v=36';
import { $, esc, DOW, toast, show, top, wireTop, busy } from './ui.js?v=36';
import * as sched from './sched.js?v=36';
import * as records from './records.js?v=36';
import * as pay from './pay.js?v=36';
import * as info from './info.js?v=36';
import * as notify from './notify.js?v=36';

const toMin = hm => { const [h, m] = hm.split(':').map(Number); return h * 60 + m; };
const dayLabel = d => { const t = new Date(d + 'T12:00:00Z'); return `${t.getUTCMonth() + 1}/${t.getUTCDate()}(${DOW[t.getUTCDay()]})`; };
const km = m => (m >= 1000 ? (m / 1000).toFixed(1) + 'km' : m + 'm');
export const startOf = (member, rules) => (member && member.startTime) || (rules && rules.open && rules.open.startTime) || '18:00';
export function lateMin(inHm, start, grace = 0) {
  if (!inHm) return 0;
  const d = toMin(inHm) - toMin(start);
  return d > grace && d < 12 * 60 ? d : 0;
}
// 기록 옆에 붙는 설명
export function how(p) {
  if (!p) return '';
  if (p.via === 'manual') return '<span class="small">직접 넣음</span>';
  const edited = p.editedBy ? ' · 고침' : '';
  if (p.flag) return `<span class="pill warn">⚠ ${p.why === 'alone' ? '확인 없이 혼자 퇴근' : p.why === 'far' && p.dist != null ? '매장에서 ' + km(p.dist) : '매장 와이파이 아님'}${p.alone && p.why !== 'alone' ? ' · 혼자 퇴근' : ''}</span>${p.reviewed ? ' <span class="small">확인함</span>' : ''}${edited}`;
  return `<span class="pill ok">✓ ${p.wifi ? '매장 와이파이' : '매장 ' + km(p.dist)}</span>${edited ? '<span class="small">' + edited + '</span>' : ''}`;
}
function box(label, p, late, attrs = '') {
  const hm = p && api.hmOf(p.at);
  return `<div class="tbox${late ? ' late' : ''}" ${attrs}><div class="small">${label}${late ? ` · <span style="color:var(--warn)">${late}분 늦음</span>` : ''}</div>
    <div class="tval" style="color:${hm ? (late || p.flag ? 'var(--warn)' : 'var(--ok)') : 'var(--dim)'}">${esc(hm || '--:--')}</div><div class="thow">${how(p)}</div></div>`;
}

// ---------- 오늘 출퇴근 카드 (직원 홈 탭, 매니저는 오늘 탭 맨 위) ----------
let LAST = null; // 방금 찍은 결과 (⚠ 안내를 보여 주려고)
export async function punchCard(store, me, again) {
  const storeId = store.id, t = api.kst(), uid = api.auth.currentUser.uid;
  const [rules, tin, tout, sch] = await Promise.all([api.rulesOf(storeId), api.punchDoc(storeId, t.date, uid, 'in'), api.punchDoc(storeId, t.date, uid, 'out'), api.getSchedule(storeId, api.mondayOf(t.date))]);
  let date = t.date, pin = tin, pout = tout;
  if (!tin && !tout && t.hour < 12) { // 자정 넘겨 일하는 중이면 어제 근무를 보여 줌
    const y = api.addDays(t.date, -1);
    const [yin, yout] = await Promise.all([api.punchDoc(storeId, y, uid, 'in'), api.punchDoc(storeId, y, uid, 'out')]);
    if (yin && !yout) { date = y; pin = yin; pout = null; }
  }
  const r = rules.current, plan = sched.todayPlan(date === t.date ? sch : await api.getSchedule(storeId, api.mondayOf(date)), r, { ...me, id: uid }, date);
  const start = plan.start, late = lateMin(pin && api.hmOf(pin.at), start, r ? r.open.lateGraceMin : 0);
  const next = !pin && !pout ? 'in' : !pout ? 'out' : null;
  const res = LAST && LAST.date === date ? LAST : null;
  const html = `
    <div class="card hero">
      <div class="row between"><b>⏱️ ${date === t.date ? '오늘' : '어제'} ${dayLabel(date)}</b><span class="small">${plan.published ? esc(sched.codeText(plan.code)) + ' · ' : ''}${plan.early ? '일찍 부름 ' : '정시 '}${esc(start)}</span></div>
      <div class="tgrid">${box('출근', pin, late)}${box('퇴근', pout, 0)}</div>
      ${next === 'in' ? `<button id="pIn" class="big-btn">출근</button><button class="ghost sm" id="pOut0" style="width:100%;margin-top:8px">출근을 못 찍었어요 · 퇴근 찍기</button>`
        : next === 'out' ? '<button id="pOut" class="big-btn">퇴근</button>' : `<p style="text-align:center;margin-top:12px">오늘 근무 끝! 수고했어요</p>
          <p class="small" style="text-align:center">근무 구분: ${esc(SHIFT_TXT(pout))} · <a href="#" id="pShift" style="color:var(--sub)">바꾸기</a></p>`}
      <p class="small" style="margin-top:8px">매장 와이파이에 연결된 상태로 찍어 주세요. 일찍 찍어도 계산은 정시부터예요.</p>
    </div>
    ${res && res.why === 'alone' ? `<div class="card" style="border-color:var(--warn)"><b style="color:var(--warn)">⚠ 확인 없이 혼자 퇴근했어요</b><p>기록은 됐고, 사장님이 확인해요.</p></div>` : ''}
    ${res && res.flag && res.why !== 'alone' ? `<div class="card" style="border-color:var(--warn)"><b style="color:var(--warn)">⚠ 매장 와이파이로 찍히지 않았어요</b>
      <p>기록은 됐고, 사장님이 확인해요.</p>
      <p class="small">· 폰이 매장 와이파이에 연결돼 있는지 확인해 주세요 (모바일 데이터 말고)<br>
      · 아이폰: 설정 → Wi-Fi → 매장 와이파이 옆 ⓘ → <b>IP 주소 추적 제한</b> 끄기<br>
      ${res.geo ? '' : '· 위치 허용도 켜 주세요 (퇴근 확인에 써요)'}</p></div>` : ''}`;
  const wire = () => {
    const doPunch = (kind, alone) => e => busy(e.target, async () => {
      LAST = await api.punch(storeId, kind, alone);
      toast(`${LAST.time} ${kind === 'in' ? '출근' : '퇴근'}${LAST.flag ? ' (⚠ 확인 필요)' : ' ✓'}`);
      if (kind === 'out') return outDone(store, me, LAST.date, again);
      await again();
    });
    // 퇴근: 알바가 폰을 들고 사장님·매니저에게 가서 눌러 달라고 함 (비밀번호 없이 버튼만). 아무도 없으면 혼자 퇴근 → ⚠
    const outScreen = () => {
      show(`${top(store.name)}
        <div class="card hero" style="text-align:center;margin-top:16px">
          <div style="font-size:44px;line-height:1.2">🙋</div>
          <h1 style="margin:8px 0 4px">${esc(me.name)}님 퇴근</h1>
          <p style="margin:0 0 4px">이 폰을 들고 <b>사장님이나 매니저</b>에게 가서<br>“퇴근할게요!” 하고 눌러 달라고 하세요.</p>
          <button id="oYes" class="big-btn" style="margin-top:16px">퇴근 (사장님·매니저가 눌러요)</button>
          <button class="ghost sm" id="oAlone" style="width:100%;margin-top:12px">확인해 줄 사람이 없어요 · 혼자 퇴근</button>
          <button class="ghost sm" id="oBack" style="width:100%;margin-top:8px">취소</button>
        </div>`);
      wireTop();
      $('oYes').onclick = doPunch('out', false);
      $('oAlone').onclick = () => {
        $('oAlone').outerHTML = `<div class="card" style="border-color:var(--warn);margin-top:12px;text-align:left"><b style="color:var(--warn)">혼자 퇴근하면 ⚠가 붙어요</b>
          <p class="small">사장님이 나중에 확인해요. 사장님·매니저가 매장에 있으면 꼭 눌러 달라고 하세요.</p>
          <button id="oAlone2" class="sm" style="width:100%;margin-top:8px">그래도 혼자 퇴근</button></div>`;
        $('oAlone2').onclick = doPunch('out', true);
      };
      $('oBack').onclick = () => again();
    };
    const go = kind => (kind === 'out' ? () => outScreen() : doPunch('in', false));
    if ($('pIn')) $('pIn').onclick = go('in');
    if ($('pOut')) $('pOut').onclick = go('out');
    if ($('pOut0')) $('pOut0').onclick = go('out');
    if ($('pShift')) $('pShift').onclick = ev => { ev.preventDefault(); outDone(store, me, date, again); };
  };
  return { html, wire, sch, today: t.date };
}

// ---------- 퇴근 완료: 근무 구분 + (알바·일찍 온 날) 정상 출근 확인 ----------
export const SHIFT_TXT = p => (!p || !p.shift ? '안 고름' : p.shift === 'sub' ? `대타${p.subFor ? ` (${p.subFor} 대신)` : ''}` : p.shift === 'extra' ? '추가 출근' : '스케줄대로');
const EARLY_MIN = 15; // 정시보다 이만큼 일찍 찍은 날만 묻기 (산성과 같음)
export async function outDone(store, me, date, back) {
  const uid = api.auth.currentUser.uid;
  const [pin, pout, rules, sch, ms] = await Promise.all([api.punchDoc(store.id, date, uid, 'in'), api.punchDoc(store.id, date, uid, 'out'), api.rulesOf(store.id),
    api.getSchedule(store.id, api.mondayOf(date)), api.members(store.id).catch(() => [])]);
  const plan = sched.todayPlan(sch, rules.current, { ...me, id: uid }, date), inHm = pin && api.hmOf(pin.at);
  const er = pin && pin.earlyReq;
  const ask = me.type !== '정' && inHm && !plan.early && (!er || er.status === 'wait') && toMin(plan.start) - toMin(inHm) >= EARLY_MIN;
  const others = ms.filter(m => m.id !== uid && api.isActive(m)).sort((a, b) => (a.name < b.name ? -1 : 1));
  show(`${top(store.name)}
    <div class="card hero" style="margin-top:16px"><b style="font-size:19px">${esc(me.name)}님 퇴근 ${esc(pout ? api.hmOf(pout.at) : '')}</b>
      <p>${inHm ? `근무 ${esc(plan.early || (inHm > plan.start ? inHm : plan.start))} ~ ${esc(pout ? api.hmOf(pout.at) : '')}` : '출근 기록 없음 · 정시부터 계산'}</p><p>수고하셨어요!</p></div>
    ${ask ? `<div class="card" id="eCard"><b>오늘 출근, 어떤 경우인가요?</b>
      <p class="small">정시는 ${esc(plan.start)}인데 ${esc(inHm)}에 찍었어요.</p>
      ${er && er.status === 'wait' ? `<p class="small" style="color:var(--warn)">⏳ ${esc(er.hm)} 출근으로 사장님·매니저 승인 기다리는 중</p>` : ''}
      <button class="ghost" id="eSelf" style="margin-top:8px">평소대로 출근했어요 (${esc(plan.start)}부터)</button>
      <label style="margin-top:12px">매장 요청으로 일찍 나왔어요 — 몇 시 출근하라고 했나요?</label>
      <div class="row" style="gap:8px"><input type="time" id="eHm" step="300" value="${esc(er && er.hm ? er.hm : inHm)}"><button class="sm" id="eReq">승인 요청</button></div>
      <p class="small">사장님·매니저가 승인하면 그 시각부터 계산돼요. 답 안 하면 정시부터예요.</p></div>` : ''}
    <div class="card"><b>오늘 근무가 스케줄과 달랐나요?</b> <span class="small">지금: ${esc(SHIFT_TXT(pout))}</span>
      <button class="ghost" data-sh="normal" style="margin-top:8px">스케줄대로</button>
      <button class="ghost" data-sh="sub" style="margin-top:8px">대타였어요</button>
      <div id="subBox" style="display:none"><label>누구 대신?</label><select id="subFor"><option value="">이름 고르기</option>${others.map(m => `<option>${esc(m.name)}</option>`).join('')}</select>
        <button class="sm" id="subOk" style="margin-top:8px">저장</button></div>
      <button class="ghost" data-sh="extra" style="margin-top:8px">추가 출근 (사장님·매니저 요청)</button></div>
    <button class="ghost sm" id="oClose" style="margin-top:6px">닫기</button>`);
  wireTop();
  const again = () => outDone(store, me, date, back);
  $('oClose').onclick = () => back();
  if (!pout) { document.querySelectorAll('[data-sh]').forEach(b => { b.disabled = true; }); }
  document.querySelectorAll('[data-sh]').forEach(b => {
    b.onclick = () => {
      if (b.dataset.sh === 'sub') { $('subBox').style.display = ''; return; }
      busy(b, async () => { await api.setShift(store.id, pout.id, b.dataset.sh, ''); toast('저장했어요'); await again(); });
    };
  });
  $('subOk').onclick = e => busy(e.target, async () => {
    const n = $('subFor').value; if (!n) throw new Error('누구 대신인지 골라 주세요');
    await api.setShift(store.id, pout.id, 'sub', n); toast('대타로 저장했어요'); await again();
  });
  if ($('eSelf')) $('eSelf').onclick = e => busy(e.target, async () => { await api.answerEarly(store.id, pin.id, 'self', ''); toast('정시부터 계산돼요'); await again(); });
  if ($('eReq')) $('eReq').onclick = e => busy(e.target, async () => {
    const hm = $('eHm').value; if (!hm) throw new Error('시각을 넣어 주세요');
    if (toMin(hm) >= toMin(plan.start)) throw new Error('정시보다 이른 시각을 넣어 주세요');
    await api.answerEarly(store.id, pin.id, 'wait', hm); toast('승인 요청을 보냈어요'); await again();
  });
}

// 이번 주 내 근무 (7칸)
const SHORT = { O: '근무', '오전': '오전', 'O+오전': '오전+저녁', X: '휴무', '': '-' };
export function myWeek(sch, uid, today) {
  const week = api.mondayOf(today), dates = api.weekDates(week);
  if (!sch || !sch.published) return { html: '<div class="card"><p class="small">이번 주 근무표가 아직 확정 전이에요.</p></div>', n: 0 };
  const row = (sch.cells || {})[uid] || [];
  const n = row.filter(c => ['O', '오전', 'O+오전'].includes(c)).length;
  return { n, html: `<div class="week">${dates.map((d, i) => { const c = row[i] || ''; const work = ['O', '오전', 'O+오전'].includes(c); return `<div class="day${work ? ' work' : ''}${c === 'X' ? ' offd' : ''}${d === today ? ' today' : ''}"><b>${DOW[api.dowOf(d)]}</b><span${work || c === 'X' ? '' : ' style="color:var(--dim)"'}>${esc(SHORT[c] || c)}</span></div>`; }).join('')}</div>` };
}

// ---------- 직원 홈 탭 ----------
export async function staffHome(store, me, again) {
  const [pc, nts] = await Promise.all([punchCard(store, me, again), api.notices(store.id).catch(() => [])]);
  const w = myWeek(pc.sch, api.auth.currentUser.uid, pc.today);
  show(`${top(store.name)}
    <div class="row between" style="margin-top:6px"><h1 style="margin:0">${esc(me.name)}님</h1>${me.role === 'manager' ? '<span class="pill on">매니저</span>' : ''}</div>
    ${pc.html}
    <h2>이번 주 내 근무${w.n ? ` <span class="small">· ${w.n}일</span>` : ''}</h2>${w.html}
    ${nts.length ? `<h2>공지</h2>${info.noticeCards(nts)}` : ''}
    ${notify.pushHtml}
    <a href="#" id="goInfo" class="card row between" style="color:inherit;text-decoration:none;display:flex;margin-top:12px"><div><b>👤 내 정보</b><div class="small">급여 받을 계좌 · 이메일</div></div><span class="small">›</span></a>`);
  wireTop();
  pc.wire();
  $('goInfo').onclick = ev => { ev.preventDefault(); info.myInfoScreen(store, me, again); };
  notify.wirePush(store, false).catch(() => {});
}

// ---------- 내 기록 탭 (이번 달 내 출퇴근) ----------
const nextMonth = m => { const [y, mo] = m.split('-').map(Number); return mo === 12 ? `${y + 1}-01` : `${y}-${String(mo + 1).padStart(2, '0')}`; };
const prevMonth = m => { const [y, mo] = m.split('-').map(Number); return mo === 1 ? `${y - 1}-12` : `${y}-${String(mo - 1).padStart(2, '0')}`; };
export async function myRecords(store, me, back, month) {
  const now = api.month(), t = api.kst(); month = month || now;
  const from = month + '-01', to = month === now ? t.date : api.addDays(nextMonth(month) + '-01', -1);
  const [r, mine, myPay] = await Promise.all([api.rulesFor(store.id, month), api.myPunches(store.id, from, to), pay.myPay(store, me, month).catch(e => { console.error(e); return null; })]);
  const start = startOf(me, r), grace = r ? r.open.lateGraceMin : 0;
  const byDay = {};
  mine.forEach(p => { (byDay[p.date] = byDay[p.date] || {})[p.kind] = p; });
  const days = Object.keys(byDay).sort().reverse();
  let lateN = 0, flagN = 0;
  const rows = days.map(d => {
    const x = byDay[d], i = x.in, o = x.out, li = lateMin(i && api.hmOf(i.at), start, grace);
    if (li) lateN++; if ((i && i.flag) || (o && o.flag)) flagN++;
    const cell = p => (p ? `${esc(api.hmOf(p.at))}${p.flag ? ' ⚠' : ''}` : '<span class="small">-</span>');
    return `<tr><td>${dayLabel(d)}</td><td style="text-align:center">${cell(i)}${li ? ` <span class="small" style="color:var(--warn)">+${li}분</span>` : ''}</td><td>${cell(o)}</td></tr>`;
  }).join('');
  show(`${top('내 기록', true)}
    <div class="row between"><h2 style="margin:12px 0">${esc(month.replace('-', '년 '))}월 내 출퇴근</h2>
      <span class="row" style="gap:6px"><button class="sm ghost" id="mPrev">‹ 지난달</button>${month < now ? '<button class="sm ghost" id="mNext">다음 ›</button>' : ''}</span></div>
    ${myPay ? `<div class="card hero"><div class="small">${month === now ? '오늘까지 ' : ''}내 급여</div><div class="big">${Math.round(myPay.pay).toLocaleString()}원</div>
      <p class="small">시급 ${myPay.wage.toLocaleString()}원 × ${records.hmText(myPay.totalMin)} = ${Math.round(myPay.base).toLocaleString()}원 · 주휴 ${Math.round(myPay.juhu).toLocaleString()}원</p></div>` : ''}
    <div class="row" style="gap:8px;flex-wrap:wrap"><span class="pill ok">출근 ${days.length}일</span><span class="pill warn">지각 ${lateN}번</span><span class="pill warn">⚠ ${flagN}번</span></div>
    <div class="card">${days.length ? `<table class="kv"><tr><th>날짜</th><th>출근</th><th>퇴근</th></tr>${rows}</table>` : '<p class="small">이 달 기록이 아직 없어요.</p>'}</div>
    <p class="small">지각은 정시(${esc(start)}) 기준이에요. 일찍 부른 날은 그 시각 기준으로 계산돼요. 틀린 기록은 사장님·매니저에게 말해 주세요.</p>`);
  wireTop(back);
  $('mPrev').onclick = () => myRecords(store, me, back, prevMonth(month));
  if ($('mNext')) $('mNext').onclick = () => myRecords(store, me, back, nextMonth(month));
}

// ---------- 오늘 출근 현황 (매니저·사장님) ----------
export async function todayScreen(store, back, date, pre) {
  const t = api.kst(); date = date || t.date;
  const [ms, ps, rules, sch] = await Promise.all([api.members(store.id), api.punchesBetween(store.id, date, date), api.rulesOf(store.id), api.getSchedule(store.id, api.mondayOf(date))]);
  const r = rules.current, grace = r ? r.open.lateGraceMin : 0, isToday = date === t.date;
  const act = ms.filter(m => api.isActive(m, date)).sort((a, b) => (a.name < b.name ? -1 : 1));
  const P = {}; ps.forEach(p => { (P[p.uid] = P[p.uid] || {})[p.kind] = p; });
  const hasSched = !!(sch && sch.published);
  // 근무표가 확정됐으면 그날 근무인 사람 + 찍은 사람만, 아니면 전원
  const rows = act.map(m => {
    const x = P[m.id] || {}, plan = sched.todayPlan(sch, r, m, date), start = plan.start, late = lateMin(x.in && api.hmOf(x.in.at), start, grace);
    const sched_ = ['O', '오전', 'O+오전'].includes(plan.code);
    const state = x.out ? '퇴근' : x.in ? (late ? '지각' : '출근') : hasSched && sched_ ? (isToday && t.hm < start ? '출근 전' : '미출근') : '기록 없음';
    return { m, x, start, late, state, show: !hasSched || sched_ || x.in || x.out, early: plan.early };
  }).filter(x => x.show);
  const cnt = f => rows.filter(f).length;
  show(`${top(back ? '출근 현황' : store.name, true)}${pre ? pre.html : ''}
    <div class="row between"><h2 style="margin:12px 0">${date === t.date ? '오늘' : ''} ${dayLabel(date)} 출근 현황</h2>
      <span class="row" style="gap:6px"><button class="sm ghost" id="prev">‹ 전날</button>${date < t.date ? '<button class="sm ghost" id="nextd">다음 ›</button>' : ''}</span></div>
    <div class="row" style="gap:8px;flex-wrap:wrap"><span class="pill ok">출근 ${cnt(x => x.x.in || x.x.out)}</span><span class="pill warn">지각 ${cnt(x => x.late)}</span>
      <span class="pill warn">⚠ ${ps.filter(p => p.flag && !p.reviewed).length}</span>${hasSched ? `<span class="pill bad">미출근 ${cnt(x => x.state === '미출근')}</span><span class="pill">출근 전 ${cnt(x => x.state === '출근 전')}</span>` : `<span class="pill">기록 없음 ${cnt(x => !x.x.in && !x.x.out)}</span>`}</div>
    ${hasSched ? '' : '<div class="card"><p class="small">이 주 근무표가 확정 전이라 출근 예정을 몰라요. 직원 전원을 보여요.</p></div>'}
    <div class="card list">${rows.length ? rows.map(({ m, x, start, late, state, early }) => `<div class="item" style="display:block;padding:12px 0">
      <div class="row between"><div><b style="font-size:17px">${esc(m.name)}</b> <span class="small">${early ? '일찍 부름' : '정시'} ${esc(start)}</span></div>
        <span class="pill ${state === '지각' ? 'warn' : state === '미출근' ? 'bad' : ['기록 없음', '출근 전'].includes(state) ? '' : 'ok'}">${state === '지각' ? '지각 ' + late + '분' : state}</span></div>
      <div class="tgrid">${box('출근', x.in, late, `data-ed="${m.id}" data-k="in"`)}${box('퇴근', x.out, 0, `data-ed="${m.id}" data-k="out"`)}</div>
      <div id="ed_${m.id}"></div></div>`).join('') : '<p class="small">승인된 직원이 없어요.</p>'}</div>
    <p class="small">시각 칸을 누르면 고치거나 빠진 기록을 넣을 수 있어요. 고친 사람은 기록에 남아요.</p>
    <div class="card"><b>⏰ 일찍 부르기</b><p class="small">정시보다 일찍 나오라고 한 사람을 적어 두면 그 시각부터 계산하고 지각도 그 시각 기준이에요. (늦게 오면 찍은 시각부터)</p>
      <label>누구</label><select id="en"><option value="">이름 고르기</option>${act.map(m => `<option value="${m.id}">${esc(m.name)}</option>`).join('')}</select>
      <label>몇 시</label><input type="time" id="et" value="17:00" step="300">
      <button id="eb" style="margin-top:14px">${esc(dayLabel(date))} 일찍 부르기 등록</button></div>`);
  wireTop(back);
  if (pre) pre.wire();
  $('prev').onclick = () => todayScreen(store, back, api.addDays(date, -1), pre);
  if ($('nextd')) $('nextd').onclick = () => todayScreen(store, back, api.addDays(date, 1), pre);
  const again = () => (pre && pre.again ? pre.again() : todayScreen(store, back, date, pre));
  $('eb').onclick = e => busy(e.target, async () => {
    const id = $('en').value, hm = $('et').value;
    if (!id || !hm) throw new Error('이름과 시각을 골라 주세요');
    const m = act.find(x => x.id === id);
    if (!confirm(`${m.name} ${dayLabel(date)} ${hm} 출근으로 등록할까요?`)) return;
    await api.setEarly(store.id, date, id, hm); toast('등록했어요'); await again();
  });
  document.querySelectorAll('[data-ed]').forEach(el => {
    el.onclick = () => {
      const row = rows.find(x => x.m.id === el.dataset.ed), k = el.dataset.k, p = row.x[k];
      editor($('ed_' + row.m.id), store, row.m, date, k, p, row.x.in, again);
    };
  });
}

function editor(host, store, m, date, kind, p, pin, again) {
  const cur = p ? api.hmOf(p.at) : kind === 'in' ? null : '';
  host.innerHTML = `<div class="card" style="margin:10px 0 0"><b>${esc(m.name)} ${kind === 'in' ? '출근' : '퇴근'} ${p ? '고치기' : '넣기'}</b>
    <div class="row" style="margin-top:8px"><input type="time" id="edt" step="60" value="${esc(cur || '')}"><button class="sm" id="eds">저장</button><button class="sm ghost" id="edc">취소</button></div></div>`;
  $('edc').onclick = () => { host.innerHTML = ''; };
  $('eds').onclick = e => busy(e.target, async () => {
    const hm = $('edt').value;
    if (!hm) throw new Error('시각을 넣어 주세요');
    const at = api.atOf(date, hm, kind === 'out' && pin ? api.hmOf(pin.at) : null);
    if (p) await api.editPunch(store.id, p.id, at);
    else await api.addPunch(store.id, { uid: m.id, name: m.name, date, kind, at });
    toast('저장했어요'); await again();
  });
}

// ---------- 확인 필요 (⚠ 기록 모아 보기) ----------
export async function reviewScreen(store, back, pre) {
  const t = api.kst(), mStart = t.date.slice(0, 8) + '01', from = [api.addDays(t.date, -31), mStart].sort()[0];
  const fl = (await api.flaggedSince(store.id, from)).sort((a, b) => (a.date + a.kind < b.date + b.kind ? 1 : -1));
  const todo = fl.filter(p => !p.reviewed);
  const month = {}; fl.filter(p => p.date >= mStart).forEach(p => { month[p.name] = (month[p.name] || 0) + 1; });
  const why = p => (p.why === 'alone' ? '확인 없이 혼자 퇴근' : (p.alone ? '혼자 퇴근 · ' : '') + (p.why === 'far' && p.dist != null ? `매장에서 ${km(p.dist)}` : p.kind === 'out' && p.dist == null ? '매장 와이파이 아님 · 위치 없음' : '매장 와이파이 아님'));
  show(`${top(back ? '확인 필요' : '승인', true)}${pre ? pre.html : ''}
    <h2>⚠ 확인 필요${todo.length ? ` <span class="small">· ${todo.length}건</span>` : ''}</h2>
    <p class="small">매장 와이파이가 아닌 곳에서 찍은 기록이에요. 맞으면 [확인], 틀리면 [시각 고치기].</p>
    ${todo.length ? todo.map(p => `<div class="card"><div class="row between"><b>${esc(p.name)}</b><span class="pill warn">⚠ ${esc(why(p))}</span></div>
      <p>${dayLabel(p.date)} ${p.kind === 'in' ? '출근' : '퇴근'} <b style="color:var(--text)">${esc(api.hmOf(p.at))}</b></p>
      <div class="row" style="gap:8px"><button class="sm" data-ok="${p.id}">확인</button><button class="sm ghost" data-fix="${p.id}">시각 고치기</button></div>
      <div id="fx_${p.id}"></div></div>`).join('') : '<div class="card"><p>확인할 기록이 없어요.</p></div>'}
    <h2>이번 달 ⚠ 횟수</h2>
    <div class="card">${Object.keys(month).length ? `<table class="kv">${Object.entries(month).sort((a, b) => b[1] - a[1]).map(([n, c]) => `<tr><td>${esc(n)}</td><td>${c}번</td></tr>`).join('')}</table>` : '<p class="small">이번 달은 없어요.</p>'}</div>`);
  wireTop(back);
  if (pre) pre.wire();
  const again = () => (pre && pre.again ? pre.again() : reviewScreen(store, back, pre));
  document.querySelectorAll('[data-ok]').forEach(b => { b.onclick = () => busy(b, async () => { await api.reviewPunch(store.id, b.dataset.ok); await again(); }); });
  document.querySelectorAll('[data-fix]').forEach(b => {
    b.onclick = async () => {
      const p = todo.find(x => x.id === b.dataset.fix);
      const pin = p.kind === 'out' ? await api.punchDoc(store.id, p.date, p.uid, 'in') : null;
      editor($('fx_' + p.id), store, { id: p.uid, name: p.name }, p.date, p.kind, p, pin, async () => { await api.reviewPunch(store.id, p.id); await again(); });
    };
  });
}

// ---------- 매장 화면에 붙는 부분 (사장님) ----------
export async function ownerSection(store) {
  const t = api.kst();
  const [wifi, place, fl] = await Promise.all([api.getSetting(store.id, 'wifi'), api.getSetting(store.id, 'place'), api.flaggedSince(store.id, api.addDays(t.date, -31))]);
  const n = wifi && wifi.ips ? wifi.ips.length : 0, todo = fl.filter(p => !p.reviewed).length;
  const head = n ? '' : '<div class="card" style="border-color:var(--warn)"><b style="color:var(--warn)">매장 와이파이 등록 전이에요</b><p class="small">등록하기 전에는 모든 출근에 ⚠가 붙어요. ☰ 더보기 → [출퇴근 확인]에서 등록해 주세요.</p></div>';
  const settings = `
    <h2>출퇴근 확인</h2>
    <div class="card"><div class="row between"><b>매장 와이파이</b>${n ? `<span class="pill ok">등록 ${n}개</span>` : '<span class="pill warn">등록 전</span>'}</div>
      <p class="small">매장 안에서, 이 폰을 매장 와이파이에 연결하고 누르세요. 와이파이가 둘이면 각각 연결해서 한 번씩 누르세요.
      출근에 ⚠가 갑자기 많아지면 인터넷 주소가 바뀐 거라 다시 누르면 돼요.</p>
      <div class="row" style="gap:8px;margin-top:8px"><button class="sm" id="wReg">이 와이파이를 매장으로 등록</button>${n ? '<button class="sm ghost" id="wReset">처음부터 다시</button>' : ''}</div>
      <div class="row between" style="margin-top:16px"><b>매장 위치</b>${place ? `<span class="pill ok">저장됨 · 반경 ${place.radius}m</span>` : '<span class="pill">없음</span>'}</div>
      <p class="small">퇴근 확인에 써요 (와이파이가 아니어도 반경 안이면 ✓). 매장 안에서 누르세요.</p>
      <div class="row" style="margin-top:8px"><input id="rad" type="number" min="20" max="1000" step="10" inputmode="numeric" value="${place ? place.radius : 100}" style="width:110px"><span class="small">m</span>
        <button class="sm" id="pSave">지금 위치를 매장 위치로</button></div></div>`;
  return { head, settings, wifiN: n, place: !!place, todo };
}
export function wireOwnerSection(store, again) {
  const reg = reset => e => busy(e.target, async () => {
    if (reset && !confirm('등록한 와이파이를 모두 지우고 지금 와이파이만 등록할까요?')) return;
    const r = await api.registerWifi(store.id, reset);
    toast(r.added || reset ? '매장 와이파이로 등록했어요' : '이미 등록된 와이파이예요');
    await again();
  });
  $('wReg').onclick = reg(false);
  if ($('wReset')) $('wReset').onclick = reg(true);
  $('pSave').onclick = e => busy(e.target, async () => {
    const radius = Math.round(+$('rad').value || 100);
    if (radius < 20 || radius > 1000) throw new Error('반경은 20~1000m로 넣어 주세요');
    const g = await api.getGeo(15000);
    if (!g) throw new Error('위치를 못 잡았어요. 위치 허용을 켜 주세요');
    if (g.acc > 150 && !confirm(`위치 오차가 ${Math.round(g.acc)}m로 커요. 그래도 저장할까요? (창가나 문 쪽에서 다시 하면 더 정확해요)`)) return;
    await api.savePlace(store.id, { lat: g.lat, lng: g.lng, radius });
    toast('매장 위치를 저장했어요'); await again();
  });
}
