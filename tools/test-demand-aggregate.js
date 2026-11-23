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
var CATMAP = { 'b:oska': 'outdoor', 'p:lamp1': 'lighting' };

console.log('── ① 기본 집계');
var r = agg([
    { category: 'lighting', industry: 'architect', source: 'sourcing-page', createdAt: D(1) },
    { category: 'lighting', industry: 'interior',  source: 'sourcing-page', createdAt: D(10) },
    { category: 'finishes', industry: 'architect', source: 'sourcing-page', createdAt: D(40) }
], CATMAP, NOW, 90);
eq('합계 3', r.total, 3);
eq('품목별', r.byCategory, { lighting: 2, finishes: 1 });
eq('직군별', r.byIndustry, { architect: 2, interior: 1 });
eq('제외 0', r.excludedTotal, 0);

console.log('── ② 품목을 지도에서 끌어온다 (브랜드·제품 문의)');
r = agg([
    { brandId: 'oska',  industry: 'dealer', source: 'brand-page',   createdAt: D(2) },
    { productId: 'lamp1', industry: 'architect', source: 'product-page', createdAt: D(3) },
    { brandId: 'nope',  industry: 'architect', source: 'brand-page',   createdAt: D(4) }
], CATMAP, NOW, 90);
eq('지도로 품목 해결', r.byCategory, { outdoor: 1, lighting: 1 });
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
    { category: 'lighting', createdAt: D(1), hp: 'bot-filled' },
    { category: 'lighting', createdAt: D(1), name: '[테스트-브론즈] QA BRAND' },
    { category: 'lighting', createdAt: D(1), company: 'vividlyvibe' },
    { category: 'lighting', createdAt: D(1), email: 'x@archinode.org' },
    { category: 'lighting', createdAt: D(1), name: '진짜 손님' }
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
if (fails) { console.log('실패: ' + fails + '건 / ' + ran + '건 중'); process.exit(1); }
console.log('통과: ' + ran + '건 전부');
