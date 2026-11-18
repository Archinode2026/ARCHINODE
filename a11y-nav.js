/* ═══════════════════════════════════════════════════════════════════════════
   a11y-nav.js — 머리글 길잡이를 키보드로도 쓸 수 있게 (A-513, 브론즈 35차 N35-1·N35-3)

   왜 있는가
   ─────────
   390px 에서 「Menu」 단추를 눌러 모바일 메뉴를 열고 Tab 을 20번 눌러도
   **메뉴 안에 들어가는 정거장이 하나도 없었다.** 까닭은 생김새가 아니라
   **차례**다 — `<nav id="mainNav">` 가 `.mobile-toggle` 단추보다 **앞**에 있어서,
   단추에서 Tab 을 누르면 메뉴를 지나쳐 바깥으로 나간다. 뒤로(Shift+Tab) 가면
   닿지만 그것을 아는 사람은 없다. **열리기는 하는데 쓸 수가 없다.**

   markup 차례를 바꾸면 233쪽의 머리글 배치가 흔들린다. 그래서 **열린 순간
   초점을 메뉴 안으로 옮기고, 닫힐 때까지 Tab 을 안에 가둔다.**

   그리고 `toggleMobile()` 은 **243쪽에 각각 인라인으로** 적혀 있다. 그 243벌을
   고치는 대신 **`active` 종류가 붙고 떨어지는 것을 지켜본다**(MutationObserver).
   누가 어떻게 열든 같은 약속이 선다.

   ※ 검색 가리개는 제 가둠이 `search.js` 에 따로 있다 — 둘이 싸우지 않도록
     가리개가 열려 있으면 이쪽은 손을 뗀다.
   ═══════════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  var FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), ' +
                  'select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

  function visible(el) {
    return !!(el && (el.offsetWidth || el.offsetHeight || el.getClientRects().length));
  }

  function focusablesIn(root) {
    var out = [];
    var list = root.querySelectorAll(FOCUSABLE);
    for (var i = 0; i < list.length; i++) if (visible(list[i])) out.push(list[i]);
    return out;
  }

  function searchOpen() {
    var o = document.getElementById('searchOverlay');
    return !!(o && o.classList.contains('active'));
  }

  function init() {
    /* ── 1) 본문 표지 — 건너뛰기 링크가 닿는 자리에 이름을 준다 ──────────
       `#main` 은 `<div tabindex="-1">` 이라 읽어 주는 도구에게는 **아무것도
       아니다**. 4화면 모두 `<main>` 도 `role="main"` 도 없었다. markup 을
       바꾸지 않고 표지만 붙인다. */
    var main = document.getElementById('main');
    if (main && main.tagName !== 'MAIN' && !main.getAttribute('role')) {
      main.setAttribute('role', 'main');
    }

    var nav = document.getElementById('mainNav');
    var toggle = document.querySelector('.mobile-toggle');
    if (!nav || !toggle) return;

    if (!toggle.getAttribute('aria-controls')) toggle.setAttribute('aria-controls', 'mainNav');
    toggle.setAttribute('aria-expanded', nav.classList.contains('active') ? 'true' : 'false');

    var trapped = false;

    function onKey(e) {
      if (e.key !== 'Tab') return;
      var items = focusablesIn(nav);
      if (!items.length) return;
      var first = items[0];
      var last = items[items.length - 1];
      /* 단추 자신도 고리 안에 둔다 — 안에서 밖으로 나가는 유일한 길이
         「닫기」여야 하는데, 그 닫기 단추가 메뉴 **밖**에 있기 때문이다. */
      if (e.shiftKey) {
        if (document.activeElement === first) { e.preventDefault(); toggle.focus(); }
        else if (document.activeElement === toggle) { e.preventDefault(); last.focus(); }
      } else {
        if (document.activeElement === last) { e.preventDefault(); toggle.focus(); }
        else if (document.activeElement === toggle) { e.preventDefault(); first.focus(); }
      }
    }

    var prevOverflow = '';

    function opened() {
      if (trapped) return;
      trapped = true;
      toggle.setAttribute('aria-expanded', 'true');
      nav.setAttribute('role', 'dialog');
      nav.setAttribute('aria-modal', 'true');
      /* A-565(브론즈 40차): `aria-modal="true"` 라고 알리면서 **뒤 쪽은 그대로
         스크롤**됐다. 읽어 주는 도구에는 「뒤는 없는 셈 치라」고 해 놓고 실제로는
         살아 있었던 셈이다 — 알린 것과 사실이 달랐다. Tab 은 이미 가두고 있고
         Esc 도 닫히니, 남은 한 가지를 맞춘다. 되돌릴 값을 적어 뒀다가 닫을 때
         그대로 돌려준다(빈 문자열로 덮으면 쪽이 정한 값을 지운다). */
      if (document.body) {
        prevOverflow = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
      }
      var items = focusablesIn(nav);
      if (items.length) { try { items[0].focus(); } catch (e) {} }
      document.addEventListener('keydown', onKey, true);
    }

    function closed() {
      if (!trapped) return;
      trapped = false;
      toggle.setAttribute('aria-expanded', 'false');
      nav.removeAttribute('role');
      nav.removeAttribute('aria-modal');
      if (document.body) document.body.style.overflow = prevOverflow;   // A-565
      document.removeEventListener('keydown', onKey, true);
      /* 초점이 아직 메뉴 안에 있으면 단추로 돌려준다 — 메뉴가 사라진 자리에
         초점을 두고 가면 다음 Tab 이 어디로 갈지 아무도 모른다. */
      if (nav.contains(document.activeElement)) { try { toggle.focus(); } catch (e) {} }
    }

    function sync() {
      if (searchOpen()) return;              // 가리개가 열려 있으면 손을 뗀다
      if (nav.classList.contains('active')) opened(); else closed();
    }

    if (typeof MutationObserver === 'function') {
      new MutationObserver(sync).observe(nav, { attributes: true, attributeFilter: ['class'] });
    } else {
      /* 아주 오래된 브라우저 — 지켜볼 수 없으면 단추 누름으로 갈음한다 */
      toggle.addEventListener('click', function () { setTimeout(sync, 0); });
    }
    sync();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  /* ═════════════════════════════════════════════════════════════════════════
     A-603(2026-11-18, 브론즈 44차 3번): 「맨 위로」가 **움직임 줄이기 설정을
     무시**했다.

     CSS 는 제대로 되어 있다 — reduce 에서 `scroll-behavior` 가 smooth → auto 로
     바뀌는 것을 실측했다. 그런데 단추가 `onclick="window.scrollTo({top:0,
     behavior:'smooth'})"` 로 **JS 안에 smooth 를 박아** 두었고, JS 의 behavior 는
     CSS 의 scroll-behavior 를 **이긴다.** 그래서 설정을 켜도 화면 전체가 1.5초
     동안 8,216px 을 흘러 올라갔다(실측: 설정 끔 1,474ms / 켬 1,473ms — 차이 1ms).

     어지럼·편두통 때문에 그 설정을 켠 손님에게 **사이트에서 가장 큰 움직임**이
     그대로 남은 것이다. 다른 움직임은 다 멈추는데 이것만 안 멈췄다
     (히어로 자동 넘김 0회, 전환 0.7초→0.000001초 — 둘 다 정상).

     같은 자리가 228쪽에 복사돼 있으니 쪽마다 고치지 않고 여기 한 곳에 둔다.
     ═════════════════════════════════════════════════════════════════════════ */
  function archiReduceMotion() {
    try {
      return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    } catch (e) {
      return false;
    }
  }

  /* 가로 레일처럼 위 두 helper 로 감쌀 수 없는 자리를 위해 판단만 내놓는다. */
  window.archiReduceMotion = archiReduceMotion;

  window.archiScrollTop = function (e) {
    if (e && e.preventDefault) e.preventDefault();
    try {
      window.scrollTo({ top: 0, behavior: archiReduceMotion() ? 'auto' : 'smooth' });
    } catch (err) {
      window.scrollTo(0, 0);   // 옛 브라우저
    }
  };

  /* 폼 오류·접수 안내로 끌어올리는 자리에도 같은 판단이 필요하다. */
  window.archiScrollIntoView = function (el, opts) {
    if (!el || !el.scrollIntoView) return;
    var o = opts || {};
    try {
      el.scrollIntoView({ behavior: archiReduceMotion() ? 'auto' : 'smooth',
                          block: o.block || 'center' });
    } catch (err) {
      el.scrollIntoView();
    }
  };
})();
