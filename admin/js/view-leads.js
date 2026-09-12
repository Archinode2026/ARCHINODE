/* ─────────────────────────────────────────────────────────────────────────
   view-leads.js — 고객 > 리드 인박스 (2026-09-12 어드민 개편 4a단계)
   정본: docs/회의/2026-09-12-구현계약서-어드민개편.md 3장 4단계 4a · 4-3절 · 5장 · 6장 리스크 1·4·8
   지시서: docs/회의/2026-09-12-작업지시-어드민개편-4a단계-리드인박스.md

   leads 컬렉션을 orderBy('createdAt','desc') 단일 필드로 200건씩 읽는다(「더 보기」 startAfter).
   유형·상태·브랜드 필터는 클라이언트(복합 색인 없음 — 리스크 8).
   「+ 수동 등록」 — 전화·메일로 온 리드를 어드민이 넣는다(공개 폼 4b 전까지 유일한 입구).
     create 는 규칙상 status 'new' 만 되므로, 폼에서 브랜드를 골랐으면 등록 뒤 배정을 한 번 더 쓴다.
   상세 모달 — 배정(승인 브랜드 select) → brandId·brandName·assignedAt·status 'assigned' + history
             + logAdmin('lead.assign') + mail 1통(list-your-brand.html 의 mail.add 패턴 그대로, 평문)
             / 상태 변경 + 메모 → history + logAdmin('lead.status') / adminNote 저장 / 이력 타임라인.
   ★ 전역 `var`/`function` 만 (const/let 전역 금지 — 리스크 5). 접두어 lead_/leads_.
   ★ 이름·회사·이메일·전화·본문·메모·브랜드명 전부 외부 입력 — 출력은 예외 없이 escapeHtml/escapeAttr
     (표시 시 이스케이프로 통일 — 리스크 4). onclick 문자열 주입 대신 data-* + 이벤트 위임.
   ★ 확인창(confirm/prompt/alert) 없음. 실패는 숨기지 않는다(토스트·폼 안 문구).
   ───────────────────────────────────────────────────────────────────────── */

var LEAD_PAGE_SIZE = 200;
var LEAD_PORTAL_URL = 'https://archinodekr.com/brand-portal/dashboard.html';   // 메일 본문 링크 — list-your-brand.html 과 같은 절대 주소 형식

// 유형 3종 (계약서 4-3)
var LEAD_TYPES = [
    { key: 'quote',         en: 'Quote request',    ko: '견적 요청',   cls: 'adm-type-quote' },
    { key: 'brand-inquiry', en: 'Brand inquiry',    ko: '브랜드 문의', cls: 'adm-type-brand' },
    { key: 'dealer',        en: 'Dealer connection', ko: '딜러 연결',  cls: 'adm-type-dealer' }
];
// 상태 5종. 브랜드 포털은 assigned→contacted→closed 만 바꿀 수 있다(규칙 update 조건)
var LEAD_STATUSES = [
    { key: 'new',       en: 'New',       ko: '신규',   cls: 'status-new' },
    { key: 'assigned',  en: 'Assigned',  ko: '배정됨', cls: 'status-assigned' },
    { key: 'contacted', en: 'Contacted', ko: '연락함', cls: 'status-approved' },
    { key: 'closed',    en: 'Closed',    ko: '종료',   cls: 'status-closed' },
    { key: 'spam',      en: 'Spam',      ko: '스팸',   cls: 'status-rejected' }
];
// 업종 — users.industry 와 같은 값 (auth/signup.html #signupIndustry 의 option 그대로)
var LEAD_INDUSTRIES = [
    { key: 'architect',    en: 'Architecture',           ko: '건축' },
    { key: 'interior',     en: 'Interior Design',        ko: '인테리어 디자인' },
    { key: 'landscape',    en: 'Landscape Architecture', ko: '조경' },
    { key: 'furniture',    en: 'Furniture Design',       ko: '가구 디자인' },
    { key: 'construction', en: 'Construction',           ko: '건설' },
    { key: 'dealer',       en: 'Dealer / Distributor',   ko: '딜러 / 유통' },
    { key: 'developer',    en: 'Real Estate Developer',  ko: '부동산 개발' },
    { key: 'student',      en: 'Student',                ko: '학생' },
    { key: 'other',        en: 'Other',                  ko: '기타' }
];
var LEAD_SOURCES = {
    'admin-manual': { en: 'Manual (admin)', ko: '수동 등록(어드민)' },
    'brand-page':   { en: 'Brand page',     ko: '브랜드 페이지' },
    'product-page': { en: 'Product page',   ko: '제품 페이지' },
    'contact':      { en: 'Contact form',   ko: '문의 폼' }
};
var LEAD_COLUMNS = [
    { en: 'Date',           ko: '날짜' },
    { en: 'Type',           ko: '유형' },
    { en: 'Name / Company', ko: '이름 / 회사' },
    { en: 'Contact',        ko: '연락처' },
    { en: 'Product',        ko: '제품' },
    { en: 'Assigned brand', ko: '배정 브랜드' },
    { en: 'Status',         ko: '상태' },
    { en: '',               ko: '' }
];

