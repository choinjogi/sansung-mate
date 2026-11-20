# 산성 MATE — 작업 메모 (다른 기기·새 대화에서 이어 하기용)

## 지금 앱
- 정적 PWA: `index.html`, `app.js`(화면), `data-live.js`(서버 호출 `call(fn,args)` 하나로 모임), `data-demo.js`, `sw.js`
- 서버: 구글 Apps Script "산성 MATE 서버" + 구글 시트 (원본 시트는 읽기만)
- 버전 표기: 커밋 메시지 "버전 N: …", `version.json`

## 진행 중: 여러 매장용으로 Firebase 이전
결정된 것
- 공유 방식: 앱 링크 하나 + 매장 코드 (앱스토어 없이 PWA). 비용 0원 목표
- 매장 소유: **섞여 있음**. 직영은 대표님(총괄)이 직접 만들고, 다른 사장님 매장은 총괄 초대 코드가 있어야 만듦. 아무나 매장 생성 불가
- 권한: 총괄 / 매장 사장님 / 매니저 / 직원
- 총괄은 다른 사장님 매장의 **월 합계·요일별 숫자(stats)만** 봄. 직원별 상세는 그 매장 사장님만
- 매장 규칙은 매장마다 꽤 다름 → 매장 설정 화면에서 전부 바꿀 수 있게, "언제부터" 이력 저장 (`stores/{id}/rules/{YYYY-MM}`)
- 개인정보: 직원 본인 입력 + 사장님 승인. **주민번호는 앱에 안 넣음** (세무사에게 따로)
- 로그인: 직원·매니저 = 이름 + 6자리, 사장님·총괄 = 구글
- 급여: 앱(서버 함수 없이)에서 계산, 월말 [정산표 만들기]로 시트/엑셀 출력
- 지금 시스템은 그대로 두고 산성에서 병행 검증 (급여 1원까지 비교)

단계
1. ✅ Firebase 뼈대 — `firebase/` (규칙, 구조, `firebase/README.md` 참고). 시험: `cd firebase && npm install && npm test`, `npm run e2e`
   - ⏳ 실제 프로젝트(`sansung-sheets`)에 아직 안 올림: 사용자가 자기 컴퓨터에서 `npx firebase login` → `npm run deploy`, 콘솔에서 Google·이메일 로그인 켜기, `orgs/org1` 만들기
2. ✅ 매장 만들기 + 초대 가입 화면 — `multi/` (새 앱, 지금 앱과 따로). `cd firebase && npm run e2e` 로 브라우저 시험
   - ⏳ 실제 Firebase에 올린 뒤 확인: 직원 가짜 이메일(`…@staff.mate.invalid`) 가입이 되는지, 구글 로그인 창(승인된 도메인)
   - `multi/config.js` 에 apiKey·appId 넣어야 실제로 동작
