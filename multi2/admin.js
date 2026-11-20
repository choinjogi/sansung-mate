// 사장님·매니저 화면 데이터 — 산성 data-live.js의 관리용 API와 같은 이름·모양을 Firebase로 만든다.
// 산성은 결산 시트·NFC를 읽었지만, 여기서는 새 앱 데이터(Firestore)와 계산(multi/*.js)을 쓴다.
import * as api from '../multi/fb.js?v=22';
import * as sched from '../multi/sched.js?v=22';
import * as pay from '../multi/pay.js?v=22';
import * as dash from '../multi/dash.js?v=22';
import * as staff from '../multi/staff.js?v=22';
import { wageOf } from '../multi/paycalc.js?v=22';

const A = window.API, DOW = ['일', '월', '화', '수', '목', '금', '토'];
const md = d => `${+d.slice(5, 7)}/${+d.slice(8)}`;
const lab = d => `${md(d)} ${DOW[api.dowOf(d)]}`;
const toM = s => (s ? +s.slice(0, 2) * 60 + +s.slice(3, 5) : null);
const isWork = c => c === 'O' || c === '오전' || c === 'O+오전';
const when = ts => (ts && ts.toDate ? api.fmtWhen(ts.toDate()) : '');
const ctx = () => A._ctx();
const admin = async () => { const c = await ctx(); if (!c.role) throw new Error('사장님·매니저만 볼 수 있어요'); return c; };
const owner = async () => { const c = await ctx(); if (c.role !== '사장님') throw new Error('사장님만 할 수 있어요'); return c; };
async function staffList(c) { return (await api.members(c.store.id)).filter(m => api.isActive(m)).sort((a, b) => (a.name < b.name ? -1 : 1)); }
async function byName(c, name) { const m = (await api.members(c.store.id)).find(x => x.name === name); if (!m) throw new Error(name + '님을 찾을 수 없어요'); return m; }

// ---------- 오늘 출근 현황 ----------
A.adminToday = async () => {
  const c = await admin(), t = api.kst(), d = t.date, mon = api.mondayOf(d), i = api.weekDates(mon).indexOf(d);
  const [ms, ps, rules, sch, mo] = await Promise.all([staffList(c), api.punchesBetween(c.store.id, d, d), api.rulesOf(c.store.id), api.getSchedule(c.store.id, mon),
    c.role === '사장님' ? pay.todayMoney(c.store).catch(() => null) : null]);
  const P = {}; ps.forEach(p => { (P[p.uid] = P[p.uid] || {})[p.kind] = p; });
  const pub = sch && sch.published, nowM = toM(t.hm), grace = (rules.current && rules.current.open.lateGraceMin) || 0;
  const wf = p => (!p ? '' : p.wifi ? 'ok' : p.flag && p.why !== 'alone' ? 'no' : '');
  const rows = ms.map(m => {
    const x = P[m.id] || {}, code = pub ? ((sch.cells || {})[m.id] || [])[i] || '' : '', work = isWork(code), alba = m.type !== '정';
    if (!work && !x.in && !x.out) return null;
    const plan = sched.todayPlan(sch, rules.current, m, d), expect = plan.start, inHm = x.in ? api.hmOf(x.in.at) : '', outHm = x.out ? api.hmOf(x.out.at) : '';
    const lateRaw = alba && inHm ? toM(inHm) - toM(expect) : 0, late = lateRaw > grace ? lateRaw : 0;
    const state = outHm ? '퇴근' : !alba ? '퇴근 전' : !work ? '스케줄 없음' : !inHm ? (nowM < toM(expect) ? '출근 전 ' + expect : '미출근') : late ? '지각 ' + late + '분' : '출근';
    return { disp: m.name, group: alba ? '알' : '정', in: inHm, out: outHm, state, expect: alba ? expect : '', late, start: alba && !inHm ? expect : '', inW: wf(x.in), outW: wf(x.out), blocked: 0 };
  }).filter(Boolean);
  return { label: `${md(d)} (${DOW[api.dowOf(d)]})`, covered: !!pub, rows, money: mo };
};

