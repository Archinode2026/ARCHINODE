# ARCHINODE — 배포 스크립트 (2026-09-12 신설, 엑사 tools/deploy.ps1을 GitHub Pages에 맞게 옮김)
#
# 사용법:
#   powershell -ExecutionPolicy Bypass -File tools\deploy.ps1                 # push + 바뀐 파일 라이브 대조
#   powershell -ExecutionPolicy Bypass -File tools\deploy.ps1 -CheckString getUniqueSlug -CheckPath list-your-brand.html
#   powershell -ExecutionPolicy Bypass -File tools\deploy.ps1 -NoPush          # push는 이미 했고 라이브 대조만
#   powershell -ExecutionPolicy Bypass -File tools\deploy.ps1 -TimeoutMin 15
#
# 이 사이트는 GitHub Pages라 「배포 = main에 push」다. 이 스크립트가 하는 일:
#   1. 브랜치가 main인지, 미커밋 변경이 없는지, 올릴 커밋이 있는지 확인
#   2. 올라갈 커밋에 firestore.rules 변경이 있으면 빨간 경고 (push로는 절대 반영 안 됨 — Firebase 콘솔 게시는 한울님 손)
#   3. git push origin main
#   4. GitHub Pages 반영(5~10분)을 기다리며, 바뀐 파일을 라이브에서 받아 로컬과 해시 대조
# 배포는 반드시 이 스크립트로만 한다. 손으로 push하면 4번(라이브 대조)이 빠진다.

param(
    [switch]$Rules,           # firestore.rules 를 Firebase CLI로 게시 (2026-09-12부터 가능 — office@archinode.org 로 login:use 됨)
    [switch]$NoPush,          # push 생략, 라이브 대조만
    [string]$CheckString,     # 라이브 페이지에 이 문자열이 몇 번 나오는지 추가 확인
    [string]$CheckPath = '',  # CheckString을 찾을 경로 (기본: 루트 index.html)
    [int]$TimeoutMin = 12,    # 라이브 반영 대기 최대 분
    [int]$MaxFiles = 8        # 해시 대조할 파일 최대 수
)

$ErrorActionPreference = 'Stop'
$LiveUrl = 'https://archinodekr.com'

# 리포 루트(이 스크립트의 상위 폴더)에서 실행
Set-Location (Split-Path -Parent $PSScriptRoot)

Write-Host ''
Write-Host '=================================================' -ForegroundColor Red
Write-Host "  배포 대상: ARCHINODE 라이브 ($LiveUrl, GitHub Pages)" -ForegroundColor Red
Write-Host '=================================================' -ForegroundColor Red
Write-Host ''

# ── 1. 브랜치·워킹트리·커밋 확인 ──
$branch = git branch --show-current
if ($branch -ne 'main') {
    Write-Host "[중단] 지금 브랜치는 '$branch'입니다. 배포는 반드시 main에서만 합니다." -ForegroundColor Red
    exit 1
}

$dirty = git status --porcelain
if ($dirty -and $NoPush) {
    Write-Host "[안내] 미커밋 변경 $(@($dirty).Count)건이 있지만 -NoPush(대조만)라 계속합니다. 대조 기준은 커밋된 내용입니다." -ForegroundColor Yellow
}
if ($dirty -and -not $NoPush) {
    Write-Host '[중단] 미커밋 변경이 있습니다. 배포는 커밋된 것만 올립니다. 먼저 커밋하거나 되돌리세요:' -ForegroundColor Red
    $dirty | ForEach-Object { Write-Host "       $_" -ForegroundColor Yellow }
    exit 1
}

git fetch origin main --quiet
$aheadBehind = (git rev-list --left-right --count "origin/main...main") -split '\s+'
$behind = [int]$aheadBehind[0]; $ahead = [int]$aheadBehind[1]
if ($behind -gt 0) {
    Write-Host "[중단] 원격(origin/main)이 로컬보다 $behind 커밋 앞서 있습니다. 먼저 git pull 하세요 (다른 곳에서 push된 것이 있습니다)." -ForegroundColor Red
    exit 1
}

if (-not $NoPush -and $ahead -eq 0) {
    Write-Host '[안내] 올릴 커밋이 없습니다 (로컬 = 원격). 라이브 대조만 진행합니다.' -ForegroundColor Yellow
    $NoPush = $true
}

# 대조할 파일 목록: 올라갈 커밋(또는 -NoPush면 최근 커밋 1개)에서 바뀐 정적 파일
if ($ahead -gt 0) { $range = "origin/main..main" } else { $range = "HEAD~1..HEAD" }
$changed = git diff --name-only --diff-filter=AM $range |
    Where-Object { $_ -match '\.(html|js|css|json|xml|txt)$' -and $_ -notmatch '^(docs|archi-diary|tools|scripts|sales|silvia|\.claude)/' }
$rulesChanged = (git diff --name-only $range | Where-Object { $_ -eq 'firestore.rules' })

Write-Host "[확인] 브랜치 main · 미커밋 0 · 올릴 커밋 $ahead 개 · 대조할 정적 파일 $($changed.Count) 개" -ForegroundColor Cyan
if ($ahead -gt 0) { git log --oneline $range | ForEach-Object { Write-Host "       $_" } }

