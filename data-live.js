// 실제 데이터: 앱 전용 서버(구글 Apps Script "산성 MATE 서버", 원본은 읽기만)를 부른다.
// 이 파일에는 이름·숫자가 없다. 로그인 열쇠는 이 폰에만 저장되고, 서버는 열쇠 없이는 아무것도 주지 않는다.
(function () {
  const URL = 'https://script.google.com/macros/s/AKfycbz5H1Q7qM2Ay1LR_XOl9jfw5tgBKjiohIIxjRcA8fV3qv7WgDVyZy_LMaBfk7Zd29CklA/exec';
  const TK = 'mate_token';
  const get = () => { try { return localStorage.getItem(TK); } catch (e) { return null; } };
  const set = v => { try { v ? localStorage.setItem(TK, v) : localStorage.removeItem(TK); } catch (e) {} };

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

  window.API = {
    demo: false,
    hasToken: () => !!get(),
    async login(name, pw) { const j = await raw('login', { name, pw }); if (j.ok && j.token) set(j.token); return j; },
    async signup(name, code, pw) { const j = await raw('signup', { name, code, pw }); if (j.ok && j.token) set(j.token); return j; },
    async logout() { try { await raw('logout'); } catch (e) {} set(null); },
    me: () => call('me'),
    schedule: () => call('schedule'),
    records: () => call('records'),
    leaveForm: () => call('leaveForm'),
    adminToday: () => call('adminToday'),
    pending: () => call('pending').then(r => r.list),
    leaveAll: () => call('leaveAll'),
    dashboard: () => call('dashboard'),
    sales: () => call('sales'),
    accounts: () => call('accounts').then(r => r.list),
    issueCode: name => call('issueCode', { name }),
    issueAll: () => call('issueAll'),
    // 2단계 쓰기
    saveSales: (date, amount, force) => call('saveSales', { date, amount, force: !!force }),
    submitLeave: (name, off, am) => call('submitLeave', { off, am }),
    people: () => call('people'),
    early: (name, wd, time) => call('early', { name, wd, time }),
    decide: (id, ok) => call('decide', { id, ok }),
    decideAll: () => call('decideAll'),
    manual: o => call('manual', o),
    lookup: (name, wd) => call('lookup', { name, wd }),
  };
})();
