// 매출 탭 (사장님·매니저): 이달 1일 ~ 오늘 날짜별 매출 넣기·고치기, 합계·하루 평균(입력된 날만)
// 저장: stores/{매장}/sales/{YYYY-MM-DD} = { date, amount, by, at }. 정산표를 저장할 때 그 달 합계가 대표님 합계(stats)에 같이 들어감
import * as api from './fb.js?v=12';
import { $, esc, DOW, toast, show, top, wireTop, busy } from './ui.js?v=12';
import { addMonth, lastDay } from './paycalc.js?v=12';

const man = n => Math.round(n).toLocaleString();
const label = d => `${+d.slice(5, 7)}/${+d.slice(8)}(${DOW[api.dowOf(d)]})`;

export async function salesScreen(store, back, month) {
  const now = api.month(), today = api.kst().date; month = month || now;
  const last = month === now ? today : `${month}-${String(lastDay(month)).padStart(2, '0')}`;
  const rows = await api.salesBetween(store.id, month + '-01', last);
  const S = Object.fromEntries(rows.map(r => [r.date, r]));
  const dates = []; for (let d = last; d >= month + '-01'; d = api.addDays(d, -1)) dates.push(d);
  const filled = dates.filter(d => S[d]), total = filled.reduce((a, d) => a + (+S[d].amount || 0), 0);
  const missing = dates.filter(d => !S[d] && d < today);
  show(`${top(back ? '매출' : store.name, true)}
    <div class="row between"><h2 style="margin:12px 0">매출 · ${esc(month.replace('-', '년 '))}월</h2>
      <span class="row" style="gap:6px"><button class="sm ghost" id="mPrev">‹ 지난달</button>${month < now ? '<button class="sm ghost" id="mNext">다음 ›</button>' : ''}</span></div>
    <div class="card hero"><div class="small">${month === now ? '오늘까지 ' : ''}합계</div><div class="big">${man(total)}원</div>
      <p class="small">입력한 날 ${filled.length}일 · 하루 평균 ${filled.length ? man(total / filled.length) : 0}원${missing.length ? ` · <b style="color:var(--warn)">안 넣은 날 ${missing.length}일</b>` : ''}</p></div>
    <div class="card"><b>매출 넣기</b>
      <div class="row" style="gap:8px;margin-top:8px"><input type="date" id="sd" value="${esc(dates[0])}" min="${month}-01" max="${esc(last)}" style="flex:1">
        <input type="number" id="sa" min="0" step="1000" inputmode="numeric" placeholder="금액(원)" style="flex:1"></div>
      <button id="sv" style="margin-top:10px">저장</button></div>
    <div class="card list">${dates.map(d => `<div class="item" data-d="${d}" style="cursor:pointer"><span>${label(d)}</span>
      <span>${S[d] ? `<b>${man(S[d].amount)}원</b>` : d < today ? '<span class="pill warn">안 넣음</span>' : '<span class="small">-</span>'}</span></div>`).join('')}</div>
    <p class="small">날짜를 누르면 위 칸에 채워져요. 이미 넣은 날을 다시 저장하면 바뀌어요.</p>`);
  wireTop(back);
  const again = m => salesScreen(store, back, m || month);
  $('mPrev').onclick = () => again(addMonth(month, -1));
  if ($('mNext')) $('mNext').onclick = () => again(addMonth(month, 1));
  document.querySelectorAll('[data-d]').forEach(el => {
    el.onclick = () => { $('sd').value = el.dataset.d; $('sa').value = S[el.dataset.d] ? S[el.dataset.d].amount : ''; $('sa').focus(); window.scrollTo({ top: 0, behavior: 'smooth' }); };
  });
  $('sv').onclick = e => busy(e.target, async () => {
    const d = $('sd').value, a = Math.round(+$('sa').value);
    if (!d || d > today) throw new Error('날짜를 골라 주세요 (오늘까지)');
    if (!$('sa').value || !(a >= 0)) throw new Error('금액을 넣어 주세요');
    if (S[d] && +S[d].amount !== a && !confirm(`${label(d)} 매출이 ${man(S[d].amount)}원으로 들어가 있어요. ${man(a)}원으로 바꿀까요?`)) return;
    await api.setSales(store.id, d, a);
    toast(`${label(d)} ${man(a)}원 저장했어요`);
    await again(d.slice(0, 7));
  });
}
