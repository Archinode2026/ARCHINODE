/* ─────────────────────────────────────────────────────────────────────────
   admin-nav.js — 어드민 사이드바 + 해시 라우팅 (2026-09-12 어드민 개편 1단계)
   정본: docs/회의/2026-09-12-구현계약서-어드민개편.md 3장 1단계 · 2장 2-2 「나」
   형태 참고: 단번 admin.html NAV_GROUPS (묶음 + 항목). 역할(roles)·숨김 목록은 여기 없다.

   ★ 전역 `var`/`function` 만 (const/let 전역 금지 — 리스크 5). 접두어 adm_.
   ★ 메뉴 정의는 이 배열 한 곳. 6개 어드민 페이지가 같은 파일을 읽는다.
     - kind:'tab'  → dashboard.html 의 기존 .tab[data-tab=target] 을 프로그램으로 click() (옛 핸들러 무변)
     - kind:'view' → dashboard.html 의 #tab-<target> 을 활성화 (1단계: dashboard 뿐)
     - kind:'page' → 별도 페이지로 이동 (target = 파일명)
     - ready:false → 아직 없는 화면. 사이드바에 «숨김». 화면이 생기는 단계에서 true 로.
   ───────────────────────────────────────────────────────────────────────── */

var ADMIN_MENUS = [
    { key: 'top', en: '', ko: '', items: [
        { id: 'dashboard', en: 'Dashboard', ko: '대시보드', icon: 'fa-th-large', kind: 'view', target: 'dashboard', ready: true }
    ] },
    { key: 'customer', en: 'Customers', ko: '고객', items: [
        { id: 'leads',     en: 'Lead Inbox',    ko: '리드 인박스', icon: 'fa-inbox',        kind: 'view', target: 'leads',     ready: false },   // 4단계
        { id: 'inquiries', en: '1:1 Inquiries', ko: '1:1 문의',    icon: 'fa-comment-dots', kind: 'view', target: 'inquiries', ready: false },   // 5단계
        { id: 'members',   en: 'Professionals', ko: '전문가 회원', icon: 'fa-users',        kind: 'view', target: 'members',   ready: false }    // 6단계
    ] },
    { key: 'brand', en: 'Brands', ko: '브랜드', items: [
        { id: 'brands',    en: 'Brands',          ko: '브랜드',      icon: 'fa-building',     kind: 'tab',  target: 'brands',    ready: true },
        { id: 'products',  en: 'Products',        ko: '제품',        icon: 'fa-box-open',     kind: 'tab',  target: 'products',  ready: true },
        { id: 'articles',  en: 'Articles',        ko: '아티클',      icon: 'fa-newspaper',    kind: 'tab',  target: 'articles',  ready: true },
        { id: 'prospects', en: 'Brand Prospects', ko: '브랜드 후보', icon: 'fa-search',       kind: 'view', target: 'prospects', ready: false }    // 7단계
    ] },
    { key: 'inbox', en: 'Submissions', ko: '접수', items: [
        { id: 'consultations', en: 'Consultations',      ko: '자문 요청',     icon: 'fa-comments',           kind: 'page', target: 'consultations.html',          ready: true },
        { id: 'trend',         en: 'Trend Submissions',  ko: '트렌드 투고',   icon: 'fa-lightbulb',          kind: 'page', target: 'trend-submissions.html',      ready: true },
        { id: 'newsletter',    en: 'Newsletter',         ko: '뉴스레터',      icon: 'fa-envelope-open-text', kind: 'page', target: 'newsletter-subscribers.html', ready: true },
        { id: 'notify',        en: 'Digital Notify',     ko: '디지털 알림',   icon: 'fa-bell',               kind: 'page', target: 'notify-subscribers.html',     ready: true },
        { id: 'articlesCards', en: 'Articles (Cards)',   ko: '아티클 카드형', icon: 'fa-th',                 kind: 'page', target: 'articles.html',               ready: true }
    ] },
    { key: 'ops', en: 'Operations', ko: '운영', items: [
        { id: 'notices',     en: 'Notices',      ko: '공지사항',  icon: 'fa-bullhorn',        kind: 'view', target: 'notices',     ready: false },   // 5단계
        { id: 'logs',        en: 'Activity Log', ko: '활동 로그', icon: 'fa-history',         kind: 'view', target: 'logs',        ready: false },   // 2단계
        { id: 'review',      en: 'Review Board', ko: '검수관리',  icon: 'fa-clipboard-check', kind: 'tab',  target: 'review',      ready: true },
        { id: 'regulations', en: 'Regulations',  ko: '규정집',    icon: 'fa-book-open',       kind: 'view', target: 'regulations', ready: false },   // 3단계
        { id: 'settings',    en: 'Settings',     ko: '설정',      icon: 'fa-cog',             kind: 'view', target: 'settings',    ready: false }    // 3단계
    ] }
];

// ── 평평한 항목 목록 ──
function adm_items() {
    var out = [];
    for (var g = 0; g < ADMIN_MENUS.length; g++) {
        var items = ADMIN_MENUS[g].items || [];
        for (var i = 0; i < items.length; i++) out.push(items[i]);
    }
    return out;
}
function adm_findItem(id) {
    var items = adm_items();
    for (var i = 0; i < items.length; i++) if (items[i].id === id) return items[i];
    return null;
}

