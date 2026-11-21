// 병행 기간 자동 복사 받는 쪽: 예전 시스템(구글 시트)을 읽는 Apps Script가 10분마다 "바뀐 것만" 보냄 → 새 앱 데이터베이스에 넣음
//   POST /sync  (머리글 X-Sync-Key = 비밀값 SYNC_SECRET)
//   { storeId, month, staffChanged, staff[], schedules{주:{이름:[7칸]}}, sales{날짜:금액}, salesDel[날짜], punches[], punchDel[{name,date}] }
//   staff  = [{ name, kind(알바|정직원|반직원), start, wage, bank, account, email, disp, group, offDays[], minDays, priority, noJuhu, owner, manager, leaveDate }]
//   punches = [{ name, date, full, in, out, shift: { kind: 'sub'|'extra', sub } }]  (시트 근무기록부 = 계산 출근·계산 퇴근)
// 시트가 기준: 같은 문서는 덮어씀. 가입 안 한 직원은 "가입 전" 직원(pre)으로 미리 만들어 기록을 붙여 둠
// 이 매장은 mirror = true → 새 앱 미출근 알림·휴무신청 알림을 보내지 않음 (기록이 퇴근 뒤에 한꺼번에 들어오므로)
import { Fail } from '../functions/core.js';

const nameKey = n => String(n || '').replace(/\s+/g, '').toLowerCase();
const addDays = (d, n) => { const t = new Date(d + 'T12:00:00Z'); t.setUTCDate(t.getUTCDate() + n); return t.toISOString().slice(0, 10); };
const mondayOf = d => addDays(d, -((new Date(d + 'T12:00:00Z').getUTCDay() + 6) % 7));
const HM = /^\d{2}:\d{2}$/, DATE = /^\d{4}-\d{2}-\d{2}$/;
// 근무 날짜 + "HH:MM"(한국) → 시각. 퇴근이 출근보다 이르면 자정 넘김
export const atOf = (date, hm, afterHm) => new Date(`${afterHm && hm < afterHm ? addDays(date, 1) : date}T${hm}:00+09:00`);
const rid = () => 'pre' + Array.from(crypto.getRandomValues(new Uint8Array(15)), b => 'abcdefghijkmnpqrstuvwxyz23456789'[b % 32]).join('');

// 직원 설정 칸 (시트 직원명부 → 새 앱 직원 문서)
export function memberFields(s) {
  const alba = s.kind === '알바';
  return { type: alba ? '알' : '정', startTime: HM.test(s.start || '') ? s.start : null, disp: s.disp && s.disp !== s.name ? s.disp : null, offDays: s.offDays || [],
    minDays: alba && s.minDays != null ? s.minDays : null, priority: !!(alba && s.priority), half: s.kind === '반직원', sgroup: alba && s.group === '정' ? '정' : null,
    noJuhu: !!s.noJuhu, leaveDate: DATE.test(s.leaveDate || '') ? s.leaveDate : null };
}

