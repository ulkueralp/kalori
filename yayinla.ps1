# Uygulamayı yayına alır:
#  1) Değişiklikleri GitHub'a gönderir (GitHub Pages 1-2 dakika içinde siteyi günceller)
#  2) worker/worker.js son yüklemeden beri değiştiyse Worker'ı Cloudflare'e yükler
#     (bunun için bir kez cloudflare-baglan.ps1 çalıştırılmış olmalı; yoksa elle yapıştırmayı hatırlatır)
# Kullanım:  powershell -ExecutionPolicy Bypass -File yayinla.ps1 "ne değişti"
param([string]$mesaj = "Güncelleme " + (Get-Date -Format "yyyy-MM-dd HH:mm"))
$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot
if (-not (Test-Path .git)) { Write-Host "Önce bir kez .\bagla.ps1 çalıştır." -ForegroundColor Red; exit 1 }

# ---------- 1) GitHub ----------
git add -A
# Güvenlik: gizli anahtara benzeyen bir şey gönderilecekse dur
$desen = 'AIza[0-9A-Za-z_\-]{30,}|"d"\s*:\s*"[A-Za-z0-9_\-]{40,}"|' + 'PRIVATE' + ' KEY-|' + 'Bear' + 'er [A-Za-z0-9_\-]{30,}'
$supheli = git diff --cached -U0 | Select-String -Pattern $desen
if ($supheli) {
  git reset -q
  Write-Host "DUR! Gönderilecek dosyalarda gizli anahtara benzeyen bir şey var, hiçbir şey gönderilmedi:" -ForegroundColor Red
  $supheli | ForEach-Object { Write-Host "  $_" }
  exit 1
}
if (git diff --cached --name-only) {
  git commit -q -m $mesaj
  git push -q
  if ($LASTEXITCODE -ne 0) { Write-Host "GitHub'a gönderilemedi." -ForegroundColor Red; exit 1 }
  Write-Host "GitHub: gönderildi. 1-2 dakika sonra site güncellenir: https://ulkueralp.github.io/kalori/" -ForegroundColor Green
} else {
  Write-Host "GitHub: gönderilecek değişiklik yok." -ForegroundColor Yellow
}

# ---------- 2) Cloudflare Worker ----------
$klasor = Join-Path $env:USERPROFILE ".kalori"
$cfDosya = Join-Path $klasor "cloudflare.xml"
$izDosya = Join-Path $klasor "worker-son-yukleme.sha256"
$hash = (Get-FileHash "worker\worker.js" -Algorithm SHA256).Hash
$onceki = if (Test-Path $izDosya) { (Get-Content $izDosya -Raw).Trim() } else { "" }
if ($hash -eq $onceki) { Write-Host "Worker: değişiklik yok." -ForegroundColor Yellow; exit 0 }
if (-not (Test-Path $cfDosya)) {
  Write-Host "Worker: worker.js değişti ama Cloudflare bağlı değil. worker.js'i panelde 'Edit code'a elle yapıştır" -ForegroundColor Yellow
  Write-Host "        ya da bir kez cloudflare-baglan.ps1 çalıştır." -ForegroundColor Yellow
  exit 0
}
$cf = Import-Clixml $cfDosya
$tok = [Runtime.InteropServices.Marshal]::PtrToStringAuto([Runtime.InteropServices.Marshal]::SecureStringToBSTR($cf.Token))
$basDosya = Join-Path $env:TEMP ("kalori-h-" + [guid]::NewGuid() + ".txt")
$metaDosya = Join-Path $env:TEMP ("kalori-m-" + [guid]::NewGuid() + ".json")
try {
  # Anahtar komut satırında görünmesin diye başlık dosyadan okunur; iş bitince silinir
  [IO.File]::WriteAllText($basDosya, "Authorization: Bearer $tok")
  [IO.File]::WriteAllText($metaDosya, '{"main_module":"worker.js"}')
  # Sadece kodu günceller; değişkenler, gizli anahtarlar, KV bağlantısı ve Cron ayarlarına dokunmaz
  $url = "https://api.cloudflare.com/client/v4/accounts/$($cf.AccountId)/workers/scripts/$($cf.Worker)/content"
  $cevap = & curl.exe -s -X PUT $url -H "@$basDosya" -F "metadata=@$metaDosya;type=application/json" -F "worker.js=@worker\worker.js;type=application/javascript+module"
  $j = $null; try { $j = $cevap | ConvertFrom-Json } catch {}
  if ($j -and $j.success) {
    Set-Content -Path $izDosya -Value $hash -Encoding ascii
    Write-Host "Worker: Cloudflare'e yüklendi." -ForegroundColor Green
  } else {
    $hata = if ($j -and $j.errors) { ($j.errors | ForEach-Object { "$($_.code) $($_.message)" }) -join "; " } else { "$cevap" }
    Write-Host "Worker: yüklenemedi: $hata" -ForegroundColor Red
    exit 1
  }
} finally {
  Remove-Item $basDosya, $metaDosya -ErrorAction SilentlyContinue
}
