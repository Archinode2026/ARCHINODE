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

# A-351: 콘솔이 UTF-8 이 아니면 한글 커밋 메시지가 깨져 나온다(2026-11-06 실측).
try { [Console]::OutputEncoding = [System.Text.Encoding]::UTF8 } catch {}
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
$rulesChanged = (git diff --name-only $range | Where-Object { $_ -eq 'firestore.rules' -or $_ -eq 'storage.rules' })   # A-276: storage.rules 도 본다

Write-Host "[확인] 브랜치 main · 미커밋 0 · 올릴 커밋 $ahead 개 · 대조할 정적 파일 $($changed.Count) 개" -ForegroundColor Cyan
if ($ahead -gt 0) { git log --oneline $range | ForEach-Object { Write-Host "       $_" } }

# ── 1.5 어드민 JS/CSS 캐시 스탬프 확인 (A-033) ──
# admin/js/*.js 또는 admin/admin.css 가 바뀐 커밋인데, admin/*.html 안의 해당 <script>/<link>
# ?v= 캐시 스탬프가 같은 커밋 범위에서 안 올라갔으면 경고. 방문자(관리자) 브라우저가 캐시된
# 옛 파일을 계속 쓰면서 새 함수를 못 찾아 화면이 멈추는 사고(6단계에서 실제 발생)를 막기 위함.
$adminAssetsChanged = git diff --name-only $range | Where-Object { $_ -match '^admin/js/.*\.js$' -or $_ -eq 'admin/admin.css' }
if ($adminAssetsChanged) {
    $htmlVersionDiff = git diff $range -- 'admin/*.html' | Select-String -Pattern '^\+.*\?v=\d+'
    if (-not $htmlVersionDiff) {
        Write-Host ''
        Write-Host '#################################################################' -ForegroundColor Yellow
        Write-Host '#  경고: admin/js 또는 admin/admin.css 가 바뀌었는데                #' -ForegroundColor Yellow
        Write-Host '#  admin/*.html 의 ?v= 캐시 스탬프는 안 올라간 것 같습니다.          #' -ForegroundColor Yellow
        Write-Host '#  관리자 브라우저가 캐시된 옛 파일을 계속 쓸 수 있습니다.           #' -ForegroundColor Yellow
        Write-Host '#  바뀐 파일:                                                      #' -ForegroundColor Yellow
        $adminAssetsChanged | ForEach-Object { Write-Host "#    $_" -ForegroundColor Yellow }
        Write-Host '#################################################################' -ForegroundColor Yellow
        Write-Host ''
        $confirm = Read-Host '그래도 계속 진행하시겠습니까? (?v= 값을 안 올렸다면 N 권장) (y/N)'
        if ($confirm -ne 'y' -and $confirm -ne 'Y') {
            Write-Host '[중단] admin/*.html 의 관련 <script src>/<link> ?v= 값을 올린 뒤 다시 커밋하고 실행하세요.' -ForegroundColor Red
            exit 1
        }
    }
}

