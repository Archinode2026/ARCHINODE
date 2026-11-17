/* ARCHINODE reCAPTCHA 늦게 싣기 (A-584, 2026-11-17, 브론즈 42차 결함 C+H)
   ────────────────────────────────────────────────────────────────────────────
   무엇이 문제였나 (실측):
     6쪽이 `<script src="recaptcha/api.js?render=...">` 를 **머리에서 바로** 싣고 있었다.
     첫 화면 실측(2026-11-17, index.html): recaptcha 묶음만 **354.8KB**.
     index.html 에는 폼이 뉴스레터 한 줄뿐인데도, 들어오는 손님 전원이 355KB 를 받았다.
     게다가 api.js 는 뜨는 즉시 localStorage 에 `_grecaptcha` 를 쓴다 — 손님이
     아무것도 누르지 않았고 쿠키 동의도 하기 전에.

   무엇으로 바꿨나:
     폼에 **처음 손이 닿는 순간**(focusin / input / submit) 싣는다. 폼을 건드리지 않고
     지나가는 손님은 0KB 를 받고 `_grecaptcha` 도 안 생긴다. 폼을 쓰는 손님은
     글자를 치는 동안 뒤에서 받아 두니까 보내기 단추가 느려지지 않는다.

   왜 쿠키 동의에 걸지 않았나:
     analytics-loader.js 는 동의(analytics)를 기다린다 — 분석은 손님이 원한 일이 아니니까.
     reCAPTCHA 는 손님이 **직접 폼을 쓰기 시작한 뒤에만** 뜨고, 그 폼을 스팸에서
     지키는 데만 쓴다. 동의 배너를 다시 건드리는 일(법 문구 포함)은 승리님 결정이라
     여기서 정하지 않았다 — 지금 바뀐 것은 「언제 싣나」뿐이다.

   사이트 키는 공개돼도 안전하다(설계상 그렇게 쓰도록 되어 있다). 비밀 키는
   netlify/functions/recaptcha-verify.js 가 읽는 Netlify 환경변수 RECAPTCHA_SECRET_KEY
   에만 있고, 어떤 파일에도 쓰지 않는다. (A-333 과 같은 약속.)
*/
(function () {
  'use strict';

  var SITE_KEY = '6Ld5wg0uAAAAADRptBbyguxgE-Y1V3u4mripU8Po';
  var SRC = 'https://www.google.com/recaptcha/api.js?render=' + SITE_KEY;

  var loading = null;   // 싣는 중/끝난 약속. 한 번만 만든다.

  /* api.js 를 싣고, grecaptcha 가 준비될 때까지 기다린다. */
  function load() {
    if (loading) return loading;
    loading = new Promise(function (resolve, reject) {
      /* 이미 떠 있으면(같은 쪽에서 두 폼이 부르는 경우) 그걸 쓴다. */
      if (window.grecaptcha && window.grecaptcha.execute) { resolve(window.grecaptcha); return; }

      var s = document.createElement('script');
      s.src = SRC;
      s.async = true;
      s.onload = function () {
        if (!window.grecaptcha || !window.grecaptcha.ready) {
          reject(new Error('ARCHINODE_CAPTCHA_LOAD_FAILED'));
          return;
        }
        window.grecaptcha.ready(function () { resolve(window.grecaptcha); });
      };
      s.onerror = function () {
        /* 다음에 다시 시도할 수 있게 비워 둔다 — 한 번 막혔다고 영구히 막으면
           망이 잠깐 끊긴 손님이 폼을 영원히 못 보낸다. */
        loading = null;
        reject(new Error('ARCHINODE_CAPTCHA_LOAD_FAILED'));
      };
      document.head.appendChild(s);
    });
    return loading;
  }

  /* 폼이 쓰이기 시작하면 미리 받아 둔다(토큰은 아직 안 받는다 — 2분이면 만료되니까). */
  function prime() {
    load().catch(function () { /* 조용히. 실제 실패는 보낼 때 알린다. */ });
  }

  var primed = false;
  function onFirstTouch(e) {
    if (primed) return;
    var t = e.target;
    if (!t || !t.closest) return;
    if (!t.closest('form')) return;
    primed = true;
    document.removeEventListener('focusin', onFirstTouch, true);
    document.removeEventListener('input', onFirstTouch, true);
    prime();
  }
  document.addEventListener('focusin', onFirstTouch, true);
  document.addEventListener('input', onFirstTouch, true);

  /* 폼이 부르는 창구. 토큰 하나를 돌려준다.
     쓰는 쪽: const token = await archinodeWithTimeout(archiCaptcha('sourcing_inquiry'), 15000); */
  window.archiCaptcha = function (action) {
    return load().then(function (g) { return g.execute(SITE_KEY, { action: action }); });
  };

  /* 검사기(tools/check-recaptcha-lazy.py)가 이 이름으로 「늦게 싣는 길이 살아 있나」를 본다. */
  window.__archinodeCaptchaLazy = true;
})();
