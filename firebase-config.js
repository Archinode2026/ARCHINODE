// ═══════════════════════════════════════════════════════════
// ARCHINODE Firebase Configuration
// ═══════════════════════════════════════════════════════════
//
// ⚠️ 설정 방법:
// 1. https://console.firebase.google.com 접속
// 2. "프로젝트 추가" → 이름: archinode → 생성
// 3. 왼쪽 메뉴 "빌드" → "Authentication" → "시작하기" → "이메일/비밀번호" 활성화
// 4. 왼쪽 메뉴 "빌드" → "Firestore Database" → "데이터베이스 만들기" → "테스트 모드"
// 5. 왼쪽 메뉴 "빌드" → "Storage" → "시작하기"
// 6. 프로젝트 설정(톱니바퀴) → "일반" → 아래쪽 "웹 앱 추가(</>)" 클릭
// 7. 앱 이름: ARCHINODE → 등록 → 아래 나오는 firebaseConfig 값을 여기에 붙여넣기
//
// ═══════════════════════════════════════════════════════════

const firebaseConfig = {
    apiKey: "AIzaSyBkCqq4V1KIkKjiIH46nZd-0cJaSVPSg9k",
    authDomain: "archinode-8ab04.firebaseapp.com",
    projectId: "archinode-8ab04",
    storageBucket: "archinode-8ab04.firebasestorage.app",
    messagingSenderId: "705121088234",
    appId: "1:705121088234:web:2e1e5188006fc2467a9d93",
    measurementId: "G-H3SWD3YZ9B"
};

// Firebase 초기화
firebase.initializeApp(firebaseConfig);
// Auth compat SDK는 일부 페이지에서만 로드되므로 조건부 초기화 (BUG-1, 검수대장 A-001)
const auth = (typeof firebase.auth === 'function') ? firebase.auth() : null;
const db = firebase.firestore();
// Storage SDK는 일부 페이지에서만 로드되므로 조건부 초기화
const storage = (typeof firebase.storage === 'function') ? firebase.storage() : null;

// ── 관리자 이메일 목록 (어드민 접근 가능한 이메일) ──
const ADMIN_EMAILS = [
    "office@archinode.org",
    "wool21wool@gmail.com"
];

// 관리자 여부 확인
function isAdmin(email) {
    return ADMIN_EMAILS.includes(email);
}
