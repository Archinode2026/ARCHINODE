/* ARCHINODE Form Throttle (P3-9)
   폼 제출 후 5초간 재제출 차단. 봇 스팸/실수 재제출 완화.
   기존 폼 로직 방해 안 함 — 재제출만 차단.
*/
(function(){
  var COOL = 5000; // 5초
  function tag(form){ return 'archi-form-locked-' + (form.id || form.action || 'anon'); }
  document.addEventListener('submit', function(e){
    var form = e.target;
    if (!(form instanceof HTMLFormElement)) return;
    var t = tag(form);
    var last = Number(sessionStorage.getItem(t) || 0);
    if (Date.now() - last < COOL) {
      e.preventDefault();
      e.stopPropagation();
      return;
    }
    sessionStorage.setItem(t, String(Date.now()));
  }, true);
})();
