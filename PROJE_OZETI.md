# Kalori: Proje Özeti (devir dokümanı)

> **Yapay zekâ asistanı için not:** Bu dosya, projenin bugüne kadarki bütün kararlarını ve durumunu anlatır. Önceki konuşmaya erişimin yok, her şey burada. Kullanıcı Türkçe konuşuyor; kod yorumları ve arayüz metinleri de Türkçe. Kullanıcı yazılımcı değil, adımları sade anlat.

## 1. Ne yapıyoruz?

Android ve iPhone'da çalışan bir **kalori ve su takip uygulaması**. Kullanıcının istekleri:
- **Su bildirimi:** "Su iç" hatırlatması. Ekran kapalı, uygulama kapalıyken de gelmeli.
- **Yemek kalorisi:** Fotoğraf çekince ya da ne yediğini yazınca kalori ve makrolar (protein, karbonhidrat, yağ) gelsin.
- **Su takibi:** Gün içinde kaç litre içildiği görünsün.
- **Hedef hesabı:** Günlük kalori hedefi tek tıkla hesaplansın.
- **Takvim ve öneriler:** Spor takvimi, diyet listesi ve bu listeye göre yemek önerileri.
- **Ücretsiz ve paylaşılabilir olmalı:** Link WhatsApp'tan başkalarına gönderilecek. Karşı taraf hesap açmadan kullanabilmeli.

## 2. Mimari (alınan kararlar)

```
Telefon (PWA, ana ekrana eklenir)            Cloudflare Worker (ücretsiz)               Google Gemini (ücretsiz)
GitHub Pages'te statik site      ── HTTPS ──▶  /ai   → Gemini köprüsü         ──────▶   generateContent
index.html + sw.js + manifest                  /push/* → abonelikler (KV)
veriler: localStorage (telefonda)   ◀─ Web Push ─ cron */15 → su bildirimi
```

- **Neden PWA (web uygulaması)?** Tek kod iki platformda çalışıyor, mağaza ve ücret gerektirmiyor, link ile paylaşılabiliyor. Yerel uygulamaya geçiş planı aşağıda.
- **Neden Worker?** Gemini anahtarı sayfaya konursa herkes görür; Worker anahtarı gizli tutuyor. iPhone'da web uygulaması yerel zamanlayıcı kuramıyor, kapalıyken bildirim gelmesi için sunucunun Web Push göndermesi gerekiyor.
- **Neden Gemini?** Kullanıcı ücretsiz modeli istedi. Ücretsiz kotası proje başına ve tüm kullanıcılar arasında ortak. Ücretsiz sürümde Google veriyi model geliştirmek için kullanabiliyor; uygulamada bununla ilgili gizlilik notu var.
- **Veri saklama:** Sadece telefonda (`localStorage`, anahtar `kaloriApp.v1`). Hesap ya da veritabanı yok. Yedek indirme ve yükleme (JSON) var.
- **Kütüphane yok:** Tek dosya, vanilla HTML/CSS/JS. Derleme adımı yok.

## 3. Dosyalar

| Dosya | Görevi |
|---|---|
| `index.html` | Uygulamanın tamamı (arayüz, mantık, yerel yemek veritabanı). En üstteki `const API_URL = ""` Worker adresidir. |
| `sw.js` | Service worker: internetsiz açılma (network-first önbellek), push bildirimi gösterme, bildirime tıklama. |
| `manifest.json` | PWA tanımı (ad, simge, `display: standalone`). |
| `icon-192.png`, `icon-512.png` | Uygulama simgesi. |
| `worker/worker.js` | Cloudflare Worker: Gemini köprüsü, push abonelikleri, cron ile bildirim gönderimi, Web Push şifreleme (VAPID + aes128gcm, kütüphanesiz, WebCrypto). |
| `worker/wrangler.toml` | Worker'ı komut satırından yayınlamak için ayarlar (yer tutucular dolacak). |
| `tools/vapid-anahtar-uret.html` | Tarayıcıda VAPID anahtar çifti üretir (yayına alınmaz). |
| `KURULUM.md` | Kullanıcı için adım adım yayına alma rehberi. |
| `.gitignore` | Gizli anahtar dosyalarının (.env, .dev.vars, *.key, *secret* …) depoya girmesini engeller. |
| `bagla.ps1` | Klasörü GitHub deposuna bağlar (bir kerelik). Depodaki geçmişi alır, yerel dosyalara dokunmaz. |
| `yayinla.ps1` | `git add/commit/push` tek komutta. Gönderilecek değişikliklerde Gemini anahtarı (`AIza…`) ya da özel anahtar görürse durur. |

