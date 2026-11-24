/* tools/test-demand-aggregate.js — dmd_aggregate 를 합성 데이터로 검증한다.
   어드민 화면은 로그인이 있어야 열려서 사람이 아니면 못 본다. 그래서 집계를
   순수 함수로 떼어 두고 여기서 센다. (검수대장 A-443 — 센 것이 없으면 통과가 아니다) */
var path = require('path');
var M = require(process.env.DMD_PATH || path.join(__dirname, '..', 'admin', 'js', 'view-demand.js'));
var agg = M.dmd_aggregate;

var fails = 0, ran = 0;
function eq(label, got, want) {
    ran++;
    var g = JSON.stringify(got), w = JSON.stringify(want);
    if (g !== w) { fails++; console.log('   ✗ ' + label + '\n       받은 것: ' + g + '\n       바란 것: ' + w); }
    else console.log('   · ' + label);
}

var NOW = Date.UTC(2026, 10, 23, 12, 0, 0);          // 2026-11-23
var D = function (daysAgo) { return NOW - daysAgo * 86400000; };
/* A-680: 자료의 실제 꼴은 **대문자**다(소싱 폼 srcCategory · 제품 prodCategory ·
   브랜드 체크박스 · 공개 카테고리 질의 전부). 그리고 브랜드는 분류가 **여럿**일
   수 있어 배열이다(A-415). 시험 자료를 실제 꼴로 맞춘다 — 전에는 소문자
   단일값이어서 **틀린 세계를 시험하고 있었다.** */
var CATMAP = { 'b:oska': ['Outdoor', 'Finishes'], 'p:lamp1': 'Lighting' };

console.log('── ① 기본 집계');
var r = agg([
    { category: 'Lighting', industry: 'architect', source: 'sourcing-page', createdAt: D(1) },
    { category: 'Lighting', industry: 'interior',  source: 'sourcing-page', createdAt: D(10) },
    { category: 'Finishes', industry: 'architect', source: 'sourcing-page', createdAt: D(40) }
], CATMAP, NOW, 90);
eq('합계 3', r.total, 3);
eq('품목별', r.byCategory, { Lighting: 2, Finishes: 1 });
eq('직군별', r.byIndustry, { architect: 2, interior: 1 });
eq('제외 0', r.excludedTotal, 0);

console.log('── ② 품목을 지도에서 끌어온다 (브랜드·제품 문의)');
r = agg([
    { brandId: 'oska',  industry: 'dealer', source: 'brand-page',   createdAt: D(2) },
    { productId: 'lamp1', industry: 'architect', source: 'product-page', createdAt: D(3) },
    { brandId: 'nope',  industry: 'architect', source: 'brand-page',   createdAt: D(4) }
], CATMAP, NOW, 90);
eq('지도로 품목 해결 — 브랜드 배열은 **두 칸에** 센다', r.byCategory, { Outdoor: 1, Finishes: 1, Lighting: 1 });
eq('지도에 없으면 unknown', r.unknownCategory, 1);

console.log('── ③ 창 밖·날짜 없음');
r = agg([
    { category: 'kitchen', createdAt: D(89) },
    { category: 'kitchen', createdAt: D(91) },      // 창 밖
    { category: 'kitchen' },                        // 날짜 없음
    { category: 'kitchen', createdAt: NOW + 86400000 }  // 미래
], CATMAP, NOW, 90);
eq('창 안만 센다', r.total, 1);
eq('창 밖 2건', r.outOfWindow, 2);
eq('날짜 없음 1건', r.noDate, 1);

console.log('── ④ ★ 우리 손으로 만든 것은 세지 않는다');
r = agg([
    { category: 'Lighting', createdAt: D(1), hp: 'bot-filled' },
    { category: 'Lighting', createdAt: D(1), name: '[테스트-브론즈] QA BRAND' },
    { category: 'Lighting', createdAt: D(1), company: 'vividlyvibe' },
    { category: 'Lighting', createdAt: D(1), email: 'x@archinode.org' },
    { category: 'Lighting', createdAt: D(1), name: '진짜 손님' }
], CATMAP, NOW, 90);
eq('진짜만 1건', r.total, 1);
eq('제외 4건', r.excludedTotal, 4);
/* vividlyvibe 는 승리님이 테스트로 쓰신 계정이므로 'testmark' 가 아니라
   'internal'(우리가 넣은 것)로 잡히는 것이 맞다 — 처음에 내가 기대값을 틀리게
   적었고 이 검사가 잡아 줬다. 규칙은 순서대로 보고 먼저 맞는 하나로 센다. */
eq('까닭별 제외', r.excluded, { honeypot: 1, testmark: 1, internal: 2 });

