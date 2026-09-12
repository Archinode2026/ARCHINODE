// ARCHINODE — 브론즈용 1회용 로그인 브리지 (2026-09-12 신설, 단번 tools/reviewer-token.js 축약)
//
// 왜 필요한가: 에이전트는 비밀번호를 입력하지 못한다. 대신 Firebase 커스텀 토큰을 만들어 브라우저가
// signInWithCustomToken 으로 들어가게 한다. 토큰은 화면·파일·보고서 어디에도 남기지 않는다 —
// 이 스크립트가 잠깐 띄우는 로컬 주소(60초, 1회)를 브라우저로 열면 그 안에서만 쓰이고 사라진다.
// 인증은 tools/_cred.js (서비스 계정 키 → 없으면 Firebase CLI 로그인 재사용).
//
// 실행 (tools 폴더에서 npm install 먼저):
//   node tools/bronze-token.js                                  → qa-bronze@archinodekr.com → admin/dashboard.html
//   node tools/bronze-token.js --email qa-brand@archinodekr.com --to brand-portal/dashboard.html
//   node tools/bronze-token.js --uid <uid> --to auth/profile.html
//   node tools/bronze-token.js --site http://localhost:8477     → 로컬 서버로 (기본 https://archinodekr.com)
//   node tools/bronze-token.js --print-only                     → (진단용) 토큰 발급까지만 해보고 성공/실패만 출력
//
// 출력: `http://127.0.0.1:52719/enter?k=…` 한 줄. 60초 안에 한 번만 열린다. 열리면 대상 사이트의
// /auth/token-entry.html 로 토큰을 fragment(#)에 실어 넘긴다(서버로 전송되지 않고 그 페이지가 즉시 지운다). auth/token-entry.html 이 이 역할을 한다(2026-09-12).

const http = require('http');
const crypto = require('crypto');
const { initAdmin, arg } = require('./_cred');

const email = arg('--email', 'qa-bronze@archinodekr.com');
const uidArg = arg('--uid');
const to = arg('--to', 'admin/dashboard.html');
const site = (arg('--site', 'https://archinodekr.com')).replace(/\/$/, '');
const printOnly = process.argv.includes('--print-only');

(async () => {
  const { admin, how, who, from } = initAdmin();
  console.log(`[인증] ${how} (${who}) · firebase-admin ← ${from}`);
  let uid = uidArg;
  if (!uid) {
    try { uid = (await admin.auth().getUserByEmail(email)).uid; }
    catch (e) { console.error(`[중단] 계정 ${email} 이 없습니다. 먼저 node tools/make-qa-user.js 로 만드세요. (${e.code || e.message})`); process.exit(1); }
  }
  const token = await admin.auth().createCustomToken(uid);
  if (printOnly) { console.log(`[성공] 커스텀 토큰 발급됨 (길이 ${token.length}, 값은 출력하지 않음)`); process.exit(0); }

  const k = crypto.randomBytes(24).toString('base64url');
  let used = false;
  const server = http.createServer((req, res) => {
    const u = new URL(req.url, 'http://127.0.0.1:52719');
    if (u.pathname !== '/enter' || u.searchParams.get('k') !== k || used) { res.writeHead(404); res.end('만료되었거나 잘못된 주소입니다.'); return; }
    used = true;
    const target = `${site}/auth/token-entry.html#t=${encodeURIComponent(token)}&to=${encodeURIComponent(to)}`;
    res.writeHead(302, { Location: target, 'Cache-Control': 'no-store' });
    res.end();
    setTimeout(() => { server.close(); process.exit(0); }, 1500);
  });
  server.listen(52719, '127.0.0.1', () => {
    console.log(`\n브리지 주소 (60초 안에 한 번만, 보고에 옮겨 적지 말 것):\n  http://127.0.0.1:52719/enter?k=${k}\n  → 로그인 대상: ${uidArg ? 'uid ' + uid : email} → ${site}/${to}\n`);
    setTimeout(() => { if (!used) { console.log('[만료] 60초 안에 열리지 않아 종료합니다.'); server.close(); process.exit(2); } }, 60000);
  });
})().catch((e) => { console.error('[오류]', e.message || e); process.exit(1); });
