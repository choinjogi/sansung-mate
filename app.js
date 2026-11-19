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
    <button class="ghost sm" id="logout">나가기</button></div><div class="small" style="text-align:right;margin-top:-2px">버전 15</div>${API.demo ? '<div class="demo">시험 화면 — 실제 기록과 연결 안 됨</div>' : ''}`;
  const loading = () => render('<div class="splash"><p>불러오는 중…</p></div>');

  // ---------- 탭 ----------
  const STAFF_TABS = [['home', '🏠', '홈'], ['sched', '📅', '근무표'], ['leave', '📝', '휴무신청'], ['rec', '⏱️', '내 기록']];
  const ADMIN_TABS = [['atoday', '👀', '오늘'], ['aok', '✅', '승인'], ['asales', '💰', '매출'], ['adash', '📊', '대시보드'], ['amore', '☰', '더보기']];
  const SUB = { afix: 'amore', sched: 'amore', aleave: 'amore', aacc: 'amore', rec: 'amore' };  // 더보기 안의 화면
  function tabs() { return ME.role ? ADMIN_TABS : STAFF_TABS; }
  function drawNav() {
    $nav.hidden = false;
    const cur = ME.role && SUB[TAB] ? SUB[TAB] : TAB;
    $navin.innerHTML = tabs().map(([k, i, t]) => `<a href="#" data-tab="${k}" class="${k === cur ? 'on' : ''}"><i>${i}</i>${t}</a>`).join('');
  }
  $navin.addEventListener('click', e => { const a = e.target.closest('a'); if (!a) return; e.preventDefault(); go(a.dataset.tab); });
  function go(t) {
    TAB = t; store.set('mate_tab', t); drawNav();
    Promise.resolve().then(() => (VIEWS[t] || VIEWS.home)()).catch(e => {
      if (!ME) return;
      render(`<div>${header()}<div class="card empty" style="margin-top:24px">${bear('eat', 'sm')}<p>불러오지 못했어요</p><p class="small">${esc(e.message)}</p><button class="ghost" id="rt" style="margin-top:10px">다시 시도</button></div></div>`);
      document.getElementById('rt').onclick = () => go(t);
    });
  }

  // ---------- 첫 화면 · 로그인 ----------
  function splash() {
    $nav.hidden = true;
    render(`<div class="splash"><img class="emb" src="icons/emblem.png" alt="산성식육점"><div class="t1">경상도식 돼지고기 전문점</div>
      <div class="t2">산성 <em>MATE</em></div><img class="calli" src="img/calli-line.png" alt="고기, 누룩을 입다."></div>`);
  }
  const bear = (kind, cls) => `<img class="bear ${cls || ''}" src="img/bear-${kind}.png" alt="">`;
  // 로그인: 이름 + 숫자 6자리. 임시 비밀번호(사장님이 만들어 줌)로 들어오면 본인 번호로 바꾸기
  const pin = id => `<input id="${id}" type="password" inputmode="numeric" pattern="[0-9]*" maxlength="6" autocomplete="off" placeholder="숫자 6자리" style="letter-spacing:6px;font-size:22px;font-weight:800">`;
  const loginTop = () => `<div class="row" style="width:100%;justify-content:space-between;align-items:flex-end">
        <div class="hello">NICE TO<br><span>MEAT</span> YOU.</div>${bear('grill', 'sm')}</div>`;
  function login(msg) {
    $nav.hidden = true; ME = null;
    render(`<div class="splash" style="justify-content:flex-start;padding-top:7vh">${loginTop()}
      <div class="card" style="width:100%;text-align:left;margin-top:18px">
        <div class="row" style="gap:8px;margin-bottom:4px"><img src="icons/emblem.png" alt="" style="width:26px"><b>산성 MATE 로그인</b></div>
        <label>이름 (성까지)</label><input id="nm" autocomplete="username" placeholder="예: 홍길동" value="${esc(store.get('mate_last') || '')}">
        <label>비밀번호</label>${pin('pw')}
        <p class="small" id="lm" style="margin-top:10px;color:${msg ? 'var(--bad)' : 'var(--dim)'}">${esc(msg || '처음이거나 비밀번호를 잊었으면 사장님께 임시 비밀번호를 받아 그 번호로 들어오세요.')}</p>
        <button id="go" style="margin-top:8px">로그인</button>
        <button class="ghost" id="join" style="margin-top:10px">처음 가입 / 비밀번호 잊음</button></div></div>`);
    const $m = document.getElementById('lm'), say = t => { $m.textContent = t; $m.style.color = 'var(--bad)'; };
    document.getElementById('join').onclick = () => join();
    document.getElementById('go').onclick = async e => {
      const name = document.getElementById('nm').value.trim(), pw = document.getElementById('pw').value.trim();
      if (!name) return say('이름을 써 주세요'); if (!/^\d{6}$/.test(pw)) return say('비밀번호는 숫자 6자리예요');
      e.target.disabled = true; e.target.textContent = '확인 중…';
      let r; try { r = await API.login(name, pw); } catch (x) { r = { ok: false, err: x.message }; }
      store.set('mate_last', name);
      if (r.ok) return start();
      if (r.needNew) return newPin(name, pw);
      e.target.disabled = false; e.target.textContent = '로그인'; say(r.err || '로그인하지 못했어요');
    };
  }
  // 가입: 사장님께 받은 임시 비밀번호(6자리) 확인 → 내 비밀번호 정하기
  function join() {
    render(`<div class="splash" style="justify-content:flex-start;padding-top:7vh">${loginTop()}
      <div class="card" style="width:100%;text-align:left;margin-top:18px"><b>처음 가입 / 비밀번호 다시 정하기</b>
        <p class="small">사장님·매니저님께 받은 <b style="color:var(--text)">임시 비밀번호 6자리</b>를 넣어 주세요. 다음 화면에서 내 비밀번호를 정해요.</p>
        <label>이름 (성까지)</label><input id="nm" placeholder="예: 홍길동" value="${esc(store.get('mate_last') || '')}">
        <label>임시 비밀번호</label>${pin('pw')}
        <p class="small" id="lm" style="margin-top:10px;color:var(--bad)"></p>
        <button id="go" style="margin-top:8px">다음</button><button class="ghost" id="back" style="margin-top:10px">로그인으로 돌아가기</button></div></div>`);
    const $m = document.getElementById('lm');
    document.getElementById('back').onclick = () => login();
    document.getElementById('go').onclick = async e => {
      const name = document.getElementById('nm').value.trim(), pw = document.getElementById('pw').value.trim();
      if (!name) return $m.textContent = '이름을 써 주세요'; if (!/^\d{6}$/.test(pw)) return $m.textContent = '임시 비밀번호는 숫자 6자리예요';
      e.target.disabled = true; e.target.textContent = '확인 중…';
      let r; try { r = await API.login(name, pw); } catch (x) { r = { ok: false, err: x.message }; }
      store.set('mate_last', name);
      if (r.needNew) return newPin(name, pw);
      if (r.ok) return start();
      e.target.disabled = false; e.target.textContent = '다음'; $m.textContent = r.err || '확인하지 못했어요';
    };
  }
  function newPin(name, temp) {
    render(`<div class="splash" style="justify-content:flex-start;padding-top:7vh">${loginTop()}
      <div class="card" style="width:100%;text-align:left;margin-top:18px"><b>${esc(name)}님, 내 비밀번호 정하기</b>
        <p class="small">임시 비밀번호 대신 쓸 숫자 6자리를 정해 주세요. 사장님도 이 번호는 몰라요.</p>
        <label>새 비밀번호</label>${pin('p1')}<label>한 번 더</label>${pin('p2')}
        <p class="small" id="lm" style="margin-top:10px;color:var(--bad)"></p><button id="go" style="margin-top:8px">저장하고 시작</button></div></div>`);
    const $m = document.getElementById('lm');
    document.getElementById('go').onclick = async e => {
      const a = document.getElementById('p1').value.trim(), b = document.getElementById('p2').value.trim();
      if (!/^\d{6}$/.test(a)) return $m.textContent = '숫자 6자리로 정해 주세요'; if (a !== b) return $m.textContent = '두 번 쓴 번호가 달라요';
      e.target.disabled = true;
      let r; try { r = await API.signup(name, temp, a); } catch (x) { r = { ok: false, err: x.message }; }
      if (r.ok) { toast('비밀번호를 정했어요'); return start(); }
      e.target.disabled = false; $m.textContent = r.err || '저장하지 못했어요';
    };
  }
  async function start() {
    if (API.hasToken && !API.hasToken()) return login();
    try { ME = await API.me(); } catch (e) { return login(API.hasToken && API.hasToken() ? e.message : ''); }
    const t = store.get('mate_tab');
    go(tabs().some(x => x[0] === t) || (ME.role && SUB[t]) ? t : tabs()[0][0]);
  }
  window.addEventListener('mate-logout', () => login('다시 로그인해 주세요'));
  document.addEventListener('click', async e => { if (e.target.id === 'logout') { if (!confirm('로그아웃할까요?')) return; await API.logout(); store.del('mate_tab'); login(); } });

  const VIEWS = {};

  // ---------- 직원: 홈 ----------
  // 비상용: 앱이나 NFC가 안 될 때는 예전처럼 구글폼으로 (주소는 서버가 줌)
  const backup = () => { const L = ME.links || {}; if (!L.leave && !L.clock) return '';
    const a = (u, t) => u ? `<a class="item" href="${esc(u)}" target="_blank" rel="noopener" style="color:inherit;text-decoration:none"><span>${t}</span><span class="small">›</span></a>` : '';
    return `<h2>문제가 생겼을 때 <span class="small">· 비상용</span></h2><div class="card list">${a(L.clock, '🕙 퇴근 폼 (NFC가 안 될 때만)')}${a(L.leave, '📝 휴무신청 폼 (앱이 안 될 때)')}</div>
      <p class="small">스티커가 안 찍히거나 앱이 안 열리면 예전처럼 폼으로 내고 매니저님께 말해 주세요. 같은 날 NFC와 퇴근 폼을 둘 다 내지는 마세요.</p>`; };
  VIEWS.home = async function () {
    loading(); ME = await API.me(ME.name);
    const t = ME.today, work = t.code === 'O' || t.code === '오전' || t.code === '오전+오후';
    const ck = t.clock ? (t.clock.out ? `<span class="pill ok">퇴근 ${esc(t.clock.out)}</span>` : t.clock.in ? `<span class="pill ok">출근 ${esc(t.clock.in)} 찍음</span>` : '') : '';
    render(`<div>${header()}
      <div class="card hero"><div class="row between"><span class="small">오늘 ${esc(t.label)}</span>${work ? '<span class="pill on">근무</span>' : '<span class="pill off">쉬는 날</span>'}</div>
        <div class="big" style="margin-top:6px">${work ? (t.code !== 'O' ? '12:00 출근 (주말 오전)' : t.start ? t.start + ' 출근' + (t.early ? ' <span class="pill warn">일찍 부름</span>' : '') : '오늘 근무') : ME.covered === false ? '스케줄 확정 전' : '오늘은 쉬는 날'}</div>
        ${ck ? '<div style="margin-top:6px">' + ck + '</div>' : ''}
        ${work && ME.group === '알' ? '<p class="small">출근·퇴근은 매장 스티커에 폰을 대 주세요.</p>' : work ? '<p class="small">퇴근할 때 매장 스티커에 폰을 대 주세요.</p>' : bear('eat') + '<p class="small" style="text-align:center">맛있는 거 먹고 푹 쉬세요!</p>'}</div>
      <h2>이번 주 내 근무 <span class="small">· ${ME.workDays}일</span></h2>
      <div class="week">${ME.week.map(d => `<div class="day ${d.code === 'O' || d.code === '오전' ? 'work' : d.code === 'X' ? 'offd' : ''} ${d.today ? 'today' : ''}"><b>${esc(d.label.split(' ')[1])}</b><span>${d.code === 'O' ? '근무' : d.code === '오전' ? '오전' : d.code === 'X' ? '✕' : '–'}</span></div>`).join('')}</div>
      <h2>공지</h2>${ME.notice.map(n => `<div class="card"><div class="small">${esc(n.d)}</div><p style="color:var(--text)">${esc(n.t)}</p></div>`).join('')}
      ${backup()}
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
      if (c === 'O' || c === '오전+오후') return r.group === '알' ? `<td class="sc o${t}" style="background:${color[r.disp]}"><span>${esc(r.disp)}</span></td>` : `<td class="sc o j${t}"><span>${esc(r.disp)}</span></td>`;
      if (c === '오전') return `<td class="sc am${t}"><span>${esc(r.disp)} 오전</span></td>`;
      if (c === 'X') return `<td class="sc x${t}">✕</td>`;
      return `<td class="sc${t}"></td>`;
    };
    const row = r => {
      const n = r.codes.filter(c => c === 'O' || c === '오전').length;
      return `<tr class="${r.disp === ME.disp ? 'me' : ''}"><td class="name">${esc(r.disp)}</td>${r.codes.map((c, i) => cell(r, c, i)).join('')}<td class="tot">${r.group === '알' ? n + '일' : ''}</td></tr>`;
    };
    render(`<div>${header()}<h2>근무표 · ${esc(s.title)}</h2>${s.covered === false ? '<div class="card"><p style="color:var(--text)">이번 주 스케줄이 아직 확정 전이에요.</p></div>' : ''}<div class="card scroll sched"><table>
      <tr><th class="name">이름</th>${s.days.map(d => `<th class="${d.today ? 'today' : ''}">${esc(d.label)}</th>`).join('')}<th>총근무</th></tr>
      ${s.rows.filter(r => r.group === '정').map(row).join('')}<tr class="gap"><td colspan="9"></td></tr>
      ${s.rows.filter(r => r.group === '알').map(row).join('')}
      <tr class="sum"><td class="name">정+알</td>${s.count.map((c, i) => `<td class="${s.days[i].today ? 'today' : ''}">${c}</td>`).join('')}<td></td></tr></table></div>
      <p class="small">이름 = 근무 · <span style="color:var(--bad)">✕</span> 휴무/불가 · 빈칸 = 미배정 · 노란 "오전" = 주말 오전(12~15시). 내 줄은 금색 테두리, 오늘은 금색 칸이에요.</p></div>`);
  };

  // ---------- 휴무신청 ----------
  // 앱에서 내면 서버가 진짜 휴무신청 폼으로 제출한다 (폼으로 낸 것과 똑같음). 앱이 안 되면 폼 링크로
  VIEWS.leave = async function () {
    loading(); const f = await API.leaveForm(ME.name);
    const s = f.saved, off = (s && s.off) || [], am = (s && s.am) || [], L = ME.links || {};
    const fallback = L.leave ? `<a href="${esc(L.leave)}" target="_blank" rel="noopener" class="small" style="display:block;text-align:center;margin-top:12px;color:var(--sub)">앱이 안 되면 → 휴무신청 폼으로 내기</a>` : '';
    const head = `<div class="row between"><span>${f.open ? '<span class="pill ok">신청 받는 중</span>' : '<span class="pill off">' + (f.past ? '다음 신청은 금요일 0시' : '마감') + '</span>'}</span><span class="small">${f.past ? '' : '마감 ' + esc(f.closes)}</span></div>`;
    const savedTxt = s ? `<p style="color:var(--text)">내가 낸 신청 (${esc(s.at)})<br>못 나오는 날: <b>${f.days.filter(d => off.indexOf(d.date) >= 0).map(d => esc(d.label)).join(', ') || '없음'}</b><br>주말 오전 가능: <b>${am.join('·') || '불가'}</b></p>` : `<p style="color:var(--text)">${f.past ? '이 주에는' : '아직'} 낸 신청이 없어요.</p>`;
    const note = '<p class="small">안 내면 모든 요일 저녁 가능으로 짜요. 매주 금요일 0시에 열리고 토요일 밤 10시에 마감돼요. 여러 번 내면 마지막 것만 써요. 마감 뒤 바꾸려면 본인이 대타를 구해 주세요.</p>';
    if (!f.open || ME.group !== '알') return render(`<div>${header()}<h2>휴무신청 <span class="small">· ${esc(f.title)}</span></h2><div class="card hero">${head}${savedTxt}</div>${ME.group !== '알' ? '<p class="small">휴무신청은 스케줄 알바만 내요.</p>' : ''}${note}</div>`);
    render(`<div>${header()}<h2>휴무신청 <span class="small">· ${esc(f.title)}</span></h2>
      <div class="card">${head}
        <label>못 나오는 날 (저녁)</label><div class="chk">${f.days.map(d => `<label><input type="checkbox" name="off" value="${d.date}" ${off.indexOf(d.date) >= 0 ? 'checked' : ''}><span>${esc(d.label)}</span></label>`).join('')}</div>
        <label>주말 오전(12~15시) 가능한 날</label><div class="chk" style="grid-template-columns:repeat(2,1fr)">
          <label><input type="checkbox" name="am" value="토" ${am.indexOf('토') >= 0 ? 'checked' : ''}><span>토 오전</span></label>
          <label><input type="checkbox" name="am" value="일" ${am.indexOf('일') >= 0 ? 'checked' : ''}><span>일 오전</span></label></div>
        <button id="send" style="margin-top:16px">${s ? '다시 보내기' : '보내기'}</button>
        ${s ? `<p class="small" style="margin-top:10px">마지막으로 보낸 시각 ${esc(s.at)} — 다시 보내면 마지막 것만 써요.</p>` : ''}${fallback}</div>${note}</div>`);
    document.getElementById('send').onclick = async e => {
      const b = e.target, pick = n => [...document.querySelectorAll('input[name=' + n + ']:checked')].map(x => x.value);
      const o = pick('off'), a = pick('am');
      if (!confirm('이대로 보낼까요?\n못 나오는 날 ' + o.length + '일 · 주말 오전 ' + (a.join('·') || '불가'))) return;
      b.disabled = true; b.textContent = '보내는 중…';
      let r; try { r = await API.submitLeave(ME.name, o, a); } catch (x) { r = { saved: false, msg: x.message + ' — 안 되면 아래 폼으로 내 주세요.' }; }
      if (!r.saved) { toast(r.msg); b.disabled = false; b.textContent = '다시 보내기'; return; }
      render(`<div>${header()}<div class="card empty" style="margin-top:30px">${bear('eat')}<p>휴무신청 보냈어요!</p>
        <p class="small">못 나오는 날 ${o.length}일 · 주말 오전 ${a.join('·') || '불가'}<br>마감 전까지는 다시 고칠 수 있어요.</p>
        <button class="ghost" id="again" style="margin-top:14px">신청 내용 보기</button></div></div>`);
      document.getElementById('again').onclick = () => VIEWS.leave();
    };
  };

  // ---------- 내 기록 ----------
  VIEWS.rec = async function () {
    loading(); const r = await API.records(ME.name);
    // 한 달 달력: 일한 날 = 빨간 칸 + 작은 글씨로 근무시간(시:분), 누르면 아래에 자세히
    const by = {}; r.list.forEach(x => { x.tags = x.tags || (x.note ? [x.note] : []); by[x.day] = x; });
    // 안 나온 날: 연차·반차·병가·무급 = 파란 칸, 스케줄 있었는데 쉼 = 노란 점선
    const off = {}; (r.off || []).forEach(o => { if (o.tags[0] !== '휴무' || o.tags.length > 1) off[o.day] = o; });
    const LV = ['연차', '반차', '병가', '무급'];
    // 이번 주 출근 예정(오늘부터, 아직 기록 없는 날) = 초록
    const plan = {}; (ME.week || []).forEach(w => {
      const y = +w.date.slice(0, 4), m = +w.date.slice(5, 7), d = +w.date.slice(8);
      if (y === r.year && m === r.mon && d >= r.today && !by[d] && (w.code === 'O' || w.code === '오전' || w.code === '오전+오후')) plan[d] = w.code === 'O' ? '예정' : '오전';
    });
    const first = (new Date(r.year, r.mon - 1, 1).getDay() + 6) % 7, last = new Date(r.year, r.mon, 0).getDate();
    const hhmm = m => Math.floor(m / 60) + ':' + String(m % 60).padStart(2, '0');
    const W = d => '월화수목금토일'[(first + d - 1) % 7];
    let cells = '';
    for (let i = 0; i < first; i++) cells += '<div class="cd empty"></div>';
    for (let d = 1; d <= last; d++) {
      const x = by[d], o = off[d], dow = (first + d - 1) % 7;
      const lv = o && LV.indexOf(o.tags[0]) >= 0, miss = o && !lv && o.tags[0] !== '휴무';
      const cls = x ? ' w' + (x.tags.length ? ' ex' : '') : lv ? ' lv' : miss ? ' miss' : plan[d] ? ' plan' : '';
      const lab = x ? (r.hours === false ? x.out : hhmm(x.mins)) : lv ? o.tags[0] : miss ? '빠짐' : plan[d] || '';
      cells += `<div class="cd${cls}${d === r.today ? ' today' : ''}${dow === 6 ? ' sun' : dow === 5 ? ' sat' : ''}" data-d="${d}"><b>${d}</b>${lab ? '<span>' + esc(lab) + '</span>' : ''}</div>`;
    }
    const pills = tags => tags.map(t => `<span class="pill ${LV.indexOf(t) >= 0 ? 'lv' : /대타|추가/.test(t) && !/쉼/.test(t) ? 'ok' : 'warn'}">${esc(t)}</span>`).join(' ');
    const detail = d => { const x = by[d], o = off[d], h = `<b>${r.mon}/${d} (${W(d)})</b>`; return x
      ? `<div class="row between">${h}</div>${x.tags.length ? '<div class="tags">' + pills(x.tags) + '</div>' : ''}
         ${r.hours === false ? `<div class="big" style="font-size:24px;margin-top:4px">퇴근 ${esc(x.out)}</div>` : `<div class="big" style="font-size:24px;margin-top:4px">${hm(x.mins)}</div><p class="small">출근 ${esc(x.in)} ~ 퇴근 ${esc(x.out)}</p>`}`
      : o ? `<div class="row between">${h}</div><div class="tags">${pills(o.tags)}</div><p class="small">${LV.indexOf(o.tags[0]) >= 0 ? '스케줄에 ' + esc(o.tags[0]) + '(으)로 적힌 날이에요.' : '스케줄에는 근무였는데 출퇴근 기록이 없어요. 사장님이 쉬라고 한 날이나 대타를 구한 날도 여기 나와요.'}</p>`
      : plan[d] ? `<div class="row between">${h}<span class="pill ok">출근 예정</span></div>
         <p style="color:var(--text)">${plan[d] === '오전' ? '주말 오전 12:00 ~ 15:00' : ME.today.start ? ME.today.start + ' 출근' : '근무'} 예정이에요.</p>`
      : `${h}<p class="small">이날은 근무 기록이 없어요.</p>`; };
    const pick = by[r.today] || plan[r.today] ? r.today : (r.list.length ? r.list[r.list.length - 1].day : 0);

    // 이번 달 요약
    const S = r.sum || null, won = n => Number(n || 0).toLocaleString('ko-KR') + '원';
    let sumCard = '';
    if (S) {
      const lv = LV.filter(k => S.leave[k]).map(k => `${k} ${S.leave[k]}`).join(' · ');
      const rows = [['출근', S.work + '일'], ['쉰 날', S.off + '일' + (r.hours ? '' : ' (고정휴무 포함)')]];
      if (r.hours) rows.push(['스케줄', S.sched + '일'], ['스케줄 있었는데 쉼', S.missed + '일'], ['대타 서 준 날', S.cover + '일'], ['스케줄 없던 날 출근', S.extra + '일']);
      else if (S.missed) rows.push(['스케줄 있었는데 기록 없음', S.missed + '일']);
      rows.push(['연차·반차·병가·무급', lv || '없음']);
      sumCard = `<div class="card"><div class="row between"><b>이번 달 요약</b><span class="small">${r.mon}/1 ~ ${r.mon}/${S.upto}</span></div>
        <table class="kv">${rows.map(x => `<tr><td>${x[0]}</td><td>${esc(x[1])}</td></tr>`).join('')}</table></div>`;
      if (r.hours && S.weeks) sumCard += `<div class="card"><div class="row between"><b>근무시간 · 주휴</b><span class="small">결산 기준</span></div>
        <div class="row" style="gap:22px;margin:6px 0 10px"><div><div class="small">총 근무시간</div><div class="big" style="font-size:22px">${S.totalH != null ? S.totalH + '시간' : hm(r.total)}</div></div>
        <div><div class="small">주휴수당</div><div class="big" style="font-size:22px">${S.noJuhu ? '해당 없음' : won(S.juhu)}</div></div></div>
        <table class="kv"><tr><th>주차</th><th>시간</th><th>주휴</th></tr>${S.weeks.map(w => `<tr><td>${esc(w.wk)}</td><td>${w.h.toFixed(1)}h</td><td>${S.noJuhu ? '-' : w.pay ? won(w.pay) : '<span class="small">' + (w.h < 15 ? '15시간 미만' : '0원') + '</span>'}</td></tr>`).join('')}</table>
        <p class="small">주휴는 한 주 15시간 이상 일하면 생겨요(1~7일·8~14일처럼 7일씩 끊어서 계산). 최종 금액은 월말결제 기준이에요.</p></div>`;
      if (r.hours && S.pay) sumCard += `<div class="card"><div class="row between"><b>내 급여</b><span class="small">${r.mon}/1 ~ ${r.mon}/${S.upto} 결산 기준</span></div>
        <div class="row" style="gap:22px;margin:6px 0 10px"><div><div class="small">현재까지 받을 돈</div><div class="big" style="font-size:22px">${won(S.pay.now)}</div></div>
        ${S.pay.est != null ? `<div><div class="small">이번 달 예상 (대략)</div><div class="big" style="font-size:22px">약 ${won(S.pay.est)}</div></div>` : ''}</div>
        <table class="kv"><tr><td>그중 주휴수당</td><td>${S.noJuhu ? '해당 없음' : won(S.juhu)}</td></tr></table>
        <p class="small">현재까지 받을 돈 = 주휴수당 포함. 예상은 지금까지 하루 평균 × ${S.pay.days}일로 어림한 값이라 실제와 달라요. 최종 금액은 월말결제(사장님 확인) 기준이에요.</p></div>`;
      const ev = r.list.filter(x => x.tags.length).map(x => ({ d: x.day, t: x.tags })).concat(Object.values(off).map(o => ({ d: o.day, t: o.tags }))).sort((a, b) => a.d - b.d);
      sumCard += `<div class="card"><b>근무 특이사항</b>${ev.length ? `<table class="kv ev">${ev.map(e => `<tr data-d="${e.d}"><td>${r.mon}/${e.d} (${W(e.d)})</td><td><div class="tags" style="margin:0">${pills(e.t)}</div></td></tr>`).join('')}</table>` : '<p class="small" style="margin-top:6px">이번 달은 특이사항이 없어요.</p>'}</div>`;
    }

    render(`<div>${header()}<h2>${esc(r.month)} 내 출퇴근</h2>
      <div class="card hero"><div class="small">이번 달 근무</div><div class="big">${r.list.length}일${r.hours === false ? '' : ' · ' + hm(r.total)}</div><p class="small">${r.hours === false ? '정직원은 퇴근 기록만 보여요.' : '계산 기준 시각(정시·일찍 부름)으로 센 시간이에요. 급여는 월말결제 기준으로 확정돼요.'}</p></div>
      <div class="card cal"><div class="cw">${'월화수목금토일'.split('').map((w, i) => `<i class="${i === 6 ? 'sun' : i === 5 ? 'sat' : ''}">${w}</i>`).join('')}</div><div class="cg">${cells}</div></div>
      <div class="card" id="cdet">${pick ? detail(pick) : '<p class="small">날짜를 누르면 자세히 나와요.</p>'}</div>${r.list.length ? '' : `<div class="card empty">${bear('grill', 'sm')}<p>이번 달 기록이 아직 없어요.</p></div>`}
      ${sumCard}
      <p class="small">빨간 칸 = 일한 날(작은 숫자 = 근무시간), <span style="color:var(--yellow)">노란 숫자</span> = 특이사항 있는 날, <span style="color:var(--ok)">초록</span> = 이번 주 출근 예정, <span style="color:#9cc3ff">파란 칸</span> = 연차·반차·병가·무급, <span style="color:var(--warn)">노란 점선</span> = 스케줄 있었는데 쉰 날. 기록이 틀리면 사장님·매니저님께 말해 주세요.</p></div>`);
    const det = document.getElementById('cdet');
    const mark = d => $app.querySelectorAll('.cd[data-d]').forEach(c => c.classList.toggle('sel', +c.dataset.d === d));
    const show = d => { if (!det) return; det.innerHTML = detail(d); det.classList.remove('fade'); void det.offsetWidth; det.classList.add('fade'); mark(d); };
    if (pick) mark(pick);
    $app.querySelector('.cg').addEventListener('click', e => { const c = e.target.closest('.cd[data-d]'); if (c) show(+c.dataset.d); });
    $app.querySelectorAll('.ev tr[data-d]').forEach(tr => tr.onclick = () => { show(+tr.dataset.d); det.scrollIntoView({ behavior: 'smooth', block: 'center' }); });
  };

  // ---------- 관리: 오늘 ----------
  const STEP2 = '<p class="small">NFC 관리 화면도 그대로 쓸 수 있어요(앱이 안 될 때).</p>';
  let PEOPLE = null; const people = async () => PEOPLE || (PEOPLE = (await API.people()).list);
  const opts = (list, sel) => list.map(p => `<option value="${esc(p.name)}" ${p.name === sel ? 'selected' : ''}>${esc(p.disp)}${p.disp !== p.name ? ' (' + esc(p.name) + ')' : ''}</option>`).join('');
  const busy = async (b, fn) => { const t = b.textContent; b.disabled = true; b.textContent = '처리 중…'; try { await fn(); } catch (x) { toast(x.message); } finally { b.disabled = false; b.textContent = t; } };
  VIEWS.atoday = async function () {
    loading(); const d = await API.adminToday();
    let lvCard = '';
    try {
      const lv = await API.leaveAll(), lvSent = lv.rows.filter(r => r.sent).length;
      const lvShort = lv.past ? [] : lv.days.filter(x => lv.rows.filter(r => r.off.indexOf(x.date) < 0).length < x.need).map(x => x.label);
      lvCard = `<a href="#" id="golv" class="card row between" style="color:inherit;text-decoration:none;display:flex"><div><b>📝 ${lv.past ? '휴무신청 (금 0시에 열림)' : '다음 주 휴무신청'}</b><div class="small">${esc(lv.title)} · ${lvSent}/${lv.rows.length}명 신청${lvShort.length ? ' · <span style="color:var(--bad)">부족: ' + lvShort.map(esc).join(', ') + '</span>' : ''}</div></div><span class="small">›</span></a>`;
    } catch (e) {}
    const pill = s => s === '출근' || s === '퇴근' ? 'ok' : s === '미출근' ? 'bad' : /지각|스케줄 없음/.test(s) ? 'warn' : '';
    const cnt = re => d.rows.filter(r => re.test(r.state)).length;
    render(`<div>${header()}<h2>오늘 ${esc(d.label)} 출근 현황</h2>
      ${d.covered === false ? '<div class="card"><p style="color:var(--text)">이번 주 스케줄이 확정 전이라 출근 예정을 모르고, 찍은 사람만 보여요.</p></div>' : ''}
      <div class="row" style="gap:8px;flex-wrap:wrap"><span class="pill ok">출근 ${cnt(/^출근$|^퇴근$/)}</span><span class="pill warn">지각 ${cnt(/지각/)}</span><span class="pill bad">미출근 ${cnt(/^미출근$/)}</span><span class="pill">출근 전 ${cnt(/^출근 전/)}</span></div>
      <div class="card list">${d.rows.length ? d.rows.map(r => `<div class="item"><div><b>${esc(r.disp)}</b> <span class="small">${r.group === '정' ? '정' : '알바'}${r.in ? ' · 출근 ' + esc(r.in) : ''}${r.out ? ' · 퇴근 ' + esc(r.out) : ''}</span></div><span class="pill ${pill(r.state)}">${esc(r.state)}</span></div>`).join('') : '<p class="small">오늘 근무 예정인 사람이 없어요.</p>'}</div>
      <div class="card"><b>⏰ 일찍 부르기</b><p class="small">오늘 정시보다 일찍 나오라고 한 알바를 미리 적어 두면 그 시각부터 계산돼요. (늦게 오면 찍은 시각부터)</p>
        <label>누구</label><select id="en"><option value="">불러오는 중…</option></select>
        <label>몇 시</label><input type="time" id="et" value="17:00" step="300">
        <button id="eb" style="margin-top:14px">등록</button></div>
      ${lvCard}${STEP2}</div>`);
    const g = document.getElementById('golv'); if (g) g.onclick = e => { e.preventDefault(); go('aleave'); };
    people().then(l => { const en = document.getElementById('en'); if (en) en.innerHTML = '<option value="">이름 고르기</option>' + opts(l.filter(p => p.alba)); }).catch(() => {});
    document.getElementById('eb').onclick = e => busy(e.target, async () => {
      const n = document.getElementById('en').value, t = document.getElementById('et').value;
      if (!n || !t) return toast('이름과 시각을 골라 주세요');
      if (!confirm(n + ' 오늘 ' + t + ' 출근으로 등록할까요?')) return;
      const r = await API.early(n, '', t); r.warn ? alert(r.msg) : toast(r.msg);
    });
  };

  // ---------- 관리: 승인 대기 (NFC 관리 화면과 같은 승인) ----------
  VIEWS.aok = async function () {
    loading(); const list = await API.pending();
    const can = p => p.kind !== '새 폰' || ME.role === '사장님', nExc = list.filter(p => p.kind !== '새 폰').length;
    render(`<div>${header()}<h2>승인 대기 ${list.length}건</h2>
      ${nExc > 1 ? `<button id="all" style="margin-bottom:10px">조기 출근 ${nExc}건 전부 승인</button>` : ''}
      ${list.length ? list.map(p => `<div class="card"><div class="row between"><b>${esc(p.name)}</b><span class="pill warn">${esc(p.kind)}</span></div><p>${esc(p.when)} · ${esc(p.detail)}</p>
        ${can(p) ? `<div class="row" style="gap:8px;margin-top:8px"><button class="sm" data-id="${esc(p.id)}" data-ok="1">승인</button><button class="sm ghost" data-id="${esc(p.id)}" data-ok="">거절</button></div>` : '<p class="small">새 폰 승인은 사장님만 해요.</p>'}</div>`).join('')
        : `<div class="card empty">${bear('grill')}<p>처리할 게 없어요. 고기나 구우세요!</p></div>`}
      <p class="small">조기 출근 승인 = 그 시각부터 계산(퇴근한 날이면 결산 줄도 바로 고쳐져요). 거절 = 정시부터.</p>${STEP2}</div>`);
    $app.querySelectorAll('[data-id]').forEach(b => b.onclick = () => busy(b, async () => {
      const ok = !!b.dataset.ok; if (!confirm(ok ? '승인할까요?' : '거절할까요?')) return;
      const r = await API.decide(b.dataset.id, ok); r.warn ? alert(r.msg) : toast(r.msg); VIEWS.aok();
    }));
    const all = document.getElementById('all');
    if (all) all.onclick = () => busy(all, async () => { if (!confirm('조기 출근 대기를 전부 승인할까요?')) return; const r = await API.decideAll(); alert(r.msg); VIEWS.aok(); });
  };

  // ---------- 관리: 대시보드 (결산 "대시보드" 화면 글자 그대로) ----------
  VIEWS.adash = async function () {
    loading(); const d = await API.dashboard();
    // 매출은 오르면 초록, 인건비·비율은 오르면 빨강
    const color = (label, c) => { if (!/[▲▼]/.test(c)) return 'var(--sub)'; const up = c.indexOf('▲') >= 0, good = /매출/.test(label) ? up : !up; return good ? 'var(--ok)' : 'var(--bad)'; };
    let sec = '';
    const body = d.rows.map(r => {
      const head = r[0] && r[0] !== sec ? (sec = r[0], `<div class="small" style="color:var(--gold);font-weight:700;margin-top:10px">${esc(r[0])}</div>`) : '';
      const label = r[1] || '', val = r[2] || '', prev = r[3] || '', chg = r[4] || '', note = r[5] || '';
      if (!label) return head;
      return head + `<div class="item"><div><b style="font-size:15px">${esc(label)}</b>${prev ? `<div class="small">${note ? esc(note) : '지난달'} ${esc(prev)}</div>` : ''}</div>
        <div style="text-align:right"><div style="font-weight:800">${esc(val) || '–'}</div>${chg ? `<span style="color:${color(label, chg)};font-weight:700;font-size:13px">${esc(chg)}</span>` : ''}</div></div>`;
    }).join('');
    render(`<div>${header()}<h2>대시보드</h2><p class="small">${(d.head || []).map(esc).join(' · ')}</p>
      <div class="card list">${body || '<p class="small">대시보드 값을 못 읽었어요.</p>'}</div>
      <p class="small">결산 시트 "대시보드" 값 그대로예요 (10분마다 새로 읽음).</p></div>`);
  };

  // ---------- 관리: 매출 (보기만) ----------
  const won = n => '₩' + Math.round(n).toLocaleString('ko-KR');
  const man = n => n >= 10000 ? (Math.round(n / 10000)).toLocaleString('ko-KR') + '만' : n.toLocaleString('ko-KR');
  VIEWS.asales = async function () {
    loading(); const s = await API.sales();
    const td = (ME.today && ME.today.date) || '';
    render(`<div>${header()}<h2>매출 <span class="small">· 이번 달 ${man(s.monthTotal)}원</span></h2>
      <div class="card"><b>💰 매출 넣기</b>
        <label>날짜</label><input type="date" id="sd" value="${td}" max="${td}">
        <label>매출 (원)</label><input id="sa" inputmode="numeric" autocomplete="off" placeholder="예: 1,850,000">
        <button id="ss" style="margin-top:14px">저장</button>
        <p class="small" style="margin-top:8px">결산 "일별매출"에 바로 들어가요. 이미 값이 있는 날은 바꿀지 한 번 더 물어봐요.</p></div>
      <div class="card list">${s.list.length ? s.list.map(x => `<div class="item"><span>${esc(x.label)}</span><b>${won(x.amount)}</b></div>`).join('') : '<p class="small">이번 달 매출 기록이 아직 없어요.</p>'}</div>
      <p class="small">결산 "일별매출" 최근 7일이에요. 앱이 안 되면 하던 대로 시트에 넣어 주세요.</p></div>`);
    const sa = document.getElementById('sa');
    sa.oninput = () => { const n = sa.value.replace(/[^\d]/g, ''); sa.value = n ? Number(n).toLocaleString('ko-KR') : ''; };
    const btn = document.getElementById('ss');
    btn.onclick = () => busy(btn, async () => {
      const d = document.getElementById('sd').value, n = Number(sa.value.replace(/[^\d]/g, ''));
      if (!d || !n) return toast('날짜와 금액을 넣어 주세요');
      let r = await API.saveSales(d, n, false);
      if (r.confirm) { if (!confirm(r.msg)) return; r = await API.saveSales(d, n, true); }
      toast(r.msg); if (r.saved) setTimeout(() => VIEWS.asales(), 600);
    });
  };

  // ---------- 관리: 휴무신청 현황 ----------
  VIEWS.aleave = async function () {
    loading(); const f = await API.leaveAll();
    const sent = f.rows.filter(r => r.sent), not = f.rows.filter(r => !r.sent);
    const avail = f.days.map(d => f.rows.filter(r => r.off.indexOf(d.date) < 0).length);
    const short = f.past ? [] : f.days.map((d, i) => ({ d, i, lack: d.need - avail[i] })).filter(x => x.lack > 0);
    const offNames = d => f.rows.filter(r => r.off.indexOf(d.date) >= 0).map(r => r.disp);
    const amNames = w => f.rows.filter(r => r.am.indexOf(w) >= 0).map(r => r.disp);
    const msg = short.map(x => `[휴무신청 안내] ${x.d.label.replace(' ', '일(')})은 출근 가능한 알바가 ${avail[x.i]}명이라 ${x.lack}명이 부족해요. 이날 휴무 신청한 ${offNames(x.d).join(', ')} 중 ${x.lack}명은 출근해야 해요. 서로 정해서(복불복도 좋아요) 사장님께 알려 주세요!`).join('\n');
    const cell = (r, d) => r.off.indexOf(d.date) >= 0 ? '<td class="sc x">✕</td>' : '<td class="sc"></td>';
    render(`<div>${header()}<h2>휴무신청 · ${esc(f.title)}</h2>
      ${f.past ? '<div class="card"><p style="color:var(--text)">다음 주 신청은 금요일 0시에 열려요. 지금 보이는 건 이번 주 신청이에요.</p></div>' : ''}
      <div class="card hero"><div class="row between"><span>${f.open ? '<span class="pill ok">신청 받는 중</span>' : '<span class="pill off">마감</span>'}</span><span class="small">${f.past ? '' : '마감 ' + esc(f.closes)}</span></div>
        <div class="big" style="margin-top:6px">${sent.length}명 신청 <span class="small">/ 알바 ${f.rows.length}명</span></div>
        ${not.length ? `<p class="small">안 낸 사람: <b style="color:var(--text)">${not.map(r => esc(r.disp)).join(', ')}</b> — 안 내면 모든 요일 저녁 가능으로 짜요.</p>` : '<p class="small">모두 냈어요.</p>'}</div>
      ${short.length ? `<div class="card" style="border-color:rgba(255,107,107,.45)"><b style="color:var(--bad)">⚠️ 인원 부족한 날 ${short.length}일</b>
        ${short.map(x => `<p>${esc(x.d.label)}: 가능 ${avail[x.i]}명 / 필요 ${x.d.need}명 · 신청자 ${offNames(x.d).map(esc).join(', ')}</p>`).join('')}
        <button class="sm" id="cp" style="margin-top:6px">단톡 공지 멘트 복사</button></div>` : f.past ? '' : '<div class="card"><span class="pill ok">인원 부족한 날 없음</span></div>'}
      <div class="card scroll sched"><table>
        <tr><th class="name">이름</th>${f.days.map(d => `<th>${esc(d.label)}</th>`).join('')}</tr>
        ${f.rows.map(r => `<tr><td class="name"${r.sent ? '' : ' style="color:var(--dim)"'}>${esc(r.disp)}</td>${r.sent ? f.days.map(d => cell(r, d)).join('') : `<td colspan="7" class="small" style="text-align:center">미신청 (모두 가능)</td>`}</tr>`).join('')}
        <tr class="sum"><td class="name">가능</td>${f.days.map((d, i) => `<td style="${avail[i] < d.need ? 'color:var(--bad)' : ''}">${avail[i]}/${d.need}</td>`).join('')}</tr></table></div>
      <div class="card"><b>주말 오전(12~15시) 가능</b><p>토: ${amNames('토').map(esc).join(', ') || '없음'}<br>일: ${amNames('일').map(esc).join(', ') || '없음'}</p></div>
      ${sent.length ? `<div class="card list">${sent.map(r => `<div class="item"><span>${esc(r.disp)}</span><span class="small">${esc(r.at)} 보냄</span></div>`).join('')}</div>` : ''}
      <p class="small">✕ = 못 나오는 날. 가능 = 그날 나올 수 있는 알바 수 / 필요한 알바 수. 같은 사람이 여러 번 내면 마지막 것만 써요. 스케줄 짜기는 지금처럼 스케줄 시트 메뉴로 해 주세요.</p></div>`);
    const cp = document.getElementById('cp');
    if (cp) cp.onclick = async () => { try { await navigator.clipboard.writeText(msg); toast('복사했어요. 단톡방에 붙여 넣으세요'); } catch (e) { prompt('아래 글을 길게 눌러 복사하세요', msg); } };
  };

  // ---------- 관리: 직원 계정 (임시 비밀번호) ----------
  VIEWS.aacc = async function () {
    loading(); const list = await API.accounts();
    render(`<div>${header()}<h2>직원 계정</h2>
      <div class="card list">${list.map(a => `<div class="item"><div><b>${esc(a.name)}</b> <span class="small">${a.role !== '직원' ? esc(a.role) + ' · ' : ''}${a.joined ? '가입함' + (a.last ? ' · 마지막 ' + esc(a.last.slice(5)) : '') : '<span style="color:var(--warn)">미가입</span>'}</span></div>
        <button class="sm ghost" data-n="${esc(a.name)}">임시 비번</button></div>`).join('')}</div>
      ${ME.role === '사장님' && list.some(a => !a.joined) ? '<button id="all" style="margin-bottom:10px">미가입 ' + list.filter(a => !a.joined).length + '명 임시 비번 한 번에 만들기</button>' : ''}
      <p class="small">처음 가입하거나 비밀번호를 잊은 직원은 [임시 비번]을 눌러 나온 6자리를 알려 주세요. 직원이 그 번호로 들어오면 바로 자기 번호로 바꾸게 돼요(사장님도 직원 비밀번호는 몰라요). 임시 비밀번호는 48시간 동안만 쓸 수 있어요.</p></div>`);
    const all = document.getElementById('all');
    if (all) all.onclick = async () => {
      if (!confirm('아직 가입 안 한 직원 모두에게 임시 비밀번호를 만들까요?\n(각자 1:1 카톡으로 보내 주세요. 단톡방에 올리면 안 돼요)')) return;
      all.disabled = true;
      try {
        const r = await API.issueAll();
        const msg = x => `[산성 MATE] ${x.name}님 임시 비밀번호: ${x.code}\n${r.hours}시간 안에 아래 주소에서 [처음 가입 / 비밀번호 잊음]을 누르고 이름과 이 번호를 넣은 뒤, 본인 비밀번호 6자리로 바꿔 주세요.\n${location.origin + location.pathname}`;
        render(`<div>${header()}<h2>임시 비밀번호 ${r.list.length}명</h2>
          <div class="card list">${r.list.map((x, i) => `<div class="item"><div><b>${esc(x.name)}</b> <span class="big" style="font-size:20px;letter-spacing:3px;margin-left:6px">${esc(x.code)}</span></div><button class="sm ghost" data-i="${i}">카톡 문구 복사</button></div>`).join('')}</div>
          <p class="small">[카톡 문구 복사]를 누르고 그 직원과의 <b>1:1 카톡</b>에 붙여 넣으세요. ${r.hours}시간이 지나면 이 번호는 못 써요(다시 만들면 돼요). 이 화면을 나가도 다시 누르면 같은 번호가 나와요.</p>
          <button class="ghost" id="bk">목록으로</button></div>`);
        $app.querySelectorAll('[data-i]').forEach(b => b.onclick = async () => { const t = msg(r.list[+b.dataset.i]); try { await navigator.clipboard.writeText(t); b.textContent = '복사됨 ✓'; } catch (e) { prompt('길게 눌러 복사하세요', t); } });
        document.getElementById('bk').onclick = () => VIEWS.aacc();
      } catch (e) { toast(e.message); all.disabled = false; }
    };
    $app.querySelectorAll('[data-n]').forEach(b => b.onclick = async () => {
      const n = b.dataset.n;
      if (!confirm(n + '님 임시 비밀번호를 만들까요?\n(가입한 사람이면 지금 비밀번호는 그대로 쓸 수 있고, 임시 번호로 들어오면 새로 정하게 돼요)')) return;
      b.disabled = true;
      try {
        const r = await API.issueCode(n);
        render(`<div>${header()}<div class="card hero" style="margin-top:24px;text-align:center"><div class="small">${esc(r.name)}님 임시 비밀번호</div>
          <div class="big" style="font-size:44px;letter-spacing:8px;margin:10px 0">${esc(r.code)}</div><p class="small">${r.hours}시간 안에 이 번호로 로그인하면 본인 번호로 바꾸게 돼요. 이 화면을 나가면 다시 볼 수 없어요.</p></div>
          <button class="ghost" id="bk">목록으로</button></div>`);
        document.getElementById('bk').onclick = () => VIEWS.aacc();
      } catch (e) { toast(e.message); b.disabled = false; }
    });
  };

  // ---------- 관리: 출퇴근 기록 넣기·고치기 (NFC "지난 기록 넣기"와 같음) ----------
  VIEWS.afix = async function () {
    loading(); const list = await people(), td = (ME.today && ME.today.date) || '';
    render(`<div>${header()}<h2>출퇴근 기록 넣기·고치기</h2>
      <div class="card">
        <label>누구</label><select id="fn"><option value="">이름 고르기</option>${opts(list)}</select>
        <label>날짜</label><input type="date" id="fd" value="${td}" max="${td}">
        <p class="small" id="fs" style="margin-top:8px">이름과 날짜를 고르면 지금 기록을 불러와요.</p>
        <div id="fin"><label>출근 (비우면 정시)</label><input type="time" id="fi" step="300"></div>
        <label>퇴근</label><input type="time" id="fo" step="300">
        <label>근무 구분</label><select id="fk"><option value="normal">스케줄대로</option><option value="sub">대타</option><option value="extra">추가 출근 (사장님·매니저 요청)</option></select>
        <div id="fsw" hidden><label>누구 대신? (풀네임)</label><input id="fb" placeholder="예: 홍길동"></div>
        <button id="fsv" style="margin-top:16px">저장</button></div>
      <p class="small">퇴근을 안 찍은 날이나 잘못 찍힌 날을 고쳐요. 결산 "설문지 응답 시트1"에도 바로 반영돼요(같은 날 퇴근 폼 줄이 있으면 경고만 하고 안 넣어요). 정직원은 퇴근만 넣어요.</p>${STEP2}</div>`);
    const $ = id => document.getElementById(id);
    const kind = () => { $('fsw').hidden = $('fk').value !== 'sub'; };
    $('fk').onchange = kind;
    const look = async () => {
      const n = $('fn').value, d = $('fd').value, p = list.find(x => x.name === n);
      $('fin').hidden = p ? !p.alba : false;
      if (!n || !d) return;
      $('fs').textContent = '불러오는 중…';
      try {
        const r = await API.lookup(n, d);
        if (r.found) { $('fi').value = r.inTag || ''; $('fo').value = (r.out || '').replace(/^2([4-9]):/, (m, h) => '0' + (h - 4) + ':'); $('fk').value = r.kind || 'normal'; $('fb').value = r.sub || ''; $('fs').textContent = '지금 기록: 출근 ' + (r.inTag || '-') + ' · 계산 ' + (r.start || '-') + ' · 퇴근 ' + (r.out || '-'); }
        else { $('fi').value = ''; $('fo').value = ''; $('fk').value = 'normal'; $('fb').value = ''; $('fs').textContent = '이날은 기록이 없어요. 새로 넣어요.'; }
        kind();
      } catch (x) { $('fs').textContent = x.message; }
    };
    $('fn').onchange = look; $('fd').onchange = look;
    $('fsv').onclick = () => busy($('fsv'), async () => {
      const n = $('fn').value, d = $('fd').value, o = $('fo').value;
      if (!n || !d || !o) return toast('이름·날짜·퇴근을 넣어 주세요');
      if ($('fk').value === 'sub' && !$('fb').value.trim()) return toast('누구 대신인지 적어 주세요');
      if (!confirm(n + ' ' + d.slice(5) + ' ' + ($('fin').hidden ? '' : ($('fi').value || '정시') + ' ~ ') + o + ' 로 저장할까요?')) return;
      const r = await API.manual({ name: n, wd: d, inT: $('fin').hidden ? '' : $('fi').value, outT: o, kind: $('fk').value, sub: $('fb').value });
      r.warn ? alert(r.msg) : toast(r.msg); look();
    });
  };

  VIEWS.amore = function () {
    render(`<div>${header()}<h2>더보기</h2>
      <div class="card list">
        <a class="item" href="#" data-go="afix" style="color:inherit;text-decoration:none"><span>✏️ 출퇴근 기록 넣기·고치기</span><span class="small">›</span></a>
        <a class="item" href="#" data-go="aacc" style="color:inherit;text-decoration:none"><span>🔑 직원 계정 · 임시 비밀번호</span><span class="small">›</span></a>
        <a class="item" href="#" data-go="aleave" style="color:inherit;text-decoration:none"><span>📝 휴무신청 현황</span><span class="small">›</span></a>
        <a class="item" href="#" data-go="sched" style="color:inherit;text-decoration:none"><span>📅 이번 주 근무표</span><span class="small">›</span></a>
        <a class="item" href="#" data-go="rec" style="color:inherit;text-decoration:none"><span>⏱️ 내 출퇴근 기록</span><span class="small">›</span></a>
      </div>${backup()}</div>`);
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
