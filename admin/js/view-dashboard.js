/* ─────────────────────────────────────────────────────────────────────────
   view-dashboard.js — 대시보드 첫 화면 (2026-09-12 어드민 개편 1단계)
   정본: docs/회의/2026-09-12-구현계약서-어드민개편.md 3장 1단계 · 6장 리스크 7·8

   대기 건수 카드 9개(4a: 「새 리드」 · 5: 「열린 문의」 · 6: 「회원」 추가) + 「최근 활동」(2단계: adminLogs 최신 20건 — view-logs.js 의 logs_tableHtml 재사용).
   카운트는 컬렉션마다 where('status','==',…) 단일 필드 한 번 — orderBy 를 붙이면
   복합 색인이 필요해지므로 붙이지 않는다(리스크 8). Firestore 쓰기 없음.
   회원·1:1 문의는 카운트 쿼리 대신 그 화면의 목록을 로그인 시 1회 선로드(users_ensureLoaded·inq_ensureLoaded)해
   카드 + 통합 검색 캐시를 같이 채운다(6단계 · 브론즈 R12 A-041).
   ★ 전역 `var`/`function` 만. 접두어 dash_.
   ───────────────────────────────────────────────────────────────────────── */

var DASH_CARDS = [
    { id: 'leads',         en: 'New leads',             ko: '새 리드',          icon: 'fa-inbox',            coll: 'leads',             status: 'new',      href: 'dashboard.html#leads' },     // 4a단계
    { id: 'inquiries',     en: 'Open inquiries',        ko: '열린 문의',        icon: 'fa-comment-dots',     coll: 'inquiries',         status: 'open',     href: 'dashboard.html#inquiries', loader: 'inq_ensureLoaded' },   // 5단계 → R12: view-inquiries.js 가 목록 1회 선로드로 카드 + 사이드바 배지 + 통합 검색 캐시를 채운다(A-041)
    { id: 'brands',        en: 'Brands pending',        ko: '브랜드 승인 대기', icon: 'fa-building',         coll: 'brands',            status: 'pending',  href: 'dashboard.html#brands' },
    { id: 'products',      en: 'Products to review',    ko: '제품 검토 대기',   icon: 'fa-box-open',         coll: 'products',          status: 'pending',  href: 'dashboard.html#products' },
    { id: 'articles',      en: 'Articles to review',    ko: '아티클 검토 대기', icon: 'fa-newspaper',        coll: 'articles',          status: 'pending',  href: 'dashboard.html#articles' },
    { id: 'consultations', en: 'Consultations pending', ko: '자문 요청 대기',   icon: 'fa-comments',         coll: 'consultations',     status: 'pending',  href: 'consultations.html' },
    { id: 'trend',         en: 'Trend submissions',     ko: '트렌드 투고 대기', icon: 'fa-lightbulb',        coll: 'trend-submissions', status: 'pending',  href: 'trend-submissions.html' },
    { id: 'review',        en: 'Review issues open',    ko: '검수 검토대기',    icon: 'fa-clipboard-check',  coll: 'reviewIssues',      status: '검토대기', href: 'dashboard.html#review' },
    { id: 'users',         en: 'Members',               ko: '전문가 회원',      icon: 'fa-users',            coll: 'users',             status: '',         href: 'dashboard.html#members', cache: true }   // 6단계: where 없음 — view-users.js 캐시 길이(200 꽉 차면 "200+")
];

