/* ─────────────────────────────────────────────────────────────────────────
   view-settings.js — 운영 > 설정 화면 (2026-09-12 어드민 개편 3단계)
   정본: docs/회의/2026-09-12-구현계약서-어드민개편.md 3장 3단계 · 4-2절 · 2-3절 · 6장 리스크 4·5

   Firestore `settings/config` 문서 1개(읽기 공개·쓰기 어드민)를 탭 3개로 보여주고 고친다.
     ① 정책 값   — listing.* (요금 문구 EN/KO·창립 요금 문구·무료 종료일·미결 안건)
                   ★ pendingIssue 가 비어 있지 않으면 각 칸 옆에 빨간 「안건 1 결정 대기」 표시.
                     저장은 막지 않는다(계약서 2-3 "빨간 표시로 막는다" = 시각 표시). 공개 페이지 연동 전.
     ② 사이트 정보 — site.* + adminNotice(어드민끼리 메모 — 대시보드 상단, view-dashboard.js)
     ③ 카테고리·어드민 — 읽기 전용. 카테고리는 brand-portal/dashboard.html 의 SUBCATEGORIES 를
                   fetch 해 파싱한다(eval 없음, 그 파일은 손대지 않는다). 어드민 이메일은 ADMIN_EMAILS(firebase-config.js).
   「기본값 채우기」는 문서가 없을 때만 보인다 — SET_DEFAULTS 는 for-brands.html 의 실제 문구.
   저장 → updatedAt·updatedBy + logAdmin('settings.save', note: 바뀐 키). 실패는 토스트.
   ★ 전역 `var`/`function` 만 (const/let 전역 금지 — 리스크 5). 접두어 set_.
   ★ 문서 값은 전부 사용자 값 — 출력은 예외 없이 escapeHtml/escapeAttr. 확인창(confirm/alert) 없음.
   ───────────────────────────────────────────────────────────────────────── */

// 기본값 — 계약서 4-2. 문구는 for-brands.html 752줄(freeUntilText)·757줄(founderText)·501줄("Free through December 2026" → freeUntil) 그대로.
// ★ 정책 숫자를 여기서 새로 정하지 않는다 — 코드에 이미 박힌 문구를 옮긴 것. 통화·금액은 규정집 2부 안건 1 미결.
var SET_DEFAULTS = {
    listing: {
        freeUntilText_en: 'Free until Dec 2026, then EUR 10 / month',
        freeUntilText_ko: '2026년 12월까지 무료, 이후 월 EUR 10',
        founderText_en:   'Same EUR 10 / month, no upsell',
        founderText_ko:   '동일 월 EUR 10, 추가 요금 없음',
        freeUntil:        '2026-12-31',
        pendingIssue:     '안건 1'
    },
    site: {
        operator:   '비비들리바이브',
        ceo:        '박승리',
        bizNo:      '640-03-02879',
        email:      'office@archinode.org',
        euDirector: 'Silvia Vandone',
        euEmail:    'silviavandone@hotmail.com',
        domain:     'archinodekr.com'
    },
    adminNotice: ''
};

