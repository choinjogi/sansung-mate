// 산성 MATE — 화면. 데이터는 window.API (지금은 data-demo.js 시험 데이터)
(function () {
  const $app = document.getElementById('app'), $nav = document.getElementById('nav'), $navin = document.getElementById('navin');
  const store = { get: k => { try { return localStorage.getItem(k); } catch (e) { return null; } }, set: (k, v) => { try { localStorage.setItem(k, v); } catch (e) {} }, del: k => { try { localStorage.removeItem(k); } catch (e) {} } };
  const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
  const hm = m => Math.floor(m / 60) + '시간' + (m % 60 ? ' ' + (m % 60) + '분' : '');
  let ME = null, TAB = 'home';

  function toast(t) { const d = document.createElement('div'); d.className = 'toast fade'; d.textContent = t; document.body.appendChild(d); setTimeout(() => d.remove(), 2200); }
  function render(html) { $app.innerHTML = html; $app.firstElementChild && $app.firstElementChild.classList.add('fade'); window.scrollTo(0, 0); }
  const header = () => `<div class="top"><div class="brand"><img src="icons/emblem.png" alt=""><div>산성 MATE<br><small>${esc(ME.disp)}님${ME.role ? ' · ' + esc(ME.role) : ''}</small></div></div>
    <button class="ghost sm" id="logout">나가기</button></div>${API.demo ? '<div class="demo">시험 화면 — 실제 기록과 연결 안 됨</div>' : ''}`;
  const loading = () => render('<div class="splash"><p>불러오는 중…</p></div>');

  // ---------- 탭 ----------
  const STAFF_TABS = [['home', '🏠', '홈'], ['sched', '📅', '근무표'], ['leave', '📝', '휴무신청'], ['rec', '⏱️', '내 기록']];
  const ADMIN_TABS = [['atoday', '👀', '오늘'], ['aok', '✅', '승인'], ['asales', '💰', '매출'], ['adash', '📊', '대시보드'], ['amore', '☰', '더보기']];
  const SUB = { afix: 'amore', sched: 'amore' };  // 더보기 안의 화면
  function tabs() { return ME.role ? ADMIN_TABS : STAFF_TABS; }
  function drawNav() {
    $nav.hidden = false;
    const cur = ME.role && SUB[TAB] ? SUB[TAB] : TAB;
    $navin.innerHTML = tabs().map(([k, i, t]) => `<a href="#" data-tab="${k}" class="${k === cur ? 'on' : ''}"><i>${i}</i>${t}</a>`).join('');
  }
  $navin.addEventListener('click', e => { const a = e.target.closest('a'); if (!a) return; e.preventDefault(); go(a.dataset.tab); });
  function go(t) { TAB = t; store.set('mate_tab', t); drawNav(); (VIEWS[t] || VIEWS.home)(); }

  // ---------- 첫 화면 · 로그인 ----------
  function splash() {
    $nav.hidden = true;
    render(`<div class="splash"><img class="emb" src="icons/emblem.png" alt="산성식육점"><div class="t1">경상도식 돼지고기 전문점</div>
      <div class="t2">산성 <em>MATE</em></div><img class="calli" src="img/calli-line.png" alt="고기, 누룩을 입다."></div>`);
  }
  const bear = (kind, cls) => `<img class="bear ${cls || ''}" src="img/bear-${kind}.png" alt="">`;
  async function login() {
    const list = await API.roster();
    $nav.hidden = true;
    render(`<div class="splash" style="justify-content:flex-start;padding-top:7vh">
      <div class="row" style="width:100%;justify-content:space-between;align-items:flex-end">
        <div class="hello">NICE TO<br><span>MEAT</span> YOU.</div>${bear('grill', 'sm')}</div>
      <div class="card" style="width:100%;text-align:left;margin-top:18px">
        <div class="row" style="gap:8px;margin-bottom:4px"><img src="icons/emblem.png" alt="" style="width:26px"><b>산성 MATE</b></div>
        <label>내 이름</label><select id="nm"><option value="">이름 고르기</option>${list.map(p => `<option value="${esc(p.name)}">${esc(p.name)}${p.role ? ' (' + p.role + ')' : ''}</option>`).join('')}</select>
        <p class="small" style="margin-top:10px">처음 한 번만 고르면 다음부터 바로 열려요.${API.demo ? ' 시험 화면에서는 사장님·매니저를 고르면 관리 화면이 나와요.' : ''}</p>
        <button id="go" style="margin-top:12px">시작하기</button></div></div>`);
    document.getElementById('go').onclick = () => { const v = document.getElementById('nm').value; if (!v) return toast('이름을 골라 주세요'); store.set('mate_me', v); start(); };
  }
  async function start() {
    const name = store.get('mate_me');
    if (!name) return login();
    ME = await API.me(name);
    const t = store.get('mate_tab');
    go(tabs().some(x => x[0] === t) || (ME.role && SUB[t]) ? t : tabs()[0][0]);
  }
  document.addEventListener('click', e => { if (e.target.id === 'logout') { store.del('mate_me'); store.del('mate_tab'); ME = null; login(); } });

  const VIEWS = {};

  // ---------- 직원: 홈 ----------
  VIEWS.home = async function () {
    loading(); ME = await API.me(ME.name);
    const t = ME.today, work = t.code === 'O' || t.code === '오전';
    render(`<div>${header()}
      <div class="card hero"><div class="row between"><span class="small">오늘 ${esc(t.label)}</span>${work ? '<span class="pill on">근무</span>' : '<span class="pill off">쉬는 날</span>'}</div>
        <div class="big" style="margin-top:6px">${work ? (t.code === '오전' ? '12:00 출근 (주말 오전)' : t.start ? t.start + ' 출근' : '오늘 근무') : '오늘은 쉬는 날'}</div>
        ${work && ME.group === '알' ? '<p class="small">출근·퇴근은 매장 스티커에 폰을 대 주세요.</p>' : work ? '<p class="small">퇴근할 때 매장 스티커에 폰을 대 주세요.</p>' : bear('eat') + '<p class="small" style="text-align:center">맛있는 거 먹고 푹 쉬세요!</p>'}</div>
      <h2>이번 주 내 근무 <span class="small">· ${ME.workDays}일</span></h2>
      <div class="week">${ME.week.map(d => `<div class="day ${d.code === 'O' || d.code === '오전' ? 'work' : d.code === 'X' ? 'offd' : ''} ${d.today ? 'today' : ''}"><b>${esc(d.label.split(' ')[1])}</b><span>${d.code === 'O' ? '근무' : d.code === '오전' ? '오전' : d.code === 'X' ? '✕' : '–'}</span></div>`).join('')}</div>
      <h2>공지</h2>${ME.notice.map(n => `<div class="card"><div class="small">${esc(n.d)}</div><p style="color:var(--text)">${esc(n.t)}</p></div>`).join('')}
    </div>`);
  };

  // ---------- 근무표 (모두) ----------
  VIEWS.sched = async function () {
    loading(); const s = await API.schedule();
    // 출력 시트와 같은 방식: 근무 칸 = 이름(색 배경), ✕ = 휴무/불가, 빈칸 = 미배정, 주말 오전 = "이름 오전"(노란 글씨), 알바만 총근무
    // 정직원 = 색 없이 이름만, 알바 = 사람마다 다른 배경색
    const PAL = ['#a32442', '#2f6c9e', '#2e7a58', '#8a5a1c', '#6a4c9c', '#9a3a78', '#2f7a7a', '#b04e36', '#4a58a6', '#5e7a2a', '#7a4a3a', '#3a6a8a'];
    const color = {}; s.rows.filter(r => r.group === '알').forEach((r, k) => { color[r.disp] = PAL[k % PAL.length]; });
    const cell = (r, c, i) => {
      const t = s.days[i].today ? ' today' : '';
      if (c === 'O') return r.group === '알' ? `<td class="sc o${t}" style="background:${color[r.disp]}"><span>${esc(r.disp)}</span></td>` : `<td class="sc o j${t}"><span>${esc(r.disp)}</span></td>`;
      if (c === '오전') return `<td class="sc am${t}"><span>${esc(r.disp)} 오전</span></td>`;
      if (c === 'X') return `<td class="sc x${t}">✕</td>`;
      return `<td class="sc${t}"></td>`;
    };
    const row = r => {
      const n = r.codes.filter(c => c === 'O' || c === '오전').length;
      return `<tr class="${r.disp === ME.disp ? 'me' : ''}"><td class="name">${esc(r.disp)}</td>${r.codes.map((c, i) => cell(r, c, i)).join('')}<td class="tot">${r.group === '알' ? n + '일' : ''}</td></tr>`;
    };
    render(`<div>${header()}<h2>근무표 · ${esc(s.title)}</h2><div class="card scroll sched"><table>
      <tr><th class="name">이름</th>${s.days.map(d => `<th class="${d.today ? 'today' : ''}">${esc(d.label)}</th>`).join('')}<th>총근무</th></tr>
      ${s.rows.filter(r => r.group === '정').map(row).join('')}<tr class="gap"><td colspan="9"></td></tr>
      ${s.rows.filter(r => r.group === '알').map(row).join('')}
      <tr class="sum"><td class="name">정+알</td>${s.count.map((c, i) => `<td class="${s.days[i].today ? 'today' : ''}">${c}</td>`).join('')}<td></td></tr></table></div>
      <p class="small">이름 = 근무 · <span style="color:var(--bad)">✕</span> 휴무/불가 · 빈칸 = 미배정 · 노란 "오전" = 주말 오전(12~15시). 내 줄은 금색 테두리, 오늘은 금색 칸이에요.</p></div>`);
  };

  // ---------- 휴무신청 ----------
  VIEWS.leave = async function () {
    loading(); const f = await API.leaveForm(ME.name);
    const off = (f.saved && f.saved.off) || [], am = (f.saved && f.saved.am) || [];
    render(`<div>${header()}<h2>다음 주 휴무신청</h2>
      <div class="card"><div class="row between"><span>${f.open ? '<span class="pill ok">신청 받는 중</span>' : '<span class="pill off">마감</span>'}</span><span class="small">마감 ${esc(f.closes)}</span></div>
        <label>못 나오는 날 (저녁)</label><div class="chk">${f.days.map(d => `<label><input type="checkbox" name="off" value="${d.date}" ${off.indexOf(d.date) >= 0 ? 'checked' : ''}><span>${esc(d.label)}</span></label>`).join('')}</div>
        <label>주말 오전(12~15시) 가능한 날</label><div class="chk" style="grid-template-columns:repeat(2,1fr)">
          <label><input type="checkbox" name="am" value="토" ${am.indexOf('토') >= 0 ? 'checked' : ''}><span>토 오전</span></label>
          <label><input type="checkbox" name="am" value="일" ${am.indexOf('일') >= 0 ? 'checked' : ''}><span>일 오전</span></label></div>
        <button id="send" style="margin-top:16px">${f.saved ? '다시 보내기' : '보내기'}</button>
        ${f.saved ? `<p class="small" style="margin-top:10px">마지막으로 보낸 시각 ${esc(f.saved.at)} — 다시 보내면 마지막 것만 써요.</p>` : ''}</div>
      <p class="small">안 내면 모든 요일 저녁 가능으로 짜요. 마감 뒤 바꾸려면 본인이 대타를 구해 주세요.</p></div>`);
    document.getElementById('send').onclick = async e => {
      const b = e.target; b.disabled = true; b.textContent = '보내는 중…';
      const pick = n => [...document.querySelectorAll('input[name=' + n + ']:checked')].map(x => x.value);
      await API.submitLeave(ME.name, pick('off'), pick('am'));
      render(`<div>${header()}<div class="card empty" style="margin-top:30px">${bear('eat')}<p>휴무신청 보냈어요!</p>
        <p class="small">못 나오는 날 ${pick('off').length}일 · 주말 오전 ${pick('am').join('·') || '불가'}<br>마감 전까지는 다시 고칠 수 있어요.</p>
        <button class="ghost" id="again" style="margin-top:14px">신청 내용 보기</button></div></div>`);
      document.getElementById('again').onclick = () => VIEWS.leave();
    };
  };

  // ---------- 내 기록 ----------
  VIEWS.rec = async function () {
    loading(); const r = await API.records(ME.name);
    // 한 달 달력: 일한 날 = 빨간 칸 + 작은 글씨로 근무시간(시:분), 누르면 아래에 출근~퇴근 자세히
    const by = {}; r.list.forEach(x => { by[x.day] = x; });
    // 이번 주 출근 예정(오늘부터, 아직 기록 없는 날) = 초록
    const plan = {}; (ME.week || []).forEach(w => {
      const y = +w.date.slice(0, 4), m = +w.date.slice(5, 7), d = +w.date.slice(8);
      if (y === r.year && m === r.mon && d >= r.today && !by[d] && (w.code === 'O' || w.code === '오전')) plan[d] = w.code === '오전' ? '오전' : '예정';
    });
    const first = (new Date(r.year, r.mon - 1, 1).getDay() + 6) % 7, last = new Date(r.year, r.mon, 0).getDate();
    const hhmm = m => Math.floor(m / 60) + ':' + String(m % 60).padStart(2, '0');
    let cells = '';
    for (let i = 0; i < first; i++) cells += '<div class="cd empty"></div>';
    for (let d = 1; d <= last; d++) {
      const x = by[d], dow = (first + d - 1) % 7;
      cells += `<div class="cd${x ? ' w' : plan[d] ? ' plan' : ''}${x && x.note ? ' ex' : ''}${d === r.today ? ' today' : ''}${dow === 6 ? ' sun' : dow === 5 ? ' sat' : ''}" data-d="${d}"><b>${d}</b>${x ? '<span>' + hhmm(x.mins) + '</span>' : plan[d] ? '<span>' + plan[d] + '</span>' : ''}</div>`;
    }
    const detail = d => { const x = by[d]; return x
      ? `<div class="row between"><b>${r.mon}/${d} (${'월화수목금토일'[(first + d - 1) % 7]})</b>${x.note ? '<span class="pill warn">' + esc(x.note) + '</span>' : ''}</div>
         <div class="big" style="font-size:24px;margin-top:4px">${hm(x.mins)}</div><p class="small">출근 ${esc(x.in)} ~ 퇴근 ${esc(x.out)}</p>`
      : plan[d] ? `<div class="row between"><b>${r.mon}/${d} (${'월화수목금토일'[(first + d - 1) % 7]})</b><span class="pill ok">출근 예정</span></div>
         <p style="color:var(--text)">${plan[d] === '오전' ? '주말 오전 12:00 ~ 15:00' : ME.today.start ? ME.today.start + ' 출근' : '근무'} 예정이에요.</p>`
      : `<b>${r.mon}/${d}</b><p class="small">이날은 근무 기록이 없어요.</p>`; };
    const pick = by[r.today] ? r.today : (r.list.length ? r.list[r.list.length - 1].day : 0);
    render(`<div>${header()}<h2>${esc(r.month)} 내 출퇴근</h2>
      <div class="card hero"><div class="small">이번 달 근무</div><div class="big">${r.list.length}일 · ${hm(r.total)}</div><p class="small">계산 기준 시각(정시·일찍 부름)으로 센 시간이에요. 급여는 월말에 확정돼요.</p></div>
      <div class="card cal"><div class="cw">${'월화수목금토일'.split('').map((w, i) => `<i class="${i === 6 ? 'sun' : i === 5 ? 'sat' : ''}">${w}</i>`).join('')}</div><div class="cg">${cells}</div></div>
      ${r.list.length ? `<div class="card" id="cdet">${pick ? detail(pick) : ''}</div>` : `<div class="card empty">${bear('grill', 'sm')}<p>이번 달 기록이 아직 없어요.</p></div>`}
      <p class="small">빨간 칸 = 일한 날, 작은 숫자 = 근무시간(시:분). <span style="color:var(--ok)">초록 칸</span> = 이번 주 출근 예정. <span style="color:var(--yellow)">노란 숫자</span> = 일찍 부른 날. 날짜를 누르면 출근·퇴근 시각이 나와요. 기록이 틀리면 사장님·매니저님께 말해 주세요.</p></div>`);
    const det = document.getElementById('cdet');
    const mark = d => $app.querySelectorAll('.cd[data-d]').forEach(c => c.classList.toggle('sel', +c.dataset.d === d));
    if (pick) mark(pick);
    $app.querySelector('.cg').addEventListener('click', e => { const c = e.target.closest('.cd[data-d]'); if (!c || !det) return; const d = +c.dataset.d; det.innerHTML = detail(d); det.classList.remove('fade'); void det.offsetWidth; det.classList.add('fade'); mark(d); });
  };

  // ---------- 관리: 오늘 ----------
  VIEWS.atoday = async function () {
    loading(); const d = await API.adminToday();
    const pill = s => s === '출근' ? 'ok' : s === '미출근' ? 'bad' : /지각/.test(s) ? 'warn' : '';
    const cnt = k => d.rows.filter(r => r.state === k || (k === '지각' && /지각/.test(r.state))).length;
    render(`<div>${header()}<h2>오늘 ${esc(d.label)} 출근 현황</h2>
      <div class="row" style="gap:8px"><span class="pill ok">출근 ${cnt('출근')}</span><span class="pill warn">지각 ${cnt('지각')}</span><span class="pill bad">미출근 ${cnt('미출근')}</span></div>
      <div class="card list">${d.rows.map(r => `<div class="item"><div><b>${esc(r.disp)}</b> <span class="small">${r.group === '정' ? '정' : '알바'}${r.in ? ' · ' + esc(r.in) : ''}</span></div><span class="pill ${pill(r.state)}">${esc(r.state)}</span></div>`).join('')}</div>
      <h2>일찍 부르기</h2><div class="card"><div class="row"><select id="en">${d.rows.filter(r => r.group === '알').map(r => `<option>${esc(r.disp)}</option>`).join('')}</select><input id="et" type="time" value="17:00" style="max-width:130px"></div>
        <button id="eb" style="margin-top:10px">오늘 이 시각으로 출근 등록</button></div></div>`);
    document.getElementById('eb').onclick = async () => { const r = await API.addEarly(document.getElementById('en').value, document.getElementById('et').value); toast(r.msg); };
  };

  // ---------- 관리: 승인 ----------
  VIEWS.aok = async function () {
    loading(); const list = await API.pending();
    render(`<div>${header()}<h2>승인 대기 ${list.length}건</h2>
      ${list.length ? list.map(p => `<div class="card"><div class="row between"><b>${esc(p.name)}</b><span class="pill warn">${esc(p.kind)}</span></div>
        <p>${esc(p.when)} · ${esc(p.detail)}</p><div class="row" style="margin-top:8px"><button class="sm" data-ok="${p.id}">승인</button><button class="sm ghost" data-no="${p.id}">거절</button></div></div>`).join('')
        : `<div class="card empty">${bear('grill')}<p>처리할 게 없어요. 고기나 구우세요!</p></div>`}</div>`);
    $app.querySelectorAll('[data-ok],[data-no]').forEach(b => b.onclick = async () => {
      b.disabled = true; const r = await API.decide(b.dataset.ok || b.dataset.no, !!b.dataset.ok); toast(r.msg); VIEWS.aok();
    });
  };

  // ---------- 관리: 지난 기록 넣기 ----------
  VIEWS.afix = async function () {
    const list = await API.roster();
    render(`<div>${header()}<h2>지난 기록 넣기 / 고치기</h2><div class="card">
      <label>이름</label><select id="fn">${list.map(p => `<option>${esc(p.name)}</option>`).join('')}</select>
      <label>날짜</label><input id="fd" type="date" value="2026-11-17">
      <div class="row"><div style="flex:1"><label>출근 (비우면 정시)</label><input id="fi" type="time"></div><div style="flex:1"><label>퇴근</label><input id="fo" type="time" value="22:00"></div></div>
      <button id="fs" style="margin-top:14px">저장</button></div>
      <p class="small">실제 앱에서는 이름·날짜를 고르면 지금 기록이 미리 채워져요.</p></div>`);
    document.getElementById('fs').onclick = async () => { const g = id => document.getElementById(id).value; const r = await API.manualRecord(g('fn'), g('fd'), g('fi'), g('fo')); toast(r.msg); };
  };

  // ---------- 관리: 대시보드 (결산 "대시보드" 요약) ----------
  const won = n => '₩' + Math.round(n).toLocaleString('ko-KR');
  const man = n => n >= 10000 ? (Math.round(n / 10000)).toLocaleString('ko-KR') + '만' : n.toLocaleString('ko-KR');
  VIEWS.adash = async function () {
    loading(); const d = await API.dashboard();
    // 매출은 오르면 초록, 인건비는 오르면 빨강
    const chg = (v, p, up, pp) => {
      if (!p) return '<span class="small">–</span>';
      const x = pp ? v - p : (v / p - 1) * 100; if (Math.abs(x) < 0.05) return '<span class="small">0.0' + (pp ? '%p' : '%') + '</span>';
      const good = (x > 0) === up;
      return `<span style="color:${good ? 'var(--ok)' : 'var(--bad)'};font-weight:700">${x > 0 ? '▲' : '▼'}${Math.abs(x).toFixed(1)}${pp ? '%p' : '%'}</span>`;
    };
    const big = d.rate[1];
    render(`<div>${header()}<h2>대시보드 <span class="small">· ${esc(d.period)} (지난달 ${esc(d.prevPeriod)}와 비교)</span></h2>
      <div class="card hero"><div class="row between"><span class="small">총 인건비 비율</span>${chg(big.v, big.p, false, true)}</div>
        <div class="big">${big.v.toFixed(1)}%</div><p class="small">지난달 같은 기간 ${big.p.toFixed(1)}% · 알바비 비율 ${d.rate[0].v.toFixed(1)}% (${chg(d.rate[0].v, d.rate[0].p, false, true)})</p></div>
      <div class="card list">${d.rows.map(r => `<div class="item"><div><b style="font-size:15px">${esc(r.k)}</b><div class="small">${r.note ? '지난달 전체' : '지난달'} ${won(r.p)}</div></div>
        <div style="text-align:right"><div style="font-weight:800">${won(r.v)}</div>${chg(r.v, r.p, r.up)}</div></div>`).join('')}</div>
      <div class="card"><div class="row between"><b>이번 달 지각 (NFC)</b><span class="pill warn">${esc(d.late)}</span></div><p class="small">${esc(d.lateTop)}</p></div>
      <div class="card"><div class="row between"><b>근태이상 (확인 안 한 것)</b><span class="pill ${d.issues ? 'bad' : 'ok'}">${d.issues}건</span></div>
        <div class="row between" style="margin-top:8px"><b>중복 제출 (#REF! 위험)</b><span class="pill ${d.dup ? 'bad' : 'ok'}">${d.dup}건</span></div></div>
      <p class="small">결산 시트 대시보드 값 · 마지막 갱신 ${esc(d.asOf)} (매시간)</p></div>`);
  };

  // ---------- 관리: 매출 입력 (결산 "일별매출") ----------
  VIEWS.asales = async function () {
    loading(); const s = await API.sales();
    const y = new Date(Date.now() - 6 * 3600e3 - 864e5); const def = y.getFullYear() + '-' + String(y.getMonth() + 1).padStart(2, '0') + '-' + String(y.getDate()).padStart(2, '0');
    render(`<div>${header()}<h2>매출 입력</h2><div class="card">
      <label>날짜</label><input id="sd" type="date" value="${API.demo ? '2026-11-18' : def}">
      <label>매출 (원)</label><input id="sa" inputmode="numeric" placeholder="예: 1,850,000" style="font-size:22px;font-weight:800">
      <p class="small" id="sh" style="margin-top:6px"></p>
      <button id="ss" style="margin-top:10px">저장</button></div>
      <h2>최근 7일 <span class="small">· 이번 달 ${man(s.monthTotal)}원</span></h2>
      <div class="card list">${s.list.map(x => `<div class="item"><span>${esc(x.label)}</span><b>${won(x.amount)}</b></div>`).join('')}</div>
      <p class="small">저장하면 결산 "일별매출"에 들어가고 대시보드 매출·비율이 바로 바뀌어요. 같은 날짜를 다시 저장하면 고쳐져요.</p></div>`);
    const $a = document.getElementById('sa'), $h = document.getElementById('sh');
    $a.oninput = () => { const n = Number($a.value.replace(/[^0-9]/g, '')); $a.value = n ? n.toLocaleString('ko-KR') : ''; $h.textContent = n ? man(n) + '원' : ''; };
    document.getElementById('ss').onclick = async e => {
      const n = Number($a.value.replace(/[^0-9]/g, '')); if (!n) return toast('금액을 넣어 주세요');
      e.target.disabled = true; const r = await API.saveSales(document.getElementById('sd').value, n); toast(r.msg); VIEWS.asales();
    };
  };

  // ---------- 관리: 더보기 ----------
  VIEWS.amore = function () {
    render(`<div>${header()}<h2>더보기</h2>
      <div class="card list">
        <a class="item" href="#" data-go="sched" style="color:inherit;text-decoration:none"><span>📅 이번 주 근무표</span><span class="small">›</span></a>
        <a class="item" href="#" data-go="afix" style="color:inherit;text-decoration:none"><span>✏️ 지난 기록 넣기 / 고치기</span><span class="small">›</span></a>
      </div><p class="small">나중에 들어갈 것: 스케줄 짜기·확정, 월말결제 요약, 알림 설정</p></div>`);
    $app.querySelectorAll('[data-go]').forEach(a => a.onclick = e => { e.preventDefault(); go(a.dataset.go); });
  };

  // ---------- 시작 ----------
  // 새 버전 바로 받기: 서비스 워커를 캐시 없이 확인하고, 앱을 다시 볼 때마다 새 버전 검사 → 바뀌면 한 번 새로고침
  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    const had = !!navigator.serviceWorker.controller;
    navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' }).then(reg => {
      document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') reg.update().catch(() => {}); });
    }).catch(() => {});
    let done = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => { if (had && !done) { done = true; location.reload(); } });
  }
  splash();
  setTimeout(start, 900);
})();
