/* ─────────────────────────────────────────────────────────────────────────
   view-regulations.js — 운영 > 규정집 화면 (2026-09-12 어드민 개편 3단계)
   정본: docs/회의/2026-09-12-구현계약서-어드민개편.md 3장 3단계 · 6장 리스크 4(DOMPurify)·9(docs/ 공개 서빙)

   docs/ 의 md 3개(규정집·작업일지·검수대장)를 fetch 해 marked(GFM, 표 포함) → DOMPurify → innerHTML.
   ★ DOMPurify.sanitize(marked.parse(md)) 필수 — 리포 안 파일이어도 원칙(리스크 4). 두 라이브러리는
     dashboard.html <head> 에서 자체 호스팅으로 싣는다(assets/vendor/, marked 12.0.2 · dompurify 3.1.6).
     A-032 에서 cdnjs 에서 옮겼다 — 같은 출처라 SRI 가 필요 없다. 없으면 렌더하지 않고 안내.
   ★ docs/ 가 GitHub Pages 에 공개 서빙되는 사실(검수대장 A-012, 한울님 결정 대기)을 이용할 뿐 새로 여는 게 아니다.
     비공개로 결정되면 settings/regulations(어드민이 md 붙여넣기)로 바꾼다 — 이번엔 안 한다.
   목차: 렌더된 h2/h3 에서 뽑는다. 앵커 = 소문자·마침표 제거·공백→하이픈. 링크 클릭은 JS 로 스크롤
     (location.hash 를 바꾸면 admin-nav.js 의 해시 라우터가 대시보드로 보내 버린다).
   ★ 전역 `var`/`function` 만 (const/let 전역 금지). 접두어 reg_. 파일 목록 3개 고정(정적 호스팅은 디렉터리 목록 없음).
   ───────────────────────────────────────────────────────────────────────── */

var REG_FILES = [
    { key: 'rulebook', path: '../docs/ARCHINODE 규정집.md', en: 'Rulebook',      ko: '규정집' },
    { key: 'journal',  path: '../docs/작업일지.md',          en: 'Work Journal',  ko: '작업일지' },
    { key: 'ledger',   path: '../docs/검수대장.md',          en: 'Review Ledger', ko: '검수대장' }
];

var reg_state = { tab: 'rulebook', cache: {}, fetchedAt: {}, loading: '' };   // fetchedAt — '언제 받은 사본인지' 표시용 (A-199)

// ── 화면 그리기. el = #tab-regulations. 뼈대는 한 번만 ──
function reg_render(el) {
    el = el || document.getElementById('tab-regulations');
    if (!el) return;
    if (!document.getElementById('regBody')) {
        var html = '<div class="section-card adm-regs">'
            + '<div class="adm-subtabs" id="regSubtabs">' + reg_subtabsHtml()
            +   '<div class="adm-spacer"></div>'
            +   '<button type="button" class="act-btn act-view adm-reg-refresh" id="regRefreshBtn" ' + tAttr('Refresh', '새로고침') + '>' + escapeHtml(t('Refresh', '새로고침')) + '</button>'
            + '</div>'
            + '<div class="adm-msg" id="regMsg"></div>'
            + '<div class="adm-reg-layout">'
            +   '<nav class="adm-reg-toc" id="regToc"></nav>'
            +   '<article class="adm-reg-body" id="regBody"></article>'
            + '</div></div>';
        el.innerHTML = html;
        document.getElementById('regSubtabs').addEventListener('click', function (e) {
            var b = e.target.closest('.adm-subtab');
            if (!b) return;
            reg_show(b.dataset.tab);
        });
        // 목차·본문 링크 — 해시를 바꾸지 않고 스크롤. 외부 링크는 새 창. md 파일 링크는 탭 전환
        document.getElementById('regRefreshBtn').addEventListener('click', function () {
            delete reg_state.cache[reg_state.tab];        // 세션 캐시를 버리고 다시 받는다 (A-199)
            reg_load(reg_file(reg_state.tab));
        });
        document.getElementById('regToc').addEventListener('click', reg_onLinkClick);
        document.getElementById('regBody').addEventListener('click', reg_onLinkClick);
    }
    reg_show(reg_state.tab);
}

