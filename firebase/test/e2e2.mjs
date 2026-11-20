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
const APP = 'http://localhost:5173/multi/', APP2 = 'http://localhost:5173/multi2/';

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
  await alba.getByText(/김알바님 퇴근/).waitFor();
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

  console.log('✔ 산성 화면(multi2) 직원 시험 통과');
} catch (e) {
  console.error('✘ 실패:', e.message);
  process.exitCode = 1;
} finally {
  await browser.close();
  server.close(); wserver.close();
}
