// 시험용 데이터 — 원본 시트와 연결하지 않음. 나중에 이 파일 대신 구글 Apps Script(읽기 전용 API)를 부른다.
// API 모양은 그대로 두고 안쪽만 바꾸면 화면은 고칠 필요 없음.
(function () {
  const TODAY = '2026-11-18';  // 시험용 "오늘" (수)
  const DAYS = ['2026-11-16', '2026-11-17', '2026-11-18', '2026-11-19', '2026-11-20', '2026-11-21', '2026-11-22'];
  const DOW = ['월', '화', '수', '목', '금', '토', '일'];

  // 이번 주 근무표 (출력 시트와 같은 모양, 이름은 전부 가짜 — 깃허브 공개용). O = 근무, X = 휴무/불가, '' = 미배정, 오전 = 주말 오전 12~15시
  const ROSTER = [
    { name: '김민준', disp: '민준', group: '정', role: '사장님' },
    { name: '이서연', disp: '서연', group: '정', role: '매니저' },
    { name: '박지훈', disp: '지훈', group: '정' },
    { name: '아리아', disp: '아리아', group: '정' },
    { name: '최유나', disp: '유나', group: '정' },
    { name: '정하준', disp: '하준', group: '알' },
    { name: '강도윤', disp: '도윤', group: '알' },
    { name: '윤서아', disp: '서아', group: '알' },
    { name: '장시우', disp: '시우', group: '알' },
    { name: '임하은', disp: '하은', group: '알' },
    { name: '한지호', disp: '지호', group: '알' },
    { name: '오수아', disp: '수아', group: '알' },
    { name: '서준서', disp: '준서', group: '알' },
    { name: '신예린', disp: '예린', group: '알' },
  ];
  const WEEK = {
    김민준: 'OO OOOO', 이서연: 'O OOOOO', 박지훈: ' OOOOOO', 아리아: 'OXOOOOX', 최유나: 'OOO OOO',
    정하준: 'OOOXOXO', 강도윤: 'XXOOXOO', 윤서아: 'XXOXOXO', 장시우: 'OO XOO ', 임하은: 'OXOXOXX',
    한지호: 'XXXXXOX', 오수아: ' O OOAX', 서준서: 'XO OXOX', 신예린: 'O XXXOO',
  };
  const code = (n, i) => ({ O: 'O', X: 'X', A: '오전', ' ': '' })[WEEK[n][i]];

  // 이번 달 출퇴근 기록 (시험용)
  const REC = {
    정하준: [['11-02', '18:00', '22:05'], ['11-03', '18:00', '21:58'], ['11-05', '17:00', '22:10', '일찍 부름'], ['11-06', '18:00', '22:02'],
      ['11-09', '18:00', '22:30'], ['11-10', '18:00', '21:55'], ['11-12', '18:00', '22:00'], ['11-13', '18:00', '22:12'],
      ['11-15', '18:00', '22:20'], ['11-16', '18:00', '22:00'], ['11-17', '17:00', '22:14', '일찍 부름']],
  };

  const NOTICE = [
    { d: '11/18', t: 'NFC 출퇴근 1주 사용 중이에요. "퇴근 완료"가 안 뜨면 그때만 퇴근 폼을 내 주세요.' },
    { d: '11/21', t: '휴무신청은 금요일 0시에 열리고 토요일 밤 10시에 마감돼요.' },
  ];

  const PENDING = [
    { id: 'p1', kind: '조기 출근', name: '강도윤', when: '11/18 (수)', detail: '17:30 출근 (찍은 시각 17:28) · 매장 요청이라고 답함' },
    { id: 'p2', kind: '새 폰', name: '윤서아', when: '11/18 (수)', detail: '이미 등록된 폰이 있어요 (iPhone)' },
  ];

  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const md = d => Number(d.slice(5, 7)) + '/' + Number(d.slice(8));
  const mins = t => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };

  window.API = {
    demo: true,
    async roster() { await sleep(150); return ROSTER.map(p => ({ name: p.name, disp: p.disp, group: p.group, role: p.role || '' })); },

    async me(name) {
      await sleep(200);
      const p = ROSTER.find(x => x.name === name);
      const ti = DAYS.indexOf(TODAY);
      const week = DAYS.map((d, i) => ({ date: d, label: md(d) + ' ' + DOW[i], code: code(name, i), today: d === TODAY }));
      const t = week[ti];
      const today = { date: TODAY, label: md(TODAY) + ' ' + DOW[ti], code: t.code, start: p.group === '알' ? '18:00' : '', clock: name === '정하준' ? { in: '', out: '' } : null };
      return { name, disp: p.disp, group: p.group, role: p.role || '', today, week, notice: NOTICE, workDays: week.filter(w => w.code === 'O').length };
    },

    async schedule() {
      await sleep(200);
      const rows = ROSTER.map(p => ({ disp: p.disp, group: p.group, codes: DAYS.map((d, i) => code(p.name, i)) }));
      const count = DAYS.map((d, i) => {
        const j = rows.filter(r => r.group === '정' && r.codes[i] === 'O').length, a = rows.filter(r => r.group === '알' && r.codes[i] === 'O').length, am = rows.filter(r => r.codes[i] === '오전').length;
        return j + '+' + a + (am ? ' (오전' + am + ')' : '');
      });
      return { title: '11/16(월) – 11/22(일)', days: DAYS.map((d, i) => ({ label: Number(d.slice(8)) + ' ' + DOW[i], today: d === TODAY })), rows, count };
    },

    async records(name) {
      await sleep(200);
      const list = (REC[name] || []).map(([d, i, o, note]) => ({ date: md('2026-' + d), in: i, out: o, mins: mins(o) - mins(i), note: note || '' }));
      return { month: '11월', list, total: list.reduce((a, r) => a + r.mins, 0) };
    },

    async leaveForm(name) {
      await sleep(150);
      const next = ['2026-11-23', '2026-11-24', '2026-11-25', '2026-11-26', '2026-11-27', '2026-11-28', '2026-11-29'];
      const saved = JSON.parse(localStorage.getItem('mate_leave_' + name) || 'null');
      return { open: true, closes: '11/21(토) 22:00', days: next.map((d, i) => ({ date: d, label: md(d) + ' ' + DOW[i] })), saved };
    },
    async submitLeave(name, off, am) {
      await sleep(400);
      localStorage.setItem('mate_leave_' + name, JSON.stringify({ off, am, at: new Date().toLocaleString('ko-KR') }));
      return { ok: true };
    },

    // ----- 관리 -----
    async adminToday() {
      await sleep(250);
      const ti = DAYS.indexOf(TODAY);
      const st = { 정하준: ['17:52', ''], 강도윤: ['17:28', ''], 윤서아: ['', ''], 임하은: ['18:06', ''], 아리아: ['17:58', ''] };
      const rows = ROSTER.filter(p => code(p.name, ti) === 'O').map(p => {
        const s = st[p.name] || ['', ''];
        const alba = p.group === '알' || p.name === '아리아';  // 아리아는 정 그룹이지만 출근·퇴근 둘 다 찍음
        const late = alba && s[0] && mins(s[0]) > mins('18:00');
        return { disp: p.disp, group: alba ? '알' : '정', in: s[0], out: s[1], state: !alba ? '퇴근만 찍음' : !s[0] ? '미출근' : late ? '지각 ' + (mins(s[0]) - 1080) + '분' : '출근' };
      });
      return { label: md(TODAY) + ' (수)', rows };
    },
    async pending() { await sleep(200); return PENDING.slice(); },
    async decide(id, ok) { await sleep(300); const i = PENDING.findIndex(p => p.id === id); if (i >= 0) PENDING.splice(i, 1); return { ok: true, msg: ok ? '승인했어요' : '거절했어요' }; },
    async addEarly(name, time) { await sleep(300); return { ok: true, msg: name + ' 오늘 ' + time + ' 출근으로 등록했어요' }; },
    async manualRecord(name, date, inT, outT) { await sleep(400); return { ok: true, msg: name + ' ' + date + ' ' + (inT || '정시') + '~' + outT + ' 저장했어요 (시험이라 실제로는 안 들어가요)' }; },
    // 대시보드 (⚠️ 시험용 가짜 숫자 — 실제 결산 숫자는 깃허브에 올라가면 안 되므로 넣지 않음)
    async dashboard() {
      await sleep(250);
      return {
        asOf: '11/18(수) 03:55', period: '11/1~11/17', prevPeriod: '10/1~10/17',
        rows: [
          { k: '현재까지 매출', v: 31500000, p: 34000000, up: true },
          { k: '이번 달 예상 매출', v: 57000000, p: 62000000, up: true, note: '지난달 전체' },
          { k: '하루 평균 매출', v: 1850000, p: 2000000, up: true },
          { k: '현재까지 알바 인건비', v: 2700000, p: 3200000, up: false },
          { k: '현재까지 정직원 인건비', v: 6800000, p: 6300000, up: false },
          { k: '현재까지 총 인건비', v: 9500000, p: 9500000, up: false },
          { k: '이번 달 예상 총 인건비', v: 17000000, p: 18000000, up: false, note: '지난달 전체' },
        ],
        rate: [{ k: '알바비 비율', v: 8.6, p: 9.4 }, { k: '총 인건비 비율', v: 30.2, p: 27.9 }],
        late: '2회 · 7분', lateTop: '준서 1회 4분, 예린 1회 3분', issues: 18, dup: 0,
      };
    },
    async sales() {
      await sleep(200);
      const saved = JSON.parse(localStorage.getItem('mate_sales') || '{}');
      const base = { '2026-11-11': 1720000, '2026-11-12': 1650000, '2026-11-13': 1980000, '2026-11-14': 2650000, '2026-11-15': 2910000, '2026-11-16': 2200000, '2026-11-17': 1530000 };
      const all = Object.assign(base, saved);
      const list = Object.keys(all).sort().reverse().slice(0, 7).map(d => ({ date: d, label: md(d) + ' ' + DOW[(new Date(d + 'T12:00:00').getDay() + 6) % 7], amount: all[d] }));
      return { list, monthTotal: 31500000 + Object.values(saved).reduce((a, b) => a + b, 0), lastDate: list[0] ? list[0].date : '' };
    },
    async saveSales(date, amount) {
      await sleep(400);
      const saved = JSON.parse(localStorage.getItem('mate_sales') || '{}'); saved[date] = amount;
      localStorage.setItem('mate_sales', JSON.stringify(saved));
      return { ok: true, msg: md(date) + ' 매출 ' + amount.toLocaleString('ko-KR') + '원 저장했어요 (시험)' };
    },
  };
})();
