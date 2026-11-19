# 산성 MATE — 여러 매장용 Firebase

지금 앱(구글 Apps Script + 시트)은 그대로 둡니다. 이 폴더는 새 서버의 **데이터 구조와 권한 규칙**만 담고 있습니다.

## 역할

| 역할 | 로그인 | 볼 수 있는 것 |
|---|---|---|
| 총괄 (대표님) | 구글 | 직영 매장: 전부 (사장님 겸함). 다른 사장님 매장: 매장 이름 + **월 합계(stats)** 만 |
| 매장 사장님 | 구글 | 자기 매장 전부 (직원 계좌, 시급, 정산표 포함) |
| 매니저 | 이름 + 6자리 | 스케줄, 출퇴근 전체·고치기, 휴무신청, 매출. 시급·계좌·정산표는 못 봄 |
| 직원 | 이름 + 6자리 | 자기 출퇴근·휴무신청·시급·내 정보, 매장 스케줄 |

승인 대기 중인 직원은 자기 가입 정보 말고는 아무것도 못 봅니다.

## 데이터 구조 (Firestore)

```
orgs/{orgId}                  총괄. adminUids. 콘솔에서 한 번만 만듦 (앱에서는 못 만듦)
ownerInvites/{code}           총괄 → 다른 사장님 "매장 만들기 초대". 한 번 쓰면 끝
joinCodes/{code}              직원 초대 코드 → { storeId, storeName }. 코드로만 조회, 목록 불가
stores/{storeId}              { orgId, name, ownerUids, direct, inviteCode, createdAt }
  rules/{YYYY-MM}             매장 규칙. 문서 이름 = 적용 시작 달 (기본값: ../multi/defaults.js)
  members/{uid}               { name, role: staff|manager, status: pending|active|left, startTime, type }
  wages/{uid}                 { history: [{ from: 'YYYY-MM', wage }] }  사장님·본인만
  private/{uid}               { bank, account, email, req }  직원은 req(변경 요청)만 씀, 사장님이 승인
  punches/{날짜_uid_in|out}    { uid, name, date, kind, at, via: app|manual, by, wifi, dist, acc, flag, why, ip,
                                reviewed, reviewedBy, editedBy, editedAt, note }
                              직원은 직접 못 씀 → 서버 함수 punch 가 기록. 매니저 이상은 넣기·고치기·확인 표시
  settings/wifi               { ips }  매장 와이파이 회선 주소 (서버 함수 registerWifi 만 씀, 사장님만 봄)
  settings/place              { lat, lng, radius }  매장 위치·반경 (사장님)
  schedules/{주 시작일}        주간 스케줄 + leaveOpensAt / leaveClosesAt
  leaves/{주_uid}             휴무신청 { uid, week, off[], am[], at }  열린 동안만 본인이 냄
  sales/{YYYY-MM-DD}          매출  매니저 이상
  payroll/{YYYY-MM}           월 정산표  사장님만
  stats/{YYYY-MM}             월 합계 { sales, laborCost, laborRatio, hours, headcount, byWeekday }
                              총괄이 보는 유일한 숫자. 이 칸들 외에는 저장이 거부됨
```

주민번호는 저장하지 않습니다 (세무사에게 따로 전달).

## 흐름

- **직영 매장**: 총괄이 [새 매장 만들기] → `stores` 생성 (`direct: true`)
- **다른 사장님 매장**: 총괄이 초대 코드 생성 → 사장님이 구글로 로그인해서 매장을 만들면, 같은 묶음으로 초대가 "사용됨"이 됩니다. 초대 없이는 매장을 못 만듭니다.
- **직원 가입**: 사장님이 `joinCodes` 생성 → 초대 링크와 QR (`?join=코드`) → 직원이 이름 + 6자리로 가입하면 `status: pending` → 사장님이 승인하면 `active`
- **출퇴근**: 앱 버튼 → 서버 함수 `punch` (functions/index.js). NFC·QR·태블릿은 쓰지 않음 (아이폰 NFC 인식률 약 10%).
  - 서버가 요청의 회선 주소(IP)를 보고 **매장 와이파이**인지 확인. 출근 ✓ = 매장 와이파이. 퇴근 ✓ = 매장 와이파이 또는 매장 반경 안.
  - 나머지는 막지 않고 ⚠ (`flag`). 사장님·매니저 [확인 필요] 화면에 모임. 출근 안 찍은 날은 지금처럼 정시로 처리.
  - 시각은 서버 시각. 같은 날 같은 종류는 한 번만 (두 번째는 거절). 자정 넘긴 퇴근은 전날 출근에 붙음.
- **직원 로그인**: Firebase 이메일/비밀번호 계정을 씁니다. 이메일은 앱이 `{storeId}.{이름 UTF-8 16진수}@staff.mate.invalid` 로 만들고, 비밀번호는 6자리입니다. 같은 이름이 다른 매장에 있어도 겹치지 않습니다.
- **출퇴근**: 직원은 서버 시각으로만 찍습니다 (`at == request.time`). 지난 시각으로 찍거나 고치거나 지울 수 없습니다. 매니저 이상이 고치면 `editedBy` / `editedAt` 가 남습니다.
- **월 합계**: 사장님이 정산표를 만들 때 앱이 `stats` 를 같이 씁니다 (서버 함수가 없어도 됨 = 무료 요금제).

## 화면 (2단계) — `multi/`