// ---------- 승인 대기: 새 가입 · 조기 출근 · ⚠ 확인 필요 · 내 정보(사장님) ----------
A.pending = async () => {
  const c = await admin(), t = api.kst();
  const [ms, hires, early, flags, priv] = await Promise.all([api.members(c.store.id), api.hiresOf(c.store.id), api.earlyWaiting(c.store.id).catch(() => []),
    api.flaggedSince(c.store.id, api.addDays(t.date, -31)).catch(() => []), c.role === '사장님' ? api.privAll(c.store.id).catch(() => []) : []]);
  const H = Object.fromEntries(hires.map(h => [h.id, h])), out = [], nameOf = id => (ms.find(m => m.id === id) || {}).name || '?';
  ms.filter(m => m.status === 'pending').forEach(m => { const h = H[api.nameKey(m.name)];
    out.push({ id: 'acc' + m.id, kind: '새 가입', name: m.name, when: when(m.joinedAt), detail: h ? `입사 등록됨 · ${h.type === '정' ? '정직원' : '알바'} · ${h.startDate ? md(h.startDate) + ' 입사' : '기존 직원'}` : '입사 등록 없음 — 본인 맞는지 꼭 확인' }); });
  early.forEach(p => out.push({ id: 'exc' + p.id, kind: '조기 출근', name: p.name, when: lab(p.date), detail: `${p.earlyReq.hm} 출근 (찍은 시각 ${api.hmOf(p.at)}) · 매장 요청이라고 답함` }));
  flags.filter(p => !p.reviewed).forEach(p => out.push({ id: 'flg' + p.id, kind: '확인 필요', name: p.name, when: lab(p.date),
    detail: `${p.kind === 'in' ? '출근' : '퇴근'} ${api.hmOf(p.at)} · ${p.why === 'alone' ? '확인 없이 혼자 퇴근' : '매장 와이파이 아님'} — 맞으면 승인, 시각이 틀렸으면 더보기 → 기록 고치기` }));
  priv.filter(p => p.req).forEach(p => {
    const r = p.req, chg = r.account && p.account && r.account.replace(/\D/g, '') !== p.account.replace(/\D/g, ''), mask = a => '••••' + String(a || '').replace(/\D/g, '').slice(-4);
    out.push({ id: 'inf' + p.id, kind: chg ? '계좌 변경' : '내 정보', name: nameOf(p.id), when: when(r.at), warn: !!chg,
      detail: [chg ? `⚠️ 계좌가 바뀌어요: ${p.bank || ''} ${mask(p.account)} → ${r.bank || p.bank || ''} ${mask(r.account)} (본인에게 직접 확인하고 승인)` : '', r.bank && !chg ? '은행 ' + r.bank : '', r.account && !chg ? '계좌 ' + mask(r.account) : '', r.email ? '이메일 입력' : ''].filter(Boolean).join(' · ') });
  });
  return out;
};
A.decide = async (id, ok) => {
  const c = await admin(), kind = id.slice(0, 3), key = id.slice(3);
  if (kind === 'acc') {
    const ms = await api.members(c.store.id), m = ms.find(x => x.id === key); if (!m) return { msg: '이미 처리됐어요' };
    if (!ok) { await api.removeMember(c.store.id, key); return { msg: '가입을 지웠어요' }; }
    const h = (await api.hiresOf(c.store.id)).find(x => x.id === api.nameKey(m.name)) || null;
    await staff.approveWithHire(c.store, m, h, c.role === '사장님'); return { msg: '승인했어요' };
  }
  if (kind === 'exc') {
    const p = (await api.earlyWaiting(c.store.id)).find(x => x.id === key); if (!p) return { msg: '이미 처리됐어요' };
    await api.decideEarly(c.store.id, p, ok); return { msg: ok ? '승인했어요. 그 시각부터 계산돼요' : '거절했어요. 정시부터 계산돼요' };
  }
  if (kind === 'flg') { await api.reviewPunch(c.store.id, key); return { msg: ok ? '확인했어요' : '확인 표시했어요. 시각은 더보기 → 기록 고치기에서 고쳐 주세요' }; }
  if (kind === 'inf') {
    if (c.role !== '사장님') return { warn: true, msg: '계좌·이메일은 사장님만 승인해요' };
    const p = (await api.privAll(c.store.id)).find(x => x.id === key); if (!p || !p.req) return { msg: '이미 처리됐어요' };
    await api.decidePrivate(c.store.id, p, ok); return { msg: ok ? '반영했어요' : '거절했어요' };
  }
  return { warn: true, msg: '알 수 없는 항목이에요' };
};
A.decideAll = async () => {
  const c = await admin(), list = await api.earlyWaiting(c.store.id);
  for (const p of list) await api.decideEarly(c.store.id, p, true);
  return { msg: `조기 출근 ${list.length}건을 승인했어요` };
};

