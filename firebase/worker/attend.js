// 근태 알림 (Cloudflare cron 10분마다, 한국 시각 10~23시) — 산성 NFC checkNoShow · dailySummary 대신 폰 알림
//  · 당일 미출근: 오늘 근무인 알바가 (기준 + 30분)까지 출근·퇴근 기록이 없으면 사장님·매니저에게 1인 1회
//  · 매일 요약: 10시대에 한 번, 어제 미출근·지각·퇴근 없음·스케줄 외·혼자 퇴근·와이파이 아님·승인 대기 → 사장님. 확인할 게 없으면 안 보냄
// 기준(정시·주말 오전·일찍 부르기·확정된 근무표만)은 화면과 같은 ../../multi/attcheck.js
import { noShowNow, compare, summaryText, addDays, mondayOf } from '../../multi/attcheck.js';
import { pushTo } from './push.js';

const kstNow = now => { const s = new Date(now + 9 * 3600e3).toISOString(); return { date: s.slice(0, 10), hm: s.slice(11, 16), h: +s.slice(11, 13) }; };
const msOf = at => (typeof at === 'string' ? Date.parse(at) : typeof at === 'number' ? at : null);

// 그 달에 적용되는 매장 규칙 (문서 이름 = 적용 시작 달)
async function rulesOf(db, S, month) {
  const rs = (await db.list(`${S}/rules`)).sort((a, b) => (a.id < b.id ? -1 : 1));
  return rs.filter(r => r.id <= month).pop() || rs[0] || null;
}
// 그날 출퇴근 (문서 이름 = 날짜_uid_in|out → 사람마다 2개 읽기, 모음 전체를 훑지 않음)
async function punchesOf(db, S, ms, date) {
  const got = await Promise.all(ms.flatMap(m => ['in', 'out'].map(k => db.get(`${S}/punches/${date}_${m.id}_${k}`).catch(() => null))));
  return got.filter(Boolean).map(p => ({ ...p, atMs: msOf(p.at) })).filter(p => p.atMs);
}

export async function runAttend(env, db, now = Date.now()) {
  const t = kstNow(now), out = [];
  if (t.h < 10) return out;
  for (const st of await db.list('stores')) {
    if (st.mirror) continue;   // 병행 중(예전 시트에서 복사해 오는 매장): 기록이 퇴근 뒤에 들어와서 미출근 알림이 틀림
    const S = `stores/${st.id}`;
    const all = (await db.list(`${S}/members`)).filter(m => !m.noLogin);
    const active = all.filter(m => m.status === 'active' && !(m.leaveDate && m.leaveDate < t.date));
    const bosses = st.ownerUids || [], managers = active.filter(m => m.role === 'manager').map(m => m.id);
    const log = (await db.get(`${S}/settings/attLog`)) || {};
    const rules = await rulesOf(db, S, t.date.slice(0, 7));

    // 1) 당일 미출근
    const sch = await db.get(`${S}/schedules/${mondayOf(t.date)}`);
    if (sch && sch.published) {
      const ps = await punchesOf(db, S, active.filter(m => m.type !== '정'), t.date);
      const done = log.noShowDate === t.date ? log.noShow || [] : [];
      const ns = noShowNow({ members: active, sch, rules, punches: ps, date: t.date, nowHm: t.hm }).filter(x => !done.includes(x.id));
      if (ns.length) {
        Object.assign(log, { noShowDate: t.date, noShow: [...done, ...ns.map(x => x.id)] });
        await db.set(`${S}/settings/attLog`, log);   // 먼저 적어서 두 번 안 보냄
        const names = ns.map(x => x.disp).join(', ');
        const r = await pushTo(env, db, st.id, [...new Set([...bosses, ...managers])], { title: `미출근: ${names}`, body: ns.map(x => `${x.disp} ${x.start}`).join(' · ') + ' 출근인데 아직 기록이 없어요' });
        out.push({ store: st.id, kind: 'noShow', names, ...r });
      }
    }

    // 2) 매일 요약 (10시대 한 번, 어제 기준)
    if (t.h === 10 && log.summary !== t.date) {
      const y = addDays(t.date, -1), ySch = await db.get(`${S}/schedules/${mondayOf(y)}`);
      const yMembers = all.filter(m => m.status === 'active' || (m.status === 'left' && !(m.leaveDate && m.leaveDate < y)));
      const ps = await punchesOf(db, S, yMembers, y);
      const cmp = compare({ members: yMembers, schedules: { [mondayOf(y)]: ySch }, punches: ps, rules, from: y, to: y, today: t.date });
      const priv = await db.list(`${S}/private`).catch(() => []);
      const text = summaryText(cmp, {
        pendingJoin: all.filter(m => m.status === 'pending').length,
        earlyWait: ps.filter(p => p.kind === 'in' && p.earlyReq && p.earlyReq.status === 'wait').length,
        infoWait: priv.filter(p => p.req).length,
        alone: ps.filter(p => p.kind === 'out' && p.why === 'alone').length,
        wifiNo: ps.filter(p => p.kind === 'in' && p.flag && p.why !== 'alone').length,
      });
      log.summary = t.date;
      await db.set(`${S}/settings/attLog`, log);
      if (text) {
        const r = await pushTo(env, db, st.id, bosses, { title: `어제(${+y.slice(5, 7)}/${+y.slice(8)}) 확인할 것`, body: text });
        out.push({ store: st.id, kind: 'summary', text, ...r });
      }
    }
  }
  return out;
}
