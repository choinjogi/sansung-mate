// 급여 계산식만 (화면·서버 없이 시험할 수 있게 따로 둠). 설명은 pay.js 맨 위
export const won = n => (n == null ? '-' : Math.round(n).toLocaleString() + '원');
export const lastDay = month => { const [y, m] = month.split('-').map(Number); return new Date(Date.UTC(y, m, 0)).getUTCDate(); };
export const addMonth = (month, n) => { const [y, m] = month.split('-').map(Number); const d = new Date(Date.UTC(y, m - 1 + n, 1)); return d.toISOString().slice(0, 7); };
export const weekNo = date => Math.floor((+date.slice(8, 10) - 1) / 7); // 0 = 1~7일

// 그 달에 적용되는 시급(알바) 또는 월급(정직원). 이력 { from:'YYYY-MM', wage } 중 그 달 이전(포함) 가장 최근. 없으면 매장 기본 시급(알바만)
export function wageOf(wagesDoc, month, rules, isFull) {
  const h = ((wagesDoc && wagesDoc.history) || []).filter(x => x.from <= month).sort((a, b) => (a.from < b.from ? -1 : 1)).pop();
  if (h) return h.wage;
  return isFull ? null : (rules && rules.pay && rules.pay.baseWage) || null;
}

// 알바 한 사람: days = [{ date, min }]
export function albaPay(days, wage, { noJuhu = false, juhu = { on: true, minWeekHours: 15 } } = {}) {
  const totalMin = days.reduce((a, d) => a + (d.min || 0), 0);
  const weeks = [0, 0, 0, 0, 0];
  days.forEach(d => { weeks[weekNo(d.date)] += d.min || 0; });
  const on = juhu && juhu.on !== false && !noJuhu, minW = ((juhu && juhu.minWeekHours) || 15) * 60;
  const juhuW = weeks.map(m => (on && wage && m >= minW ? (Math.min(m, 2400) / 60) * wage * 0.2 : 0));
  const base = wage ? (totalMin / 60) * wage : 0;
  const juhuSum = juhuW.reduce((a, b) => a + b, 0);
  return { totalMin, weeks, juhuW, base, juhu: juhuSum, pay: base + juhuSum };
}

// 정직원 한 사람: 그 달 일한 날짜 범위로 일할
export function fullPay(month, salary, { startDate, endDate } = {}) {
  const n = lastDay(month), first = month + '-01', last = `${month}-${String(n).padStart(2, '0')}`;
  const a = startDate && startDate > first ? startDate : first, b = endDate && endDate < last ? endDate : last;
  const days = a > b ? 0 : Math.round((Date.parse(b) - Date.parse(a)) / 864e5) + 1;
  return { salary, days, monthDays: n, pay: salary ? (days === n ? salary : (salary / n) * days) : 0 };
}

