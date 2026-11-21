// 공지 + 내 정보 — 지금 산성 앱과 같은 방식
//  공지: 사장님·매니저가 쓰고 지움. 직원 홈 맨 위에 최근 3개
//  내 정보: 직원이 은행·계좌·이메일을 넣으면 "변경 요청"으로만 저장 → 사장님이 승인 탭에서 승인하면 실제 칸으로.
//          직원 화면엔 가린 값만(계좌 끝 4자리·이메일 앞 2글자). 주민번호는 앱에 안 넣음(세무사에게 따로)
import * as api from './fb.js?v=34';
import { $, esc, toast, show, top, wireTop, busy } from './ui.js?v=34';

export const maskAcct = a => { const d = String(a || '').replace(/\D/g, ''); return d ? '••••' + d.slice(-4) : ''; };
export const maskMail = e => { const [u, h] = String(e || '').split('@'); return u ? u.slice(0, 2) + '***' + (h ? '@' + h : '') : ''; };
const when = ts => (ts && ts.toDate ? api.fmtWhen(ts.toDate()) : '');

// ---------- 공지 ----------
export function noticeCards(list, n = 3) {
  return list.slice(0, n).map(x => `<div class="card"><div class="small">📢 ${esc(when(x.at))}${x.byName ? ' · ' + esc(x.byName) : ''}</div><p style="color:var(--text);white-space:pre-line;margin-top:4px">${esc(x.text)}</p></div>`).join('');
}
export async function noticeScreen(store, back, myName) {
  const list = await api.notices(store.id);
  show(`${top('공지', true)}
    <div class="card"><b>📢 새 공지</b><textarea id="nt" rows="4" maxlength="500" placeholder="직원들 홈 화면 맨 위에 보여요" style="width:100%;margin-top:8px"></textarea>
      <button id="nsend" style="margin-top:10px">올리기</button></div>
    <h2>올린 공지 ${list.length}개</h2>
    ${list.length ? list.map(x => `<div class="card"><div class="row between"><span class="small">${esc(when(x.at))}${x.byName ? ' · ' + esc(x.byName) : ''}</span><button class="sm ghost" data-ndel="${x.id}">지우기</button></div>
      <p style="color:var(--text);white-space:pre-line;margin-top:4px">${esc(x.text)}</p></div>`).join('') : '<div class="card"><p class="small">아직 공지가 없어요.</p></div>'}
    <p class="small">직원 홈에는 최근 3개만 보여요.</p>`);
  wireTop(back);
  const again = () => noticeScreen(store, back, myName);
  $('nsend').onclick = e => busy(e.target, async () => {
    const t = $('nt').value.trim();
    if (!t) throw new Error('공지 내용을 써 주세요');
    await api.addNotice(store.id, t, myName || '사장님');
    toast('공지를 올렸어요'); await again();
  });
  document.querySelectorAll('[data-ndel]').forEach(b => { b.onclick = () => { if (confirm('이 공지를 지울까요?')) busy(b, async () => { await api.removeNotice(store.id, b.dataset.ndel); await again(); }); }; });
}

