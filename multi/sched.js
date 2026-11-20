// 근무표·휴무신청 화면
// 직원: 근무표 보기, 휴무신청(알바만). 매니저·사장님: 근무표 짜기(휴무신청 반영·자동 채우기 초안·확정), 휴무신청 현황
import * as api from './fb.js?v=13';
import { STORE_RULES_DEFAULT } from './defaults.js?v=13';
import { $, esc, DOW, toast, show, top, wireTop, busy, copy } from './ui.js?v=13';

const PAL = ['#a32442', '#2f6c9e', '#2e7a58', '#8a5a1c', '#6a4c9c', '#9a3a78', '#2f7a7a', '#b04e36', '#4a58a6', '#5e7a2a', '#7a4a3a', '#3a6a8a'];
export const isAlba = m => m.type !== '정';
const works = c => c === 'O' || c === 'O+오전';
const hasAm = c => c === '오전' || c === 'O+오전';
const short = d => `${+d.slice(8)} ${DOW[api.dowOf(d)]}`;
const label = d => `${+d.slice(5, 7)}/${+d.slice(8)}(${DOW[api.dowOf(d)]})`;
const staffing = r => (r && r.staffing) || STORE_RULES_DEFAULT.staffing;
// 요일별 인원 (사장님·매니저가 정함): settings/staffing { need: 알바 [일~토], needFull: 정직원 [일~토] }. 없으면 매장 규칙의 알바 수
async function needOf(store, rules) {
  const d = await api.getSetting(store.id, 'staffing').catch(() => null);
  return { alba: (d && d.need) || staffing(rules).need, full: (d && d.needFull) || null };
}

