// ARCHINODE XSS 방어 유틸 (output-side escape)
// 사용처: brands/view.html 등 사용자 입력을 innerHTML로 렌더링하는 모든 페이지

// HTML 텍스트 이스케이프
function escapeHtml(text) {
    if (text === undefined || text === null) return '';
    const d = document.createElement('div');
    d.textContent = String(text);
    return d.innerHTML;
}

// URL 검증 — javascript:, data:, vbscript:, file: protocol 차단
function safeUrl(url) {
    if (!url) return '';
    const t = String(url).trim();
    if (/^(javascript|data|vbscript|file):/i.test(t)) return '';
    return escapeHtml(t);
}

// 줄바꿈 텍스트를 P 태그로 변환하면서 escape
function escapeMultiline(text) {
    if (!text) return '';
    return String(text).split('\n').filter(p => p.trim()).map(p => `<p>${escapeHtml(p)}</p>`).join('');
}
