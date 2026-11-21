// 매장 규칙 입력 · 매장 규칙 바꾸기 · 새 매장 만들기 화면 (새 앱 multi와 산성 화면 multi2가 같이 씀)
import * as api from './fb.js?v=31';
import { STORE_RULES_DEFAULT } from './defaults.js?v=31';
import { $, esc, DOW, DOW_ORDER, ls, clone, toast, show, top, wireTop, busy } from './ui.js?v=31';

export function rulesFields(r) {
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
export function readRules(base) {
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


// 규칙 바꾸기: back = 돌아갈 화면, done = 저장한 뒤
export function rulesScreen(s, base, back, done) {
  const now = api.month(), next = api.month(new Date(), 1);
  show(`${top('매장 규칙 바꾸기', true)}<div class="card">${rulesFields(base)}
    <label>언제부터</label><div class="row"><button class="sm ghost" id="fNow">이번 달부터 (${now})</button><button class="sm" id="fNext">다음 달부터 (${next})</button></div>
    <p class="small">이번 달부터 = 이번 달 1일부터 다시 계산. 다음 달부터 = 지금 달 급여는 그대로.</p></div>`);
  wireTop(back);
  const save = from => async e => busy(e.target, async () => {
    const { id, from: _f, ...plain } = base;
    const r = readRules({ ...clone(STORE_RULES_DEFAULT), ...clone(plain) });
    await api.saveRules(s.id, from, r);
    toast(from + '부터 적용돼요'); (done || back)();
  });
  $('fNow').onclick = save(now); $('fNext').onclick = save(next);
}

// 새 매장 만들기: ctx = { orgId, direct, inviteCode }, done(id) = 만든 뒤
export function storeForm(ctx, back, done) {
  show(`${top('새 매장 만들기', true)}
    <div class="card"><label>매장 이름</label><input id="sn" maxlength="40" placeholder="예: 산성 2호점">
    <p class="small">직원이 가입할 때 이 이름으로 매장을 찾아요. 처음 값은 산성 규칙이에요. 다른 것만 바꾸세요. 나중에도 바꿀 수 있어요.</p>
    ${rulesFields(STORE_RULES_DEFAULT)}
    <button id="save" style="margin-top:16px">매장 만들기</button></div>`);
  wireTop(back);
  $('save').onclick = e => busy(e.target, async () => {
    const name = $('sn').value.trim();
    if (!name) throw new Error('매장 이름을 넣어 주세요');
    const rules = readRules(STORE_RULES_DEFAULT);
    const id = await api.createStore({ ...ctx, name, rules });
    if (!ctx.direct) ls.del('mate_owner');
    toast('매장을 만들었어요');
    done(id, name);
  });
}
