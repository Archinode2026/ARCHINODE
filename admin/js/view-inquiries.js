/* ─────────────────────────────────────────────────────────────────────────
   view-inquiries.js — 고객 > 1:1 문의 (2026-09-12 어드민 개편 5단계)
   정본: docs/회의/2026-09-12-구현계약서-어드민개편.md 3장 5단계 · 4-5절 · 5장 · 6장 리스크 1·4·8·11
   지시서: docs/회의/2026-09-12-작업지시-어드민개편-5단계-공지-문의.md

   inquiries 컬렉션을 orderBy('createdAt','desc') 단일 필드로 200건씩 읽는다(「더 보기」 startAfter).
   표시 순서(open 먼저 · 최신)와 상태 필터는 클라이언트(복합 색인 없음 — 리스크 8).
   상태 2종 open/answered(단번 INQUIRY_STATUS 그대로). 브랜드 포털 Support 탭이 create, 여기서는 답변만(update).
   상세 모달 — 보낸 사람(브랜드명/이메일)·제목·본문·답변 textarea·[답변 저장]
     → update({status:'answered', answer, answeredAt, answeredBy, updatedAt, history: arrayUnion})
     + mail 1통(보낸 사람 이메일, "Re: <subject> — ARCHINODE", 답변 + 포털 링크 — list-your-brand.html 의 mail.add 패턴)
     + logAdmin('inquiry.answer').
   로그인 시 1회 선로드 — view-dashboard.js 가 inq_ensureLoaded() 를 부른다(view-users.js users_ensureLoaded 와 같은 방식, 브론즈 R12 A-041).
     그 한 번의 목록 읽기에서 통합 검색 캐시(admRegisterCache('inquiries')) + 열린 건수(사이드바 배지 + 대시보드 카드 「열린 문의」) 둘 다 채운다.
     열린 건수는 읽은 목록에서 센다(inq_pushOpenCount) — 200건이 꽉 차 안 읽은 문서가 남았을 때만 where('status','==','open') 한 번(inq_loadOpenCount).
   ★ 전역 `var`/`function` 만 (const/let 전역 금지 — 리스크 5). 접두어 inq_/inquiries_.
   ★ 제목·본문·이름·이메일은 브랜드가 쓴 외부 입력, 답변은 어드민 입력 — 출력은 예외 없이 escapeHtml/escapeAttr
     (표시 시 이스케이프로 통일 — 리스크 4). onclick 문자열 대신 data-* + 이벤트 위임.
   ★ 확인창(confirm/prompt/alert) 없음. 실패는 숨기지 않는다(토스트·폼 안 문구·permission-denied 안내).
   ───────────────────────────────────────────────────────────────────────── */

var INQ_PAGE_SIZE = 200;
var INQ_PORTAL_URL = 'https://archinodekr.com/brand-portal/dashboard.html';   // 메일 본문 링크 — view-leads.js LEAD_PORTAL_URL 과 같은 절대 주소
var INQ_MAIL_SUBJECT_MAX = 190;   // firestore.rules mail: message.subject.size() < 200 — 여유를 둔다

var INQ_STATUSES = [
    { key: 'open',     en: 'Open',     ko: '열림',   cls: 'status-new' },
    { key: 'answered', en: 'Answered', ko: '답변됨', cls: 'status-approved' }
];
var INQ_ROLES = { brand: { en: 'Brand', ko: '브랜드' }, professional: { en: 'Professional', ko: '전문가' } };
var INQ_COLUMNS = [
    { en: 'Date',    ko: '날짜' },
    { en: 'From',    ko: '보낸 사람' },
    { en: 'Role',    ko: '구분' },
    { en: 'Subject', ko: '제목' },
    { en: 'Status',  ko: '상태' },
    { en: '',        ko: '' }
];

var inq_state = { items: [], lastDoc: null, hasMore: false, loading: false, loaded: false, error: false, status: '', authHooked: false, saving: false, openCount: null };