var lead_state = { items: [], lastDoc: null, hasMore: false, loading: false, error: false,
                   type: '', status: '', brand: '', authHooked: false,
                   brands: null, brandsLoading: false, saving: false };

// ── 메타 조회 ──
function lead_typeMeta(key)     { for (var i = 0; i < LEAD_TYPES.length; i++)      if (LEAD_TYPES[i].key === key)      return LEAD_TYPES[i];      return null; }
function lead_statusMeta(key)   { for (var i = 0; i < LEAD_STATUSES.length; i++)   if (LEAD_STATUSES[i].key === key)   return LEAD_STATUSES[i];   return null; }
function lead_industryMeta(key) { for (var i = 0; i < LEAD_INDUSTRIES.length; i++) if (LEAD_INDUSTRIES[i].key === key) return LEAD_INDUSTRIES[i]; return null; }
function lead_findItem(id)  { for (var i = 0; i < lead_state.items.length; i++) if (lead_state.items[i].id === id) return lead_state.items[i]; return null; }
function lead_findBrand(id) { var bs = lead_state.brands || []; for (var i = 0; i < bs.length; i++) if (bs[i].id === id) return bs[i]; return null; }
function lead_label(it) { return String(it.name || '') + (it.company ? ' / ' + String(it.company) : ''); }   // 활동 로그 target.label

// ── 뱃지 — 모르는 값은 원문 그대로(이스케이프) ──
function lead_typeBadge(type) {
    var m = lead_typeMeta(type);
    return m ? '<span class="adm-type ' + m.cls + '" ' + tAttr(m.en, m.ko) + '>' + escapeHtml(t(m.en, m.ko)) + '</span>'
             : '<span class="adm-type">' + escapeHtml(type || '-') + '</span>';
}
function lead_statusBadge(status) {
    var m = lead_statusMeta(status);
    return m ? '<span class="status ' + m.cls + '" ' + tAttr(m.en, m.ko) + '>' + escapeHtml(t(m.en, m.ko)) + '</span>'
             : '<span class="status">' + escapeHtml(status || '-') + '</span>';
}
function lead_industryLabel(key) { var m = lead_industryMeta(key); return m ? t(m.en, m.ko) : String(key || ''); }
function lead_sourceLabel(key)   { var m = LEAD_SOURCES[key];     return m ? t(m.en, m.ko) : String(key || ''); }

// ── 화면 그리기. el = #tab-leads. 뼈대는 한 번만, 이후 호출은 다시 읽기만 ──
function leads_render(el) {
    el = el || document.getElementById('tab-leads');
    if (!el) return;
    if (!document.getElementById('leadTable')) {
        var html = '<div class="section-card adm-leads">'
            + '<div class="adm-toolbar">'
            + leads_selectHtml('leadType',   [{ key: '', en: 'All types',    ko: '전체 유형' }].concat(LEAD_TYPES),    lead_state.type)
            + leads_selectHtml('leadStatus', [{ key: '', en: 'All statuses', ko: '전체 상태' }].concat(LEAD_STATUSES), lead_state.status)
            + '<select id="leadBrand"></select>'
            + '<div class="adm-spacer"></div>'
            + '<button type="button" class="act-btn act-add" id="leadNewBtn" ' + tAttr('+ Manual entry', '+ 수동 등록') + '>' + escapeHtml(t('+ Manual entry', '+ 수동 등록')) + '</button>'
            + '<button type="button" class="act-btn act-view" id="leadRefreshBtn" ' + tAttr('Refresh', '새로고침') + '>' + escapeHtml(t('Refresh', '새로고침')) + '</button>'
            + '</div>'
            + '<div class="adm-msg" id="leadMsg"></div>'
            + '<table><thead>' + leads_theadHtml() + '</thead><tbody id="leadTable"></tbody></table>'
            + '<div class="adm-more"><button type="button" class="act-btn act-add" id="leadMoreBtn" style="display:none;" ' + tAttr('Load more', '더 보기') + '>' + escapeHtml(t('Load more', '더 보기')) + '</button></div>'
            + '</div>';
        el.innerHTML = html;
        document.getElementById('leadType').addEventListener('change',   function () { lead_state.type = this.value;   leads_draw(); });
        document.getElementById('leadStatus').addEventListener('change', function () { lead_state.status = this.value; leads_draw(); });
        document.getElementById('leadBrand').addEventListener('change',  function () { lead_state.brand = this.value;  leads_draw(); });
        document.getElementById('leadNewBtn').addEventListener('click', lead_openForm);
        document.getElementById('leadRefreshBtn').addEventListener('click', function () { leads_load(false); leads_loadBrands(true); });
        document.getElementById('leadMoreBtn').addEventListener('click', function () { leads_load(true); });
        // [보기] — onclick 문자열 대신 data-lead-view + 위임 (리스크 4 ①)
        document.getElementById('leadTable').addEventListener('click', function (e) {
            var b = e.target.closest('[data-lead-view]');
            if (b) lead_view(b.getAttribute('data-lead-view'));
        });
        leads_fillBrandFilter();
    }
    leads_load(false);
    leads_loadBrands(false);
}

