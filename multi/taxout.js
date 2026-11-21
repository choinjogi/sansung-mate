// 월말 출력 (사장님) — 지금 월말 메일과 같은 결과물
//  · 세무사 근태기록부 = 세무사양식_v3 그대로: 1쪽 요약(이름·총 근무시간) + 직원 1명당 1장
//      위: 년도.월 / 이름 / 시급(정직원은 "월급 2,100,000")
//      줄: 주차·날짜·요일·출근·퇴근·주간·야간(22시 넘은 시간)·합(퇴근 − 출근). 출근 = 계산 시작(정시·일찍 부름·늦으면 찍은 시각)
//      엑셀(.xlsx, 색·수식 그대로) / PDF(인쇄 화면 → PDF로 저장)
//  · 월말결제 이미지 (송금 담당용) = 결산 "월말결제"처럼 알바·반직원 이름·급여·은행·계좌 + 알바 합계·송금 총합
const DOW = ['일', '월', '화', '수', '목', '금', '토'];
const hOf = hm => (hm ? +hm.slice(0, 2) + +hm.slice(3, 5) / 60 : null);
const r1 = x => Math.round(x * 10) / 10;
export const ym = month => month.replace('-', '.');   // '2026-11' → '2026.11'

// 사람 한 명의 근태기록부 줄 (퇴근 있는 날만)
export function taxRows(days) {
  const ds = days.filter(d => d.out).sort((a, b) => (a.date < b.date ? -1 : 1));
  let w = 1;
  const nums = ds.map((d, i) => { if (i > 0 && new Date(d.date + 'T12:00:00Z').getUTCDay() === 1) w++; return w; });
  return ds.map((d, i) => {
    const f = hOf(d.calcStart || d.in), g0 = hOf(d.out), g = g0 != null && f != null && g0 < f ? g0 + 24 : g0;   // 자정 넘긴 퇴근
    const sum = f != null && g != null ? g - f : 0, night = g != null && g > 22 ? g - 22 : 0;
    return { week: nums[i] === w && w > 1 ? '마지막' : nums[i] + '주', wn: nums[i], day: +d.date.slice(8), dow: DOW[new Date(d.date + 'T12:00:00Z').getUTCDay()],
      start: d.calcStart || d.in || '', out: d.out, f, g, day_h: r1(sum - night), night: r1(night), sum: r1(sum) };
  });
}
export const rateText = r => (r.full ? '월급 ' + Number(r.wage || 0).toLocaleString('ko-KR') : r.wage || '');

// ---------- 엑셀 (xlsx-js-style, 필요할 때만 불러옴) ----------
const XLSX_URL = 'https://cdn.jsdelivr.net/npm/xlsx-js-style@1.2.0/dist/xlsx.bundle.js';
function loadXlsx() {
  if (window.XLSX) return Promise.resolve(window.XLSX);
  return new Promise((ok, no) => { const s = document.createElement('script'); s.src = XLSX_URL; s.onload = () => ok(window.XLSX); s.onerror = () => no(new Error('엑셀 도구를 못 불러왔어요 (인터넷 확인)')); document.head.appendChild(s); });
}
const BLUE = 'C6D9F0', HEAD = 'BFBFBF', WEEK = ['F2F2F2', 'FDE9D9'], TOTAL = 'A6A6A6', RED = 'FF0000';
const thin = { style: 'thin', color: { rgb: '000000' } }, dot = { style: 'dotted', color: { rgb: '000000' } };
const st = (o = {}) => ({ alignment: { horizontal: 'center', vertical: 'center' }, font: { name: '맑은 고딕', sz: o.sz || 9, bold: !!o.b, color: { rgb: o.fg || '000000' } },
  ...(o.bg ? { fill: { patternType: 'solid', fgColor: { rgb: o.bg } } } : {}), border: o.bd === false ? {} : { top: o.bd || dot, bottom: o.bd || dot, left: o.bd || dot, right: o.bd || dot } });

