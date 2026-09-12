/* ─────────────────────────────────────────────────────────────────────────
   view-users.js — 고객 > 전문가 회원 (2026-09-12 어드민 개편 6단계) — 읽기 전용
   정본: docs/회의/2026-09-12-구현계약서-어드민개편.md 3장 6단계 · 6장 리스크 4·7
   지시서: docs/회의/2026-09-12-작업지시-어드민개편-6단계-회원-검색.md

   users 컬렉션(문서 ID = Auth UID)을 orderBy('createdAt','desc') 단일 필드로 200건씩 읽는다(「더 보기」 startAfter).
   필드는 auth/signup.html 이 실제로 쓰는 것 그대로 — displayName·email·company·jobTitle·industry·phone·
   role·likedProducts[]·likedBrands[]·createdAt·updatedAt (docs/firestore-schema.md 4절과 일치 확인 2026-09-12).
   업종 필터는 클라이언트(복합 색인 없음). 목록엔 이름·회사·업종·가입일·좋아요 수만 — 이메일·전화는 상세 모달에서만.
   상세: 좋아요한 브랜드/제품 이름 풀기 — admGetCache('brands'|'products')(dashboard.html loadBrands/loadProducts 가
   등록)에서 id→이름. 캐시에 없으면 id 그대로 + "(삭제됨/비공개)". 추가 읽기 없음.
   CSV: admin-core.js downloadCSV(rows, filename) — 현재 업종 필터 기준.
   ★ 삭제·정지·메일 발송 없음(Auth 계정까지 지워야 하는데 서버 코드가 없다). Firestore 쓰기 없음.
   ★ 전역 `var`/`function` 만 (const/let 전역 금지 — 리스크 5). 접두어 usr_/users_.
   ★ 이름·회사·직책·이메일·전화 전부 사용자 값 — 출력은 예외 없이 escapeHtml/escapeAttr. data-* + 이벤트 위임.
   ★ 확인창(confirm/prompt/alert) 없음. 실패는 숨기지 않는다(#usrMsg).
   ───────────────────────────────────────────────────────────────────────── */

var USR_PAGE_SIZE = 200;