# ── 2. firestore.rules — -Rules 면 CLI로 게시, 아니면 경고 ──
if ($Rules) {
    Write-Host '[규칙] firestore.rules 를 Firebase 에 게시합니다 (프로젝트 archinode-8ab04). 넓히기/좁히기를 컬렉션마다 나눠 판단했습니까?' -ForegroundColor Yellow
    $log = Join-Path $env:TEMP 'archinode-deploy-rules.log'
    # A-276(2026-11-05): storage.rules 도 함께 게시한다. 전에는 firestore 만 올려서,
    # Storage 규칙을 고쳐 놓고 따로 올리는 걸 잊어 "고쳤는데 그대로" 가 났다.
    # A-351(2026-11-06): 전에는 'firestore:rules,storage' 를 **한 번에** 올렸다. A-276 이
    # 「Storage 규칙을 따로 올리는 걸 잊는 사고」를 막으려고 묶은 것인데, 묶는 순간
    # **storage 쪽 실패가 firestore 까지 끌고 내려가는 단일 실패점**이 됐다.
    # 실제로 2026-11-06 에 그 일이 났다 — CLI 가 storage 배포 전에 Storage API 사용 권한을
    # 확인하다 403(serviceusage.serviceUsageConsumer 없음)을 받고 멈추는 바람에,
    # 아무 문제 없던 firestore.rules 가 사흘째 미발행으로 남아 있었다(A-315·A-350).
    # 그래서 **따로 올리고 따로 보고한다.** 중요한 쪽(firestore)을 먼저 올린다.
    $okFs = $false; $okSt = $null

    Write-Host '[규칙] (1/2) firestore:rules 게시' -ForegroundColor Yellow
    npx firebase-tools deploy --only firestore:rules --project archinode-8ab04 | Tee-Object -FilePath $log | Out-Host
    $rtext = ''
    if (Test-Path $log) { $rtext = Get-Content $log -Raw }
    if ($null -eq $rtext) { $rtext = '' }
    $okFs = ($LASTEXITCODE -eq 0 -and $rtext -match 'Deploy complete')
    if ($okFs) { Write-Host '[규칙] firestore.rules 게시 완료.' -ForegroundColor Green }
    else       { Write-Host '[실패] firestore.rules 게시가 끝까지 가지 못했습니다. 위 로그를 보세요.' -ForegroundColor Red }

    if (Test-Path (Join-Path $PSScriptRoot '..\storage.rules')) {
        Write-Host '[규칙] (2/2) storage 게시' -ForegroundColor Yellow
        $logSt = Join-Path $env:TEMP 'archinode-deploy-storage.log'
        npx firebase-tools deploy --only storage --project archinode-8ab04 | Tee-Object -FilePath $logSt | Out-Host
        $stext = ''
        if (Test-Path $logSt) { $stext = Get-Content $logSt -Raw }
        if ($null -eq $stext) { $stext = '' }
        $okSt = ($LASTEXITCODE -eq 0 -and $stext -match 'Deploy complete')
        if ($okSt) { Write-Host '[규칙] storage.rules 게시 완료.' -ForegroundColor Green }
        else {
            Write-Host '' 
            Write-Host '#################################################################' -ForegroundColor Yellow
            Write-Host '#  storage 게시 실패 — firestore 는 위 결과대로입니다.            #' -ForegroundColor Yellow
            Write-Host '#  403(serviceusage) 이면 GCP IAM 권한 문제입니다:                #' -ForegroundColor Yellow
            Write-Host '#  console.developers.google.com/iam-admin/iam?project=           #' -ForegroundColor Yellow
            Write-Host '#  archinode-8ab04 에서 roles/serviceusage.serviceUsageConsumer    #' -ForegroundColor Yellow
            Write-Host '#  를 부여하거나, Storage 규칙은 콘솔에서 손으로 게시하세요.       #' -ForegroundColor Yellow
            Write-Host '#################################################################' -ForegroundColor Yellow
            Write-Host ''
        }
    }

    if (-not $okFs) {
        Write-Host '[중단] firestore.rules 가 안 올라갔으므로 push 하지 않습니다.' -ForegroundColor Red
        exit 1
    }
    if ($okSt -eq $false) {
        Write-Host '[주의] firestore 는 올라갔지만 storage 는 못 올렸습니다. 위 안내대로 따로 처리하세요.' -ForegroundColor Yellow
    }
    $rulesChanged = $null
}
if ($rulesChanged) {
    Write-Host ''
    Write-Host '#################################################################' -ForegroundColor Red
    Write-Host '#  firestore.rules / storage.rules 가 바뀐 커밋입니다.           #' -ForegroundColor Red
    Write-Host '#  push 로는 절대 반영되지 않습니다.                              #' -ForegroundColor Red
    Write-Host '#  → 한울님이 Firebase 콘솔 > Firestore > Rules 에 전체 복사·게시  #' -ForegroundColor Red
    Write-Host '#  → 이 사실을 보고 맨 위에 적을 것                               #' -ForegroundColor Red
    Write-Host '#################################################################' -ForegroundColor Red
    Write-Host ''
}

# ── 2.5 검사 모음 (A-406) ──
# 전에는 이 자리에서 scripts/check_escaping.py **하나만** 돌렸다(A-167).
# 2026-11-09 에 세어 보니 검사·시험 도구가 여덟 개였고, 그중 **일곱 개는
# 부르는 자리가 없어** 사람이 기억해야 돌았다. 그래서 tools/check-all.py 로
# 묶고 그것을 부른다 — 검사를 새로 만들면 그 파일의 CHECKS 에 한 줄 더하면
# 배포 경로가 자동으로 집어 간다.
#
# 그날 돌려 보니 check_escaping.py 가 **실제로 어긋나 있었다** — 주석 한 줄
# 때문에 오탐이었고(A-405 에서 고쳤다), 이 스크립트로 배포하면 멀쩡한
# 저장소에서 push 가 막히는 상태였다. 아무도 몰랐던 이유는 평소에 git push 로
# 직접 밀기 때문이다. **부르지 않는 검사는 틀린 채로 썩는다.**
#
# Playwright 가 필요한 검사 셋은 없으면 조용히 건너뛴다(실패가 아니다).
# ?? 는 PowerShell 7+ 문법이다. 이 스크립트는 powershell.exe(5.1)로 돌아가므로 쓰지 않는다.
$py = Get-Command python -ErrorAction SilentlyContinue
if (-not $py) { $py = Get-Command python3 -ErrorAction SilentlyContinue }
if ($py) {
    Write-Host '[검사] 검사 모음 (tools/check-all.py)' -ForegroundColor Cyan
    & $py.Source 'tools/check-all.py'
    if ($LASTEXITCODE -ne 0) {
        Write-Host ''
        Write-Host '[중단] 검사가 어긋나 push 하지 않았습니다.' -ForegroundColor Red
        Write-Host '       위에 적힌 명령으로 하나씩 돌려 보세요.' -ForegroundColor Red
        Write-Host '       이스케이프 위반이면  python3 scripts/check_escaping.py --fix' -ForegroundColor Red
        Write-Host '       색인을 다시 만들려면 python3 scripts/make_search_index.py' -ForegroundColor Red
        exit 1
    }
} else {
    Write-Host '[경고] python 을 찾지 못해 검사 모음을 건너뜁니다.' -ForegroundColor Yellow
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
