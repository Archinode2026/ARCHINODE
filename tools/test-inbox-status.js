/* 브랜드 포털 인박스의 **상태 흐름** 시험 (A-722).
 *
 * 승리님 결정(2026-11-26): 샘플은 브랜드가 한국 설계사에게 **직접** 보내고
 * 아키노드는 운임에 마진을 붙이지 않는다. 그래서 「발송함(shipped)」 상태를
 * 더했는데, **아무 데나 뜨면 안 된다** — 견적·소싱 문의에 「발송함」은 뜻이 없다.
 *
 * 이 시험이 지키는 것 셋:
 *   ① `shipped` 는 **샘플 요청에만** 뜬다
 *   ② 상태는 **앞으로만** 간다 (되돌리는 UI 를 만들지 않는다)
 *   ③ 포털의 조회 목록이 `firestore.rules` 의 목록과 **글자까지 같다**
 *      — 다르면 list 판정이 통과하지 않아 **인박스가 통째로 비어 보인다**
 */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');

const SRC = fs.readFileSync(path.join(ROOT, 'brand-portal/dashboard.html'), 'utf8');
const RULES = fs.readFileSync(path.join(ROOT, 'firestore.rules'), 'utf8');

let pass = 0, fail = 0;
function ok(name, cond) {
  if (cond) { pass++; } else { fail++; console.log('  x ' + name); }
}

/* 소스에서 필요한 조각만 떼어 낸다 — 파일 전체를 돌릴 수 없으므로. */
function grab(start, end) {
  const i = SRC.indexOf(start);
  if (i < 0) throw new Error('못 찾음: ' + start);
  const j = SRC.indexOf(end, i) + end.length;
  return SRC.slice(i, j);
}

const code = [
  grab('var INBOX_STATUSES =', '\n'),
  grab('var INBOX_NEXT =', '\n'),
  grab('function inbox_allowedNext', '\n}')
].join('\n');

eval(code + '\n;globalThis.__ib = { INBOX_STATUSES, INBOX_NEXT, inbox_allowedNext };');
const { INBOX_STATUSES, INBOX_NEXT, inbox_allowedNext } = globalThis.__ib;

// ── ① shipped 는 샘플 요청에만 ──────────────────────────────────────────
ok('샘플 요청이면 발송함을 고를 수 있다',
   inbox_allowedNext({ type: 'sample-request', status: 'assigned' }).indexOf('shipped') !== -1);
['quote', 'sourcing', 'brand-inquiry', 'dealer'].forEach(function (t) {
  ok('「' + t + '」 에는 발송함이 안 뜬다',
     inbox_allowedNext({ type: t, status: 'assigned' }).indexOf('shipped') === -1);
});
ok('유형이 없으면 발송함이 안 뜬다',
   inbox_allowedNext({ status: 'assigned' }).indexOf('shipped') === -1);
ok('it 가 없어도 터지지 않는다', Array.isArray(inbox_allowedNext(null)));

/* ★ A-730(브론즈 60차 ②ⓐ): **지금 상태가 선택지에 남아 있는가** 를 묻는 시험이
   없었다. 위 시험들이 전부 `status: 'assigned'` 로만 물어서, 「샘플이 아닌데 이미
   shipped 인 문서」라는 조합을 아무도 안 봤다.
   그 조합에서 거르개가 `shipped` 를 빼 버리면 선택지에 지금 값이 없고, 그러면
   `selected` 가 안 붙어 브라우저가 첫 선택지(`closed`)를 고른다 — 메모만 고치고
   저장해도 **상태가 조용히 종료로 넘어간다.** 앞으로만 가므로 되돌릴 수도 없다.
   조용한 고장이라 시험이 지킨다. */
['sample-request', 'quote', 'sourcing', 'brand-inquiry', 'dealer'].forEach(function (t) {
  Object.keys(INBOX_NEXT).forEach(function (st) {
    var list = inbox_allowedNext({ type: t, status: st });
    ok('지금 상태(' + st + ')가 ' + t + ' 의 선택지에 남아 있다', list.indexOf(st) !== -1);
    ok('선택지가 비지 않는다 (' + t + '/' + st + ')', list.length > 0);
  });
});

