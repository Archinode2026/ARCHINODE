// ═══════════════════════════════════════════════════════════
// ARCHINODE — Auth UI Module
// ═══════════════════════════════════════════════════════════
// 사이트 전체 헤더에 로그인 상태를 반영하는 공유 모듈
// firebase-config.js 이후에 로드해야 함
//
// 헤더의 .header-actions 영역에 로그인/프로필 링크를 동적으로 추가
// - 비로그인: "Log In" 버튼 표시
// - 로그인: 계정 종류 아이콘 + 로그인한 이메일 + 로그아웃 버튼 표시
//
// 2026-11-03 A-147: 기존에는 "Admin"/"Dashboard"/"My Page" 라고 계정 종류만
// 보여줘서 어느 계정으로 로그인했는지 알 수 없었다(브랜드 계정과 어드민을
// 오가며 테스트할 때 특히). 이메일을 함께 노출하고, 로그인 상태에서는
// 의미가 없어진 정적 "브랜드 로그인" 링크를 숨긴다. 로그아웃 버튼도 추가.
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

    function esc(t) {
        return String(t == null ? '' : t)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }
    function isKo() { return document.documentElement.lang !== 'en'; }

    // 계정 종류 아이콘 + 로그인한 이메일
    function accountHtml(iconClass, user) {
        return '<i class="fas ' + iconClass + '" style="margin-right:5px;"></i>'
             + '<span class="auth-email" style="display:inline-block;max-width:160px;overflow:hidden;'
             + 'text-overflow:ellipsis;white-space:nowrap;vertical-align:bottom;">'
             + esc(user.email || (isKo() ? '로그인됨' : 'Signed in')) + '</span>';
    }

    auth.onAuthStateChanged(async (user) => {
        const actions = document.querySelector('.header-actions');
        if (!actions) return;

        // 기존에 넣은 요소 제거 (중복 방지)
        actions.querySelectorAll('.auth-link, .auth-logout').forEach(function (el) { el.remove(); });

        // 정적 로그인 링크는 auth-ui 가 자체 버튼을 그리므로 항상 숨긴다 (A-152).
        // A-147 때는 로그인 상태에서만 숨겼는데, 로그인 창이 통합되면서
        // 로그아웃 상태에 "로그인" 버튼이 두 개 보이게 됐다.
        // auth-ui.js 가 없는 페이지(submit-trend.html)에서는 이 정적 링크가 그대로
        // 폴백으로 남으므로, 숨기는 책임을 auth-ui 쪽에 두는 편이 안전하다.
        const staticLogin = actions.querySelector('a[href*="auth/login"], a[href*="brand-portal/login"]');
        if (staticLogin) staticLogin.style.display = 'none';

        const link = document.createElement('a');
        link.className = 'auth-link';
        link.style.cssText = 'font-size:0.78rem;font-weight:600;text-decoration:none;padding:6px 14px;border-radius:4px;transition:all 0.2s;white-space:nowrap;display:inline-flex;align-items:center;';

        if (!user) {
            link.href = basePath + 'auth/login.html';
            link.style.cssText += 'background:#111;color:#fff;';
            link.innerHTML = '<i class="fas fa-user" style="margin-right:4px;"></i><span data-en="Log In" data-ko="로그인">Log In</span>';
            link.addEventListener('mouseenter', () => { link.style.background = '#C8A96E'; });
            link.addEventListener('mouseleave', () => { link.style.background = '#111'; });
            insert(link);
            return;
        }

        let kindEn = 'Member', kindKo = '회원';
        if (isAdmin(user.email)) {
            link.href = basePath + 'admin/dashboard.html';
            link.style.cssText += 'background:#C8A96E;color:#fff;';
            link.innerHTML = accountHtml('fa-shield-halved', user);
            kindEn = 'Admin'; kindKo = '어드민';
        } else {
            // 2026-11-03 A-047 확장: 매거진 글 페이지는 firestore-compat 을 싣지 않아 db 가 null 이다
            // (A-056 가드). 그 경우 브랜드/회원 구분만 건너뛰고 이메일 표시·로그아웃은 그대로 동작한다.
            // 링크는 profile.html 로 가는데, profile.html 이 brands 문서를 보고 알아서 라우팅한다.
            let isBrand = false;
            if (db) {
                try {
                    const brandDoc = await db.collection('brands').doc(user.uid).get();
                    isBrand = brandDoc.exists;
                } catch (err) {
                    console.warn('auth-ui: brand lookup failed', err);
                }
            }
            if (isBrand) {
                link.href = basePath + 'brand-portal/dashboard.html';
                link.innerHTML = accountHtml('fa-building', user);
                kindEn = 'Brand account'; kindKo = '브랜드 계정';
            } else {
                link.href = basePath + 'auth/profile.html';
                link.innerHTML = accountHtml('fa-user', user);
                kindEn = 'Member account'; kindKo = '회원 계정';
            }
            link.style.cssText += 'background:#111;color:#fff;';
            link.addEventListener('mouseenter', () => { link.style.background = '#C8A96E'; });
            link.addEventListener('mouseleave', () => { link.style.background = '#111'; });
        }

        // 마우스를 올리면 계정 종류까지 확인 가능
        link.title = (isKo() ? kindKo : kindEn) + ' — ' + (user.email || '');
        link.setAttribute('data-en-title', kindEn + ' — ' + (user.email || ''));
        link.setAttribute('data-ko-title', kindKo + ' — ' + (user.email || ''));

        // 로그아웃 버튼
        const out = document.createElement('a');
        out.className = 'auth-logout';
        out.href = '#';
        out.title = isKo() ? '로그아웃' : 'Log out';
        out.setAttribute('data-en-title', 'Log out');
        out.setAttribute('data-ko-title', '로그아웃');
        out.setAttribute('aria-label', out.title);
        out.style.cssText = 'font-size:0.8rem;color:#777;text-decoration:none;padding:6px 8px;margin-left:2px;';
        out.innerHTML = '<i class="fas fa-right-from-bracket"></i>';
        out.addEventListener('mouseenter', () => { out.style.color = '#111'; });
        out.addEventListener('mouseleave', () => { out.style.color = '#777'; });
        out.addEventListener('click', function (e) {
            e.preventDefault();
            auth.signOut().then(function () { window.location.reload(); })
                          .catch(function (err) { console.error('signOut failed', err); });
        });

        insert(link);
        if (link.parentNode) link.parentNode.insertBefore(out, link.nextSibling);
    });

    // Brand Login 링크 앞에 삽입 (또는 actions의 첫번째 자식으로)
    function insert(link) {
        const actions = document.querySelector('.header-actions');
        if (!actions) return;
        const anchor = actions.querySelector('a[href*="login"], a[href*="brand-portal"]');
        if (anchor) actions.insertBefore(link, anchor);
        else actions.prepend(link);
    }

})();
