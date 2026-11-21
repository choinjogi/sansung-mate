// 근태 점검 = 산성 NFC "스케줄과 비교" · 당일 미출근 알림 · 매일 10시 요약과 같은 기준.
// 화면(브라우저)과 서버(Cloudflare cron) 둘 다 쓰므로 다른 파일을 import 하지 않는 순수 계산만 둔다.
// 출퇴근(punch)은 { uid, date, kind:'in'|'out', atMs, shift, subFor, flag, why, earlyReq } 모양으로 넘긴다 (at → 밀리초).

const KST = 9 * 3600e3;
export const kstHm = ms => new Date(ms + KST).toISOString().slice(11, 16);
export const addDays = (d, n) => { const t = new Date(d + 'T12:00:00Z'); t.setUTCDate(t.getUTCDate() + n); return t.toISOString().slice(0, 10); };
export const mondayOf = d => addDays(d, -((new Date(d + 'T12:00:00Z').getUTCDay() + 6) % 7));
const toM = hm => +hm.slice(0, 2) * 60 + +hm.slice(3, 5);
const isWork = c => c === 'O' || c === '오전' || c === 'O+오전';
const groupOf = m => m.sgroup || (m.type === '정' ? '정' : '알');

// 그날 계산 시작(정시) = 일찍 부른 시각 > 주말 오전(오전·오전+저녁) > 직원 정시 > 매장 정시
export function planOf(sch, rules, m, date) {
  const i = (new Date(date + 'T12:00:00Z').getUTCDay() + 6) % 7;
  const code = (sch && sch.published && sch.cells && sch.cells[m.id] && sch.cells[m.id][i]) || '';
  const early = (sch && sch.early && sch.early[date] && sch.early[date][m.id]) || null;
  const am = (rules && rules.staffing && rules.staffing.amStart) || '12:00';
  const start = early || (code === '오전' || code === 'O+오전' ? am : m.startTime || (rules && rules.open && rules.open.startTime) || '18:00');
  return { code, early, start, work: isWork(code) };
}

// 기간 비교 (from~to, today 이후 날짜는 안 셈). members: 재직자(근무표 전용 noLogin 제외)
// 돌려줌 people: 사람별 합계, rows: 정상 아닌 줄 + 참고 줄
export function compare({ members, schedules, punches, rules, from, to, today }) {
  const P = {};
  punches.forEach(p => { ((P[p.uid] = P[p.uid] || {})[p.date] = P[p.uid][p.date] || {})[p.kind] = p; });
  const grace = (rules && rules.open && rules.open.lateGraceMin) || 0;
  const rows = [], people = [];
  members.filter(m => !m.noLogin).forEach(m => {
    const s = { name: m.name, disp: m.disp || m.name, alba: m.type !== '정', sched: 0, came: 0, late: 0, lateMin: 0, early: 0, noShow: 0, unsched: 0, noOut: 0, sub: 0, extra: 0 };
    for (let d = from; d <= to && d < today; d = addDays(d, 1)) {
      if (m.startDate && d < m.startDate) continue;
      if (m.leaveDate && d > m.leaveDate) continue;
      const pl = planOf(schedules[mondayOf(d)], rules, m, d), x = (P[m.id] || {})[d] || {}, came = !!(x.in || x.out);
      const row = (kind, text) => rows.push({ date: d, name: m.name, disp: s.disp, kind, text });
      if (pl.work) s.sched++;
      if (came) s.came++;
      if (pl.early && came) { s.early++; row('early', `일찍 부름 ${pl.early}`); }
      if (pl.work && !came) { s.noShow++; row('noshow', s.alba ? '스케줄 있는데 출근 기록 없음' : '스케줄 있는데 퇴근 기록 없음'); continue; }
      if (!came) continue;
      const shift = x.out && x.out.shift;
      if (shift === 'sub') { s.sub++; row('sub', `대타${x.out.subFor ? ` (${x.out.subFor} 대신)` : ''}`); }
      else if (shift === 'extra') { s.extra++; row('extra', '추가 출근'); }
      else if (!pl.work) { s.unsched++; row('unsched', '스케줄 없이 출근'); }
      if (s.alba && x.in) {
        const late = Math.round((x.in.atMs - Date.parse(`${d}T${pl.start}:00+09:00`)) / 60000);
        if (late > grace && late < 12 * 60) { s.late++; s.lateMin += late; row('late', `지각 ${late}분 (출근 ${kstHm(x.in.atMs)}, 기준 ${pl.start})`); }
      }
      if (s.alba && x.in && !x.out) { s.noOut++; row('noout', `퇴근 기록 없음 (출근 ${kstHm(x.in.atMs)})`); }
    }
    if (s.sched || s.came) people.push(s);
  });
  const ORDER = { noshow: 0, late: 1, noout: 2, unsched: 3, sub: 4, extra: 5, early: 6 };
  rows.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : ORDER[a.kind] - ORDER[b.kind] || (a.name < b.name ? -1 : 1)));
  people.sort((a, b) => (a.alba !== b.alba ? (a.alba ? 1 : -1) : a.name < b.name ? -1 : 1));
  return { people, rows, from, to };
}
export const BAD = ['noshow', 'late', 'noout', 'unsched'];   // ⚠️ 이상 (나머지는 참고)

// 당일 미출근: 오늘 근무(O·오전·오전+저녁)인 알바 중 (기준 + afterMin분)이 지나도 출근·퇴근 둘 다 없는 사람
// 정직원·반직원(구분 정)은 퇴근만 찍으므로 제외 (산성 NFC checkNoShow와 같음)
export function noShowNow({ members, sch, rules, punches, date, nowHm, afterMin = 30 }) {
  const has = new Set(punches.filter(p => p.date === date).map(p => p.uid));
  return members.filter(m => !m.noLogin && m.type !== '정' && m.status === 'active' && !(m.leaveDate && m.leaveDate < date)).map(m => ({ m, pl: planOf(sch, rules, m, date) }))
    .filter(({ m, pl }) => pl.work && !has.has(m.id) && toM(nowHm) >= toM(pl.start) + afterMin)
    .map(({ m, pl }) => ({ id: m.id, name: m.name, disp: m.disp || m.name, start: pl.start }));
}

// 매일 요약 한 줄 (어제 기준). 확인할 게 없으면 ''
export function summaryText(cmp, { pendingJoin = 0, earlyWait = 0, infoWait = 0, alone = 0, wifiNo = 0 } = {}) {
  const n = k => cmp.rows.filter(r => r.kind === k).length;
  const parts = [['미출근', n('noshow')], ['지각', n('late')], ['퇴근 없음', n('noout')], ['스케줄 외', n('unsched')], ['혼자 퇴근', alone], ['와이파이 아님', wifiNo],
    ['조기 출근 승인 대기', earlyWait], ['새 가입', pendingJoin], ['내 정보 승인', infoWait]].filter(([, v]) => v > 0);
  return parts.map(([k, v]) => `${k} ${v}`).join(' · ');
}
