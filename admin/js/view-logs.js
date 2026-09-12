/* ─────────────────────────────────────────────────────────────────────────
   view-logs.js — 활동 로그 화면 (2026-09-12 어드민 개편 2단계)
   정본: docs/회의/2026-09-12-구현계약서-어드민개편.md 3장 2단계 · 4-1절 · 6장 리스크 2·4·8

   adminLogs 컬렉션(덧붙이기만 되는 장부)을 orderBy('at','desc') 단일 필드로 100건씩 읽는다.
   기간·종류 필터는 클라이언트(복합 색인 없음). 「더 보기」는 startAfter(마지막 문서).
   대시보드 「최근 활동」도 logs_tableHtml() 을 재사용한다(view-dashboard.js).
   ★ 전역 `var`/`function` 만 (const/let 전역 금지 — 리스크 5). 접두어 log_/logs_.
   ★ by·label·note·from·to·page 전부 사용자·Firestore 값 — 출력은 예외 없이 escapeHtml/escapeAttr.
   ───────────────────────────────────────────────────────────────────────── */

var LOG_PAGE_SIZE = 100;

// action → 사람이 읽는 라벨 (계약서 4-1 + 2단계 지시서의 별도 페이지 5개)
var LOG_ACTIONS = {
    'brand.status':        { en: 'Brand status',           ko: '브랜드 상태' },
    'product.status':      { en: 'Product status',         ko: '제품 상태' },
    'article.status':      { en: 'Article status',         ko: '아티클 상태' },
    'review.status':       { en: 'Review issue status',    ko: '검수 상태' },
    'consultation.status': { en: 'Consultation status',    ko: '자문 상태' },
    'trend.status':        { en: 'Trend submission status', ko: '트렌드 투고 상태' },
    'newsletter.status':   { en: 'Newsletter subscriber',  ko: '뉴스레터 구독자' },
    'notify.status':       { en: 'Digital notify subscriber', ko: '디지털 알림 신청자' },
    'settings.save':       { en: 'Settings saved',          ko: '설정 저장' }              // 3단계 view-settings.js
};

// 종류 필터 = action 접두어 ('' = 전체)
var LOG_KINDS = [
    { key: '',             en: 'All types',      ko: '전체 종류' },
    { key: 'brand',        en: 'Brands',         ko: '브랜드' },
    { key: 'product',      en: 'Products',       ko: '제품' },
    { key: 'article',      en: 'Articles',       ko: '아티클' },
    { key: 'review',       en: 'Review board',   ko: '검수관리' },
    { key: 'consultation', en: 'Consultations',  ko: '자문 요청' },
    { key: 'trend',        en: 'Trend submissions', ko: '트렌드 투고' },
    { key: 'newsletter',   en: 'Newsletter',     ko: '뉴스레터' },
    { key: 'notify',       en: 'Digital notify', ko: '디지털 알림' },
    { key: 'settings',     en: 'Settings',       ko: '설정' }
];

// 기간 필터 (로컬 시간 기준 — toISOString 금지)
var LOG_PERIODS = [
    { key: 'all',   en: 'All time',     ko: '전체 기간' },
    { key: 'today', en: 'Today',        ko: '오늘' },
    { key: '7d',    en: 'Last 7 days',  ko: '최근 7일' },
    { key: '30d',   en: 'Last 30 days', ko: '최근 30일' }
];

var LOG_COLUMNS = [
    { en: 'Time',   ko: '시간' },
    { en: 'Who',    ko: '누가' },
    { en: 'What',   ko: '무엇을' },
    { en: 'Target', ko: '대상' },
    { en: 'From → To', ko: '어디서 → 어디로' },
    { en: 'Note',   ko: '메모' },
    { en: 'Page',   ko: '화면' }
];

var log_state = { items: [], lastDoc: null, hasMore: false, loading: false, error: false, period: 'all', kind: '', authHooked: false };   // error: 읽기 실패 안내를 logs_draw 요약문이 덮지 않게 (블랙 d1b18fc 지적)

