// ═══════════════════════════════════════════════════════════
// ARCHINODE — Category Dynamic Products Loader
// ═══════════════════════════════════════════════════════════
// 카테고리/서브카테고리 페이지에서 Firestore의 승인된 제품을 로드합니다.
// 사용법: 각 서브카테고리 HTML 페이지 하단에 이 스크립트를 포함하면,
//         페이지의 data-category와 data-subcategory 속성을 읽어
//         해당 제품을 동적으로 표시합니다.
//
// 필요한 요소:
//   <div id="dynamicProducts" data-category="Furniture" data-subcategory="chairs-stools"></div>
//
// Firebase SDK와 firebase-config.js가 먼저 로드되어 있어야 합니다.
// ═══════════════════════════════════════════════════════════

(function() {
    const container = document.getElementById('dynamicProducts');
    if (!container) return;

    const category = container.dataset.category;
    const subcategory = container.dataset.subcategory;
    if (!category) return;

    /* ── A-471(2026-11-11): 이 파일은 브랜드가 입력한 값을 **원문 그대로**
       innerHTML 에 꽂고 있었다 — `p.name` · `p.brandName` · `p.materials` ·
       `p.slug`(href) · `p.imageUrl`(src) 다섯. 이 파일은 **공개 카테고리 69개
       페이지**를 그린다. 제품명에 `"><img src=x onerror=...>` 를 넣고 승인만
       받으면 손님 브라우저에서 돈다.
       같은 자료를 그리는 사본이 다섯인데(products/view · brands/view ·
       brand-portal · 여기 · auth/profile) **A-218 의 처방이 둘에만 안 왔다.**
       brand-portal 의 escapeHtml · bpSafeUrl 과 같은 모양으로 맞춘다. */
    function escapeHtml(text) {
        if (text === null || text === undefined) return '';
        const div = document.createElement('div');
        div.textContent = String(text);
        return div.innerHTML.replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }
    /* 이스케이프만으로는 URL 을 막을 수 없다 — `javascript:` 에는 `&<>"'` 가
       없어 escapeHtml 을 그대로 통과한다. href·src 에 넣기 전에 스킴을 본다. */
    function safeUrl(u) { return (u && /^https?:\/\//i.test(String(u))) ? String(u) : ''; }

    // 기본 경로 계산 (페이지 깊이에 따라)
    function getBasePath() {
        /* A-473(브론즈 29차 ⑦): 여기엔 A-468 이 안 왔다. 전에는 **깊이 2 에서
           잘랐고**(`depth >= 2 → '../../'`) 겹슬래시도 못 봤다. 지금 가장 깊은
           페이지가 깊이 2(`categories/<대>/<소>.html`)라 화면에 틀린 값은
           없었지만, 깊이 3 페이지가 생기는 순간 이 파일이 만드는
           `${base}products/view.html` 과 `${base}list-your-brand.html` 이
           전부 깨진다. search.js 와 **같은 식**으로 맞춘다 —
           tools/test-basepath.js 가 두 사본을 맞춰 본다. */
        const dir = window.location.pathname.replace(/[^/]*$/, '');
        const depth = dir.split('/').filter(x => !!x).length;
        return '../'.repeat(depth);
    }
    const base = getBasePath();

    /* 상위 분류 주소 — 경로에서 읽는다(`categories/<대>/<소>.html`).
       소분류 페이지가 아니면 빈 값을 돌려주고, 그때는 링크를 안 만든다. */
    function parentUrl() {
        const parts = window.location.pathname.split('/').filter(x => !!x);
        if (parts.length < 3) return '';
        const parent = parts[parts.length - 2];
        if (!/^[a-z0-9-]+$/.test(parent) || parent === 'categories') return '';
        return base + 'categories/' + parent + '.html';
    }

    /* ── A-506(2026-11-13): 전에는 `limit(24)` 로 끊고 **그 사실을 말하지 않았다**.
       69개 카테고리 페이지 전부가 그랬다. 브랜드가 25번째 제품을 올리고 승인까지
       받아도 그 제품은 어느 화면에도 나타나지 않는다 — 오류가 아니라 **아무 일도
       일어나지 않는** 꼴이라, 올린 사람도 보는 사람도 빠진 줄을 모른다.
       한 개를 더 불러(`PAGE + 1`) 다음 쪽이 있는지 알아내고, 있으면 「더 보기」를
       띄운다. 넘쳐 온 한 개는 그리지 않는다 — 있다는 신호로만 쓴다. */
    const PAGE = 24;
    let lastDoc = null;      // 다음 쪽의 시작점
    let shown = 0;           // 지금까지 그린 개수
    let gridEl = null;       // 카드가 들어가는 자리(이어 붙인다)
    let moreWrap = null;

    function cardHtml(p) {
        // A-471: 꽂기 전에 전부 이스케이프. 주소는 스킴까지 본다.
        const pSlug = escapeHtml(p.slug || '');
        const pName = escapeHtml(p.name || '');
        const pBrandName = escapeHtml(p.brandName || '');
        const pMaterials = escapeHtml(p.materials || '');
        const pImageUrl = escapeHtml(safeUrl(p.imageUrl));
        return `
                <a href="${base}products/view.html?id=${pSlug}" class="cp-card">
                    <div class="cp-thumb">
                        ${pImageUrl ? `<img loading="lazy" src="${pImageUrl}" alt="${pName}">` : '<span class="noimg"><i class="fas fa-image" aria-hidden="true"></i><span data-en="Photo coming soon" data-ko="사진 준비 중">Photo coming soon</span></span>'}
                    </div>
                    <div class="cp-body">
                        <div class="cp-brand">${pBrandName}</div>
                        <div class="cp-name">${pName}</div>
                        ${pMaterials ? `<div class="cp-mat">${pMaterials}</div>` : ''}
                    </div>
                </a>`;
    }

    function paintMore(hasMore) {
        if (!moreWrap) return;
        moreWrap.style.display = hasMore ? 'block' : 'none';
        const btn = moreWrap.querySelector('.cp-more-btn');
        const note = moreWrap.querySelector('.cp-more-note');
        if (note) {
            const ko = shown + '개를 보고 있습니다';
            const en = 'Showing ' + shown + ' products';
            note.setAttribute('data-ko', ko);
            note.setAttribute('data-en', en);
            note.textContent = (document.documentElement.lang === 'ko') ? ko : en;
        }
        if (btn) btn.disabled = false;
    }

    function baseQuery() {
        let q = db.collection('products')
            .where('status', '==', 'approved')
            .where('category', '==', category);
        if (subcategory) q = q.where('subcategory', '==', subcategory);
        return q.orderBy('createdAt', 'desc');
    }

    async function loadMore(btn) {
        if (btn) btn.disabled = true;
        try {
            const snap = await baseQuery().startAfter(lastDoc).limit(PAGE + 1).get();
            const docs = snap.docs || [];
            const hasMore = docs.length > PAGE;
            const page = docs.slice(0, PAGE);
            if (page.length) lastDoc = page[page.length - 1];
            let add = '';
            page.forEach(d => { add += cardHtml(d.data()); });
            if (gridEl) gridEl.insertAdjacentHTML('beforeend', add);
            shown += page.length;
            paintMore(hasMore);
            if (window.applyLang) window.applyLang();
        } catch (err) {
            /* 실패를 삼키지 않는다 — 단추를 되살려 다시 누를 수 있게 한다 */
            console.error('category products load more failed:', err);
            if (btn) btn.disabled = false;
        }
    }

    async function loadProducts() {
        if (typeof db === 'undefined') {
            console.warn('Firebase not loaded yet, retrying...');
            setTimeout(loadProducts, 500);
            return;
        }

        try {
            let query = db.collection('products')
                .where('status', '==', 'approved')
                .where('category', '==', category);

            if (subcategory) {
                query = query.where('subcategory', '==', subcategory);
            }

            const snap = await query.orderBy('createdAt', 'desc').limit(PAGE + 1).get();

            if (snap.empty) {
                /* ── A-510(브론즈 34차 N34-4): 이 자리는 **손님에게 브랜드 이야기를
                   하고 있었다.** 69개 소분류 중 67개가 이 화면인데, 자재를 찾아 들어온
                   건축가·디자이너에게 「브랜드 포털을 통해 제품을 등록할 수 있습니다」와
                   「브랜드 입점」 단추를 내밀었다. 찾으러 온 사람에게 팔러 오라고 한 셈이다.
                   먼저 **손님이 지금 할 수 있는 일**을 준다 — 소싱 문의와 상위 분류 둘러보기.
                   입점 안내는 작은 글씨로 맨 아래 남긴다(브랜드가 들어올 수도 있으니). */
                container.innerHTML = `
                <div class="cp-empty">
                    <i class="fas fa-box-open"></i>
                    <p data-en="No products listed in this subcategory yet. Tell us what you are looking for and we will ask European brands directly." data-ko="이 분류에는 아직 등록된 제품이 없습니다. 찾으시는 자재를 알려 주시면 유럽 브랜드에 직접 확인해 드립니다.">No products listed in this subcategory yet. Tell us what you are looking for and we will ask European brands directly.</p>
                    <div class="cp-empty-actions">
                        <a href="${base}sourcing-inquiry.html" class="pill-btn" data-en="Send a sourcing inquiry" data-ko="소싱 문의 남기기">Send a sourcing inquiry</a>
                        ${parentUrl() ? `<a href="${parentUrl()}" class="cp-empty-alt" data-en="Browse the whole category" data-ko="상위 분류 전체 둘러보기">Browse the whole category</a>` : ''}
                    </div>
                    <p class="cp-empty-brand" data-en="Are you a brand? See how listing works." data-ko="브랜드이신가요? 입점 절차를 확인하세요."><a href="${base}list-your-brand.html" data-en="Brand listing" data-ko="브랜드 입점">Brand listing</a></p>
                </div>`;
                if (window.applyLang) window.applyLang();   // A-062: 비동기로 끼워넣는 조각이라 언어 재적용 필요
                return;
            }

            const docs = snap.docs || [];
            const hasMore = docs.length > PAGE;
            const page = docs.slice(0, PAGE);
            lastDoc = page.length ? page[page.length - 1] : null;
            shown = page.length;

            let html = '<div class="cp-grid">';
            page.forEach(doc => { html += cardHtml(doc.data()); });
            html += '</div>';
            html += `
                <div class="cp-more" style="display:none;text-align:center;margin-top:32px;">
                    <button type="button" class="cp-more-btn pill-btn" data-en="Load more products" data-ko="제품 더 보기">Load more products</button>
                    <p class="cp-more-note" style="font-size:0.8rem;opacity:0.7;margin:12px 0 0;"></p>
                </div>`;
            container.innerHTML = html;
            gridEl = container.querySelector('.cp-grid');
            moreWrap = container.querySelector('.cp-more');
            const moreBtn = moreWrap && moreWrap.querySelector('.cp-more-btn');
            if (moreBtn) moreBtn.addEventListener('click', () => loadMore(moreBtn));
            paintMore(hasMore);
            if (window.applyLang) window.applyLang();   // A-062: 비동기로 끼워넣는 조각이라 언어 재적용 필요

        } catch (err) {
            console.error('Error loading products:', err);
            container.innerHTML = '<p class="cp-error" data-en="Unable to load products." data-ko="제품을 불러올 수 없습니다.">Unable to load products.</p>';
            if (window.applyLang) window.applyLang();
        }
    }

    // 페이지 로드 후 실행
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', loadProducts);
    } else {
        loadProducts();
    }
})();