3. 기능 옮기기: 출퇴근 → 스케줄·휴무신청 → 급여·정산표 → 알림
   - ✅ 출퇴근 — `multi/attend.js`, 서버 함수 `firebase/functions/` (punch, registerWifi)
     - 결정: **앱 버튼 + 매장 와이파이 확인** (GPS 위치는 "도착 직전 찍기"를 못 잡아서 출근엔 부족)
       - 출근 ✓ = 매장 와이파이(서버가 요청 IP를 등록한 매장 회선과 비교). 퇴근 ✓ = 매장 와이파이 또는 반경(기본 100m) 안
       - 아니면 막지 않고 ⚠ → 사장님·매니저 [확인 필요] 한 곳에 모음 + 직원별 월 ⚠ 횟수
       - NFC·QR·태블릿·셀카·캐치테이블 아이패드 안 씀. 출근 안 찍은 날은 지금 앱처럼 정시로 처리
     - 서버: **지금은 Cloudflare 무료 서버** (`firebase/worker/`, 카드 없음 — 사용자 지갑 분실). 데이터는 Firestore 무료 요금제
       - 처리 내용은 `functions/core.js` 하나를 Cloudflare 판(`worker/`)과 Firebase 판(`functions/index.js`)이 같이 씀
       - 앱 `multi/config.js` 의 `SERVER_URL` 로 고름 (비우면 Firebase 함수). 시험: `npm run e2e`(Cloudflare), `npm run e2e:functions`
       - 🔔 **꼭 물어보기**: 작업이 어느 정도 진행되면(예: 산성 병행 검증 시작 전후, 또는 사용자가 카드를 재발급했다고 할 때)
         "Firebase(Blaze)로 바꿀지, 지금 상태로 볼 때 어느 쪽이 나은지" 사용자에게 먼저 물어볼 것 (사용자 요청)
     - 와이파이 확인: 네이버 "내 아이피"로 매장에서 확인 (PDF 체크리스트 줌). 집 연습: 폰 2대 같은 주소 ✓, 모바일 데이터 다른 주소 ✓, 아이폰 미확인
     - 확인용 페이지 `/myIp` 도 서버에 있음
     - 확인되면 **지금 산성 앱 출퇴근에도 와이파이 확인 적용** 검토 (사용자 요청)
     - ⏳ 실제 서버에서 확인: registerWifi가 돌려주는 주소가 매장 회선 주소와 같은지(x-forwarded-for 맨 뒤 값 사용),
       아이폰 홈 화면 앱의 위치 허용 질문 빈도, 아이폰 "IP 주소 추적 제한" 켠 폰의 ⚠ 여부
   - ✅ 근무표·휴무신청 — `multi/sched.js` (지금 앱 방식 그대로 + 근무표 짜기를 앱 안으로)
     - 직원: 근무표 보기(확정된 것만), 휴무신청(알바만, 다음 주, 못 나오는 날 + 주말 오전 가능)
     - 매니저·사장님: 휴무신청 현황(가능/필요 인원, 부족한 날, 단톡 멘트), 근무표 짜기(칸 눌러 바꾸기, 휴무신청 반영, 빈칸 자동 채우기 초안, 초안 저장/확정)
     - 일찍 부르기: 오늘 출근 현황 화면. 지각·계산 시작 = 일찍 부른 시각 > 개인 정시 > 매장 정시 (주말 오전은 오전 시작)
     - 직원 설정: 정직원/알바, 매니저, 개인 정시. 매장 규칙에 요일별 필요 알바 수
     - ⏳ 사용자에게 확인할 것: 지금 스케줄 시트 메뉴의 자동 배정 규칙(앱의 자동 채우기는 "이번 주 근무 적은 사람부터" 초안),
       산성 요일별 필요 인원 실제 값(기본값 4·4·4·4·4·5·5는 임시), 정직원 근무표 기본값
   - ✅ 다른 사장님 매장에 먼저 넘기기 준비 (2026-11-20 결정: 급여 전에 출퇴근·근무표만 먼저, 다른 사장님 매장, 서버는 Cloudflare 그대로)
     - `multi/records.js` 월 근무 기록(직원별 일한 날·시간·지각·⚠, 날짜별) + 엑셀(CSV) 내려받기 (사장님·매니저). 대표님께 합계 보내기(stats: hours·headcount·byWeekday, 직영 아닌 매장만)
     - 매장 화면 "처음 할 일" 체크리스트(와이파이·위치·직원 승인·정직원/매니저·근무표 확정), 사장님 안내서 `multi/guide.html` (총괄 초대 링크 옆에 같이 나옴)
     - 브랜치 `ccr-b39546c3-2ix4te` (11/20 main 합침). 다음 후보: 급여·정산표
     - ✅ (11/20 메인 노트북) 번호 다시 정하기·퇴사 처리: 직원 [설정] → [번호 다시 정하기](사장님만) = 서버 `/resetPin`(core.js resetPinCore)이
       임시 6자리로 계정 비번을 바꾸고 members.pinReset=true → 직원이 임시 번호로 로그인하면 "새 번호 정하기"(updatePassword, 본인이 pinReset=false만 씀).
       [퇴사 처리] = status 'left' + leftAt (로그인·출퇴근·근무표에서 빠짐, 기록 유지), 직원 목록 아래 "퇴사한 직원"에서 [다시 일함]. e2e 11)·12) 추가
       - ✅ (11/20) 실제 적용: mate-server 에 Firebase 인증 관리자 역할 추가(사용자), 규칙·Cloudflare 서버 올림(/ipSig 유지 확인), main 합침
         ⏳ 홍길동 계정으로 실제 시험(사장님 폰): 번호 다시 정하기 → 임시 번호 로그인 → 새 번호 / 퇴사 → 다시 일함
         ⚠ Cloudflare 서버는 /ipSig(예전 산성 앱 출퇴근용)가 든 코드에서만 올릴 것
       - ⏳ 이 PC엔 자바가 없어 에뮬레이터 시험(npm test·e2e)을 못 돌림 → 단위 시험(core·lib·google)만 통과 확인. e2e는 클라우드 컨테이너에서
     - 이 컨테이너에서 e2e 돌릴 때 `LANG=C.UTF-8` 필요 (아니면 한글 파일 이름 내려받기가 'download'로 바뀜)
   - ⬜ 급여·정산표 → ⬜ 알림
