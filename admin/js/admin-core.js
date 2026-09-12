/* ─────────────────────────────────────────────────────────────────────────
   admin-core.js — 어드민 공통 부품 (2026-09-12 어드민 개편 1단계)
   정본: docs/회의/2026-09-12-구현계약서-어드민개편.md 3장 1단계 · 6장 리스크 3·4·5

   ★ 선언 규칙: 전역 `function` 선언만 쓴다. `const`/`let` 전역 금지.
     별도 페이지 5개(consultations·trend-submissions·newsletter·notify·articles)가
     escapeHtml·escapeAttr·showToast 를 각자 `function` 으로 갖고 있다 —
     같은 이름의 `function` 은 뒤에 오는 것이 이겨 무해하지만,
     `const`/`let` 재선언은 SyntaxError 로 페이지가 죽는다(리스크 5).
   ★ 로드 순서: firebase-config.js 뒤, 페이지 인라인 스크립트 앞.
   ───────────────────────────────────────────────────────────────────────── */

// ── XSS 방어 — 본문 출력용 (dashboard.html 기존 escapeHtml 과 동작 동일) ──
function escapeHtml(text) {
    var div = document.createElement('div');
    div.textContent = String(text == null ? '' : text);
    return div.innerHTML;
}

// ── XSS 방어 — 속성값 출력용. 검수대장 A-011 원인(따옴표 미이스케이프) ──
//    escapeHtml 은 &,<,> 만 바꾸므로 `attr="${…}"` 안에서는 반드시 이것을 쓴다.
function escapeAttr(text) {
    return escapeHtml(text).replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

// ── 다국어 — lang.js 가 동적 요소를 다시 훑지 않으므로 현재 언어 텍스트 + 속성 짝을 같이 찍는다 ──
function admLang() { return document.documentElement.lang === 'ko' ? 'ko' : 'en'; }
function t(en, ko) { return admLang() === 'ko' ? ko : en; }
function tAttr(en, ko) { return 'data-en="' + escapeAttr(en) + '" data-ko="' + escapeAttr(ko) + '"'; }
function tSpan(en, ko) { return '<span ' + tAttr(en, ko) + '>' + escapeHtml(t(en, ko)) + '</span>'; }

// ── 모달 — 기존 #modal / #modalContent 재사용, 없으면 만든다 ──
//    닫기 버튼은 closeModal 이름을 부르지 않고 직접 닫는다(별도 페이지가 window.closeModal 을
//    자기 #modalOverlay 용으로 덮어쓰므로 이름 호출이면 엉뚱한 요소를 닫는다).
function admModalEl() {
    var el = document.getElementById('modal');
    if (el) return el;
    el = document.createElement('div');
    el.className = 'modal-overlay adm-modal-overlay';
    el.id = 'modal';
    el.innerHTML = '<div class="modal adm-modal">'
        + '<button class="close-btn adm-modal-close" type="button" aria-label="Close">&times;</button>'
        + '<div id="modalContent"></div></div>';
    el.addEventListener('click', function (e) { if (e.target === e.currentTarget) el.classList.remove('show'); });
    el.querySelector('.adm-modal-close').addEventListener('click', function () { el.classList.remove('show'); });
    document.body.appendChild(el);
    return el;
}
function openModal(html) {
    var el = admModalEl();
    var content = document.getElementById('modalContent');
    if (content) content.innerHTML = html;   // 호출자가 escapeHtml 을 마친 HTML 을 넘긴다
    el.classList.add('show');
}
function closeModal() {
    var el = document.getElementById('modal');
    if (el) el.classList.remove('show');
}

// ── 토스트 — 별도 페이지 5개의 showToast 와 같은 모양(#toast, .toast.show, kind: success|error) ──
function showToast(msg, kind) {
    var el = document.getElementById('toast');
    if (!el) {
        el = document.createElement('div');
        el.id = 'toast';
        document.body.appendChild(el);
    }
    el.textContent = msg;
    el.className = 'toast adm-toast show' + (kind ? ' ' + kind : '');
    clearTimeout(el._admTimer);
    el._admTimer = setTimeout(function () { el.classList.remove('show'); }, 3000);
}

// ── 날짜 — 로컬 기준 YYYY-MM-DD HH:mm. toISOString 금지(UTC 라 한국 새벽에 하루 전이 된다) ──
function fmtDate(ts) {
    if (!ts) return '';
    var d = (ts && typeof ts.toDate === 'function') ? ts.toDate() : new Date(ts);
    if (isNaN(d.getTime())) return '';
    var p = function (n) { return (n < 10 ? '0' : '') + n; };
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) + ' ' + p(d.getHours()) + ':' + p(d.getMinutes());
}

