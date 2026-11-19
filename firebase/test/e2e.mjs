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

// 출퇴근 서버: 기본은 Cloudflare 판(worker)을 이 컴퓨터에서 띄움. E2E_SERVER=functions 이면 Firebase 서버 함수 판
const USE_FUNCTIONS = process.env.E2E_SERVER === 'functions';
const { default: worker } = await import('../worker/index.js');
const WENV = { PROJECT_ID: 'demo-mate', EMULATOR: '1', FIRESTORE_EMULATOR: 'http://127.0.0.1:8080' };
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
  page.on('pageerror', e => { console.error(`[${who}] 화면 오류:`, e.message); process.exitCode = 1; });
  page.on('console', m => { if (m.type() === 'error') console.error(`[${who}] console:`, m.text()); });
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
  await alba.locator('.pill.on', { hasText: '매니저' }).waitFor();
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

  // 7-1) 출퇴근: 사장님이 매장 와이파이·위치 등록
  await net(boss, '211.36.1.9');
  await boss.getByText('매장 와이파이 등록 전이에요').waitFor();
  await boss.getByText('이 와이파이를 매장으로 등록').click();
  await boss.getByText('등록 1개').waitFor();
  await boss.getByText('지금 위치를 매장 위치로').click();
  await boss.getByText('저장됨 · 반경 100m').waitFor();
  assert.doesNotMatch(await text(boss), /등록 전이에요/);
  await shot(boss, '출퇴근설정');

  // 7-2) 김알바: 매장 와이파이에서 출근 → ✓
  await net(alba, '211.36.1.9');
  await alba.locator('#pIn').click();
  await alba.getByText('✓ 매장 와이파이').waitFor();
  assert.doesNotMatch(await text(alba), /찍히지 않았어요/);
  await shot(alba, '출근완료');

  // 7-3) 박알바: 가입·승인 후 모바일 데이터(다른 회선)로 출근 → ⚠, 집에서 퇴근 → ⚠ 거리
  const park = await (await phone()).newPage(); watch(park, '박알바');
  await park.goto(joinUrl);
  await park.fill('#nm', '박알바'); await park.fill('#pw', '222222'); await park.fill('#pw2', '222222');
  await park.getByText('가입 신청', { exact: true }).click();
  await park.getByText('승인 기다리는 중').waitFor();
  await boss.reload();
  await boss.locator('[data-store]', { hasText: '산성' }).click();
  await boss.getByText('가입 신청 1명').waitFor();
  await boss.getByText('승인', { exact: true }).click();
  await boss.getByText('직원 2명').waitFor();
  await park.getByText('승인됐는지 다시 보기').click();
  await net(park, '9.9.9.9');
  await park.locator('#pIn').click();
  await park.getByText('매장 와이파이로 찍히지 않았어요').waitFor();
  await shot(park, '출근경고');
  await park.context().setGeolocation({ latitude: 37.6, longitude: 126.978, accuracy: 20 }); // 약 3.7km 떨어진 집
  await park.locator('#pOut').click();
  await park.getByText('⚠ 매장에서 3.7km').waitFor();
  await park.getByText('오늘 근무 끝').waitFor();

  // 7-4) 김알바: 와이파이 끊고(다른 회선) 매장 안에서 퇴근 → 반경 안이라 ✓
  await net(alba, '9.9.9.9');
  await alba.locator('#pOut').click();
  await alba.getByText('✓ 매장 0m').waitFor();

  // 7-5) 사장님: 확인 필요 2건 → 1건 확인, 오늘 현황에서 박알바 출근 시각 고치기
  await boss.reload();
  await boss.locator('[data-store]', { hasText: '산성' }).click();
  await boss.getByText('확인 필요 2').click();
  await boss.getByText('이번 달 ⚠ 횟수').waitFor();
  assert.equal(await boss.locator('[data-ok]').count(), 2);
  assert.match(await text(boss), /박알바\s+2번/);
  await shot(boss, '확인필요');
  await boss.locator('[data-ok]').first().click();
  await boss.waitForFunction(() => document.querySelectorAll('[data-ok]').length === 1);
  await boss.locator('#back').click();
  await boss.getByText('오늘 출근 현황').click();
  await boss.getByText('출근 현황').first().waitFor();
  await boss.locator('[data-ed][data-k="in"]').nth(1).click(); // 이름순: 김알바, 박알바
  await boss.fill('#edt', '18:05');
  await boss.locator('#eds').click();
  await boss.getByText('18:05').waitFor();
  await shot(boss, '오늘현황');
  await boss.locator('#back').click();
  await boss.getByText('규칙 바꾸기').waitFor();

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

  console.log(`✔ 화면 시험 통과 (가입·승인·출퇴근, 서버: ${USE_FUNCTIONS ? 'Firebase 함수' : 'Cloudflare'})`);
} catch (e) {
  console.error('✘ 실패:', e.message);
  process.exitCode = 1;
} finally {
  await browser.close();
  server.close(); wserver.close();
}
