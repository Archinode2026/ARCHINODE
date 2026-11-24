/* ─────────────────────────────────────────────────────────────────────────
   view-demand.js — 운영 > 한국 수요 (2026-11-23)
   정본: docs/설계/수요증거-2026-11-23.md

   운영자 결정(2026-11-23): 「한국 바이어 쪽은 자산이다. 유럽 브랜드가 입점할
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
/* A-680: 분류는 **여럿일 수 있다.** 브랜드 문서의 `category` 는 배열이다
   (A-415 가 「언제나 배열로 쓴다」고 못 박았다 — 브랜드가 욕실과 마감재를
   둘 다 고를 수 있다). 전에는 `String(x.category)` 로 묶어 `"Bathroom,Finishes"`
   라는 **없는 분류**를 만들었다. 이제 목록으로 다룬다.
   대소문자도 흡수한다 — 자료는 대문자지만 어딘가에서 소문자가 들어와도
   같은 칸으로 세는 편이 낫다. 모르는 값은 **그대로 둔다**(화면에 그대로 떠서
   눈에 띈다 — 조용히 「기타」로 삼키면 어휘가 갈라진 것을 아무도 모른다). */
function dmd_canonCat(v) {
    var t = String(v == null ? '' : v).trim();
    if (!t) return '';
    for (var k in DMD_CAT_KO) {
        if (Object.prototype.hasOwnProperty.call(DMD_CAT_KO, k) &&
            k.toLowerCase() === t.toLowerCase()) return k;
    }
    return t;
}

