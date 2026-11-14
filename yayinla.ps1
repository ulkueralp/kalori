# Değişiklikleri GitHub'a gönderir; GitHub Pages 1-2 dakika içinde siteyi günceller.
# Kullanım:  .\yayinla.ps1 "ne değişti"   (açıklama yazmazsan tarih yazılır)
param([string]$mesaj = "Güncelleme " + (Get-Date -Format "yyyy-MM-dd HH:mm"))
$ErrorActionPreference = "Stop"
if (-not (Test-Path .git)) { Write-Host "Önce bir kez .\bagla.ps1 çalıştır." -ForegroundColor Red; exit 1 }

git add -A
# Güvenlik: gizli anahtara benzeyen bir şey gönderilecekse dur
$desen = 'AIza[0-9A-Za-z_\-]{30,}|"d"\s*:\s*"[A-Za-z0-9_\-]{40,}"|' + 'PRIVATE' + ' KEY-'
$supheli = git diff --cached -U0 | Select-String -Pattern $desen
if ($supheli) {
  git reset -q
  Write-Host "DUR! Gönderilecek dosyalarda gizli anahtara benzeyen bir şey var, hiçbir şey gönderilmedi:" -ForegroundColor Red
  $supheli | ForEach-Object { Write-Host "  $_" }
  exit 1
}
if (-not (git diff --cached --name-only)) { Write-Host "Gönderilecek değişiklik yok." -ForegroundColor Yellow; exit 0 }
git commit -q -m $mesaj
git push -q
Write-Host "Gönderildi. 1-2 dakika sonra site güncellenir: https://ulkueralp.github.io/kalori/" -ForegroundColor Green