// 입력 칸 정의 — key 는 문서 경로(group.field). type: text | date | textarea
var SET_FIELDS = {
    policy: [
        { key: 'listing.freeUntilText_en', en: 'Free-period text (EN)',   ko: '무료 기간 문구 (EN)',  type: 'text',  pending: true },
        { key: 'listing.freeUntilText_ko', en: 'Free-period text (KO)',   ko: '무료 기간 문구 (KO)',  type: 'text',  pending: true },
        { key: 'listing.founderText_en',   en: 'Founding-fee text (EN)',  ko: '창립 요금 문구 (EN)',  type: 'text',  pending: true },
        { key: 'listing.founderText_ko',   en: 'Founding-fee text (KO)',  ko: '창립 요금 문구 (KO)',  type: 'text',  pending: true },
        { key: 'listing.freeUntil',        en: 'Free until (date)',       ko: '무료 종료일',          type: 'date',  pending: true },
        { key: 'listing.pendingIssue',     en: 'Pending rulebook issue',  ko: '미결 안건 (규정집 2부)', type: 'text',  pending: false,
          hint: { en: 'Leave empty once the issue is decided — the red marks disappear.', ko: '안건이 결정되면 비운다 — 빨간 표시가 사라진다.' } }
    ],
    site: [
        { key: 'site.operator',   en: 'Operator',            ko: '운영 주체',         type: 'text' },
        { key: 'site.ceo',        en: 'CEO',                 ko: '대표',              type: 'text' },
        { key: 'site.bizNo',      en: 'Business reg. no.',   ko: '사업자등록번호',    type: 'text' },
        { key: 'site.email',      en: 'Contact email',       ko: '연락 메일',         type: 'text' },
        { key: 'site.euDirector', en: 'EU Director',         ko: 'EU 디렉터',         type: 'text' },
        { key: 'site.euEmail',    en: 'EU Director email',   ko: 'EU 디렉터 메일',    type: 'text' },
        { key: 'site.domain',     en: 'Domain',              ko: '도메인',            type: 'text' },
        { key: 'adminNotice',     en: 'Admin notice (shown on Dashboard)', ko: '어드민 메모 (대시보드 상단 표시)', type: 'textarea' }
    ]
};

var SET_SUBTABS = [
    { key: 'policy',     en: 'Policy values', ko: '정책 값' },
    { key: 'site',       en: 'Site info',     ko: '사이트 정보' },
    { key: 'categories', en: 'Categories · Admins', ko: '카테고리 · 어드민' }
];

var SET_PORTAL_PATH = '../brand-portal/dashboard.html';   // SUBCATEGORIES 정의가 있는 파일 (읽기만)

var set_state = { doc: null, exists: false, loading: false, saving: false, tab: 'policy', authHooked: false, cats: null };

// ── 화면 그리기. el = #tab-settings. 뼈대는 한 번만, 이후 호출은 다시 읽기만 ──
function set_render(el) {
    el = el || document.getElementById('tab-settings');
    if (!el) return;
    if (!document.getElementById('setForm')) {
        var html = '<div class="section-card adm-settings">'
            + '<div class="adm-subtabs" id="setSubtabs">' + set_subtabsHtml() + '</div>'
            + '<div class="adm-msg" id="setMsg"></div>'
            + '<form id="setForm" class="adm-set-form" novalidate>'
            + '<div class="adm-subpanel" data-panel="policy">'
            +   '<p class="adm-set-intro adm-set-warn" id="setPolicyIntro"></p>'
            +   set_fieldsHtml(SET_FIELDS.policy)
            + '</div>'
            + '<div class="adm-subpanel" data-panel="site">' + set_fieldsHtml(SET_FIELDS.site) + '</div>'
            + '<div class="adm-subpanel" data-panel="categories" id="setCatsPanel"><p class="adm-muted">' + tSpan('Loading…', '불러오는 중…') + '</p></div>'
            + '<div class="adm-set-actions" id="setActions">'
            +   '<button type="button" class="act-btn act-add" id="setDefaultsBtn" style="display:none;" ' + tAttr('Fill defaults', '기본값 채우기') + '>' + escapeHtml(t('Fill defaults', '기본값 채우기')) + '</button>'
            +   '<span class="adm-spacer"></span>'
            +   '<span class="adm-muted" id="setUpdated"></span>'
            +   '<button type="submit" class="act-btn act-approve" id="setSaveBtn" ' + tAttr('Save', '저장') + '>' + escapeHtml(t('Save', '저장')) + '</button>'
            + '</div>'
            + '</form>'
            + '</div>';
        el.innerHTML = html;

        document.getElementById('setSubtabs').addEventListener('click', function (e) {
            var b = e.target.closest('.adm-subtab');
            if (!b) return;
            set_showTab(b.dataset.tab);
        });
        document.getElementById('setForm').addEventListener('submit', function (e) { e.preventDefault(); set_save(); });
        document.getElementById('setDefaultsBtn').addEventListener('click', set_fillDefaults);
        var pend = set_input('listing.pendingIssue');
        if (pend) pend.addEventListener('input', set_drawPending);
    }
    set_showTab(set_state.tab);
    set_load();
    set_loadCategories();
}