// ── <select> — option 도 data-en/ko 짝 + 현재 언어 텍스트 (view-logs.js 와 같은 방식) ──
function leads_selectHtml(id, options, current) {
    var html = '<select id="' + escapeAttr(id) + '">';
    for (var i = 0; i < options.length; i++) {
        var o = options[i];
        html += '<option value="' + escapeAttr(o.key) + '"' + (o.key === current ? ' selected' : '') + ' ' + tAttr(o.en, o.ko) + '>' + escapeHtml(t(o.en, o.ko)) + '</option>';
    }
    return html + '</select>';
}

function leads_theadHtml() {
    var html = '<tr>';
    for (var i = 0; i < LEAD_COLUMNS.length; i++) {
        html += '<th ' + tAttr(LEAD_COLUMNS[i].en, LEAD_COLUMNS[i].ko) + '>' + escapeHtml(t(LEAD_COLUMNS[i].en, LEAD_COLUMNS[i].ko)) + '</th>';
    }
    return html + '</tr>';
}

// ── 승인 브랜드 목록 (배정 select · 브랜드 필터). 단일 where — 복합 색인 없음. 실패는 토스트 ──
function leads_loadBrands(force) {
    if (lead_state.brandsLoading) return;
    if (lead_state.brands && !force) { leads_fillBrandFilter(); return; }
    if (typeof db === 'undefined' || typeof auth === 'undefined' || !auth.currentUser) return;   // 로그인 전: leads_load 가 auth 를 기다린 뒤 다시 부른다
    lead_state.brandsLoading = true;
    db.collection('brands').where('status', '==', 'approved').get().then(function (snap) {
        var list = [];
        snap.forEach(function (d) {
            var b = d.data() || {};
            list.push({ id: d.id, name: String(b.brandName || ''), email: String(b.email || '') });
        });
        list.sort(function (a, b) { return a.name.localeCompare(b.name); });
        lead_state.brands = list;
        lead_state.brandsLoading = false;
        leads_fillBrandFilter();
    }).catch(function (err) {
        lead_state.brandsLoading = false;
        console.error('[leads] brands read failed', err);
        showToast(t('Could not load approved brands: ', '승인 브랜드 목록 읽기 실패: ') + ((err && err.code) || ''), 'error');
    });
}

// 브랜드 필터 옵션: 전체 / 미배정 / 승인 브랜드 각각. 현재 선택은 유지
function leads_fillBrandFilter() {
    var sel = document.getElementById('leadBrand');
    if (!sel) return;
    var cur = lead_state.brand;
    var html = '<option value="" ' + tAttr('All brands', '전체 브랜드') + '>' + escapeHtml(t('All brands', '전체 브랜드')) + '</option>'
        + '<option value="__none"' + (cur === '__none' ? ' selected' : '') + ' ' + tAttr('Unassigned', '미배정') + '>' + escapeHtml(t('Unassigned', '미배정')) + '</option>';
    var bs = lead_state.brands || [];
    for (var i = 0; i < bs.length; i++) {
        html += '<option value="' + escapeAttr(bs[i].id) + '"' + (cur === bs[i].id ? ' selected' : '') + '>' + escapeHtml(bs[i].name || bs[i].id) + '</option>';
    }
    sel.innerHTML = html;
}

// 배정 select 옵션 (수동 등록 폼 · 상세 모달). value = brandId
function leads_brandOptionsHtml(current, noneEn, noneKo) {
    var html = '<option value="" ' + tAttr(noneEn, noneKo) + '>' + escapeHtml(t(noneEn, noneKo)) + '</option>';
    var bs = lead_state.brands || [];
    for (var i = 0; i < bs.length; i++) {
        html += '<option value="' + escapeAttr(bs[i].id) + '"' + (current === bs[i].id ? ' selected' : '') + '>' + escapeHtml(bs[i].name || bs[i].id) + '</option>';
    }
    return html;
}

// ── 읽기. more=true 면 마지막 문서 다음부터 200건 더 (startAfter) ──
function leads_load(more) {
    if (lead_state.loading) return;
    if (typeof db === 'undefined' || typeof auth === 'undefined' || !auth.currentUser) { leads_waitAuth(); return; }   // 로그인 전 진입(#leads 직접 열기)
    if (!more) { lead_state.items = []; lead_state.lastDoc = null; lead_state.hasMore = false; }
    var q = db.collection('leads').orderBy('createdAt', 'desc').limit(LEAD_PAGE_SIZE);   // 단일 필드 — 복합 색인 불필요
    if (more && lead_state.lastDoc) q = q.startAfter(lead_state.lastDoc);
    lead_state.loading = true;
    lead_state.error = false;
    leads_msg(t('Loading…', '불러오는 중…'), false);
    q.get().then(function (snap) {
        snap.forEach(function (d) { lead_state.items.push(Object.assign({ id: d.id }, d.data())); });
        if (typeof admRegisterCache === 'function') admRegisterCache('leads', lead_state.items);   // 6단계 통합 검색 캐시(추가 읽기 없음)
        if (snap.size) lead_state.lastDoc = snap.docs[snap.docs.length - 1];
        lead_state.hasMore = snap.size === LEAD_PAGE_SIZE;
        lead_state.loading = false;
        leads_draw();
    }).catch(function (err) {
        lead_state.loading = false;
        lead_state.error = true;
        console.error('[leads] read failed', err);
        var code = (err && err.code) || (err && err.message) || '';
        leads_msg(code === 'permission-denied'
            ? t('Read failed (permission-denied) — check that the leads rule is published', '읽기 실패(permission-denied) — leads 규칙 게시 여부 확인')
            : t('Read failed: ', '읽기 실패: ') + code, true);
        leads_draw();   // 표는 비우되 오류문은 error 플래그로 유지
    });
}

