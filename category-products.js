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
                <div style="text-align:center;padding:60px 20px;color:#a3a3a3;">
                    <i class="fas fa-box-open" style="font-size:2.5rem;margin-bottom:16px;display:block;"></i>
                    <p style="font-size:0.9rem;" data-en="No products listed yet. Brands can register their products through the brand portal." data-ko="아직 등록된 제품이 없습니다. 브랜드 포털을 통해 제품을 등록할 수 있습니다.">No products listed yet. Brands can register their products through the brand portal.</p>
                    <a href="${base}list-your-brand.html" style="display:inline-block;margin-top:20px;padding:10px 24px;background:#000;color:#fff;font-size:0.82rem;font-weight:600;text-decoration:none;" data-en="List Your Brand" data-ko="브랜드 입점">List Your Brand</a>
                </div>`;
                if (window.applyLang) window.applyLang();   // A-062: 비동기로 끼워넣는 조각이라 언어 재적용 필요
                return;
            }

            let html = '<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:24px;margin-top:40px;">';

            snap.forEach(doc => {
                const p = doc.data();
                html += `
                <a href="${base}products/view.html?id=${p.slug || ''}" style="border:1px solid #e5e5e5;overflow:hidden;text-decoration:none;color:inherit;display:block;transition:all 0.3s;" onmouseover="this.style.borderColor='#000';this.style.boxShadow='0 8px 24px rgba(0,0,0,0.08)'" onmouseout="this.style.borderColor='#e5e5e5';this.style.boxShadow='none'">
                    <div style="width:100%;aspect-ratio:1;overflow:hidden;background:#f5f5f5;">
                        ${p.imageUrl ? `<img src="${p.imageUrl}" alt="${p.name}" style="width:100%;height:100%;object-fit:cover;transition:transform 0.3s;">` : '<div style="display:flex;align-items:center;justify-content:center;height:100%;color:#d4d4d4;font-size:2rem;"><i class="fas fa-cube"></i></div>'}
                    </div>
                    <div style="padding:16px;">
                        <div style="font-size:0.68rem;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;color:#737373;margin-bottom:4px;">${p.brandName}</div>
                        <div style="font-size:0.88rem;font-weight:600;color:#000;margin-bottom:4px;">${p.name}</div>
                        ${p.materials ? `<div style="font-size:0.78rem;color:#a3a3a3;">${p.materials}</div>` : ''}
                    </div>
                </a>`;
            });

            html += '</div>';
            container.innerHTML = html;
            if (window.applyLang) window.applyLang();   // A-062: 비동기로 끼워넣는 조각이라 언어 재적용 필요

        } catch (err) {
            console.error('Error loading products:', err);
            container.innerHTML = '<p style="text-align:center;color:#a3a3a3;padding:40px;" data-en="Unable to load products." data-ko="제품을 불러올 수 없습니다.">Unable to load products.</p>';
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
