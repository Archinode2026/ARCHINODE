/* ─────────────────────────────────────────────────────────────────────────
   view-notices.js — 운영 > 공지사항 (2026-09-12 어드민 개편 5단계)
   정본: docs/회의/2026-09-12-구현계약서-어드민개편.md 3장 5단계 · 4-4절 · 5장 · 6장 리스크 1·4·8·11
   지시서: docs/회의/2026-09-12-작업지시-어드민개편-5단계-공지-문의.md

   notices 컬렉션을 orderBy('createdAt','desc') 단일 필드로 200건 읽고, 표시 순서(고정 → order → 최신)는 클라이언트 정렬.
   등록/수정 모달(제목·본문 EN/KO · 대상 brand/site/all · 정렬 · 노출 · 고정) + 목록의 노출 on/off 토글.
   저장 → createdAt/By·updatedAt/By + logAdmin('notice.save'). 삭제 없음(노출 off 로 숨긴다 — 확인창을 쓰지 않기 위해).
   목록을 읽으면 admRegisterCache('notices') 로 통합 검색 캐시에 올린다(검수대장 A-041). 노출 토글은 update 뒤 목록을 다시 읽어 서버 값으로 그린다(A-042).
   ★ 본문은 줄바꿈만, HTML 아님 — 미리보기는 escapeHtml + <br> 만(ntc_bodyHtml). 브랜드 포털 배너도 같은 방식.
   ★ 이미지 첨부 없음(단번 notices 축약). 사이트 공개 노출(비로그인)은 복귀 후 — 여기서는 audience 값만 저장한다.
   ★ 전역 `var`/`function` 만 (const/let 전역 금지 — 리스크 5). 접두어 ntc_/notices_.
   ★ 제목·본문은 어드민 입력이지만 출력은 예외 없이 escapeHtml/escapeAttr(리스크 4). onclick 문자열 대신 data-* + 위임.
   ★ 확인창(confirm/prompt/alert) 없음. 실패는 숨기지 않는다(토스트·폼 안 문구·permission-denied 안내).
   ───────────────────────────────────────────────────────────────────────── */

var NTC_PAGE_SIZE = 200;

// 대상 3종 (계약서 4-4). 포털은 brand·all 만 보여준다. site 는 복귀 후 사이트 공지에서 쓴다
var NTC_AUDIENCES = [
    { key: 'brand', en: 'Brands (portal)',       ko: '브랜드(포털)',      cls: 'adm-type-brand' },
    { key: 'site',  en: 'Site (public — later)', ko: '사이트(공개 — 추후)', cls: 'adm-type-quote' },
    { key: 'all',   en: 'All',                   ko: '전체',              cls: 'adm-type-dealer' }
];
var NTC_COLUMNS = [
    { en: 'Pinned',   ko: '고정' },
    { en: 'Visible',  ko: '노출' },
    { en: 'Audience', ko: '대상' },
    { en: 'Title',    ko: '제목' },
    { en: 'Order',    ko: '정렬' },
    { en: 'Updated',  ko: '수정' },
    { en: '',         ko: '' }
];

var ntc_state = { items: [], loading: false, loaded: false, error: false, saving: false, authHooked: false };

// ── 메타·조회 ──
function ntc_audienceMeta(key) { for (var i = 0; i < NTC_AUDIENCES.length; i++) if (NTC_AUDIENCES[i].key === key) return NTC_AUDIENCES[i]; return null; }
function ntc_findItem(id) { for (var i = 0; i < ntc_state.items.length; i++) if (ntc_state.items[i].id === id) return ntc_state.items[i]; return null; }
function ntc_title(it) { return String(it.title_en || it.title_ko || '') ; }   // 활동 로그 target.label · 목록 부제
function ntc_audienceBadge(key) {
    var m = ntc_audienceMeta(key);
    return m ? '<span class="adm-type ' + m.cls + '" ' + tAttr(m.en, m.ko) + '>' + escapeHtml(t(m.en, m.ko)) + '</span>'
             : '<span class="adm-type">' + escapeHtml(key || '-') + '</span>';
}
function ntc_visibleBadge(visible) {
    return visible ? '<span class="status status-approved" ' + tAttr('Visible', '노출') + '>' + escapeHtml(t('Visible', '노출')) + '</span>'
                   : '<span class="status status-closed" ' + tAttr('Hidden', '숨김') + '>' + escapeHtml(t('Hidden', '숨김')) + '</span>';
}
// 본문 → HTML: escapeHtml 뒤 줄바꿈만 <br>. 그 밖의 HTML 은 절대 해석하지 않는다(계약서 4-4)
function ntc_bodyHtml(text) { return escapeHtml(text).replace(/\r?\n/g, '<br>'); }
function ntc_millis(ts) { if (!ts) return 0; var d = (typeof ts.toDate === 'function') ? ts.toDate() : new Date(ts); var m = d.getTime(); return isNaN(m) ? 0 : m; }

