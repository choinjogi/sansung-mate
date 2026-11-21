// 산성 화면(multi2) 자동 시험: 매장·승인은 지금 새 앱(multi)으로, 직원은 산성 화면(multi2)으로 써 본다.
// 실행: npm run e2e  (연습용 서버 = 에뮬레이터. 실제 데이터와 무관)
// 화면 사진: SHOTS 환경변수 폴더(없으면 안 찍음)
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { join, extname, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('playwright'); // 컴퓨터에 깔린 playwright 사용

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const SHOTS = process.env.SHOTS;
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.png': 'image/png', '.json': 'application/json', '.webmanifest': 'application/manifest+json' };
const server = http.createServer(async (req, res) => {
  const p = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname)).replace(/^(\.\.[/\\])+/, '');
  const file = join(ROOT, /[\\/]$/.test(p) ? p + 'index.html' : p); // 윈도우에서는 / 가 \ 로 바뀜
  try { const b = await readFile(file); res.writeHead(200, { 'Content-Type': TYPES[extname(file)] || 'application/octet-stream' }); res.end(b); }
  catch { res.writeHead(404); res.end(); }
}).listen(5173);
const APP = 'http://localhost:5173/multi/old.html', APP2 = 'http://localhost:5173/multi/';  // 2판 = /multi/ 자리

// 출퇴근 서버: 기본은 Cloudflare 판(worker)을 이 컴퓨터에서 띄움. E2E_SERVER=functions 이면 Firebase 서버 함수 판
const USE_FUNCTIONS = process.env.E2E_SERVER === 'functions';
const { default: worker } = await import('../worker/index.js');
const WENV = { PROJECT_ID: 'demo-mate', EMULATOR: '1', FIRESTORE_EMULATOR: 'http://127.0.0.1:8080', AUTH_EMULATOR: '127.0.0.1:9099' };
const wserver = http.createServer(async (req, res) => {
  const chunks = []; for await (const c of req) chunks.push(c);
  const r = await worker.fetch(new Request('http://127.0.0.1:8787' + req.url, { method: req.method, headers: req.headers, body: ['GET', 'HEAD'].includes(req.method) ? undefined : Buffer.concat(chunks) }), WENV);
  res.writeHead(r.status, Object.fromEntries(r.headers)); res.end(Buffer.from(await r.arrayBuffer()));
}).listen(8787);

const browser = await chromium.launch();
const STORE = { latitude: 37.5665, longitude: 126.978 }; // 매장 위치 (시험용)
const phone = async () => {
  const c = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, locale: 'ko-KR',
    permissions: ['geolocation'], geolocation: { ...STORE, accuracy: 20 } });
  if (USE_FUNCTIONS) await c.addInitScript(() => localStorage.setItem('mate_use_functions', '1'));
  return c;
};
const net = (page, ip) => page.evaluate(v => { window.__mateTestIp = v; }, ip); // 연습용: 어느 회선에서 찍는지 흉내
let step = 0;
async function shot(page, name) { if (SHOTS) await page.waitForTimeout(400), await page.screenshot({ path: `${SHOTS}/${String(++step).padStart(2, '0')}-${name}.png`, fullPage: true }); }
function watch(page, who) {
  page.on('dialog', d => d.accept());
  page.on('pageerror', e => { console.error(`[${who}] 화면 오류:`, e.stack || e.message); process.exitCode = 1; });
  page.on('console', m => { if (m.type() === 'error') console.error(`[${who}] console:`, m.text()); });
  page.on('response', r => { if (r.status() === 404) console.error(`[${who}] 404:`, r.url()); });
}
const text = page => page.locator('#app').innerText();
const tab = (page, name) => page.locator('#nav a', { hasText: name }).click(); // 아래 탭
async function googleIn(page, email, name) {
  await page.waitForFunction(() => window.__mate);
  await page.evaluate(([e, n]) => window.__mate.testGoogle(e, n), [email, name]);
}
async function seedOrg(uid) {
  const r = await fetch('http://127.0.0.1:8080/v1/projects/demo-mate/databases/(default)/documents/orgs/org1', {
    method: 'PATCH', headers: { Authorization: 'Bearer owner', 'Content-Type': 'application/json' },
    body: JSON.stringify({ fields: { name: { stringValue: '산성 그룹' }, adminUids: { arrayValue: { values: [{ stringValue: uid }] } } } }),
  });
  assert.ok(r.ok, 'org 만들기 실패 ' + r.status);
}
async function fillRules(page, name, wage) {
  await page.fill('#sn', name);
  await page.fill('#wg', String(wage));
  await page.fill('#pd', '10');
}