# ── 2. firestore.rules — -Rules 면 CLI로 게시, 아니면 경고 ──
if ($Rules) {
    Write-Host '[규칙] firestore.rules 를 Firebase 에 게시합니다 (프로젝트 archinode-8ab04). 넓히기/좁히기를 컬렉션마다 나눠 판단했습니까?' -ForegroundColor Yellow
    $log = Join-Path $env:TEMP 'archinode-deploy-rules.log'
    npx firebase-tools deploy --only firestore:rules --project archinode-8ab04 | Tee-Object -FilePath $log | Out-Host
    $rtext = ''
    if (Test-Path $log) { $rtext = Get-Content $log -Raw }
    if ($null -eq $rtext) { $rtext = '' }
    if ($LASTEXITCODE -ne 0 -or ($rtext -notmatch 'Deploy complete')) {
        Write-Host '[실패] 규칙 게시가 끝까지 가지 못했습니다. 위 로그를 확인하고 다시 실행하세요. (push는 아직 안 했습니다)' -ForegroundColor Red
        exit 1
    }
    Write-Host '[규칙] 게시 완료.' -ForegroundColor Green
    $rulesChanged = $null
}
if ($rulesChanged) {
    Write-Host ''
    Write-Host '#################################################################' -ForegroundColor Red
    Write-Host '#  firestore.rules 가 바뀐 커밋입니다.                            #' -ForegroundColor Red
    Write-Host '#  push 로는 절대 반영되지 않습니다.                              #' -ForegroundColor Red
    Write-Host '#  → 한울님이 Firebase 콘솔 > Firestore > Rules 에 전체 복사·게시  #' -ForegroundColor Red
    Write-Host '#  → 이 사실을 보고 맨 위에 적을 것                               #' -ForegroundColor Red
    Write-Host '#################################################################' -ForegroundColor Red
    Write-Host ''
}

# ── 3. push ──
if (-not $NoPush) {
    Write-Host '[push] git push origin main' -ForegroundColor Cyan
    git push origin main
    if ($LASTEXITCODE -ne 0) {
        Write-Host '[실패] push가 실패했습니다. 원인을 고친 뒤 다시 실행하세요.' -ForegroundColor Red
        exit 1
    }
    Write-Host '[push] 완료. GitHub Pages 빌드를 기다립니다 (보통 1~10분).' -ForegroundColor Green
}

# ── 4. 라이브 대조 ──
function Get-LiveBytes($path) {
    try {
        $r = Invoke-WebRequest -Uri "$LiveUrl/$path" -UseBasicParsing -Headers @{ 'Cache-Control' = 'no-cache'; 'Pragma' = 'no-cache' } -TimeoutSec 30
        return $r.Content
    } catch { return $null }
}
function Get-Md5Text($text) {
    if ($null -eq $text) { return '' }
    $bytes = [System.Text.Encoding]::UTF8.GetBytes(($text -replace "`r`n", "`n"))
    $md5 = [System.Security.Cryptography.MD5]::Create()
    return ([BitConverter]::ToString($md5.ComputeHash($bytes)) -replace '-', '').ToLower()
}
function Get-LocalMd5($path) {
    $text = Get-Content -Raw -Encoding UTF8 $path
    return Get-Md5Text $text
}

$targets = @($changed | Select-Object -First $MaxFiles)
if ($targets.Count -eq 0 -and -not $CheckString) {
    Write-Host '[대조] 대조할 정적 파일이 없습니다 (문서·도구만 바뀜). 끝.' -ForegroundColor Yellow
    exit 0
}

$deadline = (Get-Date).AddMinutes($TimeoutMin)
$pending = @{}
foreach ($t in $targets) { $pending[$t] = Get-LocalMd5 $t }
$matched = @()
$checkOk = $false
$round = 0

while ((Get-Date) -lt $deadline) {
    $round++
    foreach ($t in @($pending.Keys)) {
        $live = Get-LiveBytes $t
        if ($null -ne $live) {
            $h = Get-Md5Text ([string]$live)
            if ($h -eq $pending[$t]) { $matched += $t; $pending.Remove($t) }
        }
    }
    if ($CheckString -and -not $checkOk) {
        $body = Get-LiveBytes $CheckPath
        if ($null -ne $body) {
            $count = ([regex]::Matches([string]$body, [regex]::Escape($CheckString))).Count
            if ($count -gt 0) { $checkOk = $true; Write-Host "[대조] '$CheckString' 이(가) $LiveUrl/$CheckPath 에 $count 번 — 반영됨" -ForegroundColor Green }
        }
    }
    $remain = $pending.Count + $(if ($CheckString -and -not $checkOk) { 1 } else { 0 })
    if ($remain -eq 0) { break }
    Write-Host ("[대기] {0}회차 · 아직 다른 파일 {1}개 · {2:HH:mm:ss}" -f $round, $pending.Count, (Get-Date)) -ForegroundColor DarkGray
    Start-Sleep -Seconds 30
}

Write-Host ''
Write-Host '=================================================' -ForegroundColor Green
Write-Host "  라이브 대조 결과 ($LiveUrl)" -ForegroundColor Green
Write-Host '=================================================' -ForegroundColor Green
foreach ($m in $matched) { Write-Host "  [일치]   $m" -ForegroundColor Green }
foreach ($p in $pending.Keys) { Write-Host "  [불일치] $p  ← $TimeoutMin 분 안에 라이브가 로컬과 같아지지 않음" -ForegroundColor Red }
if ($CheckString -and -not $checkOk) { Write-Host "  [불일치] '$CheckString' 을(를) $LiveUrl/$CheckPath 에서 못 찾음" -ForegroundColor Red }
if ($rulesChanged) { Write-Host '  [주의]   firestore.rules 는 콘솔 게시 전까지 반영 안 됨 — 한울님' -ForegroundColor Red }

if ($pending.Count -gt 0 -or ($CheckString -and -not $checkOk)) {
    Write-Host ''
    Write-Host '  불일치가 있습니다. GitHub 저장소 Actions 탭에서 pages 빌드가 실패했는지 확인하거나, 몇 분 뒤 -NoPush 로 다시 대조하세요.' -ForegroundColor Yellow
    exit 2
}
exit 0
