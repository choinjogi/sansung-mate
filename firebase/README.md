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
  punches/{id}                { uid, date, kind: in|out, at, via: nfc|app|manual, by, editedBy, editedAt, note }
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
- **NFC**: 스티커 주소 `…/?s={storeId}&nfc=1`. 매장마다 스티커만 새로 붙입니다.
- **직원 로그인**: Firebase 이메일/비밀번호 계정을 씁니다. 이메일은 앱이 `{storeId}.{이름 UTF-8 16진수}@staff.mate.invalid` 로 만들고, 비밀번호는 6자리입니다. 같은 이름이 다른 매장에 있어도 겹치지 않습니다.
- **출퇴근**: 직원은 서버 시각으로만 찍습니다 (`at == request.time`). 지난 시각으로 찍거나 고치거나 지울 수 없습니다. 매니저 이상이 고치면 `editedBy` / `editedAt` 가 남습니다.
- **월 합계**: 사장님이 정산표를 만들 때 앱이 `stats` 를 같이 씁니다 (서버 함수가 없어도 됨 = 무료 요금제).

## 화면 (2단계) — `multi/`

새 앱은 `multi/` 폴더(주소 `…/sansung-mate/multi/`)에 있고, 지금 산성 앱과 따로 돌아갑니다.
- `multi/app.js` 화면, `multi/fb.js` 서버 호출, `multi/config.js` Firebase 설정값, `multi/defaults.js` 새 매장 기본 규칙
- `multi/vendor/firebase.js` = Firebase + QR 생성기를 묶은 파일 (`npm run build:vendor` 로 다시 만듦)
- 화면: 처음 화면 / 사장님 구글 로그인 / 총괄 홈(직영 매장 만들기, 사장님 초대 링크) / 초대받은 매장 만들기 /
  매장 화면(직원 초대 링크·QR, 가입 승인·거절, 매니저 지정, 매장 규칙, NFC 주소) / 규칙 바꾸기(이번 달·다음 달부터) /
  다른 사장님 매장 합계 / 직원 가입·로그인·승인 대기

## 시험 / 올리기

```bash
cd firebase
npm install
npm test        # 에뮬레이터 위에서 권한 시험 (실제 데이터와 무관)
npm run e2e     # 실제 브라우저로 대표님·다른 사장님·직원 흐름 시험 (playwright 필요: npm i -g playwright && npx playwright install chromium)
```

실제 프로젝트에 올리기 (처음 한 번, 내 컴퓨터에서):

```bash
cd firebase
npx firebase login
npx firebase use sansung-sheets   # 프로젝트 ID가 다르면 그 ID
npm run deploy                    # 규칙과 색인만 올라감
```

그다음 Firebase 콘솔에서 할 일:
1. Authentication → 로그인 방법에서 **Google**과 **이메일/비밀번호**를 켭니다.
   Authentication → 설정 → 승인된 도메인에 `choinjogi.github.io` 를 넣습니다.
   프로젝트 설정 → 내 앱 → 웹 앱 추가 → 나오는 `apiKey`, `appId` 를 `multi/config.js` 에 넣습니다.
2. Firestore에 `orgs/org1` 문서를 직접 만듭니다: `{ name: "산성 그룹", adminUids: ["<대표님 uid>"] }`. uid는 대표님이 구글로 한 번 로그인한 뒤 Authentication 목록에서 복사합니다.
