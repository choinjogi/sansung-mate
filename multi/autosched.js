// 근무표 자동 짜기 = 산성 스케줄 시트(스케줄시스템/Code.gs generateSchedule·assign_)와 같은 규칙.
// 화면·DB와 상관없는 순수 계산이라 시험(test/autosched.test.mjs)에서 예전 엔진과 결과를 비교한다.
//
// 순서: ① 정 그룹 빈칸을 고정휴무대로 ② 동시휴무 금지 검사(위반이면 멈춤) ③ 알바는 ✕만 남기고 지움
//       ④ 인원 부족일 → 단톡 공지 멘트 ⑤ 배정(최소비용 유량) ⑥ 과인원·부족·최소출근일 점검
// 칸: 'O' 저녁 · '오전' 주말 오전 · 'O+오전' · 'X' 휴무/불가 · '' 미배정. 요일 순서 = 월~일 (0=월)

export const DAYS = ['월', '화', '수', '목', '금', '토', '일'];
export const isEve = c => c === 'O' || c === 'O+오전';      // 저녁 인원으로 셈
export const isAm = c => c === '오전' || c === 'O+오전';     // 오전 인원으로 셈
export const isWork = c => isEve(c) || c === '오전';         // 근무일 1일

// 산성 설정 시트 기본값 (스케줄 파일 "설정")
export const SCHED_DEFAULT = {
  min: [7, 7, 7, 7, 9, 9, 7],            // 목표 최소 인원(정+알), 월~일
  max: [7, 7, 7, 7, 10, 10, 8],          // 목표 최대 인원(정+알)
  alba: [4, 4, 4, 4, null, null, null],  // 알바 목표 인원: 숫자 있는 요일은 "정 출근 수 + 알바 N명"으로 최소=최대
  pairs: [],                             // 동시휴무 금지 [{ a: 이름, b: 이름 }]
  overflow: ['토', '금', '목', '토 오전', '일 오전'], // 과인원 넣는 순서
  defMin: 3,                             // 최소출근일 기본(직원 설정에 없을 때)
};

// "알바 목표 인원"이 있는 요일은 (그날 정 그룹 출근 수 + 알바 N명)으로 최소=최대
export function applyAlbaTarget(cfg, jungCnt) {
  const min = [...cfg.min], max = [...cfg.max];
  (cfg.alba || []).forEach((n, i) => { if (n != null && n !== '' && !isNaN(n)) min[i] = max[i] = jungCnt[i] + Number(n); });
  return { ...cfg, min, max };
}

// 최소비용 유량 배정 (Code.gs assign_ 그대로). al: [{ codes[7], minDays, priority, amOk{5,6}, name }]
// 비용: 최소출근일 -1000 > 요일 최소 인원 칸 -200 > 상한까지 0 > 과인원 100+ (순서대로 비쌈)
// 최소출근일을 넘는 추가 근무는 이번 주 근무일이 적은 사람·우선배정·지난 4주 적게 일한 사람 순
export function assign(al, jungCnt, cfg, hist) {
  const g = [];
  const node = () => { g.push([]); return g.length - 1; };
  const edge = (u, v, cap, cost) => {
    g[u].push({ v, cap, cost, rev: g[v].length });
    g[v].push({ v: u, cap: 0, cost: -cost, rev: g[u].length - 1 });
  };
  const S = node(), T = node();
  const eveNode = DAYS.map(() => node());
  const amNode = { 5: node(), 6: node() };
  const histVals = al.map(p => hist[p.name] || 0);
  const histMean = histVals.reduce((a, b) => a + b, 0) / Math.max(al.length, 1);
  const links = [];
  al.forEach((p, k) => {
    const a = node();
    let possible = 0;
    DAYS.forEach((d, i) => {
      const eveOk = p.codes[i] !== 'X';
      const amOk = (i === 5 || i === 6) && p.amOk[i];
      if (!eveOk && !amOk) return;
      possible++;
      const x = node();   // 하루에 저녁·오전 중 하나만
      edge(a, x, 1, 0);
      if (eveOk) { edge(x, eveNode[i], 1, 0); links.push({ p, day: i, am: false, u: x, ei: g[x].length - 1 }); }
      if (amOk) { edge(x, amNode[i], 1, 0); links.push({ p, day: i, am: true, u: x, ei: g[x].length - 1 }); }
    });
    const histAdj = Math.round(2 * (histVals[k] - histMean));
    for (let c = 1; c <= possible; c++) edge(S, a, 1, c <= p.minDays ? -1000 : -50 + 4 * c - (p.priority ? 6 : 0) + histAdj);
  });
  DAYS.forEach((d, i) => {
    const need = Math.max(0, cfg.min[i] - jungCnt[i]);
    const room = Math.max(0, cfg.max[i] - jungCnt[i]);
    for (let c = 1; c <= room; c++) edge(eveNode[i], T, 1, c <= need ? -200 : 0);
    const o = cfg.overflow.indexOf(d);
    if (o >= 0) for (let c = 0; c < 3; c++) edge(eveNode[i], T, 1, 100 + 10 * o + 30 * c);
  });
  [5, 6].forEach(i => {
    const o = cfg.overflow.indexOf(DAYS[i] + ' 오전');
    if (o >= 0) for (let c = 0; c < 3; c++) edge(amNode[i], T, 1, 100 + 10 * o + 30 * c);
  });
  for (;;) {   // 최단 경로(벨만-포드)로 비용이 음수인 동안만 흘림
    const dist = g.map(() => Infinity), prev = g.map(() => null);
    dist[S] = 0;
    for (let it = 0; it < g.length; it++) {
      let changed = false;
      for (let u = 0; u < g.length; u++) {
        if (dist[u] === Infinity) continue;
        g[u].forEach((e, ei) => {
          if (e.cap > 0 && dist[u] + e.cost < dist[e.v]) { dist[e.v] = dist[u] + e.cost; prev[e.v] = [u, ei]; changed = true; }
        });
      }
      if (!changed) break;
    }
    if (dist[T] >= 0) break;
    for (let v = T; v !== S; ) {
      const [u, ei] = prev[v], e = g[u][ei];
      e.cap -= 1; g[v][e.rev].cap += 1; v = u;
    }
  }
  return links.filter(l => g[l.u][l.ei].cap === 0);
}