// 업종 — auth/signup.html #signupIndustry 의 option 그대로 (view-leads.js LEAD_INDUSTRIES 와 같은 값)
var USR_INDUSTRIES = [
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

var USR_COLUMNS = [
    { en: 'Name',              ko: '이름' },
    { en: 'Company',           ko: '회사' },
    { en: 'Industry',          ko: '업종' },
    { en: 'Joined',            ko: '가입일' },
    { en: 'Likes (P / B)',     ko: '좋아요 (제품 / 브랜드)' },
    { en: '',                  ko: '' }
];

var USR_INTRO = {
    en: 'Read-only. Email and phone are shown in the detail view only. No delete or suspend here — deleting a member also requires removing the Auth account, which needs server code.',
    ko: '읽기 전용. 이메일·전화는 상세에서만 보입니다. 삭제·정지 기능은 없습니다 — 회원 삭제는 Auth 계정까지 지워야 하고 서버 코드가 필요합니다.'
};

var usr_state = { items: [], lastDoc: null, hasMore: false, loading: false, loaded: false, error: false, industry: '', authHooked: false };

// ── 메타 ──
function usr_industryMeta(key) { for (var i = 0; i < USR_INDUSTRIES.length; i++) if (USR_INDUSTRIES[i].key === key) return USR_INDUSTRIES[i]; return null; }
function usr_industryLabel(key) { var m = usr_industryMeta(key); return m ? t(m.en, m.ko) : String(key || ''); }
// 업종 표시 — 아는 값은 data-en/ko 짝, 모르는 값은 원문 그대로(이스케이프)
function usr_industrySpan(key) { var m = usr_industryMeta(key); return m ? tSpan(m.en, m.ko) : escapeHtml(key || '-'); }
function usr_findItem(id) { for (var i = 0; i < usr_state.items.length; i++) if (usr_state.items[i].id === id) return usr_state.items[i]; return null; }
function usr_likes(it, key) { return Array.isArray(it[key]) ? it[key] : []; }
// 대시보드 「회원 수」 카드 문구 — 200건 한 페이지가 꽉 찼으면(더 있음) "200+"
function usr_countText() { return usr_state.items.length + (usr_state.hasMore ? '+' : ''); }

// ── 화면 그리기. el = #tab-users. 뼈대는 한 번만. 이미 읽은 캐시가 있으면 다시 읽지 않는다(새로고침 버튼으로) ──
function users_render(el) {
    el = el || document.getElementById('tab-users');
    if (!el) return;
    if (!document.getElementById('usrTable')) {
        var html = '<div class="section-card adm-users">'
            + '<div class="adm-toolbar">'
            + users_selectHtml('usrIndustry', [{ key: '', en: 'All industries', ko: '전체 업종' }].concat(USR_INDUSTRIES), usr_state.industry)
            + '<div class="adm-spacer"></div>'
            + '<button type="button" class="act-btn act-view" id="usrCsvBtn" ' + tAttr('Download CSV', 'CSV 내보내기') + '>' + escapeHtml(t('Download CSV', 'CSV 내보내기')) + '</button>'
            + '<button type="button" class="act-btn act-view" id="usrRefreshBtn" ' + tAttr('Refresh', '새로고침') + '>' + escapeHtml(t('Refresh', '새로고침')) + '</button>'
            + '</div>'
            + '<p class="adm-set-intro" ' + tAttr(USR_INTRO.en, USR_INTRO.ko) + '>' + escapeHtml(t(USR_INTRO.en, USR_INTRO.ko)) + '</p>'
            + '<div class="adm-msg" id="usrMsg"></div>'
            + '<table><thead>' + users_theadHtml() + '</thead><tbody id="usrTable"></tbody></table>'
            + '<div class="adm-more"><button type="button" class="act-btn act-add" id="usrMoreBtn" style="display:none;" ' + tAttr('Load more', '더 보기') + '>' + escapeHtml(t('Load more', '더 보기')) + '</button></div>'
            + '</div>';
        el.innerHTML = html;
        document.getElementById('usrIndustry').addEventListener('change', function () { usr_state.industry = this.value; users_draw(); });
        document.getElementById('usrCsvBtn').addEventListener('click', users_exportCsv);
        document.getElementById('usrRefreshBtn').addEventListener('click', function () { users_load(false); });
        document.getElementById('usrMoreBtn').addEventListener('click', function () { users_load(true); });
        // [보기] — onclick 문자열 대신 data-usr-view + 위임 (리스크 4 ①)
        document.getElementById('usrTable').addEventListener('click', function (e) {
            var b = e.target.closest('[data-usr-view]');
            if (b) usr_view(b.getAttribute('data-usr-view'));
        });
    }
    if (usr_state.loaded && !usr_state.loading) users_draw(); else users_load(false);
}

// ── <select> — option 도 data-en/ko 짝 + 현재 언어 텍스트 (view-leads.js 와 같은 방식) ──
function users_selectHtml(id, options, current) {
    var html = '<select id="' + escapeAttr(id) + '">';
    for (var i = 0; i < options.length; i++) {
        var o = options[i];
        html += '<option value="' + escapeAttr(o.key) + '"' + (o.key === current ? ' selected' : '') + ' ' + tAttr(o.en, o.ko) + '>' + escapeHtml(t(o.en, o.ko)) + '</option>';
    }
    return html + '</select>';
}

function users_theadHtml() {
    var html = '<tr>';
    for (var i = 0; i < USR_COLUMNS.length; i++) {
        html += '<th ' + tAttr(USR_COLUMNS[i].en, USR_COLUMNS[i].ko) + '>' + escapeHtml(t(USR_COLUMNS[i].en, USR_COLUMNS[i].ko)) + '</th>';
    }
    return html + '</tr>';
}

// ── 대시보드가 부른다 — 아직 안 읽었으면 한 번만 읽는다(「회원 수」 카드 + 통합 검색 캐시). 화면이 없어도 동작 ──
function users_ensureLoaded() {
    if (usr_state.loaded || usr_state.loading) { users_pushCount(); return; }
    users_load(false);
}

// ── 읽기. more=true 면 마지막 문서 다음부터 200건 더 (startAfter). 단일 orderBy — 복합 색인 불필요 ──
function users_load(more) {
    if (usr_state.loading) return;
    if (typeof db === 'undefined' || typeof auth === 'undefined' || !auth.currentUser) { users_waitAuth(); return; }   // 로그인 전 진입(#members 직접 열기)
    if (!more) { usr_state.items = []; usr_state.lastDoc = null; usr_state.hasMore = false; }
    var q = db.collection('users').orderBy('createdAt', 'desc').limit(USR_PAGE_SIZE);
    if (more && usr_state.lastDoc) q = q.startAfter(usr_state.lastDoc);
    usr_state.loading = true;
    usr_state.error = false;
    users_msg(t('Loading…', '불러오는 중…'), false);
    q.get().then(function (snap) {
        snap.forEach(function (d) { usr_state.items.push(Object.assign({ id: d.id }, d.data())); });
        if (snap.size) usr_state.lastDoc = snap.docs[snap.docs.length - 1];
        usr_state.hasMore = snap.size === USR_PAGE_SIZE;
        usr_state.loading = false;
        usr_state.loaded = true;
        if (typeof admRegisterCache === 'function') admRegisterCache('users', usr_state.items);   // 통합 검색 캐시 (추가 읽기 없음)
        users_pushCount();
        users_draw();
    }).catch(function (err) {
        usr_state.loading = false;
        usr_state.error = true;
        console.error('[users] read failed', err);
        var code = (err && err.code) || (err && err.message) || '';
        users_msg(code === 'permission-denied'
            ? t('Read failed (permission-denied) — check that the users rule (admin read) is published', '읽기 실패(permission-denied) — users 규칙(어드민 read) 게시 여부 확인')
            : t('Read failed: ', '읽기 실패: ') + code, true);
        if (typeof dash_setNum === 'function') dash_setNum('users', '!', t('Read failed: ', '읽기 실패: ') + code);
        users_draw();   // 표는 비우되 오류문은 error 플래그로 유지
    });
}

// 로그인 완료를 한 번만 기다렸다가 다시 읽는다 (view-logs.js 의 logs_waitAuth 와 같은 방식)
function users_waitAuth() {
    if (usr_state.authHooked || typeof auth === 'undefined') return;
    usr_state.authHooked = true;
    users_msg(t('Sign in required', '로그인 필요'), false);
    var un = auth.onAuthStateChanged(function (u) {
        if (!u) return;
        if (typeof un === 'function') un();
        usr_state.authHooked = false;
        users_load(false);
    });
}

// 대시보드 카드 「회원 수」 갱신 (view-dashboard.js dash_setNum). 카드가 없으면 아무것도 안 한다
function users_pushCount() {
    if (typeof dash_setNum === 'function' && usr_state.loaded) dash_setNum('users', usr_countText(), '');
}

// ── 클라이언트 필터: 업종 ──
function users_filtered() {
    var ind = usr_state.industry;
    return usr_state.items.filter(function (it) { return !ind || it.industry === ind; });
}

function users_draw() {
    var tbody = document.getElementById('usrTable');
    if (!tbody) return;
    var list = users_filtered();
    tbody.innerHTML = list.length
        ? users_rowsHtml(list)
        : '<tr><td colspan="' + USR_COLUMNS.length + '" class="adm-muted">' + tSpan('No members', '회원 없음') + '</td></tr>';
    var more = document.getElementById('usrMoreBtn');
    if (more) more.style.display = usr_state.hasMore ? '' : 'none';
    if (!usr_state.loading && !usr_state.error) {   // 오류 상태면 요약문으로 덮지 않는다
        users_msg(t('Showing ' + list.length + ' of ' + usr_state.items.length + ' loaded', '불러온 ' + usr_state.items.length + '명 중 ' + list.length + '명 표시')
            + (usr_state.hasMore ? t(' — more available', ' — 더 있음') : ''), false);
    }
}

function users_msg(text, isErr) {
    var el = document.getElementById('usrMsg');
    if (!el) return;
    el.textContent = text || '';
    el.classList.toggle('err', !!isErr);
}

// ── 행 HTML — 이름·회사만(이메일·전화 없음). 모든 값 escapeHtml/escapeAttr ──
function users_rowsHtml(list) {
    var html = '';
    for (var i = 0; i < list.length; i++) {
        var it = list[i] || {};
        html += '<tr>'
            + '<td><strong>' + escapeHtml(it.displayName || '-') + '</strong>' + (it.jobTitle ? '<small class="adm-log-sub">' + escapeHtml(it.jobTitle) + '</small>' : '') + '</td>'
            + '<td>' + escapeHtml(it.company || '-') + '</td>'
            + '<td>' + usr_industrySpan(it.industry) + '</td>'
            + '<td class="adm-nowrap">' + escapeHtml(fmtDate(it.createdAt) || '-') + '</td>'
            + '<td class="adm-nowrap">' + usr_likes(it, 'likedProducts').length + ' / ' + usr_likes(it, 'likedBrands').length + '</td>'
            + '<td><button type="button" class="act-btn act-view" data-usr-view="' + escapeAttr(it.id) + '" ' + tAttr('View', '보기') + '>' + escapeHtml(t('View', '보기')) + '</button></td>'
            + '</tr>';
    }
    return html;
}

// ── 좋아요 id → 이름 풀기. brands·products 캐시(dashboard.html loadBrands/loadProducts 가 admRegisterCache 로 등록)만 본다 ──
//    캐시에 없으면 id 그대로 + "(삭제됨/비공개)". 캐시 자체가 없으면(별도 페이지 등) 그 안내를 한 줄 넣는다.
function usr_resolveNames(ids, cacheKey, nameOf) {
    var cache = (typeof admGetCache === 'function') ? admGetCache(cacheKey) : null;
    var out = [];
    for (var i = 0; i < ids.length; i++) {
        var id = String(ids[i] || '');
        var hit = null;
        if (cache) for (var j = 0; j < cache.length; j++) if (cache[j].id === id) { hit = cache[j]; break; }
        out.push(hit ? { name: nameOf(hit), sub: '' }
                     : { name: id, sub: cache ? t('(deleted / not public)', '(삭제됨/비공개)') : t('(list not loaded)', '(목록 미로드)') });
    }
    return out;
}
function usr_likesListHtml(ids, cacheKey, nameOf, emptyEn, emptyKo) {
    if (!ids.length) return '<li class="adm-muted">' + tSpan(emptyEn, emptyKo) + '</li>';
    var rows = usr_resolveNames(ids, cacheKey, nameOf);
    var html = '';
    for (var i = 0; i < rows.length; i++) {
        html += '<li>' + escapeHtml(rows[i].name) + (rows[i].sub ? ' <small>' + escapeHtml(rows[i].sub) + '</small>' : '') + '</li>';
    }
    return html;
}

// ── 상세 모달 — 프로필(이메일·전화 포함) + 좋아요한 브랜드/제품 이름. 읽기 전용, 버튼 없음 ──
function usr_view(id) {
    var it = usr_findItem(id);
    if (!it) return;
    var dd = function (en, ko, val) { return '<dt ' + tAttr(en, ko) + '>' + escapeHtml(t(en, ko)) + '</dt><dd>' + escapeHtml(val || '-') + '</dd>'; };
    var likedB = usr_likes(it, 'likedBrands');
    var likedP = usr_likes(it, 'likedProducts');
    var html = '<h2 class="adm-lead-h2">' + escapeHtml(it.displayName || '-') + ' <span class="adm-type">' + usr_industrySpan(it.industry) + '</span></h2>'
        + '<div class="adm-lead-detail">'
        + '<dl class="adm-dl">'
        + dd('Company', '회사', it.company)
        + dd('Job title', '직책', it.jobTitle)
        + dd('Email', '이메일', it.email)
        + dd('Phone', '전화', it.phone)
        + dd('Role', '역할', it.role)
        + dd('Joined', '가입일', fmtDate(it.createdAt))
        + dd('Updated', '수정일', fmtDate(it.updatedAt))
        + dd('UID', 'UID', it.id)
        + '</dl>'
        + '<div class="adm-hist-head" ' + tAttr('Liked brands (' + likedB.length + ')', '좋아요한 브랜드 (' + likedB.length + ')') + '>' + escapeHtml(t('Liked brands (' + likedB.length + ')', '좋아요한 브랜드 (' + likedB.length + ')')) + '</div>'
        + '<ul class="adm-hist">' + usr_likesListHtml(likedB, 'brands', function (b) { return String(b.brandName || b.id); }, 'None', '없음') + '</ul>'
        + '<div class="adm-hist-head" ' + tAttr('Liked products (' + likedP.length + ')', '좋아요한 제품 (' + likedP.length + ')') + '>' + escapeHtml(t('Liked products (' + likedP.length + ')', '좋아요한 제품 (' + likedP.length + ')')) + '</div>'
        + '<ul class="adm-hist">' + usr_likesListHtml(likedP, 'products', function (p) { return String(p.name || p.id) + (p.brandName ? ' — ' + String(p.brandName) : ''); }, 'None', '없음') + '</ul>'
        + '</div>';
    openModal(html);
}

// ── CSV — admin-core.js downloadCSV(rows, filename). 현재 업종 필터 기준. 이메일·전화 포함(어드민 내보내기용 — 뉴스레터 CSV 와 같은 성격) ──
function users_exportCsv() {
    var list = users_filtered();
    if (!list.length) { showToast(t('No members to export', '내보낼 회원이 없습니다'), 'error'); return; }
    var rows = [['Name', 'Company', 'Job title', 'Industry', 'Email', 'Phone', 'Joined', 'Liked products', 'Liked brands', 'UID']];
    for (var i = 0; i < list.length; i++) {
        var it = list[i] || {};
        rows.push([it.displayName || '', it.company || '', it.jobTitle || '', it.industry || '', it.email || '', it.phone || '',
                   fmtDate(it.createdAt), usr_likes(it, 'likedProducts').length, usr_likes(it, 'likedBrands').length, it.id]);
    }
    var today = new Date();
    var p = function (n) { return (n < 10 ? '0' : '') + n; };
    var fname = 'archinode-members-' + today.getFullYear() + p(today.getMonth() + 1) + p(today.getDate()) + '.csv';   // 로컬 날짜 (toISOString 금지)
    downloadCSV(rows, fname);
    showToast(t('CSV downloaded (' + list.length + ' members)', 'CSV 다운로드 완료 (' + list.length + '명)'), 'success');
}
