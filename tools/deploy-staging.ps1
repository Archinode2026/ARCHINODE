# ARCHINODE — 스테이징(미리보기) 배포 (2026-09-12 신설, 단번 tools/deploy-staging.ps1 축약)
#
# 사용법:
#   powershell -ExecutionPolicy Bypass -File tools\deploy-staging.ps1              # 워킹트리 그대로 → 미리보기 채널 "staging"
#   powershell -ExecutionPolicy Bypass -File tools\deploy-staging.ps1 -Channel pr-leads -Expires 3d
#
# 원리: GitHub Pages 는 브랜치 하나만 서비스하므로 스테이징이 없다. 같은 Firebase 프로젝트(archinode-8ab04)의
#       Hosting 「미리보기 채널」에 현재 폴더를 올리면 임시 주소(https://archinode-8ab04--staging-XXXX.web.app)가 나온다.
#       Firestore/Auth 는 라이브와 같은 프로젝트를 쓴다 — 스테이징에서 쓴 데이터도 실데이터다. 반드시 [테스트-○○] 표시.
#
# 첫 실행 전 (한울님 또는 지휘 창, 한 번만):
#   1. npx firebase-tools login   (브라우저 로그인)
#   2. Firebase 콘솔 > Authentication > Settings > 승인된 도메인에 미리보기 도메인 추가
#      (안 하면 스테이징에서 로그인이 막힐 수 있다 — 2026-09-12 기준 확인 못 함)
#   3. firebase.json 의 ignore 목록에 내부 문서 폴더가 들어 있는지 확인 (archi-diary·docs·sales 등은 올라가면 안 된다)

param(
    [string]$Channel = 'staging',
    [string]$Expires = '7d'
)

$ErrorActionPreference = 'Stop'
$ProjectId = 'archinode-8ab04'

Set-Location (Split-Path -Parent $PSScriptRoot)

if (-not (Test-Path 'firebase.json')) {
    Write-Host '[중단] firebase.json 이 없습니다. 리포 루트에서 실행하세요.' -ForegroundColor Red
    exit 1
}

Write-Host ''
Write-Host '=================================================' -ForegroundColor Yellow
Write-Host "  스테이징 배포: 채널 '$Channel' (프로젝트 $ProjectId, $Expires 뒤 만료)" -ForegroundColor Yellow
Write-Host '  ※ 라이브(archinodekr.com)에는 아무 영향 없음. Firestore 는 라이브와 공유됨.' -ForegroundColor Yellow
Write-Host '=================================================' -ForegroundColor Yellow
Write-Host ''

$log = Join-Path $env:TEMP 'archinode-staging.log'
if (Test-Path $log) { Remove-Item $log -Force }

npx firebase-tools hosting:channel:deploy $Channel --project $ProjectId --expires $Expires | Tee-Object -FilePath $log | Out-Host
$code = $LASTEXITCODE
$text = ''
if (Test-Path $log) { $text = Get-Content $log -Raw }

if ($code -ne 0) {
    Write-Host "[실패] firebase 종료 코드 $code. 로그인(npx firebase-tools login)이 안 됐거나 권한이 없을 수 있습니다." -ForegroundColor Red
    exit 1
}

$m = [regex]::Match($text, 'https://[a-z0-9\-]+--' + [regex]::Escape($Channel) + '-[a-z0-9]+\.web\.app')
if ($m.Success) {
    Write-Host ''
    Write-Host '=================================================' -ForegroundColor Green
    Write-Host "  스테이징 주소: $($m.Value)" -ForegroundColor Green
    Write-Host "  만료: $Expires 뒤 (다시 실행하면 갱신)" -ForegroundColor Green
    Write-Host '=================================================' -ForegroundColor Green
    exit 0
}

Write-Host '[주의] 배포는 됐지만 출력에서 미리보기 주소를 못 찾았습니다. 위 로그에서 "Channel URL" 을 확인하세요.' -ForegroundColor Yellow
exit 0
