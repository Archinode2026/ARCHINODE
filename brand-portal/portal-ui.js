/* 브랜드 포털 공용 안내 — A-561 (브론즈 40차)
 *
 * 왜 있나
 * ───────
 * 1) `confirm()` 이 남아 있었다(3곳). 크롬이 「추가 대화상자 차단」을 걸면
 *    `confirm()` 은 **언제나 false** 라 `if (!confirm(..)) return;` 이 조용히
 *    되돌아간다. 누른 사람은 눌렀다고 믿는데 아무 일도 안 일어난다.
 *    A-302 · A-309 · A-487 · A-560 에 이어 같은 원인의 다섯 번째다.
 *
 * 2) 막히는 순간에 나오는 말이 **영어로만** 박혀 있었다(16곳). 포털의 마크업은
 *    전부 `data-en`/`data-ko` 짝인데 자바스크립트가 심는 말만 영어였다.
 *    비밀번호가 안 맞을 때 한국어 브랜드에게 'Passwords do not match' 만 떴다.
 *    같은 파일 안에서도 한 곳만 두 언어라 관례가 갈려 있었다.
 *
 * 쓰는 법
 * ───────
 *   pT('Saved', '저장했습니다')                 → 지금 언어의 글자
 *   await pConfirm('제목', 'en 본문', 'ko 본문', 'en 단추', 'ko 단추')
 *   pSay(el, 'en', 'ko')                        → 자리에 안내를 심는다
 *
 * 언어 판정은 A-517 의 정본을 따른다 — `documentElement.lang` 을 먼저 본다.
 * localStorage 만 보면 저장소를 못 쓰는 환경에서 한국어 손님에게 영어가 나간다.
 */
(function () {
  'use strict';

  function pLang() {
    if (typeof window.archiFormLang === 'function') return window.archiFormLang();
    var l = document.documentElement.lang;
    if (l) return l;
    try {
      return localStorage.getItem('archinode-lang')
          || localStorage.getItem('archinode-lang-auto') || 'en';
    } catch (e) { return 'en'; }
  }

  function pT(en, ko) { return pLang() === 'en' ? en : ko; }

  /* 네이티브 confirm 을 대신한다. 차단되는 일이 없고, Esc·바깥 누르기로 닫힌다. */
  function pConfirm(titleEn, titleKo, msgEn, msgKo, okEn, okKo) {
    return new Promise(function (resolve) {
      var wrap = document.createElement('div');
      wrap.setAttribute('role', 'dialog');
      wrap.setAttribute('aria-modal', 'true');
      wrap.style.cssText = 'position:fixed;inset:0;z-index:9999;background:rgba(32,28,24,.45);'
                         + 'display:flex;align-items:center;justify-content:center;padding:20px;';
      var box = document.createElement('div');
      box.style.cssText = 'background:#fdfbf7;border-radius:10px;max-width:460px;width:100%;'
                        + 'padding:26px 26px 22px;box-shadow:0 18px 50px rgba(0,0,0,.22);font-family:inherit;';
      var h = document.createElement('h3');
      h.textContent = pT(titleEn, titleKo);
      h.style.cssText = 'margin:0 0 10px;font-size:1.05rem;color:#332e27;';
      var p = document.createElement('p');
      p.textContent = pT(msgEn, msgKo);
      p.style.cssText = 'margin:0 0 20px;font-size:0.9rem;line-height:1.65;color:#5d564c;white-space:pre-line;';
      var row = document.createElement('div');
      row.style.cssText = 'display:flex;gap:8px;';
      var ok = document.createElement('button');
      ok.type = 'button';
      ok.textContent = pT(okEn || 'Continue', okKo || '계속');
      ok.style.cssText = 'flex:1;min-height:44px;border:none;border-radius:6px;cursor:pointer;'
                       + 'background:#332e27;color:#fdfbf7;font-size:0.9rem;font-family:inherit;';
      var no = document.createElement('button');
      no.type = 'button';
      no.textContent = pT('Cancel', '취소');
      no.style.cssText = 'flex:1;min-height:44px;border:none;border-radius:6px;cursor:pointer;'
                       + 'background:#ede7dc;color:#403a30;font-size:0.9rem;font-family:inherit;';
      row.appendChild(ok); row.appendChild(no);
      box.appendChild(h); box.appendChild(p); box.appendChild(row);
      wrap.appendChild(box);
      document.body.appendChild(wrap);
      ok.focus();

      function done(v) {
        document.removeEventListener('keydown', onKey, true);
        if (wrap.parentNode) wrap.parentNode.removeChild(wrap);
        resolve(v);
      }
      function onKey(e) { if (e.key === 'Escape') { e.stopPropagation(); done(false); } }
      document.addEventListener('keydown', onKey, true);
      ok.onclick = function () { done(true); };
      no.onclick = function () { done(false); };
      wrap.onclick = function (e) { if (e.target === wrap) done(false); };
    });
  }

  /* 안내를 자리에 심는다. `data-en`/`data-ko` 를 **함께** 달아서, 손님이 나중에
     언어를 바꿔도 이미 박힌 글자가 따라 바뀐다(A-222 의 함정). */
  function pSay(el, en, ko) {
    if (!el) return;
    el.setAttribute('data-en', en);
    el.setAttribute('data-ko', ko);
    el.textContent = pT(en, ko);
    el.style.display = '';
  }

  /* A-564(브론즈 40차): `alert()` 도 차단되면 **아무것도 뜨지 않는다**. confirm 과
     같은 부류다 — 막힌 손님은 왜 안 되는지 모른 채 다시 누른다. 네이티브 창
     대신 화면 위에 띄운다. 낭독기도 읽도록 role=status 를 단다. */
  function pNote(msg, isErr) {
    var old = document.getElementById('pNoteBox');
    if (old && old.parentNode) old.parentNode.removeChild(old);
    var box = document.createElement('div');
    box.id = 'pNoteBox';
    box.setAttribute('role', 'status');
    box.setAttribute('aria-live', 'polite');
    box.textContent = msg;
    box.style.cssText = 'position:fixed;left:50%;transform:translateX(-50%);bottom:96px;'
      + 'z-index:9998;max-width:min(520px,92vw);padding:14px 18px;border-radius:8px;'
      + 'font-size:0.9rem;line-height:1.6;font-family:inherit;white-space:pre-line;'
      + 'box-shadow:0 10px 30px rgba(0,0,0,.18);'
      + (isErr ? 'background:#7a2e2e;color:#fdfbf7;' : 'background:#332e27;color:#fdfbf7;');
    document.body.appendChild(box);
    setTimeout(function () {
      if (box.parentNode) box.parentNode.removeChild(box);
    }, isErr ? 7000 : 4000);
  }

  window.pNote = pNote;
  window.pLang = pLang;
  window.pT = pT;
  window.pConfirm = pConfirm;
  window.pSay = pSay;
})();
