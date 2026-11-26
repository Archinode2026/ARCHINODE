/* ARCHINODE Sentry Loader (P3-7)
   에러 트래킹. 사용자가 로그인·폼 제출 등 상호작용할 때만 로드하도록 lazy.
   SENTRY_DSN 값은 한울님이 Sentry 계정 생성 후 여기 채워야 함.
*/
/* ★★ A-730(2026-11-26) — **이 한 줄을 채우기 전에 읽으세요.**

   `DSN` 에 값을 넣는 순간 **231쪽**이 `browser.sentry-cdn.com` 에서 스크립트를 받아
   오고, 오류가 날 때마다 접속 IP·브라우저·기기 정보·보던 쪽 주소·오류 메시지가
   **미국 Sentry 로 나갑니다.** 지금 처리방침(`privacy.html` 제6조의2·제6조의3,
   `privacy-en.html` 6A·6B)에는 **Sentry 가 한 글자도 없습니다.**

   A-721 이 GA4 에서 똑같은 일을 겪었습니다 — 측정 ID 한 줄을 넣는 순간 방침의
   「분석용 쿠키를 사용하지 않습니다」가 거짓이 됐습니다. 그때 배운 것:
   **방침에 없는 것을 먼저 켜면 그게 위반입니다.**

   채우기 전에 할 일 셋:
     ① 처리방침 국문·영문 **양쪽**의 처리위탁·국외이전 표에 Sentry 법인명을 올린다
        (법인명은 추측하지 말고 Sentry 의 약관·DPA 에서 확인할 것 —
         A-730 에서 Resend 가 「Resend, Inc.」가 아니라 「Plus Five Five, Inc.」였다)
     ② **동의 게이트를 단다.** 이 로더는 `analytics-loader.js` 와 달리
        `__cookieConsent` 를 보지 않습니다 — 지금 꼴로 켜면 동의 없이 보냅니다
     ③ `beforeSend` 가 쿠키만 지웁니다. URL 질의문자열·사용자 식별자도 지울지 정한다

   `tools/check-processor-disclosure.py` 가 이 셋을 지킵니다 — DSN 이 채워졌는데
   방침에 Sentry 가 없으면 울립니다. */
(function(){
  var DSN = null; // TODO: Sentry DSN 여기 넣기 — **위 주석을 먼저 읽으세요**
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