// ── 메타·조회 ──
function inq_statusMeta(key) { for (var i = 0; i < INQ_STATUSES.length; i++) if (INQ_STATUSES[i].key === key) return INQ_STATUSES[i]; return null; }
function inq_findItem(id) { for (var i = 0; i < inq_state.items.length; i++) if (inq_state.items[i].id === id) return inq_state.items[i]; return null; }
function inq_label(it) { return String(it.subject || '') + (it.fromName ? ' / ' + String(it.fromName) : ''); }   // 활동 로그 target.label
function inq_millis(ts) { if (!ts) return 0; var d = (typeof ts.toDate === 'function') ? ts.toDate() : new Date(ts); var m = d.getTime(); return isNaN(m) ? 0 : m; }
function inq_statusBadge(status) {
    var m = inq_statusMeta(status);
    return m ? '<span class="status ' + m.cls + '" ' + tAttr(m.en, m.ko) + '>' + escapeHtml(t(m.en, m.ko)) + '</span>'
             : '<span class="status">' + escapeHtml(status || '-') + '</span>';
}
function inq_roleSpan(role) { var m = INQ_ROLES[role]; return m ? tSpan(m.en, m.ko) : escapeHtml(role || '-'); }
// 본문·답변 → HTML: escapeHtml 뒤 줄바꿈만 <br>(HTML 해석 없음)
function inq_bodyHtml(text) { return escapeHtml(text).replace(/\r?\n/g, '<br>'); }

// ── 화면 그리기. el = #tab-inquiries. 뼈대는 한 번만, 이후 호출은 다시 읽기만 ──
function inquiries_render(el) {
    el = el || document.getElementById('tab-inquiries');
    if (!el) return;
    if (!document.getElementById('inqTable')) {
        var html = '<div class="section-card adm-inquiries">'
            + '<div class="adm-toolbar">'
            + inquiries_selectHtml('inqStatus', [{ key: '', en: 'All statuses', ko: '전체 상태' }].concat(INQ_STATUSES), inq_state.status)
            + '<div class="adm-spacer"></div>'
            + '<button type="button" class="act-btn act-view" id="inqRefreshBtn" ' + tAttr('Refresh', '새로고침') + '>' + escapeHtml(t('Refresh', '새로고침')) + '</button>'
            + '</div>'
            + '<p class="adm-set-intro" ' + tAttr('Questions sent from the Brand Portal (Support tab). Answer here — the reply is shown in the portal and one email is queued to the sender. Professional (auth/profile) inquiries come later.',
                                                    '브랜드 포털(Support 탭)에서 보낸 문의. 여기서 답하면 포털에 답변이 보이고 보낸 사람에게 메일 1통이 큐에 들어갑니다. 전문가(auth/profile) 문의는 복귀 후.')
            + '>' + escapeHtml(t('Questions sent from the Brand Portal (Support tab). Answer here — the reply is shown in the portal and one email is queued to the sender. Professional (auth/profile) inquiries come later.',
                                 '브랜드 포털(Support 탭)에서 보낸 문의. 여기서 답하면 포털에 답변이 보이고 보낸 사람에게 메일 1통이 큐에 들어갑니다. 전문가(auth/profile) 문의는 복귀 후.')) + '</p>'
            + '<div class="adm-msg" id="inqMsg"></div>'
            + '<table><thead>' + inquiries_theadHtml() + '</thead><tbody id="inqTable"></tbody></table>'
            + '<div class="adm-more"><button type="button" class="act-btn act-add" id="inqMoreBtn" style="display:none;" ' + tAttr('Load more', '더 보기') + '>' + escapeHtml(t('Load more', '더 보기')) + '</button></div>'
            + '</div>';
        el.innerHTML = html;
        document.getElementById('inqStatus').addEventListener('change', function () { inq_state.status = this.value; inquiries_draw(); });
        document.getElementById('inqRefreshBtn').addEventListener('click', function () { inquiries_load(false); });   // 목록 읽기가 열린 건수까지 다시 센다(읽기 1회)
        document.getElementById('inqMoreBtn').addEventListener('click', function () { inquiries_load(true); });
        // [보기] — onclick 문자열 대신 data-inq-view + 위임 (리스크 4 ①)
        document.getElementById('inqTable').addEventListener('click', function (e) {
            var b = e.target.closest('[data-inq-view]');
            if (b) inq_view(b.getAttribute('data-inq-view'));
        });
    }
    if (inq_state.loaded && !inq_state.loading) inquiries_draw(); else inquiries_load(false);   // 로그인 시 선로드(inq_ensureLoaded)됐으면 다시 읽지 않는다
}