// ── 현재 페이지 파일명 (admin/ 기준). 빈 경로(/admin/)는 dashboard.html 로 본다 ──
function adm_currentPage() {
    var seg = (location.pathname.split('/').pop() || '').toLowerCase();
    return seg || 'dashboard.html';
}
function adm_isDashboard() { return !!document.getElementById('tab-dashboard'); }

// ── 항목의 링크 주소. tab/view 는 dashboard.html#id (별도 페이지에서 눌러도 dashboard 로 간다) ──
function adm_hrefFor(item) {
    return item.kind === 'page' ? item.target : 'dashboard.html#' + item.id;
}

// ── 사이드바 그리기 — 모든 ${…} 대신 문자열 연결 + escapeHtml/escapeAttr (라벨은 tAttr 짝) ──
function adm_renderSidebar() {
    var aside = document.getElementById('adminSidebar');
    if (!aside) return;
    var html = '<button type="button" class="adm-toggle" id="admNavToggle" aria-label="Menu">'
        + '<i class="fas fa-bars"></i> ' + tSpan('Menu', '메뉴') + '</button>'
        + '<nav class="adm-nav">';
    for (var g = 0; g < ADMIN_MENUS.length; g++) {
        var group = ADMIN_MENUS[g];
        var items = (group.items || []).filter(function (it) { return it.ready; });
        if (!items.length) continue;   // ready:false 만 있는 묶음은 소제목도 숨긴다
        html += '<div class="adm-group" data-group="' + escapeAttr(group.key) + '">';
        if (group.en) html += '<div class="adm-group-label" ' + tAttr(group.en, group.ko) + '>' + escapeHtml(t(group.en, group.ko)) + '</div>';
        for (var i = 0; i < items.length; i++) {
            var it = items[i];
            html += '<a class="adm-item" href="' + escapeAttr(adm_hrefFor(it)) + '"'
                + ' data-id="' + escapeAttr(it.id) + '" data-kind="' + escapeAttr(it.kind) + '" data-target="' + escapeAttr(it.target) + '">'
                + '<i class="fas ' + escapeAttr(it.icon) + '"></i>'
                + '<span ' + tAttr(it.en, it.ko) + '>' + escapeHtml(t(it.en, it.ko)) + '</span></a>';
        }
        html += '</div>';
    }
    html += '</nav>';
    aside.innerHTML = html;

    // 모바일(≤768px) 접기/펼치기
    document.getElementById('admNavToggle').addEventListener('click', function () {
        aside.classList.toggle('open');
    });

    // 사이드바 클릭 — dashboard 안에서는 해시만 바꾸고(새로고침 없음) 라우터가 처리
    aside.addEventListener('click', function (e) {
        var a = e.target.closest('.adm-item');
        if (!a) return;
        aside.classList.remove('open');
        if (a.dataset.kind === 'page' || !adm_isDashboard()) return;   // 일반 이동
        e.preventDefault();
        var id = a.dataset.id;
        if (location.hash === '#' + id) adm_route(); else location.hash = '#' + id;
    });
}

// ── 활성 표시 ──
function adm_setActive(id) {
    var links = document.querySelectorAll('#adminSidebar .adm-item');
    for (var i = 0; i < links.length; i++) {
        links[i].classList.toggle('active', links[i].dataset.id === id);
    }
}

// ── 해시 라우팅 (dashboard.html 에서만). 없거나 모르는 해시 → 대시보드 ──
function adm_route() {
    if (!adm_isDashboard()) return;
    var id = (location.hash || '').replace(/^#/, '');
    var item = adm_findItem(id);
    if (!item || !item.ready || item.kind === 'page') item = adm_findItem('dashboard');

    if (item.kind === 'tab') {
        var tabEl = document.querySelector('.tabs .tab[data-tab="' + item.target + '"]');
        if (tabEl) tabEl.click();   // 기존 탭 핸들러가 .tab/.tab-content 활성을 전부 처리한다
    } else {
        var tabs = document.querySelectorAll('.tabs .tab, .tab-content');
        for (var i = 0; i < tabs.length; i++) tabs[i].classList.remove('active');
        var view = document.getElementById('tab-' + item.target);
        if (view) view.classList.add('active');
        if (item.target === 'dashboard' && typeof dash_render === 'function') dash_render(view);
    }
    adm_setActive(item.id);
}

// ── 초기화 ──
function adm_init() {
    adm_renderSidebar();
    if (adm_isDashboard()) {
        // 옛 .tabs 바를 직접 눌렀을 때도 사이드바 표시·주소를 맞춘다 (hashchange 는 안 일으킨다)
        document.addEventListener('click', function (e) {
            var tab = e.target.closest('.tabs .tab');
            if (!tab || !tab.dataset.tab) return;
            adm_setActive(tab.dataset.tab);
            try { history.replaceState(null, '', '#' + tab.dataset.tab); } catch (err) {}
        });
        window.addEventListener('hashchange', adm_route);
        adm_route();   // 초기 진입(# 없음) = 대시보드
    } else {
        // 별도 페이지: 현재 파일명과 같은 page 항목을 강조
        var cur = adm_currentPage();
        var items = adm_items();
        for (var i = 0; i < items.length; i++) {
            if (items[i].kind === 'page' && items[i].target.toLowerCase() === cur) { adm_setActive(items[i].id); break; }
        }
    }
}

// 스크립트가 body 끝(인라인 스크립트 앞)에 실리므로 DOMContentLoaded 로 미룬다 —
// 인라인 스크립트의 .tab 클릭 핸들러가 붙은 뒤에 라우팅해야 tab.click() 이 먹는다.
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', adm_init);
else adm_init();
