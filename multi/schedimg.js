// 단톡용 근무표 = 산성 스케줄 "출력" 시트와 같은 양식 (남색 바탕 + 알바마다 고유색 칸, ✕ 빨강, 주말 오전 노란 글씨)
//  · model(): 근무표 → 표 모양 (화면·공개 링크·이미지가 같이 씀). 이름 대신 표시이름만 들어감 (공개 링크에 실명·개인정보 없음)
//  · html(): 공개 링크 페이지용 표, canvas(): [이미지 저장]용 PNG
// 칸: 'O' 근무 · '오전' 주말 오전 · 'O+오전' · 'X' 휴무/불가 · '' 미배정
export const OUT = {
  bg: '#141b2d', head: '#26304a', name: '#2a3550', nameFg: '#c9d4ee',
  jung: '#3a4256', x: '#ff6b6b', am: '#ffd54f', sat: '#8ab4f8', sun: '#f28b82', total: '#8f9bb8',
  person: ['#8a4b4b', '#8a6a33', '#64753a', '#2f7a58', '#2f7676', '#35608f', '#5a4a8f', '#7a3d6e', '#7a5844', '#456b7d'],
};
const DAYS = ['월', '화', '수', '목', '금', '토', '일'];
const isEve = c => c === 'O' || c === 'O+오전';
const isAm = c => c === '오전' || c === 'O+오전';
const isWork = c => isEve(c) || c === '오전';
const addDays = (d, n) => { const t = new Date(d + 'T12:00:00Z'); t.setUTCDate(t.getUTCDate() + n); return t.toISOString().slice(0, 10); };

