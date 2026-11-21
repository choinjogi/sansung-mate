// 새 앱(여러 매장용) 화면 = 산성 앱 app.js를 그대로 가져옴. 데이터는 window.API = data-fb.js(Firebase)
// 산성 앱과 다른 곳은 '새 앱:' 주석으로 표시 (매장 고르기·사장님 구글 로그인·이미지 경로·주민번호 칸 없음)
(function () {
  const $app = document.getElementById('app'), $nav = document.getElementById('nav'), $navin = document.getElementById('navin');
  const store = { get: k => { try { return localStorage.getItem(k); } catch (e) { return null; } }, set: (k, v) => { try { localStorage.setItem(k, v); } catch (e) {} }, del: k => { try { localStorage.removeItem(k); } catch (e) {} } };
  const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
  const hm = m => Math.floor(m / 60) + '시간' + (m % 60 ? ' ' + (m % 60) + '분' : '');
  let ME = null, TAB = 'home';

  function toast(t) { const d = document.createElement('div'); d.className = 'toast fade'; d.textContent = t; document.body.appendChild(d); setTimeout(() => d.remove(), 2200); }
  let SILENT = false;  // 뒤에서 새 값으로 다시 그릴 때는 깜빡임·스크롤 이동 없이
  function render(html) { const y = window.scrollY; $app.innerHTML = html; if (SILENT) { window.scrollTo(0, y); return; } $app.firstElementChild && $app.firstElementChild.classList.add('fade'); window.scrollTo(0, 0); }
  const header = () => `<div class="top"><div class="brand"><img src="../icons/emblem.png" alt=""><div>${esc(API.storeName() || 'MATE')}<br><small>${esc(ME.disp)}님${ME.role ? ' · ' + esc(ME.role) : ''}</small></div></div>
    <button class="ghost sm" id="logout">나가기</button></div><div class="small" style="text-align:right;margin-top:-2px">버전 ${APP_VER}</div>${API.demo ? '<div class="demo">시험 화면 — 실제 기록과 연결 안 됨</div>' : ''}`;
  const loading = () => { if (!SILENT) render('<div class="splash"><p>불러오는 중…</p></div>'); };

  // ---------- 탭 ----------
  const STAFF_TABS = [['home', '🏠', '홈'], ['sched', '📅', '근무표'], ['leave', '📝', '휴무신청'], ['rec', '⏱️', '내 기록']];
  const ADMIN_TABS = [['atoday', '👀', '오늘'], ['aok', '✅', '승인'], ['asales', '💰', '매출'], ['adash', '📊', '대시보드'], ['amore', '☰', '더보기']];
  const SUB = { afix: 'amore', sched: 'amore', aleave: 'amore', aacc: 'amore', rec: 'amore', info: 'amore', astaff: 'amore', awage: 'amore' };  // 더보기 안의 화면
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
    render(`<div class="splash"><img class="emb" src="../icons/emblem.png" alt="산성식육점"><div class="t1">${esc(API.storeName() || '매장 근무 앱')}</div>
      <div class="t2"><em>MATE</em></div></div>`);
  }
  const bear = (kind, cls) => `<img class="bear ${cls || ''}" src="../img/bear-${kind}.png" alt="">`;
  // 로그인: 이름 + 숫자 6자리. 임시 비밀번호(사장님이 만들어 줌)로 들어오면 본인 번호로 바꾸기
  const pin = id => `<input id="${id}" type="password" inputmode="numeric" pattern="[0-9]*" maxlength="6" autocomplete="off" placeholder="숫자 6자리" style="letter-spacing:6px;font-size:22px;font-weight:800">`;
  const loginTop = () => `<div class="row" style="width:100%;justify-content:space-between;align-items:flex-end">
        <div class="hello">NICE TO<br><span>MEAT</span> YOU.</div>${bear('grill', 'sm')}</div>`;
  // 새 앱: 일하는 매장 찾기 (매장 이름을 정확히, 띄어쓰기 상관없음)
  function findStore(msg) {
    $nav.hidden = true; ME = null;
    render(`<div class="splash" style="justify-content:flex-start;padding-top:7vh">${loginTop()}
      <div class="card" style="width:100%;text-align:left;margin-top:18px"><b>내 매장 찾기</b>
        <label>일하는 매장 이름</label><input id="sn" placeholder="사장님께 받은 매장 이름">
        <p class="small" id="lm" style="margin-top:10px;color:${msg ? 'var(--bad)' : 'var(--dim)'}">${esc(msg || '매장 이름을 정확히 넣어 주세요. 초대 링크를 받았으면 그 링크로 열어도 돼요.')}</p>
        <button id="go" style="margin-top:8px">찾기</button></div>
      <button class="ghost" id="own" style="margin-top:14px;width:100%">사장님 · 구글로 로그인</button></div>`);
    document.getElementById('own').onclick = e => busy(e.target, async () => { await API.googleLogin(); start(); });
    document.getElementById('go').onclick = e => busy(e.target, async () => {
      const v = document.getElementById('sn').value.trim(); if (!v) return findStore('매장 이름을 넣어 주세요');
      const st = await API.findStore(v).catch(() => null);
      if (!st) return findStore('그 이름의 매장이 없어요. 사장님께 매장 이름을 다시 물어봐 주세요');
      API.setStore(st.storeId, st.storeName); login();
    });
  }
  // 새 앱: 사장님 매장이 여러 개면 고르기
  function pickStore(list) {
    $nav.hidden = true;
    render(`<div class="splash" style="justify-content:flex-start;padding-top:7vh">${loginTop()}
      <div class="card list" style="width:100%;margin-top:18px">${list.map(s => `<a href="#" class="item" data-sid="${esc(s.id)}" data-sn="${esc(s.name)}" style="color:inherit;text-decoration:none"><span>${esc(s.name)}</span><span class="small">›</span></a>`).join('')}</div></div>`);
    $app.querySelectorAll('[data-sid]').forEach(a => a.onclick = e => { e.preventDefault(); API.setStore(a.dataset.sid, a.dataset.sn); start(); });
  }
  function login(msg) {
    $nav.hidden = true; ME = null;
    if (!API.storeName()) return findStore(msg);
    render(`<div class="splash" style="justify-content:flex-start;padding-top:7vh">${loginTop()}
      <div class="card" style="width:100%;text-align:left;margin-top:18px">
        <div class="row between" style="margin-bottom:4px"><b>${esc(API.storeName())} 로그인</b><a href="#" id="chs" class="small" style="color:var(--sub)">다른 매장</a></div>
        <label>이름 (성까지)</label><input id="nm" autocomplete="username" placeholder="예: 홍길동" value="${esc(store.get('mate_last') || '')}">
        <label>비밀번호</label>${pin('pw')}
        <p class="small" id="lm" style="margin-top:10px;color:${msg ? 'var(--bad)' : 'var(--dim)'}">${esc(msg || '처음이면 [처음 가입]을 눌러 내 비밀번호를 정하세요. 비밀번호를 잊었으면 사장님께 임시 비밀번호를 받아 여기 넣으면 돼요.')}</p>
        <button id="go" style="margin-top:8px">로그인</button>
        <button class="ghost" id="join" style="margin-top:10px">처음 가입</button></div>
      <button class="ghost" id="own" style="margin-top:14px;width:100%">사장님 · 구글로 로그인</button></div>`);
    const $m = document.getElementById('lm'), say = t => { $m.textContent = t; $m.style.color = 'var(--bad)'; };
    document.getElementById('join').onclick = () => join();
    document.getElementById('chs').onclick = e => { e.preventDefault(); findStore(); };
    document.getElementById('own').onclick = e => busy(e.target, async () => { await API.googleLogin(); start(); });
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
  // 가입 (11/19): 이름 + 내 비밀번호 6자리를 직접 정함. 처음 한 번만, 가입하면 사장님·매니저 승인 탭에 "새 가입"으로 뜸
  function join() {
    render(`<div class="splash" style="justify-content:flex-start;padding-top:7vh">${loginTop()}
      <div class="card" style="width:100%;text-align:left;margin-top:18px"><b>처음 가입</b>
        <p class="small">이름(성까지)을 쓰고 내가 쓸 <b style="color:var(--text)">숫자 6자리</b>를 정해 주세요. 사장님도 이 번호는 몰라요.</p>
        <label>이름 (성까지)</label><input id="nm" placeholder="예: 홍길동" value="${esc(store.get('mate_last') || '')}">
        <label>내 비밀번호</label>${pin('p1')}<label>한 번 더</label>${pin('p2')}
        <p class="small" id="lm" style="margin-top:10px;color:var(--bad)"></p>
        <button id="go" style="margin-top:8px">가입하고 시작</button><button class="ghost" id="back" style="margin-top:10px">로그인으로 돌아가기</button>
        <p class="small" style="margin-top:10px">꼭 본인 이름으로 가입해 주세요. 가입하면 사장님께 알림이 가요.</p></div></div>`);
    const $m = document.getElementById('lm');
    document.getElementById('back').onclick = () => login();
    document.getElementById('go').onclick = async e => {
      const name = document.getElementById('nm').value.trim(), a = document.getElementById('p1').value.trim(), b = document.getElementById('p2').value.trim();
      if (!name) return $m.textContent = '이름을 써 주세요'; if (!/^\d{6}$/.test(a)) return $m.textContent = '비밀번호는 숫자 6자리로 정해 주세요'; if (a !== b) return $m.textContent = '두 번 쓴 번호가 달라요';
      e.target.disabled = true; e.target.textContent = '가입 중…';
      let r; try { r = await API.register(name, a); } catch (x) { r = { ok: false, err: x.message }; }
      store.set('mate_last', name);
      if (r.ok) { toast('가입했어요'); return start(); }
      e.target.disabled = false; e.target.textContent = '가입하고 시작'; $m.textContent = r.err || '가입하지 못했어요';
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
    try { ME = await API.me(); } catch (e) {
      if (e.code === 'pickStore') return pickStore(e.stores);
      if (e.code === 'noStore') {
        const out = async () => { await API.logout(); findStore(); };
        if (window.EXTRA && (await EXTRA.tryInvite(out) || await EXTRA.tryOrg(out))) return;   // 초대받은 사장님·대표님 = 새 매장 만들기
        await API.logout(); return findStore('이 구글 계정에는 매장이 없어요. 대표님께 매장 만들기 초대를 받아 주세요');
      }
      return login(API.hasToken && API.hasToken() ? e.message : '');
    }
    const t = store.get('mate_tab');
    go(tabs().some(x => x[0] === t) || (ME.role && SUB[t]) ? t : tabs()[0][0]);
    if (API.prefetch) API.prefetch(ME.role ? ['adminToday', 'pending', 'dashboard', 'schedule'] : ['schedule', 'records']);
  }
  window.addEventListener('mate-logout', () => login('다시 로그인해 주세요'));
  window.addEventListener('mate-out', () => { store.del('mate_tab'); login(); });   // 새 앱: 붙인 화면의 [로그아웃]
  // 뒤에서 새 값이 왔고 지금 그 화면을 보고 있으면 조용히 다시 그림 (입력 중이면 건드리지 않음)
  const VIEW_FN = { home: ['me'], sched: ['schedule'], rec: ['records'], atoday: ['adminToday', 'leaveAll'], aok: ['pending'], adash: ['dashboard'], aleave: ['leaveAll'], astaff: ['people'] };
  window.addEventListener('mate-fresh', e => {
    if (!ME || !(VIEW_FN[TAB] || []).includes(e.detail)) return;
    const f = document.activeElement; if (f && /INPUT|SELECT|TEXTAREA/.test(f.tagName)) return;
    const t = TAB; SILENT = true;
    Promise.resolve().then(() => VIEWS[t]()).catch(() => {}).finally(() => { SILENT = false; });
  });
  document.addEventListener('click', async e => { if (e.target.id === 'logout') { if (!confirm('로그아웃할까요?')) return; await API.logout(); store.del('mate_tab'); login(); } });

  const VIEWS = {};

  // ---------- 폰 알림 (11/19) ----------
  const isStandalone = () => window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
  const isIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent);
  const keyBytes = k => { const s = atob(k.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((k.length + 3) % 4)); return Uint8Array.from(s, c => c.charCodeAt(0)); };
  async function pushCard() {
    const st = document.getElementById('pushst'), btn = document.getElementById('pushbtn'); if (!st || !btn) return;
    const ok = 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
    if (!ok || (isIOS() && !isStandalone())) { st.textContent = isIOS() ? '홈 화면에 추가한 앱에서만 받을 수 있어요 (사파리 → 공유 → 홈 화면에 추가)' : '이 브라우저는 알림을 못 받아요. 크롬으로 열어 주세요.'; btn.hidden = true; return; }
    const reg = await navigator.serviceWorker.ready, sub = await reg.pushManager.getSubscription();
    if (Notification.permission === 'denied') { st.textContent = '알림이 막혀 있어요. 폰 설정 → 알림에서 산성 MATE(또는 크롬)를 허용해 주세요.'; btn.hidden = true; return; }
    if (sub && Notification.permission === 'granted') {
      st.textContent = '켜짐 · 휴무신청 열림(금 0시) · 마감 1시간 전(토 21시)'; btn.textContent = ME.role === '사장님' ? '시험' : '끄기'; btn.className = 'sm ghost';
      btn.onclick = () => busy(btn, async () => {
        if (ME.role === '사장님') { const r = await API.pushTest(); return r.warn ? alert(r.msg) : toast(r.msg); }
        if (!confirm('알림을 끌까요?')) return; await API.pushOff({ endpoint: sub.endpoint }); await sub.unsubscribe(); toast('알림을 껐어요'); pushCard();
      });
      API.pushSub({ endpoint: sub.endpoint }).catch(() => {});   // 서버 목록에 계속 있게
      return;
    }
    btn.onclick = () => busy(btn, async () => {
      const p = await Notification.requestPermission();
      if (p !== 'granted') { toast('알림을 허용해야 받을 수 있어요'); return pushCard(); }
      const m = await API.pushMine();
      const s = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(m.key) });
      const r = await API.pushSub({ endpoint: s.endpoint });
      toast(r.msg || '알림을 켰어요'); pushCard();
    });
  }

  // ---------- 출퇴근 버튼 (11/20, NFC 스티커 대신) ----------
  // 기록은 NFC 출퇴근과 같은 곳(스티커로 찍어도 같은 기록). 와이파이 주소는 Cloudflare 서버가 서명해 줌 → 2초 안에 못 받아도 기록은 함
  const CLOCK_ALL = true;
  const SIG_URL = 'https://mate-server.choinjogi.workers.dev/ipSig';
  function getW() {
    return new Promise(res => {
      const t = setTimeout(() => res(''), 2000);
      fetch(SIG_URL, { cache: 'no-store' }).then(r => r.json()).then(j => { clearTimeout(t); res(j && j.ok ? JSON.stringify({ ip: j.ip, t: j.t, sig: j.sig }) : ''); }).catch(() => { clearTimeout(t); res(''); });
    });
  }
  async function loadClock() {
    const box = document.getElementById('clock'); if (!box || !API.clockStatus) return;
    if (!CLOCK_ALL && ME.role !== '사장님') return;  // 처음엔 사장님만 시험 → 확인되면 CLOCK_ALL = true
    let s; try { s = await API.clockStatus(); } catch (e) { box.innerHTML = ''; return; }
    if (!document.getElementById('clock')) return;
    if (s.wait) { box.innerHTML = '<div class="card"><b>⏱️ 출퇴근</b><p class="small">가입 확인이 끝나면 여기서 출퇴근을 찍을 수 있어요.</p></div>'; return; }
    const st = s.st || {}, both = st.mode !== '퇴근만';
    const line = st.out ? `<span class="pill ok">퇴근 ${esc(st.out)}</span>` : st.inTag ? `<span class="pill ok">출근 찍음</span>` : '<span class="small">아직 안 찍었어요</span>';
    const btn = st.out ? '<button class="ghost sm" id="cAgain" style="margin-top:10px">퇴근 시간 다시 찍기</button>'
      : both && !st.inTag ? '<button id="cIn" style="margin-top:10px">출근</button><button class="ghost sm" id="cOut" style="margin-top:8px">출근 안 찍고 퇴근</button>'
      : '<button id="cOut" style="margin-top:10px">퇴근</button>';
    box.innerHTML = `<div class="card"><div class="row between"><b>⏱️ 오늘 출퇴근</b>${line}</div>${btn}<p class="small" style="margin-top:8px">매장 와이파이에 연결하고 눌러 주세요.</p></div>`;
    const on = (id, f) => { const b = document.getElementById(id); if (b) b.onclick = f; };
    on('cIn', e => busy(e.target, () => doClock('출근', false)));
    on('cOut', () => outScreen('퇴근'));
    on('cAgain', () => outScreen('퇴근다시'));
  }
  const back = () => go(TAB);
  // 퇴근: 알바는 폰을 들고 사장님·매니저에게 가서 눌러 달라고 함. 없으면 혼자 퇴근(⚠)
  function outScreen(kind) {
    if (ME.group !== '알' || ME.role) return clockRun(kind, false);
    render(`<div>${header()}<div class="card" style="margin-top:16px;text-align:center"><div style="font-size:44px">🙋</div>
      <b style="font-size:19px">${esc(ME.disp)}님 퇴근</b>
      <p style="margin-top:8px">이 폰을 들고 <b>사장님이나 매니저</b>에게 가서<br>“퇴근할게요!” 하고 눌러 달라고 하세요.</p>
      <button id="oYes" style="margin-top:14px">퇴근 (사장님·매니저가 눌러요)</button>
      <div id="oSolo"><button class="ghost" id="oAlone" style="margin-top:10px">확인해 줄 사람이 없어요 · 혼자 퇴근</button></div>
      <button class="ghost sm" id="oBack" style="margin-top:10px">취소</button></div></div>`);
    document.getElementById('oYes').onclick = () => clockRun(kind, false);
    document.getElementById('oBack').onclick = back;
    document.getElementById('oAlone').onclick = () => {
      document.getElementById('oSolo').innerHTML = `<div class="card" style="border-color:var(--warn);margin-top:10px;text-align:left"><b style="color:var(--warn)">⚠ 확인 없이 혼자 퇴근</b>
        <p class="small">사장님께 "확인 필요"로 표시돼요. 퇴근 시각은 지금으로 기록돼요.</p><button id="oAlone2" style="margin-top:8px">그래도 혼자 퇴근</button></div>`;
      document.getElementById('oAlone2').onclick = () => clockRun(kind, true);
    };
  }
  function clockRun(kind, alone) {
    render(`<div>${header()}<div class="card" style="margin-top:16px;text-align:center"><p>기록 중… 퇴근은 5초쯤 걸려요.</p></div></div>`);
    doClock(kind, alone).catch(e => clockDone({ mode: 'msg', kind: 'warn', title: '기록하지 못했어요', text: e.message + '\n다시 눌러 주세요. 계속 안 되면 사장님·매니저에게 말해 주세요.' }));
  }
  async function doClock(kind, alone) {
    const w = await getW();
    clockDone(await API.clock(kind, w, alone));
  }
  function clockDone(r) {
    r = r || {};
    if (r.askEarly) return askEarly(r);
    const warn = [];
    if (r.alone) warn.push('⚠ 확인 없이 혼자 퇴근했어요');
    if (r.wifi === false && !r.blocked) warn.push('⚠ 매장 와이파이가 아니에요 (기록은 됐어요)');
    if (r.wifi === null && !r.blocked && r.kind !== 'warn') warn.push('⚠ 매장 와이파이인지 확인하지 못했어요 (기록은 됐어요)');
    let h = `<div>${header()}<div class="card" style="margin-top:16px"><b style="font-size:19px;color:var(${r.kind === 'warn' ? '--warn' : '--text'})">${esc(r.title || '완료')}</b>
      <p style="white-space:pre-line;margin-top:6px">${esc(r.text || '')}</p>${warn.map(t => `<p class="small" style="color:var(--warn)">${esc(t)}</p>`).join('')}`;
    if (r.shiftButtons) {
      h += '<h2>오늘 근무가 스케줄과 달랐나요?</h2>' + [['normal', '스케줄대로'], ['sub', '대타였어요'], ['extra', '추가 출근 (사장님·매니저 요청)']]
        .map(o => `<button class="ghost" data-sh="${o[0]}" style="margin-top:8px">${o[1]}</button>`).join('');
    }
    h += '<button class="ghost sm" id="cHome" style="margin-top:14px">닫기</button></div></div>';
    render(h);
    document.getElementById('cHome').onclick = back;
    document.querySelectorAll('[data-sh]').forEach(b => b.onclick = () => b.dataset.sh === 'sub' ? askSub() : busy(b, async () => clockDone(await API.clockShift(b.dataset.sh, ''))));
  }
  function askSub() {
    render(`<div>${header()}<div class="card" style="margin-top:16px"><b>누구 대신 나왔나요?</b><p class="small">원래 근무자 이름을 풀네임으로 적어 주세요.</p>
      <input id="subN" placeholder="예: 홍길동"><button id="subOk" style="margin-top:8px">저장</button><button class="ghost sm" id="subNo" style="margin-top:8px">취소</button></div></div>`);
    document.getElementById('subNo').onclick = back;
    document.getElementById('subOk').onclick = e => { const s = document.getElementById('subN').value.trim(); if (s) busy(e.target, async () => clockDone(await API.clockShift('sub', s))); };
  }
  // 정시보다 일찍 찍은 날 퇴근 때: 평소대로 / 매장 요청으로 일찍(예외 출근 시각 → 승인 대기)
  function askEarly(r) {
    render(`<div>${header()}<div class="card" style="margin-top:16px"><b style="font-size:19px">${esc(r.title)}</b>
      <p style="margin-top:6px">오늘은 출근을 ${esc(r.askEarly.inTag)}에 찍었어요. (정시 ${esc(r.askEarly.base)})</p>
      <h2>오늘 출근, 어떤 경우인가요?</h2><button class="ghost" id="eSelf">평소대로 출근했어요 (${esc(r.askEarly.base)}부터)</button>
      <h2>매장 요청으로 일찍 나왔어요 (예외 출근)</h2><p class="small">사장님·매니저님이 일찍 불렀으면, 실제 출근한 시각을 넣어 주세요.</p>
      <input id="eT" type="time" value="${esc(r.askEarly.inTag)}"><button id="eCalled" style="margin-top:8px">이 시각으로 예외 출근 보내기</button></div></div>`);
    document.getElementById('eSelf').onclick = e => busy(e.target, async () => clockDone(await API.clockEarly('self', '')));
    document.getElementById('eCalled').onclick = e => { const t = document.getElementById('eT').value; if (t) busy(e.target, async () => clockDone(await API.clockEarly('called', t))); };
  }

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
    const tm = s => { const m = String(s || '').match(/(\d{1,2}):(\d{2})/); return m ? +m[1] * 60 + +m[2] : null; };
    const lateM = ME.group === '알' && t.clock && t.clock.in && t.start && tm(t.clock.in) > tm(t.start) ? tm(t.clock.in) - tm(t.start) : 0;
    const pendCard = ME.pend ? '<div class="card"><span class="pill warn">가입 확인 대기</span><p class="small" style="margin-top:6px">사장님·매니저님이 가입을 확인하면 내 급여와 내 정보 입력이 열려요.</p></div>' : '';
    render(`<div>${header()}
      <div class="card hero"><div class="row between"><span class="small">오늘 ${esc(t.label)}</span>${work ? '<span class="pill on">근무</span>' : '<span class="pill off">쉬는 날</span>'}</div>
        <div class="big" style="margin-top:6px">${work ? (t.code !== 'O' ? '12:00 출근 (주말 오전)' : t.start ? t.start + ' 출근' + (t.early ? ' <span class="pill warn">일찍 부름</span>' : '') : '오늘 근무') : ME.covered === false ? '스케줄 확정 전' : '오늘은 쉬는 날'}</div>
        ${ck ? '<div style="margin-top:6px">' + ck + (lateM ? ' <span class="pill warn">지각 ' + lateM + '분</span>' : '') + '</div>' : ''}
        ${work ? '' : bear('eat') + '<p class="small" style="text-align:center">맛있는 거 먹고 푹 쉬세요!</p>'}</div>
      <div id="clock"></div>
      ${pendCard}
      <h2>이번 주 내 근무 <span class="small">· ${ME.workDays}일</span></h2>
      <div class="week">${ME.week.map(d => `<div class="day ${d.code === 'O' || d.code === '오전' ? 'work' : d.code === 'X' ? 'offd' : ''} ${d.today ? 'today' : ''}"><b>${esc(d.label.split(' ')[1])}</b><span>${d.code === 'O' ? '근무' : d.code === '오전' ? '오전' : d.code === 'X' ? '✕' : '–'}</span></div>`).join('')}</div>
      <h2>공지</h2>${ME.notice.map(n => `<div class="card"><div class="small">${esc(n.d)}</div><p style="color:var(--text)">${esc(n.t)}</p></div>`).join('')}
      <div class="card row between" id="pushcard" style="display:flex"><div><b>🔔 폰 알림</b><div class="small" id="pushst">휴무신청 열림 · 마감 1시간 전 알림</div></div><button class="sm" id="pushbtn" style="width:auto;margin:0">알림 받기</button></div>
      <a href="#" id="goinfo" class="card row between" style="color:inherit;text-decoration:none;display:flex"><div><b>👤 내 정보</b><div class="small">급여 받을 계좌 · 이메일</div></div><span class="small">›</span></a>
      ${backup()}
    </div>`);
    const gi = document.getElementById('goinfo'); if (gi) gi.onclick = e => { e.preventDefault(); go('info'); };
    pushCard(); loadClock();
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
  // ---------- 내 정보: 계좌·이메일·주민번호 (넣기만, 다시 보여 주지 않음) ----------
  const BANKS = ['국민', '신한', '우리', '하나', '농협', '기업', '카카오뱅크', '토스뱅크', '케이뱅크', '새마을금고', '우체국', '부산', '경남', '대구', '수협', '신협', 'SC제일'];
  VIEWS.info = async function () {
    if (ME.pend) return render(`<div>${header()}<h2>내 정보</h2><div class="card"><span class="pill warn">가입 확인 대기</span><p style="color:var(--text);margin-top:8px">사장님·매니저님이 앱 가입을 확인한 뒤에 계좌·주민번호를 넣을 수 있어요.</p><p class="small">매장에서 "앱 가입 승인해 주세요"라고 말해 주세요.</p></div></div>`);
    loading(); const d = await API.myInfo();
    const st = (v, t) => v ? `<span style="color:var(--text)">${esc(t || v)}</span>` : '<span style="color:var(--warn)">아직 없음</span>';
    render(`<div>${header()}<h2>내 정보</h2>
      <div class="card"><b>지금 사장님 쪽에 있는 정보</b>
        <table class="kv"><tr><td>은행</td><td>${st(d.bank)}</td></tr><tr><td>계좌</td><td>${st(d.acct)}</td></tr><tr><td>이메일</td><td>${st(d.email)}</td></tr></table>
        <p class="small">보안을 위해 계좌는 끝 4자리만 보여요.</p></div>
      ${d.pending ? `<div class="card"><span class="pill warn">확인 대기</span> <span class="small">${esc(d.pending.at)}에 보냄 · 사장님·매니저님이 확인하면 반영돼요</span></div>` : ''}
      <div class="card"><b>${d.bank || d.acct ? '바꾸기' : '넣기'}</b><p class="small">바꿀 칸만 넣으세요. 비워 둔 칸은 그대로예요.</p>
        <label>은행</label><select id="ib"><option value="">${d.bank ? '그대로' : '고르기'}</option>${BANKS.map(b => `<option>${b}</option>`).join('')}<option value="_">직접 쓰기</option></select>
        <input id="ib2" placeholder="은행 이름" hidden>
        <label>계좌번호</label><input id="ia" inputmode="numeric" autocomplete="off" placeholder="숫자만 (- 없어도 돼요)">
        <label>이메일</label><input id="ie" type="email" autocomplete="email" placeholder="예: name@gmail.com">
        <input id="ir" type="hidden" value="">
        <p class="small" id="im" style="margin-top:10px;color:var(--bad)"></p>
        <button id="is" style="margin-top:6px">보내기</button></div>
      <p class="small">수집 목적: 급여 지급. 항목: 은행·계좌번호·이메일. 근무가 끝난 뒤에도 법에서 정한 기간 동안만 보관해요. 사장님이 확인한 뒤 매장 정보에 저장되고, 이 앱 화면에는 끝 4자리만 나와요. 주민등록번호는 앱에 넣지 않아요(사장님께 따로).</p></div>`);
    const $ = id => document.getElementById(id), $m = $('im');
    $('ib').onchange = () => { $('ib2').hidden = $('ib').value !== '_'; };
    $('is').onclick = e => busy(e.target, async () => {
      const bank = $('ib').value === '_' ? $('ib2').value.trim() : $('ib').value, acct = $('ia').value.trim(), email = $('ie').value.trim(), rrn = $('ir').value.trim();
      if (!bank && !acct && !email) return $m.textContent = '바꿀 칸을 하나 이상 넣어 주세요';
      if (!!bank !== !!acct) return $m.textContent = '은행과 계좌번호는 같이 넣어 주세요';
      if (rrn && rrn.replace(/\D/g, '').length !== 13) return $m.textContent = '주민번호는 13자리예요';
      const r = await API.saveInfo({ bank, acct, email, rrn });
      if (!r.saved) return $m.textContent = r.msg;
      toast(r.msg); VIEWS.info();
    });
  };

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
         ${r.hours === false ? `<div class="big" style="font-size:24px;margin-top:4px">퇴근 ${esc(x.out)}</div>` : `<div class="big" style="font-size:24px;margin-top:4px">${hm(x.mins)}</div><p class="small">출근 ${esc(x.in)} ~ 퇴근 ${esc(x.out)}${x.tap ? ' · 찍은 시각 ' + esc(x.tap) : ''}</p>`}`
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
      if (!r.hours) sumCard = `<div class="card"><div class="row between"><b>이번 달 요약</b><span class="small">${r.mon}/1 ~ ${r.mon}/${S.upto}</span></div>
        <table class="kv">${rows.map(x => `<tr><td>${x[0]}</td><td>${esc(x[1])}</td></tr>`).join('')}</table></div>`;
      if (r.hours && S.weeks) sumCard += `<div class="card"><div class="row between"><b>근무시간 · 주휴</b><span class="small">출퇴근 기록 기준</span></div>
        <div class="row" style="gap:22px;margin:6px 0 10px"><div><div class="small">총 근무시간</div><div class="big" style="font-size:22px">${S.totalH != null ? S.totalH + '시간' : hm(r.total)}</div></div>
        <div><div class="small">주휴수당</div><div class="big" style="font-size:22px">${S.noJuhu ? '해당 없음' : won(S.juhu)}</div></div></div>
        <table class="kv"><tr><th>주차</th><th>시간</th><th>주휴</th></tr>${S.weeks.map(w => `<tr><td>${esc(w.wk)}</td><td>${w.h.toFixed(1)}h</td><td>${S.noJuhu ? '-' : w.pay ? won(w.pay) : '<span class="small">' + (w.h < 15 ? '15시간 미만' : '0원') + '</span>'}</td></tr>`).join('')}</table>
        <p class="small">주휴는 한 주 15시간 이상 일하면 생겨요(1~7일·8~14일처럼 7일씩 끊어서 계산). 최종 금액은 월말결제 기준이에요.</p></div>`;
      if (r.hours && S.payLocked) sumCard += `<div class="card"><b>내 급여</b><p class="small" style="margin-top:6px">사장님·매니저님이 앱 가입을 확인하면 보여요.</p></div>`;
      if (r.hours && S.pay) sumCard += `<div class="card"><div class="row between"><b>내 급여</b><span class="small">${r.mon}/1 ~ ${r.mon}/${S.upto} 출퇴근 기록 기준</span></div>
        <div class="row" style="gap:22px;margin:6px 0 10px"><div><div class="small">현재까지 받을 돈</div><div class="big" style="font-size:22px">${won(S.pay.now)}</div></div>
