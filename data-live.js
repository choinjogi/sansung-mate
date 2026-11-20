// 실제 데이터: 앱 전용 서버(구글 Apps Script "산성 MATE 서버", 원본은 읽기만)를 부른다.
// 이 파일에는 이름·숫자가 없다. 로그인 열쇠는 이 폰에만 저장되고, 서버는 열쇠 없이는 아무것도 주지 않는다.
// 빠르게 보이기(버전 16): 보기 전용 화면은 이 폰에 저장해 둔 지난 값을 바로 보여 주고, 뒤에서 새 값을 받아 바뀌었으면 화면을 다시 그린다.
(function () {
  const URL = 'https://script.google.com/macros/s/AKfycbz5H1Q7qM2Ay1LR_XOl9jfw5tgBKjiohIIxjRcA8fV3qv7WgDVyZy_LMaBfk7Zd29CklA/exec';
  const TK = 'mate_token', CK = 'mate_c_';
  const ls = { get: k => { try { return localStorage.getItem(k); } catch (e) { return null; } }, set: (k, v) => { try { localStorage.setItem(k, v); } catch (e) {} },
    del: k => { try { localStorage.removeItem(k); } catch (e) {} } };
  const get = () => ls.get(TK);
  const clearCache = () => { try { Object.keys(localStorage).filter(k => k.indexOf(CK) === 0).forEach(k => localStorage.removeItem(k)); } catch (e) {} FRESH = {}; FLY = {}; };
  const set = v => { clearCache(); v ? ls.set(TK, v) : ls.del(TK); };

  async function raw(fn, args) {
    let r;
    try {
      r = await fetch(URL, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify({ fn, args: args || {}, token: get() }) });
    } catch (e) { throw new Error('인터넷 연결을 확인해 주세요'); }
    return r.json();
  }
  async function call(fn, args) {
    const j = await raw(fn, args);
    if (j.auth === false) { set(null); window.dispatchEvent(new Event('mate-logout')); throw new Error('다시 로그인해 주세요'); }
    if (!j.ok) throw new Error(j.err || '오류');
    return j;
  }

  // 보기 전용: 저장된 값이 있으면 바로 주고, 뒤에서 새로 받아 바뀌면 'mate-fresh' 알림. 20초 안에 받은 건 다시 안 받음
  const FRESH_MS = 20000;
  let FRESH = {}, FLY = {};
  function fetchFresh(fn) {
    if (FLY[fn]) return FLY[fn];
    const p = call(fn).then(j => {
      const s = JSON.stringify(j), old = ls.get(CK + fn);
      ls.set(CK + fn, s); FRESH[fn] = Date.now();
      if (old && old !== s) window.dispatchEvent(new CustomEvent('mate-fresh', { detail: fn }));
      return j;
    }).finally(() => { delete FLY[fn]; });
    FLY[fn] = p; return p;
  }
  function view(fn) {
    const s = ls.get(CK + fn);
    if (s && FRESH[fn] && Date.now() - FRESH[fn] < FRESH_MS) return Promise.resolve(JSON.parse(s));
    const p = fetchFresh(fn);
    if (s) { p.catch(() => {}); return Promise.resolve(JSON.parse(s)); }
    return p;
  }
  // 쓰기 뒤에는 저장값을 "오래됨"으로 → 다음 화면은 바로 보이되 새 값으로 다시 그려짐
  const write = (fn, args) => call(fn, args).finally(() => { FRESH = {}; });

  window.API = {
    demo: false,
    hasToken: () => !!get(),
    async login(name, pw) { const j = await raw('login', { name, pw }); if (j.ok && j.token) set(j.token); return j; },
    async register(name, pw) { const j = await raw('register', { name, pw }); if (j.ok && j.token) set(j.token); return j; },
    async signup(name, code, pw) { const j = await raw('signup', { name, code, pw }); if (j.ok && j.token) set(j.token); return j; },
    async logout() { try { await raw('logout'); } catch (e) {} set(null); },
    me: () => view('me'),
    schedule: () => view('schedule'),
    records: () => view('records'),
    leaveForm: () => call('leaveForm'),
    myInfo: () => call('myInfo'),
    saveInfo: o => write('saveInfo', o),
    adminToday: () => view('adminToday'),
    pending: () => view('pending').then(r => r.list),
    leaveAll: () => view('leaveAll'),
    dashboard: () => view('dashboard'),
    sales: () => call('sales'),
    accounts: () => call('accounts').then(r => r.list),
    issueCode: name => write('issueCode', { name }),
    issueAll: () => write('issueAll'),
    // 2단계 쓰기
    saveSales: (date, amount, force) => write('saveSales', { date, amount, force: !!force }),
    submitLeave: (name, off, am) => write('submitLeave', { off, am }),
    leaveDel: name => write('leaveDel', { name }),
    people: () => view('people'),
    early: (name, wd, time) => write('early', { name, wd, time }),
    decide: (id, ok) => write('decide', { id, ok }),
    decideAll: () => write('decideAll'),
    manual: o => write('manual', o),
    lookup: (name, wd) => call('lookup', { name, wd }),
    addStaff: o => write('addStaff', o),
    wages: () => call('wages', {}), setWage: (name, wage, when) => write('setWage', { name, wage, when }), cancelWage: name => write('cancelWage', { name }),
    pushMine: () => call('pushMine', {}), pushSub: s => call('pushSub', s), pushOff: s => call('pushOff', s), pushTest: () => call('pushTest', {}),
    removeStaff: (name, date) => write('removeStaff', { name, date }),
    // 앱 출퇴근 (11/20) — 기록은 NFC와 같은 곳에. w = 서명된 와이파이 주소
    clockStatus: () => call('clockStatus', {}),
    clock: (kind, w, alone) => write('clock', { kind, w, alone: !!alone }).then(j => j.r),
    clockEarly: (kind, time) => write('clockEarly', { kind, time }).then(j => j.r),
    clockShift: (kind, sub) => write('clockShift', { kind, sub }).then(j => j.r),
    // 미리 받아 두기 (다른 탭을 누르면 바로 보이게)
    prefetch: fns => fns.forEach((fn, i) => setTimeout(() => { if (!FRESH[fn] && get()) fetchFresh(fn).catch(() => {}); }, 800 + i * 400)),
  };
})();
