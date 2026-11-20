// 월 근무 기록: 직원별 일한 날·시간·지각·⚠ 합계, 날짜별 상세, 엑셀(CSV) 내려받기 (사장님·매니저)
// 급여 기능 전까지 사장님이 이 표로 급여를 계산. 대표님께는 합계(근무 시간·인원)만 보낼 수 있음
import * as api from './fb.js?v=21';
import { $, esc, DOW, toast, show, top, wireTop, busy } from './ui.js?v=21';
import * as sched from './sched.js?v=21';

const dayLabel = d => { const t = new Date(d + 'T12:00:00Z'); return `${t.getUTCMonth() + 1}/${t.getUTCDate()}(${DOW[t.getUTCDay()]})`; };
export const hmText = min => `${Math.floor(min / 60)}:${String(min % 60).padStart(2, '0')}`;
const hours = min => Math.round(min / 6) / 10; // 소수 한 자리 시간
const tsOf = (date, hm) => new Date(`${date}T${hm}:00+09:00`).getTime();
const lastDay = month => { const [y, m] = month.split('-').map(Number); return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10); };
const addMonth = (month, n) => { const [y, m] = month.split('-').map(Number); const d = new Date(Date.UTC(y, m - 1 + n, 1)); return d.toISOString().slice(0, 7); };

// 하루 계산: 계산 시작 = 정시(일찍 부른 시각·개인 정시·매장 정시) 이후, 늦게 오면 찍은 시각부터. 출근 안 찍었으면 정시부터
// 퇴근이 없으면 시간 0 + "퇴근 없음". roundMin(규칙)이 있으면 근무 시간을 그 단위로 내림
export function dayCalc({ date, inP, outP, plan, rules }) {
  const st = (rules && rules.staffing) || {};
  const planStart = plan.code === 'O+오전' && !plan.early ? (st.amStart || '12:00') : plan.start;
  const grace = (rules && rules.open && rules.open.lateGraceMin) || 0;
  const inAt = inP && inP.at && inP.at.toDate ? inP.at.toDate().getTime() : null;
  const outAt = outP && outP.at && outP.at.toDate ? outP.at.toDate().getTime() : null;
  const startAt = Math.max(tsOf(date, planStart), inAt || 0);
  const lateRaw = inAt ? Math.round((inAt - tsOf(date, planStart)) / 60000) : 0;
  const late = lateRaw > grace && lateRaw < 12 * 60 ? lateRaw : 0;
  let min = 0;
  if (outAt) {
    min = Math.max(0, Math.floor((outAt - startAt) / 60000));
    const r = (rules && rules.pay && rules.pay.roundMin) || 0;
    if (r > 0) min -= min % r;
  }
  const notes = [];
  if (!inP) notes.push('출근 안 찍음 · 정시부터');
  if (!outP) notes.push('퇴근 없음');
  if (late) notes.push(`지각 ${late}분`);
  if (plan.early) notes.push(`일찍 부름 ${plan.early}`);
  if (inP && inP.earlyReq && inP.earlyReq.status === 'wait') notes.push(`조기 출근 ${inP.earlyReq.hm} 승인 대기`);
  if (outP && outP.shift === 'sub') notes.push(`대타${outP.subFor ? ` (${outP.subFor} 대신)` : ''}`);
  if (outP && outP.shift === 'extra') notes.push('추가 출근');
  const flags = [inP, outP].filter(p => p && p.flag).length;
  if (flags) notes.push('⚠ ' + flags);
  if ([inP, outP].some(p => p && p.editedBy)) notes.push('고침');
  return { date, in: inP ? api.hmOf(inP.at) : '', out: outP ? api.hmOf(outP.at) : '', calcStart: api.kst(new Date(startAt)).hm, min, late, flags, noOut: !outP, notes };
}