function set_subtabsHtml() {
    var html = '';
    for (var i = 0; i < SET_SUBTABS.length; i++) {
        var s = SET_SUBTABS[i];
        html += '<button type="button" class="adm-subtab" data-tab="' + escapeAttr(s.key) + '" ' + tAttr(s.en, s.ko) + '>' + escapeHtml(t(s.en, s.ko)) + '</button>';
    }
    return html;
}

function set_showTab(key) {
    set_state.tab = key;
    var tabs = document.querySelectorAll('#setSubtabs .adm-subtab');
    for (var i = 0; i < tabs.length; i++) tabs[i].classList.toggle('active', tabs[i].dataset.tab === key);
    var panels = document.querySelectorAll('#setForm .adm-subpanel');
    for (var j = 0; j < panels.length; j++) panels[j].classList.toggle('active', panels[j].dataset.panel === key);
    var actions = document.getElementById('setActions');
    if (actions) actions.style.display = key === 'categories' ? 'none' : '';   // 읽기 전용 탭에는 저장 버튼 없음
}

// ── 입력 칸 HTML — 라벨은 tAttr 짝, id 는 key 의 점을 밑줄로 ──
function set_fieldsHtml(fields) {
    var html = '';
    for (var i = 0; i < fields.length; i++) {
        var f = fields[i];
        var id = set_inputId(f.key);
        html += '<div class="adm-set-row">'
            + '<label for="' + escapeAttr(id) + '" ' + tAttr(f.en, f.ko) + '>' + escapeHtml(t(f.en, f.ko)) + '</label>'
            + '<div class="adm-set-ctl">'
            + (f.type === 'textarea'
                ? '<textarea id="' + escapeAttr(id) + '" data-key="' + escapeAttr(f.key) + '" rows="3"></textarea>'
                : '<input type="' + (f.type === 'date' ? 'date' : 'text') + '" id="' + escapeAttr(id) + '" data-key="' + escapeAttr(f.key) + '">')
            + (f.pending ? '<span class="adm-pending" data-pending style="display:none;" ' + tAttr('Pending decision — Rulebook issue 1', '안건 1 결정 대기 — 규정집 2부') + '>'
                + escapeHtml(t('Pending decision — Rulebook issue 1', '안건 1 결정 대기 — 규정집 2부')) + '</span>' : '')
            + (f.hint ? '<small class="adm-set-hint" ' + tAttr(f.hint.en, f.hint.ko) + '>' + escapeHtml(t(f.hint.en, f.hint.ko)) + '</small>' : '')
            + '</div></div>';
    }
    return html;
}
function set_inputId(key) { return 'set_' + String(key).replace(/\./g, '_'); }
function set_input(key) { return document.getElementById(set_inputId(key)); }

// ── 문서 읽기. 없으면 「기본값 채우기」 버튼을 보인다 ──
function set_load() {
    if (set_state.loading) return;
    if (typeof db === 'undefined' || typeof auth === 'undefined' || !auth.currentUser) { set_waitAuth(); return; }   // 로그인 전 진입(#settings 직접 열기)
    set_state.loading = true;
    set_msg(t('Loading…', '불러오는 중…'), false);
    db.collection('settings').doc('config').get().then(function (snap) {
        set_state.loading = false;
        set_state.exists = snap.exists;
        set_state.doc = snap.exists ? (snap.data() || {}) : {};
        set_fillForm(set_state.doc);
        var btn = document.getElementById('setDefaultsBtn');
        if (btn) btn.style.display = snap.exists ? 'none' : '';
        set_msg(snap.exists ? '' : t('No settings document yet — press "Fill defaults" to create it from the current site text.', '아직 설정 문서가 없습니다 — 「기본값 채우기」로 현재 사이트 문구에서 만듭니다.'), false);
        set_drawUpdated();
    }).catch(function (err) {
        set_state.loading = false;
        console.error('[settings] read failed', err);
        var code = (err && err.code) || (err && err.message) || '';
        set_msg(code === 'permission-denied'
            ? t('Read failed (permission-denied) — check that the settings rule is published', '읽기 실패(permission-denied) — settings 규칙 게시 여부 확인')
            : t('Read failed: ', '읽기 실패: ') + code, true);
    });
}

