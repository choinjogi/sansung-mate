// Firebase 콘솔 → 프로젝트 설정 → 내 앱(웹)에서 복사해 넣는 값. 비밀번호가 아니라 공개되어도 되는 값이다.
// (실제 보호는 firebase/firestore.rules 권한 규칙이 한다)
export const FIREBASE = {
  apiKey: 'TODO',
  authDomain: 'sansung-sheets.firebaseapp.com',
  projectId: 'sansung-sheets',
  appId: 'TODO',
};
// 내 컴퓨터(localhost)에서 열면 연습용 서버(에뮬레이터)에 붙는다. 실제 데이터와 무관
export const USE_EMULATOR = ['localhost', '127.0.0.1'].includes(location.hostname);