// 데이터베이스 부르는 횟수를 줄임 (Cloudflare 무료 = 요청 한 번에 50번까지): 읽기는 모음째 몇 번, 쓰기는 한꺼번에(batch)
export async function syncCore(db, body) {
  const { storeId: sid, month } = body;
  if (!/^[a-z0-9]{3,30}$/.test(sid || '') || !/^\d{4}-\d{2}$/.test(month || '')) throw new Fail('invalid-argument', '매장·달 정보가 없어요');
  const S = `stores/${sid}`, st = await db.get(S);
  if (!st) throw new Fail('failed-precondition', '없는 매장이에요');
  const W = [], set = (path, obj) => W.push({ set: path, obj }), upd = (path, obj, mask) => W.push({ update: path, obj, mask }), del = path => W.push({ del: path });
  if (!st.mirror) upd(S, { mirror: true }, ['mirror']);
  const staff = (body.staff || []).filter(s => s && s.name), St = Object.fromEntries(staff.map(s => [nameKey(s.name), s]));
  const n = { made: 0, updated: 0, weeks: 0, sales: 0, punches: 0, deleted: 0, early: 0 }, missing = new Set();

  // 1) 직원: 이름으로 찾고, 없으면 "가입 전" 직원으로 만듦 (사장님 = 근무표 전용이 이미 있음)
  const ms = (await db.list(`${S}/members`)).filter(m => m.status === 'active' || m.status === 'left');
  const find = name => ms.find(m => nameKey(m.name) === nameKey(name));
  if (body.staffChanged) {
    const [hires, wages] = await Promise.all([db.list(`${S}/hires`), db.list(`${S}/wages`)]);
    for (const s of staff) {
      let m = find(s.name);
      const f = memberFields(s);
      if (!m && s.owner) continue;
      if (!m) {
        const id = rid();
        set(`${S}/members/${id}`, { name: s.name.trim(), role: s.manager ? 'manager' : 'staff', status: 'active', pre: true, ...f, joinedAt: new Date() });
        m = { id, name: s.name.trim(), pre: true, ...f }; ms.push(m); n.made++;
      } else if (!m.noLogin) {
        const mf = { ...f, ...(s.manager && m.role !== 'manager' ? { role: 'manager' } : {}) };
        upd(`${S}/members/${m.id}`, mf, Object.keys(mf)); n.updated++;
      }
      if (m.noLogin) continue;
      // 시급: 이 달부터 (같은 달 값이 다르면 바꿈)
      if (s.wage) {
        const w = wages.find(x => x.id === m.id) || {}, cur = (w.history || []).find(x => x.from === month);
        if (!cur || cur.wage !== Math.round(s.wage)) set(`${S}/wages/${m.id}`, { history: (w.history || []).filter(x => x.from !== month).concat([{ from: month, wage: Math.round(s.wage) }]).sort((a, b) => (a.from < b.from ? -1 : 1)) });
      }
      // 계좌·이메일: 가입 전 직원만 (가입한 직원은 본인이 앱에서 넣음 / 처음 가져오기에서 넣음)
      if (m.pre && (s.bank || s.account || s.email)) set(`${S}/private/${m.id}`, { bank: s.bank || '', account: s.account || '', email: s.email || '', req: null, updatedAt: new Date() });
      if (hires.some(x => x.id === nameKey(s.name))) del(`${S}/hires/${nameKey(s.name)}`);
    }
  }
  const idOf = name => { const m = find(name); if (!m) { missing.add(name); return null; } return m.noLogin ? null : m.id; };

  // 2) 확정 근무표 (기록 시트) — 칸만 바꾸고 일찍 부르기(early)는 그대로
  for (const [w, rows] of Object.entries(body.schedules || {})) {
    if (!DATE.test(w)) continue;
    const cells = {};
    for (const [name, cs] of Object.entries(rows)) { const m = find(name); if (!m) { missing.add(name); continue; } cells[m.id] = cs; }
    upd(`${S}/schedules/${w}`, { week: w, cells, published: true, updatedBy: 'sync', updatedAt: new Date() }, ['week', 'cells', 'published', 'updatedBy', 'updatedAt']); n.weeks++;
  }
  // 3) 매출
  for (const [d, v] of Object.entries(body.sales || {})) { if (!DATE.test(d)) continue; set(`${S}/sales/${d}`, { date: d, amount: Math.round(v), by: 'sync', at: new Date() }); n.sales++; }
  for (const d of body.salesDel || []) if (DATE.test(d)) { del(`${S}/sales/${d}`); n.deleted++; }

  // 4) 출퇴근: 알바 = 출근(계산 시작)·퇴근, 정직원·반직원 = 퇴근만. 정시보다 이른 계산 시작 = 그날 일찍 부름
  for (const p of body.punches || []) {
    if (!DATE.test(p.date || '') || !HM.test(p.out || '')) continue;
    const id = idOf(p.name); if (!id) continue;
    const s = St[nameKey(p.name)] || {}, base = HM.test(s.start || '') ? s.start : '18:00', hasIn = !p.full && HM.test(p.in || '');
    const at = { uid: id, name: p.name, date: p.date, via: 'sync', by: 'sync' };
    if (hasIn) set(`${S}/punches/${p.date}_${id}_in`, { ...at, kind: 'in', at: atOf(p.date, p.in) });
    else del(`${S}/punches/${p.date}_${id}_in`);
    set(`${S}/punches/${p.date}_${id}_out`, { ...at, kind: 'out', at: atOf(p.date, p.out, hasIn ? p.in : '00:00'), ...(p.shift ? { shift: p.shift.kind, subFor: p.shift.sub || '' } : {}) });
    const early = hasIn && p.in < base, wk = mondayOf(p.date);
    upd(`${S}/schedules/${wk}`, early ? { week: wk, early: { [p.date]: { [id]: p.in } } } : { week: wk }, ['week', `early.\`${p.date}\`.${id}`]);
    if (early) n.early++;
    n.punches++;
  }
  for (const p of body.punchDel || []) {
    const m = find(p.name); if (!m || m.noLogin || !DATE.test(p.date || '')) continue;
    del(`${S}/punches/${p.date}_${m.id}_in`); del(`${S}/punches/${p.date}_${m.id}_out`);
    upd(`${S}/schedules/${mondayOf(p.date)}`, { week: mondayOf(p.date) }, ['week', `early.\`${p.date}\`.${m.id}`]); n.deleted++;
  }
  set(`${S}/settings/sync`, { at: new Date(), month, ...n, missing: [...missing] });
  await db.batch(W);
  return { ...n, missing: [...missing], writes: W.length };
}

// 비밀값 비교 (시간 차이로 알아내지 못하게)
export function sameKey(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || !a || a.length !== b.length) return false;
  let x = 0; for (let i = 0; i < a.length; i++) x |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return x === 0;
}