// 로그인 완료를 한 번만 기다렸다가 다시 읽는다 (view-logs.js 의 logs_waitAuth 와 같은 방식)
function set_waitAuth() {
    if (set_state.authHooked || typeof auth === 'undefined') return;
    set_state.authHooked = true;
    set_msg(t('Sign in required', '로그인 필요'), false);
    var un = auth.onAuthStateChanged(function (u) {
        if (!u) return;
        if (typeof un === 'function') un();
        set_state.authHooked = false;
        set_load();
    });
}

// ── 문서 → 입력 칸. value 는 속성이 아니라 .value 로 넣는다(이스케이프 불필요, HTML 로 해석되지 않음) ──
function set_fillForm(doc) {
    var all = SET_FIELDS.policy.concat(SET_FIELDS.site);
    for (var i = 0; i < all.length; i++) {
        var el = set_input(all[i].key);
        if (el) el.value = set_getPath(doc, all[i].key);
    }
    set_drawPending();
}
function set_getPath(obj, key) {
    var parts = String(key).split('.');
    var cur = obj;
    for (var i = 0; i < parts.length; i++) {
        if (cur == null || typeof cur !== 'object') return '';
        cur = cur[parts[i]];
    }
    return cur == null ? '' : String(cur);
}

// ── 안건 1 표시 — pendingIssue 칸이 비어 있지 않으면 정책 칸마다 빨간 표시 + 상단 안내 ──
function set_drawPending() {
    var pendEl = set_input('listing.pendingIssue');
    var issue = pendEl ? String(pendEl.value || '').trim() : '';
    var marks = document.querySelectorAll('#setForm [data-pending]');
    for (var i = 0; i < marks.length; i++) marks[i].style.display = issue ? '' : 'none';
    var intro = document.getElementById('setPolicyIntro');
    if (!intro) return;
    if (issue) {
        intro.style.display = '';
        intro.textContent = t('Pending decision: ' + issue + ' (Rulebook part 2). These values are stored here but the public pages do not read them yet — values are copied from the current site text; change them only after the decision.',
            '결정 대기: ' + issue + ' (규정집 2부). 이 값은 저장되지만 공개 페이지는 아직 읽지 않습니다(연동 전) — 현재 사이트 문구를 그대로 옮긴 것이라 결정 뒤에만 고칩니다.');
    } else {
        intro.style.display = '';
        intro.textContent = t('Public pages do not read these values yet (to be connected in a later step).', '공개 페이지는 아직 이 값을 읽지 않습니다(연동은 다음 단계).');
    }
}

function set_drawUpdated() {
    var el = document.getElementById('setUpdated');
    if (!el) return;
    var d = set_state.doc || {};
    el.textContent = d.updatedAt ? t('Last saved ', '마지막 저장 ') + fmtDate(d.updatedAt) + (d.updatedBy ? ' · ' + String(d.updatedBy) : '') : '';
}

// ── 「기본값 채우기」 — 문서가 없을 때만. 입력 칸만 채우고 저장은 「저장」 버튼으로(set) ──
function set_fillDefaults() {
    set_fillForm(SET_DEFAULTS);
    set_msg(t('Defaults filled from for-brands.html text — press Save to create the document.', 'for-brands.html 문구로 채웠습니다 — 「저장」을 누르면 문서가 만들어집니다.'), false);
}

// ── 입력 칸 → 문서 객체 (listing·site·adminNotice 만 — 카테고리·어드민 이메일은 넣지 않는다, 계약서 2-3) ──
function set_collect() {
    var out = { listing: {}, site: {}, adminNotice: '' };
    var all = SET_FIELDS.policy.concat(SET_FIELDS.site);
    for (var i = 0; i < all.length; i++) {
        var el = set_input(all[i].key);
        var v = el ? String(el.value || '').trim() : '';
        var parts = all[i].key.split('.');
        if (parts.length === 2) out[parts[0]][parts[1]] = v; else out[parts[0]] = v;
    }
    return out;
}