// ── 대시보드가 부른다(로그인 시 1회 선로드) — 아직 안 읽었으면 한 번만 읽는다(통합 검색 캐시 + 열린 건수 배지·카드). 화면이 없어도 동작 ──
function inq_ensureLoaded() {
    if (inq_state.loaded || inq_state.loading) { inq_pushOpenCount(); return; }
    inquiries_load(false);
}

// ── <select> — option 도 data-en/ko 짝 + 현재 언어 텍스트 (view-leads.js 와 같은 방식) ──
function inquiries_selectHtml(id, options, current) {
    var html = '<select id="' + escapeAttr(id) + '">';
    for (var i = 0; i < options.length; i++) {
        var o = options[i];
        html += '<option value="' + escapeAttr(o.key) + '"' + (o.key === current ? ' selected' : '') + ' ' + tAttr(o.en, o.ko) + '>' + escapeHtml(t(o.en, o.ko)) + '</option>';
    }
    return html + '</select>';
}
function inquiries_theadHtml() {
    var html = '<tr>';
    for (var i = 0; i < INQ_COLUMNS.length; i++) {
        html += '<th ' + tAttr(INQ_COLUMNS[i].en, INQ_COLUMNS[i].ko) + '>' + escapeHtml(t(INQ_COLUMNS[i].en, INQ_COLUMNS[i].ko)) + '</th>';
    }
    return html + '</tr>';
}

// ── 읽기. more=true 면 마지막 문서 다음부터 200건 더 (startAfter). 단일 orderBy — 복합 색인 불필요 ──
function inquiries_load(more) {
    if (inq_state.loading) return;
    if (typeof db === 'undefined' || typeof auth === 'undefined' || !auth.currentUser) { inquiries_waitAuth(); return; }   // 로그인 전 진입(#inquiries 직접 열기)
    if (!more) { inq_state.items = []; inq_state.lastDoc = null; inq_state.hasMore = false; inq_state.openCount = null; }   // 새로고침이면 열린 건수도 다시 센다
    var q = db.collection('inquiries').orderBy('createdAt', 'desc').limit(INQ_PAGE_SIZE);
    if (more && inq_state.lastDoc) q = q.startAfter(inq_state.lastDoc);
    inq_state.loading = true;
    inq_state.error = false;
    inquiries_msg(t('Loading…', '불러오는 중…'), false);
    q.get().then(function (snap) {
        snap.forEach(function (d) { inq_state.items.push(Object.assign({ id: d.id }, d.data())); });
        if (typeof admRegisterCache === 'function') admRegisterCache('inquiries', inq_state.items);   // 6단계 통합 검색 캐시(추가 읽기 없음 — 검수대장 A-041)
        if (snap.size) inq_state.lastDoc = snap.docs[snap.docs.length - 1];
        inq_state.hasMore = snap.size === INQ_PAGE_SIZE;
        inq_state.loading = false;
        inq_state.loaded = true;
        inq_pushOpenCount();   // 열린 건수(배지·카드)는 이 읽기 결과에서 — 별도 where 없음
        inquiries_draw();
    }).catch(function (err) {
        inq_state.loading = false;
        inq_state.error = true;
        console.error('[inquiries] read failed', err);
        var code = (err && err.code) || (err && err.message) || '';
        inquiries_msg(code === 'permission-denied'
            ? t('Read failed (permission-denied) — check that the inquiries rule is published', '읽기 실패(permission-denied) — inquiries 규칙 게시 여부 확인')
            : t('Read failed: ', '읽기 실패: ') + code, true);
        if (typeof dash_setNum === 'function') dash_setNum('inquiries', '!', t('Read failed: ', '읽기 실패: ') + code);   // 대시보드 카드에도 실패 표시(조용한 실패 방지)
        inquiries_draw();
    });
}

