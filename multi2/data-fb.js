// 새 앱(여러 매장용) = 산성 앱 화면(app.js) 그대로 + 데이터만 Firebase.
// 산성 앱의 data-live.js(구글 시트 서버)와 같은 window.API 43개를 여기서 Firebase·Cloudflare 서버로 대신 만든다.
// 화면(app.js)은 산성 앱 것을 거의 그대로 쓰고, 매장 고르기·사장님 구글 로그인만 조금 붙였다.
import * as api from '../multi/fb.js?v=20';
import * as records from '../multi/records.js?v=20';
import * as sched from '../multi/sched.js?v=20';
import { albaPay, wageOf, weekNo } from '../multi/paycalc.js?v=20';
import { PUSH_KEY } from '../multi/config.js?v=20';

const ls = { get: k => { try { return localStorage.getItem(k); } catch (e) { return null; } }, set: (k, v) => { try { localStorage.setItem(k, v); } catch (e) {} }, del: k => { try { localStorage.removeItem(k); } catch (e) {} } };
const DOW = ['일', '월', '화', '수', '목', '금', '토'];
const md = d => `${+d.slice(5, 7)}/${+d.slice(8)}`;
const lab = d => `${md(d)} ${DOW[api.dowOf(d)]}`;
const toSansung = c => (c === 'O+오전' ? '오전+오후' : c || '');           // 근무표 칸 이름을 산성 앱 것으로
const isWork = c => c === 'O' || c === '오전' || c === 'O+오전';
const err = (msg, extra) => Object.assign(new Error(msg), extra || {});

// ---------- 매장 · 로그인 상태 ----------
let CUR = null;   // { store, member, role, uid }
const storeId = () => ls.get('mate_store');
export function setStore(id, name) { ls.set('mate_store', id); if (name) ls.set('mate_store_name', name); CUR = null; try { caches.open('mate-multi-meta').then(c => c.put('store', new Response(id))); } catch (e) {} }

async function ctx() {
  if (CUR) return CUR;
  const u = api.auth.currentUser; if (!u) throw err('다시 로그인해 주세요');
  if (api.isGoogle(u)) {
    const mine = await api.myStores();
    if (!mine.length) throw err('아직 매장이 없어요', { code: 'noStore' });
    let s = mine.find(x => x.id === storeId());
    if (!s) { if (mine.length > 1) throw err('매장을 골라 주세요', { code: 'pickStore', stores: mine }); s = mine[0]; setStore(s.id, s.name); }
    CUR = { store: s, uid: u.uid, role: '사장님', owner: true, member: { id: u.uid, name: u.displayName || '사장님', type: '정', role: 'owner', status: 'active' } };
    return CUR;
  }
  const sid = api.storeOfStaff(u); if (sid !== storeId()) setStore(sid);
  const m = await api.myMember(sid);
  if (!m) throw err('가입 신청이 없어요. 다시 가입해 주세요');
  if (api.isGone(m)) throw err('퇴사 처리된 계정이에요');
  const s = m.status === 'pending' ? { id: sid, name: ls.get('mate_store_name') || '' } : await api.getStore(sid);
  if (s.name) ls.set('mate_store_name', s.name);
  CUR = { store: s, uid: u.uid, role: m.role === 'manager' ? '매니저' : '', owner: false, member: m };
  return CUR;
}
const dispOf = m => m.name;

