# DevMemory MCP — 개인 GitHub 계정으로 이 프로젝트만 push하기
# 회사(CoMente) gh 기본 계정은 그대로 두고, 이 폴더에서만 개인 계정 사용

param(
    [Parameter(Mandatory = $true)]
    [string]$GitHubUser,   # 개인 GitHub 아이디 (예: myname)

    [string]$RepoName = "devmemory-mcp",
    [string]$Email = "",
    [string]$DisplayName = ""
)

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $Root

Write-Host "=== DevMemory MCP — 개인 GitHub 설정 ===" -ForegroundColor Cyan
Write-Host "프로젝트: $Root"
Write-Host "대상 계정: $GitHubUser"
Write-Host ""

# 1) 이 repo에만 git 사용자/ credential username 고정 (전역 gh 설정과 분리)
if ($DisplayName) { git config --local user.name $DisplayName }
if ($Email)       { git config --local user.email $Email }
git config --local credential.https://github.com.username $GitHubUser
git config --local gh.account $GitHubUser 2>$null

Write-Host "[1/4] 이 repo 로컬 git 설정 완료 (user + credential.username = $GitHubUser)" -ForegroundColor Green

# 2) gh에 개인 계정 추가 로그인 (이미 있으면 스킵 가능)
Write-Host ""
Write-Host "[2/4] gh에 개인 계정 로그인 (브라우저 열림)" -ForegroundColor Yellow
Write-Host "      → 개인 GitHub 계정으로 로그인하세요. CoMente가 아닌 본인 계정!"
gh auth login --hostname github.com --git-protocol https --web

# 3) push 시 개인 계정 사용 (완료 후 회사 계정으로 복귀)
$prevAccount = (gh auth status 2>&1 | Select-String "Logged in to github.com account (\S+)" | ForEach-Object { $_.Matches.Groups[1].Value })
gh auth switch --user $GitHubUser

Write-Host ""
Write-Host "[3/4] gh active account → $GitHubUser (이전: $prevAccount)" -ForegroundColor Green

# 4) remote + repo 생성 + push
$remote = "https://github.com/$GitHubUser/$RepoName.git"
if (git remote | Select-String -Pattern "^origin$" -Quiet) {
    git remote set-url origin $remote
} else {
    git remote add origin $remote
}

Write-Host ""
Write-Host "[4/4] GitHub repo 생성 및 push..." -ForegroundColor Yellow
gh repo create $RepoName --public --source=. --remote=origin --push --description "DevMemory MCP - Git commit based developer work memory for PlayMCP"

# 회사 gh 기본 계정 복귀
if ($prevAccount -and $prevAccount -ne $GitHubUser) {
    gh auth switch --user $prevAccount | Out-Null
    Write-Host "gh active account 복귀 → $prevAccount" -ForegroundColor Gray
}

Write-Host ""
Write-Host "=== 완료 ===" -ForegroundColor Green
Write-Host "Repo: https://github.com/$GitHubUser/$RepoName"
Write-Host "Docker: ghcr.io/$GitHubUser/$RepoName:1.0.0 (Actions push 후)"
Write-Host ""
Write-Host "PlayMCP in KC 등록값:" -ForegroundColor Cyan
Write-Host "  Registry 호스트: ghcr.io"
Write-Host "  image_name:      $GitHubUser/$RepoName"
Write-Host "  image_tag:       1.0.0"
Write-Host "  container_port:  8080"
