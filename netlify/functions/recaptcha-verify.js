// netlify/functions/recaptcha-verify.js
// A-004(2026-11-03): reCAPTCHA v3 토큰을 서버 쪽(Netlify Function)에서 검증한다.
// 비밀 키(RECAPTCHA_SECRET_KEY)는 Netlify 대시보드의 환경변수로만 설정한다 —
// 절대 이 파일이나 클라이언트 코드에 하드코딩하지 않는다(커밋되면 누구나 탈취 가능).
//
// 클라이언트는 POST { token, action } 를 보낸다.
// 응답: { ok: true, score } 또는 { ok: false, reason }

exports.handler = async function (event) {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ ok: false, reason: 'method-not-allowed' }) };
  }

  const secret = process.env.RECAPTCHA_SECRET_KEY;
  if (!secret) {
    console.error('[recaptcha-verify] RECAPTCHA_SECRET_KEY 환경변수가 설정되지 않음');
    return { statusCode: 500, body: JSON.stringify({ ok: false, reason: 'server-misconfigured' }) };
  }

  let token, expectedAction;
  try {
    const body = JSON.parse(event.body || '{}');
    token = body.token;
    expectedAction = body.action || '';
  } catch (e) {
    return { statusCode: 400, body: JSON.stringify({ ok: false, reason: 'bad-request' }) };
  }

  if (!token || typeof token !== 'string') {
    return { statusCode: 400, body: JSON.stringify({ ok: false, reason: 'missing-token' }) };
  }

  try {
    const params = new URLSearchParams();
    params.append('secret', secret);
    params.append('response', token);

    const resp = await fetch('https://www.google.com/recaptcha/api/siteverify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString()
    });
    const data = await resp.json();

    // reCAPTCHA v3: success(토큰 유효) + score(0.0~1.0, 높을수록 사람일 가능성 큼) + action(요청한 액션과 일치해야 함)
    if (!data.success) {
      return { statusCode: 200, body: JSON.stringify({ ok: false, reason: 'verification-failed', errors: data['error-codes'] || [] }) };
    }
    if (expectedAction && data.action && data.action !== expectedAction) {
      return { statusCode: 200, body: JSON.stringify({ ok: false, reason: 'action-mismatch' }) };
    }
    const score = typeof data.score === 'number' ? data.score : 0;
    const THRESHOLD = 0.5; // 구글 권장 기본값 — 너무 낮추면 봇 통과, 너무 높이면 정상 사용자도 막힘
    if (score < THRESHOLD) {
      return { statusCode: 200, body: JSON.stringify({ ok: false, reason: 'low-score', score: score }) };
    }

    return { statusCode: 200, body: JSON.stringify({ ok: true, score: score }) };
  } catch (e) {
    console.error('[recaptcha-verify] siteverify 호출 실패', e);
    return { statusCode: 502, body: JSON.stringify({ ok: false, reason: 'upstream-error' }) };
  }
};
