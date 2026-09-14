// ═══════════════════════════════════════════════════════════
// ARCHINODE — Auth UI Module
// ═══════════════════════════════════════════════════════════
// 사이트 전체 헤더에 로그인 상태를 반영하는 공유 모듈
// firebase-config.js 이후에 로드해야 함
//
// 헤더의 .header-actions 영역에 로그인/프로필 링크를 동적으로 추가
// - 비로그인: "Log In" 버튼 표시
// - 전문가 로그인: "My Page" 버튼 + 프로필 아이콘 표시
// - 브랜드 로그인: "Dashboard" 버튼 표시
// - 어드민 로그인: "Admin" 버튼 표시
// ═══════════════════════════════════════════════════════════

(function() {
    // Firebase 준비 대기 (auth-compat 미로드 페이지에서는 firebase-config.js가 auth=null로 초기화함 — BUG-1)
    if (typeof auth === 'undefined' || !auth) return;

    // 경로 깊이에 따른 base path 계산
    const pathParts = window.location.pathname.split('/').filter(Boolean);
    const fileName = pathParts[pathParts.length - 1] || 'index.html';
    let basePath = '';
    // archinodekr.com 기준 경로 계산
    if (pathParts.length >= 3) basePath = '../../';
    else if (pathParts.length >= 2) basePath = '../';
    else basePath = '';

    // GitHub Pages 등 서브디렉토리 배포 감안
    if (window.location.pathname.includes('/categories/') && window.location.pathname.split('/categories/')[1].includes('/')) {
        basePath = '../../';
    } else if (window.location.pathname.includes('/brands/') || window.location.pathname.includes('/products/') || window.location.pathname.includes('/magazine/') || window.location.pathname.includes('/auth/') || window.location.pathname.includes('/brand-portal/') || window.location.pathname.includes('/admin/')) {
        basePath = '../';
    }

    auth.onAuthStateChanged(async (user) => {
        const actions = document.querySelector('.header-actions');
        if (!actions) return;

        // 기존 auth-link 요소 제거 (중복 방지)
        const existing = actions.querySelector('.auth-link');
        if (existing) existing.remove();

        const link = document.createElement('a');
        link.className = 'auth-link';
        link.style.cssText = 'font-size:0.78rem;font-weight:600;text-decoration:none;padding:6px 14px;border-radius:4px;transition:all 0.2s;white-space:nowrap;';

        if (!user) {
            // 비로그인
            link.href = basePath + 'auth/login.html';
            link.style.cssText += 'background:#111;color:#fff;';
            link.innerHTML = '<i class="fas fa-user" style="margin-right:4px;"></i><span data-en="Log In" data-ko="로그인">Log In</span>';
            link.addEventListener('mouseenter', () => { link.style.background = '#C8A96E'; });
            link.addEventListener('mouseleave', () => { link.style.background = '#111'; });
        } else if (isAdmin(user.email)) {
            // 어드민
            link.href = basePath + 'admin/dashboard.html';
            link.style.cssText += 'background:#C8A96E;color:#fff;';
            link.innerHTML = '<i class="fas fa-shield-alt" style="margin-right:4px;"></i>Admin';
        } else {
            // 브랜드 vs 전문가 판별
            try {
                const brandDoc = await db.collection('brands').doc(user.uid).get();
                if (brandDoc.exists) {
                    // 브랜드 계정
                    link.href = basePath + 'brand-portal/dashboard.html';
                    link.style.cssText += 'background:#111;color:#fff;';
                    link.innerHTML = '<i class="fas fa-building" style="margin-right:4px;"></i><span data-en="Dashboard" data-ko="대시보드">Dashboard</span>';
                } else {
                    // 전문가 계정
                    link.href = basePath + 'auth/profile.html';
                    link.style.cssText += 'background:#111;color:#fff;';
                    const displayName = user.displayName || user.email.split('@')[0];
                    link.innerHTML = `<i class="fas fa-user" style="margin-right:4px;"></i><span data-en="My Page" data-ko="마이페이지">My Page</span>`;
                }
                link.addEventListener('mouseenter', () => { link.style.background = '#C8A96E'; });
                link.addEventListener('mouseleave', () => { link.style.background = '#111'; });
            } catch (err) {
                // Firestore 쿼리 실패 시 기본 프로필로
                link.href = basePath + 'auth/profile.html';
                link.style.cssText += 'background:#111;color:#fff;';
                link.innerHTML = '<i class="fas fa-user" style="margin-right:4px;"></i>My Page';
            }
        }

        // Brand Login 링크 앞에 삽입 (또는 actions의 첫번째 자식으로)
        const brandLoginLink = actions.querySelector('a[href*="brand-portal"], a[href*="login"]');
        if (brandLoginLink) {
            actions.insertBefore(link, brandLoginLink);
        } else {
            actions.prepend(link);
        }
    });
})();