/* 어드민과 포털이 **같은 규칙**을 쓰는가 — A-728 이 어드민에만 예외를 넣었고
   A-730 이 포털에 같은 것을 넣었다. 글자로 확인한다(사본이 갈라지는 것이 지병이다). */
(function () {
  const vl = fs.readFileSync(path.join(ROOT, 'admin/js/view-leads.js'), 'utf8');
  ok('어드민도 「지금 상태가 shipped 면 남긴다」 예외를 쓴다',
     /it\.status\s*!==\s*'shipped'/.test(vl));
  ok('포털도 같은 예외를 쓴다', /it\.status\s*!==\s*'shipped'/.test(SRC));
})();

// ── ② 앞으로만 ────────────────────────────────────────────────────────
const ORDER = ['assigned', 'contacted', 'shipped', 'closed'];
Object.keys(INBOX_NEXT).forEach(function (from) {
  const fi = ORDER.indexOf(from);
  INBOX_NEXT[from].forEach(function (to) {
    ok('「' + from + '」 에서 「' + to + '」 로는 뒤로 안 간다', ORDER.indexOf(to) >= fi);
  });
});
ok('종료에서는 더 갈 곳이 없다', INBOX_NEXT.closed.join() === 'closed');
ok('발송함 뒤에는 종료만 남는다', INBOX_NEXT.shipped.join() === 'shipped,closed');

// ── ③ 말광이 흐름과 맞는다 ────────────────────────────────────────────
Object.keys(INBOX_NEXT).forEach(function (k) {
  ok('「' + k + '」 에 두 언어 이름표가 있다',
     !!(INBOX_STATUSES[k] && INBOX_STATUSES[k].en && INBOX_STATUSES[k].ko));
  INBOX_NEXT[k].forEach(function (to) {
    ok('「' + to + '」 도 이름표가 있다 (고를 수 있는데 이름이 없으면 안 된다)',
       !!INBOX_STATUSES[to]);
  });
});

// ── ④ ★ 조회 목록이 규칙과 글자까지 같다 ──────────────────────────────
//    여기가 어긋나면 인박스가 **통째로 비어 보인다**. 조용한 고장이라 시험이 지킨다.
const qm = SRC.match(/where\('status',\s*'in',\s*\[([^\]]*)\]\)/);
ok('포털에 조회 목록이 있다', !!qm);
const qList = qm ? qm[1].replace(/['\s]/g, '').split(',').sort().join(',') : '';

/* ★ `leads` 블록 **안에서만** 찾는다. 처음엔 파일 전체에서 첫 번째를 집었는데
   그게 `brands` 의 상태 목록(pending·approved·…)이어서 엉뚱한 실패가 났다.
   같은 모양의 글이 여러 컬렉션에 있으므로 범위를 좁혀야 한다. */
const LEADS = (function () {
  const i = RULES.indexOf('match /leads/{leadId} {');
  const j = RULES.indexOf('match /leads/{leadId}/internal', i);
  return RULES.slice(i, j > i ? j : i + 6000);
})();
const rm = LEADS.match(/resource\.data\.status in \[([^\]]*)\]/);
ok('규칙 leads 에 상태 목록이 있다', !!rm);
const rList = rm ? rm[1].replace(/['\s]/g, '').split(',').sort().join(',') : '';

ok('포털 조회 목록 = 규칙 목록 (' + qList + ')', qList === rList && qList.length > 0);
ok('그 목록에 shipped 가 있다', qList.indexOf('shipped') !== -1);

// 규칙의 **세 자리**가 모두 같은 목록을 쓴다 — 한 자리만 고치면 브랜드가
// 자기가 바꾼 건을 못 읽는다.
const all = LEADS.match(/status in \['assigned'[^\]]*\]/g) || [];
ok('규칙 안의 상태 목록 세 자리가 전부 같다 (' + all.length + '곳)',
   all.length === 3 && new Set(all).size === 1);

console.log('\n인박스 상태 — 시험 ' + (pass + fail) + '개, 실패 ' + fail + '개');
process.exit(fail ? 1 : 0);
