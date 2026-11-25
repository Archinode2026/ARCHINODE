// ═══════════════════════════════════════════════════════════
// ARCHINODE — 브랜드가 살아 있는지 보는 문 (A-688)
// ═══════════════════════════════════════════════════════════
// 왜 있나
// -------
// `brands.html` 은 `brands.status == 'approved'` 로 거른다. 그래서 내린
// 브랜드는 디렉터리에서 사라진다. 그런데 분류 쪽과 제품 상세 쪽은
// **`products.status` 만** 보고 브랜드 상태를 한 번도 안 봤다. 그 결과
// 내린 브랜드의 제품이 그 브랜드 이름을 달고 그대로 전시됐다
// (2026-11-25 라이브: 가구 카테고리의 전체 재고가 내려간 테스트 브랜드의
//  제품 둘이었다).
//
// 테스트 자료만의 문제가 아니다. 진짜 브랜드와 계약이 끝나 내릴 때도
// 그 제품들은 그대로 걸려 있었다. 우리가 브랜드에게 파는 것이 **전시**인데
// 전시를 거두는 스위치가 없었던 셈이다.
//
// 어떻게 거르나
// -------------
// 승인된 브랜드의 id 를 한 번 받아 두고, 제품의 `brandId` 가 그 안에 있는
// 것만 남긴다. 파이어스토어는 조인이 없고, 내려간 브랜드 문서는 공개 읽기가
// 막혀 있을 수 있어서 **「승인된 것의 명단」을 받아 오는 쪽**이 안전하다.
// 내려간 브랜드를 하나씩 읽으려 들면 권한 오류로 질의 전체가 넘어진다.
//
// ★ 실패하면 **빈 상태가 아니라 오류 상태**를 보여야 한다.
//    빈 상태로 떨어지면 제품이 있는데도 「아직 없습니다」라고 **거짓말**을 하고,
//    그냥 통과시키면 내려간 브랜드의 물건을 **계속 전시**한다. 둘 다 약속을
//    깨는 쪽이다. 그래서 이 파일은 실패를 **던진다** — 부르는 쪽이 이미 가진
//    오류 화면으로 가게 둔다.
//
// ☆ 뒷일: 지금은 쪽을 열 때마다 승인 브랜드 명단을 한 번 받는다. 브랜드가
//    몇 개일 때는 싸지만 수백 개가 되면 쪽마다 수백 건을 읽는 셈이다.
//    그때는 제품에 `brandStatus` 를 적어 두고(이미 `brandName`·`brandSlug` 를
//    적고 있다) 그걸로 거르는 쪽이 맞다. 그 길은 어드민의 쓰기와 기존 자료
//    채우기가 함께 가야 하므로 여기서 하지 않았다.
// ═══════════════════════════════════════════════════════════

(function (w) {
    'use strict';

    var cache = null;      // { map: {id:true}, docs: [...] }
    var pending = null;    // 같은 쪽에서 여러 번 불러도 질의는 **한 번**

    /** 승인된 브랜드를 한 번만 읽어 둔다 — 묶음과 문서를 **함께** 준다.
     *
     *  A-695: 문서까지 주는 까닭은 `search.js` 때문이다. 검색은 브랜드 색인을
     *  만들려고 **이미** `brands.where(status==approved)` 를 읽고 있었다. 문이
     *  따로 또 읽으면 같은 자료를 두 번 읽는다. 한 번 읽어 둘이 나눠 쓴다 —
     *  그래서 문을 검색에 다는 값이 **추가 읽기 0** 이다. */
    function approvedBrands(db) {
        if (cache) return Promise.resolve(cache);
        if (pending) return pending;
        pending = db.collection('brands')
            .where('status', '==', 'approved')
            .get()
            .then(function (snap) {
                var docs = snap.docs || [];
                var m = {};
                docs.forEach(function (d) { m[d.id] = true; });
                cache = { map: m, docs: docs };
                pending = null;
                return cache;
            })
            .catch(function (e) {
                pending = null;
                throw e;
            });
        return pending;
    }

    /** 승인된 브랜드 id 묶음만. 실패는 그대로 던진다. */
    function approvedBrandIds(db) {
        return approvedBrands(db).then(function (c) { return c.map; });
    }

    /**
     * 순수 함수 — 시험하기 쉽게 떼어 뒀다 (tools/test-brand-gate.js).
     * `items` 는 제품 자료의 배열. `approved` 는 { brandId: true }.
     * 브랜드 칸이 없거나 명단에 없으면 뺀다 — 주인 없는 물건은 안 건다.
     */
    function keepLive(items, approved) {
        if (!approved) return [];
        return (items || []).filter(function (p) {
            var id = p && p.brandId;
            if (!id || typeof id !== 'string') return false;
            return approved[id] === true;
        });
    }

    /** 제품 문서(QueryDocumentSnapshot) 배열을 걸러 준다. */
    function keepLiveDocs(docs, approved) {
        if (!approved) return [];
        return (docs || []).filter(function (d) {
            var p = (d && typeof d.data === 'function') ? d.data() : null;
            return keepLive([p], approved).length === 1;
        });
    }

    w.archiBrandGate = {
        approvedBrands: approvedBrands,
        approvedBrandIds: approvedBrandIds,
        keepLive: keepLive,
        keepLiveDocs: keepLiveDocs,
        _reset: function () { cache = null; pending = null; }   // 시험용
    };

    /* node 에서 순수 함수만 시험할 수 있게 */
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = { keepLive: keepLive, keepLiveDocs: keepLiveDocs };
    }
})(typeof window !== 'undefined' ? window : globalThis);
