/* ─────────────────────────────────────────────────────────────────────────
   view-demand.js — 운영 > 한국 수요 (2026-11-23)
   정본: docs/설계/수요증거-2026-11-23.md

   승리님 결정(2026-11-23): 「한국 바이어 쪽은 자산이다. 유럽 브랜드가 입점할
   이유는, 이 사이트를 통해 찾는 한국 고객 수가 많다는 걸 보여 주는 것이다.」

   이 화면은 **이미 받고 있는 `leads` 를 읽기만** 한다. 새 수집이 없고,
   처리방침도 Firestore 규칙도 건드리지 않는다(설계 §5-1).

   ★ 핵심 규칙 — **우리 손으로 만든 문의는 세지 않는다.**
     테스트 리드를 수요로 세면, 지금 `categories.html` 의 「2,910+ 브랜드」와
     똑같은 일을 리포트에서 다시 하는 것이다. 제외한 건수와 **까닭**을 화면에
     같이 찍어서, 숫자가 작아 보이더라도 **왜 작은지**가 보이게 한다.

   ★ 집계는 `dmd_aggregate()` **순수 함수**로 떼어 두었다. 어드민 화면은
     로그인이 있어야 열리므로 사람이 아니면 못 보는데, 순수 함수는
     `tools/test-demand-aggregate.js` 가 합성 데이터로 검증한다.
     (검수대장 A-443: 「센 것이 없으면 통과가 아니다」와 같은 생각)

   ★ 전역 var/function 만. 접두어 dmd_. 출력은 예외 없이 escapeHtml.
     확인창 없음. (기존 어드민 화면들의 규약 그대로)
   ───────────────────────────────────────────────────────────────────────── */

var DMD_WINDOW_DAYS = 90;
var DMD_READ_LIMIT = 1000;