// ── 화면 그리기. el = #tab-logs. 뼈대는 한 번만, 이후 호출은 다시 읽기만 ──
function logs_render(el) {
    el = el || document.getElementById('tab-logs');
    if (!el) return;
    if (!document.getElementById('logTable')) {
        var html = '<div class="section-card adm-logs">'
            + '<div class="adm-toolbar">'
            + logs_selectHtml('logPeriod', LOG_PERIODS, log_state.period)
            + logs_selectHtml('logKind', LOG_KINDS, log_state.kind)
            + '<div class="adm-spacer"></div>'
            + '<button type="button" class="act-btn act-view" id="logRefreshBtn" ' + tAttr('Refresh', '새로고침') + '>' + escapeHtml(t('Refresh', '새로고침')) + '</button>'
            + '</div>'
            + '<div class="adm-msg" id="logMsg"></div>'
            + '<table><thead>' + logs_theadHtml() + '</thead><tbody id="logTable"></tbody></table>'
            + '<div class="adm-more"><button type="button" class="act-btn act-add" id="logMoreBtn" style="display:none;" ' + tAttr('Load more', '더 보기') + '>' + escapeHtml(t('Load more', '더 보기')) + '</button></div>'
            + '</div>';
        el.innerHTML = html;
        document.getElementById('logPeriod').addEventListener('change', function () { log_state.period = this.value; logs_draw(); });
        document.getElementById('logKind').addEventListener('change', function () { log_state.kind = this.value; logs_draw(); });
        document.getElementById('logRefreshBtn').addEventListener('click', function () { logs_load(false); });
        document.getElementById('logMoreBtn').addEventListener('click', function () { logs_load(true); });
    }
    logs_load(false);
}

// ── <select> — option 도 data-en/ko 짝 + 현재 언어 텍스트 (lang.js 가 동적 요소를 안 훑는다) ──
function logs_selectHtml(id, options, current) {
    var html = '<select id="' + escapeAttr(id) + '">';
    for (var i = 0; i < options.length; i++) {
        var o = options[i];
        html += '<option value="' + escapeAttr(o.key) + '"' + (o.key === current ? ' selected' : '') + ' ' + tAttr(o.en, o.ko) + '>' + escapeHtml(t(o.en, o.ko)) + '</option>';
    }
    return html + '</select>';
}

function logs_theadHtml() {
    var html = '<tr>';
    for (var i = 0; i < LOG_COLUMNS.length; i++) {
        html += '<th ' + tAttr(LOG_COLUMNS[i].en, LOG_COLUMNS[i].ko) + '>' + escapeHtml(t(LOG_COLUMNS[i].en, LOG_COLUMNS[i].ko)) + '</th>';
    }
    return html + '</tr>';
}

// ── 읽기. more=true 면 마지막 문서 다음부터 100건 더 (startAfter) ──
function logs_load(more) {
    if (log_state.loading) return;
    if (typeof db === 'undefined' || typeof auth === 'undefined' || !auth.currentUser) { logs_waitAuth(); return; }   // 로그인 전 진입(#logs 직접 열기)
    if (!more) { log_state.items = []; log_state.lastDoc = null; log_state.hasMore = false; }
    var q = db.collection('adminLogs').orderBy('at', 'desc').limit(LOG_PAGE_SIZE);   // 단일 필드 — 복합 색인 불필요
    if (more && log_state.lastDoc) q = q.startAfter(log_state.lastDoc);
    log_state.loading = true;
    log_state.error = false;
    logs_msg(t('Loading…', '불러오는 중…'), false);
    q.get().then(function (snap) {
        snap.forEach(function (d) { log_state.items.push(Object.assign({ id: d.id }, d.data())); });
        if (snap.size) log_state.lastDoc = snap.docs[snap.docs.length - 1];
        log_state.hasMore = snap.size === LOG_PAGE_SIZE;
        log_state.loading = false;
        logs_draw();
    }).catch(function (err) {
        log_state.loading = false;
        log_state.error = true;
        console.error('[adminLogs] read failed', err);
        var code = (err && err.code) || (err && err.message) || '';
        logs_msg(code === 'permission-denied'
            ? t('Read failed (permission-denied) — check that the adminLogs rule is published', '읽기 실패(permission-denied) — adminLogs 규칙 게시 여부 확인')
            : t('Read failed: ', '읽기 실패: ') + code, true);
        logs_draw();   // 표는 비우되(활동 없음) 오류문은 error 플래그로 유지
    });
}

