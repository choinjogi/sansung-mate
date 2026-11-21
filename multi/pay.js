// 급여 계산 + 월말 정산표 (사장님). 계산 방식은 지금 산성 결산 시트와 같게 맞춤 (2026-11-20 시트 수식 확인)
//  · 하루 시간 = 퇴근 − 계산 시작 (분 단위, records.dayCalc)
//  · 알바: 시급분 = 총 시간 × 시급
//          주휴 = 주(1~7일, 8~14일, 15~21일, 22~28일, 29일~말일)마다 그 주 시간이 15시간 이상이면
//                 min(그 주 시간, 40시간) × 시급 × 20%.  "주휴 없음" 직원은 0
//          급여 = 시급분 + 주휴 (원 단위 반올림은 맨 끝에 한 번)
//  · 정직원: 월급. 그 달 중간에 들어오거나 나가면 일한 날짜 수만큼 (월급 ÷ 그 달 일수 × 날짜 수)
//  · 가감(보너스·공제 등)은 사장님이 정산표에서 직접 넣음
import * as api from './fb.js?v=34';
import { $, esc, toast, show, top, wireTop, busy } from './ui.js?v=34';
import * as records from './records.js?v=34';
import * as sched from './sched.js?v=34';
import * as tax from './taxout.js?v=34';

import { won, lastDay, addMonth, weekNo, wageOf, albaPay, fullPay } from './paycalc.js?v=34';
export { weekNo, wageOf, albaPay, fullPay };

const ymd = ts => (ts && ts.toDate ? api.kst(ts.toDate()).date : null);

// 매장 한 달 정산 (사장님): 출퇴근 기록 + 시급 + 주휴 + 가감. until(YYYY-MM-DD)을 주면 그날까지만 (대시보드 "현재까지")
export async function payrollData(store, month, until, data) {
  data = data || await records.monthData(store, month);
  const [ms, wages, saved] = await Promise.all([api.members(store.id), api.wagesAll(store.id), api.getPayroll(store.id, month)]);
  const W = Object.fromEntries(wages.map(w => [w.id, w]));
  const P = Object.fromEntries(data.people.map(p => [p.uid, p]));
  const adj = (saved && saved.adjust) || {};
  const first = month + '-01', last = `${month}-${String(lastDay(month)).padStart(2, '0')}`;
  // 정산 대상: 그 달 기록이 있는 사람 + 그 달에 재직한 정직원
  const endOf = m => m.leaveDate || ymd(m.leftAt);
  const inMonth = m => { const l = endOf(m); return m.status !== 'pending' && !(l && l < first) && !(m.startDate && m.startDate > last); };
  const ids = new Set([...data.people.map(p => p.uid), ...ms.filter(m => m.type === '정' && inMonth(m)).map(m => m.id)]);
  const rows = [...ids].map(uid => {
    const m = ms.find(x => x.id === uid) || { id: uid, name: (P[uid] || {}).name || '?' };
    let p = P[uid] || { days: [], min: 0, workDays: 0 };
    if (until) { const days = p.days.filter(d => d.date <= until); p = { ...p, days, min: days.reduce((t, d) => t + d.min, 0), workDays: days.length }; }
    const full = m.type === '정', wage = wageOf(W[uid], month, data.rules, full);
    const a = +(adj[uid] || 0);
    if (full) {
      const l = endOf(m), f = fullPay(month, wage, { startDate: m.startDate || null, endDate: until && (!l || until < l) ? until : l });
      return { uid, name: m.name, full, half: !!m.half, wage, min: p.min, workDays: p.workDays, days: p.days, base: f.pay, juhu: 0, juhuW: [], weeks: [], adjust: a, pay: f.pay + a, note: f.days < f.monthDays ? `${f.days}/${f.monthDays}일` : '', left: api.isGone(m) };
    }
    const x = albaPay(p.days, wage, { noJuhu: !!m.noJuhu, juhu: data.rules && data.rules.pay && data.rules.pay.juhu });
    return { uid, name: m.name, full, wage, min: p.min, workDays: p.workDays, days: p.days, base: x.base, juhu: x.juhu, juhuW: x.juhuW, weeks: x.weeks, adjust: a, pay: x.pay + a, noJuhu: !!m.noJuhu, note: m.noJuhu ? '주휴 없음' : '', left: api.isGone(m) };
  }).sort((a, b) => (a.full !== b.full ? (a.full ? 1 : -1) : a.name < b.name ? -1 : 1));
  const sum = k => rows.reduce((t, r) => t + (r[k] || 0), 0);
  return { month, data, rows, saved, total: sum('pay'), albaTotal: rows.filter(r => !r.full).reduce((t, r) => t + r.pay, 0), totalMin: rows.reduce((t, r) => t + (r.min || 0), 0) };
}

