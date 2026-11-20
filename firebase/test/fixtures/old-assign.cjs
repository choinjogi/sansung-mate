// 예전 엔진 사본 (스케줄시스템/Code.gs 353~421행, 2026-11-20) — 새 엔진과 결과 비교용
const DAYS = ['월', '화', '수', '목', '금', '토', '일'];
function assign_(al, jungCnt, cfg, hist) {
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
      const x = node();                 // 하루에 저녁·오전 중 하나만
      edge(a, x, 1, 0);
      if (eveOk) { edge(x, eveNode[i], 1, 0); links.push({ p, day: i, am: false, u: x, ei: g[x].length - 1 }); }
      if (amOk) { edge(x, amNode[i], 1, 0); links.push({ p, day: i, am: true, u: x, ei: g[x].length - 1 }); }
    });
    const histAdj = Math.round(2 * (histVals[k] - histMean));
    for (let c = 1; c <= possible; c++) {
      edge(S, a, 1, c <= p.minDays ? -1000 : -50 + 4 * c - (p.priority ? 6 : 0) + histAdj);
    }
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

  // 최단 경로(벨만-포드)로 비용이 음수인 동안만 흘림
  for (;;) {
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
      const [u, ei] = prev[v];
      const e = g[u][ei];
      e.cap -= 1;
      g[v][e.rev].cap += 1;
      v = u;
    }
  }
  return links.filter(l => g[l.u][l.ei].cap === 0);
}
module.exports = { assign_ };