</div>
        <table class="kv"><tr><td>그중 주휴수당</td><td>${S.noJuhu ? '해당 없음' : won(S.juhu)}</td></tr></table>
        <p class="small">현재까지 받을 돈 = 주휴수당 포함. 최종 금액은 월말결제(사장님 확인) 기준이에요.</p></div>`;
      const ev = r.list.filter(x => x.tags.length).map(x => ({ d: x.day, t: x.tags })).concat(Object.values(off).map(o => ({ d: o.day, t: o.tags }))).sort((a, b) => a.d - b.d);
      sumCard += `<div class="card"><div class="row between"><b>근무 특이사항</b>${r.hours && S.late != null ? `<span class="pill ${S.late ? 'warn' : 'ok'}">지각 ${S.late}번${S.late ? ' · ' + S.lateMin + '분' : ''}</span>` : ''}</div>${ev.length ? `<table class="kv ev">${ev.map(e => `<tr data-d="${e.d}"><td>${r.mon}/${e.d} (${W(e.d)})</td><td><div class="tags" style="margin:0">${pills(e.t)}</div></td></tr>`).join('')}</table>` : '<p class="small" style="margin-top:6px">이번 달은 특이사항이 없어요.</p>'}</div>`;
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
  const STEP2 = ''; // 새 앱: NFC 관리 화면 없음
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
    // 11/20 와이파이 표시: ✓ 매장 와이파이 / ⚠ 와이파이 아님 / ⚠ 확인 못 함 (예전 기록·폼·직접 넣은 기록은 표시 없음)
    const wf = v => v === 'ok' ? '<div class="small" style="color:var(--ok)">✓ 매장 와이파이</div>' : v === 'no' ? '<div class="small" style="color:var(--warn)">⚠ 와이파이 아님</div>' : v === '?' ? '<div class="small" style="color:var(--warn)">⚠ 와이파이 확인 못 함</div>' : '';
    // 11/21 오늘 매출·알바 인건비·비율
    const mo = d.money, won = n => '₩' + Math.round(n).toLocaleString('ko-KR');
    const moneyCard = mo ? `<div class="card"><b>💰 오늘 매출 · 알바 인건비</b><div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;margin-top:8px;text-align:center">
      <div><div class="small">매출</div><div style="font-size:18px;font-weight:800">${mo.sales != null ? won(mo.sales) : '<span class="small">아직 안 넣음</span>'}</div></div>
      <div><div class="small">알바 인건비</div><div style="font-size:18px;font-weight:800">${won(mo.cost)}</div></div>
      <div><div class="small">매출 대비</div><div style="font-size:18px;font-weight:800;color:${mo.ratio == null ? 'var(--dim)' : 'var(--text)'}">${mo.ratio != null ? mo.ratio + '%' : '–'}</div></div></div>
      <p class="small" style="margin-top:6px">퇴근 ${mo.done}명${mo.working ? ` · 근무 중 ${mo.working}명은 지금까지` : ''} · 시급 × 근무 시간(주휴 빼고)${mo.sales == null ? ' · 매출은 💰 매출 탭에서 넣으면 %가 나와요' : ''}</p></div>` : '';
    render(`<div>${header()}<div id="clock"></div>${moneyCard}<h2>오늘 ${esc(d.label)} 출근 현황</h2>
      ${d.covered === false ? '<div class="card"><p style="color:var(--text)">이번 주 스케줄이 확정 전이라 출근 예정을 모르고, 찍은 사람만 보여요.</p></div>' : ''}
      <div class="row" style="gap:8px;flex-wrap:wrap"><span class="pill ok">출근 ${cnt(/^출근$|^퇴근$/)}</span><span class="pill warn">지각 ${cnt(/지각/)}</span><span class="pill bad">미출근 ${cnt(/^미출근$/)}</span><span class="pill">출근 전 ${cnt(/^출근 전/)}</span></div>
      <div class="card list">${d.rows.length ? d.rows.map(r => `<div class="item" style="display:block;padding:12px 0">
        <div class="row between"><div><b style="font-size:17px">${esc(r.disp)}</b> <span class="small">${r.group === '정' ? '정' : '알바'}${r.expect ? ' · 예정 ' + esc(r.expect) : ''}</span></div><span class="pill ${pill(r.state)}">${esc(r.state)}</span></div>
        <div style="display:grid;grid-template-columns:${r.group === '정' && !r.in ? '1fr' : '1fr 1fr'};gap:8px;margin-top:8px">
          ${r.group === '정' && !r.in ? '' : `<div style="background:var(--card);border:1px solid ${r.late ? 'var(--warn)' : 'var(--line)'};border-radius:12px;padding:8px 12px"><div class="small">출근${r.late ? ' · <span style="color:var(--warn)">' + r.late + '분 늦음</span>' : ''}</div><div style="font-size:26px;font-weight:800;letter-spacing:1px;color:${r.in ? (r.late ? 'var(--warn)' : 'var(--text)') : 'var(--dim)'}">${esc(r.in || r.start || '--:--')}</div>${!r.in && r.start ? '<div class="small" style="color:var(--warn)">안 찍음 · 등록 시각으로 계산</div>' : ''}${r.in ? wf(r.inW) : ''}${r.blocked ? `<div class="small" style="color:var(--bad)">출근 막힘 ${r.blocked}번 (와이파이 아님)</div>` : ''}</div>`}
          <div style="background:var(--card);border:1px solid var(--line);border-radius:12px;padding:8px 12px"><div class="small">퇴근</div><div style="font-size:26px;font-weight:800;letter-spacing:1px;color:${r.out ? 'var(--ok)' : 'var(--dim)'}">${esc(r.out || '--:--')}</div>${r.out ? wf(r.outW) : ''}</div>
        </div></div>`).join('') : '<p class="small">오늘 근무 예정인 사람이 없어요.</p>'}</div>
      <div class="card"><b>⏰ 일찍 부르기</b><p class="small">오늘 정시보다 일찍 나오라고 한 알바를 미리 적어 두면 그 시각부터 계산돼요. (늦게 오면 찍은 시각부터)</p>
        <label>누구</label><select id="en"><option value="">불러오는 중…</option></select>
        <label>몇 시</label><input type="time" id="et" value="17:00" step="300">
        <button id="eb" style="margin-top:14px">등록</button></div>
      ${lvCard}${STEP2}</div>`);
    const g = document.getElementById('golv'); if (g) g.onclick = e => { e.preventDefault(); go('aleave'); };
    loadClock();
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
    const can = p => p.kind !== '새 폰' || ME.role === '사장님', nExc = list.filter(p => p.kind === '조기 출근').length;
    render(`<div>${header()}<h2>승인 대기 ${list.length}건</h2>
      ${nExc > 1 ? `<button id="all" style="margin-bottom:10px">조기 출근 ${nExc}건 전부 승인</button>` : ''}
      ${list.length ? list.map(p => `<div class="card"><div class="row between"><b>${esc(p.name)}</b><span class="pill warn">${esc(p.kind)}</span></div><p${p.warn ? ' class="chg" style="color:var(--bad)"' : ''}>${esc(p.when)} · ${esc(p.detail)}</p>
        ${can(p) ? `<div class="row" style="gap:8px;margin-top:8px"><button class="sm" data-id="${esc(p.id)}" data-ok="1">승인</button><button class="sm ghost" data-id="${esc(p.id)}" data-ok="">거절</button></div>` : '<p class="small">새 폰 승인은 사장님만 해요.</p>'}</div>`).join('')
        : `<div class="card empty">${bear('grill')}<p>처리할 게 없어요. 고기나 구우세요!</p></div>`}
      <p class="small">조기 출근 승인 = 그 시각부터 계산. 거절 = 정시부터. 새 가입 = 직원이 앱에 직접 가입한 것 — 본인이 아니면 거절(가입 지움). 확인 필요 = 매장 와이파이가 아니거나 혼자 퇴근한 기록.</p>${STEP2}</div>`);
    $app.querySelectorAll('[data-id]').forEach(b => b.onclick = () => busy(b, async () => {
      const ok = !!b.dataset.ok, j = /^acc/.test(b.dataset.id);
      const inf = /^inf/.test(b.dataset.id);
      if (!confirm(j ? (ok ? '본인이 가입한 게 맞나요? 승인할까요?' : '본인이 아니면 가입을 지워요(그 폰 로그인도 풀림). 지울까요?') : inf ? (ok ? (b.closest('.card').querySelector('p.chg') ? '⚠️ 급여 계좌가 바뀌어요.\n본인에게 직접(얼굴 보고·전화로) 확인했나요? 승인할까요?' : '직원명부에 이 정보를 넣을까요?') : '이 정보 변경을 거절할까요?') : ok ? '승인할까요?' : '거절할까요?')) return;
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
      <p class="small">출퇴근 기록·시급·매출로 계산한 값이에요. 정직원 인건비는 23시가 지나야 그날을 넣어요.</p></div>`);
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
        <p class="small" style="margin-top:8px">이미 값이 있는 날은 바꿀지 한 번 더 물어봐요.</p></div>
      <div class="card"><div class="row" style="gap:22px"><div><div class="small">이번 달 합계</div><div class="big" style="font-size:22px">${won(s.monthTotal)}</div></div>
        <div><div class="small">하루 평균${s.days ? ' (' + s.days + '일)' : ''}</div><div class="big" style="font-size:22px">${won(s.avg || 0)}</div></div></div></div>
      <div class="card list">${s.list.length ? s.list.map(x => `<div class="item"><span${x.dow === '토' ? ' style="color:#9cc3ff"' : x.dow === '일' ? ' style="color:var(--bad)"' : ''}>${esc(x.label)}</span>${x.missing ? '<span class="small" style="color:var(--warn)">입력 안 됨</span>' : '<b>' + won(x.amount) + '</b>'}</div>`).join('') : '<p class="small">이번 달 매출 기록이 아직 없어요.</p>'}</div>
      <p class="small">이번 달 1일부터 오늘까지예요. 하루 평균은 입력된 날만으로 계산해요.</p></div>`);
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
      ${sent.length ? `<div class="card list">${sent.map(r => `<div class="item"><span>${esc(r.disp)}</span><span class="row" style="gap:8px"><span class="small">${esc(r.at)} 보냄</span>${f.open ? `<button class="sm ghost" data-del="${esc(r.name)}" data-disp="${esc(r.disp)}" style="width:auto;margin:0">삭제</button>` : ''}</span></div>`).join('')}</div>` : ''}
      <p class="small">✕ = 못 나오는 날. 가능 = 그날 나올 수 있는 알바 수 / 필요한 알바 수. 같은 사람이 여러 번 내면 마지막 것만 써요. 근무표는 더보기 → 근무표 짜기에서 짜요.</p></div>`);
    const cp = document.getElementById('cp');
    if (cp) cp.onclick = async () => { try { await navigator.clipboard.writeText(msg); toast('복사했어요. 단톡방에 붙여 넣으세요'); } catch (e) { prompt('아래 글을 길게 눌러 복사하세요', msg); } };
    document.querySelectorAll('[data-del]').forEach(b => b.onclick = () => {
      if (!confirm(b.dataset.disp + ' 휴무신청을 지울까요?\n지우면 "미신청(모든 요일 가능)"으로 돌아가고, 본인이 마감 전에 다시 낼 수 있어요.')) return;
      busy(b, async () => { const r = await API.leaveDel(b.dataset.del); toast(r.msg); if (r.saved) VIEWS.aleave(); });
    });
  };

  // ---------- 관리: 입사 · 퇴사 (결산 직원명부·월말근무내역·월말결제에 바로 반영) ----------
  VIEWS.astaff = async function () {
    loading(); PEOPLE = null; const list = await people(), td = (ME.today && ME.today.date) || '';
    render(`<div>${header()}<h2>입사 · 퇴사</h2>
      <div class="card"><b>🙋 새 알바 입사</b>
        <label>이름 (성까지)</label><input id="sn" placeholder="예: 홍길동" autocomplete="off">
        <label>스케줄에 보일 이름</label><input id="sd" placeholder="비우면 성 빼고 (예: 길동)" autocomplete="off">
        <div class="row" style="gap:10px"><div style="flex:1"><label>시급 (원)</label><input id="sw" inputmode="numeric" value="10,500"></div>
          <div style="flex:1"><label>정시 출근</label><input id="sp" type="time" value="18:00" step="300"></div></div>
        <label>최소 출근일 (주)</label><select id="sm">${[1, 2, 3, 4, 5].map(n => `<option ${n === 3 ? 'selected' : ''}>${n}</option>`).join('')}</select>
        <button id="sadd" style="margin-top:14px">입사 처리</button>
        <p class="small" style="margin-top:8px">입사 등록한 뒤 직원이 앱에서 [처음 가입]으로 같은 이름으로 가입하면 승인 탭에 떠요. 승인하면 시급·정시가 자동으로 들어가요. 계좌는 본인이 앱 "내 정보"로 넣어요.</p></div>
      <div class="card"><b>👋 퇴사</b>
        <label>누구</label><select id="rn"><option value="">이름 고르기</option>${opts(list.filter(p => p.name !== ME.name))}</select>
        <label>퇴사일 (마지막 근무일)</label><input type="date" id="rd" value="${td}">
        <button class="ghost" id="rdel" style="margin-top:14px">퇴사 처리</button>
        <p class="small" style="margin-top:8px">퇴사일까지는 그대로 일하고, 다음 날부터 근무표·휴무신청·앱 로그인에서 빠져요. 이번 달 급여·출퇴근 기록은 그대로 남아요.</p></div>
      </div>`);
    const $ = id => document.getElementById(id), sw = $('sw');
    sw.oninput = () => { const n = sw.value.replace(/[^\d]/g, ''); sw.value = n ? Number(n).toLocaleString('ko-KR') : ''; };
    $('sadd').onclick = e => busy(e.target, async () => {
      const name = $('sn').value.trim(), disp = $('sd').value.trim(), wage = Number(sw.value.replace(/[^\d]/g, '')), plain = $('sp').value, minDays = $('sm').value;
      if (!name) return toast('이름을 써 주세요');
      if (!confirm(`${name} · 시급 ${wage ? wage.toLocaleString('ko-KR') + '원' : '매장 기본'} · ${plain} 출근\n알바로 입사 등록할까요?`)) return;
      const r = await API.addStaff({ name, disp, wage, plain, minDays, kind: '알바' });
      if (!r.saved) return alert(r.msg);
      alert(r.msg + (r.detail ? '\n\n' + r.detail.join('\n') : '')); PEOPLE = null; VIEWS.astaff();
    });
    $('rdel').onclick = e => busy(e.target, async () => {
      const n = $('rn').value, d = $('rd').value;
      if (!n || !d) return toast('이름과 퇴사일을 골라 주세요');
      if (!confirm(`${n}님을 ${d} 퇴사로 넣을까요?\n앱 로그인도 막혀요.`)) return;
      const r = await API.removeStaff(n, d);
      if (!r.saved) return alert(r.msg);
      toast(r.msg); PEOPLE = null; VIEWS.astaff();
    });
  };

  // ---------- 관리: 알바 시급 (사장님만, 결산 직원명부 D) ----------
  VIEWS.awage = async function () {
    loading(); const d = await API.wages(), won = n => Number(n || 0).toLocaleString('ko-KR') + '원';
    render(`<div>${header()}<h2>알바 시급</h2>
      ${d.msg ? `<div class="card"><p>${esc(d.msg)}</p></div>` : ''}
      ${d.list.map((p, i) => `<div class="card"><div class="row between"><b>${esc(p.disp)}</b><span class="big" style="font-size:20px">${won(p.wage)}</span></div>
        ${p.next ? `<p class="small" style="margin-top:4px"><span class="pill warn">${Number(p.next.ym.slice(5))}월부터 ${won(p.next.wage)}</span>${p.next.reserved ? ` 예약 · <a href="#" data-cancel="${esc(p.name)}" style="color:var(--sub)">취소</a>` : ' (다음 달 파일)'}</p>` : ''}
        <div class="row" style="gap:8px;margin-top:10px"><input id="w${i}" inputmode="numeric" placeholder="새 시급" style="flex:1;margin:0"><select id="s${i}" style="width:auto;margin:0"><option value="now">이번 달부터</option><option value="next">다음 달부터</option></select><button class="sm" data-i="${i}" style="width:auto;margin:0">바꾸기</button></div></div>`).join('')}
      <p class="small">이번 달부터 = ${d.month}월 1일부터 다시 계산(지금까지 일한 시간도 새 시급). 다음 달부터 = ${d.nextMonth}월 1일부터. 근무 시간·주휴·정산표는 알아서 따라가요.</p></div>`);
    d.list.forEach((p, i) => { const el = document.getElementById('w' + i); el.oninput = () => { const n = el.value.replace(/[^\d]/g, ''); el.value = n ? Number(n).toLocaleString('ko-KR') : ''; }; });
    $app.querySelectorAll('[data-i]').forEach(b => b.onclick = () => busy(b, async () => {
      const p = d.list[+b.dataset.i], w = Number(document.getElementById('w' + b.dataset.i).value.replace(/[^\d]/g, ''));
      if (!w) return toast('새 시급을 넣어 주세요');
      const when = document.getElementById('s' + b.dataset.i).value;
      if (!confirm(`${p.disp}  ${won(p.wage)} → ${won(w)}
${when === 'now' ? d.month + '월 1일부터 (이번 달 전체 다시 계산)' : d.nextMonth + '월 1일부터 (예약)'}
바꿀까요?`)) return;
      const r = await API.setWage(p.name, w, when); r.saved ? alert(r.msg) : alert(r.msg); VIEWS.awage();
    }));
    $app.querySelectorAll('[data-cancel]').forEach(a => a.onclick = e => { e.preventDefault(); busy(a, async () => { if (!confirm(a.dataset.cancel + ' 시급 예약을 취소할까요?')) return; const r = await API.cancelWage(a.dataset.cancel); toast(r.msg); VIEWS.awage(); }); });
  };

  // ---------- 관리: 직원 계정 (임시 비밀번호) ----------
  VIEWS.aacc = async function () {
    loading(); const list = await API.accounts();
    render(`<div>${header()}<h2>직원 계정</h2>
      <div class="card list">${list.map(a => `<div class="item"><div><b>${esc(a.name)}</b> <span class="small">${a.role !== '직원' ? esc(a.role) + ' · ' : ''}${a.joined ? (a.pend ? '<span style="color:var(--warn)">새 가입(확인 전)</span>' : '가입함') + (a.last ? ' · 마지막 ' + esc(a.last.slice(5)) : '') : '<span style="color:var(--warn)">미가입</span>'}</span></div>
        <button class="sm ghost" data-n="${esc(a.name)}">임시 비번</button></div>`).join('')}</div>
      <p class="small">처음 가입은 직원이 앱에서 [처음 가입]으로 직접 해요(가입하면 승인 탭에 "새 가입"으로 떠요). [임시 비번]은 비밀번호를 잊은 직원용 — 나온 6자리를 1:1로 알려 주면 직원이 로그인 칸에 넣고 새 번호로 바꿔요(사장님도 직원 비밀번호는 몰라요). 임시 비밀번호는 사장님만 만들 수 있어요.</p></div>`);
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
          <div class="big" style="font-size:44px;letter-spacing:8px;margin:10px 0">${esc(r.code)}</div><p class="small">이 번호로 로그인하면 본인 번호로 바꾸게 돼요. 지금 비밀번호는 더 이상 안 돼요. 이 화면을 나가면 다시 볼 수 없어요.</p></div>
          <button class="ghost" id="bk">목록으로</button></div>`);
        document.getElementById('bk').onclick = () => VIEWS.aacc();
      } catch (e) { toast(e.message); b.disabled = false; }
    });
  };

  // ---------- 관리: 직원 설정 (새 앱: 산성 직원명부 K~Q — 표시이름·구분·정시·고정휴무·최소출근일·우선배정·주휴) ----------
  VIEWS.acfg = async function () {
    loading(); const list = await API.staffCfg(), DAYS = ['월', '화', '수', '목', '금', '토', '일'];
    const sum = a => [a.kind, a.start && a.start + ' 출근', a.offDays.length ? a.offDays.join('·') + ' 고정휴무' : '', a.kind === '알바' && a.minDays != null ? '최소 ' + a.minDays + '일' : '', a.sgroup === '정' && a.kind === '알바' ? '근무표 정 그룹' : '', a.priority ? '우선배정' : '', a.noJuhu ? '주휴 없음' : ''].filter(Boolean).join(' · ');
    render(`<div>${header()}<h2>직원 설정</h2>
      <div class="card list">${list.map((a, i) => `<a class="item" href="#" data-i="${i}" style="color:inherit;text-decoration:none"><div><b>${esc(a.disp || a.name)}</b>${a.disp ? ` <span class="small">(${esc(a.name)})</span>` : ''}<div class="small">${esc(sum(a))}${a.noLogin ? ' · 근무표 전용' : ''}</div></div><span class="small">›</span></a>`).join('')}</div>
      <p class="small">근무표 자동 짜기와 급여 계산에 쓰는 정보예요. 사장님만 고칠 수 있어요.</p>
      <div class="card"><b>근무표에만 넣을 사람</b><div class="small">앱에 로그인하지 않지만 근무표 정 그룹에 나와야 하는 사람 (예: 사장님 본인). 출퇴근·급여 목록엔 안 나와요.</div>
        <div class="row" style="gap:6px;margin-top:8px"><input id="nn" maxlength="20" placeholder="이름 (예: 홍길동)" style="flex:1"><select id="nk" style="width:auto"><option>정직원</option><option>반직원</option></select></div>
        <button class="ghost" id="nadd" style="margin-top:8px">근무표에 넣기</button></div></div>`);
    $app.querySelectorAll('[data-i]').forEach(el => el.onclick = e => { e.preventDefault(); edit(list[+el.dataset.i]); });
    document.getElementById('nadd').onclick = e => busy(e.target, async () => { const r = await API.addNoLogin(document.getElementById('nn').value, document.getElementById('nk').value); toast(r.msg); if (r.saved) VIEWS.acfg(); });
    function edit(a) {
      render(`<div>${header()}<h2>${esc(a.name)}</h2><div class="card">
        <label>표시이름 (근무표에 보이는 이름, 비우면 이름 그대로)</label><input id="cd" maxlength="10" value="${esc(a.disp)}" placeholder="예: 길동">
        <label>구분</label><select id="ck">${(a.noLogin ? ['정직원', '반직원'] : ['정직원', '반직원', '알바']).map(k => `<option${k === a.kind ? ' selected' : ''}>${k}</option>`).join('')}</select>
        <label>정시 출근 (비우면 매장 기본)</label><input id="cs" type="time" step="300" value="${esc(a.start)}">
        <label>고정휴무 요일</label><div class="row" style="flex-wrap:wrap;gap:6px">${DAYS.map(d => `<label style="display:inline-flex;align-items:center;gap:4px;margin:0"><input type="checkbox" data-d="${d}"${a.offDays.includes(d) ? ' checked' : ''} style="width:auto">${d}</label>`).join('')}</div>
        <div id="calba"><label>근무표 그룹</label><select id="cg"><option value="">알 그룹 (스케줄 알바)</option><option value="정"${a.sgroup === '정' ? ' selected' : ''}>정 그룹 (고정 근무 — 급여는 시급, 휴무신청 안 받음)</option></select>
        <label>최소출근일 (한 주, 비우면 매장 기본)</label><input id="cm" type="number" min="0" max="7" value="${a.minDays == null ? '' : a.minDays}">
        <label style="display:flex;align-items:center;gap:6px"><input type="checkbox" id="cp" style="width:auto"${a.priority ? ' checked' : ''}>우선배정 (다른 알바보다 조금 더)</label></div>
        <label style="display:flex;align-items:center;gap:6px"><input type="checkbox" id="cj" style="width:auto"${a.noJuhu ? ' checked' : ''}>주휴수당 없음 (계약상 미포함)</label>
        <button id="csv" style="margin-top:16px">저장</button></div>
        ${a.noLogin ? '<button class="ghost" id="cdel">근무표에서 빼기</button>' : ''}
        <button class="ghost" id="cbk">목록으로</button></div>`);
      const $ = id => document.getElementById(id), alba = () => { $('calba').hidden = $('ck').value !== '알바'; };
      $('ck').onchange = alba; alba(); $('cbk').onclick = () => VIEWS.acfg();
      if ($('cdel')) $('cdel').onclick = () => busy($('cdel'), async () => { if (!confirm(a.name + '님을 근무표에서 뺄까요?')) return; toast((await API.removeNoLogin(a.name)).msg); VIEWS.acfg(); });
      $('csv').onclick = () => busy($('csv'), async () => {
        const o = { disp: $('cd').value, kind: $('ck').value, start: $('cs').value, offDays: [...$app.querySelectorAll('[data-d]')].filter(x => x.checked).map(x => x.dataset.d),
          minDays: $('ck').value === '알바' ? $('cm').value : null, priority: $('ck').value === '알바' && $('cp').checked, noJuhu: $('cj').checked, sgroup: $('ck').value === '알바' ? $('cg').value : '' };
        const r = await API.saveStaffCfg(a.name, o); toast(r.msg); if (r.saved) VIEWS.acfg();
      });
    }
  };

  // ---------- 관리: 스케줄 규칙 (새 앱: 산성 스케줄 "설정" 시트와 같은 칸, 사장님만) ----------
  VIEWS.asched = async function () {
    loading(); const { cfg, jung } = await API.schedCfg(), D = ['월', '화', '수', '목', '금', '토', '일'];
    const row = (id, arr, ph) => `<tr><td class="name">${ph}</td>${D.map((d, i) => `<td><input type="number" min="0" max="50" inputmode="numeric" data-r="${id}" data-i="${i}" value="${arr[i] == null ? '' : arr[i]}" style="padding:8px 2px;text-align:center"></td>`).join('')}</tr>`;
    const pairs = [...cfg.pairs, ...Array(Math.max(0, 5 - cfg.pairs.length)).fill({ a: '', b: '' })].slice(0, 10);
    const sel = (v, k, i) => `<select data-p="${k}" data-i="${i}" style="flex:1"><option value="">-</option>${jung.map(n => `<option${n === v ? ' selected' : ''}>${esc(n)}</option>`).join('')}</select>`;
    render(`<div>${header()}<h2>스케줄 규칙</h2>
      <div class="card scroll"><table><tr><th class="name"></th>${D.map(d => `<th>${d}</th>`).join('')}</tr>
        ${row('min', cfg.min, '최소(정+알)')}${row('max', cfg.max, '최대(정+알)')}${row('alba', cfg.alba, '알바 고정')}</table>
        <p class="small">알바 고정에 숫자가 있는 요일은 정+알 대신 "그날 정 그룹 출근 수 + 알바 N명"으로 맞춰요. 비우면 정+알 기준.</p></div>
      <div class="card"><b>동시휴무 금지 (정 그룹)</b>${pairs.map((p, i) => `<div class="row" style="gap:6px;margin-top:6px">${sel(p.a, 'a', i)}<span>+</span>${sel(p.b, 'b', i)}</div>`).join('')}
        <p class="small">두 사람이 같은 날 함께 쉬면 자동 짜기가 멈추고 알려 줘요.</p></div>
      <div class="card"><label>과인원 넣는 순서</label><input id="so" value="${esc(cfg.overflow.join(', '))}" placeholder="토, 금, 목, 토 오전, 일 오전">
        <p class="small">최소출근일 때문에 인원이 넘칠 때 이 순서로 넣어요. 오전은 오전 가능하다고 한 사람만.</p>
        <label>최소출근일 기본 (알바, 한 주)</label><input id="sd" type="number" min="0" max="7" value="${cfg.defMin}">
        <p class="small">직원 설정에 따로 적은 사람은 그 값을 써요.</p></div>
      <button id="ssv">저장</button></div>`);
    const val = id => D.map((_, i) => document.querySelector(`[data-r="${id}"][data-i="${i}"]`).value);
    document.getElementById('ssv').onclick = e => busy(e.target, async () => {
      const ps = pairs.map((_, i) => ({ a: document.querySelector(`[data-p="a"][data-i="${i}"]`).value, b: document.querySelector(`[data-p="b"][data-i="${i}"]`).value }));
      const r = await API.saveSchedCfg({ min: val('min'), max: val('max'), alba: val('alba'), pairs: ps, overflow: document.getElementById('so').value, defMin: document.getElementById('sd').value });
      toast(r.msg);
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
      <p class="small">퇴근을 안 찍은 날이나 잘못 찍힌 날을 고쳐요. 고친 사람은 기록에 남아요. 정직원은 퇴근만 넣어요.</p>${STEP2}</div>`);
    const $ = id => document.getElementById(id);
    const kind = () => { $('fsw').hidden = $('fk').value !== 'sub'; };
    $('fk').onchange = kind;
    const look = async () => {
      if (!$('fn')) return;   // 새 앱: 화면을 벗어났으면 그만
      const n = $('fn').value, d = $('fd').value, p = list.find(x => x.name === n);
      $('fin').hidden = p ? !p.alba : false;
      if (!n || !d) return;
      $('fs').textContent = '불러오는 중…';
      try {
        const r = await API.lookup(n, d);
        if (!$('fs')) return;
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
        <a class="item" href="#" data-go="astaff" style="color:inherit;text-decoration:none"><span>👥 입사 · 퇴사</span><span class="small">›</span></a>
        ${ME.role === '사장님' ? '<a class="item" href="#" data-go="awage" style="color:inherit;text-decoration:none"><span>💰 알바 시급</span><span class="small">›</span></a>' : ''}
        ${ME.role === '사장님' && API.staffCfg ? '<a class="item" href="#" data-go="acfg" style="color:inherit;text-decoration:none"><span>🗂️ 직원 설정 (표시이름·고정휴무·최소출근일)</span><span class="small">›</span></a><a class="item" href="#" data-go="asched" style="color:inherit;text-decoration:none"><span>📐 스케줄 규칙 (인원·동시휴무·과인원)</span><span class="small">›</span></a>' : ''}
        <a class="item" href="#" data-go="aacc" style="color:inherit;text-decoration:none"><span>🔑 직원 계정 · 임시 비밀번호</span><span class="small">›</span></a>
        <a class="item" href="#" data-go="aleave" style="color:inherit;text-decoration:none"><span>📝 휴무신청 현황</span><span class="small">›</span></a>
        <a class="item" href="#" data-go="sched" style="color:inherit;text-decoration:none"><span>📅 이번 주 근무표</span><span class="small">›</span></a>
        <a class="item" href="#" data-go="rec" style="color:inherit;text-decoration:none"><span>⏱️ 내 출퇴근 기록</span><span class="small">›</span></a>
        <a class="item" href="#" data-go="info" style="color:inherit;text-decoration:none"><span>👤 내 정보 (계좌·이메일)</span><span class="small">›</span></a>
      </div>
      ${window.EXTRA ? EXTRA.html(ME) : ''}
      <div class="card row between" id="pushcard" style="display:flex"><div><b>🔔 폰 알림</b><div class="small" id="pushst">휴무신청 열림 · 마감 1시간 전 알림</div></div><button class="sm" id="pushbtn" style="width:auto;margin:0">알림 받기</button></div>
      ${backup()}</div>`);
    $app.querySelectorAll('[data-go]').forEach(a => a.onclick = e => { e.preventDefault(); go(a.dataset.go); });
    if (window.EXTRA) EXTRA.wire(ME, () => go('amore'));  // 새 앱: 산성에 없던 화면
    pushCard();
  };

  // ---------- 시작 ----------
  // 새 버전 바로 받기: 서비스 워커를 캐시 없이 확인하고, 앱을 다시 볼 때마다 새 버전 검사 → 바뀌면 한 번 새로고침
  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    const had = !!navigator.serviceWorker.controller;
    navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' }).then(reg => {
      document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') reg.update().catch(() => {}); });
    }).catch(() => {});
    navigator.serviceWorker.addEventListener('controllerchange', () => { if (had) newVer(); });
  }
  // 새 버전 알림 (11/19): version.json을 앱 열 때·다시 볼 때·30분마다 확인 → 띠 [새로고침]. 입력 중 갑자기 새로고침되지 않게 누를 때만
  const APP_VER = 30;
  function newVer() {
    if (document.getElementById('nv')) return;
    const d = document.createElement('div'); d.id = 'nv';
    d.style.cssText = 'position:fixed;left:12px;right:12px;top:calc(env(safe-area-inset-top,0px) + 10px);z-index:999;background:var(--wine);color:#fff;border-radius:14px;padding:12px 14px;display:flex;align-items:center;justify-content:space-between;gap:10px;box-shadow:0 6px 20px rgba(0,0,0,.35);font-size:15px';
    d.innerHTML = '<span>✨ 새 버전이 있어요</span><button class="sm" style="background:#fff;color:var(--wine);width:auto;margin:0">새로고침</button>';
    d.querySelector('button').onclick = async () => {
      try { const ks = await caches.keys(); await Promise.all(ks.map(k => caches.delete(k))); } catch (e) {}
      try { const rg = await navigator.serviceWorker.getRegistration(); if (rg) await rg.update(); } catch (e) {}
      location.reload();
    };
    document.body.appendChild(d);
  }
  function checkVer() {
    if (location.protocol === 'file:') return;
    fetch('version.json?t=' + Date.now(), { cache: 'no-store' }).then(r => r.ok ? r.json() : null).then(j => { if (j && Number(j.v) > APP_VER) newVer(); }).catch(() => {});
  }
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') checkVer(); });
  setInterval(() => { if (document.visibilityState === 'visible') checkVer(); }, 30 * 60000);
  setTimeout(checkVer, 3000);
  splash();
  setTimeout(start, 900);
})();
