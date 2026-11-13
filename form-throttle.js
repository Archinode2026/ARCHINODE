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

  function archiApplyMessage(el) {
    if (!el || typeof el.setCustomValidity !== 'function' || !el.validity) return;
    /* 먼저 비워야 **지금의 진짜 상태**가 보인다 — 비우지 않으면 한 번 틀린 칸이
       고친 뒤에도 계속 틀린 것으로 남는다. */
    el.setCustomValidity('');
    if (el.validity.valid) return;
    el.setCustomValidity(archiPickMessage(el.validity, (el.type || '').toLowerCase(), archiFormLang()));
  }

  document.addEventListener('invalid', function (e) { archiApplyMessage(e.target); }, true);
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