// ---------- 휴무신청 현황 ----------
A.leaveAll = async () => {
  const c = await admin(), week = api.addDays(api.mondayOf(api.kst().date), 7), dates = api.weekDates(week);
  const [ms, lvs, setting, rules, st] = await Promise.all([staffList(c), api.leavesOf(c.store.id, week), api.leaveSetting(c.store.id), api.rulesOf(c.store.id), api.getSetting(c.store.id, 'staffing').catch(() => null)]);
  const need = (st && st.need) || (rules.current && rules.current.staffing && rules.current.staffing.need) || [4, 4, 4, 4, 4, 5, 5];
  const w = setting ? api.leaveWindow(week, setting) : null, now = new Date(), L = Object.fromEntries(lvs.map(l => [l.uid, l]));
  return { title: `${md(dates[0])} ~ ${md(dates[6])}`, open: !!w && now >= w.opens && now < w.closes, past: false, closes: w ? api.fmtWhen(w.closes) : '',
    days: dates.map(d => ({ date: d, label: lab(d), need: need[api.dowOf(d)] || 0 })),
    rows: ms.filter(m => m.type !== '정').map(m => { const l = L[m.id]; return { name: m.name, disp: m.name, sent: !!l, off: l ? l.off || [] : [], am: l ? l.am || [] : [], at: l ? when(l.at) : '' }; }) };
};
A.leaveDel = async name => {
  const c = await admin(), m = await byName(c, name), week = api.addDays(api.mondayOf(api.kst().date), 7);
  await api.F.deleteDoc(api.F.doc(api.db, `stores/${c.store.id}/leaves/${week}_${m.id}`));
  return { saved: true, msg: name + ' 휴무신청을 지웠어요' };
};

// ---------- 대시보드 ----------
A.dashboard = async () => {
  const c = await admin(), d = await dash.dashData(c.store, c.role === '사장님');
  return { head: [`${md(d.t.date)} ${d.t.hm} 기준`, `지난달 같은 기간(1~${d.day}일)과 비교`], rows: d.rows.map(r => [r.sec, r.label, r.val, r.pv, r.c, r.note || '']) };
};

// ---------- 매출 ----------
A.sales = async () => {
  const c = await admin(), t = api.kst(), ym = t.date.slice(0, 7), rows = await api.salesBetween(c.store.id, ym + '-01', t.date);
  const S = Object.fromEntries(rows.map(r => [r.date, +r.amount || 0])), list = [];
  for (let day = 1; day <= +t.date.slice(8); day++) { const d = `${ym}-${String(day).padStart(2, '0')}`; list.push({ date: d, label: lab(d), dow: DOW[api.dowOf(d)], amount: S[d] || 0, missing: !(d in S) }); }
  const got = list.filter(x => !x.missing), total = got.reduce((a, x) => a + x.amount, 0);
  return { list, monthTotal: total, days: got.length, avg: got.length ? Math.round(total / got.length) : 0 };
};
A.saveSales = async (date, amount, force) => {
  const c = await admin(), old = (await api.salesBetween(c.store.id, date, date))[0];
  if (old && +old.amount !== +amount && !force) return { confirm: true, msg: `${md(date)} 매출이 ${(+old.amount).toLocaleString()}원으로 들어가 있어요. ${(+amount).toLocaleString()}원으로 바꿀까요?` };
  await api.setSales(c.store.id, date, Math.round(+amount));
  return { saved: true, msg: `${md(date)} ${(+amount).toLocaleString()}원 저장했어요` };
};

// ---------- 사람 · 일찍 부르기 · 기록 고치기 ----------
A.people = async () => { const c = await admin(); return { list: (await staffList(c)).map(m => ({ name: m.name, disp: m.name, alba: m.type !== '정', group: m.type === '정' ? '정' : '알' })) }; };
A.early = async (name, wd, time) => {
  const c = await admin(), m = await byName(c, name), d = wd || api.kst().date;
  await api.setEarly(c.store.id, d, m.id, time);
  return { msg: `${name} ${md(d)} ${time} 출근으로 등록했어요` };
};
A.lookup = async (name, wd) => {
  const c = await admin(), m = await byName(c, name);
  const [pin, pout, sch, rules] = await Promise.all([api.punchDoc(c.store.id, wd, m.id, 'in'), api.punchDoc(c.store.id, wd, m.id, 'out'), api.getSchedule(c.store.id, api.mondayOf(wd)), api.rulesOf(c.store.id)]);
  if (!pin && !pout) return { found: false };
  const plan = sched.todayPlan(sch, rules.current, m, wd), inHm = pin ? api.hmOf(pin.at) : '';
  return { found: true, inTag: inHm, start: inHm && inHm > plan.start ? inHm : plan.start, out: pout ? api.hmOf(pout.at) : '', kind: (pout && pout.shift) || 'normal', sub: (pout && pout.subFor) || '' };
};
A.manual = async o => {
  const c = await admin(), m = await byName(c, o.name), d = o.wd;
  const [pin, pout] = await Promise.all([api.punchDoc(c.store.id, d, m.id, 'in'), api.punchDoc(c.store.id, d, m.id, 'out')]);
  if (o.inT) { const at = api.atOf(d, o.inT); pin ? await api.editPunch(c.store.id, pin.id, at) : await api.addPunch(c.store.id, { uid: m.id, name: m.name, date: d, kind: 'in', at }); }
  const inHm = o.inT || (pin ? api.hmOf(pin.at) : null), outAt = api.atOf(d, o.outT, inHm);
  if (pout) await api.editPunch(c.store.id, pout.id, outAt); else await api.addPunch(c.store.id, { uid: m.id, name: m.name, date: d, kind: 'out', at: outAt });
  await api.setShift(c.store.id, `${d}_${m.id}_out`, o.kind || 'normal', o.kind === 'sub' ? o.sub || '' : '');
  return { msg: `${o.name} ${md(d)} 저장했어요` };
};

