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
  const file = join(ROOT, /[\\/]$/.test(p) ? p + 'index.html' : p); // 윈도우에서는 / 가 \ 로 바뀜
  try { const b = await readFile(file); res.writeHead(200, { 'Content-Type': TYPES[extname(file)] || 'application/octet-stream' }); res.end(b); }
  catch { res.writeHead(404); res.end(); }
}).listen(5173);
const APP = 'http://localhost:5173/multi/';

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
  await boss.getByText('처음 할 일').waitFor();           // 오늘 탭
  await tab(boss, '더보기');
  await boss.getByText('규칙 바꾸기').waitFor();
  const joinUrl = (await boss.locator('.url').first().innerText()).trim();
  assert.match(joinUrl, /\?join=[A-Z0-9]{8}$/);
  assert.ok(await boss.locator('.qr svg').count(), 'QR이 없음');
  assert.match(await text(boss), /10,030원/);
  await shot(boss, '산성매장');

  // 2) 대표님: 다른 사장님 초대 링크
  await boss.locator('#goStores').click();
  await boss.getByText('초대 링크 만들기').click();
  const ownerUrl = (await boss.locator('#ownerInvOut .url').first().innerText()).trim();
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
  await kim.getByText('처음 할 일').waitFor();
  await tab(kim, '더보기');
  await kim.getByText('규칙 바꾸기').waitFor();
  assert.match(await text(kim), /10,500원/);
  // 같은 초대로 또 만들 수 없음
  await kim.goto(ownerUrl);
  await kim.getByText('이미 사용한 초대예요').waitFor();
  assert.doesNotMatch(await text(kim), /초대받은 매장 만들기/);
  assert.doesNotMatch(await text(kim), /새 직영 매장/);

  // 4) 직원: 산성 초대 링크 → 가입 신청 → 승인 대기
  const alba = await (await phone()).newPage(); watch(alba, '알바');
  await alba.goto(joinUrl);
  await alba.locator('#pw2').waitFor();
  assert.match(await text(alba), /산성/);
  await alba.fill('#nm', '김알바'); await alba.fill('#pw', '123456'); await alba.fill('#pw2', '123457');
  await alba.getByText('가입 신청').click();
  await alba.getByText('두 비밀번호가 달라요').waitFor();
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
  await tab(boss, '승인');
  await boss.locator('[data-jok]').waitFor();
  await shot(boss, '승인요청');
  await boss.locator('[data-jok]').click();
  await boss.getByText('새 가입 신청이 없어요').waitFor();
  await tab(boss, '더보기');
  await boss.getByText('직원 1명', { exact: true }).waitFor();
  await boss.locator('[data-mset]').first().click();
  await boss.selectOption('#mr', 'manager');
  await boss.locator('#msv').click();
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
  await alba.locator('#go').click();
  await alba.getByText('이름이나 비밀번호가 맞지 않아요').waitFor();
  await alba.fill('#pw', '123456');
  await alba.locator('#go').click();
  await alba.getByText('김알바님').waitFor();

  // 7-1) 출퇴근: 사장님이 매장 와이파이·위치 등록
  await net(boss, '211.36.1.9');
  await tab(boss, '오늘');
  await boss.getByText('매장 와이파이 등록 전이에요').waitFor();
  await tab(boss, '더보기');
  await boss.getByText('이 와이파이를 매장으로 등록').click();
  await boss.getByText('등록 1개').waitFor();
  await boss.getByText('지금 위치를 매장 위치로').click();
  await boss.getByText('저장됨 · 반경 100m').waitFor();
  assert.doesNotMatch(await text(boss), /등록 전이에요/);
  await shot(boss, '출퇴근설정');

  // 7-2) 김알바: 매장 와이파이에서 출근 → ✓
  await net(alba, '211.36.1.9');
  await alba.locator('#pIn').click();
  await alba.getByText('✓ 매장 와이파이').first().waitFor();
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
  await tab(boss, '승인');
  await boss.locator('[data-jok]').click();
  await boss.getByText('새 가입 신청이 없어요').waitFor();
  await tab(boss, '더보기');
  await boss.getByText('직원 2명', { exact: true }).waitFor();
  await park.getByText('승인됐는지 다시 보기').click();
  await net(park, '9.9.9.9');
  await park.locator('#pIn').click();
  await park.getByText('매장 와이파이로 찍히지 않았어요').waitFor();
  await shot(park, '출근경고');
  await park.context().setGeolocation({ latitude: 37.6, longitude: 126.978, accuracy: 20 }); // 약 3.7km 떨어진 집
  await park.locator('#pOut').click();
  await park.getByText('사장님이나 매니저').waitFor();
  await park.locator('#oYes').click();
  await park.getByText('⚠ 매장에서 3.7km').waitFor();
  await park.getByText('오늘 근무 끝').waitFor();

  // 7-4) 김알바: 와이파이 끊고(다른 회선) 매장 안에서 퇴근 → 반경 안이라 ✓
  await net(alba, '9.9.9.9');
  await alba.locator('#pOut').click();
  await alba.locator('#oYes').click();
  await alba.getByText('✓ 매장 0m').first().waitFor();

  // 7-5) 사장님: 확인 필요 2건 → 1건 확인, 오늘 현황에서 박알바 출근 시각 고치기
  await boss.reload();
  await boss.locator('[data-store]', { hasText: '산성' }).click();
  await tab(boss, '승인');
  await boss.getByText('이번 달 ⚠ 횟수').waitFor();
  assert.equal(await boss.locator('[data-ok]').count(), 2);
  assert.match(await text(boss), /박알바\s+2번/);
  await shot(boss, '확인필요');
  await boss.locator('[data-ok]').first().click();
  await boss.waitForFunction(() => document.querySelectorAll('[data-ok]').length === 1);
  await tab(boss, '오늘');
  await boss.getByText('출근 현황').first().waitFor();
  await boss.locator('[data-ed][data-k="in"]').nth(1).click(); // 이름순: 김알바, 박알바
  await boss.fill('#edt', '18:05');
  await boss.locator('#eds').click();
  await boss.getByText('18:05').waitFor();
  await shot(boss, '오늘현황');
  // 7-5-1) 처음 할 일(오늘 탭): 와이파이·위치·직원·매니저는 됐고 근무표만 남음
  assert.match(await text(boss), /처음 할 일\s+4\/5/);
  await tab(boss, '더보기');
  await boss.getByText('규칙 바꾸기').waitFor();
  // 7-5-2) 월 근무 기록: 두 명 다 1일, 엑셀 내려받기
  await boss.locator('#goMonth').click();
  await boss.getByText('전체 근무 시간').waitFor();
  assert.match(await text(boss), /김알바\s+1일/);
  assert.match(await text(boss), /박알바\s+1일/);
  await boss.locator('[data-p]').nth(1).click();
  await boss.getByText('18:05').first().waitFor();
  await shot(boss, '월근무기록');
  const [dl] = await Promise.all([boss.waitForEvent('download'), boss.locator('#csv').click()]);
  assert.match(dl.suggestedFilename(), /^산성_\d{4}-\d{2}_근무기록\.csv$/);
  const csv = await readFile(await dl.path(), 'utf8');
  assert.ok(csv.startsWith('\ufeff'), 'BOM 없음');
  assert.match(csv, /김알바,알바,1,/); assert.match(csv, /박알바,.*,18:05,/);
  assert.equal(await boss.locator('#stat').count(), 0, '직영은 합계 보내기 없음');
  await boss.locator('#back').click();
  await boss.getByText('규칙 바꾸기').waitFor();

  // 7-6) 근무표·휴무신청: (시험이 언제 돌든) 다음 주 휴무신청을 받는 중으로 설정 바꾸기
  const sid = (await (await fetch('http://127.0.0.1:8080/v1/projects/demo-mate/databases/(default)/documents/stores', { headers: { Authorization: 'Bearer owner' } })).json()).documents.find(d => d.fields.name.stringValue === '산성').name.split('/').pop();
  const lr = await fetch(`http://127.0.0.1:8080/v1/projects/demo-mate/databases/(default)/documents/stores/${sid}/settings/leave`, {
    method: 'PATCH', headers: { Authorization: 'Bearer owner', 'Content-Type': 'application/json' },
    body: JSON.stringify({ fields: { opensBeforeMin: { integerValue: '11520' }, closesBeforeMin: { integerValue: '-1' } } }) });
  assert.ok(lr.ok, '휴무신청 시간 설정 실패');
  // 박알바: 휴무신청 (다음 주 월·화 못 나옴, 토 오전 가능)
  await tab(park, '휴무신청');
  await park.getByText('신청 받는 중').waitFor();
  await park.locator('label:has(input[name=off])').nth(0).click();
  await park.locator('label:has(input[name=off])').nth(1).click();
  await park.locator('label:has(input[name=am][value="토"])').click();
  await park.locator('#send').click();
  await park.getByText('내가 낸 신청').waitFor();
  assert.match(await text(park), /토/);
  await shot(park, '휴무신청');
  // 사장님: 휴무신청 현황 → 근무표 짜기 (반영 → 자동 채우기 → 확정)
  await boss.getByText('휴무신청 현황').click();
  await boss.getByText('1명 신청').waitFor();
  assert.match(await text(boss), /인원 부족한 날/);  // 알바 2명뿐이라 필요 인원보다 적음
  await shot(boss, '휴무신청현황');
  await boss.getByText('이 주 근무표 짜기').click();
  await boss.getByText('초안 (직원에게 안 보임)').waitFor();
  await boss.locator('#fLeave').click();
  await boss.getByText('2칸을 ✕로 바꿨어요').waitFor();
  await boss.locator('#fAuto').click();
  await boss.getByText('칸을 채웠어요').waitFor();
  const xCount = await boss.locator('td.sc.x').count();
  assert.equal(xCount, 2, '휴무 반영 칸 수');
  await boss.locator('td[data-c]').first().click(); // 칸 눌러 바꾸기
  await boss.getByText('저장 안 함').waitFor();
  await boss.locator('#pub').click();
  await boss.getByText('확정됨 (직원에게 보임)').waitFor();
  await shot(boss, '근무표짜기');
  // 김알바(매니저): 다음 주 근무표 보기
  await alba.reload();
  await tab(alba, '더보기');
  await alba.locator('#goSched').click();
  await alba.getByText('근무표').first().waitFor();
  await alba.locator('#wNext').click();
  await alba.locator('.sched td.sc.x').first().waitFor();
  assert.match(await text(alba), /박알바/);
  await shot(alba, '근무표보기');
  // 사장님: 오늘 일찍 부르기
  await boss.locator('#back').click(); // 휴무신청 현황
  await boss.getByText('이 주 근무표 짜기').waitFor();
  await boss.locator('#back').click(); // 더보기
  await tab(boss, '오늘');
  await boss.selectOption('#en', { label: '박알바' });
  await boss.fill('#et', '17:00');
  await boss.locator('#eb').click();
  await boss.getByText('일찍 부름 17:00').waitFor();
  await tab(boss, '더보기');
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

  // 8-1) 김사장: 처음 할 일 0/5, 월 근무 기록에서 대표님께 합계 보내기
  await kim.reload();
  await kim.locator('[data-store]', { hasText: '두번째' }).click();
  await tab(kim, '오늘');
  await kim.getByText('처음 할 일').waitFor();
  assert.match(await text(kim), /0\/5/);
  await tab(kim, '더보기');
  await kim.locator('#goMonth').click();
  await kim.locator('#stat').click();
  await kim.getByText('대표님께 합계를 보냈어요').waitFor();

  // 9) 대표님: 김사장 매장은 합계만
  await boss.locator('#goStores').click();
  await boss.locator('[data-store]', { hasText: '두번째' }).click();
  await boss.getByText('월 합계와 요일별 숫자만').waitFor();
  await shot(boss, '합계만');
  assert.doesNotMatch(await text(boss), /직원 가입|가입 신청/);
  assert.match(await text(boss), /근무 시간\s+0시간/);
  // 안내서 페이지
  const g = await (await phone()).newPage(); watch(g, '안내서');
  await g.goto(APP + 'guide.html');
  await g.getByText('사장님 안내서').waitFor();
  await shot(g, '안내서');

  // 10) 김사장: 산성은 목록에 없음
  await kim.reload();
  await kim.getByText('두번째').waitFor();
  assert.doesNotMatch(await text(kim), /산성/);

  // 10-1) 초대 링크 없이: 첫 화면 → 직원 → 매장 이름 검색(띄어쓰기 달라도) → 가입 신청 → 사장님 승인 대기
  const walk = await (await phone()).newPage(); watch(walk, '검색가입');
  await walk.goto(APP);
  await walk.getByText('직원 · 로그인 / 가입').click();
  await walk.fill('#sc', '없는 매장');
  await walk.locator('#scGo').click();
  await walk.getByText('그 이름의 매장이 없어요').waitFor();
  await walk.fill('#sc', ' 산 성 ');
  await walk.locator('#scGo').click();
  await walk.locator('#pw2').waitFor();
  await walk.fill('#nm', '최검색'); await walk.fill('#pw', '444444'); await walk.fill('#pw2', '444444');
  await walk.locator('#go').click();
  await walk.getByText('승인 기다리는 중').waitFor();
  await shot(walk, '검색가입');

  // 11) 박알바가 번호를 잊음 → 사장님 [비밀번호 임의 재설정] → 임시 비밀번호로 로그인 → 새 비밀번호 정하기
  await park.reload();
  await park.getByText('로그아웃').click();
  await park.locator('#nm').waitFor();
  await boss.locator('#back').click();   // 합계 화면 → 매장 목록
  await boss.locator('[data-store]', { hasText: '산성' }).click();
  await tab(boss, '더보기');
  await boss.getByText('직원 2명', { exact: true }).waitFor();
  const parkRow = () => boss.locator('.item', { hasText: '박알바' }).first();
  await parkRow().locator('[data-mset]').click();
  await boss.locator('#mpin').click();
  await boss.locator('#mpinOut .big').waitFor();
  const pin = (await boss.locator('#mpinOut .big').innerText()).trim();
  assert.match(pin, /^\d{6}$/);
  await shot(boss, '임시번호');
  await park.fill('#nm', '박알바'); await park.fill('#pw', '222222');           // 옛 번호는 이제 안 됨
  await park.locator('#go').click();
  await park.getByText('비밀번호 임의 재설정').waitFor();
  await park.fill('#pw', pin);
  await park.locator('#go').click();
  await park.getByText('새 비밀번호 정하기').waitFor();
  await shot(park, '새번호');
  await park.fill('#np', '333333'); await park.fill('#np2', '333333');
  await park.locator('#npGo').click();
  await park.getByText('박알바님').waitFor();
  await park.getByText('로그아웃').click();
  await park.locator('#nm').waitFor();
  await park.fill('#nm', '박알바'); await park.fill('#pw', '333333');
  await park.locator('#go').click();
  await park.getByText('박알바님').waitFor();

  // 12) 사장님: 박알바 퇴사 처리 → 직원 목록·로그인에서 빠짐, 다시 일함으로 되돌리기
  await boss.reload();
  await boss.locator('[data-store]', { hasText: '산성' }).click();
  await tab(boss, '더보기');
  await boss.getByText('직원 2명', { exact: true }).waitFor();
  await parkRow().locator('[data-mset]').click();
  await boss.locator('#mleft').click();
  await boss.getByText('퇴사한 직원 1명').waitFor();
  await boss.getByText('직원 1명', { exact: true }).waitFor();
  await park.reload();
  await park.getByText('퇴사 처리된 계정이에요').waitFor();
  await boss.getByText('퇴사한 직원 1명').click();
  await boss.locator('[data-back]').click();
  await boss.getByText('직원 2명', { exact: true }).waitFor();
  await park.reload();
  await park.getByText('박알바님').waitFor();

  // 13) 아래 탭: 직원 4개, 매니저·사장님 3개. 내 기록 탭
  assert.equal(await park.locator('#nav a').count(), 4);
  await tab(park, '내 기록');
  await park.getByText('내 출퇴근').waitFor();
  assert.equal(await boss.locator('#nav a').count(), 3);
  await alba.reload();
  await alba.getByText('김알바님').waitFor();
  assert.equal(await alba.locator('#nav a').count(), 3);

  console.log(`✔ 화면 시험 통과 (가입·승인·출퇴근·휴무신청·근무표·비밀번호 임의 재설정·퇴사, 서버: ${USE_FUNCTIONS ? 'Firebase 함수' : 'Cloudflare'})`);
} catch (e) {
  console.error('✘ 실패:', e.message);
  process.exitCode = 1;
} finally {
  await browser.close();
  server.close(); wserver.close();
}
