// 사장님·매니저 화면 데이터 — 산성 data-live.js의 관리용 API와 같은 이름·모양을 Firebase로 만든다.
// 산성은 결산 시트·NFC를 읽었지만, 여기서는 새 앱 데이터(Firestore)와 계산(multi/*.js)을 쓴다.
import * as api from '../multi/fb.js?v=34';
import * as sched from '../multi/sched.js?v=34';
import * as pay from '../multi/pay.js?v=34';
import * as dash from '../multi/dash.js?v=34';
import * as staff from '../multi/staff.js?v=34';
import { wageOf } from '../multi/paycalc.js?v=34';
import * as auto from '../multi/autosched.js?v=34';
import * as att from '../multi/attcheck.js?v=34';

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
    rows: ms.filter(m => api.groupOf(m) === '알').map(m => { const l = L[m.id]; return { name: m.name, disp: m.disp || m.name, sent: !!l, off: l ? l.off || [] : [], am: l ? l.am || [] : [], at: l ? when(l.at) : '' }; }) };
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
A.people = async () => { const c = await admin(); return { list: (await staffList(c)).map(m => ({ name: m.name, disp: m.name, alba: m.type !== '정', group: api.groupOf(m) })) }; };
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

// ---------- 직원 설정 (스케줄·급여용, 산성 직원명부 K~Q와 같은 칸) ----------
const DAYS = ['월', '화', '수', '목', '금', '토', '일'];
A.staffCfg = async () => {
  const c = await owner(), ms = (await api.membersAll(c.store.id)).filter(m => api.isActive(m)).sort((a, b) => (a.name < b.name ? -1 : 1));
  return ms.map(m => ({ name: m.name, noLogin: !!m.noLogin, disp: m.disp || '', kind: m.type === '정' ? (m.half ? '반직원' : '정직원') : '알바', sgroup: m.sgroup || '', start: m.startTime || '',
    offDays: (m.offDays || []).filter(x => DAYS.includes(x)), minDays: m.minDays == null ? null : m.minDays, priority: !!m.priority, noJuhu: !!m.noJuhu, manager: m.role === 'manager' }));
};
A.saveStaffCfg = async (name, o) => {
  const c = await owner(), m = (await api.membersAll(c.store.id)).find(x => x.name === name && api.isActive(x));
  if (!m) return { saved: false, msg: name + '님을 찾을 수 없어요' };
  if (m.noLogin && o.kind === '알바') return { saved: false, msg: '근무표 전용(로그인 없음)은 정직원·반직원만 돼요' };
  const disp = String(o.disp || '').trim(), min = o.minDays === '' || o.minDays == null ? null : Math.round(+o.minDays);
  if (disp.length > 10) return { saved: false, msg: '표시이름은 10글자까지예요' };
  if (min != null && !(min >= 0 && min <= 7)) return { saved: false, msg: '최소출근일은 0~7일이에요' };
  if (o.start && !/^([01]\d|2[0-3]):[0-5]\d$/.test(o.start)) return { saved: false, msg: '정시 출근은 18:00처럼 넣어 주세요' };
  const patch = { disp: disp || null, type: o.kind === '알바' ? '알' : '정', half: o.kind === '반직원', startTime: o.start || null,
    offDays: DAYS.filter(x => (o.offDays || []).includes(x)), minDays: min, priority: !!o.priority, noJuhu: !!o.noJuhu,
    sgroup: o.kind === '알바' && o.sgroup === '정' ? '정' : null };   // 알바인데 근무표는 정 그룹(고정 근무)일 때만
  await api.setMember(c.store.id, m.id, patch);
  return { saved: true, msg: `${name}님 설정을 저장했어요` };
};

// 근무표 전용 직원 (로그인 없음, 예: 사장님 본인) — 근무표에만 나오고 출퇴근·급여 목록엔 안 나옴
A.addNoLogin = async (name, kind) => {
  const c = await owner(), n = String(name || '').trim();
  if (!n || n.length > 20) return { saved: false, msg: '이름을 넣어 주세요 (20글자까지)' };
  if ((await api.membersAll(c.store.id)).some(m => api.isActive(m) && api.nameKey(m.name) === api.nameKey(n))) return { saved: false, msg: '같은 이름이 이미 있어요' };
  await api.addNoLoginMember(c.store.id, { name: n, half: kind === '반직원' });
  return { saved: true, msg: n + '님을 근무표에 넣었어요' };
};
A.removeNoLogin = async name => {
  const c = await owner(), m = (await api.membersAll(c.store.id)).find(x => x.name === name && x.noLogin);
  if (!m) return { msg: '이미 빠졌어요' };
  await api.removeNoLogin(c.store.id, m.id);
  return { msg: name + '님을 근무표에서 뺐어요' };
};