// 로그인 완료를 한 번만 기다렸다가 다시 읽는다 (view-leads.js 의 leads_waitAuth 와 같은 방식)
function inquiries_waitAuth() {
    if (inq_state.authHooked || typeof auth === 'undefined') return;
    inq_state.authHooked = true;
    inquiries_msg(t('Sign in required', '로그인 필요'), false);
    var un = auth.onAuthStateChanged(function (u) {
        if (!u) return;
        if (typeof un === 'function') un();
        inq_state.authHooked = false;
        inquiries_load(false);
    });
}

// ── 클라이언트 정렬(open 먼저 → 최신) + 상태 필터 ──
function inquiries_filtered() {
    var status = inq_state.status;
    return inq_state.items.filter(function (it) { return !status || it.status === status; })
        .sort(function (a, b) {
            var ao = a.status === 'open' ? 0 : 1, bo = b.status === 'open' ? 0 : 1;
            if (ao !== bo) return ao - bo;
            return inq_millis(b.createdAt) - inq_millis(a.createdAt);
        });
}

function inquiries_draw() {
    var tbody = document.getElementById('inqTable');
    if (!tbody) return;
    var list = inquiries_filtered();
    tbody.innerHTML = list.length ? inquiries_rowsHtml(list)
        : '<tr><td colspan="' + INQ_COLUMNS.length + '" class="adm-muted">' + tSpan('No inquiries', '문의 없음') + '</td></tr>';
    var more = document.getElementById('inqMoreBtn');
    if (more) more.style.display = inq_state.hasMore ? '' : 'none';
    if (!inq_state.loading && !inq_state.error) {
        inquiries_msg(t('Showing ' + list.length + ' of ' + inq_state.items.length + ' loaded', '불러온 ' + inq_state.items.length + '건 중 ' + list.length + '건 표시')
            + (inq_state.hasMore ? t(' — more available', ' — 더 있음') : ''), false);
    }
}
function inquiries_msg(text, isErr) {
    var el = document.getElementById('inqMsg');
    if (!el) return;
    el.textContent = text || '';
    el.classList.toggle('err', !!isErr);
}

// ── 행 HTML — 이름·이메일·제목 전부 외부 입력 → escapeHtml/escapeAttr ──
function inquiries_rowsHtml(list) {
    var html = '';
    for (var i = 0; i < list.length; i++) {
        var it = list[i] || {};
        var subj = String(it.subject || '');
        html += '<tr>'
            + '<td class="adm-nowrap">' + escapeHtml(fmtDate(it.createdAt)) + '</td>'
            + '<td>' + escapeHtml(it.fromName || '-') + (it.fromEmail ? '<small class="adm-log-sub">' + escapeHtml(it.fromEmail) + '</small>' : '') + '</td>'
            + '<td>' + inq_roleSpan(it.fromRole) + '</td>'
            + '<td><span class="adm-ellip" title="' + escapeAttr(subj) + '">' + escapeHtml(subj.length > 60 ? subj.slice(0, 60) + '…' : (subj || '-')) + '</span></td>'
            + '<td>' + inq_statusBadge(it.status) + '</td>'
            + '<td><button type="button" class="act-btn act-view" data-inq-view="' + escapeAttr(it.id) + '" ' + tAttr('View', '보기') + '>' + escapeHtml(t('View', '보기')) + '</button></td>'
            + '</tr>';
    }
    return html;
}

function inq_val(id) { var el = document.getElementById(id); return el ? String(el.value || '').trim() : ''; }
function inq_showErr(text) { var el = document.getElementById('iqErr'); if (!el) return; el.textContent = text || ''; el.style.display = text ? 'block' : 'none'; }