// 로그인 완료를 한 번만 기다렸다가 다시 읽는다 (view-logs.js 의 logs_waitAuth 와 같은 방식)
function leads_waitAuth() {
    if (lead_state.authHooked || typeof auth === 'undefined') return;
    lead_state.authHooked = true;
    leads_msg(t('Sign in required', '로그인 필요'), false);
    var un = auth.onAuthStateChanged(function (u) {
        if (!u) return;
        if (typeof un === 'function') un();
        lead_state.authHooked = false;
        leads_load(false);
        leads_loadBrands(false);
    });
}

// ── 클라이언트 필터: 유형 · 상태 · 브랜드('' 전체, '__none' 미배정, 그 외 brandId) ──
function leads_filtered() {
    var type = lead_state.type, status = lead_state.status, brand = lead_state.brand;
    return lead_state.items.filter(function (it) {
        if (type && it.type !== type) return false;
        if (status && it.status !== status) return false;
        if (brand === '__none') { if (it.brandId) return false; }
        else if (brand && it.brandId !== brand) return false;
        return true;
    });
}

function leads_draw() {
    var tbody = document.getElementById('leadTable');
    if (!tbody) return;
    var list = leads_filtered();
    tbody.innerHTML = list.length
        ? leads_rowsHtml(list)
        : '<tr><td colspan="' + LEAD_COLUMNS.length + '" class="adm-muted">' + tSpan('No leads', '리드 없음') + '</td></tr>';
    var more = document.getElementById('leadMoreBtn');
    if (more) more.style.display = lead_state.hasMore ? '' : 'none';
    if (!lead_state.loading && !lead_state.error) {   // 오류 상태면 요약문으로 덮지 않는다
        leads_msg(t('Showing ' + list.length + ' of ' + lead_state.items.length + ' loaded', '불러온 ' + lead_state.items.length + '건 중 ' + list.length + '건 표시')
            + (lead_state.hasMore ? t(' — more available', ' — 더 있음') : ''), false);
    }
}

function leads_msg(text, isErr) {
    var el = document.getElementById('leadMsg');
    if (!el) return;
    el.textContent = text || '';
    el.classList.toggle('err', !!isErr);
}

// ── 행 HTML — 모든 값 escapeHtml/escapeAttr (연락처·본문은 외부 입력) ──
function leads_rowsHtml(list) {
    var html = '';
    for (var i = 0; i < list.length; i++) {
        var it = list[i] || {};
        html += '<tr>'
            + '<td class="adm-nowrap">' + escapeHtml(fmtDate(it.createdAt)) + '</td>'
            + '<td>' + lead_typeBadge(it.type) + '</td>'
            + '<td>' + escapeHtml(it.name || '-') + (it.company ? '<small class="adm-log-sub">' + escapeHtml(it.company) + '</small>' : '') + '</td>'
            + '<td>' + escapeHtml(it.email || '-') + (it.phone ? '<small class="adm-log-sub">' + escapeHtml(it.phone) + '</small>' : '') + '</td>'
            + '<td>' + escapeHtml(it.productName || '-') + (it.productId ? '<small class="adm-log-sub">' + escapeHtml(it.productId) + '</small>' : '') + '</td>'
            + '<td>' + escapeHtml(it.brandName || '-') + '</td>'
            + '<td>' + lead_statusBadge(it.status) + '</td>'
            + '<td><button type="button" class="act-btn act-view" data-lead-view="' + escapeAttr(it.id) + '" ' + tAttr('View', '보기') + '>' + escapeHtml(t('View', '보기')) + '</button></td>'
            + '</tr>';
    }
    return html;
}

// ── 입력값 읽기 (trim). 없으면 '' ──
function lead_val(id) { var el = document.getElementById(id); return el ? String(el.value || '').trim() : ''; }
function lead_showErr(id, text) { var el = document.getElementById(id); if (!el) return; el.textContent = text || ''; el.style.display = text ? 'block' : 'none'; }