// ── 화면 그리기. el = #tab-dashboard. 로그인 전에는 자리만 그리고 읽지 않는다 ──
function dash_render(el) {
    el = el || document.getElementById('tab-dashboard');
    if (!el) return;

    var html = '<div class="adm-notice" id="dashNotice" style="display:none;"></div>'   // settings/config.adminNotice (3단계) — dash_renderNotice 가 채운다
        /* A-624: 알림 메일이 **보내지지 않은 것**을 여기서 알린다. notifyPending 은
           「묶음이 거부됨」만 잡고, 큐에 들어갔지만 확장이 못 보낸 것(ERROR)이나
           손도 안 댄 것은 아무것도 잡지 않았다 — 실측: mail 42건 중 delivery 칸이
           없는 것 28건, ERROR 1건(「550 The archinode.org domain is not verified」).
           도메인 인증이 또 풀리면 알림이 전부 조용히 실패하고 아무 화면도 말하지
           않는다. 손님은 보냈다고 믿고 기다린다. */
        + '<div class="adm-notice" id="dashMailHealth" style="display:none;"></div>'
        + '<div class="adm-cards">';
    for (var i = 0; i < DASH_CARDS.length; i++) {
        var c = DASH_CARDS[i];
        html += '<a class="adm-card" href="' + escapeAttr(c.href) + '" data-card="' + escapeAttr(c.id) + '">'
            + '<i class="fas ' + escapeAttr(c.icon) + ' adm-card-icon"></i>'
            + '<div class="adm-num" id="dashNum-' + escapeAttr(c.id) + '">…</div>'
            + '<div class="adm-label" ' + tAttr(c.en, c.ko) + '>' + escapeHtml(t(c.en, c.ko)) + '</div>'
            + '</a>';
    }
    html += '</div>'
        + '<div class="section-card adm-activity">'
        + '<h3 ' + tAttr('Recent Activity', '최근 활동') + '>' + escapeHtml(t('Recent Activity', '최근 활동')) + '</h3>'
        + '<div id="dashRecent"><p class="adm-muted">' + tSpan('Loading…', '불러오는 중…') + '</p></div>'
        + '<p class="adm-more"><a href="dashboard.html#logs" ' + tAttr('View all activity', '활동 로그 전체 보기') + '>' + escapeHtml(t('View all activity', '활동 로그 전체 보기')) + '</a></p>'
        + '</div>';
    el.innerHTML = html;

    dash_loadCounts();
    dash_loadRecent();
    dash_loadNotice();
    dash_loadMailHealth();
}

/* ── A-624: 최근 알림 메일이 실제로 나갔는지 ───────────────────────────────
   지난 7일만 본다. 더 길게 보면 옛 실패가 영구히 떠 있고, 영구히 떠 있는
   경고는 아무도 안 보는 경고가 된다(A-618 과 같은 결의 교훈).
   createdAt 이 없는 문서는 orderBy 가 애초에 빼 주므로 옛 잡동사니는 안 센다. */
function dash_loadMailHealth() {
    var box = document.getElementById('dashMailHealth');
    if (!box) return;
    if (typeof db === 'undefined' || !db) return;
    if (typeof auth === 'undefined' || !auth || !auth.currentUser) return;   // 로그인 전: loadAll() 끝에서 다시 부른다

    var WEEK = 7 * 24 * 60 * 60 * 1000;
    var STALE = 10 * 60 * 1000;          // 10분이 지나도 손 안 댄 것은 안 나간 것으로 본다
    var now = Date.now();

    db.collection('mail').orderBy('createdAt', 'desc').limit(30).get().then(function (snap) {
        var errs = 0, stale = 0, lastErr = '';
        snap.forEach(function (doc) {
            var v = doc.data() || {};
            var at = 0;
            try { at = v.createdAt && v.createdAt.toDate ? v.createdAt.toDate().getTime() : 0; } catch (e) { at = 0; }
            if (!at || now - at > WEEK) return;
            var st = (v.delivery && v.delivery.state) || '';
            if (st === 'ERROR') {
                errs++;
                if (!lastErr && v.delivery && v.delivery.error) lastErr = String(v.delivery.error);
            } else if (!st && now - at > STALE) {
                stale++;
            }
        });
        if (!errs && !stale) { box.style.display = 'none'; box.innerHTML = ''; return; }

        var parts = [];
        if (errs) parts.push(t(errs + ' failed to send', '발송 실패 ' + errs + '건'));
        if (stale) parts.push(t(stale + ' never picked up', '발송기가 손대지 않은 것 ' + stale + '건'));
        var head = t('Notification e-mail problem in the last 7 days: ',
                     '최근 7일 알림 메일 문제: ') + parts.join(' / ');
        box.innerHTML = '<i class="fas fa-triangle-exclamation" aria-hidden="true"></i> '
            + '<strong>' + escapeHtml(head) + '</strong>'
            + (lastErr ? '<br><span class="adm-muted">' + escapeHtml(lastErr.slice(0, 160)) + '</span>' : '')
            + '<br><span class="adm-muted">' + escapeHtml(t(
                'Customers believe their inquiry was sent. Check the Trigger Email extension and the sending domain.',
                '손님은 문의가 갔다고 믿고 기다립니다. Trigger Email 확장과 발송 도메인 인증을 확인하세요.')) + '</span>';
        box.style.display = 'block';
        box.setAttribute('role', 'alert');
    }).catch(function (err) {
        /* 못 읽는 것 자체는 손님에게 영향이 없다 — 조용히 넘기고 콘솔에만 남긴다 */
        console.warn('mail health check failed:', err && err.code);
    });
}