// rows: [{ disp, g: '정'|'알', fixed: 고정 근무 알바(정 그룹인데 급여 알바) → 휴무 ✕ 표시, c: [7칸] }]  (정 그룹 먼저 넘김)
export function model({ storeName, week, rows }) {
  const jung = rows.filter(r => r.g === '정'), al = rows.filter(r => r.g !== '정');
  const cell = (r, i) => {
    const c = r.c[i] || '';
    if (c === 'O') return { t: r.disp };
    if (c === '오전') return { t: r.disp, sub: '오전', am: true };
    if (c === 'O+오전') return { t: r.disp, sub: '오전+오후', am: true };
    if (c === 'X') return r.g === '정' && !r.fixed ? { t: '' } : { t: '✕', x: true };
    return { t: '' };
  };
  const dates = DAYS.map((_, i) => addDays(week, i));
  const head = [{ t: '이름' }, ...dates.map((d, i) => ({ t: `${+d.slice(8)} ${DAYS[i]}`, sat: i === 5, sun: i === 6 })), { t: '총근무' }];
  const line = (r, k, idx) => ({ kind: k, idx, cells: [{ t: r.disp, name: true }, ...DAYS.map((_, i) => cell(r, i)), { t: k === 'al' ? r.c.filter(isWork).length + '일' : '', total: true }] });
  const foot = [{ t: '정+알' }, ...DAYS.map((_, i) => {
    const j = jung.filter(r => isEve(r.c[i])).length, a = al.filter(r => isEve(r.c[i])).length, am = rows.filter(r => isAm(r.c[i])).length;
    return { t: `${j}+${a}`, sub: am ? '오전' + am : '' };
  }), { t: '' }];
  const md = d => `${+d.slice(5, 7)}/${+d.slice(8)}`;
  return {
    title: `${storeName} 근무표 · ${md(dates[0])}(월) – ${md(dates[6])}(일)`,
    lines: [{ kind: 'head', cells: head }, ...jung.map((r, i) => line(r, 'jung', i)), { kind: 'blank', cells: [] }, ...al.map((r, i) => line(r, 'al', i)), { kind: 'head', cells: foot, foot: true }],
  };
}
// 칸 색: [바탕, 글씨, 아래 작은 글씨]
function colorOf(L, c, ci) {
  if (L.kind === 'head') return [OUT.head, c.sat ? OUT.sat : c.sun ? OUT.sun : '#ffffff', OUT.am];
  if (ci === 0) return [OUT.name, OUT.nameFg, OUT.nameFg];
  if (c.total) return [OUT.bg, OUT.total, OUT.total];
  if (c.x) return [OUT.bg, OUT.x, OUT.x];
  if (!c.t) return [OUT.bg, '#ffffff', '#ffffff'];
  const bg = L.kind === 'jung' ? OUT.jung : OUT.person[L.idx % OUT.person.length], fg = c.am ? OUT.am : '#ffffff';
  return [bg, fg, fg];
}
const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[ch]);
export function html(m) {
  const rows = m.lines.map(L => L.kind === 'blank' ? '<tr><td colspan="9" style="height:10px;background:' + OUT.bg + '"></td></tr>'
    : '<tr>' + L.cells.map((c, ci) => { const [bg, fg, sub] = colorOf(L, c, ci);
      return `<td style="background:${bg};color:${fg};${ci === 0 ? 'text-align:left;font-weight:700;' : ''}${L.kind === 'head' ? 'font-weight:700;' : ''}">${esc(c.t)}${c.sub ? `<div style="font-size:9px;font-weight:700;color:${sub}">${esc(c.sub)}</div>` : ''}</td>`; }).join('') + '</tr>').join('');
  return `<div style="background:${OUT.bg};padding:10px;border-radius:10px;overflow-x:auto"><div style="color:#fff;font-weight:700;font-size:15px;margin:2px 2px 8px">${esc(m.title)}</div>
    <table style="border-collapse:separate;border-spacing:3px;width:100%;font-size:13px;text-align:center;font-family:'Noto Sans KR',sans-serif">${rows}</table></div>`;
}
// 이미지 (휴대폰 캡처 대신 [이미지 저장])
export function canvas(m, doc = document) {
  const W = [74, 58, 58, 58, 58, 58, 58, 58, 54], H = 40, G = 3, P = 14, TH = 34, S = 2;
  const width = P * 2 + W.reduce((a, b) => a + b, 0) + G * (W.length - 1);
  const height = P * 2 + TH + m.lines.reduce((a, L) => a + (L.kind === 'blank' ? 10 : H) + G, 0);
  const cv = doc.createElement('canvas'); cv.width = width * S; cv.height = height * S;
  const g = cv.getContext('2d'); g.scale(S, S);
  const font = (px, b) => `${b ? '700 ' : ''}${px}px 'Noto Sans KR', 'Apple SD Gothic Neo', 'Malgun Gothic', sans-serif`;
  g.fillStyle = OUT.bg; g.fillRect(0, 0, width, height);
  g.fillStyle = '#fff'; g.font = font(15, true); g.textBaseline = 'middle'; g.fillText(m.title, P, P + TH / 2 - 4);
  let y = P + TH;
  m.lines.forEach(L => {
    if (L.kind === 'blank') { y += 10 + G; return; }
    let x = P;
    L.cells.forEach((c, ci) => {
      const [bg, fg, sub] = colorOf(L, c, ci), w = W[ci];
      g.fillStyle = bg; if (g.roundRect) { g.beginPath(); g.roundRect(x, y, w, H, 4); g.fill(); } else g.fillRect(x, y, w, H);
      g.textAlign = ci === 0 ? 'left' : 'center';
      const tx = ci === 0 ? x + 8 : x + w / 2;
      g.fillStyle = fg; g.font = font(13, L.kind === 'head' || ci === 0 || c.am);
      g.fillText(c.t, tx, c.sub ? y + 15 : y + H / 2, w - 6);
      if (c.sub) { g.fillStyle = sub; g.font = font(9, true); g.fillText(c.sub, tx, y + 30, w - 4); }
      x += w + G;
    });
    y += H + G;
  });
  return cv;
}
