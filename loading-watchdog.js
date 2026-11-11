/* ARCHINODE — 로딩 화면 감시견 (A-475, 2026-11-11)
 *
 * 왜 필요한가:
 *   로딩 화면을 **성공 경로에서만** 걷는 화면이 여럿이다. 그래서 이런 길에서
 *   손님은 영원히 도는 바람개비만 본다 —
 *     ㄱ. Firebase SDK 를 못 받았다(회사 방화벽·광고 차단기·gstatic 차단).
 *         `firebase-config.js` 가 `auth = null` 로 두므로(A-001)
 *         `auth.onAuthStateChanged(...)` 가 **바로 TypeError** 를 던진다.
 *     ㄴ. `onAuthStateChanged` 가 아예 안 불린다(인증 백엔드에 못 닿는다).
 *     ㄷ. 콜백 안의 Firestore 읽기가 거부·실패한다.
 *         `auth/profile.html` 은 try/catch 가 **아예 없었고**,
 *         `brand-portal/dashboard.html` 은 catch 가 `console.error` 만 해서
 *         로딩 화면을 그대로 뒀다(실측: 컨테이너에서 SDK 를 못 받는 상태로
 *         열면 「Loading your profile...」이 영원히 남는다).
 *   A-023 이 `admin/dashboard.html` 한 곳에 try/catch 를 넣었지만 나머지는
 *   받지 못했다 — 이 저장소에서 반복된 모양(사본이 갈린다)이다.
 *
 * 하는 일: 로딩 자리가 정해진 시간이 지나도 보이면, 바람개비를 **읽을 수 있는
 *   안내와 「다시 시도」 단추로 바꾼다.** 아무 화면도 고치지 않는다 — 그냥
 *   조용한 멈춤을 말하는 멈춤으로 바꾼다.
 *
 * 즉시 실패를 알리려면: `window.archinodeLoadingFailed()` 를 부른다.
 */
(function () {
  var IDS = ['loadingScreen', 'loadingState', 'profileLoading'];
  var WAIT = 12000;   // 느린 회선에서 멀쩡한 화면을 망치지 않을 만큼 넉넉하게
  var done = false;

  function el() {
    for (var i = 0; i < IDS.length; i++) {
      var e = document.getElementById(IDS[i]);
      if (e) return e;
    }
    return null;
  }

  function visible(e) {
    if (!e) return false;
    var s = window.getComputedStyle(e);
    if (s.display === 'none' || s.visibility === 'hidden') return false;
    return e.getBoundingClientRect().height > 0;
  }

  function ko() { return document.documentElement.lang !== 'en'; }

  function fail(reason) {
    if (done) return;
    var e = el();
    if (!visible(e)) return;      // 이미 걷혔으면 아무것도 안 한다
    done = true;
    var msgEn = 'We could not load this page. Your network may be blocking it, or the service may be briefly unavailable.';
    var msgKo = '이 화면을 불러오지 못했습니다. 네트워크가 막고 있거나, 서비스가 잠시 응답하지 않는 것일 수 있습니다.';
    var btnEn = 'Try again';
    var btnKo = '다시 시도';
    e.innerHTML = '';
    var wrap = document.createElement('div');
    wrap.style.cssText = 'padding:48px 20px;text-align:center;max-width:36em;margin:0 auto;';
    var icon = document.createElement('i');
    icon.className = 'fas fa-triangle-exclamation';
    icon.setAttribute('aria-hidden', 'true');
    icon.style.cssText = 'font-size:1.5rem;color:#92400e;display:block;margin-bottom:14px;';
    var p = document.createElement('p');
    p.setAttribute('data-en', msgEn);
    p.setAttribute('data-ko', msgKo);
    p.textContent = ko() ? msgKo : msgEn;
    p.style.cssText = 'font-size:0.92rem;line-height:1.75;color:#5d564c;margin:0 0 20px;';
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.setAttribute('data-en', btnEn);
    btn.setAttribute('data-ko', btnKo);
    btn.textContent = ko() ? btnKo : btnEn;
    btn.style.cssText = 'display:inline-flex;align-items:center;justify-content:center;' +
      'min-height:44px;padding:0 22px;border:1px solid #332e27;background:#332e27;color:#fff;' +
      'border-radius:3px;font-size:0.85rem;font-weight:600;cursor:pointer;';
    btn.addEventListener('click', function () { window.location.reload(); });
    wrap.appendChild(icon); wrap.appendChild(p); wrap.appendChild(btn);
    e.appendChild(wrap);
    e.style.display = 'block';
    if (window.applyLangAgain) { try { window.applyLangAgain(); } catch (x) {} }
    if (reason) { try { console.warn('[loading] ' + reason); } catch (x) {} }
  }

  window.archinodeLoadingFailed = function (reason) { fail(reason || 'called'); };

  /* `auth` 가 없으면 콜백이 등록조차 안 된다 — 기다릴 이유가 없다.
     firebase-config.js 가 먼저 돌아 `auth` 를 세우므로, 한 틱 뒤에 본다. */
  function start() {
    if (!el()) return;                       // 로딩 자리가 없는 화면
    setTimeout(function () {
      /* ★ `firebase-config.js` 는 `const auth = ...` 로 선언한다. 최상위 `const` 는
         **전역 렉시컬 환경**에 들어가고 `window` 의 속성이 **되지 않는다** —
         `typeof window.auth` 로 보면 멀쩡한 화면에서도 'undefined' 가 나와
         거짓 실패를 낸다(이 파일을 처음 쓸 때 그렇게 썼다가 고쳤다).
         맨 이름으로 봐야 전역 렉시컬 바인딩까지 보인다. 아직 실행 전이면
         TDZ 라 `typeof` 도 던지므로 try 로 감싼다. */
      var noFb, noAuth;
      try { noFb = (typeof firebase === 'undefined'); } catch (x) { noFb = true; }
      try { noAuth = (typeof auth === 'undefined' || !auth); } catch (x) { noAuth = true; }
      if (noFb) { fail('firebase 가 없다'); return; }
      if (noAuth) { fail('auth 가 없다'); return; }
    }, 1200);
    setTimeout(function () { fail('시간 제한 ' + WAIT + 'ms'); }, WAIT);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }
})();
