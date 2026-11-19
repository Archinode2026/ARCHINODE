/* ARCHINODE Form Throttle (P3-9)
   폼 제출 후 5초간 재제출 차단. 봇 스팸/실수 재제출 완화.
   기존 폼 로직 방해 안 함 — 재제출만 차단.

   A-034: 이 리스너는 캡처 단계에서 각 폼의 자체 검증보다 먼저 실행되기 때문에,
   "검증에 실패해서 실제로는 제출되지 않은" 시도까지 타임스탬프를 남긴다. 그래서
   방문자가 빈칸 오류를 보고 5초 안에 고쳐서 다시 누르면 조용히 막히기만 하고
   아무 안내도 없었다. 어떤 제출이 폼 자체 검증을 통과했는지는 이 범용 스크립트가
   알 수 없으므로(폼마다 검증 로직이 다름), 대신 막힐 때 "잠시 후 다시 시도해 주세요"
   안내를 화면에 보여줘 "버튼이 고장났나?"로 오인하지 않도록 한다.
*/
(function(){
  /* ── A-517(브론즈 36차 N36-2·N36-8): 폼이 **손님의 언어로 말하지 않았다** ──────
     ㄱ) 빈 칸이나 잘못된 이메일을 두고 제출하면 나오는 말은 **브라우저 기본 문구**다.
        그 문구의 언어를 정하는 것은 우리 사이트가 아니라 **손님 브라우저의 설정**이라,
        영어로 보는 손님에게도 한국어 경고가 떴다(실측). 저장소 전체에
        `setCustomValidity` 가 **0건**이었다 — 한 번도 우리가 말한 적이 없다.
     ㄴ) 5초 재제출 안내는 `localStorage` 만 보고 없으면 **영어**로 떨어졌다. 그런데
        지금 화면의 언어를 아는 정본은 `document.documentElement.lang` 이다(A-402).
     둘 다 「화면은 한국어인데 말은 영어」 계열이다(A-362~A-402 · A-492 · A-507). */
  function archiFormLang() {
    var l = (document.documentElement && document.documentElement.lang) || '';
    if (l === 'ko' || l === 'en') return l;
    try {
      return localStorage.getItem('archinode-lang')
          || localStorage.getItem('archinode-lang-auto') || 'en';
    } catch (e) { return 'en'; }
  }

  var V_MSG = {
    ko: {
      valueMissing:      '필수 항목입니다.',
      checkboxMissing:   '동의가 필요합니다.',
      emailMismatch:     '이메일 주소를 @ 를 포함해 올바르게 입력해 주세요.',
      urlMismatch:       '주소를 http:// 또는 https:// 로 시작하게 입력해 주세요.',
      tooShort:          '조금 더 길게 입력해 주세요.',
      tooLong:           '글자 수가 너무 많습니다.',
      patternMismatch:   '형식이 맞지 않습니다.',
      rangeUnderflow:    '더 큰 값을 넣어 주세요.',
      rangeOverflow:     '더 작은 값을 넣어 주세요.',
      stepMismatch:      '허용되지 않는 값입니다.',
      badInput:          '입력한 값을 알아볼 수 없습니다.'
    },
    en: {
      valueMissing:      'This field is required.',
      checkboxMissing:   'Please tick this box to continue.',
      emailMismatch:     'Enter a valid email address, including the @.',
      urlMismatch:       'Enter an address starting with http:// or https://.',
      tooShort:          'Please write a little more.',
      tooLong:           'That is longer than allowed.',
      patternMismatch:   'That format does not match.',
      rangeUnderflow:    'Please enter a larger value.',
      rangeOverflow:     'Please enter a smaller value.',
      stepMismatch:      'That value is not allowed.',
      badInput:          'That value could not be read.'
    }
  };

  /* 어떤 말을 할지 고른다. 상태 하나만 받아 고르므로 **브라우저 없이 시험할 수 있다**
     (`tools/test-form-messages.js` 가 이 함수를 떼어 내 돌린다). */
  function archiPickMessage(v, type, lang) {
    var m = V_MSG[lang] || V_MSG.en;
    if (!v) return '';
    if (v.valid) return '';
    if (v.valueMissing)    return (type === 'checkbox' || type === 'radio') ? m.checkboxMissing : m.valueMissing;
    if (v.typeMismatch)    return (type === 'url') ? m.urlMismatch : m.emailMismatch;
    if (v.patternMismatch) return m.patternMismatch;
    if (v.tooShort)        return m.tooShort;
    if (v.tooLong)         return m.tooLong;
    if (v.rangeUnderflow)  return m.rangeUnderflow;
    if (v.rangeOverflow)   return m.rangeOverflow;
    if (v.stepMismatch)    return m.stepMismatch;
    if (v.badInput)        return m.badInput;
    return m.valueMissing;      // 알 수 없는 상태 — 아무 말도 안 하느니 필수 안내를 한다
  }
  window.archiPickMessage = archiPickMessage;   // 시험과 다른 화면이 쓴다

  /* A-567 — 안내를 자리에 심는다.
     인증 쪽 아홉 곳이 「…습니다. / …」처럼 **두 언어를 한 줄에 붙여** 두고 있었다.
     실패하는 순간에 두 언어가 한꺼번에 뜨고, 손님이 언어를 바꿔도 그 줄만 안 바뀐다
     (A-529 와 같은 꼴). data-en/data-ko 를 **함께** 달아 두면 lang.js 가 나중에
     다시 칠한다 — 삼항으로 고르기만 하면 이미 박힌 글자는 그대로 남는다(A-222). */
  function archiSay(el, en, ko) {
    if (!el) return;
    /* A-592(2026-11-18): **보이게 한 다음에** 글을 넣는다.
       살아 있는 영역(role=alert·status)은 글이 바뀌는 순간 접근성 나무에 있어야
       읽힌다. 그때까지 display:none 이면 읽기 프로그램이 놓칠 수 있다.
       글이 비어 있으면 보이게 하지 않는다 — 나중에 「지우기」로 부를 때
       빈 칸이 드러나지 않게. */
    if ((en && String(en).trim()) || (ko && String(ko).trim())) el.style.display = 'block';
    el.setAttribute('data-en', en);
    el.setAttribute('data-ko', ko);
    el.textContent = archiFormLang() === 'en' ? en : ko;
  }
  window.archiSay = archiSay;

  /* A-598(2026-11-18): 어느 칸이 막혔는지 **그 칸에** 표시한다.
     A-591 이 안내를 들리게 했고(role=alert), A-595 가 칸에 이름을 달았다.
     남은 틈이 이것이다 — 손님이 「동의해 주세요」를 듣고 Tab 으로 돌아와도
     **어느 칸이 문제인지는 아무것도 말해 주지 않는다.** aria-invalid 로 그 칸을
     표시하고, aria-describedby 로 안내문을 그 칸에 묶는다. 그러면 칸에 들어갈 때
     「잘못됨」과 이유가 함께 들린다. 보기는 바뀌지 않는다 — 속성뿐이다.
     (248쪽 전체에서 aria-invalid·aria-describedby 는 0쪽이었다.)

     한 폼 안의 묵은 표시는 먼저 지운다 — 지우지 않으면 한 번 틀린 칸이
     고친 뒤에도 계속 틀린 것으로 남는다(archiApplyMessage 가 같은 까닭으로
     setCustomValidity('') 를 먼저 부른다). */
  function archiMarkInvalid(field, errEl) {
    if (!field) return;
    var form = field.form || (field.closest ? field.closest('form') : null);
    if (form) {
      var old = form.querySelectorAll('[aria-invalid="true"]');
      for (var i = 0; i < old.length; i++) {
        old[i].removeAttribute('aria-invalid');
        old[i].removeAttribute('aria-describedby');
      }
    }
    field.setAttribute('aria-invalid', 'true');
    if (errEl && errEl.id) field.setAttribute('aria-describedby', errEl.id);
  }
  window.archiMarkInvalid = archiMarkInvalid;

  function archiApplyMessage(el) {
    if (!el || typeof el.setCustomValidity !== 'function' || !el.validity) return;
    /* 먼저 비워야 **지금의 진짜 상태**가 보인다 — 비우지 않으면 한 번 틀린 칸이
       고친 뒤에도 계속 틀린 것으로 남는다. */
    el.setCustomValidity('');
    if (el.validity.valid) return;
    el.setCustomValidity(archiPickMessage(el.validity, (el.type || '').toLowerCase(), archiFormLang()));
  }

  document.addEventListener('invalid', function (e) { archiApplyMessage(e.target); }, true);

  /* ── A-615 (브론즈 45차 F-7): 막힌 칸을 **쪽 안에서도** 알린다 ──────────────
     폼 4개 모두 novalidate 가 없어 브라우저 기본 검사가 먼저 막는다. 그래서
     submit 이벤트가 안 열리고, 그 안에 쓰여 있던 쪽 안 안내와 aria-invalid 가
     한 번도 닿지 않았다(실측 10/10 경우에서 화면 안 안내 0 · aria-invalid 0).
     손님이 안내를 아예 못 받는 것은 아니다 — 위 invalid 처리가 말풍선 글자를
     우리 말로 갈아끼운다. 그래도 말풍선은 **한 칸만** 말하고 사라지며, 읽어 주는
     도구가 폼 위쪽 안내 영역을 보는 손님에게는 아무것도 남지 않는다.

     novalidate 를 켜서 submit 을 열지는 않았다 — 그러면 빈 칸 막기를 전부 우리
     JS 가 해야 하는데 지금은 동의·카테고리만 본다. 대신 브라우저 검사를 그대로
     두고 **같은 순간에** aria-invalid 와 쪽 안 안내를 함께 켠다. 되돌릴 일이 없고
     기존 동작을 하나도 바꾸지 않는다. */
  document.addEventListener('invalid', function (e) {
    var el = e.target;
    if (!el || !el.form) return;
    try {
      /* 첫 번째로 막힌 칸만 안내에 쓴다 — invalid 는 칸마다 한 번씩 오고,
         브라우저는 그중 첫 칸으로 초점을 옮긴다. */
      if (el.form.getAttribute('data-archi-invalid-shown') === '1') return;
      el.form.setAttribute('data-archi-invalid-shown', '1');
      setTimeout(function () { try { el.form.removeAttribute('data-archi-invalid-shown'); } catch (e2) {} }, 0);

      var SEL = '#formError, #srcErrorMsg, #errorMsg, .form-error';
      var box = el.form.querySelector(SEL) || document.querySelector(SEL);
      /* 칸 바로 옆에 붙는 작은 안내(예: #vendorTermsError)는 쓰지 않는다 —
         그 칸만의 것이라 다른 칸의 사정을 적으면 거짓이 된다. */
      if (box && box.id === 'vendorTermsError') box = null;
      if (window.archiMarkInvalid) window.archiMarkInvalid(el, box && box.id ? box : null);
      else el.setAttribute('aria-invalid', 'true');

      if (box) {
        /* A-625(브론즈 46차 N46-7): 전에는 여기서 data-en 과 data-ko 에 **같은 글**을
           넣었다. 그래서 막히는 순간의 언어는 맞지만 손님이 나중에 한/영을 누르면
           따라오지 않았다(실측: 한국어로 막고 EN 토글 → 그대로 한국어).
           두 언어를 따로 만든다. 사유는 archiPickMessage 가 언어를 받으므로 그대로
           두 번 부르고(위 archiApplyMessage 가 setCustomValidity 를 이미 불렀지만
           valueMissing·typeMismatch 깃발은 **그 뒤에도 살아 있다** — 재서 확인했다),
           칸 이름은 라벨의 data-en·data-ko 에서 가져온다. */
        var lb = el.id ? el.form.querySelector('label[for="' + el.id + '"]') : null;
        var star = /\s*\*\s*$/;
        var lbEn = '', lbKo = '';
        if (lb) {
          var raw = (lb.innerText || '').replace(star, '').trim();
          lbEn = (lb.getAttribute('data-en') || raw).replace(star, '').trim();
          lbKo = (lb.getAttribute('data-ko') || raw).replace(star, '').trim();
        }
        var type = (el.type || '').toLowerCase();
        var msgEn = archiPickMessage(el.validity, type, 'en') || el.validationMessage || '';
        var msgKo = archiPickMessage(el.validity, type, 'ko') || el.validationMessage || '';
        var en = lbEn ? (lbEn + ': ' + msgEn) : msgEn;
        var ko = lbKo ? (lbKo + ': ' + msgKo) : msgKo;
        box.setAttribute('data-en', en);
        box.setAttribute('data-ko', ko);
        box.textContent = (archiFormLang() === 'ko' ? ko : en);
        box.style.display = 'block';
        if (window.applyLangAgain) { try { window.applyLangAgain(); } catch (e3) {} }
        if (!en && !ko) console.warn('archi: 막힌 칸 안내에 쓸 글이 비었다', el.id || el.name);
      }
    } catch (err) {}
  }, true);

  /* 고치면 표시를 거둔다 */
  document.addEventListener('input', function (e) {
    var el = e.target;
    if (el && el.getAttribute && el.getAttribute('aria-invalid') === 'true' && el.validity && el.validity.valid) {
      el.removeAttribute('aria-invalid');
    }
  }, true);
  /* 고치는 순간 우리 말을 지운다 — 안 지우면 칸이 영영 틀린 채로 남는다 */
  function clear(e) {
    var el = e.target;
    if (el && typeof el.setCustomValidity === 'function') el.setCustomValidity('');
  }
  document.addEventListener('input', clear, true);
  document.addEventListener('change', clear, true);
  /* 언어를 바꾸면 다음 경고부터 그 언어로 나온다 — 남아 있던 말은 지운다 */
  document.addEventListener('archinode:lang', function () {
    var list = document.querySelectorAll('input, select, textarea');
    for (var i = 0; i < list.length; i++) {
      if (typeof list[i].setCustomValidity === 'function') list[i].setCustomValidity('');
    }
  });

  /* ── A-520(브론즈 36차 N36-3): 글자 수 한도가 **말 없이 잘랐다** ──────────
     소싱 문의 이름 칸에 150자를 넣으면 100자만 남고, 자문 신청 회사명은 132자가
     120자가 된다. 화면은 아무 말도 안 한다 — 손님은 **자기가 적은 것이 잘린 줄
     모른 채** 보낸다. A-506·A-509 와 같은 결이다: 끊었으면 끊었다고 말해야 한다.

     `maxlength` 가 달린 칸을 찾아, 한도에 가까워지면 남은 글자 수를 보여 주고,
     붙여넣기가 실제로 잘리면 그 사실을 말한다. 칸마다 손보지 않고 한 자리에 둔다. */
  var NEAR = 0.8;          // 한도의 80% 를 넘으면 세어 보여 준다

  function fmLang() { return archiFormLang(); }
  function fmMsg(el) {
    var max = parseInt(el.getAttribute('maxlength'), 10);
    var len = (el.value || '').length;
    var left = max - len;
    return (fmLang() === 'ko')
      ? (left > 0 ? (len + ' / ' + max + '자') : (max + '자까지 입력할 수 있습니다 (꽉 찼습니다)'))
      : (left > 0 ? (len + ' / ' + max) : ('Limit reached — ' + max + ' characters max'));
  }
  function fmCounter(el, make) {
    var id = 'fmCount-' + (el.id || el.name || '');
    var box = el.parentNode && el.parentNode.querySelector('.fm-count');
    if (!box && make) {
      box = document.createElement('div');
      box.className = 'fm-count';
      box.id = id;
      box.setAttribute('aria-live', 'polite');
      if (el.parentNode) el.parentNode.appendChild(box);
      /* 읽어 주는 도구가 이 칸과 묶어 읽도록 — 숫자만 떠 있으면 무엇의 숫자인지 모른다 */
      try { el.setAttribute('aria-describedby', ((el.getAttribute('aria-describedby') || '') + ' ' + id).trim()); } catch (e) {}
    }
    return box;
  }
  function fmPaint(el) {
    var max = parseInt(el.getAttribute('maxlength'), 10);
    if (!max || max < 1) return;
    var len = (el.value || '').length;
    if (len < Math.floor(max * NEAR)) {
      var had = el.parentNode && el.parentNode.querySelector('.fm-count');
      if (had) had.textContent = '';
      return;
    }
    var box = fmCounter(el, true);
    if (box) { box.textContent = fmMsg(el); box.classList.toggle('full', len >= max); }
  }
  document.addEventListener('input', function (e) {
    var el = e.target;
    if (el && el.getAttribute && el.getAttribute('maxlength')) fmPaint(el);
  }, true);
  /* 붙여넣기는 한 번에 넘친다 — 잘린 글자 수를 **그 자리에서** 말한다 */
  document.addEventListener('paste', function (e) {
    var el = e.target;
    if (!el || !el.getAttribute || !el.getAttribute('maxlength')) return;
    var max = parseInt(el.getAttribute('maxlength'), 10);
    if (!max) return;
    var before = (el.value || '').length;
    var add = 0;
    try { add = ((e.clipboardData || window.clipboardData).getData('text') || '').length; } catch (err) { return; }
    var sel = Math.abs((el.selectionEnd || 0) - (el.selectionStart || 0));
    var cut = (before - sel + add) - max;
    if (cut <= 0) return;
    setTimeout(function () {
      var box = fmCounter(el, true);
      if (!box) return;
      box.textContent = (fmLang() === 'ko')
        ? (max + '자까지만 들어갑니다 — 붙여넣은 글에서 ' + cut + '자가 잘렸습니다.')
        : ('Only ' + max + ' characters fit — ' + cut + ' characters were cut from what you pasted.');
      box.classList.add('full');
    }, 0);
  }, true);
  /* 언어가 바뀌면 떠 있는 숫자도 그 언어로 */
  document.addEventListener('archinode:lang', function () {
    var list = document.querySelectorAll('[maxlength]');
    for (var i = 0; i < list.length; i++) fmPaint(list[i]);
  });

  var COOL = 5000; // 5초
  function tag(form){ return 'archi-form-locked-' + (form.id || form.action || 'anon'); }

  function showThrottleNotice(remainMs){
    var existing = document.getElementById('archiFormThrottleNotice');
    if (existing) existing.remove();
    /* A-517: 전에는 `localStorage` 만 보고 없으면 영어로 떨어졌다. 지금 화면의
       언어를 아는 정본은 `document.documentElement.lang` 이다(A-402). */
    var lang = archiFormLang();
    var seconds = Math.max(1, Math.ceil(remainMs / 1000));
    var msg = (lang === 'ko')
      ? ('방금 제출했습니다. ' + seconds + '초 후 다시 시도해 주세요.')
      : ('You just submitted this. Please try again in ' + seconds + 's.');
    var el = document.createElement('div');
    el.id = 'archiFormThrottleNotice';
    el.textContent = msg;
    el.setAttribute('role', 'status');
    el.style.cssText = 'position:fixed;left:50%;bottom:24px;transform:translateX(-50%);' +
      'background:#332e27;color:#fff;padding:10px 18px;border-radius:8px;font-size:0.85rem;' +
      'z-index:99999;box-shadow:0 4px 16px rgba(0,0,0,0.25);max-width:90vw;text-align:center;';
    document.body.appendChild(el);
    setTimeout(function(){ if (el.parentNode) el.remove(); }, remainMs + 500);
  }

  document.addEventListener('submit', function(e){
    var form = e.target;
    if (!(form instanceof HTMLFormElement)) return;
    var t = tag(form);
    var last = Number(sessionStorage.getItem(t) || 0);
    var elapsed = Date.now() - last;
    if (elapsed < COOL) {
      e.preventDefault();
      e.stopPropagation();
      showThrottleNotice(COOL - elapsed);
      return;
    }
    sessionStorage.setItem(t, String(Date.now()));
  }, true);
})();