function personSheet(X, month, r) {
  const rows = taxRows(r.days), ws = {}, merges = [], top = 8, tot = top + rows.length;
  const put = (a, v, s, t) => { ws[a] = { v, t: t || (typeof v === 'number' ? 'n' : 's'), s }; };
  put('C3', '년도. 월', st({ fg: RED, bd: false })); put('E3', '이름', st({ bd: false })); put('H3', '시급', st({ fg: RED, bd: false }));
  merges.push('C3:D3', 'E3:G3', 'H3:J3', 'C4:D5', 'E4:G5', 'H4:J5', 'C6:E6', 'H6:J6');
  put('C4', ym(month), st({ bg: BLUE, b: 1, sz: 10, bd: thin })); put('E4', r.name, st({ bg: BLUE, b: 1, sz: 11, bd: thin }));
  const rate = rateText(r); put('H4', rate, { ...st({ bg: BLUE, b: 1, sz: 11, fg: RED, bd: thin }), numFmt: '#,##0' });
  ['D4', 'C5', 'D5', 'F4', 'G4', 'E5', 'F5', 'G5', 'I4', 'J4', 'H5', 'I5', 'J5'].forEach(a => { ws[a] = { v: '', t: 's', s: st({ bg: BLUE, bd: thin }) }; });
  put('C6', 'date', st({ bg: HEAD })); ws.D6 = { v: '', t: 's', s: st({ bg: HEAD }) }; ws.E6 = { v: '', t: 's', s: st({ bg: HEAD }) };
  put('F6', '출근', st({ bg: HEAD })); put('G6', '퇴근', st({ bg: HEAD })); put('H6', '주/야간구분', st({ bg: HEAD })); ws.I6 = { v: '', t: 's', s: st({ bg: HEAD }) }; ws.J6 = { v: '', t: 's', s: st({ bg: HEAD }) };
  ['주간', '날짜', '요일', '입력', '입력', '주간', '야간', '합'].forEach((t, i) => put('CDEFGHIJ'[i] + '7', t, st({ bg: HEAD })));
  rows.forEach((x, i) => {
    const n = top + i, s = st({ bg: WEEK[(x.wn + 1) % 2] });
    put('C' + n, x.week, s); put('D' + n, x.day, s); put('E' + n, x.dow, s);
    ws['F' + n] = { v: x.f / 24, t: 'n', s: { ...s, numFmt: '[h]:mm' } }; ws['G' + n] = { v: x.g / 24, t: 'n', s: { ...s, numFmt: '[h]:mm' } };
    ws['H' + n] = { f: `J${n}-I${n}`, v: x.day_h, t: 'n', s: { ...s, numFmt: '0.0' } };
    ws['I' + n] = { f: `IF(G${n}*24>22,G${n}*24-22,0)`, v: x.night, t: 'n', s: { ...s, numFmt: '0.0' } };
    ws['J' + n] = { f: `(G${n}-F${n})*24`, v: x.sum, t: 'n', s: { ...s, numFmt: '0.0' } };
  });
  const sum = k => r1(rows.reduce((a, x) => a + x[k], 0));
  merges.push(`C${tot}:E${tot}`);
  ['C', 'D', 'E', 'F', 'G'].forEach(c => { ws[c + tot] = { v: '', t: 's', s: st({ bg: TOTAL, bd: thin }) }; });
  [['H', 'day_h'], ['I', 'night'], ['J', 'sum']].forEach(([c, k]) => { ws[c + tot] = rows.length ? { f: `SUM(${c}${top}:${c}${tot - 1})`, v: sum(k), t: 'n', s: { ...st({ bg: TOTAL, bd: thin }), numFmt: '0.0' } } : { v: 0, t: 'n', s: st({ bg: TOTAL, bd: thin }) }; });
  ws['!ref'] = `A1:J${tot}`;
  ws['!merges'] = merges.map(a => X.utils.decode_range(a));
  ws['!cols'] = [75, 12, 44, 48, 40, 56, 56, 52, 52, 52].map(px => ({ wpx: px }));
  return ws;
}
export async function taxXlsx(storeName, month, pr) {
  const X = await loadXlsx(), wb = X.utils.book_new(), people = pr.rows.filter(r => r.days.some(d => d.out));
  const sum = [[`${storeName} ${ym(month)} 전직원 근무내역`], [`세무사 제출용 · 작성 ${new Date().toLocaleString('ko-KR')}`], [], ['이름', '총 근무시간']]
    .concat(people.map(r => [r.name, r1(taxRows(r.days).reduce((a, x) => a + x.sum, 0)) + '시간']));
  const ws0 = X.utils.aoa_to_sheet(sum); ws0['!cols'] = [{ wpx: 120 }, { wpx: 120 }];
  ws0.A1.s = { font: { sz: 15, bold: true } };
  X.utils.book_append_sheet(wb, ws0, '요약');
  people.forEach(r => X.utils.book_append_sheet(wb, personSheet(X, month, r), r.name.slice(0, 31)));
  const out = X.write(wb, { bookType: 'xlsx', type: 'array' });
  return new Blob([out], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
}

// ---------- PDF (인쇄 화면: 1쪽 요약 + 1명 1쪽) ----------
const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const hm = h => (h == null ? '' : `${Math.floor(h)}:${String(Math.round((h % 1) * 60)).padStart(2, '0')}`);
export function taxHtml(storeName, month, pr) {
  const people = pr.rows.filter(r => r.days.some(d => d.out));
  const page = r => { const rows = taxRows(r.days), t = k => r1(rows.reduce((a, x) => a + x[k], 0));
    return `<section><table class="hd"><tr><td class="lb red">년도. 월</td><td class="lb">이름</td><td class="lb red">시급</td></tr>
      <tr><td class="bl">${ym(month)}</td><td class="bl">${esc(r.name)}</td><td class="bl red">${esc(typeof rateText(r) === 'number' ? rateText(r).toLocaleString('ko-KR') : rateText(r))}</td></tr></table>
      <table class="tb"><tr class="g"><td colspan="3">date</td><td>출근</td><td>퇴근</td><td colspan="3">주/야간구분</td></tr>
      <tr class="g"><td>주간</td><td>날짜</td><td>요일</td><td>입력</td><td>입력</td><td>주간</td><td>야간</td><td>합</td></tr>
      ${rows.map(x => `<tr class="w${(x.wn + 1) % 2}"><td>${x.week}</td><td>${x.day}</td><td>${x.dow}</td><td>${hm(x.f)}</td><td>${hm(x.g)}</td><td>${x.day_h.toFixed(1)}</td><td>${x.night.toFixed(1)}</td><td>${x.sum.toFixed(1)}</td></tr>`).join('')}
      <tr class="t"><td colspan="5"></td><td>${t('day_h').toFixed(1)}</td><td>${t('night').toFixed(1)}</td><td>${t('sum').toFixed(1)}</td></tr></table></section>`; };
  return `<!doctype html><html lang="ko"><head><meta charset="utf-8"><title>${esc(storeName)}_${ym(month)}_근태기록부</title><style>
    body{font-family:'맑은 고딕','Malgun Gothic','Apple SD Gothic Neo',sans-serif;margin:0;color:#000;background:#fff}
    section{page-break-after:always;padding:18px 24px} section:last-child{page-break-after:auto}
    h1{font-size:18px;margin:0 0 4px} .s{font-size:11px;color:#666}
    table{border-collapse:collapse;text-align:center} .hd{margin:10px 0 8px} .hd td{width:150px;padding:4px}
    .lb{font-size:11px} .red{color:#f00} .bl{background:#c6d9f0;font-weight:700;border:1px solid #000;height:30px}
    .tb td{border:1px dotted #000;font-size:12px;padding:3px 8px;min-width:38px} .g td{background:#bfbfbf} .w0 td{background:#f2f2f2} .w1 td{background:#fde9d9} .t td{background:#a6a6a6;font-weight:700}
    .sum td,.sum th{border:1px solid #999;padding:5px 18px;font-size:13px} .sum th{background:#efefef}
    @page{size:A4;margin:12mm}</style></head><body>
    <section><h1>${esc(storeName)} ${ym(month)} 전직원 근무내역</h1><div class="s">세무사 제출용 · 작성 ${new Date().toLocaleString('ko-KR')}</div>
      <table class="sum" style="margin-top:14px"><tr><th>이름</th><th>총 근무시간</th></tr>${people.map(r => `<tr><td>${esc(r.name)}</td><td>${r1(taxRows(r.days).reduce((a, x) => a + x.sum, 0)).toFixed(1)}시간</td></tr>`).join('')}</table>
      <p class="s" style="margin-top:12px">다음 쪽부터 직원별 근태기록부 (세무사 양식)</p></section>
    ${people.map(page).join('')}<script>setTimeout(()=>print(),400)<\/script></body></html>`;
}

// ---------- 월말결제 이미지 (송금 담당용) ----------
// rows: 알바(정 아님) + 반직원(half). priv: { uid: { bank, account } }
export function payModel(pr, priv, halfIds) {
  const pick = r => ({ name: r.name, pay: Math.round(r.pay), bank: (priv[r.uid] || {}).bank || '', account: (priv[r.uid] || {}).account || '' });
  const alba = pr.rows.filter(r => !r.full).map(pick), half = pr.rows.filter(r => r.full && halfIds.has(r.uid)).map(pick);
  const albaSum = alba.reduce((a, x) => a + x.pay, 0), halfSum = half.reduce((a, x) => a + x.pay, 0);
  return { alba, half, albaSum, total: albaSum + halfSum };
}
export function payCanvas(title, m, doc = document) {
  const W = [90, 110, 100, 170], H = 32, P = 16, S = 2, lines = [['이름', '급여', '은행', '계좌번호', 'h'], ...m.alba.map(x => [x.name, x.pay, x.bank, x.account]), ['알바 합계', m.albaSum, '', '', 's'],
    ...m.half.map(x => [x.name, x.pay, x.bank, x.account]), ['송금 총합', m.total, '', '', 't']];
  const width = P * 2 + W.reduce((a, b) => a + b, 0), height = P * 2 + 34 + lines.length * H;
  const cv = doc.createElement('canvas'); cv.width = width * S; cv.height = height * S;
  const g = cv.getContext('2d'); g.scale(S, S);
  const font = (px, b) => `${b ? '700 ' : ''}${px}px 'Noto Sans KR','Apple SD Gothic Neo','Malgun Gothic',sans-serif`;
  g.fillStyle = '#fff'; g.fillRect(0, 0, width, height);
  g.fillStyle = '#000'; g.font = font(15, true); g.textBaseline = 'middle'; g.fillText(title, P, P + 12);
  lines.forEach((L, i) => {
    const y = P + 34 + i * H, k = L[4];
    let x = P;
    g.fillStyle = k === 'h' ? '#2a2a2e' : k === 's' ? '#f5f3f1' : k === 't' ? '#a4262c' : i % 2 ? '#ffffff' : '#fafafa';
    g.fillRect(P, y, width - P * 2, H);
    L.slice(0, 4).forEach((v, ci) => {
      g.fillStyle = k === 'h' || k === 't' ? '#fff' : '#000'; g.font = font(13, !!k || ci === 1);
      g.textAlign = ci === 1 ? 'right' : 'left';
      g.fillText(ci === 1 && typeof v === 'number' ? '₩ ' + v.toLocaleString('ko-KR') : String(v), ci === 1 ? x + W[ci] - 10 : x + 8, y + H / 2, W[ci] - 12);
      x += W[ci];
    });
    g.strokeStyle = '#ddd'; g.beginPath(); g.moveTo(P, y + H); g.lineTo(width - P, y + H); g.stroke();
  });
  return cv;
}