// ── 화면 그리기. el = #tab-notices. 뼈대는 한 번만, 이후 호출은 다시 읽기만 ──
function notices_render(el) {
    el = el || document.getElementById('tab-notices');
    if (!el) return;
    if (!document.getElementById('ntcTable')) {
        var html = '<div class="section-card adm-notices">'
            + '<div class="adm-toolbar">'
            + '<p class="adm-set-intro" style="margin:0;" ' + tAttr('Notices for the Brand Portal banner (audience Brands / All). Body is plain text — line breaks only, no HTML. Public site notices come later.',
                                                                       '브랜드 포털 배너 공지(대상 브랜드 / 전체). 본문은 줄바꿈만 있는 평문 — HTML 없음. 사이트 공개 공지는 복귀 후.')
            + '>' + escapeHtml(t('Notices for the Brand Portal banner (audience Brands / All). Body is plain text — line breaks only, no HTML. Public site notices come later.',
                                 '브랜드 포털 배너 공지(대상 브랜드 / 전체). 본문은 줄바꿈만 있는 평문 — HTML 없음. 사이트 공개 공지는 복귀 후.')) + '</p>'
            + '<div class="adm-spacer"></div>'
            + '<button type="button" class="act-btn act-add" id="ntcNewBtn" ' + tAttr('+ New notice', '+ 공지 등록') + '>' + escapeHtml(t('+ New notice', '+ 공지 등록')) + '</button>'
            + '<button type="button" class="act-btn act-view" id="ntcRefreshBtn" ' + tAttr('Refresh', '새로고침') + '>' + escapeHtml(t('Refresh', '새로고침')) + '</button>'
            + '</div>'
            + '<div class="adm-msg" id="ntcMsg"></div>'
            + '<table><thead>' + notices_theadHtml() + '</thead><tbody id="ntcTable"></tbody></table>'
            + '</div>';
        el.innerHTML = html;
        document.getElementById('ntcNewBtn').addEventListener('click', function () { ntc_openForm(''); });
        document.getElementById('ntcRefreshBtn').addEventListener('click', function () { notices_load(); });
        // [수정]·[노출 토글]·[미리보기] — onclick 문자열 대신 data-* + 위임 (리스크 4 ①)
        document.getElementById('ntcTable').addEventListener('click', function (e) {
            var b = e.target.closest('[data-ntc-edit], [data-ntc-toggle], [data-ntc-preview]');
            if (!b) return;
            if (b.hasAttribute('data-ntc-edit')) ntc_openForm(b.getAttribute('data-ntc-edit'));
            else if (b.hasAttribute('data-ntc-toggle')) ntc_toggleVisible(b.getAttribute('data-ntc-toggle'));
            else ntc_preview(b.getAttribute('data-ntc-preview'));
        });
    }
    notices_load();
}

function notices_theadHtml() {
    var html = '<tr>';
    for (var i = 0; i < NTC_COLUMNS.length; i++) {
        html += '<th ' + tAttr(NTC_COLUMNS[i].en, NTC_COLUMNS[i].ko) + '>' + escapeHtml(t(NTC_COLUMNS[i].en, NTC_COLUMNS[i].ko)) + '</th>';
    }
    return html + '</tr>';
}

