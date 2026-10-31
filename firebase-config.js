/*
 * Firebase 설정 — FIREBASE-SETUP 안내(README) 에 따라 값을 채워 주세요.
 * 아래 값은 비밀 키가 아니라 공개되어도 되는 웹 앱 식별 정보입니다.
 * (실제 보호는 Firestore 보안 규칙 firestore.rules 가 담당합니다.)
 * apiKey 가 'YOUR_' 로 시작하면 서버에 연결하지 않고 이 브라우저에만 저장합니다.
 */
window.GAC_FIREBASE = {
  config: {
    apiKey: 'YOUR_API_KEY',
    authDomain: 'YOUR_PROJECT_ID.firebaseapp.com',
    projectId: 'YOUR_PROJECT_ID',
    storageBucket: 'YOUR_PROJECT_ID.firebasestorage.app',
    messagingSenderId: 'YOUR_SENDER_ID',
    appId: 'YOUR_APP_ID'
  },
  // Firebase 콘솔 > Authentication > 사용자 에서 만든 관리자 계정의 UID
  adminUid: 'YOUR_ADMIN_UID'
};
