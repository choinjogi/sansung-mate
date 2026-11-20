// Firebase 콘솔 → 프로젝트 설정 → 내 앱(웹)에서 복사해 넣는 값. 비밀번호가 아니라 공개되어도 되는 값이다.
// (실제 보호는 firebase/firestore.rules 권한 규칙이 한다)
export const FIREBASE = {
  apiKey: 'AIzaSyDZgctrPNlQoKDb5-d36KirE0WKHIWJmbw',
  authDomain: 'sansung-sheets.firebaseapp.com',
  projectId: 'sansung-sheets',
  appId: '1:858847247938:web:5b544ee586c39ebaeb37db',
};
// 출퇴근 서버 주소. Cloudflare에 올리면 나오는 주소 (예: https://mate-server.<이름>.workers.dev)
// 비워 두면 Firebase 서버 함수(Blaze 요금제)를 씀
export const SERVER_URL = 'https://mate-server.choinjogi.workers.dev';
// 내 컴퓨터(localhost)에서 열면 연습용 서버(에뮬레이터)에 붙는다. 실제 데이터와 무관
export const USE_EMULATOR = ['localhost', '127.0.0.1'].includes(location.hostname);
// 폰 알림 공개 열쇠 (Cloudflare 서버 VAPID_PUBLIC과 같음, 공개값)
export const PUSH_KEY = "BJ4Feq_8iOq3B9RKMwH2F_5br-p5CgFmW1aCAxaQbEN94g5RVV7v_ldSsan81fnWvKQfgnUfu5eHmIdg3x1WI4c";