console.log('── ⑤ 시각 꼴을 다 받는다');
eq('Timestamp', M.dmd_ms({ toDate: function () { return new Date(NOW); } }), NOW);
eq('seconds',   M.dmd_ms({ seconds: NOW / 1000 }), NOW);
eq('Date',      M.dmd_ms(new Date(NOW)), NOW);
eq('숫자',       M.dmd_ms(NOW), NOW);
eq('없음',       M.dmd_ms(null), null);
eq('쓰레기',     M.dmd_ms('아무거나'), null);

console.log('── ⑥ 빈 입력에서 터지지 않는다');
r = agg([], CATMAP, NOW, 90);
eq('빈 입력 합계 0', r.total, 0);
eq('빈 입력 읽은 수 0', r.readTotal, 0);
r = agg(null, CATMAP, NOW, 90);
eq('null 입력', r.total, 0);

console.log('── ⑦ 달별 추이');
r = agg([
    { category: 'x', createdAt: Date.UTC(2026, 8, 15) },
    { category: 'x', createdAt: Date.UTC(2026, 9, 15) },
    { category: 'x', createdAt: Date.UTC(2026, 9, 20) }
], CATMAP, NOW, 90);
eq('달별', r.byMonth, { '2026-09': 1, '2026-10': 2 });

console.log('── ⑧ 많은 것부터 정렬');
eq('rank', M.dmd_rank({ a: 1, b: 5, c: 5 }), [{ key: 'b', n: 5 }, { key: 'c', n: 5 }, { key: 'a', n: 1 }]);

console.log('');

/* ─────────────────────────────────────────────────────────────────────
   브랜드에게 보낼 한 장 (A-667) — dmd_sheet / dmd_sheetText
   ───────────────────────────────────────────────────────────────────── */
var sheet = M.dmd_sheet, sheetText = M.dmd_sheetText;

console.log('\n── ⑨ 한 장: 품목으로 좁힌다');
var SH = [
    { type: 'quote',         productId: 'lamp1', source: 'product-page',  createdAt: D(5)  },
    { type: 'sourcing',      category: 'Lighting', source: 'sourcing-page', createdAt: D(10) },
    { type: 'sourcing',      category: 'Lighting', source: 'sourcing-page', createdAt: D(40) },
    { type: 'brand-inquiry', brandId: 'oska',   source: 'brand-page',    createdAt: D(7)  },  // outdoor
    { type: 'quote',         category: 'Finishes', source: 'product-page', createdAt: D(8)  },
    { type: 'quote',         category: 'Lighting', source: 'sourcing-page', createdAt: D(200) }, // 창 밖
    { type: 'quote',         category: 'Lighting', hp: 'bot',            createdAt: D(3)  }   // 봇
];
var s1 = sheet(SH, CATMAP, NOW, 90, 'Lighting');
eq('조명만 3건',            s1.enquiries, 3);
eq('그중 소싱 2건',          s1.sourcing, 2);
eq('다른 품목은 안 센다',     s1.category, 'Lighting');
eq('제외는 전체 기준 1건',    s1.excludedTotal, 1);
eq('읽은 수는 전체 7건',      s1.readTotal, 7);
eq('경로 정렬',             s1.bySource, [{ key: 'sourcing-page', n: 2 }, { key: 'product-page', n: 1 }]);
eq('달은 오래된 것부터',      s1.byMonth.map(function (x) { return x.key; }), ['2026-10', '2026-11']);

console.log('\n── ⑩ 한 장: 빈 결과도 거짓말하지 않는다');
var s0 = sheet(SH, CATMAP, NOW, 90, 'Kitchen');
eq('주방 0건',              s0.enquiries, 0);
eq('주방 소싱 0건',          s0.sourcing, 0);
eq('경로 빈 배열',           s0.bySource, []);
eq('달 빈 배열',             s0.byMonth, []);

console.log('\n── ⑪ 한 장: 품목을 안 주면 전부 센다');
var sAll = sheet(SH, CATMAP, NOW, 90, null);
eq('전부 5건',              sAll.enquiries, 5);
eq('전부 소싱 2건',          sAll.sourcing, 2);

console.log('\n── ⑫ 영문 평문');
var txt = sheetText(s1, M.DMD_CAT_EN['Lighting']);
eq('머리글',                txt.split('\n')[0], 'Korean demand — Lighting');
eq('기간 줄',               txt.split('\n')[1], 'Last 90 days, as recorded by ARCHINODE');
eq('문의 수 줄 있나',        /Enquiries from Korean professionals\s+3/.test(txt), true);
eq('빈손 줄 있나',           /could not find it in Korea\s+2/.test(txt), true);
eq('제외 밝히나',            /Not counted: 1 records/.test(txt), true);
eq('올려 부르지 않는다',      /We do not round these numbers up\.$/.test(txt), true);
eq('이름을 담지 않는다',      /lamp1|oska/.test(txt), false);

