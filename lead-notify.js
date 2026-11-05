/* ══════════════════════════════════════════════════════════════════════════
   lead-notify.js — 새 리드가 들어오면 ARCHINODE 에 한 통 (A-263)

   왜 필요한가
     소싱 문의·브랜드 문의·제품 문의는 `leads` 에 쓰기만 하고 아무에게도 알리지
     않았다. 같은 사이트의 입점 신청·컨설팅·BIM 요청은 접수 즉시 office@ 로
     메일을 넣는데 리드 셋만 빠져 있어서, 어드민이 리드 인박스를 열어보기
     전까지 문의가 며칠 묵을 수 있었다. 가장 돈이 되는 문의인데.

   지키는 것
     1. **접수를 막지 않는다.** 리드는 이미 저장된 뒤에 부른다. 기다리지도 않고
        (await 하지 않는다), 실패해도 삼킨다 — 메일이 안 간다고 문의가 실패한
        것처럼 보이면 그게 더 나쁘다.
     2. **제목 200자 제한.** firestore.rules 의 mail 규칙이 subject < 200 을
        요구한다. 넘으면 조용히 거부된다(A-?? 의 같은 함정) — 180 에서 자른다.
     3. **보내는 쪽 도메인.** 수신은 office@archinode.org 로 받지만, 발송
        FROM 은 확장 설정의 archinodekr.com 이다. archinode.org 로 보내면
        Resend 가 550(도메인 미검증)으로 거절한다 — 2026-11-02 에 실제로 겪었다.
   ══════════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  var ADMIN_TO = 'office@archinode.org';
  var ADMIN_URL = 'https://archinodekr.com/admin/dashboard.html#leads';

  // 실제로 쓰이는 키만 — sourcing-inquiry 는 'sourcing', brands/view 는 'brand-inquiry',
  // products/view 는 RFQ_COPY 의 'quote' | 'sample-request'. 어드민 LEAD_TYPES 와 같은 말로 둔다.
  var TYPE_LABEL = {
    'sourcing':       '소싱 문의',
    'brand-inquiry':  '브랜드 문의',
    'quote':          '견적 요청',
    'sample-request': '샘플 요청',
    'dealer':         '딜러 연결'
  };

  function cut(s, n) {
    s = String(s == null ? '' : s);
    return s.length > n ? s.slice(0, n) + '…' : s;
  }

  /* lead = leads 에 넣은 그 객체 그대로 넘기면 된다. */
  window.notifyNewLead = function (lead) {
    try {
      if (typeof db === 'undefined' || !db) return;
      lead = lead || {};
      var label = TYPE_LABEL[lead.type] || String(lead.type || '문의');
      var who = String(lead.brandName || '').trim();

      var subject = ('[ARCHINODE] 새 리드 — ' + label + (who ? ' / ' + who : '')).substring(0, 180);

      var lines = [
        '새 리드가 접수됐습니다.',
        '',
        '유형: ' + label,
        '보낸 사람: ' + String(lead.name || '-') + (lead.company ? ' (' + String(lead.company) + ')' : ''),
        '이메일: ' + String(lead.email || '-')
      ];
      if (who) lines.push('브랜드: ' + who);
      if (lead.productName) lines.push('제품: ' + String(lead.productName));
      if (lead.category) lines.push('카테고리: ' + String(lead.category));
      lines = lines.concat([
        '',
        '내용:',
        cut(lead.message, 600),
        '',
        '들어온 곳: ' + String(lead.source || '-'),
        '',
        '리드 인박스에서 브랜드에 배정하세요:',
        ADMIN_URL
      ]);

      // 기다리지 않는다. 접수는 이미 끝난 일이다.
      db.collection('mail').add({
        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
        to: ADMIN_TO,
        message: { subject: subject, text: lines.join('\n') }
      }).catch(function (err) {
        console.warn('[lead] admin notification skipped:', err);
      });
    } catch (err) {
      console.warn('[lead] admin notification skipped:', err);
    }
  };

  /* ──────────────────────────────────────────────────────────────────────
     A-299: 브랜드 포털의 「ARCHINODE 에 문의」(1:1 문의)도 같은 구멍이었다.

     `brand-portal/dashboard.html` 은 `inquiries` 에 쓰기만 하고 아무에게도
     알리지 않았다. 어드민이 로그인해서 인박스를 열어봐야만 보인다. 그런데
     제출 직후 화면은 「보냈습니다. 답변은 여기와 이메일로 드립니다」라고
     말한다 — 받는 쪽에 아무 신호도 안 가는데 말이다.

     답변 쪽은 이미 메일을 만든다(`view-inquiries.js` 의 `inq_sendAnswerMail`).
     즉 나가는 길은 있고 **들어오는 길만 비어 있었다.** 리드(A-263)와 똑같은
     모양이라 같은 파일·같은 규율로 붙인다: 기다리지 않고, 실패하면 삼키고,
     제목은 180 에서 자른다.
     ────────────────────────────────────────────────────────────────────── */
  window.notifyNewInquiry = function (inq) {
    try {
      if (typeof db === 'undefined' || !db) return;
      inq = inq || {};
      var who = String(inq.fromName || '').trim();
      var subject = ('[ARCHINODE] 새 문의 — ' + cut(String(inq.subject || '제목 없음'), 90)
                     + (who ? ' / ' + who : '')).substring(0, 180);

      var lines = [
        '브랜드 포털에서 1:1 문의가 들어왔습니다.',
        '',
        '제목: ' + String(inq.subject || '-'),
        '보낸 사람: ' + (who || '-') + ' (' + String(inq.fromEmail || '-') + ')',
        '역할: ' + String(inq.fromRole || '-'),
        '',
        '내용:',
        cut(inq.body, 600),
        '',
        '어드민에서 답변하세요 (답변하면 문의자에게 메일이 갑니다):',
        'https://archinodekr.com/admin/dashboard.html#inquiries'
      ];

      db.collection('mail').add({
        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
        to: ADMIN_TO,
        message: { subject: subject, text: lines.join('\n') }
      }).catch(function (err) {
        console.warn('[inquiry] admin notification skipped:', err);
      });
    } catch (err) {
      console.warn('[inquiry] admin notification skipped:', err);
    }
  };
})();
