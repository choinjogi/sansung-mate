// 대시보드 탭: 지금 산성 결산 시트 "대시보드"와 같은 항목 (이번 달 현재까지 vs 지난달 같은 기간)
//  인건비: 현재까지 알바 인건비 · 월 예상 알바 인건비 · 현재 정직원 인건비 · 현재 총 인건비 · 이번 달 예상 정직원 인건비
//  매출:   현재까지 매출 · 당월 예상 매출 · 일매출 평균
//  비율:   알바비 비율 · 총 인건비 비율      예상: 이번 달 예상 총 인건비
//  근태:   ⚠ 확인 안 한 것 · 이번 달 지각 · 지각 많은 사람
// 정직원 인건비는 하루치(월급 ÷ 그 달 일수)를 23시가 지나야 하루로 셈 (시트와 같음). 예상 = 현재 ÷ 지난 날 × 그 달 일수
// 인건비·비율은 시급·월급을 보는 사장님만. 매니저는 매출·근태만
import * as api from './fb.js?v=27';
import { esc, show, top, wireTop } from './ui.js?v=27';
import * as records from './records.js?v=27';
import * as pay from './pay.js?v=27';
import { addMonth, lastDay } from './paycalc.js?v=27';

const W = n => (n == null ? '–' : '₩' + Math.round(n).toLocaleString());
const pct = n => (n == null || !isFinite(n) ? '–' : (Math.round(n * 1000) / 10).toFixed(1) + '%');
const ymdOf = (m, d) => `${m}-${String(d).padStart(2, '0')}`;

async function period(store, month, uptoDay, owner) {
  const data = await records.monthData(store, month);
  const until = ymdOf(month, Math.min(uptoDay, lastDay(month)));
  const salesRows = await api.salesBetween(store.id, month + '-01', until);
  const sales = salesRows.reduce((a, r) => a + (+r.amount || 0), 0);
  const people = data.people.map(p => ({ ...p, days: p.days.filter(d => d.date <= until) })).filter(p => p.days.length);
  const late = people.map(p => ({ name: p.name, n: p.days.filter(d => d.late).length, min: p.days.reduce((a, d) => a + (d.late || 0), 0) })).filter(x => x.n);
  const out = { sales, salesDays: salesRows.length, late };
  if (owner) {
    // 알바 = 그날까지 출퇴근으로. 정직원 "현재"는 dashScreen에서 그 달 월급 × 지난 날 ÷ 일수로 (23시 기준)
    const pr = await pay.payrollData(store, month, until, data);
    out.alba = pr.rows.filter(r => !r.full).reduce((a, r) => a + r.pay - r.adjust, 0);
    const prMonth = await pay.payrollData(store, month, ymdOf(month, lastDay(month)), data);
    out.fullMonth = prMonth.rows.filter(r => r.full).reduce((a, r) => a + r.pay - r.adjust, 0);
    out.albaMonth = prMonth.rows.filter(r => !r.full).reduce((a, r) => a + r.pay - r.adjust, 0);
  }
  return out;
}

