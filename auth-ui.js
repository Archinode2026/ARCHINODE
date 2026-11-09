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
            link.style.cssText += 'background:#332e27;color:#fff;';
            link.innerHTML = '<i class="fas fa-user" style="margin-right:4px;"></i><span data-en="Log In" data-ko="로그인">Log In</span>';
            link.addEventListener('mouseenter', () => { link.style.background = '#7a5c32'; });
            link.addEventListener('mouseleave', () => { link.style.background = '#332e27'; });
            insert(link);
            return;
        }

        let kindEn = 'Member', kindKo = '회원';
        if (isAdmin(user.email)) {
            link.href = basePath + 'admin/dashboard.html';
            link.style.cssText += 'background:#7a5c32;color:#fff;';
            link.innerHTML = accountHtml('fa-shield-halved', user);
            kindEn = 'Admin'; kindKo = '어드민';
        } else {
            // 2026-11-03 A-047 확장: 매거진 글 페이지는 firestore-compat 을 싣지 않아 db 가 null 이다
            // (A-056 가드). 그 경우 브랜드/회원 구분만 건너뛰고 이메일 표시·로그아웃은 그대로 동작한다.
            // 링크는 profile.html 로 가는데, profile.html 이 brands 문서를 보고 알아서 라우팅한다.
            let isBrand = false;
            let known = false;   // 계정 종류를 '확인했는지'. 못 봤으면 단정하지 않는다 (A-194)
            if (db) {
                try {
                    const brandDoc = await db.collection('brands').doc(user.uid).get();
                    isBrand = brandDoc.exists;
                    known = true;
                } catch (err) {
                    console.warn('auth-ui: brand lookup failed', err);
                }
            }
            if (isBrand) {
                link.href = basePath + 'brand-portal/dashboard.html';
                link.innerHTML = accountHtml('fa-building', user);
                kindEn = 'Brand account'; kindKo = '브랜드 계정';
            } else if (known) {
                link.href = basePath + 'auth/profile.html';
                link.innerHTML = accountHtml('fa-user', user);
                kindEn = 'Member account'; kindKo = '회원 계정';
            } else {
                // A-194: db 가 null 이거나 조회가 실패하면 브랜드인지 회원인지 모른다.
                // 전에는 그 경우도 '회원 계정' 이라고 적어서, 매거진 글 130개 페이지에서
                // 브랜드로 로그인해도 헤더가 '회원 계정' 이라고 거짓을 말했다.
                // 링크는 profile.html 로 두고(그쪽이 brands 문서를 보고 다시 라우팅한다)
                // 라벨만 중립으로 바꾼다 — 모르는 것을 단정하지 않는 편이 맞다.
                link.href = basePath + 'auth/profile.html';
                link.innerHTML = accountHtml('fa-circle-user', user);
                kindEn = 'My account'; kindKo = '내 계정';
            }
            link.style.cssText += 'background:#332e27;color:#fff;';
            link.addEventListener('mouseenter', () => { link.style.background = '#7a5c32'; });
            link.addEventListener('mouseleave', () => { link.style.background = '#332e27'; });
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
        out.style.cssText = 'font-size:0.8rem;color:#7a7164;text-decoration:none;padding:6px 8px;margin-left:2px;';
        out.innerHTML = '<i class="fas fa-right-from-bracket"></i>';
        out.addEventListener('mouseenter', () => { out.style.color = '#332e27'; });
        out.addEventListener('mouseleave', () => { out.style.color = '#7a7164'; });
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


    /* ─────────────────────────────────────────────────────────────────────────
       A-400(2026-11-09): 카테고리 드롭다운의 키보드·스크린리더 보강

       브론즈 19차 실측(키보드만으로 다녀 보기):
         · Tab 3회로 「카테고리」에 닿고 Enter 로 열리고 안쪽 10개 링크에
           전부 닿고 Esc 로 닫힌다 — **여기까지는 제대로 된다**(진짜
           `<button>` 이라 Enter 가 click 을 일으킨다).
         · ❌ Esc 로 닫으면 **포커스가 BODY 로 떨어진다.** 다음 Tab 이 문서
           맨 처음부터 시작한다. 같은 페이지의 모바일 메뉴는 닫을 때
           `.mobile-toggle` 로 포커스를 **되돌린다** — 한 사이트에서 두
           처리가 달랐다.
         · ❌ `aria-expanded`·`aria-haspopup` 이 없다. 스크린리더가 이것이
           여닫히는 것인지, 지금 열렸는지 모른다.

       **왜 여기에 넣는가.** `toggleCatMenu` 와 Esc 핸들러는 **232개 HTML 에
       인라인으로 복사**돼 있고 그마저 6가지 모양이다(`classList.toggle`
       넷 · `style.display` 하나 · 공백만 다른 것). 232파일을 6가지로 나눠
       고치는 것보다, **그 232파일 전부에 실리는 유일한 스크립트**인 이
       파일에서 보강하는 쪽이 적게 건드리고 덜 어긋난다. (`lang.js` 는
       231파일 — `privacy-en.html` 이 빠진다. A-282 참고.)

       기존 인라인 코드는 **그대로 두고** 그 위에 덧댄다:
         · 여닫는 상태는 MutationObserver 로 본다 — 클릭·바깥 클릭·Esc 가
           어느 경로로 닫아도 `aria-expanded` 가 따라간다.
         · Esc 는 **capture 단계**에서 먼저 받아 「열려 있었는지」를 기억하고,
           인라인 핸들러가 닫은 **뒤에** 트리거로 포커스를 되돌린다.
       ───────────────────────────────────────────────────────────────────────── */
    (function enhanceCatDropdown() {
        function ready(fn) {
            if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', fn);
            else fn();
        }
        ready(function () {
            var trig = document.querySelector('.nav-dropdown-trigger');
            var menu = document.getElementById('catMenu');
            if (!trig || !menu) return;

            function isOpen() {
                return menu.classList.contains('active') || menu.style.display === 'block';
            }
            function sync() {
                trig.setAttribute('aria-expanded', isOpen() ? 'true' : 'false');
            }

            trig.setAttribute('aria-haspopup', 'true');
            trig.setAttribute('aria-controls', 'catMenu');
            sync();

            if (typeof MutationObserver === 'function') {
                new MutationObserver(sync).observe(menu, {
                    attributes: true, attributeFilter: ['class', 'style']
                });
            } else {
                trig.addEventListener('click', function () { setTimeout(sync, 0); });
            }

            document.addEventListener('keydown', function (e) {
                if (e.key !== 'Escape' && e.key !== 'Esc') return;
                if (!isOpen()) return;
                // 인라인 핸들러가 닫을 차례를 준 뒤에 포커스를 되돌린다.
                setTimeout(function () {
                    if (isOpen()) {
                        menu.classList.remove('active');
                        if (menu.style.display === 'block') menu.style.display = 'none';
                        sync();
                    }
                    try { trig.focus(); } catch (err) {}
                }, 0);
            }, true);
        });
    })();

})();
