# Bu klasörü GitHub'daki ulkueralp/kalori deposuna bağlar. SADECE BİR KEZ çalıştırılır.
# Kullanım (VS Code terminalinde):  powershell -ExecutionPolicy Bypass -File bagla.ps1
$ErrorActionPreference = "Stop"
if (-not (Get-Command git -ErrorAction SilentlyContinue)) { Write-Host "Git kurulu değil. Önce Git'i kur, VS Code'u kapatıp aç." -ForegroundColor Red; exit 1 }
if (Test-Path .git) { Write-Host "Bu klasör zaten bağlı. Yayına almak için: .\yayinla.ps1" -ForegroundColor Yellow; exit 0 }

$ad = git config --global user.name
if (-not $ad) {
  $ad = Read-Host "GitHub'da görünecek adın (örn. Ulku)"
  git config --global user.name $ad
  $mail = Read-Host "GitHub'a kayıtlı e-posta adresin"
  git config --global user.email $mail
}

git init -q
git remote add origin https://github.com/ulkueralp/kalori.git
git fetch -q origin
# Depodaki ana dalın adını bul (main ya da master)
$dal = (git ls-remote --symref origin HEAD | Select-String "refs/heads/(\S+)").Matches[0].Groups[1].Value
if (-not $dal) { $dal = "main" }
git checkout -q -b $dal
# Klasördeki dosyalara dokunmadan, geçmişi GitHub'dakiyle eşitle
git reset -q "origin/$dal"
git branch -q --set-upstream-to="origin/$dal"
Write-Host "Bağlandı (dal: $dal). Şimdi yayına almak için: .\yayinla.ps1" -ForegroundColor Green
