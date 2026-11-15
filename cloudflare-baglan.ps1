# Cloudflare API anahtarını bu bilgisayara ŞİFRELİ kaydeder (BİR KEZ çalıştırılır).
# Sonrasında yayinla.ps1, worker.js değiştiğinde Worker'ı Cloudflare'e kendisi yükler.
# Anahtar depoya GİRMEZ: Windows'un kullanıcıya özel şifrelemesiyle (DPAPI) şu dosyada durur:
#   %USERPROFILE%\.kalori\cloudflare.xml   (başka bir kullanıcı ya da bilgisayar çözemez)
#
# Kullanım (VS Code terminalinde):  powershell -ExecutionPolicy Bypass -File cloudflare-baglan.ps1
$ErrorActionPreference = "Stop"
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
$WorkerAdi = "kalori-ai"
$klasor = Join-Path $env:USERPROFILE ".kalori"
$dosya = Join-Path $klasor "cloudflare.xml"

Write-Host ""
Write-Host "Cloudflare API anahtarı nasıl alınır:" -ForegroundColor Cyan
Write-Host "  1) dash.cloudflare.com -> sağ üstteki profil simgesi -> Profile -> API Tokens"
Write-Host "  2) Create Token -> 'Edit Cloudflare Workers' satırında 'Use template'"
Write-Host "  3) Account Resources: kendi hesabın | Zone Resources: All zones"
Write-Host "  4) Continue to summary -> Create Token -> çıkan anahtarı kopyala"
Write-Host ""
Write-Host "Anahtarı Cloudflare'de KOPYALADIYSAN hiçbir şey yazmadan sadece Enter'a bas; panodan ben alırım." -ForegroundColor Yellow
$sec = Read-Host "Ya da buraya yapıştır (yazdığın görünmez) ve Enter'a bas" -AsSecureString
$tok = [Runtime.InteropServices.Marshal]::PtrToStringAuto([Runtime.InteropServices.Marshal]::SecureStringToBSTR($sec))
$panodan = $false
if (-not $tok -or $tok.Trim().Length -lt 20) {
  # VS Code terminali gizli kutuya yapıştırmayı bazen aktarmıyor: panodaki anahtarı kullan
  $clip = ""
  try { $clip = (Get-Clipboard -Raw) } catch {}
  $clip = "$clip".Trim()
  if ($clip -match '^[A-Za-z0-9_\-]{30,80}$') {
    $tok = $clip; $panodan = $true
    $sec = ConvertTo-SecureString $tok -AsPlainText -Force
    Write-Host "Panodaki anahtar alındı." -ForegroundColor Green
  } else {
    Write-Host "Anahtar alınamadı. Cloudflare'de anahtarın yanındaki 'Copy' düğmesine bas, sonra bu komutu tekrar çalıştırıp sadece Enter'a bas." -ForegroundColor Red; exit 1
  }
}
$h = @{ Authorization = "Bearer $($tok.Trim())" }

try { $v = Invoke-RestMethod -Uri "https://api.cloudflare.com/client/v4/user/tokens/verify" -Headers $h }
catch { Write-Host "Anahtar doğrulanamadı. Doğru kopyaladığından emin ol." -ForegroundColor Red; exit 1 }
if (-not $v.success -or $v.result.status -ne "active") { Write-Host "Anahtar aktif değil." -ForegroundColor Red; exit 1 }

$acc = (Invoke-RestMethod -Uri "https://api.cloudflare.com/client/v4/accounts" -Headers $h).result
if (-not $acc) { Write-Host "Hesap bulunamadı. Anahtarı oluştururken 'Account Resources' kısmında hesabını seçtiğinden emin ol." -ForegroundColor Red; exit 1 }
$hesap = $null
foreach ($a in $acc) {
  try {
    $s = (Invoke-RestMethod -Uri "https://api.cloudflare.com/client/v4/accounts/$($a.id)/workers/scripts" -Headers $h).result
    if ($s | Where-Object { $_.id -eq $WorkerAdi }) { $hesap = $a; break }
  } catch {}
}
if (-not $hesap) { Write-Host "Bu anahtarla '$WorkerAdi' adlı Worker görülemiyor. Şablonun 'Edit Cloudflare Workers' olduğundan emin ol." -ForegroundColor Red; exit 1 }

New-Item -ItemType Directory -Force $klasor | Out-Null
[pscustomobject]@{ Token = $sec; AccountId = $hesap.id; Worker = $WorkerAdi } | Export-Clixml -Path $dosya
if ($panodan) { try { Set-Clipboard -Value " " } catch {} ; Write-Host "Güvenlik için pano temizlendi." }
Write-Host ""
Write-Host "Tamam! Cloudflare bağlandı (hesap: $($hesap.name), Worker: $WorkerAdi)." -ForegroundColor Green
Write-Host "Artık yayinla.ps1, worker.js değiştiğinde Worker'ı da kendisi yükleyecek." -ForegroundColor Green