// ── URL 가드 — http(s) 만 통과 (javascript: 차단, 검수관리 rvSafeUrl 과 같은 방식) ──
function safeUrl(u) {
    return (u && /^https?:\/\//i.test(String(u))) ? String(u) : '';
}

// ── 활동 로그 — adminLogs 컬렉션에 덧붙인다 (2026-09-12 개편 2단계, 계약서 4-1 필드 그대로) ──
//    entry = { action, target:{col,id,label}, from, to, note }. by·at·page 는 여기서 채운다.
//    ★ 실패해도 화면 흐름을 막지 않는다 — try/catch + 콘솔 warn + 토스트 한 줄(조용한 실패 방지).
//    db 가 없으면 아무것도 안 한다. 오프라인이면 add() 가 대기 상태라 catch 가 안 온다(검수대장 A-010 계열).
function logAdmin(entry) {
    if (typeof db === 'undefined' || !db || typeof firebase === 'undefined') return;
    try {
        var e = entry || {};
        var tg = e.target || {};
        var page = (location.pathname.split('/').pop() || '').replace(/\.html$/i, '') || 'dashboard';   // 'dashboard' | 'consultations' | …
        return db.collection('adminLogs').add({
            at: firebase.firestore.FieldValue.serverTimestamp(),
            by: (typeof auth !== 'undefined' && auth.currentUser && auth.currentUser.email) || '',
            action: String(e.action || ''),
            target: { col: String(tg.col || ''), id: String(tg.id || ''), label: String(tg.label == null ? '' : tg.label) },
            from: e.from == null ? '' : String(e.from),
            to: e.to == null ? '' : String(e.to),
            note: e.note == null ? '' : String(e.note),
            page: page
        }).catch(function (err) { logAdmin_fail(err); });
    } catch (err) { logAdmin_fail(err); }
}
function logAdmin_fail(err) {
    console.warn('[adminLogs] 기록 실패', err);
    showToast(t('Activity log failed — see dev note', '활동 기록 실패 — 개발 메모 참조'), 'warn');
}

// ── 검색 — 여러 단어 AND 부분일치, 대소문자 무시 (6단계 통합 검색용) ──
function matchText(hay, q) {
    var words = String(q == null ? '' : q).trim().toLowerCase().split(/\s+/).filter(Boolean);
    if (!words.length) return true;
    var h = String(hay == null ? '' : hay).toLowerCase();
    for (var i = 0; i < words.length; i++) {
        if (h.indexOf(words[i]) === -1) return false;
    }
    return true;
}

// ── CSV 내려받기 — admin/newsletter-subscribers.html 의 downloadCSV 를 일반화해 올린 것 (6단계, view-users.js 가 쓴다) ──
//    rows = [[셀, …], …] (첫 행이 머리글). 쉼표·따옴표·줄바꿈은 따옴표로 감싼다. UTF-8 BOM(엑셀). 토스트는 호출자가.
//    ★ 뉴스레터·디지털 알림 페이지는 자기 downloadCSV()(인자 없음) 를 계속 쓴다 — 뒤 `function` 선언이 이긴다.
function downloadCSV(rows, filename) {
    var csv = (rows || []).map(function (r) {
        return (r || []).map(function (cell) {
            var s = String(cell == null ? '' : cell);
            if (s.indexOf(',') !== -1 || s.indexOf('"') !== -1 || s.indexOf('\n') !== -1) s = '"' + s.replace(/"/g, '""') + '"';
            return s;
        }).join(',');
    }).join('\n');
    var blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = filename || 'archinode-export.csv';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

// ── 통합 검색 캐시 (6단계) — 각 화면이 이미 읽은 배열을 이름으로 등록한다. 검색은 이것만 뒤진다(추가 읽기 없음 — 리스크 7).
//    dashboard.html loadBrands/loadProducts/loadArticles/loadReview · view-leads.js leads_load · view-users.js users_load 가 등록.
//    `var` 는 별도 페이지가 같은 이름을 다시 선언해도 무해(const/let 만 SyntaxError — 리스크 5).
var adm_caches = {};
function admRegisterCache(name, arr) { adm_caches[String(name)] = Array.isArray(arr) ? arr : []; }
function admGetCache(name) { return adm_caches.hasOwnProperty(String(name)) ? adm_caches[String(name)] : null; }

// ── 검색 대상 정의 — 종류 뱃지 · 사이드바 항목(id) · 상세 함수 이름(없으면 화면만) · 라벨/부제/검색 본문 ──
//    부제: 브랜드=국가/카테고리, 제품=브랜드·카테고리, 아티클=브랜드·태그, 리드=유형/상태, 회원=회사, 검수=상태.
//    hay 에 이메일이 들어가는 건 검색용일 뿐 — 결과에는 이름·회사만 찍는다(개인정보는 상세에서).
var ADM_SEARCH_SOURCES = [
    { key: 'brands',       en: 'Brand',   ko: '브랜드', cls: 'adm-kind-brand',   menu: 'brands',   view: 'viewBrand',
      label: function (d) { return d.brandName || d.id; },
      sub:   function (d) { return [d.country, d.category].filter(Boolean).join(' / '); },
      hay:   function (d) { return [d.brandName, d.country, d.category, d.contactName, d.email, d.slug, d.status].join(' '); } },
    { key: 'products',     en: 'Product', ko: '제품',   cls: 'adm-kind-product', menu: 'products', view: '',
      label: function (d) { return d.name || d.id; },
      sub:   function (d) { return [d.brandName, d.category].filter(Boolean).join(' · '); },
      hay:   function (d) { return [d.name, d.brandName, d.category, d.subcategory, d.collection, d.materials, d.status].join(' '); } },
    { key: 'articles',     en: 'Article', ko: '아티클', cls: 'adm-kind-article', menu: 'articles', view: 'viewArticle',
      label: function (d) { return d.title || d.id; },
      sub:   function (d) { return [d.brandName, d.tag].filter(Boolean).join(' · '); },
      hay:   function (d) { return [d.title, d.brandName, d.tag, d.status].join(' '); } },
    { key: 'leads',        en: 'Lead',    ko: '리드',   cls: 'adm-kind-lead',    menu: 'leads',    view: 'lead_view',
      label: function (d) { return (d.name || '-') + (d.company ? ' / ' + d.company : ''); },
      sub:   function (d) { return [d.type, d.status].filter(Boolean).join(' / '); },
      hay:   function (d) { return [d.name, d.company, d.email, d.phone, d.productName, d.brandName, d.type, d.status].join(' '); } },
    { key: 'users',        en: 'Member',  ko: '회원',   cls: 'adm-kind-user',    menu: 'members',  view: 'usr_view',
      label: function (d) { return d.displayName || d.id; },
      sub:   function (d) { return d.company || ''; },
      hay:   function (d) { return [d.displayName, d.company, d.jobTitle, d.industry, d.email].join(' '); } },
    { key: 'reviewIssues', en: 'Review',  ko: '검수',   cls: 'adm-kind-review',  menu: 'review',   view: 'viewReview',
      label: function (d) { return (d.no || '-') + ' ' + (d.area || ''); },
      sub:   function (d) { return d.status || ''; },
      hay:   function (d) { return [d.no, d.area, d.screen, d.action, d.gap, d.status].join(' '); } }
];
var ADM_SEARCH_MAX = 30;

// ── 통합 검색 — 등록된 캐시만, 여러 단어 AND · 부분일치 · 대소문자 무시(matchText), 최대 30건.
//    별도 페이지 컬렉션(자문·투고·뉴스레터·알림·아티클 카드형)은 ADMIN_MENUS 의 page 항목을 라벨로 맞춰 "이동" 항목 하나.
//    반환: [{ kind, en, ko, cls, id, label, sub, menu, view, href, (page 만) labelKo, subKo }] — 값은 원문(이스케이프는 그리는 쪽 admin-nav.js 가 한다).
function searchAll(q) {
    var query = String(q == null ? '' : q).trim();
    var out = [];
    if (!query) return out;
    for (var s = 0; s < ADM_SEARCH_SOURCES.length && out.length < ADM_SEARCH_MAX; s++) {
        var src = ADM_SEARCH_SOURCES[s];
        var list = admGetCache(src.key);
        if (!list) continue;   // 그 화면을 아직 안 열었으면 건너뛴다(읽지 않는다)
        for (var i = 0; i < list.length && out.length < ADM_SEARCH_MAX; i++) {
            var d = list[i] || {};
            if (!matchText(src.hay(d), query)) continue;
            out.push({ kind: src.key, en: src.en, ko: src.ko, cls: src.cls, id: String(d.id || ''),
                       label: String(src.label(d) || ''), sub: String(src.sub(d) || ''), menu: src.menu, view: src.view, href: '' });
        }
    }
    if (typeof ADMIN_MENUS !== 'undefined' && out.length < ADM_SEARCH_MAX) {
        for (var g = 0; g < ADMIN_MENUS.length && out.length < ADM_SEARCH_MAX; g++) {
            var items = ADMIN_MENUS[g].items || [];
            for (var k = 0; k < items.length && out.length < ADM_SEARCH_MAX; k++) {
                var it = items[k];
                if (it.kind !== 'page' || !it.ready) continue;
                if (!matchText(it.en + ' ' + it.ko + ' ' + it.id, query)) continue;
                out.push({ kind: 'page', en: 'Page', ko: '페이지', cls: 'adm-kind-page', id: it.id,
                           label: it.en, labelKo: it.ko, sub: 'Go to page', subKo: '페이지로 이동', menu: it.id, view: '', href: it.target });
            }
        }
    }
    return out;
}
// 검색창 안내용 — 등록된 캐시 이름 목록(아직 안 연 화면은 검색에 안 잡힌다는 것을 사용자가 알게)
function admSearchLoadedKinds() {
    var loaded = [], missing = [];
    for (var s = 0; s < ADM_SEARCH_SOURCES.length; s++) {
        (admGetCache(ADM_SEARCH_SOURCES[s].key) ? loaded : missing).push(ADM_SEARCH_SOURCES[s]);
    }
    return { loaded: loaded, missing: missing };
}

// ── 앱 설치(PWA)용 서비스워커 등록 (2026-09-12) — admin/sw.js 는 캐시를 하지 않는다(그 파일 주석 참고).
//    6개 어드민 페이지가 전부 admin/ 안이라 상대경로 'sw.js' 가 같다. https·localhost 에서만 동작하고
//    실패해도 어드민에는 영향이 없으므로 console.warn 만 남긴다(오류 던지지 않음).
if ('serviceWorker' in navigator) {
    window.addEventListener('load', function () {
        navigator.serviceWorker.register('sw.js', { scope: '/admin/' })
            .catch(function (e) { console.warn('[ARCHINODE admin] 서비스워커 등록 실패', e); });
    });
}