// ---------- 직원 계정 · 임시 비밀번호 ----------
A.accounts = async () => {
  const c = await admin(), ms = (await api.members(c.store.id)).filter(m => !api.isGone(m)).sort((a, b) => (a.name < b.name ? -1 : 1));
  return ms.map(m => ({ name: m.name, role: m.role === 'manager' ? '매니저' : m.type === '정' ? '정직원' : '직원', joined: true, pend: m.status === 'pending', last: '' }));
};
A.issueCode = async name => {
  const c = await owner(), m = await byName(c, name), r = await api.resetPin(c.store.id, m.id);
  return { name, code: r.pin, hours: 0 };
};
A.issueAll = async () => ({ list: [], hours: 0 });

// ---------- 입사 · 퇴사 ----------
A.addStaff = async o => {
  const c = await admin(), ms = await api.members(c.store.id);
  if (ms.some(m => api.nameKey(m.name) === api.nameKey(o.name) && api.isActive(m))) return { saved: false, msg: '같은 이름의 직원이 이미 있어요' };
  await api.addHire(c.store.id, { name: o.name, type: o.kind === '정직원' ? '정' : '알', startTime: o.plain || null, startDate: o.startDate || null, ...(c.role === '사장님' && o.wage ? { wage: Math.round(+o.wage) } : {}) });
  return { saved: true, msg: `${o.name}님 입사 등록했어요.`, detail: ['직원이 앱에서 [처음 가입]으로 같은 이름으로 가입하면 ✅ 승인 탭에 "입사 등록됨"으로 떠요.', '승인하면 시급·정시가 자동으로 들어가요.'] };
};
A.removeStaff = async (name, date) => {
  const c = await admin(), m = await byName(c, name), today = api.kst().date;
  if (m.role === 'manager' && c.role !== '사장님') return { saved: false, msg: '매니저 퇴사는 사장님이 해요' };
  await api.setMember(c.store.id, m.id, date < today ? { leaveDate: date, status: 'left', leftAt: api.F.serverTimestamp() } : { leaveDate: date });
  return { saved: true, msg: `${name}님 ${md(date)} 퇴사로 넣었어요` };
};

// ---------- 알바 시급 (사장님) ----------
A.wages = async () => {
  const c = await owner(), now = api.month(), next = api.month(new Date(), 1);
  const [ms, ws, rules] = await Promise.all([staffList(c), api.wagesAll(c.store.id), api.rulesFor(c.store.id, now)]);
  const W = Object.fromEntries(ws.map(w => [w.id, w]));
  const list = ms.filter(m => m.type !== '정').map(m => {
    const cur = wageOf(W[m.id], now, rules, false), nx = ((W[m.id] || {}).history || []).find(h => h.from === next);
    return { name: m.name, disp: m.name, wage: cur || 0, next: nx ? { wage: nx.wage, ym: next, reserved: true } : null };
  });
  return { list, month: +now.slice(5), nextMonth: +next.slice(5) };
};
A.setWage = async (name, wage, w) => {
  const c = await owner(), m = await byName(c, name), from = w === 'next' ? api.month(new Date(), 1) : api.month();
  await api.setWage(c.store.id, m.id, from, Math.round(+wage));
  return { saved: true, msg: `${name} ${+from.slice(5)}월부터 ${(+wage).toLocaleString()}원` };
};
A.cancelWage = async name => {
  const c = await owner(), m = await byName(c, name);
  await api.setWage(c.store.id, m.id, api.month(new Date(), 1), null);
  return { msg: '예약을 취소했어요' };
};