/* ─────────────────────────────────────────────────────────────────────────
   A-614 (브론즈 45차 F-6): 새로고침·뒤로가기 한 번에 쓴 내용이 전부 사라졌다.
   실측: 이름·이메일 채우고 동의 켠 뒤 새로고침 → 전부 빈 값, 동의 false, 경고 없음.
   입점 신청은 필수칸 7개 + 카테고리라 손가락 한 번에 처음부터다.

   **초안을 저장하지 않는다.** 저장하면 이름·연락처가 손님 기기에 남고, 공용 PC
   라면 다음 사람이 본다 — 처리방침에도 적어야 하는 일이다. 그래서 떠나기 전에
   한 번 묻기만 한다(브라우저가 제 문구를 보여 주지는 않는다. 그건 브라우저 몫이다).

   한 칸짜리 구독 상자에서는 뜨지 않게 **두 칸 이상** 채워졌을 때만 건다.
   ───────────────────────────────────────────────────────────────────────── */
(function () {
  var armed = false;

  function visibleTyped(form) {
    var n = 0;
    var els = form.querySelectorAll('input, textarea, select');
    for (var i = 0; i < els.length; i++) {
      var el = els[i];
      if (el.offsetParent === null) continue;                      // 안 보이는 칸
      if (el.getAttribute('tabindex') === '-1') continue;          // 꿀단지(A-333)
      if (el.getAttribute('aria-hidden') === 'true') continue;
      var t = (el.type || '').toLowerCase();
      if (t === 'hidden' || t === 'submit' || t === 'button') continue;
      if (t === 'checkbox' || t === 'radio') { if (el.checked) n++; continue; }
      if (el.value && String(el.value).trim()) n++;
    }
    return n;
  }

  function anyFormTyped() {
    var forms = document.querySelectorAll('form');
    for (var i = 0; i < forms.length; i++) {
      if (visibleTyped(forms[i]) >= 2) return true;
    }
    return false;
  }

  function onBeforeUnload(e) {
    if (successShown()) return;         // A-622: 보냈으면 묻지 않는다
    if (!anyFormTyped()) return;        // 그 사이 비웠으면 묻지 않는다
    e.preventDefault();
    e.returnValue = '';                 // 구형 브라우저용
    return '';
  }

  function arm() {
    if (armed) return;
    armed = true;
    window.addEventListener('beforeunload', onBeforeUnload);
  }

  // 손님이 실제로 손을 댄 뒤에만 건다
  document.addEventListener('input', function (e) {
    if (e.target && e.target.form) arm();
  }, true);
  document.addEventListener('change', function (e) {
    if (e.target && e.target.form) arm();
  }, true);

  /* A-622(브론즈 46차 N46-5): 전에는 여기서 `submit` 을 보고 경고를 풀었다.
     그런데 그 처리는 ㄱ) **어느 폼이든** 제출되면 풀고 ㄴ) 제출이 **성공했는지
     보지 않았다**. 실측: 본 폼에 2칸 채워 경고가 켜진 뒤, 관계없는 폼 하나를
     제출시키자 경고가 꺼졌는데 본 폼은 여전히 내용을 들고 있었다. 캡차·네트워크로
     제출이 실패해 그 자리에 남는 경우가 바로 A-614 가 막으려던 상황인데, 그때
     경고가 이미 풀려 있었다.

     그래서 submit 으로 풀지 않는다. 대신 떠날 때 **지금 화면이 어떤지** 본다:
     ㄱ) 성공 안내가 보이면 묻지 않는다(보낸 것이다) — 이것이 진짜 「끝」 신호다.
     ㄴ) 폼이 성공 뒤 숨으면 그 칸들은 offsetParent 가 없어 아예 세지 않는다.
     그러니 실패해 남은 내용만 지켜진다. */
  function successShown() {
    var els = document.querySelectorAll('#formSuccess, #sourcingSuccessWrap, .form-success, [id$="SuccessWrap"]');
    for (var i = 0; i < els.length; i++) {
      if (els[i].offsetParent !== null) return true;
    }
    return false;
  }
})();
