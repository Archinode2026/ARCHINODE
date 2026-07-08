/* ARCHINODE Cookie Consent Banner (P3-2)
   경량 쿠키 동의 배너. GDPR 최소 준수:
   - 방문 시 배너 표시 (localStorage에 결정 저장 안 된 상태)
   - "Accept All", "Necessary Only", "Manage" 3버튼
   - 결정 후 재방문 시 표시 안 함
   - Analytics·Marketing 쿠키는 Accept All 선택 시만 로드 (window.__cookieConsent.analytics)
*/
(function(){
  var KEY = 'archinode-cookie-consent';
  var SAVED = null;
  try { SAVED = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch(e){}

  window.__cookieConsent = SAVED || { necessary: true, analytics: false, marketing: false };

  function saveConsent(c){
    try { localStorage.setItem(KEY, JSON.stringify(c)); } catch(e){}
    window.__cookieConsent = c;
    document.dispatchEvent(new CustomEvent('archinode:consent', { detail: c }));
    var banner = document.getElementById('archi-cookie-banner');
    if (banner) banner.parentNode.removeChild(banner);
  }

  function showBanner(){
    if (SAVED) return; // 이미 결정한 사용자는 안 보임
    var lang = document.documentElement.lang || 'en';
    var isKo = lang === 'ko';
    var wrap = document.createElement('div');
    wrap.id = 'archi-cookie-banner';
    wrap.style.cssText = 'position:fixed;left:16px;right:16px;bottom:16px;background:#111;color:#fff;padding:20px 24px;border-radius:10px;z-index:99999;box-shadow:0 8px 32px rgba(0,0,0,0.4);max-width:720px;margin:0 auto;font-family:Inter,"Noto Sans KR",system-ui,sans-serif;';
    wrap.innerHTML =
      '<div style="display:flex;flex-direction:column;gap:12px;">' +
        '<h3 style="font-size:0.95rem;font-weight:700;margin:0;color:#C8A96E;">' +
          (isKo ? '쿠키 사용에 대한 안내' : 'We use cookies') +
        '</h3>' +
        '<p style="font-size:0.82rem;line-height:1.5;margin:0;color:#ccc;">' +
          (isKo
            ? 'ARCHINODE는 사이트 작동에 필요한 쿠키와 사용 분석용 쿠키를 사용합니다. '
              + '<a href="/privacy.html" style="color:#C8A96E;text-decoration:underline;">개인정보 처리방침</a>을 확인하시고 선택해주세요.'
            : 'ARCHINODE uses necessary cookies for the site to work and analytics cookies to improve it. '
              + 'See our <a href="/privacy.html" style="color:#C8A96E;text-decoration:underline;">Privacy Policy</a>. Choose your preference below.'
          ) +
        '</p>' +
        '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:4px;">' +
          '<button id="cc-accept" style="background:#C8A96E;color:#0a0a0a;border:none;padding:10px 18px;font-size:0.82rem;font-weight:700;border-radius:6px;cursor:pointer;font-family:inherit;">' +
            (isKo ? '모두 수락' : 'Accept All') + '</button>' +
          '<button id="cc-necessary" style="background:transparent;color:#fff;border:1px solid #444;padding:10px 18px;font-size:0.82rem;font-weight:600;border-radius:6px;cursor:pointer;font-family:inherit;">' +
            (isKo ? '필수만' : 'Necessary Only') + '</button>' +
          '<a href="/privacy.html" style="align-self:center;font-size:0.76rem;color:#888;text-decoration:none;margin-left:auto;">' +
            (isKo ? '자세히' : 'Manage / Learn more') + '</a>' +
        '</div>' +
      '</div>';
    document.body.appendChild(wrap);

    document.getElementById('cc-accept').onclick = function(){
      saveConsent({ necessary: true, analytics: true, marketing: true, at: new Date().toISOString() });
    };
    document.getElementById('cc-necessary').onclick = function(){
      saveConsent({ necessary: true, analytics: false, marketing: false, at: new Date().toISOString() });
    };
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', showBanner);
  } else {
    showBanner();
  }
})();