// ---------- 내 정보 (직원) ----------
export async function myInfoScreen(store, me, back) {
  const pd = await api.myPrivate(store.id).catch(() => null), p = pd || {};
  const req = p.req || null;
  show(`${top('내 정보', true)}
    <div class="card"><b>지금 들어가 있는 정보</b><table class="kv" style="margin-top:6px">
      <tr><td>은행</td><td>${esc(p.bank || '-')}</td></tr><tr><td>계좌</td><td>${esc(maskAcct(p.account) || '-')}</td></tr><tr><td>이메일</td><td>${esc(maskMail(p.email) || '-')}</td></tr></table>
      ${req ? `<p class="small" style="color:var(--warn);margin-top:8px">⏳ 바꿔 달라고 한 내용이 사장님 승인을 기다리는 중이에요 (${esc(when(req.at))})</p>` : ''}</div>
    <div class="card"><b>넣기 · 바꾸기</b>
      <label>은행</label><input id="ib" maxlength="20" placeholder="예: 국민" autocomplete="off">
      <label>계좌번호</label><input id="ia" inputmode="numeric" maxlength="30" placeholder="숫자만" autocomplete="off">
      <label>이메일 (급여 명세서 받을 곳)</label><input id="ie" type="email" maxlength="80" autocomplete="off">
      <button id="isend" style="margin-top:14px">사장님께 보내기</button>
      <p class="small" style="margin-top:8px">빈 칸은 그대로 둬요. 사장님이 승인하면 들어가요. 주민번호는 앱에 넣지 않아요(사장님께 따로).</p></div>`);
  wireTop(back);
  $('isend').onclick = e => busy(e.target, async () => {
    const bank = $('ib').value.trim(), account = $('ia').value.replace(/[^\d-]/g, ''), email = $('ie').value.trim();
    if (!bank && !account && !email) throw new Error('바꿀 칸을 하나 이상 넣어 주세요');
    if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new Error('이메일 모양이 이상해요');
    if (account && account.replace(/\D/g, '').length < 8) throw new Error('계좌번호를 확인해 주세요');
    await api.requestPrivate(store.id, { bank, account, email }, !!pd);
    toast('사장님께 보냈어요'); await myInfoScreen(store, me, back);
  });
}

// ---------- 승인 탭에 붙는 "내 정보" 요청 (사장님만) ----------
export async function infoApprovals(store, ms) {
  const rows = (await api.privAll(store.id)).filter(p => p.req);
  if (!rows.length) return { html: '', wire() {} };
  const nameOf = id => (ms.find(m => m.id === id) || {}).name || '?';
  const html = `<h2>내 정보 <span class="small">· ${rows.length}건</span></h2>${rows.map(p => {
    const r = p.req, chg = r.account && p.account && r.account.replace(/\D/g, '') !== p.account.replace(/\D/g, '');
    return `<div class="card"${chg ? ' style="border-color:var(--bad)"' : ''}><div class="row between"><b>${esc(nameOf(p.id))}</b><span class="pill ${chg ? 'bad' : ''}">${chg ? '계좌 변경' : '내 정보'}</span></div>
      <p class="small">${[r.bank ? '은행 ' + esc(r.bank) : '', r.account ? '계좌 ' + esc(maskAcct(r.account)) : '', r.email ? '이메일 ' + esc(maskMail(r.email)) : ''].filter(Boolean).join(' · ')}</p>
      ${chg ? `<p class="small" style="color:var(--bad)">⚠ 계좌가 바뀌어요: ${esc(p.bank || '')} ${esc(maskAcct(p.account))} → ${esc(r.bank || p.bank || '')} ${esc(maskAcct(r.account))}. 본인에게 직접 확인하고 승인하세요.</p>` : ''}
      <div class="row" style="gap:8px;margin-top:6px"><button class="sm" data-iok="${p.id}">승인</button><button class="sm ghost" data-ino="${p.id}">거절</button></div></div>`;
  }).join('')}`;
  const wire = again => {
    document.querySelectorAll('[data-iok]').forEach(b => { b.onclick = () => {
      const p = rows.find(x => x.id === b.dataset.iok), chg = p.req.account && p.account && p.req.account.replace(/\D/g, '') !== p.account.replace(/\D/g, '');
      if (chg && !confirm(nameOf(p.id) + '님 계좌가 바뀌어요. 본인에게 확인했나요?')) return;
      busy(b, async () => { await api.decidePrivate(store.id, p, true); toast('승인했어요'); await again(); });
    }; });
    document.querySelectorAll('[data-ino]').forEach(b => { b.onclick = () => busy(b, async () => { await api.decidePrivate(store.id, rows.find(x => x.id === b.dataset.ino), false); await again(); }); });
  };
  return { html, wire };
}