// ---------- 요일별 인원 (사장님·매니저): 정직원 + 알바 = 하루 총 인원 ----------
export async function staffingScreen(store, back) {
  const rules = (await api.rulesOf(store.id)).current, n = await needOf(store, rules);
  const full = n.full || [0, 0, 0, 0, 0, 0, 0], alba = n.alba;
  const ORDER = [1, 2, 3, 4, 5, 6, 0];
  const inp = (name, d, v) => `<input type="number" min="0" max="50" inputmode="numeric" name="${name}" data-d="${d}" value="${v}" style="padding:8px 2px;text-align:center">`;
  show(`${top('요일별 인원', true)}
    <p class="small">요일마다 정직원 몇 명, 알바 몇 명을 쓸지 정해요. 근무표 짜기·휴무신청 현황에서 이 숫자보다 적으면 빨갛게 보이고, [빈칸 자동 채우기]는 알바 수만큼 채워요.</p>
    <div class="card scroll"><table>
      <tr><th class="name"></th>${ORDER.map(d => `<th>${DOW[d]}</th>`).join('')}</tr>
      <tr><td class="name">정직원</td>${ORDER.map(d => `<td>${inp('nf', d, full[d] || 0)}</td>`).join('')}</tr>
      <tr><td class="name">알바</td>${ORDER.map(d => `<td>${inp('na', d, alba[d] || 0)}</td>`).join('')}</tr>
      <tr class="sum"><td class="name">합계</td>${ORDER.map(d => `<td id="nt${d}"><b>${(full[d] || 0) + (alba[d] || 0)}</b></td>`).join('')}</tr></table></div>
    <button id="nsv">저장</button>
    <p class="small">주말 오전(${esc(staffing(rules).amStart)}~${esc(staffing(rules).amEnd)}) 근무는 따로 세요.</p>`);
  wireTop(back);
  const read = name => { const a = [0, 0, 0, 0, 0, 0, 0]; document.querySelectorAll(`input[name=${name}]`).forEach(i => { a[+i.dataset.d] = Math.max(0, Math.min(50, Math.round(+i.value || 0))); }); return a; };
  document.querySelectorAll('input[name=nf],input[name=na]').forEach(i => { i.oninput = () => { const f = read('nf'), a = read('na'); ORDER.forEach(d => { $('nt' + d).innerHTML = `<b>${f[d] + a[d]}</b>`; }); }; });
  $('nsv').onclick = e => busy(e.target, async () => {
    await api.saveStaffing(store.id, { need: read('na'), needFull: read('nf') });
    toast('요일별 인원을 저장했어요'); await back();
  });
}
// 정직원 먼저, 그다음 알바 (이름순)
const order = ms => [...ms.filter(m => !isAlba(m)), ...ms.filter(isAlba)];
const byName = (a, b) => (a.name < b.name ? -1 : 1);
async function loadWeek(store, week) {
  const [ms, sch, rules] = await Promise.all([api.members(store.id), api.getSchedule(store.id, week), api.rulesOf(store.id)]);
  const act = order(ms.filter(m => api.isActive(m, week)).sort(byName)); // 그 주 시작에 재직 중인 사람
  return { act, sch: sch || { cells: {}, published: false }, rules: rules.current };
}
function countRow(act, cells, dates) {
  return dates.map((d, i) => {
    const j = act.filter(m => !isAlba(m) && works((cells[m.id] || [])[i])).length;
    const a = act.filter(m => isAlba(m) && works((cells[m.id] || [])[i])).length;
    const am = act.filter(m => hasAm((cells[m.id] || [])[i])).length;
    return { j, a, am, text: `${j}+${a}${am ? ` (오전${am})` : ''}` };
  });
}
function cellHtml(m, c, color, today, extra = '') {
  const t = today ? ' today' : '';
  if (works(c)) return `<td class="sc o${isAlba(m) ? '' : ' j'}${t}" ${extra} style="${isAlba(m) ? 'background:' + color : ''}"><span>${esc(m.name)}${c === 'O+오전' ? '<br>+오전' : ''}</span></td>`;
  if (c === '오전') return `<td class="sc am${t}" ${extra}><span>${esc(m.name)} 오전</span></td>`;
  if (c === 'X') return `<td class="sc x${t}" ${extra}>✕</td>`;
  return `<td class="sc${t}" ${extra}></td>`;
}
function grid(act, cells, dates, { me, editable, need, needFull } = {}) {
  const today = api.kst().date, color = {};
  act.filter(isAlba).forEach((m, k) => { color[m.id] = PAL[k % PAL.length]; });
  const row = m => {
    const cs = cells[m.id] || [];
    const n = cs.filter(c => works(c) || hasAm(c)).length;
    return `<tr class="${m.id === me ? 'me' : ''}"><td class="name">${esc(m.name)}</td>${dates.map((d, i) => cellHtml(m, cs[i] || '', color[m.id], d === today, editable ? `data-c="${m.id}" data-i="${i}"` : '')).join('')}<td class="tot">${isAlba(m) ? n + '일' : ''}</td></tr>`;
  };
  const cnt = countRow(act, cells, dates);
  return `<div class="card scroll sched"><table>
    <tr><th class="name">이름</th>${dates.map(d => `<th class="${d === today ? 'today' : ''}">${short(d)}</th>`).join('')}<th>총</th></tr>
    ${act.filter(m => !isAlba(m)).map(row).join('')}${act.some(m => !isAlba(m)) ? '<tr class="gap"><td colspan="9"></td></tr>' : ''}
    ${act.filter(isAlba).map(row).join('')}
    <tr class="sum"><td class="name">정+알</td>${cnt.map((c, i) => { const w = api.dowOf(dates[i]), low = (need && c.a < need[w]) || (needFull && c.j < needFull[w]); return `<td class="${dates[i] === today ? 'today' : ''}" style="${low ? 'color:var(--bad)' : ''}">${c.text}</td>`; }).join('')}<td></td></tr>
    ${need ? `<tr class="sum"><td class="name">필요</td>${dates.map(d => { const w = api.dowOf(d); return `<td>${needFull ? `${needFull[w]}+${need[w]}` : `알${need[w]}`}</td>`; }).join('')}<td></td></tr>` : ''}</table></div>`;
}
const weekTitle = w => `${label(w)} – ${label(api.addDays(w, 6))}`;