// ---------- 직원: 오늘 · 이번 주 ----------
async function weekInfo(c, date) {
  const mon = api.mondayOf(date), [sch, rules] = await Promise.all([api.getSchedule(c.store.id, mon).catch(() => null), api.rulesOf(c.store.id).catch(() => ({}))]);
  return { mon, sch: sch && sch.published ? sch : null, rawSch: sch, rules: rules.current || null };
}
async function me() {
  const c = await ctx(), m = c.member, t = api.kst(), pend = m.status === 'pending';
  const base = { name: m.name, disp: dispOf(m), role: c.role, group: m.type === '정' ? '정' : '알', pend, links: {}, store: c.store.name };
  if (pend) return { ...base, today: { date: t.date, label: lab(t.date), code: '', start: '', early: false, clock: null }, week: api.weekDates(api.mondayOf(t.date)).map(d => ({ date: d, label: lab(d), code: '', today: d === t.date })), workDays: 0, notice: [], covered: false };
  const w = await weekInfo(c, t.date), i = api.weekDates(w.mon).indexOf(t.date);
  const codes = c.owner ? [] : ((w.sch && w.sch.cells) || {})[m.id] || [];
  const plan = c.owner ? { start: '', early: null } : sched.todayPlan(w.rawSch, w.rules, m, t.date);
  const [pin, pout, nts] = await Promise.all([c.owner ? null : api.punchDoc(c.store.id, t.date, m.id, 'in'), c.owner ? null : api.punchDoc(c.store.id, t.date, m.id, 'out'), api.notices(c.store.id).catch(() => [])]);
  return {
    ...base,
    today: { date: t.date, label: lab(t.date), code: toSansung(codes[i]), start: plan.start, early: !!plan.early, clock: pin || pout ? { in: pin ? api.hmOf(pin.at) : '', out: pout ? api.hmOf(pout.at) : '' } : null },
    week: api.weekDates(w.mon).map((d, k) => ({ date: d, label: lab(d), code: toSansung(codes[k]), today: d === t.date })),
    workDays: codes.filter(isWork).length,
    notice: nts.slice(0, 3).map(n => ({ d: n.at && n.at.toDate ? md(api.kst(n.at.toDate()).date) : '', t: n.text })),
    covered: !!w.sch,
  };
}

async function schedule() {
  const c = await ctx(), t = api.kst(), w = await weekInfo(c, t.date), dates = api.weekDates(w.mon);
  const ms = (await api.members(c.store.id)).filter(m => api.isActive(m, w.mon)).sort((a, b) => (a.name < b.name ? -1 : 1));
  const cells = (w.sch && w.sch.cells) || {};
  const rows = ms.map(m => ({ disp: dispOf(m), group: m.type === '정' ? '정' : '알', codes: dates.map((d, i) => toSansung((cells[m.id] || [])[i])) }));
  const count = dates.map((d, i) => { const j = rows.filter(r => r.group === '정' && isWork(r.codes[i] === '오전+오후' ? 'O' : r.codes[i])).length, a = rows.filter(r => r.group === '알' && (r.codes[i] === 'O' || r.codes[i] === '오전+오후')).length; return `${j}+${a}`; });
  return { title: `${md(dates[0])} ~ ${md(dates[6])}`, days: dates.map(d => ({ label: `${+d.slice(8)} ${DOW[api.dowOf(d)]}`, today: d === t.date })), rows, count, covered: !!w.sch };
}

