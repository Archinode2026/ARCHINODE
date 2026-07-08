/* ARCHINODE Analytics Loader (P3-8)
   쿠키 동의(analytics=true) 상태에서만 GA4 로드.
   GA4 Measurement ID (G-XXXXXXXXXX)는 여기서 세팅.
   한울님이 GA4 계정 생성 후 이 파일에서 GA_ID 값만 교체하면 됨.
*/
(function(){
  var GA_ID = null; // TODO: GA4 Measurement ID 여기 넣기 (예: 'G-XXXXXXXXXX')

  function loadGA(){
    if (!GA_ID) return;
    if (window.__gaLoaded) return;
    window.__gaLoaded = true;
    var s = document.createElement('script');
    s.async = true;
    s.src = 'https://www.googletagmanager.com/gtag/js?id=' + GA_ID;
    document.head.appendChild(s);
    window.dataLayer = window.dataLayer || [];
    window.gtag = function(){ window.dataLayer.push(arguments); };
    window.gtag('js', new Date());
    window.gtag('config', GA_ID, { anonymize_ip: true });
  }

  function check(){
    var c = window.__cookieConsent;
    if (c && c.analytics) loadGA();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', check);
  } else {
    check();
  }
  document.addEventListener('archinode:consent', check);
})();
