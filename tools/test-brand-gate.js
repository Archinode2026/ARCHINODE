/* `brand-gate.js` 의 순수 함수 시험 — A-688
 *
 * 이 문은 **손님에게 무엇을 보일지**를 정한다. 틀리면 둘 중 하나가 된다:
 *   · 너무 조이면 — 멀쩡한 브랜드의 제품이 사라진다 (브랜드와의 약속을 깬다)
 *   · 너무 풀면  — 내려간 브랜드의 제품이 계속 걸린다 (A-688 그 자체)
 * 그래서 양쪽을 다 센다.
 */
const path = require('path');
const { keepLive, keepLiveDocs } = require(path.join(__dirname, '..', 'brand-gate.js'));

let bad = [];
function eq(label, got, want) {
    const g = JSON.stringify(got), w = JSON.stringify(want);
    if (g !== w) bad.push(label + '\n      받은 것: ' + g + '\n      바란 것: ' + w);
}

const 승인 = { 'brandA': true, 'brandB': true };

eq('① 승인된 브랜드의 제품은 남는다',
   keepLive([{ brandId: 'brandA', name: 'x' }], 승인).map(p => p.name), ['x']);

eq('② 내려간 브랜드의 제품은 빠진다 (A-688 의 그 자리)',
   keepLive([{ brandId: 'gone', name: 'y' }], 승인), []);

eq('③ 브랜드 칸이 아예 없으면 빠진다 — 주인 없는 물건은 안 건다',
   keepLive([{ name: 'z' }], 승인), []);

eq('④ 브랜드 칸이 빈 글자면 빠진다',
   keepLive([{ brandId: '', name: 'z' }], 승인), []);

eq('⑤ 섞여 있으면 승인된 것만 남고 **차례가 그대로다**',
   keepLive([{ brandId: 'brandA', name: 1 }, { brandId: 'gone', name: 2 },
             { brandId: 'brandB', name: 3 }], 승인).map(p => p.name), [1, 3]);

eq('⑥ 명단을 못 받았으면(null) 아무것도 통과시키지 않는다',
   keepLive([{ brandId: 'brandA' }], null), []);

eq('⑦ 빈 명단이면 전부 빠진다 — 승인 브랜드가 0개면 걸 것도 0개다',
   keepLive([{ brandId: 'brandA' }], {}), []);

eq('⑧ 빈 배열은 빈 배열',
   keepLive([], 승인), []);

eq('⑨ 널·undefined 를 줘도 안 터진다',
   keepLive(null, 승인), []);

/* ⑩ 숫자 id 처럼 글자가 아닌 것은 안 믿는다 — 파이어스토어 문서 id 는 글자다.
   `approved[42]` 가 우연히 참이 되는 길을 막는다. */
eq('⑩ 글자가 아닌 brandId 는 빠진다',
   keepLive([{ brandId: 42 }], { 42: true }), []);

/* ⑪ 문서 꼴(QueryDocumentSnapshot)도 같은 규칙 */
const doc = (id, d) => ({ id: id, data: () => d });
eq('⑪ 문서 배열도 같은 규칙으로 걸러진다',
   keepLiveDocs([doc('1', { brandId: 'brandA' }), doc('2', { brandId: 'gone' })], 승인)
       .map(d => d.id), ['1']);

eq('⑫ 문서 꼴에서도 명단이 null 이면 전부 막는다',
   keepLiveDocs([doc('1', { brandId: 'brandA' })], null), []);

if (bad.length) {
    console.log('브랜드 문 시험 — ' + bad.length + '건 어긋남');
    bad.forEach(b => console.log('  - ' + b));
    console.log('결과: 실패');
    process.exit(1);
}
console.log('브랜드 문 시험 — 12가지 모두 뜻대로');
console.log('  승인된 것만 남기고 · 차례를 지키고 · 주인 없는 물건을 안 걸고');
console.log('  명단을 못 받았으면 아무것도 통과시키지 않는다');
console.log('결과: 통과');