// ── 읽기 — orderBy('createdAt','desc') 단일 필드 200건. 표시 순서는 클라이언트(고정 → order 오름차순 → 최신) ──
function notices_load() {
    if (ntc_state.loading) return;
    if (typeof db === 'undefined' || typeof auth === 'undefined' || !auth.currentUser) { notices_waitAuth(); return; }   // 로그인 전 진입(#notices 직접 열기)
    ntc_state.loading = true;
    ntc_state.error = false;
    notices_msg(t('Loading…', '불러오는 중…'), false);
    db.collection('notices').orderBy('createdAt', 'desc').limit(NTC_PAGE_SIZE).get().then(function (snap) {
        var items = [];
        snap.forEach(function (d) { items.push(Object.assign({ id: d.id }, d.data())); });
        ntc_state.items = notices_sorted(items);
        if (typeof admRegisterCache === 'function') admRegisterCache('notices', ntc_state.items);   // 6단계 통합 검색 캐시(추가 읽기 없음 — 검수대장 A-041)
        ntc_state.loading = false;
        ntc_state.loaded = true;
        notices_draw();
    }).catch(function (err) {
        ntc_state.loading = false;
        ntc_state.error = true;
        console.error('[notices] read failed', err);
        var code = (err && err.code) || (err && err.message) || '';
        notices_msg(code === 'permission-denied'
            ? t('Read failed (permission-denied) — check that the notices rule is published', '읽기 실패(permission-denied) — notices 규칙 게시 여부 확인')
            : t('Read failed: ', '읽기 실패: ') + code, true);
        notices_draw();
    });
}
function notices_sorted(items) {
    return items.slice().sort(function (a, b) {
        if (!!a.pinned !== !!b.pinned) return a.pinned ? -1 : 1;
        var ao = Number(a.order) || 0, bo = Number(b.order) || 0;
        if (ao !== bo) return ao - bo;
        return ntc_millis(b.createdAt) - ntc_millis(a.createdAt);
    });
}

// 로그인 완료를 한 번만 기다렸다가 다시 읽는다 (view-leads.js 의 leads_waitAuth 와 같은 방식)
function notices_waitAuth() {
    if (ntc_state.authHooked || typeof auth === 'undefined') return;
    ntc_state.authHooked = true;
    notices_msg(t('Sign in required', '로그인 필요'), false);
    var un = auth.onAuthStateChanged(function (u) {
        if (!u) return;
        if (typeof un === 'function') un();
        ntc_state.authHooked = false;
        notices_load();
    });
}

function notices_draw() {
    var tbody = document.getElementById('ntcTable');
    if (!tbody) return;
    var list = ntc_state.items;
    tbody.innerHTML = list.length ? notices_rowsHtml(list)
        : '<tr><td colspan="' + NTC_COLUMNS.length + '" class="adm-muted">' + tSpan('No notices yet', '공지 없음') + '</td></tr>';
    if (!ntc_state.loading && !ntc_state.error) {
        var visible = 0;
        for (var i = 0; i < list.length; i++) if (list[i].visible) visible++;
        notices_msg(t(list.length + ' notices · ' + visible + ' visible', list.length + '건 · 노출 ' + visible + '건'), false);
    }
}
function notices_msg(text, isErr) {
    var el = document.getElementById('ntcMsg');
    if (!el) return;
    el.textContent = text || '';
    el.classList.toggle('err', !!isErr);
}

// ── 행 HTML — 제목·본문 전부 escapeHtml/escapeAttr ──
function notices_rowsHtml(list) {
    var html = '';
    for (var i = 0; i < list.length; i++) {
        var it = list[i] || {};
        var titleCur = String(t(it.title_en || it.title_ko, it.title_ko || it.title_en) || '');
        var titleOther = String(t(it.title_ko, it.title_en) || '');
        html += '<tr>'
            + '<td class="adm-nowrap">' + (it.pinned ? '<i class="fas fa-thumbtack" style="color:#C8A96E;" title="' + escapeAttr(t('Pinned', '고정')) + '"></i>' : '') + '</td>'
            + '<td>' + ntc_visibleBadge(!!it.visible) + '</td>'
            + '<td>' + ntc_audienceBadge(it.audience) + '</td>'
            + '<td>' + escapeHtml(titleCur || '-') + (titleOther && titleOther !== titleCur ? '<small class="adm-log-sub">' + escapeHtml(titleOther) + '</small>' : '') + '</td>'
            + '<td class="adm-nowrap">' + escapeHtml(String(Number(it.order) || 0)) + '</td>'
            + '<td class="adm-nowrap">' + escapeHtml(fmtDate(it.updatedAt || it.createdAt)) + (it.updatedBy ? '<small class="adm-log-sub">' + escapeHtml(it.updatedBy) + '</small>' : '') + '</td>'
            + '<td class="adm-nowrap">'
            +   '<button type="button" class="act-btn act-view" data-ntc-preview="' + escapeAttr(it.id) + '" ' + tAttr('Preview', '미리보기') + '>' + escapeHtml(t('Preview', '미리보기')) + '</button> '
            +   '<button type="button" class="act-btn act-add" data-ntc-edit="' + escapeAttr(it.id) + '" ' + tAttr('Edit', '수정') + '>' + escapeHtml(t('Edit', '수정')) + '</button> '
            +   (it.visible
                    ? '<button type="button" class="act-btn act-suspend" data-ntc-toggle="' + escapeAttr(it.id) + '" ' + tAttr('Hide', '숨기기') + '>' + escapeHtml(t('Hide', '숨기기')) + '</button>'
                    : '<button type="button" class="act-btn act-approve" data-ntc-toggle="' + escapeAttr(it.id) + '" ' + tAttr('Show', '노출') + '>' + escapeHtml(t('Show', '노출')) + '</button>')
            + '</td>'
            + '</tr>';
    }
    return html;
}

