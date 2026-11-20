// 입사 · 퇴사 (사장님·매니저) — 지금 산성 앱 "입사 · 퇴사"와 같은 방식
//  입사: 이름·구분·시급(사장님만)·정시 출근·입사일을 미리 등록 → 그 이름으로 가입 신청이 오면 승인 탭에 "입사 등록됨"이 뜨고,
//        승인하면 구분·정시·입사일이 자동으로 들어감 (시급은 사장님이 승인하거나 사장님 화면을 열 때 들어감)
//  퇴사: 이름 + 퇴사일(마지막 근무일). 그날까지는 그대로 일하고(퇴근 찍기 됨), 다음 날부터 로그인·근무표·출퇴근에서 빠짐.
//        정산은 퇴사일까지. 지난 출퇴근 기록은 그대로
import * as api from './fb.js?v=12';
import { $, esc, toast, show, top, wireTop, busy } from './ui.js?v=12';

const md = d => `${+d.slice(5, 7)}/${+d.slice(8)}`;

export async function staffScreen(store, back, owner) {
  const today = api.kst().date;
  const [ms, hires, rules] = await Promise.all([api.members(store.id), api.hiresOf(store.id), api.rulesOf(store.id)]);
  const r = rules.current, me = api.auth.currentUser.uid;
  const act = ms.filter(m => api.isActive(m, today)).sort((a, b) => (a.name < b.name ? -1 : 1));
  const gone = ms.filter(m => api.isGone(m, today)).sort((a, b) => (a.name < b.name ? -1 : 1));
  const soon = act.filter(m => m.leaveDate);
  show(`${top('입사 · 퇴사', true)}
    <div class="card"><b>🙋 새 직원 입사</b>
      <label>이름 (실명, 가입할 때 쓰는 이름)</label><input id="hn" placeholder="예: 홍길동" autocomplete="off" maxlength="20">
      <label>구분</label><select id="ht"><option value="알">알바</option><option value="정">정직원</option></select>
      <div class="row" style="gap:10px">
        ${owner ? `<div style="flex:1"><label id="hwl">시급 (원)</label><input id="hw" type="number" inputmode="numeric" step="10" placeholder="${r && r.pay.baseWage ? r.pay.baseWage : ''}"></div>` : ''}
        <div style="flex:1"><label>정시 출근</label><input id="hs" type="time" step="300" value="${esc((r && r.open.startTime) || '18:00')}"></div></div>
      <label>입사일 (첫 근무일)</label><input id="hd" type="date" value="${today}">
      <button id="hadd" style="margin-top:14px">입사 등록</button>
      <p class="small" style="margin-top:8px">등록한 뒤 직원이 앱에서 같은 이름으로 가입 신청하면 ✅ 승인 탭에 "입사 등록됨"으로 떠요. 승인하면 위 내용이 자동으로 들어가요.${owner ? ' 시급을 비우면 매장 기본 시급이에요.' : ' 시급은 사장님이 정해요.'}</p></div>
    ${hires.length ? `<div class="card"><b>가입 기다리는 입사 등록 ${hires.length}명</b><div class="list">${hires.map(h => `
      <div class="item"><span><b>${esc(h.name)}</b> <span class="small">${h.type === '정' ? '정직원' : '알바'} · ${esc(h.startTime || '')} · ${md(h.startDate)} 입사${owner && h.wage ? ` · ${(+h.wage).toLocaleString()}원` : ''}</span></span>
        <button class="sm ghost" data-hdel="${esc(h.id)}" data-name="${esc(h.name)}">지우기</button></div>`).join('')}</div></div>` : ''}
    <div class="card"><b>👋 퇴사</b>
      <label>누구</label><select id="rn"><option value="">이름 고르기</option>${act.filter(m => m.id !== me).map(m => `<option value="${m.id}">${esc(m.name)}</option>`).join('')}</select>
      <label>퇴사일 (마지막 근무일)</label><input type="date" id="rd" value="${today}">
      <button class="ghost" id="rdel" style="margin-top:14px">퇴사 처리</button>
      <p class="small" style="margin-top:8px">퇴사일까지는 그대로 일하고 퇴근도 찍혀요. 다음 날부터 로그인·근무표·출퇴근에서 빠지고, 급여는 퇴사일까지 정산돼요. 지난 기록은 그대로 남아요.</p></div>
    ${soon.length ? `<div class="card"><b>퇴사 예정</b><div class="list">${soon.map(m => `<div class="item"><span>${esc(m.name)} <span class="small">${md(m.leaveDate)}까지</span></span><button class="sm ghost" data-back="${m.id}" data-name="${esc(m.name)}">취소</button></div>`).join('')}</div></div>` : ''}
    ${gone.length ? `<div class="card"><b>퇴사한 직원 ${gone.length}명</b><div class="list">${gone.map(m => `<div class="item"><span>${esc(m.name)}${m.leaveDate ? ` <span class="small">${md(m.leaveDate)} 퇴사</span>` : ''}</span><button class="sm ghost" data-back="${m.id}" data-name="${esc(m.name)}">다시 일함</button></div>`).join('')}</div></div>` : ''}`);
  wireTop(back);
  const again = () => staffScreen(store, back, owner);
  if ($('ht') && $('hwl')) $('ht').onchange = () => { $('hwl').textContent = $('ht').value === '정' ? '월급 (원)' : '시급 (원)'; };
  $('hadd').onclick = e => busy(e.target, async () => {
    const name = $('hn').value.trim(), type = $('ht').value, startTime = $('hs').value, startDate = $('hd').value;
    const wage = owner && $('hw').value ? Math.round(+$('hw').value) : null;
    if (!name) throw new Error('이름을 넣어 주세요');
    if (!startDate) throw new Error('입사일을 골라 주세요');
    if (type === '정' && owner && !wage) throw new Error('정직원은 월급을 넣어 주세요');
    if (ms.some(m => api.nameKey(m.name) === api.nameKey(name) && api.isActive(m, today))) throw new Error('같은 이름의 직원이 이미 있어요');
    if (!confirm(`${name} · ${type === '정' ? '정직원' : '알바'}${wage ? ` · ${wage.toLocaleString()}원` : ''} · ${startTime} 출근 · ${md(startDate)} 입사\n이대로 등록할까요?`)) return;
    await api.addHire(store.id, { name, type, startTime, startDate, ...(wage ? { wage } : {}) });
    toast('입사 등록했어요. 직원이 같은 이름으로 가입 신청하면 승인 탭에 떠요'); await again();
  });
  document.querySelectorAll('[data-hdel]').forEach(b => { b.onclick = () => { if (confirm(b.dataset.name + '님 입사 등록을 지울까요?')) busy(b, async () => { await api.removeHire(store.id, b.dataset.hdel); await again(); }); }; });
  $('rdel').onclick = e => busy(e.target, async () => {
    const id = $('rn').value, d = $('rd').value, m = act.find(x => x.id === id);
    if (!m || !d) throw new Error('이름과 퇴사일을 골라 주세요');
    if (!confirm(`${m.name}님을 ${md(d)} 퇴사로 넣을까요?\n${d < today ? '바로' : md(d) + ' 다음 날부터'} 로그인·근무표에서 빠져요.`)) return;
    await api.setMember(store.id, id, d < today ? { leaveDate: d, status: 'left', leftAt: api.F.serverTimestamp() } : { leaveDate: d });
    toast('퇴사 처리했어요'); await again();
  });
  document.querySelectorAll('[data-back]').forEach(b => { b.onclick = () => { if (confirm(b.dataset.name + '님을 다시 직원으로 돌릴까요?')) busy(b, async () => { await api.setMember(store.id, b.dataset.back, { status: 'active', leaveDate: null }); toast('다시 직원이 됐어요'); await again(); }); }; });
}

// 승인할 때: 그 이름으로 입사 등록이 있으면 구분·정시·입사일(+사장님이면 시급)을 넣고 등록을 지움
export async function approveWithHire(store, m, hire, owner) {
  const patch = { status: 'active' };
  if (hire) Object.assign(patch, { type: hire.type || '알', startTime: hire.startTime || null, startDate: hire.startDate || null });
  await api.setMember(store.id, m.id, patch);
  if (hire && owner && hire.wage) await api.setWage(store.id, m.id, (hire.startDate || api.kst().date).slice(0, 7), hire.wage);
  if (hire && (owner || !hire.wage)) await api.removeHire(store.id, hire.id);
}

// 사장님 화면을 열 때: 매니저가 승인해서 시급이 남아 있는 입사 등록을 마저 넣음
export async function finishHires(store, ms) {
  const hires = (await api.hiresOf(store.id)).filter(h => h.wage);
  for (const h of hires) {
    const m = ms.find(x => x.status === 'active' && api.nameKey(x.name) === h.id);
    if (!m) continue;
    await api.setWage(store.id, m.id, (h.startDate || api.kst().date).slice(0, 7), h.wage);
    await api.removeHire(store.id, h.id);
  }
}
