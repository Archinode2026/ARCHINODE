// ARCHINODE — 관리 스크립트 공용 인증 (2026-09-12)
//
// 조직 정책이 서비스 계정 키 생성을 막고 있어(콘솔: "이 서비스 계정에서는 키를 만들 수 없습니다"),
// 두 갈래로 인증한다. 우선순위:
//   1) --key <경로> 또는 폴더 C:\이한울 작업 공간\API 키 관리\archinode 서비스계정키\*.json 이 있으면 서비스 계정 키
//   2) 없으면 이 PC 의 Firebase CLI 로그인(office@archinode.org, `firebase login:add`)이 남긴 refresh token 을
//      Admin SDK 의 refreshToken 자격증명으로 쓴다. 이건 firebase CLI 자신이 쓰는 것과 같은 인증이다.
//      커스텀 토큰(브론즈 로그인)은 서비스 계정 서명이 필요하므로 serviceAccountId 를 지정해 IAM signBlob 로 서명한다
//      (프로젝트 소유자 계정이면 권한이 있다).
//
// firebase-admin 모듈은 tools/node_modules 에 없으면 EX Works 의 functions/node_modules 것을 빌려 쓴다
// (엑사 tools/scan-test-data.js 와 같은 방식 — 이 PC 에서 npm install 이 막혀 있을 때를 위해).
// 토큰·키 값은 절대 콘솔에 출력하지 않는다.

const fs = require('fs');
const path = require('path');
const os = require('os');

const PROJECT_ID = 'archinode-8ab04';
const ADMIN_SDK_SA = 'firebase-adminsdk-fbsvc@archinode-8ab04.iam.gserviceaccount.com';
const KEY_DIR = 'C:\\이한울 작업 공간\\API 키 관리\\archinode 서비스계정키';
const CLI_ACCOUNT = 'office@archinode.org';
// firebase-tools 가 공개 소스에 박아둔 OAuth 클라이언트 (설치형 앱용 — 비밀이 아니다)
const CLI_CLIENT_ID = '563584335869-fgrhgmd47bqnekij5i8b5pr03ho849e6.apps.googleusercontent.com';
const CLI_CLIENT_SECRET = 'j9iVZfS8kkCEFUPaAeJV0sAi';
const FALLBACK_MODULE_DIRS = [
  path.join(__dirname, 'node_modules'),
  'C:\\이한울 작업 공간\\EXA HOLDINGS\\01 통합관리시스템\\functions\\node_modules',
  'C:\\Users\\wool2\\OneDrive\\Desktop\\이한울 코딩\\THE BIDDING\\functions\\node_modules',
  'C:\\Users\\wool2\\OneDrive\\Desktop\\이한울 코딩\\THE BIDDING\\tools\\node_modules',
];

function arg(name, def) { const i = process.argv.indexOf(name); return i > -1 && process.argv[i + 1] ? process.argv[i + 1] : def; }

function loadAdmin() {
  for (const dir of FALLBACK_MODULE_DIRS) {
    try { return { admin: require(path.join(dir, 'firebase-admin')), from: dir }; } catch (_) { /* 다음 */ }
  }
  try { return { admin: require('firebase-admin'), from: 'global' }; } catch (_) { /* 없음 */ }
  throw new Error('firebase-admin 을 찾지 못했습니다. tools 폴더에서 `npm install` 하거나, EX Works functions/node_modules 가 있는지 확인하세요.');
}

function findKeyFile() {
  const explicit = arg('--key');
  if (explicit) return path.resolve(explicit);
  try {
    const files = fs.readdirSync(KEY_DIR).filter((f) => f.toLowerCase().endsWith('.json'));
    if (files.length) return path.join(KEY_DIR, files[0]);
  } catch (_) { /* 폴더 없음 */ }
  return null;
}

function findCliRefreshToken() {
  const cfg = path.join(os.homedir(), '.config', 'configstore', 'firebase-tools.json');
  if (!fs.existsSync(cfg)) return null;
  const j = JSON.parse(fs.readFileSync(cfg, 'utf8'));
  const accounts = [];
  if (j.user && j.tokens) accounts.push({ email: j.user.email, tokens: j.tokens });
  for (const a of (j.additionalAccounts || [])) accounts.push({ email: a.user && a.user.email, tokens: a.tokens });
  const pick = accounts.find((a) => a.email === CLI_ACCOUNT) || accounts[0];
  return pick && pick.tokens && pick.tokens.refresh_token ? { email: pick.email, refresh_token: pick.tokens.refresh_token } : null;
}

// admin 을 로드·초기화해 돌려준다. { admin, how, who } — how: 'service-account' | 'cli-refresh-token'
function initAdmin(adminIn) {
  const { admin, from } = adminIn ? { admin: adminIn, from: 'caller' } : loadAdmin();
  const keyFile = findKeyFile();
  if (keyFile) {
    const sa = require(keyFile);
    if (sa.project_id !== PROJECT_ID) throw new Error(`이 열쇠는 "${sa.project_id}" 의 것입니다. ${PROJECT_ID} 가 아닙니다.`);
    admin.initializeApp({ credential: admin.credential.cert(sa), projectId: PROJECT_ID });
    return { admin, how: 'service-account', who: sa.client_email, from };
  }
  const rt = findCliRefreshToken();
  if (!rt) throw new Error('서비스 계정 키도, Firebase CLI 로그인(office@archinode.org)도 없습니다. `npx firebase-tools login:add` 를 먼저 하세요.');
  admin.initializeApp({
    credential: admin.credential.refreshToken({ type: 'authorized_user', client_id: CLI_CLIENT_ID, client_secret: CLI_CLIENT_SECRET, refresh_token: rt.refresh_token }),
    projectId: PROJECT_ID,
    serviceAccountId: ADMIN_SDK_SA, // createCustomToken 이 IAM signBlob 로 서명할 때 쓴다
  });
  return { admin, how: 'cli-refresh-token', who: rt.email, from };
}

module.exports = { initAdmin, loadAdmin, PROJECT_ID, ADMIN_SDK_SA, arg };
