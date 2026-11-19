// 2단계 화면 자동 시험: 실제 브라우저로 대표님·다른 사장님·직원이 가입부터 승인까지 해 본다.
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
  const file = join(ROOT, p.endsWith('/') ? p + 'index.html' : p);
  try { const b = await readFile(file); res.writeHead(200, { 'Content-Type': TYPES[extname(file)] || 'application/octet-stream' }); res.end(b); }
  catch { res.writeHead(404); res.end(); }
}).listen(5173);
const APP = 'http://localhost:5173/multi/';

const browser = await chromium.launch();
const phone = () => browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, locale: 'ko-KR' });
let step = 0;
async function shot(page, name) { if (SHOTS) await page.waitForTimeout(400), await page.screenshot({ path: `${SHOTS}/${String(++step).padStart(2, '0')}-${name}.png`, fullPage: true }); }
function watch(page, who) {
  page.on('dialog', d => d.accept());
  page.on('pageerror', e => { console.error(`[${who}] 화면 오류:`, e.message); process.exitCode = 1; });
}
const text = page => page.locator('#app').innerText();
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
  // 1) 대표님: 구글 로그인 → 총괄 등록(콘솔에서 하는 일) → 직영 매장 만들기
  const boss = await (await phone()).newPage(); watch(boss, '대표님');
  await boss.goto(APP);
  await boss.getByText('사장님 · 구글로 로그인').waitFor();
  await shot(boss, '처음화면');
  await googleIn(boss, 'boss@example.com', '대표님');
  await boss.getByText('매장을 만들려면 대표님의').waitFor(); // 총괄 등록 전
  const bossUid = await boss.evaluate(() => window.__mate.auth.currentUser.uid);
  await seedOrg(bossUid);
  await boss.reload();
  await boss.getByText('새 직영 매장 만들기').click();
  await shot(boss, '매장만들기');
  await boss.getByText('매장 만들기', { exact: true }).click();
  await boss.getByText('매장 이름을 넣어 주세요').waitFor();
  await fillRules(boss, '산성', 10030);
  await boss.getByText('매장 만들기', { exact: true }).click();
  await boss.getByText('직원 초대').first().waitFor();
  const joinUrl = (await boss.locator('.url').first().innerText()).trim();
  assert.match(joinUrl, /\?join=[A-Z0-9]{8}$/);
  assert.ok(await boss.locator('.qr svg').count(), 'QR이 없음');
  assert.match(await text(boss), /10,030원/);
  await shot(boss, '산성매장');

  // 2) 대표님: 다른 사장님 초대 링크
  await boss.locator('#back').click();
  await boss.getByText('초대 링크 만들기').click();
  const ownerUrl = (await boss.locator('#ownerInvOut .url').innerText()).trim();
  assert.match(ownerUrl, /\?owner=[A-Z0-9]{10}$/);
  await shot(boss, '총괄홈');

  // 3) 다른 사장님: 초대 링크 → 구글 로그인 → 매장 만들기
  const kim = await (await phone()).newPage(); watch(kim, '김사장');
  await kim.goto(ownerUrl);
  await kim.getByText('매장 만들기 초대를 받으셨어요').waitFor();
  await googleIn(kim, 'kim@example.com', '김사장');
  await kim.getByText('초대받은 매장 만들기').click();
  await fillRules(kim, '두번째', 10500);
  await kim.getByText('매장 만들기', { exact: true }).click();
  await kim.getByText('직원 초대').first().waitFor();
  assert.match(await text(kim), /10,500원/);
  // 같은 초대로 또 만들 수 없음
  await kim.goto(ownerUrl);
  await kim.getByText('이미 사용한 초대예요').waitFor();
  assert.doesNotMatch(await text(kim), /초대받은 매장 만들기/);
  assert.doesNotMatch(await text(kim), /새 직영 매장/);

  // 4) 직원: 산성 초대 링크 → 가입 신청 → 승인 대기
  const alba = await (await phone()).newPage(); watch(alba, '알바');
  await alba.goto(joinUrl);
  await alba.getByText('초대받은 매장').waitFor();
  assert.match(await text(alba), /산성/);
  await alba.fill('#nm', '김알바'); await alba.fill('#pw', '123456'); await alba.fill('#pw2', '123457');
  await alba.getByText('가입 신청').click();
  await alba.getByText('두 번호가 달라요').waitFor();
  await alba.fill('#pw2', '123456');
  await shot(alba, '직원가입');
  await alba.getByText('가입 신청', { exact: true }).click();
  await alba.getByText('승인 기다리는 중').waitFor();
  await shot(alba, '승인대기');

  // 같은 이름으로 다른 사람이 가입 시도 → 막힘
  const dup = await (await phone()).newPage(); watch(dup, '같은이름');
  await dup.goto(joinUrl);
  await dup.fill('#nm', '김알바'); await dup.fill('#pw', '999999'); await dup.fill('#pw2', '999999');
  await dup.getByText('가입 신청', { exact: true }).click();
  await dup.getByText('이미 가입한 이름이에요').waitFor();

  // 5) 대표님: 산성에서 승인 → 매니저로
  await boss.reload();
  await boss.locator('[data-store]', { hasText: '산성' }).click();
  await boss.getByText('가입 신청 1명').waitFor();
  await shot(boss, '승인요청');
  await boss.getByText('승인', { exact: true }).click();
  await boss.getByText('직원 1명').waitFor();
  await boss.getByText('매니저로').click();
  await boss.locator('.pill.on', { hasText: '매니저' }).waitFor();

  // 6) 직원: 승인 확인
  await alba.getByText('승인됐는지 다시 보기').click();
  await alba.getByText('김알바님').waitFor();
  await alba.getByText('매니저', { exact: true }).waitFor();
  await shot(alba, '직원홈');

  // 7) 직원: 로그아웃 → 다시 로그인 (매장은 기억됨). 틀린 번호는 막힘
  await alba.getByText('로그아웃').click();
  await alba.locator('#nm').waitFor();
  await alba.fill('#nm', '김알바'); await alba.fill('#pw', '000000');
  await alba.getByText('로그인', { exact: true }).click();
  await alba.getByText('이름이나 번호가 맞지 않아요').waitFor();
  await alba.fill('#pw', '123456');
  await alba.getByText('로그인', { exact: true }).click();
  await alba.getByText('김알바님').waitFor();

  // 8) 대표님: 규칙 다음 달부터 바꾸기, 초대 링크 새로 → 옛 링크 무효
  await boss.getByText('규칙 바꾸기').click();
  await boss.fill('#wg', '10500');
  await boss.locator('#fNext').click();
  await boss.getByText('바뀐 규칙 예약됨').waitFor();
  assert.match(await text(boss), /10,030원/); // 이번 달은 그대로
  await boss.getByText('새 링크로 바꾸기').click();
  await boss.waitForFunction(old => !document.querySelector('.url').innerText.includes(old), joinUrl.split('=')[1]);
  const late = await (await phone()).newPage(); watch(late, '늦은직원');
  await late.goto(joinUrl);
  await late.getByText('초대 링크가 바뀌었거나 없어졌어요').waitFor();

  // 9) 대표님: 김사장 매장은 합계만
  await boss.locator('#back').click();
  await boss.locator('[data-store]', { hasText: '두번째' }).click();
  await boss.getByText('월 합계와 요일별 숫자만').waitFor();
  await shot(boss, '합계만');
  assert.doesNotMatch(await text(boss), /직원 초대|가입 신청/);

  // 10) 김사장: 산성은 목록에 없음
  await kim.reload();
  await kim.getByText('두번째').waitFor();
  assert.doesNotMatch(await text(kim), /산성/);

  console.log('✔ 2단계 화면 시험 통과');
} catch (e) {
  console.error('✘ 실패:', e.message);
  process.exitCode = 1;
} finally {
  await browser.close();
  server.close();
}