// ---------- 스케줄 규칙 (산성 스케줄 "설정" 시트: 목표 인원·알바 고정 수·동시휴무 금지·과인원 순서·최소출근일 기본) ----------
A.schedCfg = async () => {
  const c = await owner(), [cfg, ms] = await Promise.all([api.schedCfg(c.store.id), api.membersAll(c.store.id)]);
  return { cfg: { ...auto.SCHED_DEFAULT, ...(cfg || {}) }, saved: !!cfg, jung: ms.filter(m => api.isActive(m) && api.groupOf(m) === '정').map(m => m.name).sort() };
};
A.saveSchedCfg = async o => {
  const c = await owner(), num = (v, lo, hi) => { const n = Math.round(+v); return Number.isFinite(n) && n >= lo && n <= hi ? n : null; };
  const min = o.min.map(v => num(v, 0, 50)), max = o.max.map(v => num(v, 0, 50)), alba = o.alba.map(v => (v === '' || v == null ? null : num(v, 0, 50)));
  if (min.includes(null) || max.includes(null)) return { saved: false, msg: '최소·최대 인원은 숫자로 넣어 주세요' };
  if (min.some((v, i) => v > max[i])) return { saved: false, msg: '최소가 최대보다 큰 요일이 있어요' };
  const pairs = (o.pairs || []).filter(p => p.a && p.b && p.a !== p.b).slice(0, 10).map(p => ({ a: p.a, b: p.b }));
  const OK = ['월', '화', '수', '목', '금', '토', '일', '토 오전', '일 오전'];
  const overflow = String(o.overflow || '').split(/[,·\n]+/).map(s => s.trim()).filter(Boolean);
  if (overflow.some(x => !OK.includes(x))) return { saved: false, msg: '과인원 순서는 "토, 금, 목, 토 오전, 일 오전"처럼 넣어 주세요' };
  const defMin = num(o.defMin, 0, 7); if (defMin == null) return { saved: false, msg: '최소출근일 기본은 0~7이에요' };
  await api.saveSchedCfg(c.store.id, { min, max, alba, pairs, overflow: [...new Set(overflow)].slice(0, 9), defMin });
  return { saved: true, msg: '스케줄 규칙을 저장했어요' };
};

// ---------- 스케줄과 비교 (산성 NFC 관리 화면 "스케줄과 비교" — 이번 주/지난주/이번 달) ----------
const atMs = p => (p.at && p.at.toDate ? p.at.toDate().getTime() : typeof p.at === 'string' ? Date.parse(p.at) : null);
export async function compareRange(c, from, to) {
  const today = api.kst().date, weeks = [];
  for (let w = api.mondayOf(from); w <= to; w = api.addDays(w, 7)) weeks.push(w);
  const [ms, ps, rules, schs] = await Promise.all([api.members(c.store.id), api.punchesBetween(c.store.id, from, to), api.rulesFor(c.store.id, from.slice(0, 7)),
    Promise.all(weeks.map(w => api.getSchedule(c.store.id, w).catch(() => null)))]);
  const punches = ps.map(p => ({ ...p, atMs: atMs(p) })).filter(p => p.atMs);
  return att.compare({ members: ms.filter(m => m.status === 'active' || m.status === 'left'), schedules: Object.fromEntries(weeks.map((w, i) => [w, schs[i]])), punches, rules, from, to, today });
}
A.compare = async range => {
  const c = await admin(), t = api.kst().date, mon = api.mondayOf(t);
  const [from, to, label] = range === 'last' ? [api.addDays(mon, -7), api.addDays(mon, -1), '지난주'] : range === 'month' ? [t.slice(0, 8) + '01', t, '이번 달'] : [mon, api.addDays(mon, 6), '이번 주'];
  const r = await compareRange(c, from, to);
  return { ...r, label, bad: att.BAD };
};

// ---------- 산성 데이터 가져오기 (사장님, 지금 시트 → 새 앱 한 번) ----------
// 파일 = 결산·스케줄 시트에서 뽑은 JSON { staff, cfg, schedules{주:{이름:[7칸]}}, sales{날짜:금액}, punches[{name,date,full,in,out,shift}] } (주민번호 없음)
//  1단계(가입 전): 스케줄 규칙 · 입사 등록(구분·정시·시급·표시이름·고정휴무·최소출근일·우선배정·근무표 그룹·주휴 없음) · 사장님 = 근무표 전용 · 매출
//  2단계(직원이 가입·승인한 뒤, 몇 번 눌러도 됨): 이름이 같은 직원에게 계좌·이메일 · 매니저 · 지난 확정 근무표 · 그 달 출퇴근(+대타·추가 출근)
const keyOf = n => api.nameKey(n);
const hireOf = s => ({ name: s.name, type: s.kind === '알바' ? '알' : '정', startTime: s.start || null, startDate: null, ...(s.wage ? { wage: Math.round(s.wage) } : {}),
  disp: s.disp && s.disp !== s.name ? s.disp : null, offDays: s.offDays || [], minDays: s.kind === '알바' && s.minDays != null ? s.minDays : null, priority: !!(s.kind === '알바' && s.priority),
  half: s.kind === '반직원', sgroup: s.kind === '알바' && s.group === '정' ? '정' : null, noJuhu: !!s.noJuhu });
