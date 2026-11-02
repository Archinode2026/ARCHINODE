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
  var COOL = 5000; // 5초
  function tag(form){ return 'archi-form-locked-' + (form.id || form.action || 'anon'); }

  function showThrottleNotice(remainMs){
    var existing = document.getElementById('archiFormThrottleNotice');
    if (existing) existing.remove();
    var lang = 'en';
    try { lang = localStorage.getItem('archinode-lang') || localStorage.getItem('archinode-lang-auto') || 'en'; } catch(e) {}
    var seconds = Math.max(1, Math.ceil(remainMs / 1000));
    var msg = (lang === 'ko')
      ? ('방금 제출했습니다. ' + seconds + '초 후 다시 시도해 주세요.')
      : ('You just submitted this. Please try again in ' + seconds + 's.');
    var el = document.createElement('div');
    el.id = 'archiFormThrottleNotice';
    el.textContent = msg;
    el.setAttribute('role', 'status');
    el.style.cssText = 'position:fixed;left:50%;bottom:24px;transform:translateX(-50%);' +
      'background:#1a1a1a;color:#fff;padding:10px 18px;border-radius:8px;font-size:0.85rem;' +
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