// ---------- 직원: 내 기록 (달력) ----------
async function recordsApi() {
  const c = await ctx(), m = c.member, t = api.kst(), month = t.date.slice(0, 7), alba = m.type !== '정';
  const res = { month: +month.slice(5) + '월', year: +month.slice(0, 4), mon: +month.slice(5), today: +t.date.slice(8), list: [], off: [], total: 0, hours: alba, sum: null };
  if (c.owner || m.status === 'pending') return res;
  const days = await records.myDays(c.store, m, month);
  const weeks = []; for (let w = api.mondayOf(month + '-01'); w <= t.date; w = api.addDays(w, 7)) weeks.push(w);
  const schs = await Promise.all(weeks.map(w => api.getSchedule(c.store.id, w).catch(() => null)));
  const S = Object.fromEntries(weeks.map((w, i) => [w, schs[i] && schs[i].published ? schs[i] : null]));
  const codeOn = d => { const s = S[api.mondayOf(d)]; return s ? ((s.cells || {})[m.id] || [])[api.weekDates(api.mondayOf(d)).indexOf(d)] || '' : ''; };
  const D = {};
  days.forEach(x => {
    const tags = [];
    if (x.late) tags.push('지각 ' + x.late + '분');
    x.notes.forEach(n => { if (/^일찍 부름|^대타|^추가 출근|^조기 출근|^⚠/.test(n)) tags.push(n); });
    if (x.noOut) tags.push('퇴근 없음');
    D[x.date] = { date: md(x.date), day: +x.date.slice(8), in: x.calcStart, out: x.out, mins: x.min, tags, tap: x.in, late: x.late, shift: /대타/.test(x.notes.join()) ? '대타' : /추가 출근/.test(x.notes.join()) ? '추가' : '' };
  });
  const upto = D[t.date] ? +t.date.slice(8) : +t.date.slice(8) - 1;
  const sum = { work: 0, off: 0, sched: 0, missed: 0, extra: 0, cover: 0, leave: { 연차: 0, 반차: 0, 병가: 0, 무급: 0 }, upto, late: 0, lateMin: 0 };
  for (let day = 1; day <= upto; day++) {
    const d = `${month}-${String(day).padStart(2, '0')}`, code = codeOn(d), x = D[d];
    if (isWork(code)) sum.sched++;
    if (x) {
      sum.work++; res.list.push(x); res.total += x.mins;
      if (x.late) { sum.late++; sum.lateMin += x.late; }
      if (x.shift === '대타') sum.cover++;
      else if (alba && Object.values(S).some(Boolean) && !isWork(code) && !x.shift) { x.tags.push('스케줄 없던 날 출근'); sum.extra++; }
    } else {
      sum.off++;
      if (isWork(code)) { res.off.push({ day, tags: ['스케줄 있었는데 쉼'] }); sum.missed++; } else res.off.push({ day, tags: ['휴무'] });
    }
  }
  if (alba) {
    const [rules, wd] = await Promise.all([api.rulesFor(c.store.id, month), api.myWage(c.store.id).catch(() => null)]);
    const wage = wageOf(wd, month, rules, false);
    const p = albaPay(days, wage || 0, { noJuhu: !!m.noJuhu, juhu: rules && rules.pay && rules.pay.juhu });
    const last = +t.date.slice(8);
    sum.weeks = p.weeks.map((min, i) => ({ wk: `${i + 1}주 (${i * 7 + 1}~${Math.min(i * 7 + 7, 31)}일)`, h: min / 60, pay: Math.round(p.juhuW[i]) })).filter((x, i) => i * 7 + 1 <= last);
    sum.totalH = Math.round(p.totalMin / 6) / 10; sum.juhu = Math.round(p.juhu); sum.noJuhu = !!m.noJuhu;
    if (wage) sum.pay = { now: Math.round(p.pay) };
  }
  res.sum = sum;
  return res;
}

// ---------- 직원: 휴무신청 ----------
async function leaveForm() {
  const c = await ctx(), week = api.addDays(api.mondayOf(api.kst().date), 7), dates = api.weekDates(week);
  const [setting, mine] = await Promise.all([api.leaveSetting(c.store.id), c.owner ? null : api.myLeave(c.store.id, week)]);
  const w = setting ? api.leaveWindow(week, setting) : null, now = new Date();
  return { title: `${md(dates[0])} ~ ${md(dates[6])}`, open: !!w && now >= w.opens && now < w.closes, past: !w || now >= w.closes || now < w.opens,
    closes: w ? api.fmtWhen(w.closes) : '', days: dates.map(d => ({ date: d, label: lab(d) })),
    saved: mine ? { off: mine.off || [], am: mine.am || [], at: mine.at && mine.at.toDate ? api.fmtWhen(mine.at.toDate()) : '' } : null };
}
async function submitLeave(name, off, am) {
  const c = await ctx(), week = api.addDays(api.mondayOf(api.kst().date), 7);
  try { await api.submitLeave(c.store.id, week, c.member.name, off, am); } catch (e) { return { saved: false, msg: '신청 시간이 아니거나 저장하지 못했어요' }; }
  return { saved: true, msg: '보냈어요' };
}

// ---------- 직원: 내 정보 ----------
const maskAcct = a => { const d = String(a || '').replace(/\D/g, ''); return d ? '••••' + d.slice(-4) : ''; };
const maskMail = e => { const [u, h] = String(e || '').split('@'); return u ? u.slice(0, 2) + '***' + (h ? '@' + h : '') : ''; };
async function myInfo() {
  const c = await ctx(), p = (await api.myPrivate(c.store.id).catch(() => null)) || {};
  return { bank: p.bank || '', acct: maskAcct(p.account), email: maskMail(p.email), rrn: false, pending: p.req ? { at: p.req.at && p.req.at.toDate ? api.fmtWhen(p.req.at.toDate()) : '' } : null };
}
async function saveInfo(o) {
  const c = await ctx(), pd = await api.myPrivate(c.store.id).catch(() => null);
  await api.requestPrivate(c.store.id, { bank: o.bank, account: o.acct, email: o.email }, !!pd);
  return { saved: true, msg: '보냈어요. 사장님이 확인하면 들어가요' };
}