// 바뀐 키 목록 (활동 로그 note 용)
function set_changedKeys(before, after) {
    var keys = [];
    var all = SET_FIELDS.policy.concat(SET_FIELDS.site);
    for (var i = 0; i < all.length; i++) {
        var k = all[i].key;
        if (set_getPath(before, k) !== set_getPath(after, k)) keys.push(k);
    }
    return keys;
}

// ── 저장 — set(merge) + updatedAt/updatedBy. 성공 시 logAdmin('settings.save'). 실패는 토스트(조용한 실패 방지) ──
function set_save() {
    if (set_state.saving) return;
    if (typeof db === 'undefined' || typeof auth === 'undefined' || !auth.currentUser) { showToast(t('Sign in required', '로그인 필요'), 'error'); return; }
    var data = set_collect();
    var changed = set_changedKeys(set_state.doc || {}, data);
    if (!changed.length && set_state.exists) { showToast(t('Nothing changed', '바뀐 것이 없습니다')); return; }
    var btn = document.getElementById('setSaveBtn');
    set_state.saving = true;
    if (btn) btn.disabled = true;
    var payload = {
        listing: data.listing,
        site: data.site,
        adminNotice: data.adminNotice,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
        updatedBy: auth.currentUser.email || ''
    };
    db.collection('settings').doc('config').set(payload, { merge: true }).then(function () {
        set_state.saving = false;
        if (btn) btn.disabled = false;
        var wasNew = !set_state.exists;
        set_state.exists = true;
        set_state.doc = Object.assign({}, set_state.doc || {}, data, { updatedAt: new Date(), updatedBy: payload.updatedBy });
        var dbtn = document.getElementById('setDefaultsBtn');
        if (dbtn) dbtn.style.display = 'none';
        set_drawUpdated();
        set_msg('', false);
        showToast(t('Settings saved', '설정을 저장했습니다'), 'success');
        logAdmin({ action: 'settings.save', target: { col: 'settings', id: 'config', label: 'config' }, from: '', to: '',
                   note: (wasNew ? 'created; ' : '') + changed.join(', ') });
        if (typeof dash_renderNotice === 'function') dash_renderNotice(data.adminNotice);   // 대시보드 상단 메모 즉시 반영
    }).catch(function (err) {
        set_state.saving = false;
        if (btn) btn.disabled = false;
        console.error('[settings] save failed', err);
        var code = (err && err.code) || (err && err.message) || '';
        showToast(code === 'permission-denied'
            ? t('Save failed (permission-denied) — check that the settings rule is published', '저장 실패(permission-denied) — settings 규칙 게시 여부 확인')
            : t('Save failed: ', '저장 실패: ') + code, 'error');
    });
}

function set_msg(text, isErr) {
    var el = document.getElementById('setMsg');
    if (!el) return;
    el.textContent = text || '';
    el.classList.toggle('err', !!isErr);
}

// ── ③ 카테고리·어드민 (읽기 전용) — brand-portal/dashboard.html 을 fetch 해 SUBCATEGORIES 를 정규식으로 파싱 ──
//    eval/new Function 없음. 대분류 한국어명은 같은 파일의 <option value="X" data-ko="…"> 에서. 실패는 숨기지 않는다.
function set_loadCategories() {
    var panel = document.getElementById('setCatsPanel');
    if (!panel) return;
    if (set_state.cats) { panel.innerHTML = set_categoriesHtml(set_state.cats); return; }
    fetch(encodeURI(SET_PORTAL_PATH)).then(function (r) {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.text();
    }).then(function (src) {
        var cats = set_parseCategories(src);
        if (!cats.mains.length) throw new Error('SUBCATEGORIES not found');
        set_state.cats = cats;
        panel.innerHTML = set_categoriesHtml(cats);
    }).catch(function (err) {
        console.error('[settings] categories load failed', err);
        panel.innerHTML = '<p class="adm-msg err">' + escapeHtml(t('Could not read categories from ', '카테고리를 읽지 못했습니다: ') + SET_PORTAL_PATH + ' — ' + ((err && err.message) || '')) + '</p>'
            + set_adminsHtml();
    });
}

