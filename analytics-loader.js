/* ARCHINODE Analytics Loader (P3-8)
   쿠키 동의(analytics=true) 상태에서만 GA4 로드.
   GA4 Measurement ID (G-XXXXXXXXXX)는 여기서 세팅.
   한울님이 GA4 계정 생성 후 이 파일에서 GA_ID 값만 교체하면 됨.
*/
(function(){
  /* A-721(2026-11-26): 승리님이 GA4 속성을 만들고 측정 ID 를 주셨다.
     ★ 이 한 줄을 넣는 순간 **처리방침의 「분석용 쿠키를 사용하지 않습니다」가
     거짓이 된다.** 그래서 같은 커밋에서 처리방침 세 조항을 함께 고쳤다 —
     제6조의2(처리위탁)·제6조의3(국외이전)·제8조(쿠키), 국문·영문 양쪽.
     방침에 없는 것을 먼저 켜면 그게 위반이다(A-670 에서 같은 순서를 지켰다). */
  var GA_ID = 'G-H3SWD3YZ9B';

  /* A-496(2026-11-12, 브론즈 32차 ①): 쿠키 배너는 「분석용 쿠키를 사용합니다」라고
     말하는데 **GA_ID 가 없어서 아무것도 로드되지 않았다**(브론즈 실측: 「모두 수락」
     뒤에도 gtag undefined, googletagmanager 요청 0건). 손님에게 사실이 아닌 고지를
     한 셈이다. 그래서 「켜져 있는지」를 한 곳에서 밝히고 배너가 그걸 보고 말하게 한다 —
     여기에 ID 를 넣는 순간 배너 문구도 저절로 따라온다(두 군데를 맞출 일이 없다). */
  window.__archinodeAnalytics = { enabled: !!GA_ID };

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
