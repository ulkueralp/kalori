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
- `today`: Kalori halkası, makro çubukları, su bardağı ve hızlı ekleme düğmeleri, günün sporu, öğün öğün yenenler. Her yemeğin yanında ☆ (favori) ve ×. Boş öğünde "ekle · dünküyle aynı" bağlantısı.
- `add`: Öğün seçimi, "↻ Dünkü X öğününün aynısı" düğmesi (`copyYesterday`), "⭐ Favoriler ve sık yediklerin" listesi ve dört ekleme yolu:
  - Favoriler ve sık yediklerin: `S.favs` ile son 30 günde en az 2 kez yenenler (`frequentFoods()`). Dokununca doğrudan öğüne eklenir.
  - ✍️ Yazarak (Gemini). **Gemini hata verirse ya da `API_URL` boşsa `localEstimate()` devreye girer:** Metin virgül, "ve" ya da "ile"den bölünür. Baştaki miktar okunur: rakam, "iki", "yarım", "bir buçuk" ya da "200 g". Kelimeler `FOOD_DB` ile Türkçe karaktersiz ve ek toleranslı eşleştirilir (`bestDB`). "5 zeytin" gibi çok adetli porsiyonlar adet sayısına bölünür. Bulunamayanlar notta listelenir.
  - 📸 Fotoğrafla (Gemini, görsel 1024 px'e küçültülüp JPEG base64 gönderiliyor)
  - 🔎 Yerel listeden (`FOOD_DB`, yaklaşık 200 yemek ve içecek, yaklaşık değerler; arama Türkçe karaktersiz de çalışır)
  - 📦 Barkod:
    - Okuma: Android Chrome'da yerleşik `BarcodeDetector` kullanılır. iPhone'da ve diğerlerinde ilk kullanımda `@zxing/library@0.21.3` UMD unpkg'den yüklenir. Kamera, `#app` dışında tam ekran bir katmanda (`.scanner`) açılır, çünkü `render()` innerHTML'i sildiği için video yok olurdu. Numara elle de yazılabilir.
    - Veri: Open Food Facts API v2'den 100 g değerleri gelir, kullanıcı gramı girer.
  - Sonuçlar düzenlenebilir bir "pending" listesinde onaylanıyor.
- `plan`: Haftalık görünüm ve seri (streak) sayacı, gün gün spor takvimi, öğün öğün diyet listesi.
- `sugg`: Kalan kalori ve diyet listesine göre Gemini'den 3 öneri. Yapay zekâ yoksa yerel listeden rastgele öneriyor.
- `me`: Hesaplar (BMR, TDEE, BKİ, makrolar) ve son 7 gün grafiği. Ardından:
  - **🗓️ Haftalık özet** (`weekCardHTML`): Bugün hariç son 7 günün ortalamaları. Altında kural tabanlı notlar: protein düşük, kalori üstte ya da çok altta, yağ yüksek, su, spor planına uyum, önceki haftayla kıyas, haftalık kilo değişimi. Hedefin çok altında kalınca "öğün atlama" uyarısı verir, asla daha az yemeyi önermez.
  - **⚖️ Kilo takibi:** SVG çizgi grafik (`weightChartHTML`, son 30 kayıt, noktaya dokununca değer). Son 6 kayıt listelenir ve × ile silinebilir.
  - **Su hatırlatıcı:** Push ayarları da bu kartta.
  - **🍽️ Öğün hatırlatmaları:** Açma/kapama ve öğün başına saat.
  - Profil, yedekleme, sıfırlama.

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
              mealRem: { on, t:{kahvalti:"09:00", ogle:"13:00", aksam:"19:30", ara:""} },  // "" = o öğün kapalı
              push, pushEndpoint, pushSig, pushDone, pushMealDone },   // push alanları sunucu senkronu için
  weights: [{date, kg}],
  favs: [{name, amount, kcal, p, c, f}],   // en fazla 30; anahtar = Türkçe karaktersiz ad + kcal
  updatedAt
}
```
`normalizeState()`, eski kayıtlarda ya da yedek dosyalarında olmayan yeni alanları varsayılanlarla tamamlar. Hem açılışta hem yedek yüklemede kullanılır; **yeni alan eklerken buraya da ekle.**

`save()` her değişiklikte `localStorage`'a yazar ve `pushAfterSave()` çağırır:
- Ayarlar, su hedefi ya da öğün saatleri değişince sunucu güncellenir (`pushSigNow`).
- O günün su hedefi tamamlanınca sunucuya `/push/done` gider.
- Bugün yemek eklenen öğünlerin bit maskesi değişince sunucuya `/push/meal` gider. Bit 0 olduğunda gönderilmez, böylece KV yazması kullanıcı başına günde en fazla 4 olur.

**Yapay zekâ çağrısı:** `askJSON(prompt, {images})` → `POST {API_URL}/ai` → `{text}` (JSON metni) döner, istemcide parse edilir. Prompt'lar `FOOD_PROMPT` ve `getSugg()` içinde; JSON çıktı formatı açıkça tarif ediliyor. İstemci 60 sn bekler. Hata türleri `e.code` ile ayrılır (`busy` 502/503/504/524, `rate_limited` 429, `origin` 403, `timeout`, `offline`, `network`, `http`). `aiErr()` her birine ayrı Türkçe mesaj verir. Eskiden hepsi "internet bağlantını kontrol et" diyordu ve asıl sebebi gizliyordu.

**Uygulama içi hatırlatma:** Uygulama açıkken `setInterval` ile ekranın üstünde mavi bir banner çıkıyor. Push açıksa ayrıca sistem bildirimi gösterilmiyor (çift bildirim olmasın diye). Öğün için yeşil banner (`#remindMeal`, `checkMealReminder`) var: ayarlanan saatten sonraki 30 dakika içinde, o öğün boşsa günde bir kez çıkar. "Şimdi ekle" düğmesi Ekle sekmesini o öğün seçili açar.