function reg_subtabsHtml() {
    var html = '';
    for (var i = 0; i < REG_FILES.length; i++) {
        var f = REG_FILES[i];
        html += '<button type="button" class="adm-subtab" data-tab="' + escapeAttr(f.key) + '" ' + tAttr(f.en, f.ko) + '>' + escapeHtml(t(f.en, f.ko)) + '</button>';
    }
    return html;
}
function reg_file(key) {
    for (var i = 0; i < REG_FILES.length; i++) if (REG_FILES[i].key === key) return REG_FILES[i];
    return REG_FILES[0];
}

// ── 탭 전환 → 캐시에 있으면 바로, 없으면 fetch ──
function reg_show(key) {
    var f = reg_file(key);
    reg_state.tab = f.key;
    var tabs = document.querySelectorAll('#regSubtabs .adm-subtab');
    for (var i = 0; i < tabs.length; i++) tabs[i].classList.toggle('active', tabs[i].dataset.tab === f.key);
    if (reg_state.cache[f.key] != null) { reg_draw(f, reg_state.cache[f.key]); return; }
    reg_load(f);
}

function reg_load(f) {
    if (reg_state.loading === f.key) return;
    reg_state.loading = f.key;
    reg_msg('Loading…', '불러오는 중…', false);
    document.getElementById('regBody').innerHTML = '';
    document.getElementById('regToc').innerHTML = '';
    fetch(encodeURI(f.path), { cache: 'no-store' }).then(function (r) {   // A-199 — 브라우저 캐시를 건너뛴다
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.text();
    }).then(function (md) {
        reg_state.loading = '';
        reg_state.cache[f.key] = md;
        reg_state.fetchedAt[f.key] = new Date();
        if (reg_state.tab === f.key) reg_draw(f, md);
    }).catch(function (err) {
        reg_state.loading = '';
        console.error('[regulations] fetch failed', f.path, err);
        if (reg_state.tab !== f.key) return;
        var tail = ' — ' + f.path + ' (' + ((err && err.message) || '') + ')';   // A-215 — 짝으로 넘긴다
        reg_msg('Could not load file' + tail, '파일을 불러오지 못했습니다' + tail, true);
    });
}

// ── md → HTML. marked(GFM) → DOMPurify → innerHTML. 라이브러리가 없으면 렌더하지 않는다 ──
function reg_toHtml(md) {
    if (typeof marked === 'undefined' || typeof DOMPurify === 'undefined') return null;
    var raw = marked.parse(String(md == null ? '' : md), { gfm: true, breaks: false });
    return DOMPurify.sanitize(raw, {
        USE_PROFILES: { html: true },
        FORBID_TAGS: ['style', 'form', 'input', 'textarea', 'button', 'select', 'iframe', 'object', 'embed'],
        FORBID_ATTR: ['style', 'onerror', 'onload', 'onclick']
    });
}

function reg_draw(f, md) {
    var body = document.getElementById('regBody');
    var toc = document.getElementById('regToc');
    if (!body || !toc) return;
    var html = reg_toHtml(md);
    if (html == null) {
        body.innerHTML = '';
        toc.innerHTML = '';
        reg_msg('Renderer not loaded (marked / DOMPurify) — check the CDN script tags in dashboard.html',
                '렌더러 미로드(marked / DOMPurify) — dashboard.html 의 CDN script 태그 확인', true);   // A-215
        return;
    }
    body.innerHTML = html;   // DOMPurify 를 거친 HTML 만 여기 온다
    // '몇 자' 는 내용이 얼마나 오래된 것인지 말해 주지 않는다. 이 화면은 **배포된 사본**을
    // 읽으므로 커밋만 하고 push 하지 않은 변경은 보이지 않는다 — 그 사실을 화면에 적는다.
    // Netlify 는 last-modified 를 주지 않아(etag 만) 배포 시각은 알 수 없다. 그래서
    // 없는 시각을 꾸며 쓰지 않고, '언제 받았는지' 만 정확히 적는다 (A-199).
    var at = reg_state.fetchedAt[f.key];
    var hhmm = at ? (('0' + at.getHours()).slice(-2) + ':' + ('0' + at.getMinutes()).slice(-2)) : '';
    reg_msg('Deployed copy · fetched ' + hhmm + ' · ' + md.length + ' chars — commits not yet pushed will not appear',
            '배포된 사본 · ' + hhmm + ' 받음 · ' + md.length + '자 — 아직 push 하지 않은 변경은 보이지 않습니다',
            false);
    toc.innerHTML = reg_tocHtml(body);
    body.scrollTop = 0;
}