**Yayına alma (kasım 2026'dan itibaren):** Klasörün tamamı (worker/, tools/, .md dahil) GitHub deposunda (`ulkueralp/kalori`, Pages: https://ulkueralp.github.io/kalori/). Kullanıcı `.\yayinla.ps1 "açıklama"` ile gönderir. **Worker deposundan otomatik yayına çıkmaz:** `worker/worker.js` değiştiyse kullanıcı Cloudflare panelinde "Edit code"a yapıştırıp Deploy etmeli. Her değişiklikten sonra kullanıcıya hangisinin gerektiğini söyle.
Canlı adresler: Worker `https://kalori-ai.ulkueralp20.workers.dev`, `ALLOWED_ORIGIN = https://ulkueralp.github.io`.

## 4. Uygulama (index.html) yapısı

**Sekmeler** (alttaki menü, `TAB` değişkeni):
- `today`: Kalori halkası, makro çubukları, su bardağı ve hızlı ekleme düğmeleri, günün sporu, öğün öğün yenenler.
- `add`: Öğün seçimi ve üç ekleme yolu:
  - ✍️ Yazarak (Gemini)
  - 📸 Fotoğrafla (Gemini, görsel 1024 px'e küçültülüp JPEG base64 gönderiliyor)
  - 🔎 Yerel listeden (`FOOD_DB`, yaklaşık 60 Türk yemeği)
  - Sonuçlar düzenlenebilir bir "pending" listesinde onaylanıyor.
- `plan`: Haftalık görünüm ve seri (streak) sayacı, gün gün spor takvimi, öğün öğün diyet listesi.
- `sugg`: Kalan kalori ve diyet listesine göre Gemini'den 3 öneri. Yapay zekâ yoksa yerel listeden rastgele öneriyor.
- `me`: Hesaplar (BMR, TDEE, BKİ, makrolar), son 7 gün grafiği, kilo takibi, su hatırlatıcı ve push ayarları, profil, yedekleme, sıfırlama.

**Hesaplamalar** (`targets()`):
- Bazal metabolizma: Mifflin-St Jeor formülü. Günlük harcama = bazal metabolizma × hareket katsayısı.
- Hedefe göre ayar: Kilo vermek −500, korumak 0, almak +300 kcal.
- **Güvenlik alt sınırı:** Kadında 1200, erkekte 1500 kcal. Sağlık güvenliği için bilinçli bir karar; kaldırma.
- Makrolar: Protein, korumada 1,2 g/kg, diğer hedeflerde 1,6 g/kg. Yağ, kalorinin %28'i. Karbonhidrat, kalan kalori.
- Su hedefi: 33 ml/kg, 100 ml'ye yuvarlanıyor.

**Durum şeması (`S`):**
```js
{
  profile: {name, sex:"f"|"m", age, height, weight, activity:1.2..1.9, goal:"lose"|"keep"|"gain"} | null,
  days: { "YYYY-MM-DD": { foods:[{id,meal,name,amount,kcal,p,c,f,t}], water: ml, sport: bool } }, // son 90 gün tutulur
  plan: { sport:{0..6:"metin"}, diet:{kahvalti,ogle,aksam,ara} },
  settings: { reminderMin, wakeStart, wakeEnd, glass, reminders,
              push, pushEndpoint, pushSig, pushDone },   // push alanları sunucu senkronu için
  weights: [{date, kg}],
  updatedAt
}
```
`save()` her değişiklikte `localStorage`'a yazar ve `pushAfterSave()` çağırır. Ayarlar ya da su hedefi değişince sunucu güncellenir; o günün su hedefi tamamlanınca sunucuya `/push/done` gider.

**Yapay zekâ çağrısı:** `askJSON(prompt, {images})` → `POST {API_URL}/ai` → `{text}` (JSON metni) döner, istemcide parse edilir. Prompt'lar `FOOD_PROMPT` ve `getSugg()` içinde; JSON çıktı formatı açıkça tarif ediliyor. İstemci 60 sn bekler. Hata türleri `e.code` ile ayrılır (`busy` 502/503/504/524, `rate_limited` 429, `origin` 403, `timeout`, `offline`, `network`, `http`). `aiErr()` her birine ayrı Türkçe mesaj verir. Eskiden hepsi "internet bağlantını kontrol et" diyordu ve asıl sebebi gizliyordu.

**Uygulama içi hatırlatma:** Uygulama açıkken `setInterval` ile ekranın üstünde mavi bir banner çıkıyor. Push açıksa ayrıca sistem bildirimi gösterilmiyor (çift bildirim olmasın diye).

**Push akışı (istemci):**
1. `enablePush()`: İzin istenir. `GET /push/key` ile VAPID açık anahtarı alınır, `pushManager.subscribe` çağrılır, sonra `POST /push/subscribe` ve `POST /push/test`.
2. iPhone'da uygulama ana ekrandan açılmadıysa (`isStandalone()` false), düğme yerine "ana ekrana ekle" uyarısı gösterilir.
3. Bildirimdeki "+1 bardak" düğmesi (sadece Android'de görünür) uygulamayı `#su-ekle` ile açar ya da mesaj gönderir; uygulama 1 bardak ekler.

## 5. Worker API

| Yöntem ve yol | Gövde | Açıklama |
|---|---|---|
| `POST /ai` (ya da `/`) | `{prompt, image?:{mime,data(base64)}}` | Gemini `generateContent`, `responseMimeType: application/json` → `{text, model}`. **Yedek model zinciri:** Önce `GEMINI_MODEL`, sonra `GEMINI_FALLBACK_MODELS` (varsayılan `gemini-flash-lite-latest,gemini-2.5-flash,gemini-2.5-flash-lite`) denenir. Model başına 20 sn, toplamda 50 sn sınır var. 404, 429, 5xx ya da zaman aşımında sıradaki modele geçilir; 400 gelirse hemen dönülür. Hepsi 429 verirse 429, değilse 503 döner (`tried` listesiyle). |
| `GET /push/key` | – | `{publicKey}` |
| `POST /push/subscribe` | `{subscription, tz, interval, start, end, goal, enabled}` | KV'ye yaz (anahtar `sub:<sha256 ilk 16 bayt>`, **tüm veri metadata'da**) |
| `POST /push/unsubscribe` | `{endpoint}` | Sil |
| `POST /push/done` | `{endpoint, date:"YYYY-MM-DD"\|""}` | O gün hatırlatmayı durdur |
| `POST /push/test` | `{endpoint}` | Deneme bildirimi |
| `scheduled` (cron `*/15 * * * *`) | – | `list()` metadata'larını okur, zamanı gelene push gönderir. 404 ya da 410 dönen aboneliği siler. |

- **Zamanlama durumsuz:** Kullanıcının saat dilimindeki dakika için `since = dakika − başlangıç×60` hesaplanır. `since >= interval` ve `since % interval < 15` ise bildirim gönderilir. "Son gönderim" yazılmadığı için KV yazma kotası harcanmaz.
- **Güvenlik:** `ALLOWED_ORIGIN` ile CORS ve origin kontrolü, IP başına dakikada 20 istek sınırı, gövde en fazla 6 MB, prompt en fazla 8000 karakter.
- **Ortam değişkenleri:** `GEMINI_API_KEY`🔒, `VAPID_PRIVATE_KEY`🔒, `VAPID_PUBLIC_KEY`, `VAPID_SUBJECT`, `ALLOWED_ORIGIN`, `GEMINI_MODEL` (varsayılan `gemini-flash-latest`), `GEMINI_FALLBACK_MODELS` (isteğe bağlı, virgülle ayrılmış). KV bağlantısı: `SUBS`.

## 6. Test edilenler

- Uygulama telefon boyutunda Playwright ile denendi: profil, su ekleme, yemek ekleme, sekmeler. Konsol hatası yok.
- Yapay zekâ akışı sahte bir Worker cevabıyla denendi.
- Push istemci akışı (izin, abonelik, ayar senkronu, done) sahte PushManager ile denendi.
- Worker, Node 22'de test edildi:
  - Şifreli payload `http_ece` ile çözüldü.
  - VAPID JWT `jose` ile doğrulandı.
  - Zamanlama doğru: 09:30'da gönderiyor, 09:45'te ve 06:00'da göndermiyor, hedef tamamlandıktan sonra göndermiyor.
- **Henüz gerçek cihazda ve gerçek Gemini ile denenmedi.** Kullanıcı kurulumu `KURULUM.md`'ye göre yapacak.

## 7. Durum ve sıradaki işler

**Şu an (2026-11-14):** Site, Worker, KV ve Cron yayında.
- **Çözülen sorun:** "Ekle"de kalori hesabı "internet bağlantısı" hatası veriyordu. Asıl sebep internet değildi: `gemini-flash-latest` aşırı yoğundu. Gemini 503 ("high demand") döndürüyor ya da 125 sn cevapsız kalıp 524 veriyordu (curl ile canlı Worker'da doğrulandı).
- **Çözüm:** Worker'a yedek model zinciri, istemciye ayrıntılı hata mesajları eklendi.
- **Git:** Klasör depoya bağlandı (dal `main`, upstream `origin/main`, yerel `user.name=ulkueralp`, `core.autocrlf=false`). İlk push'u kullanıcı `yayinla.ps1` ile yapacak; GitHub girişi tarayıcıda açılır. Not: VS Code terminali bazen komutun başına `[?61;4c` gibi kaçış karakterleri ekliyor ve "Missing type name after '['" hatası çıkıyor. Bu durumda yeni terminal açıp komutu elle yazmak yeterli.

**Olası sonraki adımlar** (kullanıcıyla önceliklendir):
1. Kurulum sırasında çıkan hataları çöz (en sık: `ALLOWED_ORIGIN` uyuşmazlığı, KV bağlantısı, Cron Trigger'ın eklenmemesi).
2. Barkod okuma (Open Food Facts API; iOS Safari'de `BarcodeDetector` yok, zxing-js gibi bir kütüphane gerekir).
3. Kilo grafiği (şu an liste halinde).
4. Öğün hatırlatmaları (Worker'daki push altyapısıyla aynı şekilde).
5. Türk yemekleri listesini genişletmek (TÜRKOMP verileri).
6. Yerel uygulamaya geçiş: **Capacitor** ile aynı kod Android ve iOS uygulamasına sarılır. Kazanımlar: yerel bildirim, Apple Sağlık / Health Connect'ten adım verisi, widget, mağaza yayını. Maliyet: App Store hesabı yıllık 99$, Google Play bir kerelik 25$.
7. Cihazlar arası senkron (şu an veri sadece telefonda). Gerekirse Cloudflare D1 ya da KV ile hesapsız bir senkron kodu yapılabilir.

**Bozulmaması gerekenler:**
- Kalori alt sınırı (1200/1500) ve "aç kalmayı önerme" prompt kuralı.
- Gizlilik notu.
- Gemini anahtarının istemciye asla konmaması.
- Tek dosya, derlemesiz yapı. Kullanıcı GitHub web arayüzünden dosya yüklüyor.
