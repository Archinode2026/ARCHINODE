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
