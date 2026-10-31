/*
 * Firebase 설정 — FIREBASE-SETUP 안내(README) 에 따라 값을 채워 주세요.
 * 아래 값은 비밀 키가 아니라 공개되어도 되는 웹 앱 식별 정보입니다.
 * (실제 보호는 Firestore 보안 규칙 firestore.rules 가 담당합니다.)
 * apiKey 가 'YOUR_' 로 시작하면 서버에 연결하지 않고 이 브라우저에만 저장합니다.
 */
const firebaseConfig = {
  apiKey: "AIzaSyDiL2iJ64yaGiLZ_0Jb0jYKH0RnExAtxNo",
  authDomain: "conscience-audit-committee.firebaseapp.com",
  projectId: "conscience-audit-committee",
  storageBucket: "conscience-audit-committee.firebasestorage.app",
  messagingSenderId: "247313664683",
  appId: "1:247313664683:web:96d53c3fb797bce33705ee",
  // Firebase 콘솔 > Authentication > 사용자 에서 만든 관리자 계정의 UID
  adminUid: 'gtLg0V83rbgZvdL1fvzxuqbUqE53'
};
// store.js 가 window.GAC_FIREBASE 를 통해 설정값을 읽습니다.
window.GAC_FIREBASE = { config: firebaseConfig, adminUid: firebaseConfig.adminUid };