// 한 달 전체 계산
export async function monthData(store, month) {
  const from = month + '-01', to = lastDay(month);
  const weeks = []; for (let w = api.mondayOf(from); w <= to; w = api.addDays(w, 7)) weeks.push(w);
  const [ms, ps, rules, schs] = await Promise.all([api.members(store.id), api.punchesBetween(store.id, from, to), api.rulesFor(store.id, month), Promise.all(weeks.map(w => api.getSchedule(store.id, w)))]);
  const S = Object.fromEntries(weeks.map((w, i) => [w, schs[i]]));
  const byM = {};
  ps.forEach(p => { ((byM[p.uid] = byM[p.uid] || { name: p.name, days: {} }).days[p.date] = byM[p.uid].days[p.date] || {})[p.kind] = p; });
  const mById = Object.fromEntries(ms.map(m => [m.id, m]));
  const people = Object.entries(byM).map(([uid, x]) => {
    const m = mById[uid] || { id: uid, name: x.name };
    const days = Object.keys(x.days).sort().map(date => dayCalc({ date, inP: x.days[date].in, outP: x.days[date].out, plan: sched.todayPlan(S[api.mondayOf(date)], rules, m, date), rules }));
    const sum = k => days.reduce((a, d) => a + (typeof d[k] === 'number' ? d[k] : d[k] ? 1 : 0), 0);
    return { uid, name: m.name || x.name, type: m.type, left: api.isGone(m) || !mById[uid], days,
      workDays: days.length, min: sum('min'), lateN: days.filter(d => d.late).length, lateMin: sum('late'), flags: sum('flags'), noOut: sum('noOut') };
  }).sort((a, b) => (a.name < b.name ? -1 : 1));
  // 요일별 평균 근무 인원 (지난 날만)
  const today = api.kst().date, cnt = {}, dates = {};
  for (let d = from; d <= to && d <= today; d = api.addDays(d, 1)) dates[api.dowOf(d)] = (dates[api.dowOf(d)] || 0) + 1;
  people.forEach(p => p.days.forEach(d => { cnt[api.dowOf(d.date)] = (cnt[api.dowOf(d.date)] || 0) + 1; }));
  const byWeekday = [0, 1, 2, 3, 4, 5, 6].map(w => (dates[w] ? Math.round((cnt[w] || 0) / dates[w] * 10) / 10 : null));
  return { month, people, rules, byWeekday, totalMin: people.reduce((a, p) => a + p.min, 0) };
}

// 직원 본인: 그 달 내 날짜별 계산 (급여 카드용, 내 출퇴근만 읽음)
export async function myDays(store, me, month) {
  const from = month + '-01', to = lastDay(month);
  const weeks = []; for (let w = api.mondayOf(from); w <= to; w = api.addDays(w, 7)) weeks.push(w);
  const [ps, rules, schs] = await Promise.all([api.myPunches(store.id, from, to), api.rulesFor(store.id, month), Promise.all(weeks.map(w => api.getSchedule(store.id, w)))]);
  const S = Object.fromEntries(weeks.map((w, i) => [w, schs[i]])), D = {};
  ps.forEach(p => { (D[p.date] = D[p.date] || {})[p.kind] = p; });
  return Object.keys(D).sort().map(date => dayCalc({ date, inP: D[date].in, outP: D[date].out, plan: sched.todayPlan(S[api.mondayOf(date)], rules, { ...me, id: api.auth.currentUser.uid }, date), rules }));
}

// 엑셀에서 바로 열리는 CSV (한글 깨지지 않게 BOM)
export function toCsv(store, data) {
  const q = v => { const s = String(v == null ? '' : v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  const rows = [[`${store.name} ${data.month} 근무 기록 (급여 계산 참고용)`], [],
    ['이름', '구분', '일한 날', '근무 시간(시:분)', '근무 시간(시간)', '지각 횟수', '지각 합계(분)', '⚠ 횟수', '퇴근 없음']];
  data.people.forEach(p => rows.push([p.name, p.type === '정' ? '정직원' : '알바', p.workDays, hmText(p.min), hours(p.min), p.lateN, p.lateMin, p.flags, p.noOut]));
  rows.push([], ['이름', '날짜', '요일', '출근', '퇴근', '계산 시작', '근무 시간(시:분)', '근무 시간(시간)', '메모']);
  data.people.forEach(p => p.days.forEach(d => rows.push([p.name, d.date, DOW[api.dowOf(d.date)], d.in, d.out, d.calcStart, hmText(d.min), hours(d.min), d.notes.join(' · ')])));
  return '﻿' + rows.map(r => r.map(q).join(',')).join('\r\n');
}
export function download(name, text) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type: 'text/csv;charset=utf-8' }));
  a.download = name; document.body.appendChild(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
}