// ── [+ 수동 등록] 폼 (admin-core.js openModal 재사용) ──
function lead_openForm() {
    var field = function (id, en, ko, tag, extra) {
        return '<label for="' + id + '" ' + tAttr(en, ko) + '>' + escapeHtml(t(en, ko)) + '</label>'
            + (tag === 'textarea' ? '<textarea id="' + id + '"></textarea>' : '<input type="' + (tag || 'text') + '" id="' + id + '"' + (extra || '') + '>');
    };
    var html = '<h2 ' + tAttr('Register a lead', '리드 수동 등록') + '>' + escapeHtml(t('Register a lead', '리드 수동 등록')) + '</h2>'
        + '<p class="adm-set-intro">' + escapeHtml(t('For leads that arrived by phone or email. Saved as status "new"; pick a brand below to assign it right away.',
                                                    '전화·메일로 들어온 리드용. 상태 "신규"로 저장되며, 아래에서 브랜드를 고르면 바로 배정합니다.')) + '</p>'
        + '<div class="adm-form">'
        + '<div class="adm-grid2">'
        +   '<div><label for="lf_type" ' + tAttr('Type *', '유형 *') + '>' + escapeHtml(t('Type *', '유형 *')) + '</label>' + leads_selectHtml('lf_type', LEAD_TYPES, 'quote') + '</div>'
        +   '<div><label for="lf_industry" ' + tAttr('Industry', '업종') + '>' + escapeHtml(t('Industry', '업종')) + '</label>'
        +     leads_selectHtml('lf_industry', [{ key: '', en: 'Select industry', ko: '업종 선택' }].concat(LEAD_INDUSTRIES), '') + '</div>'
        + '</div>'
        + '<div class="adm-grid2">'
        +   '<div>' + field('lf_name', 'Name *', '이름 *') + '</div>'
        +   '<div>' + field('lf_company', 'Company', '회사') + '</div>'
        + '</div>'
        + '<div class="adm-grid2">'
        +   '<div>' + field('lf_email', 'Email *', '이메일 *', 'email') + '</div>'
        +   '<div>' + field('lf_phone', 'Phone', '전화', 'tel') + '</div>'
        + '</div>'
        + field('lf_message', 'Message *', '본문 *', 'textarea')
        + '<div class="adm-grid2">'
        +   '<div>' + field('lf_productName', 'Product name (optional)', '제품명 (선택)') + '</div>'
        +   '<div>' + field('lf_productId', 'Product doc id (optional)', '제품 문서 id (선택)') + '</div>'
        + '</div>'
        + '<label for="lf_brand" ' + tAttr('Assign to brand (optional)', '배정 브랜드 (선택)') + '>' + escapeHtml(t('Assign to brand (optional)', '배정 브랜드 (선택)')) + '</label>'
        + '<select id="lf_brand">' + leads_brandOptionsHtml('', '— not now —', '— 나중에 —') + '</select>'
        + '<div class="adm-err" id="lfErr"></div>'
        + '<div class="adm-form-actions">'
        +   '<button type="button" class="act-btn adm-btn-cancel" id="lfCancelBtn" ' + tAttr('Cancel', '취소') + '>' + escapeHtml(t('Cancel', '취소')) + '</button>'
        +   '<button type="button" class="act-btn act-add" id="lfSaveBtn" ' + tAttr('Save', '저장') + '>' + escapeHtml(t('Save', '저장')) + '</button>'
        + '</div>'
        + '</div>';
    openModal(html);
    document.getElementById('lfCancelBtn').addEventListener('click', closeModal);
    document.getElementById('lfSaveBtn').addEventListener('click', lead_saveManual);
    document.getElementById('lf_name').focus();
}