**Bildirim bağlantıları:** `#su-ekle` 1 bardak su ekler. `#ogun-<kahvalti|ogle|aksam|ara>` Ekle sekmesini o öğünle açar (`handleHash`). Uygulama zaten açıksa sw.js `{type:"open", hash}` mesajı gönderir.

**Push akışı (istemci):**
1. `enablePush()`: İzin istenir. `GET /push/key` ile VAPID açık anahtarı alınır, `pushManager.subscribe` çağrılır, sonra `POST /push/subscribe` ve `POST /push/test`.
2. iPhone'da uygulama ana ekrandan açılmadıysa (`isStandalone()` false), düğme yerine "ana ekrana ekle" uyarısı gösterilir.
3. Bildirimdeki "+1 bardak" düğmesi (sadece Android'de görünür) uygulamayı `#su-ekle` ile açar ya da mesaj gönderir; uygulama 1 bardak ekler.

## 5. Worker API

| Yöntem ve yol | Gövde | Açıklama |
|---|---|---|
| `POST /ai` (ya da `/`) | `{prompt, image?:{mime,data(base64)}}` | Gemini `generateContent`, `responseMimeType: application/json` → `{text, model}`. **Yedek model zinciri:** Önce `GEMINI_MODEL`, sonra `GEMINI_FALLBACK_MODELS` (varsayılan `gemini-flash-lite-latest,gemini-2.5-flash,gemini-2.5-flash-lite`) denenir. Model başına 20 sn, toplamda 50 sn sınır var. 404, 429, 5xx ya da zaman aşımında sıradaki modele geçilir; 400 gelirse hemen dönülür. Hepsi 429 verirse 429, değilse 503 döner (`tried` listesiyle). |
| `GET /push/key` | – | `{publicKey}` |
| `POST /push/subscribe` | `{subscription, tz, interval, start, end, goal, enabled, mealsOn, meals:[dk×4]}` | KV'ye yaz (anahtar `sub:<sha256 ilk 16 bayt>`, **tüm veri metadata'da**; metadata sınırı 1024 bayt, şu an yaklaşık 275 bayt + endpoint). Öğün saatleri `ml:"540,780,1170,-1"` olarak saklanır; `done` ve `md` korunur. |
| `POST /push/unsubscribe` | `{endpoint}` | Sil |
| `POST /push/done` | `{endpoint, date:"YYYY-MM-DD"\|""}` | O gün su hatırlatmasını durdur |
| `POST /push/meal` | `{endpoint, date, bits}` | Bugün yemek eklenen öğünler (bit 1 kahvaltı, 2 öğle, 4 akşam, 8 ara). `md:"tarih:bits"` olarak saklanır; o öğünlere hatırlatma gitmez. |
| `POST /push/test` | `{endpoint}` | Deneme bildirimi |
| `scheduled` (cron `*/15 * * * *`) | – | `list()` metadata'larını okur, zamanı gelene su (`type:"water"`) ve öğün (`type:"meal"`, `url:"./#ogun-…"`) bildirimi gönderir. 404 ya da 410 dönen aboneliği siler. |

