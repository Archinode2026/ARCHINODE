/* ARCHINODE Sentry Loader (P3-7)
   에러 트래킹. 사용자가 로그인·폼 제출 등 상호작용할 때만 로드하도록 lazy.
   SENTRY_DSN 값은 한울님이 Sentry 계정 생성 후 여기 채워야 함.
*/
(function(){
  var DSN = null; // TODO: Sentry DSN 여기 넣기 (예: 'https://xxx@yyy.ingest.sentry.io/zzz')
  if (!DSN) return;
  if (window.__sentryLoaded) return;
  window.__sentryLoaded = true;
  var s = document.createElement('script');
  s.src = 'https://browser.sentry-cdn.com/7.100.0/bundle.tracing.min.js';
  s.crossOrigin = 'anonymous';
  s.onload = function(){
    if (window.Sentry) {
      window.Sentry.init({
        dsn: DSN,
        tracesSampleRate: 0.1,
        beforeSend: function(evt){
          // 개인정보 제거
          if (evt.request && evt.request.cookies) delete evt.request.cookies;
          return evt;
        }
      });
    }
  };
  document.head.appendChild(s);
})();