// ---------- 근무표 보기 (모두) ----------
export async function scheduleView(store, meId, back, week) {
  const thisW = api.mondayOf(api.kst().date);
  week = week || thisW;
  const { act, sch } = await loadWeek(store, week);
  const dates = api.weekDates(week);
  const ready = sch.published;
  show(`${top('근무표', true)}
    <div class="row between"><h2 style="margin:12px 0">${weekTitle(week)}</h2>
      <span class="row" style="gap:6px"><button class="sm ghost" id="wPrev">‹</button><button class="sm ghost" id="wNext">›</button></span></div>
    ${ready ? grid(act, sch.cells || {}, dates, { me: meId }) : '<div class="card"><p>이 주 근무표는 아직 확정 전이에요.</p></div>'}
    <p class="small">이름 = 근무 · <span style="color:var(--bad)">✕</span> 휴무/불가 · 빈칸 = 미배정 · 노란 "오전" = 주말 오전. 내 줄은 금색 테두리, 오늘은 금색 칸이에요.</p>`);
  wireTop(back);
  $('wPrev').onclick = () => scheduleView(store, meId, back, api.addDays(week, -7));
  $('wNext').onclick = () => scheduleView(store, meId, back, api.addDays(week, 7));
}

// ---------- 휴무신청 (알바) ----------
// 대상 주 = 다음 주. 신청 시간은 매장 설정(기본: 금 0시 ~ 토 22시)
export async function leaveForm(store, me, back) {
  const week = api.addDays(api.mondayOf(api.kst().date), 7);
  const [setting, mine, rules] = await Promise.all([api.leaveSetting(store.id), api.myLeave(store.id, week), api.rulesOf(store.id)]);
  const st = staffing(rules.current);
  const w = setting ? api.leaveWindow(week, setting) : null, now = new Date();
  const state = !w ? 'none' : now < w.opens ? 'before' : now < w.closes ? 'open' : 'closed';
  const dates = api.weekDates(week), off = (mine && mine.off) || [], am = (mine && mine.am) || [];
  const pill = { open: '<span class="pill ok">신청 받는 중</span>', before: '<span class="pill off">열리기 전</span>', closed: '<span class="pill off">마감</span>', none: '<span class="pill off">설정 전</span>' }[state];
  const when = w ? `${api.fmtWhen(w.opens)} ~ ${api.fmtWhen(w.closes)}` : '';
  const saved = mine ? `<p style="color:var(--text)">내가 낸 신청 (${mine.at && mine.at.toDate ? api.fmtWhen(mine.at.toDate()) : ''})<br>못 나오는 날: <b>${dates.filter(d => off.includes(d)).map(label).join(', ') || '없음'}</b><br>주말 오전 가능: <b>${am.join('·') || '불가'}</b></p>` : '<p style="color:var(--text)">아직 낸 신청이 없어요.</p>';
  const note = '<p class="small">안 내면 모든 요일 저녁 가능으로 짜요. 여러 번 내면 마지막 것만 써요. 마감 뒤 바꾸려면 본인이 대타를 구해 주세요.</p>';
  if (!isAlba(me) || state !== 'open') {
    show(`${top('휴무신청', true)}<h2>${weekTitle(week)}</h2><div class="card hero"><div class="row between">${pill}<span class="small">${esc(when)}</span></div>${saved}</div>
      ${isAlba(me) ? '' : '<p class="small">휴무신청은 알바만 내요.</p>'}${note}`);
    return wireTop(back);
  }
  show(`${top('휴무신청', true)}<h2>${weekTitle(week)}</h2>
    ${mine ? `<div class="card hero">${saved}<p class="small">마감 전까지는 아래에서 고쳐서 다시 보낼 수 있어요.</p></div>` : ''}
    <div class="card"><div class="row between">${pill}<span class="small">마감 ${esc(api.fmtWhen(w.closes))}</span></div>
      <label>못 나오는 날 (저녁)</label><div class="chk">${dates.map(d => `<label><input type="checkbox" name="off" value="${d}" ${off.includes(d) ? 'checked' : ''}><span>${short(d)}</span></label>`).join('')}</div>
      <label>주말 오전(${esc(st.amStart)}~${esc(st.amEnd)}) 가능한 날</label><div class="chk" style="grid-template-columns:repeat(2,1fr)">
        ${['토', '일'].map(x => `<label><input type="checkbox" name="am" value="${x}" ${am.includes(x) ? 'checked' : ''}><span>${x} 오전</span></label>`).join('')}</div>
      <button id="send" style="margin-top:16px">${mine ? '다시 보내기' : '보내기'}</button></div>${note}`);
  wireTop(back);
  $('send').onclick = e => {
    const pick = n => [...document.querySelectorAll(`input[name=${n}]:checked`)].map(x => x.value);
    const o = pick('off'), a = pick('am');
    if (!confirm(`이대로 보낼까요?\n못 나오는 날 ${o.length}일 · 주말 오전 ${a.join('·') || '불가'}`)) return;
    busy(e.target, async () => {
      await api.submitLeave(store.id, week, me.name, o, a);
      toast('휴무신청 보냈어요'); await leaveForm(store, me, back);
    });
  };
}