// 인원 부족일 단톡 공지 (Code.gs shortageNotice_ 그대로)
export function shortageNotice(dateLabel, short, names) {
  return dateLabel + ' 저녁 근무 인원이 ' + short + '명 부족합니다. 이날 휴무 신청하신 ' + names.join(', ') +
    ' 님 중 ' + short + '명은 출근이 필요합니다. 신청하신 분들끼리 상의(복불복 등)해서 정한 뒤 알려 주세요. 가게 운영을 위해 협조 부탁드립니다 🙏';
}

// 한 주 자동 짜기.
//  people: [{ id, name, disp, group: '정'|'알', offDays: ['월',…], minDays, priority }]
//  cells: { id: [7칸] } 지금 근무표 (정 그룹은 직접 고친 칸 유지, 알바는 ✕만 남김)
//  leaves: { id: { off: [날짜], am: ['토','일'] } }  (낸 사람만. 안 낸 알바 = 전 요일 저녁 가능, 오전 불가)
//  dates: 월~일 날짜 7개 ('YYYY-MM-DD'), cfg: SCHED_DEFAULT 모양, hist: { 이름: 지난 4주 주당 평균 근무일 }
//  overflowStreak: 이번 주 직전까지 과인원 연속 주 수
// 돌려줌: { ok, cells, msgs: [{ kind: 'stop'|'notice'|'warn'|'done', text }] }
export function autoSchedule({ people, cells, leaves = {}, dates, cfg: cfg0, hist = {}, overflowStreak = 0, now = '' }) {
  const cfg = { ...SCHED_DEFAULT, ...(cfg0 || {}) };
  const md = d => `${+d.slice(5, 7)}/${+d.slice(8)}`;
  const out = {}; Object.keys(cells || {}).forEach(k => { out[k] = [...cells[k]]; });
  const P = people.map(p => ({ ...p, codes: [...(out[p.id] || ['', '', '', '', '', '', ''])].map(c => c || '') }));
  const jung = P.filter(p => p.group === '정'), al = P.filter(p => p.group !== '정');
  const msgs = [], save = () => { P.forEach(p => { out[p.id] = p.codes; }); };

  // 1. 정 그룹: 빈칸만 고정휴무대로
  jung.forEach(p => { const off = p.offDays || []; p.codes = p.codes.map((c, i) => c || (off.includes(DAYS[i]) ? 'X' : 'O')); });

  // 2. 동시휴무 금지 검사 → 위반이면 멈춤
  (cfg.pairs || []).map(x => (Array.isArray(x) ? x : [x.a, x.b])).forEach(([a, b]) => {   // DB엔 {a, b} (Firestore는 배열 안 배열 불가)
    const pa = jung.find(p => p.name === a), pb = jung.find(p => p.name === b);
    if (!pa || !pb) return;
    DAYS.forEach((d, i) => { if (!isEve(pa.codes[i]) && !isEve(pb.codes[i])) msgs.push({ kind: 'stop', text: `⛔ 동시휴무 금지 위반: ${d}요일 ${a}·${b} 둘 다 휴무` }); });
  });
  if (msgs.length) { save(); return { ok: false, cells: out, msgs }; }

  // 3. 알바: 휴무신청 ✕ 반영 + 지난 배정은 지우고 ✕만
  al.forEach(p => {
    const l = leaves[p.id];
    p.codes = p.codes.map((c, i) => (c === 'X' || (l && (l.off || []).includes(dates[i])) ? 'X' : ''));
    p.minDays = p.minDays == null ? cfg.defMin : p.minDays;
    p.priority = !!p.priority;
    const am = (l && l.am) || [];
    p.amOk = { 5: am.includes('토'), 6: am.includes('일') };
  });
  const jungCnt = DAYS.map((_, i) => jung.filter(p => isEve(p.codes[i])).length);
  const c2 = applyAlbaTarget(cfg, jungCnt);

  // 4. 인원 부족일 → 단톡 공지 멘트
  DAYS.forEach((d, i) => {
    const avail = al.filter(p => p.codes[i] !== 'X').length, short = c2.min[i] - jungCnt[i] - avail;
    if (short > 0) msgs.push({ kind: 'notice', text: '📢 [단톡 공지용] ' + shortageNotice(`${md(dates[i])}(${d})`, short, al.filter(p => p.codes[i] === 'X').map(p => p.disp || p.name)) });
  });

  // 5. 배정
  assign(al, jungCnt, c2, hist).forEach(a => { a.p.codes[a.day] = a.am ? '오전' : 'O'; });
  save();

  // 6. 결과 점검
  const eve = DAYS.map((_, i) => al.filter(p => p.codes[i] === 'O').length);
  DAYS.forEach((d, i) => {
    const total = jungCnt[i] + eve[i];
    if (total > c2.max[i]) msgs.push({ kind: 'warn', text: `⚠️ 과인원: ${d} ${total}명 (상한 ${c2.max[i]}, 최소출근일 보장 때문)` });
    if (total < c2.min[i]) msgs.push({ kind: 'warn', text: `⚠️ 인원 부족: ${d} ${total}명 (최소 ${c2.min[i]})` });
  });
  [5, 6].forEach(i => {
    const am = al.filter(p => p.codes[i] === '오전').map(p => p.disp || p.name);
    if (am.length) msgs.push({ kind: 'warn', text: `⚠️ 과인원: ${DAYS[i]} 오전 ${am.join(', ')}` });
  });
  if (msgs.some(m => m.text.includes('과인원'))) {
    const w = overflowStreak + 1;
    msgs.push({ kind: 'warn', text: `⚠️ 과인원 ${w}주 연속${w >= 3 ? ' → 알바 인원 조정(퇴사·충원) 검토' : ''}` });
  }
  al.forEach(p => {
    const got = p.codes.filter(isWork).length;
    if (got < p.minDays) msgs.push({ kind: 'warn', text: `⚠️ ${p.disp || p.name} 최소 ${p.minDays}일 중 ${got}일만 배정 (불가 신청이 많거나 자리 부족 → 오전 근무 등 확인)` });
  });
  msgs.unshift({ kind: 'done', text: `✅ 자동 짜기 완료${now ? ' ' + now : ''} | 정+알: ` + DAYS.map((d, i) => `${d} ${jungCnt[i]}+${eve[i]}`).join(', ') +
    ' | 알바: ' + al.map(p => `${p.disp || p.name} ${p.codes.filter(isWork).length}`).join(', ') });
  return { ok: true, cells: out, msgs };
}

