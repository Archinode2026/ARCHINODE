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
// A-609: 예전에는 여기가 const 였다. firebase 가 아예 안 내려오면 27줄이 던지고
// 스크립트가 끊겨 auth·db·storage 가 '선언만 되고 초기화 안 된' 상태로 남았다.
// 그 상태에서는 다른 파일의 `typeof db === 'undefined'` 방어조차 ReferenceError 를
// 던진다(TDZ). 그래서 var 로 바꾸고 초기화를 감쌌다 — 실패하면 세 값은 undefined 로
// 남고, 81군데의 기존 방어가 **의도대로** 작동한다.
var auth, db, storage;
try {
    if (typeof firebase === 'undefined') {
        throw new Error('firebase SDK not loaded');
    }
    firebase.initializeApp(firebaseConfig);
    // Auth compat SDK는 일부 페이지에서만 로드되므로 조건부 초기화 (BUG-1, 검수대장 A-001)
    auth = (typeof firebase.auth === 'function') ? firebase.auth() : null;
    // A-056: Firestore SDK가 안 실린 페이지(예: auth/reset-password.html)에서 매번 TypeError가 나던 문제. auth와 같은 패턴으로 가드.
    db = (typeof firebase.firestore === 'function') ? firebase.firestore() : null;
    // Storage SDK는 일부 페이지에서만 로드되므로 조건부 초기화
    storage = (typeof firebase.storage === 'function') ? firebase.storage() : null;
} catch (e) {
    console.error('Firebase 초기화 실패 — 이 쪽의 자료 기능은 작동하지 않습니다:', e && e.message);
}

// ── 관리자 이메일 목록 (어드민 접근 가능한 이메일) ──
const ADMIN_EMAILS = [
    "office@archinode.org",
    "wool21wool@gmail.com"
];

// 관리자 여부 확인
function isAdmin(email) {
    return ADMIN_EMAILS.includes(email);
}
