// 사장님·매니저 화면 데이터 (산성 data-live.js의 관리용 API와 같은 이름) — 다음 단계에서 채움
const todo = name => async () => { throw new Error(name + ' 화면은 준비 중이에요'); };
for (const n of ['adminToday', 'pending', 'leaveAll', 'dashboard', 'sales', 'accounts', 'issueCode', 'issueAll', 'saveSales', 'leaveDel', 'people', 'early',
  'decide', 'decideAll', 'manual', 'lookup', 'addStaff', 'wages', 'setWage', 'cancelWage', 'removeStaff']) window.API[n] = todo(n);