4. ⬜ 산성 병행 검증  5. ⬜ 두 번째 매장 투입  6. ⬜ 나머지 매장

## ▶ 다음 할 일: 실제 Firebase·Cloudflare 설정 (사용자 노트북 Claude Code에서)
**진행 상황 (2026-11-20 메인 노트북)**: 1~9 완료. Firestore (default) asia-northeast3 Standard·프로덕션, Google·이메일 로그인 켬, 승인 도메인 choinjogi.github.io,
웹 앱 = 예전에 만든 "산성 MATE" 재사용(config.js 채움), 규칙·색인 배포, 서비스 계정 mate-server(roles/datastore.user만) 열쇠 → Cloudflare 비밀 SERVICE_ACCOUNT (열쇠 파일 삭제),
서버 https://mate-server.choinjogi.workers.dev (/myIp 200, /punch 로그인 없이 401 확인). 작업 사본은 드라이브 밖 C:/Users/samsung/sansung-mate-work (node_modules가 드라이브 동기화를 막지 않게).
윈도우 PowerShell은 npx가 막혀 있어 npx.cmd 사용. 10 main 합침(11/20, 사용자 승인), 11 orgs/org1 = 산성 그룹(adminUids = 대표님 구글 uid) 만듦. 시험 직영 매장 "산성시험" 만듦, [이 와이파이를 매장으로 등록] → 서버(Cloudflare)가 Firestore에 씀 확인(등록 1개 = 집 회선, 매장에서 [처음부터 다시] 필요). 남은 것: 9 매장 폰으로 /myIp 확인, 직원 가입(가짜 이메일) → 출근 찍기 시험
사용자가 노트북에서 "Firebase·Cloudflare 설정하자"라고 하면 아래 순서로 진행. 사용자는 비개발자 → 한 단계씩 쉬운 말로.
브랜치: `ccr-c3515536-fm1cvn` (먼저 `git checkout` + `git pull`). 작업 폴더: `firebase/`.
1. 준비: `node -v`(없으면 nodejs.org LTS 설치 안내), `cd firebase && npm install`
2. Firebase 로그인: `npx firebase login` (사용자가 브라우저에서 허용) → `npx firebase use sansung-sheets` (`npx firebase projects:list`로 실제 ID 확인)
3. Firestore: 데이터베이스가 없으면 만들기 (위치 asia-northeast3, 프로덕션 모드).
   ⚠️ **이미 데이터·규칙이 있으면 멈추고 사용자에게 물어보기** (`npm run deploy`가 기존 규칙을 덮어씀)
4. 로그인 방법 켜기: Firebase 콘솔 → Authentication → Sign-in method → **Google**, **이메일/비밀번호** (사용자가 콘솔에서 스위치. 콘솔 주소를 알려 주기)
   + 승인된 도메인에 `choinjogi.github.io`
5. 웹 앱 등록: `npx firebase apps:create web MATE` → `npx firebase apps:sdkconfig web <appId>` → `multi/config.js` 의 apiKey·appId 채우기 (공개값)
6. 권한 규칙 올리기: `npm run deploy`
7. 서비스 계정(Cloudflare가 Firestore에 쓸 열쇠): gcloud 있으면 `gcloud auth login` 후
   `gcloud iam service-accounts create mate-server --project sansung-sheets`,
   역할 `roles/datastore.user` 하나만 부여, `gcloud iam service-accounts keys create <임시경로>.json --iam-account mate-server@sansung-sheets.iam.gserviceaccount.com`.
   gcloud 없으면 Google Cloud 콘솔(IAM 및 관리자 → 서비스 계정)로 안내. **열쇠 내용은 절대 화면에 출력하거나 커밋하지 말 것**