// ── 수동 등록 저장 — status 'new' · source 'admin-manual' · createdAt serverTimestamp(규칙 == request.time) · history 첫 줄 ──
function lead_saveManual() {
    if (lead_state.saving) return;
    if (typeof db === 'undefined' || typeof auth === 'undefined' || !auth.currentUser) { showToast(t('Sign in required', '로그인 필요'), 'error'); return; }
    var data = {
        type: lead_val('lf_type'), name: lead_val('lf_name'), company: lead_val('lf_company'),
        email: lead_val('lf_email'), phone: lead_val('lf_phone'), industry: lead_val('lf_industry'),
        message: lead_val('lf_message'), productName: lead_val('lf_productName'), productId: lead_val('lf_productId')
    };
    var brandId = lead_val('lf_brand');
    var problems = [];
    if (!lead_typeMeta(data.type)) problems.push(t('Type is required.', '유형을 고르세요.'));
    if (!data.name) problems.push(t('Name is required.', '이름을 입력하세요.'));
    if (!(data.email.length > 5 && data.email.indexOf('@') > 0)) problems.push(t('A valid email is required.', '올바른 이메일을 입력하세요.'));   // 규칙: email.size() > 5
    if (!data.message) problems.push(t('Message is required.', '본문을 입력하세요.'));
    if (data.industry && !lead_industryMeta(data.industry)) data.industry = '';
    if (problems.length) { lead_showErr('lfErr', problems.join('\n')); return; }
    lead_showErr('lfErr', '');
    var by = auth.currentUser.email || '';
    var entry = { status: 'new', by: by, byRole: 'admin', at: new Date().toISOString(), note: 'manual entry' };
    var doc = {
        type: data.type, status: 'new',
        brandId: '', brandName: '',                       // 배정은 별도 update (create 는 규칙상 'new' 만)
        productId: data.productId, productName: data.productName,
        name: data.name, company: data.company, email: data.email, phone: data.phone, industry: data.industry, message: data.message,
        source: 'admin-manual', userId: '', adminNote: '', brandNote: '',
        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
        updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
        assignedAt: null,
        history: [entry]
    };
    var btn = document.getElementById('lfSaveBtn');
    lead_state.saving = true;
    if (btn) btn.disabled = true;
    db.collection('leads').add(doc).then(function (ref) {
        lead_state.saving = false;
        logAdmin({ action: 'lead.create', target: { col: 'leads', id: ref.id, label: lead_label(data) }, from: '', to: 'new', note: 'admin-manual · ' + data.type });
        showToast(t('Lead registered', '리드를 등록했습니다'), 'success');
        closeModal();
        if (brandId) {
            // 폼에서 브랜드를 골랐으면 바로 배정 — 목록에 없는 새 문서라 로컬 객체를 넘긴다
            var item = Object.assign({ id: ref.id }, doc, { createdAt: new Date(), updatedAt: new Date(), history: [entry] });
            lead_assignTo(item, brandId, function () { leads_load(false); });
        } else {
            leads_load(false);
        }
    }).catch(function (err) {
        lead_state.saving = false;
        if (btn) btn.disabled = false;
        console.error('[leads] create failed', err);
        var code = (err && err.code) || (err && err.message) || '';
        lead_showErr('lfErr', code === 'permission-denied'
            ? t('Save failed (permission-denied) — check that the leads rule is published', '저장 실패(permission-denied) — leads 규칙 게시 여부 확인')
            : t('Save failed: ', '저장 실패: ') + code);
    });
}

// ── 상세 모달 — 연락처·본문·유형·출처 · 배정 · 상태 변경 + 메모 · adminNote · 이력 ──
function lead_view(id) {
    var it = lead_findItem(id);
    if (!it) return;
    var dd = function (en, ko, val) { return '<dt ' + tAttr(en, ko) + '>' + escapeHtml(t(en, ko)) + '</dt><dd>' + escapeHtml(val || '-') + '</dd>'; };
    var hist = Array.isArray(it.history) ? it.history.slice().reverse() : [];   // 최신 위
    var histHtml = '';
    for (var i = 0; i < hist.length; i++) {
        var h = hist[i] || {};
        histHtml += '<li>' + lead_statusBadge(h.status) + ' <small>' + escapeHtml(fmtDate(h.at)) + ' · ' + escapeHtml(h.by || '-') + (h.byRole ? ' (' + escapeHtml(h.byRole) + ')' : '') + '</small>'
            + (h.note ? '<div>' + escapeHtml(h.note) + '</div>' : '') + '</li>';
    }
    if (!histHtml) histHtml = '<li class="adm-muted">' + tSpan('No history yet', '이력 없음') + '</li>';
    var statusOpts = '';
    for (var s = 0; s < LEAD_STATUSES.length; s++) {
        var sm = LEAD_STATUSES[s];
        statusOpts += '<option value="' + escapeAttr(sm.key) + '"' + (sm.key === it.status ? ' selected' : '') + ' ' + tAttr(sm.en, sm.ko) + '>' + escapeHtml(t(sm.en, sm.ko)) + '</option>';
    }
    var html = '<h2 class="adm-lead-h2">' + escapeHtml(it.name || '-') + ' ' + lead_typeBadge(it.type) + ' ' + lead_statusBadge(it.status) + '</h2>'
        + '<div class="adm-lead-detail">'
        + '<dl class="adm-dl">'
        + dd('Company', '회사', it.company)
        + dd('Email', '이메일', it.email)
        + dd('Phone', '전화', it.phone)
        + dd('Industry', '업종', lead_industryLabel(it.industry))
        + dd('Product', '제품', (it.productName || '') + (it.productId ? ' (' + it.productId + ')' : ''))
        + dd('Source', '출처', lead_sourceLabel(it.source) + (it.userId ? ' · uid ' + it.userId : ''))
        + dd('Received', '접수', fmtDate(it.createdAt))
        + dd('Assigned brand', '배정 브랜드', it.brandName ? it.brandName + (it.assignedAt ? ' · ' + fmtDate(it.assignedAt) : '') : '')
        + dd('Message', '본문', it.message)
        + (it.brandNote ? dd('Brand note', '브랜드 메모', it.brandNote) : '')
        + '</dl>'
        // 배정 — 승인 브랜드 select
        + '<div class="adm-bar">'
        +   '<label ' + tAttr('Assign', '배정') + '>' + escapeHtml(t('Assign', '배정')) + '</label>'
        +   '<select id="ldBrand">' + leads_brandOptionsHtml(it.brandId || '', '— select brand —', '— 브랜드 선택 —') + '</select>'
        +   '<button type="button" class="act-btn act-approve" id="ldAssignBtn" ' + tAttr('Assign', '배정') + '>' + escapeHtml(t('Assign', '배정')) + '</button>'
        + '</div>'
        // 상태 변경 + 메모
        + '<div class="adm-bar">'
        +   '<label ' + tAttr('Status', '상태') + '>' + escapeHtml(t('Status', '상태')) + '</label>'
        +   '<select id="ldStatus">' + statusOpts + '</select>'
        +   '<input type="text" id="ldNote" maxlength="200" placeholder="' + escapeAttr(t('Note (optional)', '메모 (선택)')) + '" data-en-placeholder="Note (optional)" data-ko-placeholder="메모 (선택)">'
        +   '<button type="button" class="act-btn act-add" id="ldStatusBtn" ' + tAttr('Save status', '상태 저장') + '>' + escapeHtml(t('Save status', '상태 저장')) + '</button>'
        + '</div>'
        // 어드민 메모
        + '<div class="adm-bar">'
        +   '<label ' + tAttr('Admin note', '어드민 메모') + '>' + escapeHtml(t('Admin note', '어드민 메모')) + '</label>'
        +   '<textarea id="ldAdminNote" rows="2" maxlength="1000">' + escapeHtml(it.adminNote || '') + '</textarea>'
        +   '<button type="button" class="act-btn act-view" id="ldNoteBtn" ' + tAttr('Save note', '메모 저장') + '>' + escapeHtml(t('Save note', '메모 저장')) + '</button>'
        + '</div>'
        + '<div class="adm-err" id="ldErr"></div>'
        + '<div class="adm-hist-head" ' + tAttr('History', '이력') + '>' + escapeHtml(t('History', '이력')) + '</div>'
        + '<ul class="adm-hist">' + histHtml + '</ul>'
        + '</div>';
    openModal(html);
    document.getElementById('ldAssignBtn').addEventListener('click', function () { lead_assignTo(it, lead_val('ldBrand'), function () { lead_view(it.id); }); });
    document.getElementById('ldStatusBtn').addEventListener('click', function () { lead_saveStatus(it); });
    document.getElementById('ldNoteBtn').addEventListener('click', function () { lead_saveNote(it); });
}