export function payrollCsv(store, pr, priv = {}) {
  const q = v => { const s = String(v == null ? '' : v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  const rows = [[`${store.name} ${pr.month} 정산표`], [],
    ['이름', '구분', '일한 날', '근무 시간(시간)', '시급/월급', '시급분·월급', '주휴', '1주', '2주', '3주', '4주', '5주', '가감', '지급액', '은행', '계좌', '메모']];
  pr.rows.forEach(r => rows.push([r.name, r.full ? '정직원' : '알바', r.workDays, Math.round(r.min / 6) / 10, r.wage, Math.round(r.base), Math.round(r.juhu),
    ...[0, 1, 2, 3, 4].map(i => (r.full ? '' : Math.round(r.juhuW[i] || 0))), r.adjust, Math.round(r.pay), (priv[r.uid] || {}).bank || '', (priv[r.uid] || {}).account || '', r.note]));
  rows.push([], ['합계', '', '', Math.round(pr.totalMin / 6) / 10, '', '', '', '', '', '', '', '', '', Math.round(pr.total)]);
  return '﻿' + rows.map(r => r.map(q).join(',')).join('\r\n');
}

// ---------- 화면: 정산표 (사장님) ----------
export async function payrollScreen(store, back, month) {
  const now = api.month(); month = month || now;
  const pr = await payrollData(store, month);
  const done = pr.saved && pr.saved.savedAt;
  show(`${top('급여 · 정산표', true)}
    <div class="row between"><h2 style="margin:12px 0">${esc(month.replace('-', '년 '))}월</h2>
      <span class="row" style="gap:6px"><button class="sm ghost" id="mPrev">‹ 지난달</button>${month < now ? '<button class="sm ghost" id="mNext">다음 ›</button>' : ''}</span></div>
    <div class="card hero"><div class="small">${month === now ? '오늘까지 ' : ''}지급 합계</div><div class="big">${won(pr.total)}</div>
      <p class="small">알바 ${won(pr.albaTotal)} · 정직원 ${won(pr.total - pr.albaTotal)} · ${pr.rows.length}명${done ? ` · <b>정산표 저장됨</b> (${esc(api.fmtWhen(pr.saved.savedAt.toDate()))})` : ''}</p></div>
    ${pr.rows.length ? `<div class="card scroll"><table><tr><th style="text-align:left">이름</th><th>시간</th><th>시급분</th><th>주휴</th><th>가감</th><th>지급액</th></tr>
      ${pr.rows.map(r => `<tr data-r="${r.uid}" style="cursor:pointer"><td class="name">${esc(r.name)}${r.full ? ' <span class="small">정</span>' : ''}${r.left ? ' <span class="small">퇴사</span>' : ''}</td>
        <td>${r.full ? '-' : records.hmText(r.min)}</td><td>${r.wage ? won(r.base) : '<span style="color:var(--bad)">시급 없음</span>'}</td>
        <td>${r.full ? '-' : won(r.juhu)}</td><td><input class="adj" data-a="${r.uid}" type="number" step="1000" inputmode="numeric" value="${r.adjust || ''}" placeholder="0" style="width:84px;padding:6px"></td>
        <td><b>${won(r.pay)}</b></td></tr>`).join('')}</table>
      <p class="small">이름을 누르면 주차별 주휴와 날짜별 시간이 보여요. 가감 = 보너스(+)·공제(−).</p></div><div id="detail"></div>`
      : '<div class="card"><p class="small">이 달 정산할 사람이 없어요.</p></div>'}
    ${pr.rows.some(r => !r.wage) ? '<div class="card" style="border-color:var(--bad)"><b style="color:var(--bad)">시급·월급이 없는 사람이 있어요</b><p class="small">☰ 더보기 → 직원 옆 [설정]에서 넣어 주세요. 알바는 비우면 매장 기본 시급으로 계산해요.</p></div>' : ''}
    <div class="card"><b>계산 방법</b><p class="small">· 알바: 근무 시간 × 시급 + 주휴<br>
      · 주휴: 1~7일, 8~14일, 15~21일, 22~28일, 29일~말일 묶음마다 15시간 이상이면 (그 주 시간, 최대 40시간) × 시급 × 20%<br>
      · 정직원: 월급 (그 달 중간에 들어오거나 나가면 날짜 수만큼)<br>
      · 근무 시간은 [월 근무 기록]과 같아요. 틀린 출퇴근은 오늘 탭에서 고친 뒤 다시 보세요<br>
      · 야간·휴일 수당은 아직 계산하지 않아요</p></div>
    ${pr.rows.length ? `<button id="save">정산표 저장${store.direct ? '' : ' · 대표님께 합계 보내기'}</button>
    <button class="ghost" id="csv" style="margin-top:8px">엑셀로 내려받기</button>
    <div class="card" style="margin-top:12px"><b>월말 보내기</b><p class="small">세무사 근태기록부 = 세무사 양식 그대로 (1쪽 요약 + 직원 1명 1장). 월말결제 이미지 = 송금 담당에게 보낼 이름·급여·계좌 (알바 + 반직원).</p>
      <div class="row" style="gap:8px;flex-wrap:wrap"><button class="ghost" id="taxX">📗 근태기록부 엑셀</button><button class="ghost" id="taxP">📄 근태기록부 PDF</button><button class="ghost" id="payImg">🖼️ 월말결제 이미지</button></div></div>` : ''}`);
  wireTop(back);
  const again = m => payrollScreen(store, back, m || month);
  $('mPrev').onclick = () => again(addMonth(month, -1));
  if ($('mNext')) $('mNext').onclick = () => again(addMonth(month, 1));
  const readAdj = () => Object.fromEntries([...document.querySelectorAll('.adj')].map(i => [i.dataset.a, Math.round(+i.value || 0)]).filter(x => x[1]));
  document.querySelectorAll('[data-r]').forEach(tr => {
    tr.onclick = ev => {
      if (ev.target.closest('input')) return;
      const r = pr.rows.find(x => x.uid === tr.dataset.r);
      $('detail').innerHTML = `<div class="card"><b>${esc(r.name)}</b> <span class="small">${r.full ? `월급 ${won(r.wage)} ${esc(r.note)}` : `시급 ${won(r.wage)} · ${r.workDays}일 · ${records.hmText(r.min)}`}</span>
        ${r.full ? '' : `<table class="kv" style="margin-top:8px"><tr><th>주</th><th>시간</th><th>주휴</th></tr>${['1~7일', '8~14일', '15~21일', '22~28일', '29일~'].map((w, i) => `<tr><td>${w}</td><td>${records.hmText(r.weeks[i] || 0)}${(r.weeks[i] || 0) > 0 && (r.weeks[i] || 0) < 900 ? ' <span class="small">15시간 안 됨</span>' : ''}</td><td>${won(r.juhuW[i] || 0)}</td></tr>`).join('')}</table>${r.noJuhu ? '<p class="small">주휴 없음으로 설정된 직원이에요.</p>' : ''}`}
        ${r.days.length ? `<div class="scroll" style="margin-top:8px"><table><tr><th>날짜</th><th>출근</th><th>퇴근</th><th>시간</th></tr>${r.days.map(d => `<tr><td>${esc(d.date.slice(5).replace('-', '/'))}</td><td>${esc(d.in || '-')}</td><td>${d.noOut ? '<span style="color:var(--bad)">없음</span>' : esc(d.out)}</td><td>${records.hmText(d.min)}</td></tr>`).join('')}</table></div>` : ''}</div>`;
      $('detail').scrollIntoView({ behavior: 'smooth' });
    };
  });
  if ($('csv')) $('csv').onclick = e => busy(e.target, async () => {
    const priv = Object.fromEntries((await api.privAll(store.id).catch(() => [])).map(p => [p.id, p]));
    records.download(`${store.name}_${month}_정산표.csv`, payrollCsv(store, pr, priv));
  });
  if ($('taxX')) $('taxX').onclick = e => busy(e.target, async () => {
    const b = await tax.taxXlsx(store.name || '', month, pr), a = document.createElement('a');
    a.href = URL.createObjectURL(b); a.download = `${store.name || '매장'}_${tax.ym(month)}_근태기록부.xlsx`; document.body.appendChild(a); a.click(); a.remove(); toast('엑셀을 내려받았어요');
  });
  if ($('taxP')) $('taxP').onclick = () => {
    const w = window.open('', '_blank'); if (!w) return toast('새 창이 막혔어요. 팝업을 허용해 주세요');
    w.document.write(tax.taxHtml(store.name || '', month, pr)); w.document.close();
  };
  if ($('payImg')) $('payImg').onclick = e => busy(e.target, async () => {
    const priv = Object.fromEntries((await api.privAll(store.id).catch(() => [])).map(p => [p.id, p]));
    const m = tax.payModel(pr, priv, new Set(pr.rows.filter(r => r.half).map(r => r.uid)));
    const cv = tax.payCanvas(`${store.name || ''} ${tax.ym(month)} 월말결제`, m), name = `월말결제_${month}.png`;
    await new Promise(ok => cv.toBlob(async b => {
      const f = new File([b], name, { type: 'image/png' });
      if (navigator.canShare && navigator.canShare({ files: [f] })) { try { await navigator.share({ files: [f], title: '월말결제' }); return ok(); } catch (x) { if (x.name === 'AbortError') return ok(); } }
      const a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = name; document.body.appendChild(a); a.click(); a.remove(); toast('이미지를 저장했어요'); ok();
    }, 'image/png'));
  });
  if ($('save')) $('save').onclick = e => busy(e.target, async () => {
    const adjust = readAdj();
    await api.savePayroll(store.id, month, {
      month, adjust, total: Math.round(pr.rows.reduce((t, r) => t + r.pay - r.adjust + (adjust[r.uid] || 0), 0)),
      rows: pr.rows.map(r => ({ uid: r.uid, name: r.name, full: r.full, wage: r.wage || 0, min: r.min, base: Math.round(r.base), juhu: Math.round(r.juhu), adjust: adjust[r.uid] || 0, pay: Math.round(r.pay - r.adjust + (adjust[r.uid] || 0)) })),
    });
    const sales = await api.monthSales(store.id, month).catch(() => null);
    const laborCost = Math.round(pr.rows.reduce((t, r) => t + r.pay - r.adjust + (adjust[r.uid] || 0), 0));
    await api.saveStats(store.id, month, { hours: Math.round(pr.totalMin / 6) / 10, headcount: pr.rows.length, byWeekday: pr.data.byWeekday, laborCost,
      ...(sales ? { sales, laborRatio: sales ? Math.round(laborCost / sales * 1000) / 1000 : null } : {}) });
    toast(store.direct ? '정산표를 저장했어요' : '저장하고 대표님께 합계를 보냈어요');
    await again();
  });
}

// ---------- 오늘 매출 · 알바 인건비 · 매출 대비 % (사장님 오늘 탭, 산성 앱과 같음) ----------
// 알바마다 (퇴근 또는 지금) − 계산 시작 × 시급. 주휴는 빼고(월말 정산표에서). 출근만 찍고 일하는 중이면 지금까지
export async function todayMoney(store) {
  const t = api.kst(), d = t.date, mon = api.mondayOf(d);
  const [ms, ps, wages, rules, sch, sales] = await Promise.all([api.members(store.id), api.punchesBetween(store.id, d, d), api.wagesAll(store.id),
    api.rulesFor(store.id, d.slice(0, 7)), api.getSchedule(store.id, mon), api.salesBetween(store.id, d, d)]);
  const W = Object.fromEntries(wages.map(w => [w.id, w])), P = {};
  ps.forEach(p => { (P[p.uid] = P[p.uid] || {})[p.kind] = p; });
  let cost = 0, done = 0, working = 0;
  for (const [uid, x] of Object.entries(P)) {
    const m = ms.find(y => y.id === uid); if (!m || m.type === '정') continue;
    const wage = wageOf(W[uid], d.slice(0, 7), rules, false); if (!wage) continue;
    const day = records.dayCalc({ date: d, inP: x.in, outP: x.out, plan: sched.todayPlan(sch, rules, m, d), rules });
    let min = day.min;
    if (!x.out) { const startAt = Date.parse(`${d}T${day.calcStart}:00+09:00`); min = Math.max(0, Math.floor((Date.now() - startAt) / 60000)); working++; } else done++;
    cost += min / 60 * wage;
  }
  const amount = sales.length ? (+sales[0].amount || 0) : null;
  return { sales: amount, cost: Math.round(cost), ratio: amount ? Math.round(cost / amount * 1000) / 10 : null, done, working };
}
export function moneyCard(mo) {
  const w = n => Math.round(n).toLocaleString() + '원';
  return `<div class="card"><b>💰 오늘 매출 · 알바 인건비</b><div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;margin-top:8px;text-align:center">
    <div><div class="small">매출</div><div style="font-size:18px;font-weight:800">${mo.sales != null ? w(mo.sales) : '<span class="small">아직 안 넣음</span>'}</div></div>
    <div><div class="small">알바 인건비</div><div style="font-size:18px;font-weight:800">${w(mo.cost)}</div></div>
    <div><div class="small">매출 대비</div><div style="font-size:18px;font-weight:800">${mo.ratio != null ? mo.ratio + '%' : '–'}</div></div></div>
    <p class="small" style="margin-top:6px">퇴근 ${mo.done}명${mo.working ? ` · 근무 중 ${mo.working}명은 지금까지` : ''} · 시급 × 근무 시간(주휴 빼고)${mo.sales == null ? ' · 매출은 💰 매출 탭에서 넣으면 %가 나와요' : ''}</p></div>`;
}

// ---------- 직원 본인: 이번 달 내 급여 (알바만) ----------
export async function myPay(store, me, month) {
  if (me.type === '정') return null;
  const [rules, wagesDoc, days] = await Promise.all([api.rulesFor(store.id, month), api.myWage(store.id).catch(() => null), records.myDays(store, me, month)]);
  const wage = wageOf(wagesDoc, month, rules, false);
  if (!wage) return null;
  return { wage, ...albaPay(days, wage, { noJuhu: !!me.noJuhu, juhu: rules && rules.pay && rules.pay.juhu }) };
}