// ── 입력값 읽기 ──
function ntc_val(id) { var el = document.getElementById(id); return el ? String(el.value || '').trim() : ''; }
function ntc_checked(id) { var el = document.getElementById(id); return !!(el && el.checked); }
function ntc_showErr(text) { var el = document.getElementById('nfErr'); if (!el) return; el.textContent = text || ''; el.style.display = text ? 'block' : 'none'; }

// ── 미리보기 모달 — 포털 배너와 같은 렌더(escapeHtml + <br>) ──
function ntc_preview(id) {
    var it = ntc_findItem(id);
    if (!it) return;
    var html = '<h2 ' + tAttr('Preview', '미리보기') + '>' + escapeHtml(t('Preview', '미리보기')) + '</h2>'
        + '<p class="adm-set-intro">' + ntc_audienceBadge(it.audience) + ' ' + ntc_visibleBadge(!!it.visible) + (it.pinned ? ' <i class="fas fa-thumbtack" style="color:#C8A96E;"></i>' : '') + '</p>'
        + '<dl class="adm-dl">'
        + '<dt>EN</dt><dd><strong>' + escapeHtml(it.title_en || '-') + '</strong><br>' + ntc_bodyHtml(it.body_en || '') + '</dd>'
        + '<dt>KO</dt><dd><strong>' + escapeHtml(it.title_ko || '-') + '</strong><br>' + ntc_bodyHtml(it.body_ko || '') + '</dd>'
        + '</dl>'
        + '<div class="adm-form-actions"><button type="button" class="act-btn adm-btn-cancel" id="ntcPvClose" ' + tAttr('Close', '닫기') + '>' + escapeHtml(t('Close', '닫기')) + '</button></div>';
    openModal(html);
    document.getElementById('ntcPvClose').addEventListener('click', closeModal);
}