// ---------- 출퇴근 ----------
async function workDate(c) {
  const t = api.kst(), uid = c.member.id;
  const [tin, tout] = await Promise.all([api.punchDoc(c.store.id, t.date, uid, 'in'), api.punchDoc(c.store.id, t.date, uid, 'out')]);
  if (!tin && !tout && t.hour < 12) {
    const y = api.addDays(t.date, -1), [yin, yout] = await Promise.all([api.punchDoc(c.store.id, y, uid, 'in'), api.punchDoc(c.store.id, y, uid, 'out')]);
    if (yin && !yout) return { date: y, pin: yin, pout: null };
  }
  return { date: t.date, pin: tin, pout: tout };
}
async function clockStatus() {
  const c = await ctx();
  if (c.owner) return { st: { mode: '퇴근만' }, owner: true };
  if (c.member.status === 'pending') return { wait: true };
  const w = await workDate(c);
  return { st: { mode: c.member.type === '정' ? '퇴근만' : '출퇴근', inTag: w.pin ? api.hmOf(w.pin.at) : '', out: w.pout ? api.hmOf(w.pout.at) : '' } };
}
const EARLY_MIN = 15;
async function earlyAsk(c, date, pin) {
  if (c.member.type === '정' || !pin || (pin.earlyReq && pin.earlyReq.status !== 'wait')) return null;
  const w = await weekInfo(c, date), plan = sched.todayPlan(w.rawSch, w.rules, c.member, date), inHm = api.hmOf(pin.at);
  const toM = s => +s.slice(0, 2) * 60 + +s.slice(3, 5);
  return !plan.early && toM(plan.start) - toM(inHm) >= EARLY_MIN ? { inTag: inHm, base: plan.start } : null;
}
async function clock(kind, w, alone) {
  const c = await ctx(), name = c.member.name;
  if (kind === '퇴근다시') return { mode: 'msg', kind: 'warn', title: '퇴근은 이미 찍었어요', text: '퇴근 시각이 틀렸으면 사장님·매니저에게 말해 주세요. (더보기 → 출퇴근 기록 고치기)' };
  let r;
  try { r = await api.punch(c.store.id, kind === '출근' ? 'in' : 'out', alone); }
  catch (e) { return { mode: 'msg', kind: 'warn', title: kind + '이 안 찍혔어요', text: e.message } }
  const wifi = r.wifi ? true : false;
  if (kind === '출근') return { mode: 'done', kind: r.flag ? 'warn' : 'ok', title: name + '님 출근 완료', text: r.flag ? '기록은 됐고, 사장님이 확인해요.' : '오늘도 화이팅!', wifi };
  const pin = await api.punchDoc(c.store.id, r.date, c.member.id, 'in');
  const res = { mode: 'done', kind: r.flag ? 'warn' : 'ok', title: name + '님 퇴근 ' + r.time, text: '수고하셨어요!', wifi, alone: !!r.alone, shiftButtons: true };
  const ea = await earlyAsk(c, r.date, pin); if (ea) res.askEarly = ea;
  return res;
}
async function clockEarly(kind, time) {
  const c = await ctx(), w = await workDate(c);
  if (w.pin) await api.answerEarly(c.store.id, w.pin.id, kind === 'called' ? 'wait' : 'self', kind === 'called' ? time : '');
  return { mode: 'done', kind: 'ok', title: kind === 'called' ? time + ' 출근으로 승인 요청했어요' : '정시부터 계산돼요', text: kind === 'called' ? '사장님·매니저가 승인하면 그 시각부터 계산돼요.' : '', shiftButtons: true };
}
async function clockShift(kind, sub) {
  const c = await ctx(), t = api.kst();
  let out = await api.punchDoc(c.store.id, t.date, c.member.id, 'out');
  if (!out && t.hour < 12) out = await api.punchDoc(c.store.id, api.addDays(t.date, -1), c.member.id, 'out');
  if (!out) return { mode: 'msg', kind: 'warn', title: '퇴근 기록이 없어요', text: '' };
  await api.setShift(c.store.id, out.id, kind, sub || '');
  return { mode: 'done', kind: 'ok', title: '저장 완료! 이제 닫아도 돼요', text: kind === 'sub' ? `대타 (${sub} 대신)` : kind === 'extra' ? '추가 출근' : '스케줄대로' };
}