// 대시보드 숫자만 (산성 화면 multi2에서도 씀): { t, day, rows:[{sec,label,val,pv,c,note,goodUp}] }
export async function dashData(store, owner) {
  const t = api.kst(), now = api.month(), prev = addMonth(now, -1);
  const day = +t.date.slice(8), n = lastDay(now);
  const passed = t.hour >= 23 ? day : day - 1;          // 다 지난 날 (예상 계산·정직원)
  const [cur, old, oldAll, fl] = await Promise.all([
    period(store, now, day, owner), period(store, prev, day, owner), period(store, prev, lastDay(prev), owner),
    api.flaggedSince(store.id, now + '-01'),
  ]);
  if (owner) { // 정직원 = 23시 지나야 하루
    cur.full = cur.fullMonth * Math.max(0, passed) / n;
    old.full = oldAll.fullMonth * Math.min(day, lastDay(prev)) / lastDay(prev);
  }
  const est = (v, d) => (d > 0 ? v / d * n : null);
  const chg = (a, b, isPct) => {
    if (a == null || b == null || !isFinite(a) || !isFinite(b)) return '';
    if (isPct) { const d = (a - b) * 100; return `${d >= 0 ? '▲' : '▼'}${Math.abs(d).toFixed(1)}%p`; }
    if (!b) return '';
    const d = (a - b) / b * 100; return `${d >= 0 ? '▲' : '▼'}${Math.abs(d).toFixed(1)}%`;
  };
  const rows = [];
  const add = (sec, label, val, pv, c, note, goodUp) => rows.push({ sec, label, val, pv, c, note, goodUp });
  if (owner) {
    const albaEst = est(cur.alba, passed);
    add('인건비', '현재까지 알바 인건비', W(cur.alba), W(old.alba), chg(cur.alba, old.alba));
    add('인건비', '월 예상 알바 인건비', W(albaEst), W(oldAll.albaMonth), chg(albaEst, oldAll.albaMonth), '지난달 전체');
    add('인건비', '현재 정직원 인건비', W(cur.full), W(old.full), chg(cur.full, old.full));
    add('인건비', '현재 총 인건비 (정+알)', W(cur.alba + cur.full), W(old.alba + old.full), chg(cur.alba + cur.full, old.alba + old.full));
    add('인건비', '이번 달 예상 정직원 인건비', W(cur.fullMonth), W(oldAll.fullMonth), chg(cur.fullMonth, oldAll.fullMonth), '지난달 전체');
  }
  const salesEst = est(cur.sales, cur.salesDays ? cur.salesDays : 0);
  add('매출', '현재까지 매출', W(cur.sales), W(old.sales), chg(cur.sales, old.sales), '', true);
  add('매출', '당월 예상 매출', W(salesEst), W(oldAll.sales), chg(salesEst, oldAll.sales), '지난달 전체', true);
  add('매출', '일매출 평균', W(cur.salesDays ? cur.sales / cur.salesDays : null), W(old.salesDays ? old.sales / old.salesDays : null),
    chg(cur.salesDays ? cur.sales / cur.salesDays : null, old.salesDays ? old.sales / old.salesDays : null), '', true);
  if (owner) {
    const r = (a, b) => (b ? a / b : null);
    add('비율', '현재까지 알바비 비율', pct(r(cur.alba, cur.sales)), pct(r(old.alba, old.sales)), chg(r(cur.alba, cur.sales), r(old.alba, old.sales), true));
    add('비율', '현재까지 총 인건비 비율', pct(r(cur.alba + cur.full, cur.sales)), pct(r(old.alba + old.full, old.sales)), chg(r(cur.alba + cur.full, cur.sales), r(old.alba + old.full, old.sales), true));
    const tot = est(cur.alba, passed) + cur.fullMonth, totOld = oldAll.albaMonth + oldAll.fullMonth;
    add('예상', `${+now.slice(5)}월 예상 총 인건비 (정+알)`, W(tot), W(totOld), chg(tot, totOld), '지난달 전체');
  }
  const todo = fl.filter(p => !p.reviewed).length;
  const lateN = cur.late.reduce((a, x) => a + x.n, 0), lateMin = cur.late.reduce((a, x) => a + x.min, 0);
  const top3 = cur.late.sort((a, b) => b.n - a.n || b.min - a.min).slice(0, 3).map(x => `${x.name} ${x.n}회`).join(', ');
  add('근태', '⚠ 확인 안 한 것', `${todo}건`, '', '', '', null);
  add('근태', '이번 달 지각', `${lateN}회 · ${lateMin}분`, `${old.late.reduce((a, x) => a + x.n, 0)}회`, '', '', null);
  add('근태', '지각 많은 사람', top3 || '없음', '', '', '', null);

  return { t, day, rows };
}

export async function dashScreen(store, back, owner) {
  const { t, day, rows } = await dashData(store, owner);
  const color = (row) => { if (!row.c) return 'var(--sub)'; const up = row.c.startsWith('▲'); return (row.goodUp ? up : !up) ? 'var(--ok)' : 'var(--bad)'; };
  let sec = '';
  const body = rows.map(x => {
    const head = x.sec !== sec ? (sec = x.sec, `<div class="small" style="color:var(--gold);font-weight:700;margin-top:10px">${esc(x.sec)}</div>`) : '';
    return head + `<div class="item"><div><b style="font-size:15px">${esc(x.label)}</b>${x.pv ? `<div class="small">${esc(x.note || '지난달 같은 기간')} ${esc(x.pv)}</div>` : ''}</div>
      <div style="text-align:right"><div style="font-weight:800">${esc(x.val)}</div>${x.c ? `<span style="color:${color(x)};font-weight:700;font-size:13px">${esc(x.c)}</span>` : ''}</div></div>`;
  }).join('');
  show(`${top(back ? '대시보드' : store.name, true)}<h2>대시보드</h2>
    <p class="small">${esc(t.date.slice(5).replace('-', '/'))} ${esc(t.hm)} 기준 · 지난달 같은 기간(1~${day}일)과 비교</p>
    <div class="card list">${body}</div>
    <p class="small">· 인건비는 출퇴근 기록으로 계산한 값(정산표와 같은 방식)이고 가감은 빼요<br>· 정직원 인건비는 23시가 지나야 그날을 넣어요<br>· 예상 = 지금까지 ÷ 지난 날 수 × 그 달 일수 (매출은 넣은 날 기준)${owner ? '' : '<br>· 인건비는 사장님 화면에만 나와요'}</p>`);
  wireTop(back);
}
