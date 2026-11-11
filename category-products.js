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
        const path = window.location.pathname;
        const depth = (path.match(/\//g) || []).length - 1;
        if (depth >= 2) return '../../';
        if (depth >= 1) return '../';
        return '';
    }
    const base = getBasePath();

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

            const snap = await query.orderBy('createdAt', 'desc').limit(24).get();

            if (snap.empty) {
                container.innerHTML = `
                <div class="cp-empty">
                    <i class="fas fa-box-open"></i>
                    <p data-en="No products listed yet. Brands can register their products through the brand portal." data-ko="아직 등록된 제품이 없습니다. 브랜드 포털을 통해 제품을 등록할 수 있습니다.">No products listed yet. Brands can register their products through the brand portal.</p>
                    <a href="${base}list-your-brand.html" class="pill-btn" data-en="List Your Brand" data-ko="브랜드 입점">List Your Brand</a>
                </div>`;
                if (window.applyLang) window.applyLang();   // A-062: 비동기로 끼워넣는 조각이라 언어 재적용 필요
                return;
            }

            let html = '<div class="cp-grid">';

            snap.forEach(doc => {
                const p = doc.data();
                // A-471: 꽂기 전에 전부 이스케이프. 주소는 스킴까지 본다.
                const pSlug = escapeHtml(p.slug || '');
                const pName = escapeHtml(p.name || '');
                const pBrandName = escapeHtml(p.brandName || '');
                const pMaterials = escapeHtml(p.materials || '');
                const pImageUrl = escapeHtml(safeUrl(p.imageUrl));
                html += `
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
            });

            html += '</div>';
            container.innerHTML = html;
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
