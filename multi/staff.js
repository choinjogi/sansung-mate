// 입사 · 퇴사 (사장님·매니저) — 지금 산성 앱 "입사 · 퇴사"와 같은 방식
//  입사: 이름·구분·시급(사장님만)·정시 출근·입사일을 미리 등록 → 그 이름으로 가입 신청이 오면 승인 탭에 "입사 등록됨"이 뜨고,
//        승인하면 구분·정시·입사일이 자동으로 들어감 (시급은 사장님이 승인하거나 사장님 화면을 열 때 들어감)
//  퇴사: 이름 + 퇴사일(마지막 근무일). 그날까지는 그대로 일하고(퇴근 찍기 됨), 다음 날부터 로그인·근무표·출퇴근에서 빠짐.
//        정산은 퇴사일까지. 지난 출퇴근 기록은 그대로
import * as api from './fb.js?v=22';
import { $, esc, toast, show, top, wireTop, busy } from './ui.js?v=22';

const md = d => `${+d.slice(5, 7)}/${+d.slice(8)}`;
const since = d => (d ? md(d) + ' 입사' : '기존 직원');

// 여러 명 붙여 넣기: 한 줄에 한 명 "이름, 구분, 시급(월급), 정시, 입사일" (쉼표나 탭. 엑셀에서 복사해도 됨). 뒤의 칸은 비워도 됨
export function parseBulk(text, { defStart = '18:00', owner = true, taken = new Set(), today = '' } = {}) {
  const seen = new Set();
  return String(text || '').split(/\r?\n/).map(l => l.trim()).filter(Boolean).filter(l => !/^이름[\s,\t]/.test(l)).map(line => {
    const c = line.split(/\t|,/).map(x => x.trim());
    const name = (c[0] || '').replace(/\s+/g, ' '), tRaw = c[1] || '알바', wRaw = (c[2] || '').replace(/[^\d]/g, ''), sRaw = c[3] || '', dRaw = c[4] || '';
    const err = [];
    if (!name || name.length > 20) err.push('이름');
    const type = /^(정|정직원)$/.test(tRaw) ? '정' : /^(알|알바|아르바이트)$/.test(tRaw) ? '알' : null;
    if (!type) err.push('구분은 알바/정직원');
    const wage = owner && wRaw ? +wRaw : null;
    if (owner && type === '정' && !wage) err.push('정직원은 월급');
    let startTime = defStart;
    if (sRaw) { const m = sRaw.match(/^(\d{1,2}):?(\d{2})$/); if (m && +m[1] < 24 && +m[2] < 60) startTime = String(+m[1]).padStart(2, '0') + ':' + m[2]; else err.push('정시는 18:00처럼'); }
    let startDate = null;
    if (dRaw && !/^기존/.test(dRaw)) {
      const m = dRaw.match(/^(\d{2}|\d{4})[.\-/ ]\s*(\d{1,2})[.\-/ ]\s*(\d{1,2})\.?$/);
      if (m) startDate = `${m[1].length === 2 ? '20' + m[1] : m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
      if (!startDate || isNaN(Date.parse(startDate))) { startDate = null; err.push('입사일은 2026-03-01처럼'); }
      else if (today && startDate > today) { /* 앞으로 들어올 사람도 됨 */ }
    }
    const key = api.nameKey(name);
    if (name && taken.has(key)) err.push('이미 있는 이름');
    if (name && seen.has(key)) err.push('목록에 두 번');
    seen.add(key);
    return { line, name, type, wage, startTime, startDate, err };
  });
}

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
      <label>어떤 직원인가요?</label>
      <div class="row" style="gap:8px"><label style="margin:0;display:flex;gap:6px;align-items:center"><input type="radio" name="hk" value="old" checked style="width:auto">지금 일하는 직원</label>
        <label style="margin:0;display:flex;gap:6px;align-items:center"><input type="radio" name="hk" value="new" style="width:auto">새로 들어오는 직원</label></div>
      <div id="hdBox" style="display:none"><label>입사일 (첫 근무일)</label><input id="hd" type="date" value="${today}"></div>
      <button id="hadd" style="margin-top:14px">입사 등록</button>
      <p class="small" style="margin-top:8px">등록한 뒤 직원이 앱에서 같은 이름으로 가입 신청하면 ✅ 승인 탭에 "입사 등록됨"으로 떠요. 승인하면 위 내용이 자동으로 들어가요.${owner ? ' 시급을 비우면 매장 기본 시급이에요.' : ' 시급은 사장님이 정해요.'}</p></div>
    <div class="card"><b>📋 여러 명 한 번에</b>
      <p class="small">한 줄에 한 명: <b>이름, 구분, ${owner ? '시급(월급), ' : ''}정시, 입사일</b> — 뒤의 칸은 비워도 돼요(정시 비우면 매장 정시, 입사일 비우거나 "기존"이면 지금 일하는 직원). 엑셀에서 칸째 복사해도 돼요.</p>
      <textarea id="bk" rows="6" style="width:100%;margin-top:6px" placeholder="홍길동, 알바, 10500, 18:00\n김철수, 알바, , 17:00\n이영희, 정직원, 2500000, 11:00, 2025-03-01"></textarea>
      <button class="ghost" id="bkPrev" style="margin-top:8px">미리보기</button><div id="bkOut"></div></div>
    ${hires.length ? `<div class="card"><b>가입 기다리는 입사 등록 ${hires.length}명</b><div class="list">${hires.map(h => `
      <div class="item"><span><b>${esc(h.name)}</b> <span class="small">${h.type === '정' ? '정직원' : '알바'} · ${esc(h.startTime || '')} · ${since(h.startDate)}${owner && h.wage ? ` · ${(+h.wage).toLocaleString()}원` : ''}</span></span>
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
  document.querySelectorAll('input[name=hk]').forEach(i => { i.onchange = () => { $('hdBox').style.display = i.value === 'new' && i.checked ? '' : 'none'; }; });
  if ($('ht') && $('hwl')) $('ht').onchange = () => { $('hwl').textContent = $('ht').value === '정' ? '월급 (원)' : '시급 (원)'; };
  $('hadd').onclick = e => busy(e.target, async () => {
    const isNew = document.querySelector('input[name=hk]:checked').value === 'new';
    const name = $('hn').value.trim(), type = $('ht').value, startTime = $('hs').value, startDate = isNew ? $('hd').value : '';
    if (isNew && !startDate) throw new Error('입사일을 골라 주세요');
    const wage = owner && $('hw').value ? Math.round(+$('hw').value) : null;
    if (!name) throw new Error('이름을 넣어 주세요');
    if (type === '정' && owner && !wage) throw new Error('정직원은 월급을 넣어 주세요');
    if (ms.some(m => api.nameKey(m.name) === api.nameKey(name) && api.isActive(m, today))) throw new Error('같은 이름의 직원이 이미 있어요');
    if (!confirm(`${name} · ${type === '정' ? '정직원' : '알바'}${wage ? ` · ${wage.toLocaleString()}원` : ''} · ${startTime} 출근 · ${since(startDate)}\n이대로 등록할까요?`)) return;
    await api.addHire(store.id, { name, type, startTime, startDate: startDate || null, ...(wage ? { wage } : {}) });
    toast('입사 등록했어요. 직원이 같은 이름으로 가입 신청하면 승인 탭에 떠요'); await again();
  });
  const opts = () => ({ defStart: (r && r.open.startTime) || '18:00', owner, today,
    taken: new Set([...ms.filter(m => api.isActive(m, today)).map(m => api.nameKey(m.name)), ...hires.map(h => h.id)]) });
  $('bkPrev').onclick = () => {
    const rows = parseBulk($('bk').value, opts()), good = rows.filter(x => !x.err.length);
    if (!rows.length) { $('bkOut').innerHTML = '<p class="small" style="color:var(--warn)">붙여 넣은 줄이 없어요.</p>'; return; }
    $('bkOut').innerHTML = `<div class="scroll" style="margin-top:10px"><table><tr><th class="name">이름</th><th>구분</th>${owner ? '<th>시급·월급</th>' : ''}<th>정시</th><th>입사</th><th></th></tr>
      ${rows.map(x => `<tr><td class="name">${esc(x.name || x.line)}</td><td>${x.type === '정' ? '정직원' : x.type ? '알바' : '-'}</td>${owner ? `<td>${x.wage ? x.wage.toLocaleString() : '기본'}</td>` : ''}<td>${esc(x.startTime)}</td><td>${esc(x.startDate ? md(x.startDate) : '기존')}</td>
        <td>${x.err.length ? `<span style="color:var(--bad)">${esc(x.err.join(', '))}</span>` : '✓'}</td></tr>`).join('')}</table></div>
      ${good.length ? `<button id="bkGo" style="margin-top:10px">${good.length}명 입사 등록${rows.length > good.length ? ` (빨간 줄 ${rows.length - good.length}개는 빼고)` : ''}</button>` : '<p class="small" style="color:var(--bad)">등록할 수 있는 줄이 없어요. 빨간 글씨를 고쳐 주세요.</p>'}`;
    if ($('bkGo')) $('bkGo').onclick = e => busy(e.target, async () => {
      for (const x of good) await api.addHire(store.id, { name: x.name, type: x.type, startTime: x.startTime, startDate: x.startDate, ...(x.wage ? { wage: x.wage } : {}) });
      toast(`${good.length}명 입사 등록했어요. 직원들이 가입 신청하면 승인 탭에 떠요`); await again();
    });
  };
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
  if (hire) Object.assign(patch, { type: hire.type || '알', startTime: hire.startTime || null, ...(hire.startDate ? { startDate: hire.startDate } : {}) });
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