// ── 배정 — brandId·brandName·assignedAt·status 'assigned' + history + logAdmin('lead.assign') + mail 1통 ──
//    item 은 목록의 객체(같은 참조라 로컬 반영이 곧 표 갱신) 또는 수동 등록 직후의 로컬 객체. onDone 은 성공 뒤 호출.
function lead_assignTo(item, brandId, onDone) {
    if (lead_state.saving) return;
    var brand = lead_findBrand(brandId);
    if (!brand) { lead_showErr('ldErr', t('Select an approved brand first.', '승인 브랜드를 먼저 고르세요.')); showToast(t('Select an approved brand', '승인 브랜드를 선택하세요'), 'error'); return; }
    if (typeof db === 'undefined' || typeof auth === 'undefined' || !auth.currentUser) { showToast(t('Sign in required', '로그인 필요'), 'error'); return; }
    lead_showErr('ldErr', '');
    var by = auth.currentUser.email || '';
    var entry = { status: 'assigned', by: by, byRole: 'admin', at: new Date().toISOString(), note: 'assigned to ' + brand.name };
    var btn = document.getElementById('ldAssignBtn');
    lead_state.saving = true;
    if (btn) btn.disabled = true;
    db.collection('leads').doc(item.id).update({
        brandId: brand.id,
        brandName: brand.name,
        assignedAt: firebase.firestore.FieldValue.serverTimestamp(),
        status: 'assigned',
        updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
        history: firebase.firestore.FieldValue.arrayUnion(entry)
    }).then(function () {
        lead_state.saving = false;
        logAdmin({ action: 'lead.assign', target: { col: 'leads', id: item.id, label: lead_label(item) }, from: item.brandName || '', to: brand.name, note: String(item.status || '') + ' → assigned' });
        // 로컬 반영 (다시 읽지 않는다)
        item.brandId = brand.id; item.brandName = brand.name; item.assignedAt = new Date(); item.status = 'assigned'; item.updatedAt = new Date();
        item.history = (Array.isArray(item.history) ? item.history : []).concat([entry]);
        showToast(t('Assigned to ' + brand.name, brand.name + ' 에 배정했습니다'), 'success');
        lead_sendAssignMail(item, brand);
        leads_draw();
        if (onDone) onDone();
    }).catch(function (err) {
        lead_state.saving = false;
        if (btn) btn.disabled = false;
        console.error('[leads] assign failed', err);
        var code = (err && err.code) || (err && err.message) || '';
        var msg = code === 'permission-denied'
            ? t('Assign failed (permission-denied) — check that the leads rule is published', '배정 실패(permission-denied) — leads 규칙 게시 여부 확인')
            : t('Assign failed: ', '배정 실패: ') + code;
        lead_showErr('ldErr', msg);
        showToast(msg, 'error');
    });
}