// ---------- 휴무신청 현황 (매니저·사장님) ----------
export async function leaveAdmin(store, back, week) {
  week = week || api.addDays(api.mondayOf(api.kst().date), 7);
  const [{ act, rules }, lvs, setting] = await Promise.all([loadWeek(store, week), api.leavesOf(store.id, week), api.leaveSetting(store.id)]);
  const albas = act.filter(isAlba), dates = api.weekDates(week), need = (await needOf(store, rules)).alba;
  const L = Object.fromEntries(lvs.map(l => [l.uid, l]));
  const rows = albas.map(m => ({ m, l: L[m.id] || null }));
  const avail = dates.map(d => rows.filter(r => !(r.l && r.l.off.includes(d))).length);
  const shortD = dates.map((d, i) => ({ d, i, lack: need[api.dowOf(d)] - avail[i] })).filter(x => x.lack > 0);
  const offNames = d => rows.filter(r => r.l && r.l.off.includes(d)).map(r => r.m.name);
  const amNames = x => rows.filter(r => r.l && r.l.am.includes(x)).map(r => r.m.name);
  const w = setting ? api.leaveWindow(week, setting) : null, now = new Date();
  const open = w && now >= w.opens && now < w.closes;
  // 단톡 멘트는 휴무 신청자가 있어서 부족해진 날만 (원래 알바가 모자란 날은 사장님이 따로 구해야 함)
  const msg = shortD.filter(x => offNames(x.d).length).map(x => `[휴무신청 안내] ${label(x.d)}은 출근 가능한 알바가 ${avail[x.i]}명이라 ${x.lack}명이 부족해요. 이날 휴무 신청한 ${offNames(x.d).join(', ')} 중 ${x.lack}명은 출근해야 해요. 서로 정해서(복불복도 좋아요) 알려 주세요!`).join('\n');
  const sent = rows.filter(r => r.l), not = rows.filter(r => !r.l);
  show(`${top('휴무신청 현황', true)}
    <div class="row between"><h2 style="margin:12px 0">${weekTitle(week)}</h2>
      <span class="row" style="gap:6px"><button class="sm ghost" id="wPrev">‹</button><button class="sm ghost" id="wNext">›</button></span></div>
    <div class="card hero"><div class="row between">${open ? '<span class="pill ok">신청 받는 중</span>' : '<span class="pill off">받는 중 아님</span>'}<span class="small">${w ? '마감 ' + esc(api.fmtWhen(w.closes)) : ''}</span></div>
      <div class="big" style="margin-top:6px">${sent.length}명 신청 <span class="small">/ 알바 ${albas.length}명</span></div>
      ${not.length ? `<p class="small">안 낸 사람: <b style="color:var(--text)">${not.map(r => esc(r.m.name)).join(', ')}</b> — 안 내면 모든 요일 저녁 가능으로 짜요.</p>` : '<p class="small">모두 냈어요.</p>'}</div>
    ${shortD.length ? `<div class="card" style="border-color:rgba(255,107,107,.45)"><b style="color:var(--bad)">⚠️ 인원 부족한 날 ${shortD.length}일</b>
      ${shortD.map(x => `<p>${label(x.d)}: 가능 ${avail[x.i]}명 / 필요 ${need[api.dowOf(x.d)]}명${offNames(x.d).length ? ' · 휴무 신청 ' + offNames(x.d).map(esc).join(', ') : ' · <span class="small">알바 수 자체가 부족</span>'}</p>`).join('')}
      ${msg ? '<button class="sm" id="cp" style="margin-top:6px">단톡 공지 멘트 복사</button>' : ''}</div>` : '<div class="card"><span class="pill ok">인원 부족한 날 없음</span></div>'}
    <div class="card scroll sched"><table>
      <tr><th class="name">이름</th>${dates.map(d => `<th>${short(d)}</th>`).join('')}</tr>
      ${rows.map(r => `<tr><td class="name"${r.l ? '' : ' style="color:var(--dim)"'}>${esc(r.m.name)}</td>${r.l ? dates.map(d => (r.l.off.includes(d) ? '<td class="sc x">✕</td>' : '<td class="sc"></td>')).join('') : '<td colspan="7" class="small" style="text-align:center">미신청 (모두 가능)</td>'}</tr>`).join('')}
      <tr class="sum"><td class="name">가능</td>${dates.map((d, i) => `<td style="${avail[i] < need[api.dowOf(d)] ? 'color:var(--bad)' : ''}">${avail[i]}/${need[api.dowOf(d)]}</td>`).join('')}</tr></table></div>
    <div class="card"><b>주말 오전 가능</b><p>토: ${amNames('토').map(esc).join(', ') || '없음'}<br>일: ${amNames('일').map(esc).join(', ') || '없음'}</p></div>
    <button id="goEdit">이 주 근무표 짜기</button>`);
  wireTop(back);
  $('wPrev').onclick = () => leaveAdmin(store, back, api.addDays(week, -7));
  $('wNext').onclick = () => leaveAdmin(store, back, api.addDays(week, 7));
  if ($('cp')) $('cp').onclick = () => copy(msg);
  $('goEdit').onclick = () => scheduleEditor(store, () => leaveAdmin(store, back, week), week);
}