// ---------- 폰 알림 ----------
const pushMine = async () => ({ key: PUSH_KEY });
async function pushSub(s) { const c = await ctx(); await api.savePushSub(c.store.id, s.endpoint); return { msg: '알림을 켰어요' }; }
async function pushOff(s) { const c = await ctx(); await api.removePushSub(c.store.id, s.endpoint).catch(() => {}); return { msg: '알림을 껐어요' }; }
async function pushTest() { const c = await ctx(); const r = await api.pushTest(c.store.id); return r.sent ? { msg: '시험 알림을 보냈어요' } : { warn: true, msg: '보낼 폰이 없어요. 알림을 다시 켜 주세요' }; }

// ---------- 로그인 ----------
async function login(name, pw) {
  const sid = storeId(); if (!sid) return { ok: false, err: '매장을 먼저 골라 주세요', needStore: true };
  try { await api.staffLogin(sid, name, pw); } catch (e) { return { ok: false, err: /invalid|wrong|not-found/.test(e.code || '') ? '이름이나 비밀번호가 맞지 않아요' : e.message }; }
  CUR = null;
  const m = await api.myMember(sid).catch(() => null);
  if (m && m.pinReset && !api.isGone(m)) return { ok: false, needNew: true };
  return { ok: true };
}
async function register(name, pw) {
  const sid = storeId(); if (!sid) return { ok: false, err: '매장을 먼저 골라 주세요', needStore: true };
  try { await api.staffSignup(sid, ls.get('mate_join') || null, name, pw); } catch (e) { if (api.auth.currentUser) await api.logout(); return { ok: false, err: e.message }; }
  ls.del('mate_join'); CUR = null; return { ok: true };
}
async function signup(name, temp, pw) {   // 임시 비밀번호로 들어온 뒤 새 비밀번호 정하기
  const sid = storeId();
  try { await api.changePin(sid, pw); } catch (e) { return { ok: false, err: e.message }; }
  if (!api.auth.currentUser) { try { await api.staffLogin(sid, name, pw); } catch (e) { return { ok: false, err: '새 비밀번호로 다시 로그인해 주세요' }; } }
  CUR = null; return { ok: true };
}
async function logout() { CUR = null; await api.logout(); }

// 화면에서 쓰는 API (산성 data-live.js와 같은 이름). 사장님·매니저용은 admin.js가 채움
window.API = {
  demo: false, multi: true,
  hasToken: () => !!api.auth.currentUser,
  login, register, signup, logout, me, schedule, records: recordsApi, leaveForm, submitLeave, myInfo, saveInfo,
  clockStatus, clock, clockEarly, clockShift, pushMine, pushSub, pushOff, pushTest,
  prefetch: () => {},
  // 새 앱 전용: 매장 고르기·사장님 구글 로그인
  storeName: () => ls.get('mate_store_name') || '',
  findStore: name => api.findStore(name),
  joinInfo: code => api.joinInfo(code),
  setStore, googleLogin: () => api.googleLogin(), myStores: () => api.myStores(),
  _ctx: ctx, _api: api, _reset: () => { CUR = null; },
};

// 초대 링크(?join=코드)로 들어오면 그 매장으로
const qs = new URLSearchParams(location.search);
if (qs.get('join')) { const code = qs.get('join').toUpperCase(); ls.set('mate_join', code); api.joinInfo(code).then(j => { if (j) setStore(j.storeId, j.storeName); }).catch(() => {}); }
if ([...qs.keys()].length) history.replaceState(null, '', location.pathname);

// 사장님·매니저 화면 데이터 + 화면 스크립트는 로그인 상태를 안 뒤에 불러옴
await import('./admin.js?v=1');
await new Promise(res => { const off = api.onUser(() => { off(); res(); }); });
const s = document.createElement('script'); s.src = 'app.js?v=1'; document.body.appendChild(s);