/* 세지 않는 것 — 각 줄에 까닭을 적는다. 까닭 없는 제외는 두지 않는다. */
var DMD_EXCLUDE = [
    { key: 'honeypot', en: 'bot (honeypot filled)', ko: '봇(허니팟이 채워짐)',
      test: function (d) { return !!(d && String(d.hp || '').trim()); } },
    { key: 'testmark', en: 'test record', ko: '테스트 기록',
      test: function (d) {
          var s = [d.name, d.company, d.brandName, d.productName, d.message].join(' ');
          return /\[테스트|\[TEST|테스트-브론즈|qa[ -]?brand/i.test(s);
      } },
    { key: 'internal', en: 'our own submission', ko: '우리가 넣은 것',
      test: function (d) {
          var s = [d.email, d.name, d.company].join(' ').toLowerCase();
          return /archinode\.org|vividlyvibe|비비들리|박승리|seungri park/i.test(s);
      } }
];

var dmd_state = { items: [], catMap: {}, loading: false, loaded: false, error: false, days: DMD_WINDOW_DAYS };

/* ── 시각을 밀리초로 — Firestore Timestamp · Date · 숫자 · 문자열을 다 받는다 ── */
function dmd_ms(v) {
    if (!v) return null;
    if (typeof v.toDate === 'function') { try { return v.toDate().getTime(); } catch (e) { return null; } }
    if (v instanceof Date) return v.getTime();
    if (typeof v === 'number') return v;
    if (typeof v.seconds === 'number') return v.seconds * 1000;
    var t = Date.parse(v);
    return isNaN(t) ? null : t;
}

/* ── 품목을 고른다. 소싱 문의는 category, 브랜드·제품 문의는 지도에서 끌어온다 ── */
function dmd_catOf(d, catMap) {
    if (d && d.category) return String(d.category);
    if (d && d.productId && catMap && catMap['p:' + d.productId]) return catMap['p:' + d.productId];
    if (d && d.brandId && catMap && catMap['b:' + d.brandId]) return catMap['b:' + d.brandId];
    return '';
}

/* ─────────────────────────────────────────────────────────────────────────
   dmd_aggregate — 순수 함수. 입출력만으로 검증된다.
     leads  : [{ category, brandId, productId, industry, source, createdAt, ... }]
     catMap : { 'b:<id>': 'lighting', 'p:<id>': 'finishes' }
     nowMs  : 기준 시각
     days   : 창 길이
   돌려주는 것에 **제외 건수와 까닭**이 함께 들어간다 — 작은 숫자가 왜 작은지
   보이지 않으면 사람이 숫자를 안 믿는다.
   ───────────────────────────────────────────────────────────────────────── */
function dmd_aggregate(leads, catMap, nowMs, days) {
    var win = (days || DMD_WINDOW_DAYS) * 86400000;
    var from = nowMs - win;
    var out = {
        windowDays: days || DMD_WINDOW_DAYS,
        total: 0,
        byCategory: {}, byIndustry: {}, bySource: {}, byMonth: {},
        unknownCategory: 0, unknownIndustry: 0,
        excluded: {}, excludedTotal: 0,
        noDate: 0, outOfWindow: 0,
        readTotal: (leads || []).length
    };
    for (var i = 0; i < (leads || []).length; i++) {
        var d = leads[i] || {};
        var skipped = false;
        for (var k = 0; k < DMD_EXCLUDE.length; k++) {
            var rule = DMD_EXCLUDE[k];
            var hit = false;
            try { hit = !!rule.test(d); } catch (e) { hit = false; }
            if (hit) {
                out.excluded[rule.key] = (out.excluded[rule.key] || 0) + 1;
                out.excludedTotal++;
                skipped = true;
                break;
            }
        }
        if (skipped) continue;

        var ms = dmd_ms(d.createdAt);
        if (ms === null) { out.noDate++; continue; }
        if (ms < from || ms > nowMs) { out.outOfWindow++; continue; }

        out.total++;

        var cat = dmd_catOf(d, catMap);
        if (cat) out.byCategory[cat] = (out.byCategory[cat] || 0) + 1;
        else out.unknownCategory++;

        var ind = d.industry ? String(d.industry) : '';
        if (ind) out.byIndustry[ind] = (out.byIndustry[ind] || 0) + 1;
        else out.unknownIndustry++;

        var src = d.source ? String(d.source) : 'unknown';
        out.bySource[src] = (out.bySource[src] || 0) + 1;

        var dt = new Date(ms);
        var mk = dt.getFullYear() + '-' + ('0' + (dt.getMonth() + 1)).slice(-2);
        out.byMonth[mk] = (out.byMonth[mk] || 0) + 1;
    }
    return out;
}

/* ── 많은 것부터 정렬한 배열로 ── */
function dmd_rank(obj) {
    var a = [];
    for (var k in obj) if (Object.prototype.hasOwnProperty.call(obj, k)) a.push({ key: k, n: obj[k] });
    a.sort(function (x, y) { return y.n - x.n || (x.key < y.key ? -1 : 1); });
    return a;
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { dmd_aggregate: dmd_aggregate, dmd_ms: dmd_ms, dmd_catOf: dmd_catOf, dmd_rank: dmd_rank, DMD_EXCLUDE: DMD_EXCLUDE };
}

/* ═══════════════════════════════════════════════════════════════════════
   화면 — 여기부터는 로그인이 있어야 도는 부분이다.
   제가 눈으로 못 보는 자리이므로, 판단은 전부 위의 순수 함수에 두고
   여기서는 **그린 것만** 한다. (tools/test-demand-aggregate.js 가 위를 검증한다)
   ═══════════════════════════════════════════════════════════════════════ */

var DMD_CAT_KO = {
    furniture: '가구', bathroom: '욕실', outdoor: '아웃도어', lighting: '조명',
    kitchen: '주방', office: '오피스', finishes: '마감재', wellness: '웰니스',
    decor: '데코', construction: '건축자재'
};
var DMD_IND_KO = {
    architect: '건축사', interior: '인테리어', dealer: '딜러', distributor: '유통',
    contractor: '시공', developer: '시행', student: '학생', other: '기타'
};
var DMD_SRC_KO = {
    'sourcing-page': '소싱 문의', 'brand-page': '브랜드 쪽', 'product-page': '제품 쪽',
    'contact-page': '연락처', unknown: '경로 미상'
};

function dmd_label(map, key) {
    var ko = map[key];
    return admLang() === 'ko' ? (ko || key) : key;
}

function dmd_msg(en, ko, isErr) {
    var el = document.getElementById('dmdMsg');
    if (!el) return;
    el.setAttribute('data-en', en);
    el.setAttribute('data-ko', ko);
    el.textContent = admLang() === 'ko' ? ko : en;
    el.classList.toggle('err', !!isErr);
}

function dmd_render(el) {
    if (!el) return;
    el.innerHTML =
        '<div class="adm-head">' +
          '<h2 data-en="Korean Demand" data-ko="한국 수요">' + escapeHtml(t('Korean Demand', '한국 수요')) + '</h2>' +
          '<p class="adm-sub" data-en="What Korean professionals asked us for. Only real enquiries are counted — our own test records are excluded and listed below."' +
             ' data-ko="한국 전문가가 우리에게 무엇을 물었나. **진짜 문의만** 셉니다 — 우리가 넣은 테스트 기록은 빼고, 뺀 건수를 아래에 적습니다.">' +
             escapeHtml(t('What Korean professionals asked us for. Only real enquiries are counted.',
                          '한국 전문가가 우리에게 무엇을 물었나. 진짜 문의만 셉니다.')) + '</p>' +
        '</div>' +
        '<div id="dmdMsg" class="adm-msg"></div>' +
        '<div id="dmdBody"></div>';
    if (dmd_state.loaded) { dmd_draw(); return; }
    dmd_load();
}

function dmd_load() {
    if (dmd_state.loading) return;
    if (typeof db === 'undefined' || typeof firebase === 'undefined') {
        dmd_msg('Firebase not ready', 'Firebase 준비 안 됨', true);
        return;
    }
    if (typeof auth !== 'undefined' && !auth.currentUser) {
        dmd_msg('Sign in required', '로그인 필요', false);
        var un = auth.onAuthStateChanged(function (u) {
            if (!u) return;
            if (typeof un === 'function') un();
            dmd_load();
        });
        return;
    }
    dmd_state.loading = true;
    dmd_msg('Loading…', '불러오는 중…', false);

    var catMap = {};
    var p1 = db.collection('brands').get().then(function (s) {
        s.forEach(function (d) { var x = d.data() || {}; if (x.category) catMap['b:' + d.id] = String(x.category); });
    }).catch(function () { /* 브랜드를 못 읽어도 소싱 문의는 category 를 갖고 있다 */ });

    var p2 = db.collection('products').get().then(function (s) {
        s.forEach(function (d) { var x = d.data() || {}; if (x.category) catMap['p:' + d.id] = String(x.category); });
    }).catch(function () {});

    var p3 = db.collection('leads').orderBy('createdAt', 'desc').limit(DMD_READ_LIMIT).get()
        .then(function (s) {
            var items = [];
            s.forEach(function (d) { items.push(d.data() || {}); });
            return items;
        });

    Promise.all([p1, p2, p3]).then(function (res) {
        dmd_state.items = res[2] || [];
        dmd_state.catMap = catMap;
        dmd_state.loading = false;
        dmd_state.loaded = true;
        dmd_state.error = false;
        dmd_msg('', '', false);
        dmd_draw();
    }).catch(function (err) {
        dmd_state.loading = false;
        dmd_state.error = true;
        var denied = err && (err.code === 'permission-denied' || /permission/i.test(err.message || ''));
        dmd_msg(denied ? 'Admin permission required to read enquiries.' : 'Could not load enquiries.',
                denied ? '문의를 읽을 어드민 권한이 필요합니다.' : '문의를 불러오지 못했습니다.', true);
    });
}

function dmd_barRows(rank, total, labelMap) {
    if (!rank.length) {
        return '<p class="adm-empty">' + escapeHtml(t('none', '없음')) + '</p>';
    }
    var top = rank[0].n || 1, out = '';
    for (var i = 0; i < rank.length; i++) {
        var r = rank[i];
        var pct = Math.round((r.n / top) * 100);
        var share = total ? Math.round((r.n / total) * 100) : 0;
        out += '<div class="dmd-row">' +
                 '<span class="dmd-k">' + escapeHtml(dmd_label(labelMap, r.key)) + '</span>' +
                 '<span class="dmd-bar"><i style="width:' + pct + '%"></i></span>' +
                 '<span class="dmd-n">' + r.n + '<small> · ' + share + '%</small></span>' +
               '</div>';
    }
    return out;
}

function dmd_draw() {
    var body = document.getElementById('dmdBody');
    if (!body) return;
    var a = dmd_aggregate(dmd_state.items, dmd_state.catMap, Date.now(), dmd_state.days);

    var months = [];
    for (var k in a.byMonth) if (Object.prototype.hasOwnProperty.call(a.byMonth, k)) months.push({ key: k, n: a.byMonth[k] });
    months.sort(function (x, y) { return x.key < y.key ? -1 : 1; });

    var exLines = '';
    for (var i = 0; i < DMD_EXCLUDE.length; i++) {
        var rule = DMD_EXCLUDE[i];
        var n = a.excluded[rule.key] || 0;
        if (!n) continue;
        exLines += '<li>' + escapeHtml(admLang() === 'ko' ? rule.ko : rule.en) + ' — ' + n + '</li>';
    }

    body.innerHTML =
      '<div class="dmd-top">' +
        '<div class="dmd-big"><b>' + a.total + '</b>' +
          '<span>' + escapeHtml(t('real enquiries · last ' + a.windowDays + ' days',
                                  '진짜 문의 · 최근 ' + a.windowDays + '일')) + '</span></div>' +
        '<div class="dmd-note">' +
          escapeHtml(t('read ' + a.readTotal + ' records', '읽은 기록 ' + a.readTotal + '건')) + ' · ' +
          escapeHtml(t('excluded ' + a.excludedTotal, '제외 ' + a.excludedTotal)) + ' · ' +
          escapeHtml(t('outside window ' + a.outOfWindow, '창 밖 ' + a.outOfWindow)) +
          (a.noDate ? ' · ' + escapeHtml(t('no date ' + a.noDate, '날짜 없음 ' + a.noDate)) : '') +
        '</div>' +
      '</div>' +
      '<h3>' + escapeHtml(t('By category', '품목별')) + '</h3>' +
      dmd_barRows(dmd_rank(a.byCategory), a.total, DMD_CAT_KO) +
      (a.unknownCategory ? '<p class="adm-empty">' + escapeHtml(t('category unknown: ' + a.unknownCategory,
          '품목 미상: ' + a.unknownCategory)) + '</p>' : '') +
      '<h3>' + escapeHtml(t('Who asked', '묻는 사람')) + '</h3>' +
      dmd_barRows(dmd_rank(a.byIndustry), a.total, DMD_IND_KO) +
      (a.unknownIndustry ? '<p class="adm-empty">' + escapeHtml(t('not stated: ' + a.unknownIndustry,
          '직군 미기재: ' + a.unknownIndustry)) + '</p>' : '') +
      '<h3>' + escapeHtml(t('Where from', '들어온 경로')) + '</h3>' +
      dmd_barRows(dmd_rank(a.bySource), a.total, DMD_SRC_KO) +
      '<h3>' + escapeHtml(t('By month', '달별')) + '</h3>' +
      dmd_barRows(months, a.total, {}) +
      (exLines ?
        '<h3>' + escapeHtml(t('Not counted — and why', '세지 않은 것 — 그 까닭')) + '</h3>' +
        '<ul class="dmd-ex">' + exLines + '</ul>' +
        '<p class="adm-empty">' + escapeHtml(t(
           'A demand report that counts our own test records is the same mistake as claiming brands we do not have.',
           '우리 테스트 기록을 수요로 세면, 없는 브랜드 수를 광고하는 것과 같은 잘못입니다.')) + '</p>'
       : '');

    if (a.total === 0) {
        dmd_msg('No real enquiries in this window yet. The report is here so the clock starts now.',
                '이 기간에 진짜 문의가 아직 없습니다. 지금부터 쌓이도록 리포트를 먼저 둡니다.', false);
    }
}