// ── 상세 모달 — 보낸 사람·제목·본문 · 답변 textarea + [답변 저장] · 이력 ──
function inq_view(id) {
    var it = inq_findItem(id);
    if (!it) return;
    var dd = function (en, ko, val) { return '<dt ' + tAttr(en, ko) + '>' + escapeHtml(t(en, ko)) + '</dt><dd>' + escapeHtml(val || '-') + '</dd>'; };
    var hist = Array.isArray(it.history) ? it.history.slice().reverse() : [];   // 최신 위
    var histHtml = '';
    for (var i = 0; i < hist.length; i++) {
        var h = hist[i] || {};
        histHtml += '<li>' + inq_statusBadge(h.status) + ' <small>' + escapeHtml(fmtDate(h.at)) + ' · ' + escapeHtml(h.by || '-') + (h.byRole ? ' (' + escapeHtml(h.byRole) + ')' : '') + '</small>'
            + (h.note ? '<div>' + escapeHtml(h.note) + '</div>' : '') + '</li>';
    }
    if (!histHtml) histHtml = '<li class="adm-muted">' + tSpan('No history yet', '이력 없음') + '</li>';
    var html = '<h2 class="adm-lead-h2">' + escapeHtml(it.subject || '-') + ' ' + inq_statusBadge(it.status) + '</h2>'
        + '<div class="adm-lead-detail">'
        + '<dl class="adm-dl">'
        + dd('From', '보낸 사람', it.fromName)
        + dd('Email', '이메일', it.fromEmail)
        + '<dt ' + tAttr('Role', '구분') + '>' + escapeHtml(t('Role', '구분')) + '</dt><dd>' + inq_roleSpan(it.fromRole) + (it.fromUid ? ' <small class="adm-muted">uid ' + escapeHtml(it.fromUid) + '</small>' : '') + '</dd>'
        + dd('Received', '접수', fmtDate(it.createdAt))
        + '<dt ' + tAttr('Message', '본문') + '>' + escapeHtml(t('Message', '본문')) + '</dt><dd>' + inq_bodyHtml(it.body || '-') + '</dd>'
        + (it.status === 'answered' ? '<dt ' + tAttr('Answered', '답변') + '>' + escapeHtml(t('Answered', '답변')) + '</dt><dd>' + escapeHtml(fmtDate(it.answeredAt)) + (it.answeredBy ? ' · ' + escapeHtml(it.answeredBy) : '') + '</dd>' : '')
        + '</dl>'
        + '<div class="adm-bar" style="align-items:flex-start;">'
        +   '<label for="iqAnswer" ' + tAttr('Answer', '답변') + '>' + escapeHtml(t('Answer', '답변')) + '</label>'
        +   '<textarea id="iqAnswer" rows="5" maxlength="5000">' + escapeHtml(it.answer || '') + '</textarea>'
        + '</div>'
        + '<p class="adm-set-intro">' + escapeHtml(t('Saving marks the inquiry "answered", shows the answer in the Brand Portal, and queues one email to the sender (delivery depends on the mail extension).',
                                                    '저장하면 "답변됨"이 되고 브랜드 포털에 답변이 보이며 보낸 사람에게 메일 1통이 큐에 들어갑니다(실제 발송은 메일 확장 설치 여부에 따름).')) + '</p>'
        + '<div class="adm-err" id="iqErr"></div>'
        + '<div class="adm-form-actions">'
        +   '<button type="button" class="act-btn adm-btn-cancel" id="iqCloseBtn" ' + tAttr('Close', '닫기') + '>' + escapeHtml(t('Close', '닫기')) + '</button>'
        +   '<button type="button" class="act-btn act-approve" id="iqSaveBtn" ' + tAttr(it.status === 'answered' ? 'Update answer' : 'Save answer', it.status === 'answered' ? '답변 수정' : '답변 저장') + '>'
        +     escapeHtml(t(it.status === 'answered' ? 'Update answer' : 'Save answer', it.status === 'answered' ? '답변 수정' : '답변 저장')) + '</button>'
        + '</div>'
        + '<div class="adm-hist-head" ' + tAttr('History', '이력') + '>' + escapeHtml(t('History', '이력')) + '</div>'
        + '<ul class="adm-hist">' + histHtml + '</ul>'
        + '</div>';
    openModal(html);
    document.getElementById('iqCloseBtn').addEventListener('click', closeModal);
    document.getElementById('iqSaveBtn').addEventListener('click', function () { inq_saveAnswer(it); });
    document.getElementById('iqAnswer').focus();
}