console.log('\n── ⑬ 모르는 경로 키가 들어와도 undefined 를 찍지 않는다');
var sU = sheet([{ type: 'quote', category: 'Lighting', source: 'telepathy', createdAt: D(2) }],
               CATMAP, NOW, 90, 'Lighting');
var tU = sheetText(sU, 'Lighting');
eq('모르는 경로 그대로',      /telepathy\s+1/.test(tU), true);
eq('undefined 없음',        /undefined/.test(tU), false);


/* A-667: 이 요약은 **반드시 파일 맨 끝**에 있어야 한다. 전에는 93행에 있어서,
   그 뒤에 시험을 덧붙이면 「통과: N건 전부」가 **새 시험보다 먼저** 찍히고
   종료 코드도 0 이 됐다. 실패를 못 보는 통과였다 — 0 을 기뻐하지 말고 의심한다. */

/* ─────────────────────────────────────────────────────────────────────
   A-680 — 분류 값의 **꼴**. 고리를 끝까지 따라가 보니 여기서 끊겨 있었다.
   ───────────────────────────────────────────────────────────────────── */
console.log('\n── \u2467 분류 값의 꼴: 자료는 대문자다');
r = agg([{ category: 'Furniture', createdAt: D(1) }], {}, NOW, 90);
eq('대문자 그대로 센다', r.byCategory, { Furniture: 1 });
eq('미상 0', r.unknownCategory, 0);

console.log('\n── \u2468 대소문자를 흡수한다');
r = agg([{ category: 'furniture', createdAt: D(1) },
         { category: 'FURNITURE', createdAt: D(2) },
         { category: '  Furniture  ', createdAt: D(3) }], {}, NOW, 90);
eq('셋이 한 칸으로', r.byCategory, { Furniture: 3 });

console.log('\n── \u2469 브랜드 배열 — 두 칸에 센다');
r = agg([{ brandId: 'oska', createdAt: D(1) }], { 'b:oska': ['Bathroom', 'Finishes'] }, NOW, 90);
eq('합계는 1건', r.total, 1);
eq('두 칸에 센다', r.byCategory, { Bathroom: 1, Finishes: 1 });
eq('여럿 표시 1건', r.multiCategory, 1);

console.log('\n── \u246a 배열을 String() 으로 묶지 않는다');
eq('묶인 이름이 안 생긴다', Object.keys(r.byCategory).indexOf('Bathroom,Finishes'), -1);

console.log('\n── \u246b 모르는 값은 삼키지 않고 그대로 둔다');
r = agg([{ category: 'Spaceship', createdAt: D(1) }], {}, NOW, 90);
eq('그대로 뜬다', r.byCategory, { Spaceship: 1 });
eq('미상으로 안 센다', r.unknownCategory, 0);

console.log('\n── \u246c 빈 값은 미상으로');
r = agg([{ createdAt: D(1) }, { category: '', createdAt: D(2) },
         { category: [], createdAt: D(3) }], {}, NOW, 90);
eq('미상 3건', r.unknownCategory, 3);
eq('품목별 비어 있다', r.byCategory, {});

console.log('\n── \u246d 한 장: 배열 브랜드가 그 분류로 좁혀도 잡힌다');
var SH2 = [{ type: 'sourcing', category: 'Bathroom', source: 'sourcing-page', createdAt: D(2) },
           { type: 'brand-inquiry', brandId: 'oska', source: 'brand-page', createdAt: D(3) }];
var sB = sheet(SH2, { 'b:oska': ['Bathroom', 'Finishes'] }, NOW, 90, 'Bathroom');
eq('욕실 2건', sB.enquiries, 2);
eq('그중 소싱 1건', sB.sourcing, 1);
var sF = sheet(SH2, { 'b:oska': ['Bathroom', 'Finishes'] }, NOW, 90, 'Finishes');
eq('마감재 1건', sF.enquiries, 1);
var sK = sheet(SH2, { 'b:oska': ['Bathroom', 'Finishes'] }, NOW, 90, 'Kitchen');
eq('주방 0건', sK.enquiries, 0);

console.log('\n── \u246e 소싱 폼이 담는 열 값이 전부 지도에 있다');
['Furniture','Bathroom','Outdoor','Lighting','Kitchen','Office','Finishes','Wellness','Decor','Construction']
  .forEach(function (c) {
    /* 늘 참이 되는 조건을 쓰면 시험이 아니다 — 처음에 require('path') 를
       섞어 넣어 그렇게 됐다. 지도에 그 키가 **있는지**만 본다. */
    eq('지도에 ' + c, [typeof M.DMD_CAT_EN[c], typeof M.DMD_CAT_KO[c]], ['string', 'string']);
  });

if (fails) { console.log('실패: ' + fails + '건 / ' + ran + '건 중'); process.exit(1); }
console.log('통과: ' + ran + '건 전부');