// ---------- 근무표 짜기 (매니저·사장님) ----------
const CYCLE = (weekend) => (weekend ? ['', 'O', '오전', 'O+오전', 'X'] : ['', 'O', 'X']);
export async function scheduleEditor(store, back, week) {
  week = week || api.addDays(api.mondayOf(api.kst().date), 7);
  const [{ act, sch, rules }, lvs] = await Promise.all([loadWeek(store, week), api.leavesOf(store.id, week)]);
  const nd = await needOf(store, rules);
  const dates = api.weekDates(week), need = nd.alba, needFull = nd.full, openDays = (rules && rules.open.days) || [0, 1, 2, 3, 4, 5, 6];
  const cells = {}; act.forEach(m => { cells[m.id] = [...((sch.cells || {})[m.id] || ['', '', '', '', '', '', ''])]; });
  let dirty = false;
  const draw = () => {
    show(`${top('근무표 짜기', true)}
      <div class="row between"><h2 style="margin:12px 0">${weekTitle(week)}</h2>
        <span class="row" style="gap:6px"><button class="sm ghost" id="wPrev">‹</button><button class="sm ghost" id="wNext">›</button></span></div>
      <div class="row" style="gap:6px;flex-wrap:wrap">${sch.published ? '<span class="pill ok">확정됨 (직원에게 보임)</span>' : '<span class="pill warn">초안 (직원에게 안 보임)</span>'}
        <span class="pill">휴무신청 ${lvs.length}명</span>${dirty ? '<span class="pill warn">저장 안 함</span>' : ''}</div>
      ${grid(act, cells, dates, { editable: true, need, needFull })}
      <p class="small">칸을 누르면 바뀌어요: 빈칸 → 근무 → ${'(주말: 오전 → 근무+오전 →)'} ✕ → 빈칸</p>
      <div class="row" style="gap:8px"><button class="ghost" id="fLeave">휴무신청 반영</button><button class="ghost" id="fAuto">빈칸 자동 채우기</button></div>
      <p class="small">휴무신청 반영 = 알바가 못 나온다고 한 날을 ✕로. 자동 채우기 = 알바 빈칸을 그날 필요 인원만큼, 이번 주 근무가 적은 사람부터 채워요(초안). 정직원 칸은 직접 정해 주세요.</p>
      <div class="row" style="gap:8px;margin-top:8px"><button class="ghost" id="save">초안 저장</button><button id="pub">확정해서 직원에게 보이기</button></div>`);
    wireTop(() => { if (!dirty || confirm('저장 안 한 내용이 있어요. 나갈까요?')) back(); });
    $('wPrev').onclick = () => (!dirty || confirm('저장 안 한 내용이 있어요. 넘어갈까요?')) && scheduleEditor(store, back, api.addDays(week, -7));
    $('wNext').onclick = () => (!dirty || confirm('저장 안 한 내용이 있어요. 넘어갈까요?')) && scheduleEditor(store, back, api.addDays(week, 7));
    document.querySelectorAll('[data-c]').forEach(td => {
      td.onclick = () => {
        const i = +td.dataset.i, cs = cells[td.dataset.c], cyc = CYCLE([0, 6].includes(api.dowOf(dates[i])));
        cs[i] = cyc[(cyc.indexOf(cs[i]) + 1) % cyc.length]; dirty = true; draw();
      };
    });
    $('fLeave').onclick = () => {
      let n = 0;
      lvs.forEach(l => (l.off || []).forEach(d => { const i = dates.indexOf(d); if (i >= 0 && cells[l.uid] && cells[l.uid][i] !== 'X') { cells[l.uid][i] = 'X'; n++; } }));
      dirty = dirty || n > 0; toast(n ? `${n}칸을 ✕로 바꿨어요` : '바꿀 칸이 없어요'); draw();
    };
    $('fAuto').onclick = () => {
      const off = {}; lvs.forEach(l => { off[l.uid] = new Set(l.off || []); });
      const albas = act.filter(isAlba), cnt = m => cells[m.id].filter(works).length;
      let n = 0;
      dates.forEach((d, i) => {
        if (!openDays.includes(api.dowOf(d))) return;
        let lack = need[api.dowOf(d)] - albas.filter(m => works(cells[m.id][i])).length;
        const pool = albas.filter(m => cells[m.id][i] === '' && !(off[m.id] && off[m.id].has(d)))
          .sort((a, b) => cnt(a) - cnt(b) || Math.random() - 0.5);
        for (const m of pool) { if (lack <= 0) break; cells[m.id][i] = 'O'; lack--; n++; }
      });
      dirty = dirty || n > 0; toast(n ? `${n}칸을 채웠어요. 확인하고 고쳐 주세요` : '채울 칸이 없어요'); draw();
    };
    const save = published => e => busy(e.target, async () => {
      if (published && !confirm('확정하면 직원들 근무표에 바로 보여요. 확정할까요?')) return;
      await api.saveSchedule(store.id, week, cells, published);
      sch.published = published; dirty = false; toast(published ? '확정했어요' : '초안을 저장했어요'); draw();
    });
    $('save').onclick = save(false);
    $('pub').onclick = save(true);
  };
  draw();
}

// 오늘 그 직원의 근무 칸과 계산 시작 시각 (일찍 부르기 > 직원 정시 > 매장 정시, 주말 오전은 오전 시작)
export function todayPlan(sch, rules, m, date) {
  const i = api.weekDates(api.mondayOf(date)).indexOf(date);
  const code = ((sch && sch.cells && sch.cells[m.id]) || [])[i] || '';
  const early = sch && sch.early && sch.early[date] && sch.early[date][m.id];
  const start = early || (code === '오전' ? staffing(rules).amStart : (m.startTime || (rules && rules.open.startTime) || '18:00'));
  return { code, start, early: early || null, published: !!(sch && sch.published) };
}
export const codeText = c => ({ O: '근무', '오전': '주말 오전', 'O+오전': '오전+저녁', X: '휴무', '': '미배정' }[c] || c);