try {
  // 준비: 대표님이 지금 새 앱(multi)으로 직영 매장 "산성" 만들기
  const boss = await (await phone()).newPage(); watch(boss, '대표님');
  await boss.goto(APP);
  await googleIn(boss, 'boss@example.com', '대표님');
  const bossUid = await boss.evaluate(() => window.__mate.auth.currentUser.uid);
  await seedOrg(bossUid);
  await boss.reload();
  await boss.getByText('새 직영 매장 만들기').click();
  await fillRules(boss, '산성', 10030);
  await boss.getByText('매장 만들기', { exact: true }).click();
  await boss.getByText('처음 할 일').waitFor();

  // 1) 직원: 산성 화면(multi2) → 매장 찾기 → 처음 가입
  const alba = await (await phone()).newPage(); watch(alba, '알바');
  await alba.goto(APP2);
  await alba.getByText('내 매장 찾기').waitFor();
  await alba.fill('#sn', '산 성');
  await alba.locator('#go').click();
  await alba.getByText('산성 로그인').waitFor();
  await alba.locator('#join').click();
  await alba.fill('#nm', '김알바'); await alba.fill('#p1', '123456'); await alba.fill('#p2', '123456');
  await alba.locator('#go').click();
  await alba.getByText('가입 확인 대기').first().waitFor();
  await shot(alba, 'm2-가입대기');

  // 2) 대표님 승인(지금 새 앱) → 직원 산성 화면 홈
  await tab(boss, '승인');
  await boss.locator('[data-jok]').click();
  await boss.getByText('새 가입 신청이 없어요').waitFor();
  await alba.reload();
  await alba.getByText('이번 주 내 근무').waitFor();
  assert.doesNotMatch(await text(alba), /가입 확인 대기/);
  assert.equal(await alba.locator('#nav a').count(), 4);
  await shot(alba, 'm2-홈');

  // 3) 출근 (매장 와이파이 등록 전이라 ⚠) → 퇴근(사장님 앞) → 근무 구분
  await alba.locator('#cIn').waitFor();
  await alba.locator('#cIn').click();
  await alba.getByText('김알바님 출근 완료').waitFor();
  await alba.getByText('닫기').click();
  await alba.locator('#cOut').waitFor();
  await alba.locator('#cOut').click();
  await alba.locator('#oYes').click();
  // 시험 시각이 정시보다 15분 넘게 이르면 "오늘 출근, 어떤 경우인가요?"가 먼저 나옴 → 평소대로
  await Promise.race([alba.getByText(/김알바님 퇴근/).waitFor(), alba.locator('#eSelf').waitFor()]);
  if (await alba.locator('#eSelf').count()) await alba.locator('#eSelf').click();
  await alba.locator('[data-sh="extra"]').click();
  await alba.getByText('저장 완료! 이제 닫아도 돼요').waitFor();
  await alba.getByText('닫기').click();
  await alba.getByText(/퇴근 \d\d:\d\d/).first().waitFor();

  // 4) 근무표·휴무신청·내 기록·내 정보
  await tab(alba, '근무표');
  await alba.getByText('근무표 ·').waitFor();
  await tab(alba, '휴무신청');
  await alba.getByText('휴무신청').first().waitFor();
  await tab(alba, '내 기록');
  await alba.getByText('내 출퇴근').waitFor();
  assert.match(await text(alba), /이번 달 근무\s+1일/);
  await shot(alba, 'm2-내기록');
  await tab(alba, '홈');
  await alba.locator('#goinfo').click();
  await alba.locator('#ia').waitFor();
  await alba.selectOption('#ib', '국민'); await alba.fill('#ia', '1234567890'); await alba.fill('#ie', 'a@b.com');
  await alba.locator('#is').click();
  await alba.getByText('확인 대기').first().waitFor();
  assert.equal(await alba.locator('#ir[type=password]').count(), 0); // 주민번호 칸 없음

  // 5) 로그아웃 → 다시 로그인 (매장 기억)
  await alba.locator('#logout').click();
  await alba.getByText('산성 로그인').waitFor();
  await alba.fill('#nm', '김알바'); await alba.fill('#pw', '000000');
  await alba.locator('#go').click();
  await alba.getByText('이름이나 비밀번호가 맞지 않아요').waitFor();
  await alba.fill('#pw', '123456');
  await alba.locator('#go').click();
  await alba.getByText('이번 주 내 근무').waitFor();

  // 6) 대표님: 산성 화면(multi2)으로 사장님 화면
  const boss2 = await (await phone()).newPage(); watch(boss2, '대표님2');
  await boss2.goto(APP2);
  await boss2.getByText('내 매장 찾기').waitFor();
  await boss2.waitForFunction(() => window.API && window.API._api);
  await boss2.evaluate(() => window.API._api.testGoogle('boss@example.com', '대표님'));
  await boss2.reload();
  await boss2.getByText(/출근 현황/).first().waitFor();
  assert.equal(await boss2.locator('#nav a').count(), 5);
  assert.match(await text(boss2), /김알바/);
  assert.match(await text(boss2), /오늘 매출 · 알바 인건비/);
  await shot(boss2, 'm2-오늘');
  // 승인: 김알바 내 정보 → 반영
  await tab(boss2, '승인');
  await boss2.getByText('승인 대기').waitFor();
  assert.match(await text(boss2), /내 정보/);
  await boss2.locator('[data-ok="1"]').first().click();
  await boss2.waitForFunction(() => /처리할 게 없어요|확인 필요/.test(document.getElementById('app').innerText));
  // 매출 넣기
  await tab(boss2, '매출');
  await boss2.locator('#sa').fill('1500000');
  await boss2.locator('#ss').click();
  await boss2.getByText('₩1,500,000').first().waitFor();
  // 대시보드
  await tab(boss2, '대시보드');
  await boss2.getByText('현재까지 매출').waitFor();
  // 더보기 → 기록 고치기: 김알바 오늘 불러오기 → 퇴근 22:00으로 저장
  await tab(boss2, '더보기');
  await boss2.locator('[data-go="afix"]').click();
  await boss2.selectOption('#fn', '김알바');
  await boss2.getByText(/지금 기록: 출근/).waitFor();
  await boss2.fill('#fo', '22:00');
  await boss2.locator('#fsv').click();
  await boss2.getByText(/지금 기록: .*퇴근 22:00/).waitFor();
  // 입사 · 퇴사: 새 알바 입사 등록
  await tab(boss2, '더보기');
  await boss2.locator('[data-go="astaff"]').click();
  await boss2.fill('#sn', '이신입'); await boss2.fill('#sw', '10500');
  await boss2.locator('#sadd').click();
  await boss2.waitForFunction(() => { const e = document.getElementById('sn'); return e && e.value === ''; }); // 입사 뒤 화면이 다시 그려질 때까지
  // 시급
  await tab(boss2, '더보기');
  await boss2.locator('[data-go="awage"]').click();
  await boss2.getByText('알바 시급').waitFor();
  assert.match(await text(boss2), /김알바\s+10,030원/);
  // 직원 설정: 표시이름·고정휴무·최소출근일·우선배정 저장 → 목록·시급 화면에 표시이름
  await tab(boss2, '더보기');
  await boss2.locator('[data-go="acfg"]').click();
  await boss2.getByText('직원 설정').first().waitFor();
  await boss2.locator('.item', { hasText: '김알바' }).first().click();
  await boss2.fill('#cd', '알바킴'); await boss2.locator('[data-d="화"]').check(); await boss2.fill('#cm', '4'); await boss2.locator('#cp').check();
  await boss2.locator('#csv').click();
  await boss2.getByText(/화 고정휴무 · 최소 4일 · 우선배정/).waitFor();
  assert.match(await text(boss2), /알바킴\s+\(김알바\)/);
  await tab(boss2, '더보기');
  await boss2.locator('[data-go="awage"]').click();
  await boss2.getByText('알바 시급').waitFor();
  assert.match(await text(boss2), /알바킴/);
  // 직원 계정 → 임시 비밀번호
  await tab(boss2, '더보기');
  await boss2.locator('[data-go="aacc"]').click();
  await boss2.locator('[data-n="김알바"]').click();
  await boss2.getByText('김알바님 임시 비밀번호').waitFor();
  const tmpPin = (await boss2.locator('.big').first().innerText()).trim();
  assert.match(tmpPin, /^\d{6}$/);
  // 휴무신청 현황
  await tab(boss2, '더보기');
  await boss2.locator('[data-go="aleave"]').click();
  await boss2.getByText(/휴무신청 · /).waitFor();
  await shot(boss2, 'm2-휴무현황');

  // 7) 산성에 없던 화면 (더보기에 붙임)
  const more = async x => { await tab(boss2, '더보기'); await boss2.locator(`[data-x="${x}"]`).click(); };
  const backMore = async () => { await boss2.locator('#back').click(); await boss2.getByText('더보기').first().waitFor(); };
  // 근무표 전용 직원(사장님 본인) + 스케줄 규칙 → 근무표 짜기 [자동으로 짜기]
  await tab(boss2, '더보기'); await boss2.locator('[data-go="acfg"]').click(); await boss2.locator('#nadd').waitFor();
  await boss2.fill('#nn', '조사장'); await boss2.locator('#nadd').click(); await boss2.locator('.item', { hasText: '근무표 전용' }).first().waitFor();
  assert.match(await text(boss2), /조사장\s+정직원 · 근무표 전용/);
  await boss2.locator('.item', { hasText: '조사장' }).first().click(); await boss2.locator('[data-d="월"]').check(); await boss2.locator('#csv').click();
  await boss2.getByText(/월 고정휴무 · 근무표 전용/).waitFor();
  await tab(boss2, '더보기'); await boss2.locator('[data-go="asched"]').click(); await boss2.locator('#ssv').waitFor();
  await boss2.locator('[data-r="alba"][data-i="0"]').fill('1'); await boss2.locator('#ssv').click(); await boss2.getByText('스케줄 규칙을 저장했어요').waitFor();
  await more('edit'); await boss2.getByText('초안 (직원에게 안 보임)').waitFor();
  assert.match(await text(boss2), /조사장/);           // 근무표 전용 직원이 근무표에 나옴
  await boss2.locator('#fAuto').click(); await boss2.getByText(/✅ 자동 짜기 완료/).waitFor();
  assert.match(await text(boss2), /정\+알: 월 0\+1/);  // 조사장 월 고정휴무, 월요일 알바 고정 1명
  await boss2.locator('#save').click(); await boss2.getByText('초안을 저장했어요').waitFor();
  await backMore();
  // 스케줄과 비교 (이번 주 · 지난주 · 이번 달)
  await tab(boss2, '더보기'); await boss2.locator('[data-go="acmp"]').click(); await boss2.getByText(/확인할 것 \d+건/).waitFor();
  await boss2.locator('[data-rg="month"]').click(); await boss2.getByText(/이번 달|확인할 것/).first().waitFor();
  assert.doesNotMatch(await text(boss2), /조사장/);
  await tab(boss2, '오늘'); await boss2.locator('#app').getByText('김알바').first().waitFor(); assert.doesNotMatch(await text(boss2), /조사장/);   // 출퇴근 현황엔 안 나옴
  await more('need'); await boss2.locator('#nsv').click(); await boss2.getByText('요일별 인원을 저장했어요').waitFor();
  await more('notice'); await boss2.fill('#nt', '산성 화면 공지 시험'); await boss2.locator('#nsend').click(); await boss2.getByText('올린 공지 1개').waitFor(); await backMore();
  await more('pay'); await boss2.getByText('지급 합계').waitFor(); assert.match(await text(boss2), /김알바/); await backMore();
  await more('month'); await boss2.getByText('전체 근무 시간').waitFor(); await backMore();
  await more('staff'); await boss2.getByText('여러 명 한 번에').waitFor(); await backMore();
  await more('store'); await boss2.locator('#regen').waitFor(); assert.match(await boss2.locator('.url').first().innerText(), /multi\/\?join=/);
  await boss2.getByText('규칙 바꾸기').click(); await boss2.locator('#fNext').waitFor(); await boss2.locator('#back').click(); await boss2.getByText('매장 설정').first().waitFor(); await backMore();
  await more('stores'); await boss2.getByText('지금').first().waitFor(); assert.match(await text(boss2), /새 직영 매장 만들기/); await backMore();
  await shot(boss2, 'm2-더보기');
  // 김알바: 임시 비밀번호로 로그인 → 새 비밀번호 정하기 → 홈에 공지
  await alba.reload();
  await alba.getByText('산성 로그인').waitFor();
  await alba.fill('#nm', '김알바'); await alba.fill('#pw', tmpPin);
  await alba.locator('#go').click();
  await alba.getByText('내 비밀번호 정하기').waitFor();
  await alba.fill('#p1', '654321'); await alba.fill('#p2', '654321');
  await alba.locator('#go').click();
  await alba.getByText('산성 화면 공지 시험').waitFor();

  // 8) 새 대표님(매장 없음): 산성 화면에서 구글 로그인 → 매장 목록 → 새 직영 매장 만들기 → 그 매장 오늘 탭
  const boss3 = await (await phone()).newPage(); watch(boss3, '대표님3');
  await boss3.goto(APP2);
  await boss3.waitForFunction(() => window.API && window.API._api);
  await boss3.evaluate(() => window.API._api.testGoogle('boss3@example.com', '새대표'));
  const b3 = await boss3.evaluate(() => window.API._api.auth.currentUser.uid);
  const r3 = await fetch('http://127.0.0.1:8080/v1/projects/demo-mate/databases/(default)/documents/orgs/org3', { method: 'PATCH', headers: { Authorization: 'Bearer owner', 'Content-Type': 'application/json' },
    body: JSON.stringify({ fields: { name: { stringValue: '새 그룹' }, adminUids: { arrayValue: { values: [{ stringValue: b3 }] } } } }) });
  assert.ok(r3.ok);
  await boss3.reload();
  await boss3.getByText('새 직영 매장 만들기').click();
  await boss3.fill('#sn', '해운대점'); await boss3.fill('#wg', '10030');
  await boss3.locator('#save').click();
  await boss3.getByText(/출근 현황/).first().waitFor();
  assert.match(await boss3.locator('.brand').first().innerText(), /해운대점/);

  console.log('✔ 산성 화면(multi2) 직원·사장님·새 화면 시험 통과');
} catch (e) {
  console.error('✘ 실패:', e.message);
  process.exitCode = 1;
} finally {
  await browser.close();
  server.close(); wserver.close();
}