// 지난 4주 확정 근무표 → 사람별 주당 평균 근무일 (Code.gs readHistory_: 1칸 = 0.25)
export function historyOf(pastSchedules, nameOfId) {
  const h = {};
  pastSchedules.filter(Boolean).forEach(s => Object.entries(s.cells || {}).forEach(([id, cs]) => {
    const n = nameOfId(id); if (!n) return;
    cs.forEach(c => { if (isWork(c)) h[n] = (h[n] || 0) + 0.25; });
  }));
  return h;
}
// 그 주 근무표가 과인원이었는지 (Code.gs saveRecord가 남기던 "(과인원)" 표시와 같은 기준)
export function wasOverflow(sch, people, cfg0) {
  if (!sch || !sch.cells) return false;
  const cfg = { ...SCHED_DEFAULT, ...(cfg0 || {}) }, grp = Object.fromEntries(people.map(p => [p.id, p.group]));
  const col = i => Object.entries(sch.cells).map(([id, cs]) => ({ g: grp[id], c: cs[i] || '' }));
  const jungCnt = DAYS.map((_, i) => col(i).filter(x => x.g === '정' && isEve(x.c)).length);
  const c2 = applyAlbaTarget(cfg, jungCnt);
  return DAYS.some((_, i) => col(i).filter(x => isEve(x.c)).length > c2.max[i] || col(i).some(x => isAm(x.c)));
}