// ---------- 화면 ----------
export async function monthScreen(store, back, month, isOwner) {
  const now = api.month(); month = month || now;
  const data = await monthData(store, month);
  const { people } = data;
  show(`${top('월 근무 기록', true)}
    <div class="row between"><h2 style="margin:12px 0">${esc(month.replace('-', '년 '))}월</h2>
      <span class="row" style="gap:6px"><button class="sm ghost" id="mPrev">‹ 지난달</button>${month < now ? '<button class="sm ghost" id="mNext">다음 ›</button>' : ''}</span></div>
    <div class="card hero"><div class="small">전체 근무 시간</div><div class="big">${hours(data.totalMin)}시간</div>
      <p class="small">${people.length}명 · 출퇴근 기록으로 계산 (급여 계산 참고용)</p></div>
    ${people.length ? `<div class="card scroll"><table><tr><th style="text-align:left">이름</th><th>일한 날</th><th>시간</th><th>지각</th><th>⚠</th></tr>
      ${people.map(p => `<tr data-p="${p.uid}" style="cursor:pointer"><td class="name">${esc(p.name)}${p.left ? ' <span class="small">퇴사</span>' : ''}</td><td>${p.workDays}일</td>
        <td><b>${hmText(p.min)}</b></td><td>${p.lateN ? `<span style="color:var(--warn)">${p.lateN}번</span>` : '-'}</td>
        <td>${p.flags ? `<span style="color:var(--warn)">${p.flags}</span>` : '-'}${p.noOut ? ` <span class="small" style="color:var(--bad)">퇴근없음 ${p.noOut}</span>` : ''}</td></tr>`).join('')}</table>
      <p class="small">이름을 누르면 날짜별로 보여요.</p></div><div id="detail"></div>` : '<div class="card"><p class="small">이 달 출퇴근 기록이 없어요.</p></div>'}
    <div class="card"><b>계산 방법</b><p class="small">· 시작: 정시(일찍 부른 시각 > 개인 정시 > 매장 정시)부터. 늦게 오면 찍은 시각부터<br>
      · 출근을 안 찍은 날은 정시부터, <b style="color:var(--bad)">퇴근이 없는 날은 0시간</b>이에요. [오늘 출근 현황]에서 날짜를 넘겨 넣어 주세요<br>
      · ⚠ 기록도 시간에 들어가요. 틀리면 [확인 필요]에서 고쳐 주세요<br>
      · 주휴·야간 수당은 아직 계산하지 않아요</p></div>
    ${people.length ? '<button id="csv">엑셀로 내려받기</button>' : ''}
    ${isOwner && !store.direct ? `<div class="card" style="margin-top:12px"><b>대표님께 합계 보내기</b>
      <p class="small">이 달 전체 근무 시간·인원·요일별 평균 인원만 보내요. 직원 이름·시간은 안 보내요.</p>
      <button class="sm ghost" id="stat" style="margin-top:6px">이 달 합계 보내기</button></div>` : ''}`);
  wireTop(back);
  const again = m => monthScreen(store, back, m, isOwner);
  $('mPrev').onclick = () => again(addMonth(month, -1));
  if ($('mNext')) $('mNext').onclick = () => again(addMonth(month, 1));
  document.querySelectorAll('[data-p]').forEach(tr => {
    tr.onclick = () => {
      const p = people.find(x => x.uid === tr.dataset.p);
      $('detail').innerHTML = `<div class="card"><b>${esc(p.name)}</b> <span class="small">${p.workDays}일 · ${hmText(p.min)}</span>
        <div class="scroll"><table><tr><th>날짜</th><th>출근</th><th>퇴근</th><th>시간</th></tr>
        ${p.days.map(d => `<tr><td>${dayLabel(d.date)}</td><td>${esc(d.in || '-')}${d.late ? ` <span class="small" style="color:var(--warn)">+${d.late}</span>` : ''}</td>
          <td>${d.noOut ? '<span style="color:var(--bad)">없음</span>' : esc(d.out)}</td><td><b>${hmText(d.min)}</b></td></tr>
          ${d.notes.length ? `<tr class="gap"><td colspan="4" class="small" style="text-align:right">${esc(d.notes.join(' · '))}</td></tr>` : ''}`).join('')}</table></div></div>`;
      $('detail').scrollIntoView({ behavior: 'smooth' });
    };
  });
  if ($('csv')) $('csv').onclick = () => download(`${store.name}_${month}_근무기록.csv`, toCsv(store, data));
  if ($('stat')) $('stat').onclick = e => busy(e.target, async () => {
    await api.saveStats(store.id, month, { hours: hours(data.totalMin), headcount: people.length, byWeekday: data.byWeekday });
    toast('대표님께 합계를 보냈어요');
  });
}