새 앱은 `multi/` 폴더(주소 `…/sansung-mate/multi/`)에 있고, 지금 산성 앱과 따로 돌아갑니다.
- `multi/app.js` 화면, `multi/fb.js` 서버 호출, `multi/config.js` Firebase 설정값, `multi/defaults.js` 새 매장 기본 규칙
- `multi/vendor/firebase.js` = Firebase + QR 생성기를 묶은 파일 (`npm run build:vendor` 로 다시 만듦)
- 화면: 처음 화면 / 사장님 구글 로그인 / 총괄 홈(직영 매장 만들기, 사장님 초대 링크) / 초대받은 매장 만들기 /
  매장 화면(직원 초대 링크·QR, 가입 승인·거절, 매니저 지정, 매장 규칙) / 규칙 바꾸기(이번 달·다음 달부터) /
  다른 사장님 매장 합계 / 직원 가입·로그인·승인 대기

## 시험 / 올리기

```bash
cd firebase
npm install
npm test        # 에뮬레이터 위에서 권한 시험 (실제 데이터와 무관)
npm run e2e     # 실제 브라우저로 대표님·다른 사장님·직원 흐름 시험 (playwright 필요: npm i -g playwright && npx playwright install chromium)
```

```bash
npm run e2e:functions   # 같은 시험을 Firebase 서버 함수 판으로 (나중에 바꿀 때 확인용)
```

## 출퇴근 서버: 지금은 Cloudflare (카드 필요 없음)

출퇴근 서버는 두 가지 판이 있고, 처리 내용(`functions/core.js`)은 같습니다.

| 판 | 위치 | 필요한 것 | 앱 설정 |
|---|---|---|---|
| **Cloudflare (지금 씀)** | `worker/` + `wrangler.toml` | Cloudflare 무료 계정 (이메일만) | `multi/config.js` 의 `SERVER_URL` 에 주소 |
| Firebase 서버 함수 | `functions/index.js` | Firebase Blaze 요금제 (카드) | `SERVER_URL` 을 비우면 이쪽 |

**이 설정은 앱을 운영하는 사람(총괄) 한 명만 합니다.** 다른 매장 사장님·점장님·직원은 앱 링크로 들어와
구글 로그인(사장님) 또는 이름+6자리(직원)만 하면 되고, Cloudflare·Firebase 계정이 필요 없습니다.

### 처음 한 번 (내 컴퓨터에서)

1. **Firebase 콘솔** (무료 요금제 그대로)
   - Firestore Database가 없으면 만들기 (위치: 서울 asia-northeast3). 이미 쓰던 데이터·규칙이 있으면 올리기 전에 확인
   - Authentication → 로그인 방법에서 **Google**, **이메일/비밀번호** 켜기
   - Authentication → 설정 → 승인된 도메인에 `choinjogi.github.io` 추가
   - 프로젝트 설정 → 내 앱 → 웹 앱 추가 → `apiKey`, `appId` 를 `multi/config.js` 에 넣기
2. **Cloudflare 서버가 Firebase에 기록할 열쇠** (Google Cloud 콘솔, 결제 필요 없음)
   - console.cloud.google.com → 프로젝트 `sansung-sheets` → IAM 및 관리자 → 서비스 계정 → **서비스 계정 만들기**
     (이름 `mate-server`, 역할 **Cloud Datastore 사용자** 하나만)
   - 만든 계정 → 키 → 키 추가 → **JSON** → 파일이 내려받아짐. **비밀번호처럼 다루기** (카톡·메일로 보내지 말 것)
3. **올리기**
```bash
cd firebase
npm install
npx firebase login
npx firebase use sansung-sheets   # 프로젝트 ID가 다르면 그 ID
npm run deploy                    # 권한 규칙 + 색인 (무료 요금제 가능)
npx wrangler login                # Cloudflare 가입·로그인 (브라우저가 열림)
npx wrangler secret put SERVICE_ACCOUNT < 내려받은-열쇠.json   # 열쇠를 Cloudflare 비밀값으로
npm run deploy:server             # Cloudflare에 올림 → https://mate-server.<이름>.workers.dev 주소가 나옴
```
   - 열쇠를 넣었으면 **내려받은 JSON 파일은 지웁니다.**
   - 나온 주소를 `multi/config.js` 의 `SERVER_URL` 에 넣습니다.
   - 주소 확인 페이지: `https://mate-server.<이름>.workers.dev/myIp`
4. 대표님이 새 앱에서 구글로 한 번 로그인 → Firebase 콘솔 Authentication 목록에서 uid 복사 →
   Firestore에 `orgs/org1` 문서 만들기: `{ name: "산성 그룹", adminUids: ["<대표님 uid>"] }`

### 나중에 Firebase 서버 함수로 바꿀 때 (카드 생긴 뒤)

1. Firebase 요금제를 **Blaze**로 (카드 등록), Google Cloud 콘솔 → 결제 → 예산 및 알림에서 1,000원 / 5,000원 알림
2. `(cd functions && npm install) && npm run deploy:functions` (punch, registerWifi, myIp, 서울 지역)
3. `multi/config.js` 의 `SERVER_URL` 을 `''` 로 비우기 → 앱이 Firebase 서버 함수를 씀
4. 매장 와이파이·출퇴근 기록은 Firestore에 그대로 있으니 옮길 것 없음. Cloudflare 서버는 지워도 됨

### 매장 와이파이 확인 (네이버 "내 아이피"로도 됨)

| 시험 | 나와야 하는 결과 |
|---|---|
| 아이폰 A, 안드로이드 B 둘 다 매장 와이파이로 열기 | **같은 주소** |
| 같은 폰을 와이파이 끄고 모바일 데이터로 열기 | **다른 주소** |
| 아이폰 설정 → Wi-Fi → 매장 와이파이 ⓘ → "IP 주소 추적 제한" 켜고 / 끄고 열기 | 끈 쪽이 매장 주소 (켠 쪽이 다르면 직원 안내 필요) |
| 다음 날 다시 매장 와이파이로 열기 | 어제와 같은 주소 (자주 바뀌면 알려 주세요) |