// ── 배정 알림 메일 1통 — list-your-brand.html 의 mail.add 패턴 그대로 (to + message.subject/text, 평문).
//    본문에 리드 유형·이름·회사·메시지 요약 + 포털 링크. 연락처는 넣지 않는다(포털에서 본다). 실패는 토스트(조용한 실패 방지).
//    ★ 문서 저장 성공 ≠ 발송 — Trigger Email Extension 설치 여부는 미확인(CLAUDE.md 5절).
function lead_sendAssignMail(item, brand) {
    if (!brand.email) {
        showToast(t('Assigned — but the brand has no email on file, so no notification was queued', '배정됨 — 브랜드 이메일이 없어 알림 메일을 넣지 못했습니다'), 'warn');
        return;
    }
    var typeMeta = lead_typeMeta(item.type);
    var msg = String(item.message || '');
    var summary = msg.length > 300 ? msg.slice(0, 300) + '…' : msg;
    var lines = [
        'Dear ' + brand.name + ' team,',
        '',
        'A new lead has been assigned to your brand on ARCHINODE.',
        '',
        'Type: ' + (typeMeta ? typeMeta.en : String(item.type || '')),
        'Name: ' + String(item.name || '') + (item.company ? ' (' + String(item.company) + ')' : '')
    ];
    if (item.productName) lines.push('Product: ' + String(item.productName));
    lines = lines.concat([
        'Message: ' + summary,
        '',
        'Open your Brand Portal Inbox to see the full details and update the status:',
        LEAD_PORTAL_URL,
        '',
        'Best regards,',
        'ARCHINODE Team',
        'https://archinodekr.com'
    ]);
    return db.collection('mail').add({
        to: brand.email,
        message: {
            subject: 'New lead assigned — ARCHINODE',
            text: lines.join('\n')
        }
    }).catch(function (err) {
        console.warn('[leads] assign mail skipped:', err);
        showToast(t('Assigned — but the notification email could not be queued', '배정됨 — 알림 메일을 큐에 넣지 못했습니다'), 'warn');
    });
}

// ── 상태 변경 + 메모 → history + logAdmin('lead.status') ──
function lead_saveStatus(it) {
    if (lead_state.saving) return;
    if (typeof db === 'undefined' || typeof auth === 'undefined' || !auth.currentUser) { showToast(t('Sign in required', '로그인 필요'), 'error'); return; }
    var status = lead_val('ldStatus');
    var note = lead_val('ldNote');
    if (!lead_statusMeta(status)) return;
    if (status === it.status && !note) { showToast(t('Nothing changed', '바뀐 것이 없습니다')); return; }
    lead_showErr('ldErr', '');
    var by = auth.currentUser.email || '';
    var entry = { status: status, by: by, byRole: 'admin', at: new Date().toISOString(), note: note };
    var btn = document.getElementById('ldStatusBtn');
    lead_state.saving = true;
    if (btn) btn.disabled = true;
    db.collection('leads').doc(it.id).update({
        status: status,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
        history: firebase.firestore.FieldValue.arrayUnion(entry)
    }).then(function () {
        lead_state.saving = false;
        logAdmin({ action: 'lead.status', target: { col: 'leads', id: it.id, label: lead_label(it) }, from: it.status || '', to: status, note: note });
        it.status = status; it.updatedAt = new Date();
        it.history = (Array.isArray(it.history) ? it.history : []).concat([entry]);
        showToast(t('Status saved', '상태를 저장했습니다'), 'success');
        leads_draw();
        lead_view(it.id);   // 갱신된 상태·이력으로 다시 그림 (확인창 없음)
    }).catch(function (err) {
        lead_state.saving = false;
        if (btn) btn.disabled = false;
        console.error('[leads] status save failed', err);
        var code = (err && err.code) || (err && err.message) || '';
        lead_showErr('ldErr', t('Save failed: ', '저장 실패: ') + code);
    });
}

// ── adminNote 저장 (활동 로그 없음 — 계약서 4-1 예약 action 은 lead.status·lead.assign(+create) 뿐) ──
function lead_saveNote(it) {
    if (lead_state.saving) return;
    if (typeof db === 'undefined' || typeof auth === 'undefined' || !auth.currentUser) { showToast(t('Sign in required', '로그인 필요'), 'error'); return; }
    var note = lead_val('ldAdminNote');
    if (note === String(it.adminNote || '')) { showToast(t('Nothing changed', '바뀐 것이 없습니다')); return; }
    lead_showErr('ldErr', '');
    var btn = document.getElementById('ldNoteBtn');
    lead_state.saving = true;
    if (btn) btn.disabled = true;
    db.collection('leads').doc(it.id).update({
        adminNote: note,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    }).then(function () {
        lead_state.saving = false;
        if (btn) btn.disabled = false;
        it.adminNote = note; it.updatedAt = new Date();
        showToast(t('Note saved', '메모를 저장했습니다'), 'success');
    }).catch(function (err) {
        lead_state.saving = false;
        if (btn) btn.disabled = false;
        console.error('[leads] note save failed', err);
        var code = (err && err.code) || (err && err.message) || '';
        lead_showErr('ldErr', t('Save failed: ', '저장 실패: ') + code);
    });
}