// 소스 문자열 → { mains:[{key,en,ko,subs:[{slug,en,ko}]}], subCount }
function set_parseCategories(src) {
    var mains = [];
    var koNames = {};
    var optRe = /<option value="([A-Za-z]+)" data-en="[^"]*" data-ko="([^"]*)">/g;
    var m;
    while ((m = optRe.exec(src)) !== null) koNames[m[1]] = m[2];

    var start = src.indexOf('const SUBCATEGORIES = {');
    if (start === -1) return { mains: [], subCount: 0 };
    var end = src.indexOf('\n};', start);
    if (end === -1) return { mains: [], subCount: 0 };
    var block = src.slice(start, end);

    var lineRe = /^\s*([A-Za-z]+):\s*\[|\{\s*slug:\s*'([^']*)',\s*en:\s*'([^']*)',\s*ko:\s*'([^']*)'\s*\}/gm;
    var cur = null;
    var subCount = 0;
    while ((m = lineRe.exec(block)) !== null) {
        if (m[1]) {
            cur = { key: m[1], en: m[1], ko: koNames[m[1]] || m[1], subs: [] };
            mains.push(cur);
        } else if (cur) {
            cur.subs.push({ slug: m[2], en: m[3], ko: m[4] });
            subCount++;
        }
    }
    return { mains: mains, subCount: subCount };
}

function set_categoriesHtml(cats) {
    var html = '<p class="adm-set-intro">'
        + escapeHtml(t('Fixed in code — 1:1 with the static category pages (categories/). Source: brand-portal/dashboard.html SUBCATEGORIES. ',
                       '코드 고정 — 정적 카테고리 페이지(categories/)와 1:1. 출처: brand-portal/dashboard.html SUBCATEGORIES. '))
        + escapeHtml(String(cats.mains.length) + ' + ' + String(cats.subCount)) + '</p>'
        + '<table class="adm-cat-table"><thead><tr>'
        + '<th ' + tAttr('Category', '대분류') + '>' + escapeHtml(t('Category', '대분류')) + '</th>'
        + '<th ' + tAttr('Subcategories', '서브카테고리') + '>' + escapeHtml(t('Subcategories', '서브카테고리')) + '</th>'
        + '</tr></thead><tbody>';
    for (var i = 0; i < cats.mains.length; i++) {
        var c = cats.mains[i];
        var subs = '';
        for (var j = 0; j < c.subs.length; j++) {
            var s = c.subs[j];
            subs += '<span class="adm-cat-sub" title="' + escapeAttr(s.slug) + '">' + escapeHtml(t(s.en, s.ko)) + '</span>';
        }
        html += '<tr><td class="adm-nowrap"><strong>' + escapeHtml(c.en) + '</strong><small class="adm-log-sub">' + escapeHtml(c.ko) + ' · ' + escapeHtml(String(c.subs.length)) + '</small></td>'
            + '<td>' + subs + '</td></tr>';
    }
    html += '</tbody></table>' + set_adminsHtml();
    return html;
}

// 어드민 이메일 — firebase-config.js ADMIN_EMAILS(= firestore.rules isAdmin() 과 같은 2개). 규칙 파일 고정, 여기서 못 바꾼다.
function set_adminsHtml() {
    var list = (typeof ADMIN_EMAILS !== 'undefined' && ADMIN_EMAILS && ADMIN_EMAILS.length) ? ADMIN_EMAILS : [];
    var html = '<h4 class="adm-set-h4" ' + tAttr('Admin accounts', '어드민 계정') + '>' + escapeHtml(t('Admin accounts', '어드민 계정')) + '</h4>'
        + '<p class="adm-set-intro">' + escapeHtml(t('Fixed in the rules file (firestore.rules isAdmin() + firebase-config.js ADMIN_EMAILS) — cannot be changed here.',
                                                      '규칙 파일 고정(firestore.rules isAdmin() + firebase-config.js ADMIN_EMAILS) — 여기서는 못 바꿉니다.')) + '</p><ul class="adm-set-list">';
    for (var i = 0; i < list.length; i++) html += '<li>' + escapeHtml(list[i]) + '</li>';
    if (!list.length) html += '<li class="adm-muted">' + escapeHtml(t('ADMIN_EMAILS not loaded', 'ADMIN_EMAILS 미로드')) + '</li>';
    return html + '</ul>';
}