// ── 어드민 메모 — settings/config.adminNotice (3단계). 비어 있으면 숨긴다. 읽기 실패는 박스에 작게 표시(조용한 실패 방지) ──
function dash_loadNotice() {
    if (typeof db === 'undefined' || typeof auth === 'undefined' || !auth.currentUser) return;   // 로그인 전: loadAll() 끝에서 다시 부른다
    db.collection('settings').doc('config').get()
        .then(function (snap) { dash_renderNotice(snap.exists ? (snap.data() || {}).adminNotice : ''); })
        .catch(function (err) {
            console.warn('[dashboard] settings/config read failed', err);
            var box = document.getElementById('dashNotice');
            if (!box) return;
            box.style.display = '';
            box.className = 'adm-notice adm-notice-err';
            box.textContent = t('Admin notice unavailable: ', '어드민 메모 읽기 실패: ') + ((err && err.code) || '');
        });
}
// 메모 텍스트 → 회색 박스. textContent 로 넣는다(HTML 해석 없음). view-settings.js 저장 뒤에도 부른다
function dash_renderNotice(text) {
    var box = document.getElementById('dashNotice');
    if (!box) return;
    var s = String(text == null ? '' : text).trim();
    box.className = 'adm-notice';
    box.style.display = s ? '' : 'none';
    box.innerHTML = s ? '<i class="fas fa-thumbtack"></i> <span>' + escapeHtml(s) + '</span>' : '';
}

// ── 최근 활동 20건 — adminLogs orderBy('at','desc') 단일 필드 (2단계). 실패는 자리에 표시한다 ──
function dash_loadRecent() {
    var box = document.getElementById('dashRecent');
    if (!box) return;
    if (typeof db === 'undefined' || typeof auth === 'undefined' || !auth.currentUser) return;   // 로그인 전: loadAll() 끝에서 다시 부른다
    if (typeof logs_tableHtml !== 'function') { box.innerHTML = '<p class="adm-muted">view-logs.js not loaded</p>'; return; }
    db.collection('adminLogs').orderBy('at', 'desc').limit(20).get()
        .then(function (snap) {
            var items = [];
            snap.forEach(function (d) { items.push(Object.assign({ id: d.id }, d.data())); });
            box.innerHTML = logs_tableHtml(items);
            if (typeof logs_afterInsert === 'function') logs_afterInsert(box);   // R-072 — 잘린 메모 표시
        })
        .catch(function (err) {
            console.error('[dashboard] adminLogs read failed', err);
            var code = (err && err.code) || (err && err.message) || '';
            box.innerHTML = '<p class="adm-muted adm-num-err">' + escapeHtml(code === 'permission-denied'
                ? t('Read failed (permission-denied) — check that the adminLogs rule is published', '읽기 실패(permission-denied) — adminLogs 규칙 게시 여부 확인')
                : t('Read failed: ', '읽기 실패: ') + code) + '</p>';
        });
}

// ── 카운트 읽기. 실패는 숨기지 않고 카드에 표시한다(조용한 실패 방지) ──
function dash_loadCounts() {
    if (typeof db === 'undefined' || typeof auth === 'undefined' || !auth.currentUser) return;   // 로그인 전: loadAll() 끝에서 다시 부른다
    DASH_CARDS.forEach(function (c) {
        if (c.cache) {   // 6단계 회원 수 — 별도 카운트 쿼리 없이 users_load 결과(캐시)로. 이미 읽었으면 다시 읽지 않는다
            if (typeof users_ensureLoaded === 'function') users_ensureLoaded(); else dash_setNum(c.id, '-', 'view-users.js not loaded');
            return;
        }
        if (c.loader) {   // 5단계 열린 문의 — 그 화면의 전역 function 이 목록 1회 선로드로 카드(dash_setNum) + 사이드바 배지 + 검색 캐시를 같이 채운다(이미 읽었으면 다시 읽지 않는다)
            if (typeof window[c.loader] === 'function') window[c.loader](); else dash_setNum(c.id, '-', c.loader + ' not loaded');
            return;
        }
        db.collection(c.coll).where('status', '==', c.status).get()
            .then(function (snap) { dash_setNum(c.id, String(snap.size), ''); })
            .catch(function (err) {
                console.error('[dashboard] ' + c.coll + ' count failed', err);
                dash_setNum(c.id, '!', t('Read failed: ', '읽기 실패: ') + ((err && err.code) || ''));
            });
    });
}
function dash_setNum(id, text, title) {
    var el = document.getElementById('dashNum-' + id);
    if (!el) return;
    el.textContent = text;
    el.classList.toggle('adm-num-err', text === '!');
    if (title) el.setAttribute('title', title); else el.removeAttribute('title');
}