// ── 등록/수정 모달 (admin-core.js openModal 재사용). id 가 비면 새 공지 ──
//    value 는 escapeAttr, textarea 본문은 escapeHtml 로 찍는다(사용자 값 — 리스크 4)
function ntc_openForm(id) {
    var it = id ? ntc_findItem(id) : null;
    if (id && !it) return;
    it = it || { title_en: '', title_ko: '', body_en: '', body_ko: '', audience: 'brand', visible: false, pinned: false, order: 0 };
    var audOpts = '';
    for (var i = 0; i < NTC_AUDIENCES.length; i++) {
        var a = NTC_AUDIENCES[i];
        audOpts += '<option value="' + escapeAttr(a.key) + '"' + (a.key === it.audience ? ' selected' : '') + ' ' + tAttr(a.en, a.ko) + '>' + escapeHtml(t(a.en, a.ko)) + '</option>';
    }
    var label = function (forId, en, ko) { return '<label for="' + forId + '" ' + tAttr(en, ko) + '>' + escapeHtml(t(en, ko)) + '</label>'; };
    var html = '<h2 ' + tAttr(id ? 'Edit notice' : 'New notice', id ? '공지 수정' : '공지 등록') + '>' + escapeHtml(t(id ? 'Edit notice' : 'New notice', id ? '공지 수정' : '공지 등록')) + '</h2>'
        + '<p class="adm-set-intro">' + escapeHtml(t('Both languages are required (site rule: bilingual). Body is plain text — line breaks are kept, HTML is shown as text.',
                                                    '두 언어 모두 필수(규정: 이중 언어). 본문은 평문 — 줄바꿈은 유지되고 HTML 은 글자로 보입니다.')) + '</p>'
        + '<div class="adm-form">'
        + '<div class="adm-grid2">'
        +   '<div>' + label('nf_title_en', 'Title (EN) *', '제목 (EN) *') + '<input type="text" id="nf_title_en" maxlength="200" value="' + escapeAttr(it.title_en || '') + '"></div>'
        +   '<div>' + label('nf_title_ko', 'Title (KO) *', '제목 (KO) *') + '<input type="text" id="nf_title_ko" maxlength="200" value="' + escapeAttr(it.title_ko || '') + '"></div>'
        + '</div>'
        + label('nf_body_en', 'Body (EN) *', '본문 (EN) *') + '<textarea id="nf_body_en" rows="5" maxlength="5000">' + escapeHtml(it.body_en || '') + '</textarea>'
        + label('nf_body_ko', 'Body (KO) *', '본문 (KO) *') + '<textarea id="nf_body_ko" rows="5" maxlength="5000">' + escapeHtml(it.body_ko || '') + '</textarea>'
        + '<div class="adm-grid2">'
        +   '<div>' + label('nf_audience', 'Audience', '대상') + '<select id="nf_audience">' + audOpts + '</select></div>'
        +   '<div>' + label('nf_order', 'Order (lower first)', '정렬 (작은 수 먼저)') + '<input type="number" id="nf_order" step="1" value="' + escapeAttr(String(Number(it.order) || 0)) + '"></div>'
        + '</div>'
        + '<div class="adm-bar" style="border-top:none;">'
        +   '<label style="min-width:0;text-transform:none;"><input type="checkbox" id="nf_visible"' + (it.visible ? ' checked' : '') + '> ' + tSpan('Visible', '노출') + '</label>'
        +   '<label style="min-width:0;text-transform:none;"><input type="checkbox" id="nf_pinned"' + (it.pinned ? ' checked' : '') + '> ' + tSpan('Pinned (shown first)', '고정 (맨 위)') + '</label>'
        + '</div>'
        + '<div class="adm-err" id="nfErr"></div>'
        + '<div class="adm-form-actions">'
        +   '<button type="button" class="act-btn adm-btn-cancel" id="nfCancelBtn" ' + tAttr('Cancel', '취소') + '>' + escapeHtml(t('Cancel', '취소')) + '</button>'
        +   '<button type="button" class="act-btn act-add" id="nfSaveBtn" ' + tAttr('Save', '저장') + '>' + escapeHtml(t('Save', '저장')) + '</button>'
        + '</div>'
        + '</div>';
    openModal(html);
    document.getElementById('nfCancelBtn').addEventListener('click', closeModal);
    document.getElementById('nfSaveBtn').addEventListener('click', function () { ntc_save(id); });
    document.getElementById('nf_title_en').focus();
}

// ── 저장 — 새 문서 add(createdAt/By + updatedAt/By) 또는 update(updatedAt/By). 성공 시 logAdmin('notice.save') ──
function ntc_save(id) {
    if (ntc_state.saving) return;
    if (typeof db === 'undefined' || typeof auth === 'undefined' || !auth.currentUser) { showToast(t('Sign in required', '로그인 필요'), 'error'); return; }
    var data = {
        title_en: ntc_val('nf_title_en'), title_ko: ntc_val('nf_title_ko'),
        body_en: ntc_val('nf_body_en'),   body_ko: ntc_val('nf_body_ko'),
        audience: ntc_val('nf_audience'),
        visible: ntc_checked('nf_visible'), pinned: ntc_checked('nf_pinned'),
        order: parseInt(ntc_val('nf_order'), 10) || 0
    };
    var problems = [];
    if (!data.title_en || !data.title_ko) problems.push(t('Both titles are required.', '제목 두 언어 모두 입력하세요.'));
    if (!data.body_en || !data.body_ko) problems.push(t('Both bodies are required.', '본문 두 언어 모두 입력하세요.'));
    if (!ntc_audienceMeta(data.audience)) problems.push(t('Choose an audience.', '대상을 고르세요.'));
    if (problems.length) { ntc_showErr(problems.join('\n')); return; }
    ntc_showErr('');
    var by = auth.currentUser.email || '';
    var prev = id ? ntc_findItem(id) : null;
    var payload = Object.assign({}, data, { updatedAt: firebase.firestore.FieldValue.serverTimestamp(), updatedBy: by });
    if (!id) { payload.createdAt = firebase.firestore.FieldValue.serverTimestamp(); payload.createdBy = by; }
    var btn = document.getElementById('nfSaveBtn');
    ntc_state.saving = true;
    if (btn) btn.disabled = true;
    var p = id ? db.collection('notices').doc(id).update(payload).then(function () { return id; })
               : db.collection('notices').add(payload).then(function (ref) { return ref.id; });
    p.then(function (docId) {
        ntc_state.saving = false;
        logAdmin({ action: 'notice.save', target: { col: 'notices', id: docId, label: ntc_title(data) },
                   from: prev ? (prev.visible ? 'visible' : 'hidden') : '', to: data.visible ? 'visible' : 'hidden',
                   note: (id ? 'updated' : 'created') + ' · ' + data.audience + (data.pinned ? ' · pinned' : '') });
        showToast(t(id ? 'Notice updated' : 'Notice created', id ? '공지를 수정했습니다' : '공지를 등록했습니다'), 'success');
        closeModal();
        notices_load();
    }).catch(function (err) {
        ntc_state.saving = false;
        if (btn) btn.disabled = false;
        console.error('[notices] save failed', err);
        var code = (err && err.code) || (err && err.message) || '';
        ntc_showErr(code === 'permission-denied'
            ? t('Save failed (permission-denied) — check that the notices rule is published', '저장 실패(permission-denied) — notices 규칙 게시 여부 확인')
            : t('Save failed: ', '저장 실패: ') + code);
    });
}