function dmd_catsOf(d, catMap) {
    var raw = '';
    if (d && d.category) raw = d.category;
    else if (d && d.productId && catMap && catMap['p:' + d.productId]) raw = catMap['p:' + d.productId];
    else if (d && d.brandId && catMap && catMap['b:' + d.brandId]) raw = catMap['b:' + d.brandId];
    var list = (Object.prototype.toString.call(raw) === '[object Array]') ? raw : (raw ? [raw] : []);
    var out = [], seen = {};
    for (var i = 0; i < list.length; i++) {
        var c = dmd_canonCat(list[i]);
        if (c && !seen[c]) { seen[c] = 1; out.push(c); }
    }
    return out;
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
/* onlyCategory 를 주면 **그 품목만** 센다 — 브랜드에게 보낼 한 장이 쓴다(A-667).
   창 밖·제외 건수는 그대로 전체 기준이다. 그래야 「무엇을 세지 않았는지」가
   품목을 좁혀도 같은 뜻을 유지한다. */
function dmd_aggregate(leads, catMap, nowMs, days, onlyCategory) {
    var win = (days || DMD_WINDOW_DAYS) * 86400000;
    var from = nowMs - win;
    var out = {
        windowDays: days || DMD_WINDOW_DAYS,
        total: 0,
        byCategory: {}, byIndustry: {}, bySource: {}, byMonth: {},
        unknownCategory: 0, unknownIndustry: 0,
        multiCategory: 0,                      /* A-680: 분류를 여럿 가진 건 */
        excluded: {}, excludedTotal: 0,
        noDate: 0, outOfWindow: 0,
        /* A-667: 유형별(견적·브랜드 문의·소싱 ...). 「한국에서 못 찾아 들여와
           달라」는 요청이 sourcing 이고, 그게 브랜드가 가장 듣고 싶어 하는 줄이다. */
        byType: {},
        otherCategory: 0,
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

        /* A-680: 한 건이 분류를 여럿 가질 수 있으므로 **각 칸에 센다.**
           그래서 byCategory 의 합은 total 보다 클 수 있다 — 화면이 그 사실을
           말한다. 좁혀 보기(onlyCategory)는 「그 분류를 포함하는가」로 본다. */
        var cats = dmd_catsOf(d, catMap);
        if (onlyCategory) {
            var hit = false;
            for (var ci = 0; ci < cats.length; ci++) if (cats[ci] === onlyCategory) { hit = true; break; }
            if (!hit) { out.otherCategory++; continue; }
        }

        out.total++;

        if (cats.length) {
            for (var cj = 0; cj < cats.length; cj++) out.byCategory[cats[cj]] = (out.byCategory[cats[cj]] || 0) + 1;
            if (cats.length > 1) out.multiCategory++;
        } else out.unknownCategory++;

        var tp = d.type ? String(d.type) : 'unknown';
        out.byType[tp] = (out.byType[tp] || 0) + 1;

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

var DMD_SRC_EN = {
    'sourcing-page': 'Sourcing enquiry', 'brand-page': 'Brand page', 'product-page': 'Product page',
    'admin-manual': 'Entered by ARCHINODE', 'contact-page': 'Contact form', unknown: 'Source not recorded'
};
/* A-680: 이 지도를 **순수 함수 구역으로 올렸다.** 전에는 화면 구역(284행)에
   있었는데 `dmd_canonCat` 이 그걸 보고, 내보내기 줄은 그보다 위에 있었다 —
   그래서 `module.exports.DMD_CAT_KO` 가 **undefined** 였고 시험이 터졌다.
   순수 함수가 기대는 자료는 순수 함수 옆에 있어야 한다. */
/* A-680(2026-11-24): 키를 **자료의 꼴**로 바꿨다. 전에는 소문자였는데 사이트가
   실제로 저장하는 값은 대문자다 — 소싱 폼의 `srcCategory`(Furniture …), 제품
   문서의 `prodCategory`, 브랜드 문서의 체크박스 값, 그리고 공개 카테고리 쪽이
   `where('category','==',…)` 로 묻는 값까지 전부. 소문자 지도로는 **한 건도
   안 맞았다** — 어드민 화면에는 영문 키가 그대로 뜨고, 브랜드에게 보낼 한 장은
   **모든 품목에서 0** 을 보고한다. 고리를 끝까지 따라가 보기 전에는 안 보였다. */
var DMD_CAT_KO = {
    Furniture: '가구', Bathroom: '욕실', Outdoor: '아웃도어', Lighting: '조명',
    Kitchen: '주방', Office: '오피스', Finishes: '마감재', Wellness: '웰니스',
    Decor: '데코', Construction: '건축자재'
};

var DMD_CAT_EN = {
    Furniture: 'Furniture', Bathroom: 'Bathroom', Outdoor: 'Outdoor', Lighting: 'Lighting',
    Kitchen: 'Kitchen', Office: 'Office', Finishes: 'Finishes', Wellness: 'Wellness',
    Decor: 'Decor', Construction: 'Construction'
};

/* ── 많은 것부터 정렬한 배열로 ── */
function dmd_rank(obj) {
    var a = [];
    for (var k in obj) if (Object.prototype.hasOwnProperty.call(obj, k)) a.push({ key: k, n: obj[k] });
    a.sort(function (x, y) { return y.n - x.n || (x.key < y.key ? -1 : 1); });
    return a;
}


/* ═══ 브랜드에게 보낼 한 장 (A-667) ═══════════════════════════════════════
   `docs/설계/수요증거-2026-11-23.md` §4-ㄴ 가 설계한 다섯 줄 중 **넷이 지금
   못 나온다** — 검색 횟수(계수기 미결) · 빈손 건수(2단계, 변호사) ·
   직군(A-666, 공개 폼이 안 받는다) · 기사 조회수(analytics-loader.js 의
   GA_ID 가 null). 그래서 **`leads` 만으로 참인 줄**로 다시 세웠다.

   왜 어드민에 두는가: 규칙상 브랜드는 **자기에게 배정된** 리드만 읽는다
   (brandId == uid 그리고 status in assigned·contacted·closed). 품목 전체의
   집계는 브랜드가 읽을 수 없고, 열려면 규칙을 고쳐 **따로 게시**해야 한다.
   그래서 이 한 장은 우리가 뽑아 우리가 보낸다 — 규칙 재게시도, 처리방침
   변경도 필요 없다.

   무엇을 **담지 않는가**: 제품명·브랜드명을 담지 않는다. 그 이름들은 대개
   **다른 브랜드의 것**이고, 구독 브랜드에게 남의 제품이 얼마나 문의됐는지
   알려 주는 것은 경쟁 정보다. 그걸 줄지는 운영자가 정할 일이고, 기본은
   「수만 준다」로 둔다. 숫자만 담으면 개인정보도 아니다.
   ═══════════════════════════════════════════════════════════════════════ */
function dmd_sheet(leads, catMap, nowMs, days, category) {
    var a = dmd_aggregate(leads, catMap, nowMs, days, category);
    var keys = [];
    for (var k in a.byMonth) if (Object.prototype.hasOwnProperty.call(a.byMonth, k)) keys.push(k);
    keys.sort();
    var months = [];
    for (var i = 0; i < keys.length; i++) months.push({ key: keys[i], n: a.byMonth[keys[i]] });
    return {
        category: category || '',
        windowDays: a.windowDays,
        enquiries: a.total,
        sourcing: a.byType['sourcing'] || 0,
        bySource: dmd_rank(a.bySource),
        byMonth: months,
        excludedTotal: a.excludedTotal,
        readTotal: a.readTotal
    };
}

/* 영문 평문 — 운영자가 메일에 그대로 붙이실 자리.
   브랜드는 영문으로 읽는다. 숫자를 올려 부르지 않는다는 말을 **마지막 줄에**
   둔다 — 작은 진짜 숫자가 큰 가짜 숫자보다 세다는 것이 이 장의 값이다. */
function dmd_sheetText(sheet, categoryEn) {
    function pad(label, n) {
        var L = String(label), N = String(n);
        var gap = 46 - L.length - N.length;
        return L + (gap > 1 ? new Array(gap + 1).join(' ') : '  ') + N;
    }
    var L = [];
    L.push('Korean demand — ' + (categoryEn || sheet.category || 'all categories'));
    L.push('Last ' + sheet.windowDays + ' days, as recorded by ARCHINODE');
    L.push('');
    L.push(pad('Enquiries from Korean professionals', sheet.enquiries));
    L.push(pad('of which: could not find it in Korea', sheet.sourcing));
    if (sheet.bySource.length) {
        L.push('');
        L.push('Where they came from');
        for (var i = 0; i < sheet.bySource.length; i++) {
            /* 괄호가 필요하다 — '  ' + undefined 는 "  undefined" 라서 참이고,
               괄호 없이 || 를 쓰면 폴백이 **절대 안 돈다**. 모르는 경로 키가
               들어온 날 브랜드에게 보낼 메일에 undefined 가 찍힌다. */
            var sk = sheet.bySource[i].key;
            L.push(pad('  ' + (DMD_SRC_EN[sk] || sk), sheet.bySource[i].n));
        }
    }
    if (sheet.byMonth.length) {
        L.push('');
        L.push('By month');
        for (var j = 0; j < sheet.byMonth.length; j++) L.push(pad('  ' + sheet.byMonth[j].key, sheet.byMonth[j].n));
    }
    L.push('');
    if (sheet.excludedTotal) {
        L.push('Not counted: ' + sheet.excludedTotal + ' records (our own tests, bots, internal).');
    }
    L.push('We do not round these numbers up.');
    return L.join('\n');
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { dmd_aggregate: dmd_aggregate, dmd_ms: dmd_ms, dmd_catsOf: dmd_catsOf, dmd_canonCat: dmd_canonCat, dmd_rank: dmd_rank,
                       dmd_sheet: dmd_sheet, dmd_sheetText: dmd_sheetText, DMD_EXCLUDE: DMD_EXCLUDE,
                       DMD_SRC_EN: DMD_SRC_EN, DMD_CAT_EN: DMD_CAT_EN, DMD_CAT_KO: DMD_CAT_KO };
}

/* ═══════════════════════════════════════════════════════════════════════
   화면 — 여기부터는 로그인이 있어야 도는 부분이다.
   제가 눈으로 못 보는 자리이므로, 판단은 전부 위의 순수 함수에 두고
   여기서는 **그린 것만** 한다. (tools/test-demand-aggregate.js 가 위를 검증한다)
   ═══════════════════════════════════════════════════════════════════════ */

/* A-670(2026-11-24): 이 지도가 공개 폼의 어휘와 **달랐다** — distributor·contractor
   를 갖고 있고 landscape·furniture·construction 이 없었다. 그 세 값이 들어오면
   화면에 영문 키가 그대로 뜬다. 하나의 어휘는 세 곳에 같은 값으로 있어야 한다:
   `auth/signup.html` 의 #signupIndustry · `admin/js/view-leads.js` 의
   LEAD_INDUSTRIES · 그리고 여기. A-498 이 말한 것과 같은 규칙이다 —
   **공개 폼의 값과 어드민의 이름표는 함께 고친다.** */
var DMD_IND_KO = {
    architect: '건축', interior: '인테리어 디자인', landscape: '조경',
    furniture: '가구 디자인', construction: '건설', dealer: '딜러 / 유통',
    developer: '부동산 개발', student: '학생', other: '기타'
};
/* A-681(2026-11-24): 이 지도에 **`admin-manual` 이 없었다.** 승리님이 전화·전시회
   리드를 손으로 넣는 경로인데(`view-leads.js` 가 그 값을 담는다) 수요 리포트에는
   영문 날글자로 떴다. 그리고 `contact-page` 는 **아무도 담지 않는 추측 키**인데
   어드민 리드 화면은 같은 것을 `contact` 로 적고 있었다 — 추측이 두 쪽에서
   다르게 갈렸다. 두 지도의 키를 같게 맞춘다(A-498 과 같은 규칙).
   `unknown` 은 담기는 값이 아니라 **빈 값에 붙이는 이름**이다 — 그래서 이 하나만
   어드민 쪽에 없어도 된다. */
var DMD_SRC_KO = {
    'sourcing-page': '소싱 문의', 'brand-page': '브랜드 쪽', 'product-page': '제품 쪽',
    'admin-manual': '수동 등록(어드민)', 'contact-page': '문의 폼', unknown: '경로 미상'
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
        s.forEach(function (d) { var x = d.data() || {}; if (x.category) catMap['b:' + d.id] = x.category;   /* A-680: 배열일 수 있다 — String() 으로 묶지 않는다 */ });
    }).catch(function () { /* 브랜드를 못 읽어도 소싱 문의는 category 를 갖고 있다 */ });

    var p2 = db.collection('products').get().then(function (s) {
        s.forEach(function (d) { var x = d.data() || {}; if (x.category) catMap['p:' + d.id] = x.category;   /* A-680 */ });
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
      /* A-670(2026-11-24): 이제 **받는다** — 공개 폼 세 곳에 업종 선택 칸을 넣고
         처리방침 제3조도 같은 커밋으로 고쳤다(운영자 결정: 선택 칸).
         그래서 이 자리의 문구가 바뀌었다. A-666 때는 「아예 안 받는다」였는데
         지금은 「아직 아무도 답하지 않았다」다 — 둘은 다른 말이고, 화면이
         그걸 섞으면 우리가 수요를 잘못 읽는다.
         옛 주석(A-666): 공개 폼 세 곳이 industry 를 빈 문자열로 담는다
         (brands/view.html 1061 · products/view.html 1131 · sourcing-inquiry.html 516).
         그래서 이 집계는 구조적으로 빈다 — 「미기재」가 아니라 **아예 안 받는다**다.
         전에는 「직군 미기재: N」만 떠서 손님이 답을 안 한 것처럼 읽혔다. 그 말을 믿고
         이 숫자를 수요 근거로 쓰면 안 된다. 화면이 이유를 말하게 한다.
         받으려면 처리방침 제3조(수집 항목)부터 고쳐야 한다 — 거기 업종은 전문가
         회원가입에만 있다. 운영자와 변호사 몫이다. */
      (Object.keys(a.byIndustry).length === 0
        ? '<p class="adm-empty">' + escapeHtml(t(
              'Nobody has answered yet. The field is optional, so it fills in only as people choose to say.',
              '아직 아무도 답하지 않았습니다. 선택 칸이라 답해 주신 분만큼만 채워집니다.')) + '</p>'
        : dmd_barRows(dmd_rank(a.byIndustry), a.total, DMD_IND_KO) +
          (a.unknownIndustry ? '<p class="adm-empty">' + escapeHtml(t('not stated: ' + a.unknownIndustry,
              '직군 미기재: ' + a.unknownIndustry)) + '</p>' : '')) +
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
       : '') +
      /* A-667: 브랜드에게 보낼 한 장. 그릴 것만 하고 판단은 dmd_sheet 에 있다. */
      '<h3>' + escapeHtml(t('One page to send a brand', '브랜드에게 보낼 한 장')) + '</h3>' +
      '<p class="adm-empty">' + escapeHtml(t(
          'Pick a category. The text below is English and ready to paste into an email. It carries no product or brand names — counts only.',
          '품목을 고르세요. 아래 글은 영문이고 메일에 그대로 붙이실 수 있습니다. 제품명·브랜드명은 담지 않습니다 — 수만 담습니다.')) + '</p>' +
      '<div class="dmd-sheet-bar">' +
        '<select id="dmdSheetCat" onchange="dmd_drawSheet()">' + dmd_catOptions() + '</select>' +
        /* A-667: 클래스는 **어드민이 실제로 쓰는 것**이다. 처음에 adm-btn 이라고
           썼는데 그런 클래스는 CSS 에 없다 — 그럴듯한 이름을 지어내면 단추가
           맨 글자로 뜬다. 어드민 전역에서 쓰는 것은 act-btn 이다(쓰임 60여 곳). */
        '<button type="button" class="act-btn" onclick="dmd_copySheet()">' +
          escapeHtml(t('Copy', '복사')) + '</button>' +
        '<span id="dmdSheetMsg" class="adm-empty"></span>' +
      '</div>' +
      '<textarea id="dmdSheetText" class="dmd-sheet" rows="18" readonly></textarea>';

    dmd_drawSheet();

    if (a.total === 0) {
        dmd_msg('No real enquiries in this window yet. The report is here so the clock starts now.',
                '이 기간에 진짜 문의가 아직 없습니다. 지금부터 쌓이도록 리포트를 먼저 둡니다.', false);
    }
}

/* ── 브랜드에게 보낼 한 장: 화면 쪽 (A-667) ──────────────────────────────
   로그인이 있어야 열리는 자리라 제가 눈으로 못 본다. 그래서 여기서는
   고른 값을 순수 함수에 넘기고 **나온 글자를 그대로 칸에 넣는 것**만 한다. */
function dmd_catOptions() {
    var html = '<option value="">' + escapeHtml(t('All categories', '전체 품목')) + '</option>';
    for (var k in DMD_CAT_EN) {
        if (!Object.prototype.hasOwnProperty.call(DMD_CAT_EN, k)) continue;
        var sel = (dmd_state.sheetCat === k) ? ' selected' : '';
        html += '<option value="' + escapeHtml(k) + '"' + sel + '>' +
                escapeHtml(admLang() === 'ko' ? (DMD_CAT_KO[k] || k) : DMD_CAT_EN[k]) + '</option>';
    }
    return html;
}

function dmd_drawSheet() {
    var sel = document.getElementById('dmdSheetCat');
    var box = document.getElementById('dmdSheetText');
    if (!box) return;
    var cat = sel ? sel.value : (dmd_state.sheetCat || '');
    dmd_state.sheetCat = cat;
    var sh = dmd_sheet(dmd_state.items, dmd_state.catMap, Date.now(), dmd_state.days, cat || null);
    box.value = dmd_sheetText(sh, cat ? DMD_CAT_EN[cat] : '');
    var msg = document.getElementById('dmdSheetMsg');
    if (msg) {
        msg.textContent = sh.enquiries === 0
            ? t('0 enquiries — send it anyway only if you want to show the clock started.',
                '문의 0건 — 「지금부터 셉니다」를 보여 주실 때만 보내세요.')
            : '';
    }
}

function dmd_copySheet() {
    var box = document.getElementById('dmdSheetText');
    var msg = document.getElementById('dmdSheetMsg');
    if (!box) return;
    function done(ok) {
        if (!msg) return;
        msg.textContent = ok ? t('Copied', '복사했습니다')
                             : t('Could not copy — select the text and copy it yourself.',
                                 '복사하지 못했습니다 — 글을 직접 선택해 복사해 주세요.');
    }
    try {
        box.select();
        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(box.value).then(function () { done(true); }, function () { done(false); });
        } else {
            done(!!(document.execCommand && document.execCommand('copy')));
        }
    } catch (e) { done(false); }
}