// ── 답변 저장 — status 'answered' + answer/answeredAt/answeredBy + history + logAdmin('inquiry.answer') + mail 1통 ──
function inq_saveAnswer(it) {
    if (inq_state.saving) return;
    if (typeof db === 'undefined' || typeof auth === 'undefined' || !auth.currentUser) { showToast(t('Sign in required', '로그인 필요'), 'error'); return; }
    var answer = inq_val('iqAnswer');
    if (!answer) { inq_showErr(t('Write an answer first.', '답변을 입력하세요.')); return; }
    if (it.status === 'answered' && answer === String(it.answer || '')) { inq_showErr(t('Nothing changed.', '바뀐 것이 없습니다.')); return; }
    inq_showErr('');
    var by = auth.currentUser.email || '';
    var entry = { status: 'answered', by: by, byRole: 'admin', at: new Date().toISOString(), note: it.status === 'answered' ? 'answer updated' : 'answered' };
    var btn = document.getElementById('iqSaveBtn');
    inq_state.saving = true;
    if (btn) btn.disabled = true;
    db.collection('inquiries').doc(it.id).update({
        status: 'answered',
        answer: answer,
        answeredAt: firebase.firestore.FieldValue.serverTimestamp(),
        answeredBy: by,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
        history: firebase.firestore.FieldValue.arrayUnion(entry)
    }).then(function () {
        inq_state.saving = false;
        logAdmin({ action: 'inquiry.answer', target: { col: 'inquiries', id: it.id, label: inq_label(it) }, from: it.status || '', to: 'answered', note: entry.note + ' · ' + String(it.fromEmail || '') });
        var wasOpen = it.status === 'open';
        it.status = 'answered'; it.answer = answer; it.answeredAt = new Date(); it.answeredBy = by; it.updatedAt = new Date();   // 로컬 반영 (다시 읽지 않는다)
        it.history = (Array.isArray(it.history) ? it.history : []).concat([entry]);
        showToast(t('Answer saved', '답변을 저장했습니다'), 'success');
        inq_sendAnswerMail(it, answer);
        if (wasOpen && typeof inq_state.openCount === 'number') inq_setOpenCount(Math.max(0, inq_state.openCount - 1));   // 배지·카드 즉시 반영
        inquiries_draw();
        inq_view(it.id);   // 갱신된 상태·이력으로 다시 그림 (확인창 없음)
    }).catch(function (err) {
        inq_state.saving = false;
        if (btn) btn.disabled = false;
        console.error('[inquiries] answer save failed', err);
        var code = (err && err.code) || (err && err.message) || '';
        inq_showErr(code === 'permission-denied'
            ? t('Save failed (permission-denied) — check that the inquiries rule is published', '저장 실패(permission-denied) — inquiries 규칙 게시 여부 확인')
            : t('Save failed: ', '저장 실패: ') + code);
    });
}