// ── 목차 — h2/h3 에 id 를 붙이고 링크 목록을 만든다. 앵커 규칙: 소문자·마침표 제거·공백→하이픈(중복은 -2, -3) ──
function reg_anchor(text) {
    return String(text == null ? '' : text).trim().toLowerCase().replace(/\./g, '').replace(/\s+/g, '-');
}
function reg_tocHtml(body) {
    var heads = body.querySelectorAll('h2, h3');
    var used = {};
    var html = '<div class="adm-group-label" ' + tAttr('Contents', '목차') + '>' + escapeHtml(t('Contents', '목차')) + '</div>';
    for (var i = 0; i < heads.length; i++) {
        var h = heads[i];
        var base = reg_anchor(h.textContent) || 'h' + i;
        var id = base;
        var n = 2;
        while (used[id]) id = base + '-' + (n++);
        used[id] = true;
        h.id = id;
        html += '<a class="adm-reg-toc-' + (h.tagName === 'H3' ? 'h3' : 'h2') + '" href="#' + escapeAttr(id) + '" data-anchor="' + escapeAttr(id) + '">' + escapeHtml(h.textContent) + '</a>';
    }
    if (!heads.length) html += '<span class="adm-muted">' + escapeHtml(t('No headings', '제목 없음')) + '</span>';
    return html;
}

// ── 링크 클릭 처리 (위임). #앵커 → 스크롤, *.md → 같은 화면 탭, http(s) → 새 창. 나머지는 막는다 ──
function reg_onLinkClick(e) {
    var a = e.target.closest('a');
    if (!a) return;
    var href = a.getAttribute('href') || '';
    if (a.dataset.anchor || href.charAt(0) === '#') {
        e.preventDefault();
        var id = a.dataset.anchor || decodeURIComponent(href.slice(1));
        var target = document.getElementById(id);
        if (!target) {   // 본문 안 링크는 앵커 규칙이 다를 수 있어 제목 텍스트로 한 번 더 찾는다
            var heads = document.querySelectorAll('#regBody h2, #regBody h3');
            for (var i = 0; i < heads.length; i++) if (reg_anchor(heads[i].textContent) === reg_anchor(id)) { target = heads[i]; break; }
        }
        if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
        return;
    }
    if (/\.md(#.*)?$/i.test(href)) {
        e.preventDefault();
        var name = decodeURIComponent(href.split('/').pop().replace(/#.*$/, ''));
        for (var j = 0; j < REG_FILES.length; j++) {
            if (REG_FILES[j].path.split('/').pop() === name) { reg_show(REG_FILES[j].key); return; }
        }
        reg_msg('Only the three files above are available here: ' + name,
                '이 화면에서는 위 3개 파일만 봅니다: ' + name, true);   // A-215
        return;
    }
    if (safeUrl(href)) { a.setAttribute('target', '_blank'); a.setAttribute('rel', 'noopener'); return; }
    e.preventDefault();   // 상대 경로(admin/ 기준으로 깨짐)·그 밖의 스킴은 열지 않는다
}

function reg_msg(enOrText, koOrIsErr, maybeIsErr) {
    var el = document.getElementById('regMsg');
    if (!el) return;
    var isErr;
    if (typeof koOrIsErr === 'string') {
        // bilingual mode (A-029): logs_msg(en, ko, isErr)
        var en = enOrText, ko = koOrIsErr;
        isErr = maybeIsErr;
        el.setAttribute('data-en', en);
        el.setAttribute('data-ko', ko);
        el.textContent = admLang() === 'ko' ? ko : en;
    } else {
        // single-string mode (backward compat)
        el.removeAttribute('data-en');
        el.removeAttribute('data-ko');
        el.textContent = enOrText || '';
        isErr = koOrIsErr;
    }
    el.classList.toggle('err', !!isErr);
}