- **Zamanlama durumsuz:** Kullanıcının saat dilimindeki dakika için `since = dakika − başlangıç×60` hesaplanır. `since >= interval` ve `since % interval < 15` ise bildirim gönderilir. "Son gönderim" yazılmadığı için KV yazma kotası harcanmaz.
- **Öğün zamanlaması (`dueMeal`):** `0 ≤ dakika − öğünSaati < 15` ve o günün `md` bitinde o öğün yoksa gönderilir. Su hatırlatıcısı kapalı olsa da çalışır; yalnız telefon bildirimlerinin açık olması gerekir.
- **sw.js:** `type:"meal"` geldiğinde etiket `kalori-meal` olur ve "+1 bardak" düğmesi gösterilmez. Bildirime tıklanınca `data.url` açılır. Önbellek sürümü `kalori-v3`.
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
- Gerçek Gemini ile canlı Worker üzerinden denendi (2026-11-14), kullanıcı telefonda çalıştığını doğruladı.
- **2026-11-14 geliştirme paketi** (favoriler, yerel tahmin, kilo grafiği, öğün hatırlatmaları, barkod, genişletilmiş liste, haftalık özet):
  - Playwright + sistem Chrome ile 33 kontrol geçti (açık/koyu tema, 390 px). Gemini'nin 503 verdiği durum, Open Food Facts ve öğün banner'ı sahte cevaplarla denendi.
  - Worker öğün zamanlaması Deno'da sahte KV ile denendi: 13:00 gönderir; 13:15'te ve 12:45'te göndermez; yemek eklenmişse göndermez; ertesi gün sıfırlanır; su hatırlatıcısı kapalıyken etkilenmez.
  - **Gerçek kamerayla barkod okuma ve gerçek öğün bildirimi telefonda henüz denenmedi.**
- Test ortamı: Bu bilgisayarda Node yok. Python 3.12 (Playwright, scratchpad'deki venv'e kuruldu), Deno, Chrome ve Edge var.

## 7. Durum ve sıradaki işler

**Şu an (2026-11-14):** Site, Worker, KV ve Cron yayında.
- **Çözülen sorun:** "Ekle"de kalori hesabı "internet bağlantısı" hatası veriyordu. Asıl sebep internet değildi: `gemini-flash-latest` aşırı yoğundu. Gemini 503 ("high demand") döndürüyor ya da 125 sn cevapsız kalıp 524 veriyordu (curl ile canlı Worker'da doğrulandı).
- **Çözüm:** Worker'a yedek model zinciri, istemciye ayrıntılı hata mesajları eklendi.
- **Git:** Klasör depoya bağlandı (dal `main`, upstream `origin/main`, yerel `user.name=ulkueralp`, `core.autocrlf=false`). İlk push yapıldı (`d1d5d6e`). Yeni Worker yayında; canlı testte ana model yoğunken `gemini-flash-lite-latest` 4 sn'de cevap verdi. Not: VS Code terminali bazen komutun başına `[?61;4c` gibi kaçış karakterleri ekliyor ve "Missing type name after '['" hatası çıkıyor. Bu durumda yeni terminal açıp komutu elle yazmak yeterli.

- **2026-11-14 ikinci iş:** 7 özellik eklendi: favoriler/sık yenenler/dünkü öğün, yerel tahmin, kilo grafiği, öğün hatırlatmaları, barkod, yaklaşık 200 kalemlik liste, haftalık özet. Ayrıntılar 4. ve 5. bölümde. Yayın için hem push hem Worker yapıştırma gerekiyordu.

**Olası sonraki adımlar** (kullanıcıyla önceliklendir):
1. Kendi tarifini kaydetmek (ör. "annemin mercimek çorbası, 1 kase = 180 kcal"); `favs` altyapısına benzer.
2. Liste değerlerini TÜRKOMP ile doğrulamak ve genişletmek.
3. Haftalık özeti Pazartesi sabahı bildirim olarak göndermek (cron var).
4. Yerel uygulamaya geçiş: **Capacitor** ile aynı kod Android ve iOS uygulamasına sarılır. Kazanımlar: yerel bildirim, Apple Sağlık / Health Connect'ten adım verisi, widget, mağaza yayını. Maliyet: App Store hesabı yıllık 99$, Google Play bir kerelik 25$.
5. Cihazlar arası senkron (şu an veri sadece telefonda). Gerekirse Cloudflare D1 ya da KV ile hesapsız bir senkron kodu yapılabilir.

**Bozulmaması gerekenler:**
- Kalori alt sınırı (1200/1500) ve "aç kalmayı önerme" prompt kuralı.
- Gizlilik notu.
- Gemini anahtarının istemciye asla konmaması.
- Tek dosya, derlemesiz yapı. Kullanıcı artık `yayinla.ps1` ile git push yapıyor. Dış kütüphane yalnızca barkod tarayıcısı (zxing) için, sadece gerektiğinde CDN'den ve sabit sürümle yükleniyor.
- Haftalık özet ve öneri metinleri hiçbir zaman "daha az ye" ya da "öğün atla" dememeli.
- Yapay zekâ başarısız olunca kullanıcı eli boş kalmamalı (yerel tahmin).