8. Cloudflare: `npx wrangler login` (사용자가 가입·허용) → `npm run deploy:server` (workers.dev 이름 정하기) →
   `npx wrangler secret put SERVICE_ACCOUNT < <열쇠파일>` (윈도우 PowerShell: `Get-Content <파일> -Raw | npx wrangler secret put SERVICE_ACCOUNT`)
   → **열쇠 파일 삭제** → 나온 주소를 `multi/config.js` 의 `SERVER_URL` 에
9. 확인: `<SERVER_URL>/myIp` 를 폰으로 열어 네이버 "내 아이피"와 같은지
10. 커밋·푸시 (config.js). **main 합치기는 사용자에게 먼저 묻기** (GitHub Pages로 `…/sansung-mate/multi/` 를 열려면 필요.
    `multi/`·`firebase/`만 새로 생기고 지금 산성 앱 파일은 그대로)
11. main에 올라가면: 대표님이 새 앱에서 구글 로그인 → Firebase 콘솔 Authentication에서 uid 확인 →
    Firestore에 `orgs/org1` = `{ name: "산성 그룹", adminUids: ["<uid>"] }` 만들기 (콘솔 또는 명령)
12. 끝나면 이 섹션을 "✅ 설정 완료"로 바꾸고, 다음은 급여·정산표 (지금 시트 월말결제 계산 방식부터 확인)

## 새 앱 올릴 때
- 시험 (메인 노트북 윈도우, 11/20부터 됨): 자바 = `C:/Users/samsung/tools/jdk-21.0.13+9` (설치 없이 풀어 둠), 시험 브라우저 = playwright(`npm i --no-save playwright` + `npx playwright install chromium`, 끝남)
  Git Bash: `export JAVA_HOME="$(cygpath -w /c/Users/samsung/tools/jdk-21.0.13+9)" PATH="/c/Users/samsung/tools/jdk-21.0.13+9/bin:$PATH" LANG=C.UTF-8` 후 `npm.cmd test`, `npm.cmd run e2e`
- 아래 탭(11/20): 직원 🏠홈·📅근무표·📝휴무신청·⏱️내 기록 / 사장님·매니저 👀오늘·✅승인·💰매출·📊대시보드·☰더보기 (대시보드 = dash.js, 시트 대시보드와 같은 항목, 매니저는 매출·근태만). 급여·정산표 = paycalc.js(시트와 같은 계산, pay.test.mjs) + pay.js(사장님 더보기) (app.js startTabs·goTab, ui.js setNav). 매니저도 가입 승인·거절
- `cd firebase && npm run bump` 먼저 (multi/ 파일끼리 부르는 주소의 ?v= 번호를 올림. 안 하면 폰이 예전 파일을 10분까지 씀)
- 직원 가입(11/20 사용자 결정): 초대 링크 없이 앱 첫 화면 → 매장 이름 정확히 검색(storeNames, 목록 불가) → 이름·비밀번호 → 사장님 승인. 초대 링크도 계속 됨
- 다음(11/20 사용자 결정): 화면 **구성**을 지금 산성 앱과 같게(탭·화면 순서·용어). **기능 먼저, 디자인은 나중**.
  디자인(나중에): 네이비(곤색) 배경 + 흰 글씨, 강조만 노랑·빨강·초록·파랑 글씨. 로고·이미지는 전부 뺌 (매장별 색·로고 안 함)
- 매장 이름 = 사장님이 매장 만들 때 넣은 이름이 그대로 직원 검색 이름(지금 실제 매장은 시험용 "산성시험"뿐). 이름 바꾸기 화면은 아직 없음

## 작업 방식
- 사용자에게는 한국어로, 쉬운 말로 설명
- 지금 앱과 Apps Script는 병행 검증 끝날 때까지 건드리지 않기 (단, 와이파이 확인이 되면 지금 앱 출퇴근에 적용하는 것은 사용자 요청)
- Cloudflare·Firebase 설정은 앱 운영자(사용자) 한 명만 함. 다른 매장 사장님·직원은 링크 + 로그인만