A.importCheck = async j => {
  const c = await owner(), [ms, hires] = await Promise.all([api.membersAll(c.store.id), api.hiresOf(c.store.id)]);
  const act = ms.filter(m => api.isActive(m)), byName = n => act.find(m => keyOf(m.name) === keyOf(n));
  const people = j.staff.map(s => { const m = byName(s.name), h = hires.find(x => x.id === keyOf(s.name));
    return { name: s.name, kind: s.kind + (s.owner ? ' · 사장님' : s.manager ? ' · 매니저' : ''), state: m ? (m.noLogin ? '근무표 전용' : '가입함') : h ? '입사 등록됨 (가입 대기)' : '아직 없음' }; });
  return { store: c.store.name, people, weeks: Object.keys(j.schedules || {}), sales: Object.keys(j.sales || {}).length, punches: (j.punches || []).length };
};
A.import1 = async j => {
  const c = await owner(), S = c.store.id, ms = await api.membersAll(S), have = n => ms.some(m => api.isActive(m) && keyOf(m.name) === keyOf(n));
  if (j.cfg) await api.saveSchedCfg(S, { ...auto.SCHED_DEFAULT, ...j.cfg, alba: (j.cfg.alba || []).map(v => (v == null ? null : v)) });
  let hired = 0, nl = 0, sales = 0;
  for (const s of j.staff) {
    if (have(s.name)) continue;
    if (s.owner) { await api.addNoLoginMember(S, { name: s.name, ...(s.disp && s.disp !== s.name ? { disp: s.disp } : {}), offDays: s.offDays || [], half: false, ...(s.start ? { startTime: s.start } : {}) }); nl++; }
    else { await api.addHire(S, hireOf(s)); hired++; }
  }
  for (const [d, v] of Object.entries(j.sales || {})) { await api.setSales(S, d, Math.round(v)); sales++; }
  return { msg: `스케줄 규칙 · 입사 등록 ${hired}명 · 근무표 전용 ${nl}명 · 매출 ${sales}일 넣었어요` };
};
A.import2 = async j => {
  const c = await owner(), S = c.store.id, act = (await api.membersAll(S)).filter(m => api.isActive(m) || m.status === 'left');
  const idOf = n => (act.find(m => keyOf(m.name) === keyOf(n)) || {}).id, St = Object.fromEntries(j.staff.map(s => [keyOf(s.name), s]));
  let priv = 0, mgr = 0, weeks = 0, ps = 0; const missing = new Set();
  for (const m of act.filter(m => !m.noLogin && m.status === 'active')) {
    const s = St[keyOf(m.name)]; if (!s) continue;
    if (s.bank || s.account || s.email) { await api.setPrivateByOwner(S, m.id, s); priv++; }
    if (s.manager && m.role !== 'manager') { await api.setMember(S, m.id, { role: 'manager' }); mgr++; }
  }
  for (const [w, rows] of Object.entries(j.schedules || {})) {
    const cells = {}; Object.entries(rows).forEach(([n, cs]) => { const id = idOf(n); if (id) cells[id] = cs; else missing.add(n); });
    await api.saveSchedule(S, w, cells, true); weeks++;
  }
  const noLogin = new Set(act.filter(m => m.noLogin).map(m => m.id));   // 근무표 전용(사장님)은 출퇴근 기록 안 넣음
  for (const p of j.punches || []) {
    const id = idOf(p.name); if (!id) { missing.add(p.name); continue; }
    if (noLogin.has(id)) continue;
    // 정시보다 이른 계산 시작 = 그날 일찍 부름 (시트 "예외 출근") → 근무표 일찍 부르기로 넣어야 새 앱도 그 시각부터 계산
    const base = (St[keyOf(p.name)] || {}).start || '18:00';
    if (!p.full && p.in && p.in < base) await api.setEarly(S, p.date, id, p.in);
    if (!p.full && p.in && !(await api.punchGet(S, `${p.date}_${id}_in`))) { await api.addPunch(S, { uid: id, name: p.name, date: p.date, kind: 'in', at: api.atOf(p.date, p.in) }); ps++; }
    const oid = `${p.date}_${id}_out`;
    if (!(await api.punchGet(S, oid))) {
      await api.addPunch(S, { uid: id, name: p.name, date: p.date, kind: 'out', at: api.atOf(p.date, p.out, p.in || '00:00') }); ps++;
      if (p.shift) await api.setShift(S, oid, p.shift.kind, p.shift.sub || '');
    }
  }
  return { msg: `계좌·이메일 ${priv}명 · 매니저 ${mgr}명 · 근무표 ${weeks}주 · 출퇴근 ${ps}줄 넣었어요`, missing: [...missing] };
};

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
    return { name: m.name, disp: m.disp || m.name, wage: cur || 0, next: nx ? { wage: nx.wage, ym: next, reserved: true } : null };
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