// ── 답변 메일 1통 — list-your-brand.html 의 mail.add 패턴 그대로 (to + message.subject/text, 평문).
//    제목 "Re: <subject> — ARCHINODE" 는 규칙(message.subject.size() < 200)에 맞춰 190자에서 자른다.
//    ★ 문서 저장 성공 ≠ 발송 — Trigger Email Extension 설치 여부는 미확인(CLAUDE.md 5절). 실패는 토스트(조용한 실패 방지).
function inq_mailSubject(subject) {
    var prefix = 'Re: ', suffix = ' — ARCHINODE';
    var s = String(subject || '').replace(/\s+/g, ' ').trim();
    var room = INQ_MAIL_SUBJECT_MAX - prefix.length - suffix.length;
    if (s.length > room) s = s.slice(0, room - 1) + '…';
    return prefix + s + suffix;
}
function inq_sendAnswerMail(it, answer) {
    var to = String(it.fromEmail || '').trim();
    if (!(to.length > 5 && to.indexOf('@') > 0)) {
        showToast(t('Answered — but the sender has no email on file, so no notification was queued', '답변됨 — 보낸 사람 이메일이 없어 알림 메일을 넣지 못했습니다'), 'warn');
        return;
    }
    var body = String(it.body || '');
    var quote = body.length > 300 ? body.slice(0, 300) + '…' : body;
    var lines = [
        'Dear ' + String(it.fromName || 'partner') + ',',
        '',
        'ARCHINODE has answered your inquiry "' + String(it.subject || '') + '":',
        '',
        answer,
        '',
        '— Your original message —',
        quote,
        '',
        'You can also read this answer in your Brand Portal (Support tab):',
        INQ_PORTAL_URL,
        '',
        'If you have further questions, reply to this email or contact office@archinode.org',
        '',
        'Best regards,',
        'ARCHINODE Team',
        'https://archinodekr.com'
    ];
    return db.collection('mail').add({
        to: to,
        message: {
            subject: inq_mailSubject(it.subject),
            text: lines.join('\n')
        }
    }).catch(function (err) {
        console.warn('[inquiries] answer mail skipped:', err);
        showToast(t('Answered — but the notification email could not be queued', '답변됨 — 알림 메일을 큐에 넣지 못했습니다'), 'warn');
    });
}

// ── 열린 건수 — 목록 읽기(inquiries_load) 결과에서 센다(별도 where 없음 — 읽기 1회, 브론즈 R12). 사이드바 배지 + 대시보드 카드 ──
//    200건이 꽉 차(hasMore) 안 읽은 문서가 남았을 때만 inq_loadOpenCount 의 where 한 번으로 보정한다(캐시만 세면 적게 나온다).
function inq_pushOpenCount() {
    if (!inq_state.loaded) return;
    if (inq_state.hasMore) {   // 안 읽은 문서가 남음 — 이미 where 로 센 값이 있으면 그대로(loadAll 마다 반복 조회 안 함), 없으면 한 번 센다
        if (typeof inq_state.openCount === 'number') inq_setOpenCount(inq_state.openCount); else inq_loadOpenCount();
        return;
    }
    var n = 0;
    for (var i = 0; i < inq_state.items.length; i++) if (inq_state.items[i].status === 'open') n++;
    inq_setOpenCount(n);
}
// where('status','==','open') 단일 필드 한 번 — 위 hasMore 보정용으로만 남긴다. 실패는 카드에 '!'(dash_setNum) 로 보인다(조용한 실패 방지). 배지는 0 이면 지운다.
function inq_loadOpenCount() {
    if (typeof db === 'undefined' || typeof auth === 'undefined' || !auth.currentUser) return;   // 로그인 전: loadAll() 끝의 dash_render 가 다시 부른다
    db.collection('inquiries').where('status', '==', 'open').get()
        .then(function (snap) { inq_setOpenCount(snap.size); })
        .catch(function (err) {
            console.error('[inquiries] open count failed', err);
            if (typeof dash_setNum === 'function') dash_setNum('inquiries', '!', t('Read failed: ', '읽기 실패: ') + ((err && err.code) || ''));
        });
}
function inq_setOpenCount(n) {
    inq_state.openCount = n;
    if (typeof dash_setNum === 'function') dash_setNum('inquiries', String(n), '');
    var item = document.querySelector('#adminSidebar .adm-item[data-id="inquiries"]');
    if (!item) return;
    var badge = item.querySelector('.adm-badge');
    if (!n) { if (badge) badge.remove(); return; }
    if (!badge) { badge = document.createElement('span'); badge.className = 'adm-badge'; item.appendChild(badge); }
    badge.textContent = String(n);
    badge.setAttribute('title', t(n + ' open', '열린 문의 ' + n + '건'));
}