// 로그인 완료를 한 번만 기다렸다가 다시 읽는다 (onAuthStateChanged 는 비동기로 부른다)
function logs_waitAuth() {
    if (log_state.authHooked || typeof auth === 'undefined') return;
    log_state.authHooked = true;
    logs_msg(t('Sign in required', '로그인 필요'), false);
    var un = auth.onAuthStateChanged(function (u) {
        if (!u) return;
        if (typeof un === 'function') un();
        log_state.authHooked = false;
        logs_load(false);
    });
}

// ── 클라이언트 필터: 기간(로컬) + 종류(action 접두어) ──
function logs_filtered() {
    var since = 0;
    var now = new Date();
    if (log_state.period === 'today') since = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    else if (log_state.period === '7d') since = now.getTime() - 7 * 86400000;
    else if (log_state.period === '30d') since = now.getTime() - 30 * 86400000;
    var kind = log_state.kind;
    return log_state.items.filter(function (it) {
        if (since) {
            var d = (it.at && typeof it.at.toDate === 'function') ? it.at.toDate() : null;
            if (!d || d.getTime() < since) return false;
        }
        if (kind && String(it.action || '').indexOf(kind + '.') !== 0) return false;
        return true;
    });
}

function logs_draw() {
    var tbody = document.getElementById('logTable');
    if (!tbody) return;
    var list = logs_filtered();
    tbody.innerHTML = list.length
        ? logs_rowsHtml(list)
        : '<tr><td colspan="' + LOG_COLUMNS.length + '" class="adm-muted">' + tSpan('No activity', '활동 없음') + '</td></tr>';
    var more = document.getElementById('logMoreBtn');
    if (more) more.style.display = log_state.hasMore ? '' : 'none';
    if (!log_state.loading && !log_state.error) {   // 오류 상태면 요약문으로 덮지 않는다
        logs_msg(t('Showing ' + list.length + ' of ' + log_state.items.length + ' loaded', '불러온 ' + log_state.items.length + '건 중 ' + list.length + '건 표시')
            + (log_state.hasMore ? t(' — more available', ' — 더 있음') : ''), false);
    }
}

function logs_msg(text, isErr) {
    var el = document.getElementById('logMsg');
    if (!el) return;
    el.textContent = text || '';
    el.classList.toggle('err', !!isErr);
}

// ── 행 HTML — 대시보드 「최근 활동」과 공유. 모든 값 escapeHtml ──
function logs_rowsHtml(list) {
    var html = '';
    for (var i = 0; i < list.length; i++) {
        var it = list[i] || {};
        var tg = it.target || {};
        var ref = String(tg.col || '') + '/' + String(tg.id || '');
        html += '<tr>'
            + '<td class="adm-nowrap">' + escapeHtml(fmtDate(it.at)) + '</td>'
            + '<td>' + escapeHtml(it.by || '') + '</td>'
            + '<td>' + logs_actionLabel(it.action) + '</td>'
            + '<td>' + escapeHtml(tg.label || '-') + '<small class="adm-log-sub">' + escapeHtml(ref) + '</small></td>'
            + '<td class="adm-nowrap">' + escapeHtml(it.from || '') + ' <span class="adm-log-arrow">→</span> ' + escapeHtml(it.to || '') + '</td>'
            + '<td class="adm-log-note">' + escapeHtml(it.note || '') + '</td>'
            + '<td>' + escapeHtml(it.page || '') + '</td>'
            + '</tr>';
    }
    return html;
}

function logs_actionLabel(action) {
    var meta = LOG_ACTIONS[action];
    return meta ? tSpan(meta.en, meta.ko) : escapeHtml(action || '');   // 모르는 action 은 원문 그대로(이스케이프)
}

// ── 표 전체 HTML (thead + tbody). 대시보드가 재사용 ──
function logs_tableHtml(list) {
    return '<table class="adm-log-table"><thead>' + logs_theadHtml() + '</thead><tbody>'
        + (list && list.length ? logs_rowsHtml(list)
            : '<tr><td colspan="' + LOG_COLUMNS.length + '" class="adm-muted">' + tSpan('No activity yet', '아직 활동 없음') + '</td></tr>')
        + '</tbody></table>';
}