// ── 목록의 노출 on/off — visible 만 뒤집는다 + updatedAt/By + logAdmin('notice.save'). 확인창 없음(되돌리기는 한 번 더 누르면 된다) ──
//    검수대장 A-042(브론즈 R11 "숨기기를 눌러도 상태 불변") — 코드검토·vm 주입 실측으로는 재현되지 않았다(update 페이로드·재렌더 정상).
//    브라우저에서 무엇이 달랐든 화면이 서버 값과 어긋나지 않게 고친다: ① 저장 중이면 조용히 무시하지 않고 토스트 ② 누른 버튼을 잠근다
//    ③ 성공하면 «지금 목록»의 항목을 id 로 찾아 즉시 다시 그린다(쓰는 사이 목록이 다시 읽혔어도 오래된 참조를 고치지 않는다)
//    ④ 토스트·활동 로그는 다시 그린 뒤에(둘 중 하나가 죽어도 화면은 바뀐다) ⑤ ntc_save 와 같게 notices_load() 로 서버 값을 한 번 더 읽는다.
function ntc_toggleVisible(id) {
    var it = ntc_findItem(id);
    if (!it) return;
    if (ntc_state.saving) { showToast(t('Still saving — try again in a moment', '저장 중입니다 — 잠시 뒤 다시 누르세요'), 'error'); return; }
    if (typeof db === 'undefined' || typeof auth === 'undefined' || !auth.currentUser) { showToast(t('Sign in required', '로그인 필요'), 'error'); return; }
    var prevVisible = !!it.visible;
    var next = !prevVisible;
    var by = auth.currentUser.email || '';
    var label = ntc_title(it);
    var btn = ntc_toggleBtn(id);
    ntc_state.saving = true;
    if (btn) btn.disabled = true;
    db.collection('notices').doc(id).update({
        visible: next,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
        updatedBy: by
    }).then(function () {
        ntc_state.saving = false;
        var cur = ntc_findItem(id) || it;
        cur.visible = next; cur.updatedAt = new Date(); cur.updatedBy = by;   // 로컬 반영 → 즉시 다시 그린다
        notices_draw();
        showToast(t(next ? 'Notice is now visible' : 'Notice hidden', next ? '공지를 노출했습니다' : '공지를 숨겼습니다'), 'success');
        logAdmin({ action: 'notice.save', target: { col: 'notices', id: id, label: label }, from: prevVisible ? 'visible' : 'hidden', to: next ? 'visible' : 'hidden', note: 'toggle' });
        notices_load();   // 서버 값으로 한 번 더 (ntc_save 와 같은 마무리)
    }).catch(function (err) {
        ntc_state.saving = false;
        if (btn) btn.disabled = false;
        console.error('[notices] toggle failed', err);
        var code = (err && err.code) || (err && err.message) || '';
        showToast(code === 'permission-denied'
            ? t('Update failed (permission-denied) — check that the notices rule is published', '변경 실패(permission-denied) — notices 규칙 게시 여부 확인')
            : t('Update failed: ', '변경 실패: ') + code, 'error');
    });
}
// 목록의 노출 토글 버튼(id 로). 선택자 문자열에 id 를 끼워 넣지 않고 속성값을 비교한다
function ntc_toggleBtn(id) {
    var tb = document.getElementById('ntcTable');
    var bs = tb ? tb.querySelectorAll('[data-ntc-toggle]') : [];
    for (var i = 0; i < bs.length; i++) if (bs[i].getAttribute('data-ntc-toggle') === id) return bs[i];
    return null;
}
