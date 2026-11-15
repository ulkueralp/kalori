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
| `admin.html` | Yönetici paneli (bkz. "Yönetici paneli" bölümü). Statik sayfa; şifre sayfada değil, Worker'da `ADMIN_PASSWORD` secret'ı. `noindex`. |
| `admin-ek.js` | Yönetici panelinin 3. adım bölümleri (Duyurular, İstatistik, İçerik, Ayarlar); `admin.html`'in ortak değişkenlerini kullanır. |
| `tools/vapid-anahtar-uret.html` | Tarayıcıda VAPID anahtar çifti üretir (yayına alınmaz). |
| `KURULUM.md` | Kullanıcı için adım adım yayına alma rehberi. |
| `.gitignore` | Gizli anahtar dosyalarının (.env, .dev.vars, *.key, *secret* …) depoya girmesini engeller. |
| `bagla.ps1` | Klasörü GitHub deposuna bağlar (bir kerelik). Depodaki geçmişi alır, yerel dosyalara dokunmaz. |
| `yayinla.ps1` | Tek komutla yayın. (1) `git add/commit/push`; gönderilecek değişikliklerde Gemini anahtarı (`AIza…`), özel anahtar ya da `Bearer …` görürse durur. (2) `worker/worker.js`'in SHA256'sı son yüklemeden farklıysa ve Cloudflare bağlıysa Worker'ı API ile yükler. Yükleme `PUT /accounts/{id}/workers/scripts/kalori-ai/content` ile yapılır: yalnız kod değişir; değişkenler, secret'lar, KV ve Cron'a dokunulmaz. Anahtar komut satırına yazılmaz, geçici başlık dosyasıyla `curl.exe -H @dosya` kullanılır ve dosya silinir. |
| `cloudflare-baglan.ps1` | Bir kerelik; **kullanıcı kendisi çalıştırır** (anahtarı gizli girer). Cloudflare API anahtarını ("Edit Cloudflare Workers" şablonu) doğrular, `kalori-ai` Worker'ının bulunduğu hesabı bulur ve `%USERPROFILE%\.kalori\cloudflare.xml` dosyasına Windows DPAPI ile şifreli kaydeder. Bu dosya depoda değildir. |

**Yayına alma (2026-11-15'ten itibaren):**
- Klasörün tamamı (worker/, tools/, .md dahil) GitHub deposunda (`ulkueralp/kalori`, Pages: https://ulkueralp.github.io/kalori/).
- **Kullanıcının isteği:** Yayını Claude yapar. Her değişiklikten sonra "yayına alayım mı?" diye onay iste. Onay gelince PowerShell'de `powershell -ExecutionPolicy Bypass -File yayinla.ps1 "açıklama"` çalıştır.
- Git kimlik bilgileri Windows'ta kayıtlı, push sorunsuz çalışıyor.
- Son yüklenen Worker'ın izi `%USERPROFILE%\.kalori\worker-son-yukleme.sha256` dosyasında tutulur.
- `cloudflare.xml` yoksa betik, Worker'ı elle yapıştırmayı hatırlatır.
- **2026-11-15: Cloudflare bağlandı.** API anahtarı ("Edit Cloudflare Workers" şablonu) şifreli olarak kaydedildi; regl paketindeki Worker `yayinla.ps1` ile API üzerinden yüklendi. Yüklemeden sonra bağlantıların (GEMINI_API_KEY, VAPID, ALLOWED_ORIGIN, SUBS) ve Cron'un yerinde kaldığı doğrulandı. Artık Worker'ı elle yapıştırmaya gerek yok. Kullanıcı anahtarları sohbete de yazdı; Gemini anahtarını yenilemesi önerildi. VAPID anahtarları değiştirilmemeli, aksi hâlde mevcut abonelikler bozulur.
Canlı adresler: Worker `https://kalori-ai.ulkueralp20.workers.dev`, `ALLOWED_ORIGIN = https://ulkueralp.github.io`.

## 4. Uygulama (index.html) yapısı

**Sekmeler** (alttaki menü, `TAB` değişkeni):
- `today` (aslında **görüntülenen gün**; bkz. "Gün seçimi"). Kart sırası:
  1. Gün bandı: bugünse "‹ Dün · 📅 Takvim · Yarın ›", başka bir günse turuncu çerçeveli tarih, ‹ ›, "↩ Bugüne dön".
  2. Kopyalama çubuğu (`CLIP` doluysa).
  3. Seri koruyucu uyarısı (sadece bugün).
  4. Kalori halkası, ardından **"Bugün yediklerim"**: halkanın hemen altında; yemeğe dokununca düzenleme açılır, ⧉ öğünü ya da günü kopyalar, ☆ favori, × sil.
  5. Su, 👣 adımlar, 🏃 spor (antrenmana dokununca düzenlenir, ⧉ sporları kopyalar), 😴 uyku, 😊 ruh hali, ☕ kafein ve şeker.
  6. 🌸 Döngüm (kadın profili, takip açık ve bugünse).
- `add`: Öğün seçimi, "↻ Dünkü X öğününün aynısı" düğmesi (`copyYesterday`), "⭐ Favoriler ve sık yediklerin" listesi ve dört ekleme yolu:
  - Favoriler ve sık yediklerin: `S.favs` ile son 30 günde en az 2 kez yenenler (`frequentFoods()`). Dokununca doğrudan öğüne eklenir.
  - 🎤 Sesle ("Söyle" düğmesi, Yaz modunda):
    - Önce telefonun `SpeechRecognition`'ı (`tr-TR`) denenir. Metin kutusuna yazar, bitince `analyzeText()` otomatik çalışır.
    - iPhone'da ana ekrandan açılan uygulamada (`isIOS()&&isStandalone()`) ya da hata alınınca (`srBroken`) ses kaydına geçilir: `ScriptProcessor` ile 16 kHz mono 16 bit WAV (`encodeWAV`), en fazla 30 sn. Kayıt `askJSON(FOOD_PROMPT+VOICE_EXTRA,{audio})` ile Gemini'ye gider. Cevaptaki `heard` alanı metin kutusuna yazılır.
    - Sekme değişince kayıt gönderilmeden iptal edilir (`voiceStop(false)`).
  - ✍️ Yazarak (Gemini). **Gemini hata verirse ya da `API_URL` boşsa `localEstimate()` devreye girer:** Metin virgül, "ve" ya da "ile"den bölünür. Baştaki miktar okunur: rakam, "iki", "yarım", "bir buçuk" ya da "200 g". Kelimeler `FOOD_DB` ile Türkçe karaktersiz ve ek toleranslı eşleştirilir (`bestDB`). "5 zeytin" gibi çok adetli porsiyonlar adet sayısına bölünür. Bulunamayanlar notta listelenir.
  - 📸 Fotoğrafla (Gemini, görsel 1024 px'e küçültülüp JPEG base64 gönderiliyor):
    - `PHOTO_EXTRA` ile her kalem için `box:[ymin,xmin,ymax,xmax]` (0-1000) istenir; `box_2d` de kabul edilir.
    - `photoBlockHTML()` fotoğrafın üstüne "ad + kcal" etiketleri (`.ptag`) koyar. `fixTags()` çizildikten sonra çakışan etiketleri kaydırır.
    - Etikete dokununca ilgili pending kalemi vurgulanır.
    - `box` ve `ph` (fotoğraf sırası `photoSeq`) kaydedilen yemeğe yazılmaz.
  - 🔎 Yerel listeden (`FOOD_DB`, yaklaşık 200 yemek ve içecek, yaklaşık değerler; arama Türkçe karaktersiz de çalışır)
  - 📦 Barkod:
    - Okuma: Android Chrome'da yerleşik `BarcodeDetector` kullanılır. iPhone'da ve diğerlerinde ilk kullanımda `@zxing/library@0.21.3` UMD unpkg'den yüklenir. Kamera, `#app` dışında tam ekran bir katmanda (`.scanner`) açılır, çünkü `render()` innerHTML'i sildiği için video yok olurdu. Numara elle de yazılabilir.
    - Veri: Open Food Facts API v2'den 100 g değerleri gelir, kullanıcı gramı girer.
  - Sonuçlar düzenlenebilir bir "pending" listesinde onaylanıyor.
- `plan`: 📅 Takvim (Hafta / Ay / Yıl, `calendarCardHTML`), spor takvimi, diyet listesi, 🛒 alışveriş listesi.
- `sugg` (2026-11-15'te yenilendi; kullanıcı önerilerin diyet listesini aynen tekrarladığından şikâyet etti):
  - Gemini'den 3 öneri gelir. İstem: **en fazla 1 tanesi** diyet listesinden, diğerleri listeye uygun **yeni** fikirler; liste rehberdir, aynen kopyalanmaz.
  - "Canın ne istiyor?" hızlı seçimleri (`CRAVES`): tatlı krizi, tuzlu, yüksek protein, pratik, hafif, gece. Seçilen isteği önerilerin en az 2'si sağlıklı biçimde karşılamalıdır.
  - Her öneride porsiyon, `tag` ("Listenden", "Yeni fikir", "Tatlı krizine"…), `why` ve 👩‍🍳 `how` (1 cümle tarif) bulunur; ayrıca genel bir `tip`.
  - "🔄 Başka öneriler" önceki önerileri `suggSeen` ile "TEKRARLAMA" listesi olarak gönderir.
  - Yapay zekâ yoksa ya da hata verirse hazır sağlıklı alternatifler (`CRAVE_LOCAL`, istek başına 4–6 seçenek) ve `CRAVE_TIP` ipucu kullanılır.
  - Kural değişmedi: asla aç kalmayı ya da öğün atlamayı önerme.
- `me` (kart sırası):
  - **Hesabım:** BMR, TDEE, BKİ, makrolar.
  - **⚖️ İlerlemem** (`progressHTML`):
    - Yeşil kartta mevcut, başlangıç (ilk kilo kaydı) ve hedef kilo (`profile.goalWeight`).
    - "X kg verdin · Hedefe Y kg" ilerleme çubuğu.
    - Tahmini varış: Son 8 haftanın en küçük kareler eğimiyle hesaplanır (`weightTrend`), en az 10 günlük veri gerekir.
    - Haftada 1 kg'dan hızlı kayıpta uyarı verir.
    - Tartılma serisi (`weighStreak`): Ardışık 7 günlük dilimlerde en az bir tartılma. Bu hafta tartılmadıysa "seri tehlikede" yazar.
    - Kilo girişi ve SVG çizgi grafik (`weightChartHTML`): Turuncu kesikli hedef çizgisi var, noktaya dokununca değer görünür. Son 6 kayıt × ile silinebilir.
    - **Kilo tahmini:** `weightTrend` eğimiyle 4 hafta sonrası mavi kesikli çizgi ve "Bu gidişle 4 hafta sonra ≈ X kg" yazısı (en az 10 günlük veri gerekir).
    - Döngü regl ya da PMS dönemindeyse "1–2 kg su tutulması normal" notu çıkar.
  - **📏 Ölçülerim** (`measuresHTML`, `S.measures`): göğüs, bel, kalça, kol, bacak; ilk ölçüme göre fark ve bel/boy oranı (0,50 altı sağlıklı).
  - **Son 7 gün** grafiği.
  - **🗓️ Haftalık özet** (`weekCardHTML`, `id="weekCard"`):
    - Bugün hariç son 7 günün ortalamaları.
    - Kural tabanlı notlar: protein düşük, kalori üstte ya da çok altta, yağ yüksek, su, spor planına uyum, önceki haftayla kıyas, haftalık kilo değişimi.
    - Hedefin çok altında kalınca "öğün atlama" uyarısı verir, asla daha az yemeyi önermez.
  - **📊 Karşılaştırma** (`compareCardHTML`): son 7 / 30 / 365 gün ile önceki dönem; ▲ / ▼ / = ve kötüleşen alanlar için öneriler.
  - **🗓️ Aylık özet kartı** (`monthCardHTML`): canvas ile 1080×1350 PNG; Paylaş (`navigator.share` dosya) ya da İndir.
  - **⭐ Puanlarım**, **🎖️ Madalyalarım** (`badgesCardHTML`), **🎁 Ödüllerim** (renk teması bölümü kaldırıldı).
  - **🌸 Regl takibi** ayarı (`cycleSettingsHTML`, sadece kadın profili).
  - **Su hatırlatıcı:** Push ayarları da bu kartta.
  - **🍽️ Öğün hatırlatmaları ve haftalık rapor:** Pazartesi raporu açma/kapama, öğün hatırlatması açma/kapama ve öğün başına saat.
  - Profil (hedef kilo dahil; BKİ 18,5 altı hedef reddedilir), yedekleme, sıfırlama.

**Madalyalar** (2026-11-15'te eski 25 rozetin yerini aldı; `MEDALS`, `SPECIALS`, `medalStats`, `checkBadges`, `S.medals`):
- **21 kademeli madalya**, her biri 🥉 Bronz → 🥈 Gümüş → 🥇 Altın → 💎 Elmas (25 / 75 / 200 / 500 puan):
  - kayıt serisi, toplam kayıt günü, su, protein, dengeli kalori, mükemmel gün, 10 bin adım günü, toplam adım
  - uyku düzeni, erken yatma (20:00–23:30), erkenci kuş (kahvaltı o sabah 9'dan önce kaydedilmiş)
  - antrenman sayısı, yakılan kalori, güç günü, 150 dk'lık hafta, tartılan hafta, hedefe doğru kg
  - yemek çeşitliliği, ruh hali kaydı, kafeinsiz akşam, kullanım süresi
- **9 özel rozet:** hedefe ulaşma (500), planlı, favori, fotoğraf, ses, barkod, ölçü, alışveriş listesi, aylık kart paylaşımı.
- **Saklama:** `S.medals["id:kademe"]` ya da `S.medals["özel"]` içinde `{d, p}` tutulur. Kazanılan kademe geri alınmaz. `save()` sonrası 500 ms içinde ve açılışta kontrol edilir; yeni kademe kazanılınca kutlama penceresi açılır (`showBadgeModal(keys,true)`). Karttaki ilerleme çubuğu bir sonraki kademeyi gösterir, dokununca ayrıntı açılır (`showMedalInfo`).
- **Eski rozetlerden geçiş** (`rewards.medalMig`): Eski rozet puanları `rewards.legacyPts` olarak korunur. Geçiş anında hak edilmiş kademeler puansız (`mig:1`, `p:0`) işaretlenir; böylece çift puan olmaz.
- **Kurallar:** Hiçbir madalya az yemeyi ödüllendirmez. 7 günden eski günlere sonradan girilen kayıtlar (`noPts`) madalya ve seri hesabına girmez (`actDays()`, `dayRuns`).

**Başlık, selamlama ve motivasyon** (`header()`):
- Selamlama **Türkiye saatine** göre yapılır (`trNow()`, `Intl` + `Europe/Istanbul`; telefonun saat dilimi farklı olsa da):
  - 05–11 "Günaydın 🌅"
  - 11–17 "İyi günler ☀️"
  - 17–22 "İyi akşamlar 🌆"
  - 22–05 "İyi geceler 🌙"
- Eski hata: Saat 12'den önceki her saat "Günaydın" sayılıyordu, gece yarısı da buna dahildi.
- `guessMeal()` da Türkiye saatini kullanır.
- **Motivasyon satırı** (`.motiv`, `motivation()`): Verilere göre aday mesajlar toplanır: kayıt yok, seri, kalan kalori, hedefe yakınlık, su, yakılan kalori, planlı spor, akşam proteini, verilen kilo, seviyeye kalan puan, gece kontrolü. Seçim saat başı değişir (`gün×24 + saat` mod aday sayısı). 00–05 arası "uyku da hedefin parçası" mesajı çıkar.
- Sağ üstteki eski "📱 Telefonda" yazısının yerinde artık **⭐ puan · Sv seviye** düğmesi var (`#sync`, `goPoints`).

**Puan, seviye, seri ve ödüller** (`PTS`, `earnedPoints`, `S.rewards`):
- **Günlük puan** (`dayPointItems`):
  - Öğün kaydı 5 puan (en çok 4 öğün)
  - Kalori hedefin %80–110'unda 20 puan. **Hedefin altında kalmak puan kazandırmaz.**
  - Protein (%90+) 15, su hedefi 20, antrenman 15, toplam 30+ dk spor 10
  - Ruh hali kaydı 5; kayıt serisinin her 7. günü 50
- **Diğer puanlar:** Haftada bir tartılma 15, ayda bir ölçü 20. Madalya kademeleri 25 / 75 / 200 / 500; özel rozetler 25 (hedef 500). Eski rozet puanları `legacyPts`.
- **Sabitleme:** Geçmiş günlerin puanı ilk hesaplanınca `S.rewards.ptsHist[tarih]` içine kaydedilir. Böylece eski günler silinse ya da profil değişse de kazanılmış puan değişmez. Bugün canlı hesaplanır.
- **Geçmiş günlere sonradan kayıt (kullanıcı kararı, `touchDay`):**
  - Son 7 gün içindeki bir gün değişince sabitlenmiş puanı silinir ve yeniden hesaplanır.
  - Daha eski bir günün sabit puanı 0'dan büyükse (normal kayıt) değişmez. Puanı yoksa ya da 0 ise gün `noPts` olarak işaretlenir: istatistikte, takvimde ve karşılaştırmada sayılır ama puan, seri ve madalya vermez.
- **Bakiye:** Kazanılan − harcanan (`S.rewards.spent`).
- **Seviye:** Seviye n için gereken toplam puan `50·(n−1)·n` (2: 100, 3: 300, 4: 600, 5: 1000…). Seviye adları: Çaylak 🌱 → Efsane 👑.
- **Bildirimler:** `checkPoints()` (`checkBadges()` sonunda çalışır) puan artınca "+N ⭐" baloncuğu gösterir, seviye atlanınca kutlama penceresi açar. İlk açılışta bir kez puan sistemi tanıtım penceresi çıkar (`lastPts === null`).
- **Seriler:** Kayıt (günlük, `logStreak`; en uzunu `bestLogStreak`), su (günlük), spor (haftalık) ve tartılma (haftalık). Plan sekmesinde "🔥 N gün seri" ve "🎯 N gün hedefte" ayrı ayrı gösterilir.
- **Ödüller** ("Ödüllerim" kartı):
  - Kullanıcının kendi ödülleri: ad + puan. İlerleme çubuğu var; harcamak için 4 saniye içinde iki dokunuş gerekir, ardından kutlama penceresi çıkar.
  - 🧊 Seri koruyucu (150 puan): Dün kayıt yoksa ve öncesinde en az 2 günlük seri varsa Bugün ekranında uyarı çıkar. Koruyucu kullanılınca dünün tarihi `S.rewards.frozen`'a eklenir ve seri, rozetler ve puan hesaplarında kayıtlı gün sayılır.
  - ~~🎨 Renk temaları~~: Kullanıcının isteğiyle 2026-11-15'te arayüzden kaldırıldı. `normalizeState` `rewards.theme` değerini boşaltır; CSS ve `THEMES` kodda duruyor.
- **Tasarım kuralı:** Puanlar düzenli ve dengeli davranışı ödüllendirir; az yemek hiçbir yerde ödüllendirilmez.

**Gün seçimi, düzenleme, kopyala-yapıştır** (2026-11-15):
- **Görüntülenen gün:** `VIEW` (null = bugün) ve `curKey()`. `day()`, `totals()`, `dayTarget()`, `dayBurn()` ve `dayBonus()` varsayılan olarak görüntülenen günü kullanır.
  - Hatırlatmalar, bildirimden su ekleme ve `mealBitsToday` her zaman `todayKey()` kullanır.
  - `openDay(k)` "Bugün" ekranını o güne çevirir. "Bugün" sekmesine dokunmak (`setTab("today")`) bugüne döndürür.
  - Ekle sekmesi, hangi güne ekleme yapıldığını uyarıyla gösterir.
- **Düzenleme penceresi** (`#editSheet`, `ED`):
  - Yemek: ad, miktar, ½× / 1× / 1,5× / 2× porsiyon (açıldığı andaki değere göre çarpar), kcal, P, K, Y, öğün; Kaydet, Kopyala, Sil.
  - Antrenman: spor, süre, yoğunluk. Kalori `makeWorkout` ile canlı yeniden hesaplanır.
- **Kopyalama** (`CLIP = {type:"foods"|"workouts", items, label}`; ayrıca `localStorage["kaloriApp.clip"]` içinde 24 saat saklanır, çünkü iPhone uygulamayı arka planda yeniden yükleyince bellek siliniyordu. Kullanıcı "kopyaladım ama geçmişe yapıştıramıyorum" dedi): tek yemek, öğün (⧉), gün ("⧉ Günü kopyala"), günün sporları.
  - Yapıştırma çubuğu Plan sekmesinde, takvimin üstünde de görünür. Burada "takvimden güne dokun" ipucu ve tarih seçici vardır; ay görünümünde günler kesikli mavi çerçeveyle işaretlenir (`.mgrid.pastemode`).
  - Yapıştırma çubuğunda üç seçenek: "Bu güne", "+7 gün sonrasına", tarih seçici (`pasteTo(k)`). Gelecek tarihlere de yapıştırılabilir; o günler gelince puan sayılır.
- **Takvim** (`CAL`):
  - Hafta: tıklanabilir günler.
  - Ay: 7 sütunlu ızgara. Yeşil hedefte, turuncu hedef üstü, kesik çizgi az kayıt; 💧 su hedefi, 🏃 spor.
  - Yıl: 12 mini ay, aya dokununca ayrıntısı açılır.
  - **Not:** `.seg button[data-v]` tıklamalarını profil formundaki seçim kutuları yakalar. Yeni seçim düğmeleri bu yüzden `data-val` kullanır.
- **Veri saklama:** Gün sınırı 90'dan **730 güne** çıkarıldı (`pruneOld`).

**Karşılaştırma** (`periodStats(bitiş, gün sayısı)`): Ortalama kalori (hedefe yakınlık), protein, su, adım, uyku (önerilen aralığın ortasına yakınlık), haftalık spor dakikası, ruh hali, kafein (az iyi), şeker (az iyi), kilo değişimi (hedef yönü). Karşılaştırma için iki dönemde de en az 3 kayıtlı gün gerekir.

**Alışveriş listesi** (`shopCardHTML`, `S.shop = {items:[{id,name,qty,cat,note,done,own}], at}`):
- Gemini, günlük diyet listesinden 1 haftalık malzeme listesi çıkarır: aynı ürünleri birleştirir, satın alınabilir birim kullanır, "veya" seçeneklerinin ilkini alır, `SHOP_CATS` kategorilerine ayırır.
- Gemini kullanılamazsa `shopLocal()` her maddenin baştaki miktarını 7 ile çarpar ve kategoriyi `SHOP_KW` anahtar kelimeleriyle bulur.
- Liste yenilenince kullanıcının kendi eklediği ürünler (`own`) korunur.
- Ürünler işaretlenebilir; alınanlar ya da bütün liste silinebilir; "Paylaş" `navigator.share` ya da panoya kopyalama kullanır.

**Ruh hali, kafein, şeker:**
- **Ruh hali:** `day.mood = {m:1–5, e:1–3, note}`. Kayıt 5 puan. 1–2 seçilince destek mesajı çıkar. Son 60 güne bakıp "uyuduğun / spor yaptığın günlerde ruh halin…" içgörüsü verir (her grupta en az 3 gün, fark ≥ 0,5).
- **Kafein:** `day.caf = [{k, t}]`, miktarlar mg: çay 45, Türk kahvesi 60, filtre 95, espresso/latte 65, enerji içeceği 80, kola 35. Üst sınır 400 mg; 16:00'dan sonraki kafein için uyarı verir, uykuyla ilişkisini de gösterir.
- **Şeker:** `day.sug = [{k, t}]`, eklenmiş şeker gramı: küp 4, bal 8, tatlı 20, içecek 35. İdeal 25 g'ın altı, en çok 50 g.
- Bu kart takip içindir; kalori eklemez. Geçmiş güne eklenenler `nowForDay` ile öğlen saatine yazılır.

**Regl takibi** (2026-11-15'te yenilendi; kullanıcı geri bildirimi: "herkesin döngüsü aynı değil, döngümü sorsun, yumurtlama dönemimi bildirsin"):
- **Veri:** `S.cycle = {on, starts:[YYYY-MM-DD], ends:{başlangıç:bitiş}, len, lenUnknown, dur, regular, mode, setup, notif:{on, consent, types, time, discreet}}`. Günlük belirtiler: `day.sym = {k:[kramp, siskinlik, bas, akne, tatli, yorgun, gergin, hassas, sicak], flow:0–3}`. Sadece kadın profilinde ve kullanıcı açarsa çalışır.
- **Kurulum** (Ben → 🌸 Regl takibi; açınca sorulur): son regl başlangıcı, döngü uzunluğu (20–45 ya da "Bilmiyorum" → 28 ile başlayıp öğrenir), regl süresi (2–10 gün), düzenli mi, durum (normal / doğum kontrol hapı / hamile-emziriyor / menopoz). Sonradan "⚙️ Döngü bilgilerimi düzenle" ile değiştirilebilir. Eski kullanıcılar: başlangıç kaydı varsa kurulum tamam sayılır.
- **Hesap** (`cycleStats`, `cycleInfo`):
  - Uzunluk: en az 2 geçerli (20–45 gün) aralık varsa son 6 döngünün ortalaması; yoksa kullanıcının girdiği değer.
  - Regl süresi: "Regl bitti" kayıtlarının ortalaması.
  - Düzensizlik: döngüler arası fark 7 günden fazlaysa, ortalama 21–35 dışındaysa ya da 45–120 günlük bir boşluk varsa hekime danışma notu çıkar.
  - Yumurtlama: döngü günü = uzunluk − 14. Doğurgan dönem: yumurtlamadan 5 gün önce ile 1 gün sonrası arası. Hap modunda yumurtlama ve doğurgan dönem gösterilmez, tahmin "çekilme kanaması" olarak adlandırılır. Hamile ve menopoz modlarında tahmin ve bildirim yoktur, sadece belirti kaydı vardır.
- **Kart** (Bugün; geçmiş günlerde de belirti kaydı için görünür):
  - Evre çubuğu, tahmini sonraki regl, ⭐ yumurtlama ve 🌸 doğurgan dönem ("şu an" etiketiyle).
  - **"Doğum kontrol yöntemi olarak kullanılamaz"** uyarısı (bozulmaması gerekenler arasında).
  - Regl başladı ve regl bitti düğmeleri, belirtiler, regl günlerinde akıntı yoğunluğu, belirti örüntüleri (`symptomInsights`: en az 3 kayıt ve %50'den fazlası aynı dönemde; ör. "Kramp çoğunlukla reglin ilk 2 gününde (3/3 kez)"), 💬 Dertleş.
- **Diğer yerler:**
  - Takvim ay görünümünde alt çizgiler (`cycleMark`): kırmızı regl, pembe tahmini regl, yeşil doğurgan dönem, mor ⭐ yumurtlama.
  - Spor kartında döneme uygun spor önerisi (`PHASE_SPORT`).
  - Hamile modunda kilo verme hedefi seçiliyse uyarı.
- **Telefon bildirimleri** (kullanıcı kararı: A seçeneği, gizli metin):
  - Açık onay gerekir (`notif.consent`). Sunucuya yalnızca yaklaşan en fazla 4 hatırlatmanın tarihi ve türü gider (`cycleEvents`). Örnek: `"261128p,261201s,261203t,261215f"`; türler s = 2 gün kala, t = tahmini gün, f = doğurgan dönem başlıyor, p = PMS başlıyor. Döngü geçmişi ve belirtiler telefonda kalır.
  - Ayarlar: türler tek tek açılıp kapatılabilir, saat varsayılan 09:00, gizli metin varsayılan açık ("🌸 Döngü hatırlatması · Ayrıntı için dokun.").
  - "Onayı geri çek" seçildiğinde sunucudaki tarihler bir sonraki abonelik güncellemesinde silinir.
  - Tarihler gün geçtikçe kaydığı için uygulama açılışta `pushAfterSave()` ile sunucuyu günceller.
  - Bildirime dokununca `#dongu` bağlantısı açılır.
- **Gizlilik:** Döngü geçmişi sunucuya gönderilmez; yalnız bildirim tarihleri (onayla) gider. Dertleş metni cevap için Gemini'ye gider.

**Bulut yedeği** (2026-11-16, yönetici paneli planının 1. adımı):
- **Kullanıcı kararları:** Herkes için **otomatik açık**. Regl ve ruh hali dahil **bütün veriler** yedeklenir. Kullanıcılar arkadaş ve aile çevresidir.
- **Bilgi notu:** Kullanıcıya bir kez gösterilir (`showCloudNotice`): veriler yedekleniyor, yönetici görebilir, kapatılabilir. Onay istemez, sadece bilgilendirir. Bu not bilerek kaldırılmamalı.
- **Kurtarma kodu:** 12 karakter (`CLOUD_ABC`, ~60 bit), `KLR-XXXX-XXXX-XXXX` biçiminde gösterilir. Tek gizli bilgidir; `S.cloud.code` içinde durur.
  - Sunucuda kodun SHA-256'sından türetilen kimlik kullanılır: `u:<id>` en güncel veri, `b:<id>:<YYYY-MM-DD>` günlük kopya (30 gün saklanır).
  - `u:` metadata'sında ad, cinsiyet, zaman, boyut, gün sayısı, kod ve sürüm tutulur; yönetici listesi için.
- **Eşitleme** (`cloudSync`):
  - Veri değişince (`save` → `cloudTouch`) 20 sn sonra denenir. Aynı içerik (SHA özeti) hiç gönderilmez. En sık 3 dakikada bir gönderilir.
  - Uygulama arka plana geçince bekleyen değişiklik hemen gönderilir; her dakika bekleyen olup olmadığına bakılır.
  - Günün ilk gönderiminde `snap: true` ile günlük kopya alınır. KV ücretsiz kotası günde 1000 yazma; aile ölçeğinde yeter.
- **Ben → ☁️ Bulut yedeği kartı:**
  - Son yedek zamanı, kod (göster, kopyala, kendine gönder), şimdi yedekle.
  - 🕘 Eski bir güne dön (günlük kopyalardan; iki dokunuşla onay).
  - Başka telefondan geri yükleme (o kodu benimser).
  - Aç/kapat ve "Buluttaki verilerimi sil" (iki dokunuş; sonra yedek kapanır).
  - Karşılama ekranında da "Kurtarma kodunla geri yükle" vardır.
- Yedek dosyası (JSON) yüklenince bu telefonun kodu korunur.
- **Worker:** `/cloud/save | load | list | delete | check` (`handleCloud`). "KLR-" önekli ve küçük harfli kod da kabul edilir. Origin kontrolü ve IP başına dakikada 20 istek sınırı geçerlidir.
- **Testler:** Worker için `wtest4` (12 kontrol); tarayıcı için test10 (24 kontrol, sahte bulutla).
  - **Önemli:** Diğer test gruplarında bulut yedeği `{on:false, notice:true}` ile kapatılır, gerçek KV'ye test verisi yazılmasın diye. Yeni testlerde de buna dikkat et.

**Yönetici paneli planı** (kullanıcı onayladı; sırayla yapılacak):
1. ✅ Bulut yedeği, kurtarma kodu, bilgi notu.
2. ✅ Yönetici paneli (aşağıda).

3. ✅ Duyurular ve toplu bildirim, istatistik (isimli; kullanıcı kararı), içerik yönetimi, ayarlar / özellik anahtarları / bakım modu (aşağıda "Uzaktan yapılandırma").

**Yönetici paneli** (`admin.html`, adres `https://ulkueralp.github.io/kalori/admin.html`):
- **Giriş:** Şifre Cloudflare'de `ADMIN_PASSWORD` secret'ı (Claude üretti, API ile yazdı; sohbette ve depoda yok). Şifre ve kullanım rehberi kullanıcının masaüstünde: `Kalori - Yönetici ve Uygulama Bilgileri.txt`. Oturum anahtarı `bitiş.imza` (HMAC-SHA256, anahtar = şifre, 12 saat); şifre değişince eski oturumlar düşer. Panel anahtarı `sessionStorage`'da tutar ve her isteğin gövdesinde `token` olarak yollar (başlık yok, CORS değişmedi).
- **Kilit:** IP başına 5 yanlış denemede 15 dk (`adm:fail:<sha256(ip)>`, TTL 900). Diğer `/admin/*` istekleri genel "dakikada 20" sınırından muaf (oturum imzasıyla korunur); `/admin/login` muaf değil.
- **Kayıt:** Her giriş, düzenleme, geri yükleme, bildirim ve silme `adm:log`'a yazılır (son 200). Panelde "📜 Kayıtlar".
- **Ekranlar:** Kullanıcı listesi (ad, cinsiyet, son yedek, gün sayısı, sürüm, 🔔 bildirim açık, ✎ yönetici düzeltti). Kişi sayfası sekmeleri: Profil (+ son 7 gün özeti), Günler (yemek düzenle/ekle/sil, su, adım, "diğer kayıtlar" JSON'u, günü sil), Kilo, Regl (kadınlarda; döngü JSON'u), Yedekler (günlük kopyalar, "önceki sürüm"e dön, JSON indir, buluttan sil), Bildirim (kişiye özel), Ham veri (bütün JSON). Değişiklikler "Kaydet ve telefona gönder"e basılana kadar sadece panelde.
- **Telefona sessiz aktarım (kullanıcı kararı: "yönetici güncelledi" bildirimi GÖSTERİLMEZ):**
  - Yönetici kaydı `u:<id>`'yi yazar, önceki hâli `p:<id>`'ye saklar, `m:<id>` = düzeltme zamanı.
  - Telefon açılışta ve uygulamaya dönüldüğünde `/cloud/check` ile `m:<id>`'ye bakar; `S.cloud.adminSeen`'den yeniyse `cloudPullAdmin()` yönetici sürümünü alır, `S.cloud`'u korur, sessizce `render()` eder.
  - Telefon kayıtta `as: adminSeen` gönderir; sunucu `m > as` ise **409** döner ve telefon önce yönetici sürümünü alır (eski telefon verisi yönetici düzeltmesini ezemez). Bedeli: yönetici düzeltmesinden sonra telefonda internetsizken girilip henüz gönderilmemiş kayıt kaybolabilir (notta yazıyor).
  - Kullanıcı kendi geri yükleme yaptığında `adminSeen` sunucudaki `adm` ile güncellenir.
  - Panel kaydında çakışma koruması: `base` (yüklenen `at`) değiştiyse 409, "kullanıcıyı yeniden aç".
- **Kişiye bildirim:** Telefon kayıtta `pe` (bildirim endpoint'i; bildirim açıksa) gönderir; Worker `u:` metadata'sına `pk = subKey(pe)` yazar. `/admin/push` bu aboneliğe `type:"admin"` bildirim yollar.
- Bulut bilgi notu ve kartı: "yöneticisi tarafından destek için görülebilir **ve gerektiğinde düzeltilebilir**".
- Panelde düzenleme kutuları değişince sayfa yeniden çizilmez, sadece alttaki kaydet çubuğu güncellenir (yoksa odak ve tıklama kayboluyordu).

**💬 Koç** (Öneri sekmesinin yeni hâli; sekme anahtarı hâlâ `sugg`, özellik anahtarı `sugg`):
- Sıra: `coachSumHTML` (📈 Gidişatın: `coachInsights()` son 7 gün; kalori ortalaması bitmemiş bugünü hariç tutar; ✅/🎯 maddeleri; günde bir kez Gemini yorumu `S.coach.sum={d,text}`, istemde "GİDİŞAT ÖZETİ"), `coachChatHTML` (sohbet, 6 hazır soru, yazma kutusu), `suggCardHTML` (eski "Ne yesem?").
- `coachContext()`: profil, hedefler, bugün yenenler ve kalan, son 14 gün (kcal/hedef, P/K/Y, su, adım, spor, uyku, ruh hali), diyet listesi, spor planı, son 6 kilo, seri, döngü evresi (regl açıksa). Son 10 mesaj geçmiş olarak eklenir. `COACH_RULES`: alt kalori sınırı, öğün atlatmama, teşhis/ilaç yok, yeme bozukluğu işaretinde uzmana yönlendirme.
- Cevap JSON `{reply, foods[]}`; `foods` için "＋ Yedim" düğmesi (o anki öğüne, `added` işareti). `**kalın**` biçimi desteklenir.
- `S.coach={msgs (son 80), cnt:{d,n}, sum}` bulut yedeğine girer (kullanıcı kararı). Günlük sınır `CFG.limits.coach` (varsayılan 45, panelden). Yapay zekâ yoksa/yoğunsa `coachLocalReply` verilere göre özet verir.
- Worker `/ai` istem sınırı 8000 → 16000 karakter.
- **Dertleş** mesajları artık `S.cycle.talks` (son 50, `{ts,q,a}`) olarak kaydedilir; panelde kişi → 💬 Sohbetler sekmesinde koç sohbetiyle birlikte görünür (salt okunur).
- Bulut bilgi notu: "(regl, ruh hali ve sohbetler dahil bütün kayıtlar)".

**Uzaktan yapılandırma** (panel 3. adım; KV anahtarı `cfg`):
- Yapı: `{v, ann:[{id,title,body,icon,ids,at,until,push,pushed,created}], content:{foods,hide,motiv,crave}, flags:{photo,voice,barcode,sugg,cycle,dertles,shop}, defaults:{reminderMin,wakeStart,wakeEnd,glass}, maint:{on,msg}}`.
- Uygulama açılışta (ve 10 dk'dan uzun aradan sonra öne gelince) `POST /config {code}` ile alır, `localStorage["kaloriApp.cfg"]`'ye yazar; internetsizken son kopya uygulanır. Sunucu duyuruları zamana ve kişiye göre süzer (`ids` boş = herkes; kod → kimlik).
- **Duyuru kartı:** Bugün ekranının en üstünde (`annCardHTML`, en fazla 3). "Tamam" → `S.annSeen` (son 100). Bildirimli duyuru: zamanı geldiyse kaydedilince hemen, zamanlıysa cron'da (`sendDueAnnouncements`) bir kez gönderilir (`pushed`).
- **İçerik:** `content.foods` ([ad, porsiyon, kcal, p, k, y]) aynı adlı hazır yemeği değiştirir, yoksa ekler; `hide` gizler (`FOOD_BASE` kopyasından yeniden kurulur, `DB_IDX` sıfırlanır). `motiv` motivasyon adaylarına eklenir. `crave[kategori]` `CRAVE_LOCAL`'a eklenir.
- **Özellik anahtarları:** `feat(k)` false ise: Öneri sekmesi, Foto/Barkod modu, 🎤 düğmesi, Dertleş, alışveriş kartı gizlenir; regl kapalıysa `cycleOn()` false ve ayar kartı gizli. Veri silinmez.
- **Varsayılanlar:** sadece ilk profil kaydında `S.settings`'e uygulanır. **Bakım modu:** başlıkta uyarı şeridi; uygulama çalışmaya devam eder.
- **İstatistik** (`/admin/stats`): her `u:` verisi okunur; kişi başı son 7 gün (kayıtlı gün, ort. kcal/su/adım, spor günü), kilo ve değişim, son 30 günün en çok eklenen yemekleri. Panelde 3+ gün açmayanlar turuncu ve bildirim için önceden seçili.
- **Toplu bildirim** (`pushMany`): `ids` boşsa bütün `sub:` abonelikleri, doluysa kişilerin `pk`'si; 10'arlı gruplar, 404/410 aboneliği siler.

**Ölçüler** (`MEASURES`): Göğüs, bel, kalça, kol (pazı), bacak (uyluk). İstenen kadarı doldurulur. Her ölçü kendi ilk ve son değeriyle karşılaştırılır; bel/boy oranı da gösterilir. Kutular `m_<anahtar>` adını taşır.

**Diyet listesi doldurma** (`dietToolsHTML`, `DIET_PROMPT`):
- **📸 Fotoğraftan doldur:** En çok 4 sayfa, basılı ya da el yazısı. Görsel 1600 px'e küçültülür, Gemini okuyup `{kahvalti, ogle, aksam, ara, note}` döndürür. Sayfalar birleştirilir; kuşluk, ikindi ve gece öğünleri etiketle "ara"ya yazılır.
- **📋 Metni yapıştır:** Önce Gemini denenir; olmazsa `dietLocalSplit()` başlıklara (Kahvaltı, Öğle, Akşam, Kuşluk, İkindi, Gece, Ara) bakarak böler.
- Sonuç hemen kaydedilir. "↶ Geri al" bir önceki listeyi getirir.

**Spor ve antrenmanlar** (index.html'de `SPORTS` bölümü):
- **Katalog:** 29 spor, 5 kategori (kardiyo, güç, esneme, takım ve raket, günlük). Her sporun hafif, orta ve yoğun MET değeri vardır (Compendium of Physical Activities 2011/2024). Bazı sporlarda yoğunluk etiketi özeldir, örneğin koşuda "~10 km/s".
- **Hesap:** Net yakılan kcal = **(MET − 1) × kilo × saat** (`burnKcal`). Dinlenme MET'i düşüldüğü için aynı kalori iki kez sayılmaz.
- **Yeme hakkı:** **Yakılanın yarısı** (`EAT_BACK = 0.5`, kullanıcının seçimi) o günün hedefine eklenir: `dayTarget(k) = targets().kcal + dayBonus(k)`. Bu hedef şu yerlerde kullanılır: Bugün halkası, Öneri sekmesindeki kalan kalori, Plan haftası ✅/🟠, seri, son 7 gün grafiği, haftalık özet ve "dengeli hafta" rozeti. Alt sınır etkilenmez, çünkü hedef sadece artar.
- **Veri:** `day.workouts = [{id,key,name,ic,cat,int:0|1|2,min,met,kcal,t}]`. kcal eklendiği andaki kiloyla hesaplanıp saklanır. Antrenman eklenince `day.sport = true` olur, son antrenman silinince `false`.
- **Ekleme yolları:** Bugün kartında "＋ Antrenman" düğmesi bir alt pencere açar (`#wkSheet`): kategori, spor, yoğunluk ve süre seçilir, yakılan kalori anında görünür.
  - Yazarak ("45 dk tempolu yürüyüş, yarım saat ağırlık"): önce `parseWorkouts()` yerel olarak tanır. Bunun için kökler, süre ifadeleri ("1,5 saat", "yarım saat") ve yoğunluk kelimeleri kullanılır.
  - Tanınamazsa Gemini'ye sorulur. Gemini katalog anahtarı ya da `other` + `met` (1,5-12) döndürür; kaloriyi yine uygulama hesaplar.
- **Plan (2026-11-15'ten itibaren gün başına birden çok spor):**
  - Veri: `S.plan.sportItems[0..6] = [{key,min,int}, …]` (bir güne en çok 6 spor). `normalizeState` eski tek kayıtlı biçimi (`{…}` ya da `null`) listeye çevirir.
  - Plan sekmesinde her gün için "＋ Spor" düğmesi ve satır satır seçim kutusu, dakika, yoğunluk ve × vardır (`data-pk/pm/pn="gün:sıra"`). Değişiklikler anında kaydedilir (`planSync`). `S.plan.sport[i]` metni "Yürüyüş 40 dk + Eliptik 20 dk" biçiminde otomatik oluşur.
  - Bugün kartında yapılmamış her plan kalemi için ayrı bir "✓" düğmesi ve "✓ Hepsini yaptım" düğmesi bulunur. Hangi kalemlerin yapılmadığını `pendingPlan()` bulur: aynı spordan yapılan antrenmanlar plan kalemlerini sırayla karşılar.
- **Haftalık özet:** Spor dakikası ve yakılan kalori gösterilir. Dünya Sağlık Örgütü önerisine göre değerlendirilir: haftada en az 150 dk orta tempo (MET ≥ 6 dakikaları 2 sayılır, MET 3-6 dakikaları 1) ve haftada 2 gün güç antrenmanı.
- **Rozetler:** İlk güç antrenmanı, 7 günde 150 dk, toplam 1000 kcal. Toplam 23 rozet.
- **Çift sayım uyarısı:** Profilde hareket seviyesi 1,55 ya da üstüyken antrenman girilirse "Az hareketli seçmen önerilir" notu çıkar.
- **Ondalık virgül:** Yemek ve spor metinlerinde "1,5" bölünmesin diye virgüllü sayılar önce noktaya çevrilir. Eskiden "1,5 porsiyon" 5 porsiyon sayılıyordu; bu hata düzeltildi.

**Adımlar** (`stepCardHTML`, `day.steps`, `day.stepGoal`, `settings.stepGoal`):
- **Kısıt:** Web uygulaması telefonun adım sayarını (Apple Sağlık / Health Connect) OKUYAMAZ. Kullanıcı sayıyı yazar, "📋" ile panodan yapıştırır ya da `#adim=8500` bağlantısıyla aktarır (`setSteps`). Gerçek otomatik okuma için Capacitor ile yerel uygulamaya geçmek gerekir.
- **Otomatik hedef** (`stepGoal`):
  - Son 7 günde en az 3 kayıt varsa: ortalama + 1000, 500'e yuvarlanır, 6.000–10.000 arasında tutulur. Ortalama zaten 10.000+ ise ortalama korunur (en çok 15.000).
  - Kayıt yoksa hareket seviyesine göre 6.000 / 7.000 / 8.000 / 10.000.
  - `settings.stepGoal > 0` ise kullanıcının elle girdiği hedef geçerlidir.
- **Gösterim:** En az 5.000 (`STEP_MIN`), ideal 7.000–10.000. Kalan adım ve yaklaşık yürüyüş süresi (100 adım/dk) gösterilir. Seviye etiketleri: hareketsiz, az, orta, aktif.
- **Kalori:** Adımla yakılan kalori yalnızca bilgi amaçlıdır (adım × kilo × 0,0005). Yeme hakkına eklenmez, çünkü hareket seviyesi bunu zaten içeriyor.
- **Ödüller:** Adım hedefi tamamlanınca 15 puan; "10.000 Adım" rozeti.

**Uyku** (`sleepCardHTML`, `day.sleep = {bed, wake, q:1–5}`; kayıt uyanılan güne yazılır):
- **Önerilen süre** (`sleepRange`, NSF/AASM): 13 yaş 9–11, 14–17 yaş 8–10, 18–64 yaş 7–9, 65+ yaş 7–8 saat. İdeal süre aralığın ortasıdır.
- **Spora göre ayar** (`hardDay`): O gün ≥400 kcal, ≥60 dk ya da 30+ dk yoğun spor yapıldıysa alt sınır ve hedef 0,5 saat artar (en çok üst sınır kadar).
- **Yatıştan kalkış hesabı (kullanıcının isteği; uygulama kalkıştan geriye yatış saati hesaplamaz):**
  - **Gece (Türkiye saatiyle 18:00–04:00):** "🌙 Yatıyor musun?" bölümünde yatış saati şu anki saattir (`nowHM()`, 5 dakikaya yuvarlanır). Önerilen kalkış = yatış + 15 dk dalma payı + hedef süre (`wakeFor`). Ayrıca önerilen aralığa düşen 5 ve 6 uyku döngüsü (90 dk) kalkışları gösterilir. Saat değiştirilince hesap anında güncellenir.
  - "😴 Yatıyorum" düğmesi `S.sleepPending = {bed, t}` kaydeder (16 saat geçerli, `pendingBed`). Gece formu gizlidir; "＋ Dün geceki uykunu ekle" bağlantısıyla açılır.
  - **Sabah:** Form, yatış saatine bekleyen saati, kalkış saatine şu anki saati koyar (04:00–13:00 arası). "☀️ Uyandım, kaydet" ile uyku kaydedilir ve bekleyen saat temizlenir.
  - **Gündüz:** Not yalnızca önerilen süreyi söyler ve "yatarken Yatıyorum'a dokun" hatırlatması yapar.
  - `sleepAdvice().bed` (kalkıştan geriye yatış) fonksiyonda duruyor ama arayüzde artık gösterilmiyor. Türkçe ek hatası olmasın diye saat cümlelerinde ek kullanılmıyor.
- **Kontroller:** Gece yarısını geçen uykular doğru hesaplanır; 16 saatten uzun uyku reddedilir. Durum etiketleri: az, sağlıklı, biraz fazla, fazla. Son 7 gecenin ortalaması ve uyku borcu gösterilir.
- **Ödüller:** Yaşa uygun aralıktaki uyku 10 puan; "Düzenli Uyku" rozeti (7 gece üst üste).
- **Diğer yerler:** Haftalık özette adım ve uyku notları, motivasyon satırında adım ve uyku mesajları var. Toplam rozet sayısı 25.

**Hesaplamalar** (`targets()`):
- Bazal metabolizma: Mifflin-St Jeor formülü. Günlük harcama = bazal metabolizma × hareket katsayısı.
- Hedefe göre ayar: Kilo vermek −500, korumak 0, almak +300 kcal.
- **Güvenlik alt sınırı:** Kadında 1200, erkekte 1500 kcal. Sağlık güvenliği için bilinçli bir karar; kaldırma.
- Makrolar: Protein, korumada 1,2 g/kg, diğer hedeflerde 1,6 g/kg. Yağ, kalorinin %28'i. Karbonhidrat, kalan kalori.
- Su hedefi: 33 ml/kg, 100 ml'ye yuvarlanıyor.

**Durum şeması (`S`):**
```js
{
  profile: {name, sex:"f"|"m", age, height, weight, activity:1.2..1.9, goal:"lose"|"keep"|"gain", goalWeight:kg|null} | null,
  days: { "YYYY-MM-DD": { foods:[{id,meal,name,amount,kcal,p,c,f,t}], water: ml, sport: bool, workouts, steps, stepGoal, sleep,
                          mood:{m,e,note}, caf:[{k,t}], sug:[{k,t}], noPts? } }, // son 730 gün tutulur; noPts: puansız sonradan doldurulmuş eski gün
  plan: { sport:{0..6:"metin"}, diet:{kahvalti,ogle,aksam,ara} },
  settings: { reminderMin, wakeStart, wakeEnd, glass, reminders, weeklyOn,   // weeklyOn: Pazartesi raporu
              mealRem: { on, t:{kahvalti:"09:00", ogle:"13:00", aksam:"19:30", ara:""} },  // "" = o öğün kapalı
              push, pushEndpoint, pushSig, pushDone, pushMealDone },   // push alanları sunucu senkronu için
  weights: [{date, kg}],
  favs: [{name, amount, kcal, p, c, f}],   // en fazla 30; anahtar = Türkçe karaktersiz ad + kcal
  measures: [{date, chest?, waist?, hip?, arm?, thigh?}],   // cm; girilmeyen alan yok ya da null
  badges: { id: kazanılmaTarihi },
  stats: { photo, voice, barcode },        // rozetler için sayaçlar
  rewards: { spent:[{id,name,cost,date}], themes:[id], theme:"", freezes, frozen:["YYYY-MM-DD"],
             custom:[{id,name,cost}], ptsHist:{tarih:puan}, lastPts, lastLevel, medalMig, legacyPts },
  medals: { "id:kademe" | "özel": {d, p, mig?} },
  cycle: { on, starts:["YYYY-MM-DD"], dur, len },
  shop: { items:[{id,name,qty,cat,note,done,own}], at },
  sleepPending: {bed, t} | null,
  // plan.sportItems ve day.workouts için Spor bölümüne bak
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

**Ondalık sayılar:** Kilo, hedef kilo, ölçü ve gram kutuları `type="text" inputmode="decimal"` ve `numTR()` ile okunur. Böylece Türkçe klavyedeki virgül ("70,5") çalışır; `type="number"` bazı telefonlarda virgüllü değeri boş döndürür.

**Bildirim bağlantıları:** `#rapor` Ben sekmesinde haftalık özeti açar. `#su-ekle` 1 bardak su ekler. `#ogun-<kahvalti|ogle|aksam|ara>` Ekle sekmesini o öğünle açar (`handleHash`). Uygulama zaten açıksa sw.js `{type:"open", hash}` mesajı gönderir.

**Push akışı (istemci):**
1. `enablePush()`: İzin istenir. `GET /push/key` ile VAPID açık anahtarı alınır, `pushManager.subscribe` çağrılır, sonra `POST /push/subscribe` ve `POST /push/test`.
2. iPhone'da uygulama ana ekrandan açılmadıysa (`isStandalone()` false), düğme yerine "ana ekrana ekle" uyarısı gösterilir.
3. Bildirimdeki "+1 bardak" düğmesi (sadece Android'de görünür) uygulamayı `#su-ekle` ile açar ya da mesaj gönderir; uygulama 1 bardak ekler.

## 5. Worker API

| Yöntem ve yol | Gövde | Açıklama |
|---|---|---|
| `POST /ai` (ya da `/`) | `{prompt, image?:{mime,data(base64)}, audio?:{mime,data(base64)}}` (ses: uygulama `audio/wav` gönderir) | Gemini `generateContent`, `responseMimeType: application/json` → `{text, model}`. **Yedek model zinciri:** Önce `GEMINI_MODEL`, sonra `GEMINI_FALLBACK_MODELS` (varsayılan `gemini-flash-lite-latest,gemini-2.5-flash,gemini-2.5-flash-lite`) denenir. Model başına 20 sn, toplamda 50 sn sınır var. 404, 429, 5xx ya da zaman aşımında sıradaki modele geçilir; 400 gelirse hemen dönülür. Hepsi 429 verirse 429, değilse 503 döner (`tried` listesiyle). |
| `GET /push/key` | – | `{publicKey}` |
| `POST /push/subscribe` | `{subscription, tz, interval, start, end, goal, enabled, mealsOn, meals:[dk×4], weekly, cycle?:{ev, t, d}}` (`wk:1/0`; alan yoksa açık. `cycle`: onaylı döngü hatırlatmaları; `ev` en fazla 4 kayıt ve `/^\d{6}[stfp](,\d{6}[stfp]){0,3}$/` kalıbına uymalı → `cy`, `cyT` (dakika), `cyD` (gizli metin 1/0)) | KV'ye yaz (anahtar `sub:<sha256 ilk 16 bayt>`, **tüm veri metadata'da**; metadata sınırı 1024 bayt, şu an yaklaşık 275 bayt + endpoint). Öğün saatleri `ml:"540,780,1170,-1"` olarak saklanır; `done` ve `md` korunur. |
| `POST /push/unsubscribe` | `{endpoint}` | Sil |
| `POST /push/done` | `{endpoint, date:"YYYY-MM-DD"\|""}` | O gün su hatırlatmasını durdur |
| `POST /push/meal` | `{endpoint, date, bits}` | Bugün yemek eklenen öğünler (bit 1 kahvaltı, 2 öğle, 4 akşam, 8 ara). `md:"tarih:bits"` olarak saklanır; o öğünlere hatırlatma gitmez. |
| `POST /push/test` | `{endpoint}` | Deneme bildirimi |
| `POST /cloud/save\|load\|list\|delete\|check` | `{code, data?, snap?, v?, as?, pe?, date?}` | Bulut yedeği. `save`, `m:<id>` > `as` ise 409 döner. `load` ve `check` `adm` döndürür. |
| `POST /admin/login` | `{password}` | `{token, exp}`; 5 yanlışta 15 dk kilit (429). |
| `POST /admin/users\|log` | `{token}` | Kullanıcı listesi (`u:` metadata + `push`), işlem kaydı. |
| `POST /admin/user\|save\|restore\|push\|delete` | `{token, id, data?, base?, note?, date?("YYYY-MM-DD"\|"prev"), title?, body?}` | Kişi verisi, düzenleme (çakışmada 409), geri yükleme, kişiye bildirim, buluttan silme. |
| `POST /config` | `{code?}` | Uzaktan yapılandırma (süzülmüş duyurular, içerik, özellikler, varsayılanlar, bakım). |
| `POST /admin/config\|config-save` | `{token, cfg?:{content?,flags?,defaults?,maint?}}` | Yapılandırmayı oku / kaydet (sunucu temizler ve sınırlar). |
| `POST /admin/ann-save\|ann-delete` | `{token, ann:{id?,title,body,icon,ids,at,until,push}}` / `{token,id}` | Duyuru. |
| `POST /admin/pushmany\|stats` | `{token, ids, title, body}` / `{token}` | Toplu bildirim; istatistik. |
| `scheduled` (cron `*/15 * * * *`) | – | `list()` metadata'larını okur, zamanı gelene su (`type:"water"`) ve öğün (`type:"meal"`, `url:"./#ogun-…"`) bildirimi gönderir. 404 ya da 410 dönen aboneliği siler. |

- **Zamanlama durumsuz:** Kullanıcının saat dilimindeki dakika için `since = dakika − başlangıç×60` hesaplanır. `since >= interval` ve `since % interval < 15` ise bildirim gönderilir. "Son gönderim" yazılmadığı için KV yazma kotası harcanmaz.
- **Öğün zamanlaması (`dueMeal`):** `0 ≤ dakika − öğünSaati < 15` ve o günün `md` bitinde o öğün yoksa gönderilir. Su hatırlatıcısı kapalı olsa da çalışır; yalnız telefon bildirimlerinin açık olması gerekir.
- **Döngü hatırlatması (`cycleDue`):** Yerel tarihin `YYMMDD` kodu `cy` listesinde varsa, `cyT` saatinden sonraki 15 dakikada `type:"cycle"`, `url:"./#dongu"` bildirimi gönderilir. Metin `cyD=1` ise gizlidir; `cyD=0` ise `CYCLE_TXT` kullanılır. Deno'da şifreli bildirim çözülerek denendi: gizli ve açık metin doğru, yanlış gün ve saatte gönderilmiyor, hatalı veri reddediliyor.
- **Haftalık rapor (`weeklyDue`):** Yerel saatle Pazartesi 09:30-09:45 arasında `type:"weekly"`, `url:"./#rapor"` bildirimi gönderilir. Sunucuda kullanıcı verisi olmadığı için bildirim yalnızca "raporun hazır" der; rakamları uygulama gösterir. `localNow` artık `weekday` de döndürüyor.
- **sw.js:** Bildirim etiketi `kalori-<type>` olur (water, meal, weekly). "+1 bardak" düğmesi yalnız su bildiriminde görünür. Bildirime tıklanınca `data.url` açılır. Önbellek sürümü `kalori-v4`.
- **Güvenlik:** `ALLOWED_ORIGIN` ile CORS ve origin kontrolü, IP başına dakikada 20 istek sınırı, gövde en fazla 6 MB, prompt en fazla 8000 karakter.
- **Ortam değişkenleri:** `GEMINI_API_KEY`🔒, `VAPID_PRIVATE_KEY`🔒, `ADMIN_PASSWORD`🔒 (yönetici paneli), `VAPID_PUBLIC_KEY`, `VAPID_SUBJECT`, `ALLOWED_ORIGIN`, `GEMINI_MODEL` (varsayılan `gemini-flash-latest`), `GEMINI_FALLBACK_MODELS` (isteğe bağlı, virgülle ayrılmış). KV bağlantısı: `SUBS`.

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
  - Playwright + sistem Chrome ile 31 kontrol geçti (açık/koyu tema, 390 px). Gemini'nin 503 verdiği durum, Open Food Facts ve öğün banner'ı sahte cevaplarla denendi.
  - Worker öğün zamanlaması Deno'da sahte KV ile denendi: 13:00 gönderir; 13:15'te ve 12:45'te göndermez; yemek eklenmişse göndermez; ertesi gün sıfırlanır; su hatırlatıcısı kapalıyken etkilenmez.
  - **Gerçek kamerayla barkod okuma ve gerçek öğün bildirimi telefonda henüz denenmedi.**
- **2026-11-14 üçüncü paket** (ilerleme, ölçüler, rozetler, sesle ekleme, fotoğraf etiketleri, haftalık rapor):
  - Playwright'ta 34 yeni kontrol geçti, önceki 31 kontrol de geçmeye devam ediyor.
  - Ses denemeleri: telefonun ses tanıması sahte bir sınıfla taklit edildi; kayıt yolu Chrome'un sahte mikrofonuyla denendi (Gemini'ye giden WAV: RIFF, 16 kHz, ~1,9 sn).
  - Fotoğraf etiketlerinin çakışmadığı ölçüldü.
  - Worker: Pazartesi 09:30'da gönderir; 09:45'te, salı ve pazar günü göndermez; rapor kapalıyken göndermez; ses Gemini'ye `audio/wav` olarak iletilir.
  - **Gerçek telefonda ses (özellikle iPhone ana ekran uygulaması), gerçek Gemini'nin konum (box) kalitesi ve Pazartesi bildirimi henüz denenmedi.**
  - Testler: Rozet penceresi açılışta çıktığı için eski testte `showBadgeModal` devre dışı bırakılıyor.
- **2026-11-15 spor paketi:**
  - 47 yeni kontrol geçti: formül, 17 yazıdan tanıma örneği, pencere, yapay zekâ yedeği, plan → "Planı yaptım", haftalık DSÖ değerlendirmesi, rozetler.
  - Önceki 34 + 32 kontrol de geçiyor.
  - `yayinla.ps1` Worker yüklemesi geçici bir depo kopyasında sahte anahtarla denendi: Cloudflare "10000 Authentication error" döndü, betik bunu düzgün raporladı, iz dosyası yazılmadı ve başlık dosyası silindi.
  - **Gerçek anahtarla yükleme henüz denenmedi.**
- **2026-11-15 puan, ölçü, diyet fotoğrafı ve selamlama paketi:** 35 yeni kontrol geçti; önceki 47 + 34 + 32 kontrol de geçiyor (toplam 148).
  - Selamlama: Playwright'ın sahte saat ve saat dilimiyle denendi. Telefon New York ya da Tokyo saatindeyken de Türkiye saatine göre doğru selamlıyor.
  - Puan: günlük kalemler, az yenen güne kalori puanı verilmemesi, sabitleme, "+puan" baloncuğu, seviye atlama, tema satın alma, kendi ödülünü alma ve seri koruyucu denendi.
  - Diyet: Gemini'nin cevabı taklit edilerek 2 sayfalık fotoğraf ve yerel metin ayrıştırma denendi.
  - **Gerçek Gemini ile el yazısı okuma kalitesi henüz denenmedi.**
  - Testlerde artık `showPointsIntro` ve `showLevelModal` de devre dışı bırakılıyor; test2'de başlangıç verisine `rewards.lastPts=0` ekleniyor.
- **2026-11-15 çoklu spor planı, adım ve uyku paketi:** test5'te 27 yeni kontrol geçti; test3'ün plan bölümü yeni arayüze göre yeniden yazıldı. Beş grubun toplamı 178 kontrol, hepsi geçiyor.
- **2026-11-15 öneri ve uyku düzeltmesi:**
  - test6'da 24 yeni kontrol geçti: istem kuralları, tekrar etmeme, yoğunken hazır alternatifler, gece 23:40 → kalkış 07:55, döngü saatleri 07:25 ve 08:55, sabah aktarımı.
  - test5 akşam moduna göre güncellendi.
  - Altı grubun toplamı 202 kontrol, hepsi geçiyor.
- **2026-11-15 büyük paket** (takvim, düzenleme, kopyala-yapıştır, karşılaştırma, kilo tahmini, aylık kart, alışveriş listesi, ruh hali, kafein ve şeker, regl, madalyalar, tema kaldırma):
  - test7'de 59 yeni kontrol geçti. Diğer gruplar madalya yapısına göre güncellendi: test2 artık `S.medals` kullanıyor ve başlangıç verisinde `rewards.medalMig=true`; test4'te tema yerine "tema bölümü yok" kontrolü var.
  - Toplam 7 grup, 261 kontrol; hepsi geçiyor.
  - Testlerin bulduğu hatalar düzeltildi:
    - Seçim düğmelerini profil formunun `.seg` işleyicisi yutuyordu.
    - Boş açılan eski güne sonradan girilen kayıt `noPts` almıyordu.
    - "Bugün" ekranında "Yarın ›" düğmesi yoktu.
  - **Gerçek telefonda paylaşım (dosya), gerçek Gemini ile alışveriş listesi ve Dertleş henüz denenmedi.**
- **2026-11-15 regl paketi:** test9'da 33 yeni kontrol geçti; test8'de 8 kontrol (kopyala-yapıştır) geçti. 9 grup, 302 kontrol; hepsi geçiyor. Worker döngü testi (`wtest3`) ve önceki Worker testleri de geçiyor. **Gerçek telefonda döngü bildirimi henüz denenmedi.**
- **2026-11-15 yönetici paneli:** Worker için `wtest5` (26 kontrol: giriş, kilit, sahte/eskimiş oturum, liste, düzenleme, çakışma, 409 ile sessiz aktarım, önceki sürüm, günlük kopya, silme). Tarayıcıda test11 (17 kontrol: panel girişi, düzenleme, çakışma uyarısı, kişiye bildirim, ham veri, kayıtlar; uygulamanın yönetici sürümünü sessizce alması, 409 sonrası çekme). test10'un sahte bulutuna `check` eklendi. 11 grup, 343 kontrol; hepsi geçiyor. Bulunan hata: panelde giriş düğmesi şifreyi okumadan ekranı yeniliyordu.
- **2026-11-15 panel 3. adım:** Worker `wtest6` (20 kontrol: içerik temizleme, anahtarlar, varsayılan aralıkları, kişiye/herkese/zamanlı duyuru, cron'da tek seferlik bildirim, toplu bildirim, istatistik). Tarayıcıda test12 (24 kontrol: panelde duyuru/istatistik/içerik/ayarlar; uygulamada duyuru kartı, bakım şeridi, kapatılan özellikler, yemek listesi değişiklikleri, yeni kullanıcı varsayılanları). Eski testlere boş `/config` cevabı eklendi (sahte AI sunucusu bu isteği yutuyordu). 12 grup, 367 tarayıcı kontrolü + 6 Worker testi; hepsi geçiyor. Bulunan hatalar: paneldeki kutular arası geçişte ekranın yeniden çizilmesi yazılanı ve "Kaydet" tıklamasını kaybettiriyordu.
- **2026-11-15 Koç:** test13 (20 kontrol: sekme adı, gidişat kartı ve maddeler, günlük yorum ve tekrar istenmemesi, istem içeriği ve sağlık kuralları, hazır soru, "Yedim", önceki konuşma, buluta dahil olma, sayaç, yoğunken yerel özet, sınır, temizleme, Dertleş kaydı, panelde Sohbetler). wtest6'ya sınır kontrolleri eklendi (22). test3 ve test6 yeni sekme düzenine göre güncellendi. 13 grup, 387 tarayıcı kontrolü; hepsi geçiyor. Bulunan hata: aynı milisaniyede oluşturulan iki duyuru aynı kimliği alabiliyordu (kimliğe rastgele ek eklendi).
- Test ortamı: Bu bilgisayarda Node yok. Python 3.12 (Playwright, scratchpad'deki venv'e kuruldu), Deno, Chrome ve Edge var.

## 7. Durum ve sıradaki işler

**Şu an (2026-11-14):** Site, Worker, KV ve Cron yayında.
- **Çözülen sorun:** "Ekle"de kalori hesabı "internet bağlantısı" hatası veriyordu. Asıl sebep internet değildi: `gemini-flash-latest` aşırı yoğundu. Gemini 503 ("high demand") döndürüyor ya da 125 sn cevapsız kalıp 524 veriyordu (curl ile canlı Worker'da doğrulandı).
- **Çözüm:** Worker'a yedek model zinciri, istemciye ayrıntılı hata mesajları eklendi.
- **Git:** Klasör depoya bağlandı (dal `main`, upstream `origin/main`, yerel `user.name=ulkueralp`, `core.autocrlf=false`). İlk push yapıldı (`d1d5d6e`). Yeni Worker yayında; canlı testte ana model yoğunken `gemini-flash-lite-latest` 4 sn'de cevap verdi. Not: VS Code terminali bazen komutun başına `[?61;4c` gibi kaçış karakterleri ekliyor ve "Missing type name after '['" hatası çıkıyor. Bu durumda yeni terminal açıp komutu elle yazmak yeterli.

- **2026-11-14 ikinci iş:** 7 özellik eklendi: favoriler/sık yenenler/dünkü öğün, yerel tahmin, kilo grafiği, öğün hatırlatmaları, barkod, yaklaşık 200 kalemlik liste, haftalık özet. Ayrıntılar 4. ve 5. bölümde. Yayın için hem push hem Worker yapıştırma gerekiyordu.

- **2026-11-14 üçüncü iş:** Kullanıcı başka uygulamalardan örnekler gösterdi: ilerleme ekranı, fotoğraf üstünde kalori etiketleri ve sesle ekleme, rozetler. Bunlar uygulamanın kendi tarzıyla eklendi; ayrıca Pazartesi haftalık rapor bildirimi geldi. 2026-11-15'te yayına alındı (commit `63500e2`, site `kalori-v4`). Canlı Worker'ın sesi Gemini'ye ilettiği doğrulandı: bozuk ses verisi Gemini'den 400 aldı.

- **2026-11-15 dördüncü iş:** Spor çeşitleri ve yakılan kalori eklendi (yarısı yeme hakkına). Yayın otomasyonu kuruldu (`yayinla.ps1` + `cloudflare-baglan.ps1`). Bu pakette worker.js değişmedi. Commit `3387a07` ile yayına alındı.
- **2026-11-15 on üçüncü iş:** Öneri sekmesi "💬 Koç" oldu: gidişat kartı, kişisel verilerle sohbet, "Yedim" düğmeleri, günlük 45 mesaj sınırı (panelden ayarlanır). Dertleş mesajları kaydediliyor; panelde 💬 Sohbetler sekmesi. **worker.js değişti.**
- **2026-11-15 on ikinci iş:** Yönetici paneli 3. adım: duyurular (Bugün'ün en üstünde kart + bildirim, kişiye özel, zamanlı), istatistik (isimli, "seni özledik" bildirimi), içerik yönetimi (yemek listesi, motivasyon, tatlı/tuzlu alternatifleri), ayarlar (özellik anahtarları, yeni kullanıcı varsayılanları, bakım modu). Masaüstü notu güncellendi. **worker.js değişti.**
- **2026-11-15 on birinci iş:** Yönetici paneli (2. adım): `admin.html`, Worker `/admin/*`, telefona sessiz aktarım, kişiye bildirim, `ADMIN_PASSWORD` secret'ı (Cloudflare'e yazıldı), masaüstü bilgi notu. **worker.js değişti.**
- **2026-11-16 onuncu iş:** Bulut yedeği eklendi (yönetici paneli 1. adımı). **worker.js değişti.** 10 grup, 326 kontrol geçiyor.
- **2026-11-15 dokuzuncu iş:** Regl takibi yenilendi: kurulum soruları, öğrenme, yumurtlama ve doğurgan dönem, takvim işaretleri, belirtiler, regl bitti kaydı, döneme uygun spor, özel durumlar, onaylı ve gizli metinli telefon bildirimleri. **worker.js değişti.** Kopyala-yapıştır da düzeltildi (yeniden yüklemede kaybolmuyor, Plan'da çubuk var).
- **2026-11-15 sekizinci iş (büyük paket):** Yukarıdaki "Gün seçimi", "Karşılaştırma", "Alışveriş listesi", "Ruh hali, kafein, şeker", "Regl takibi" ve "Madalyalar" bölümleri eklendi; renk temaları kaldırıldı. worker.js değişmedi.
- **2026-11-15 yedinci iş:** Öneri sekmesi çeşitlendirildi (liste yerine yeni fikirler, "canın ne istiyor" seçimleri, tarifler, başka öneriler). Uyku kartı yatış saatinden kalkış saatini hesaplıyor ("Yatıyorum" / "Uyandım" akışı). worker.js değişmedi.
- **2026-11-15 altıncı iş:** Spor planında gün başına birden çok spor, adım takibi (elle ya da yapıştırarak; kademeli hedef) ve uyku takibi (yaşa ve spora göre öneri) eklendi. worker.js değişmedi.
- **2026-11-15 beşinci iş:** Türkiye saatine göre selamlama ve motivasyon mesajları, 5 vücut ölçüsü, diyet listesini fotoğraftan ya da metinden doldurma, puan / seviye / seri / ödül sistemi (temalar, seri koruyucu, kendi ödüllerin) eklendi. worker.js değişmedi.

**Olası sonraki adımlar** (kullanıcıyla önceliklendir):
1. Kendi tarifini kaydetmek (ör. "annemin mercimek çorbası, 1 kase = 180 kcal"); `favs` altyapısına benzer.
2. Günlük mini görevler ("bugün 2 bardak daha su", "öğle yemeğini kaydet").
3. Aylık özet kartı: WhatsApp'ta paylaşılabilir görsel (canvas → PNG, `navigator.share`).
4. Fotoğraf ve barkodu tek kamera ekranında birleştirmek.
5. Liste değerlerini TÜRKOMP ile doğrulamak ve genişletmek.
6. Yerel uygulamaya geçiş: **Capacitor** ile aynı kod Android ve iOS uygulamasına sarılır. Kazanımlar: yerel bildirim, Apple Sağlık / Health Connect'ten adım verisi, widget, mağaza yayını. Maliyet: App Store hesabı yıllık 99$, Google Play bir kerelik 25$.
7. Cihazlar arası senkron (şu an veri sadece telefonda). Gerekirse Cloudflare D1 ya da KV ile hesapsız bir senkron kodu yapılabilir.

**Bozulmaması gerekenler:**
- Kalori alt sınırı (1200/1500) ve "aç kalmayı önerme" prompt kuralı.
- Gizlilik notu.
- Gemini anahtarının istemciye asla konmaması.
- Tek dosya, derlemesiz yapı. Kullanıcı artık `yayinla.ps1` ile git push yapıyor. Dış kütüphane yalnızca barkod tarayıcısı (zxing) için, sadece gerektiğinde CDN'den ve sabit sürümle yükleniyor.
- Haftalık özet, öneri ve Dertleş metinleri hiçbir zaman "daha az ye" ya da "öğün atla" dememeli.
- Regl bildirimleri için abonelikte yalnızca yaklaşan en fazla 4 hatırlatmanın tarihi ve türü gider; bildirim metni varsayılan olarak gizlidir. (Bulut yedeğinde regl dahil bütün veri gider; kullanıcı kararı, bilgi notunda yazıyor.)
- Yönetici düzeltmeleri kullanıcıya bildirimsiz, sessizce uygulanır (kullanıcı kararı). Uzaktan içerik ve özellik anahtarları sağlık kurallarını (kalori alt sınırı, BKİ, az yemeyi ödüllendirmeme) değiştiremez; yalnız liste/metin/görünürlük değiştirir. Yönetici şifresi asla depoya, koda ya da sohbete yazılmaz.
- Yumurtlama ve doğurgan dönem tahminlerinin yanında "doğum kontrol yöntemi değildir" uyarısı bulunmalı.
- 7 günden eski günlere sonradan girilen kayıtlar puan, seri ve madalya vermemeli (kullanıcı kararı). Rozetler az yemeyi ödüllendirmemeli. Hedef kilo BKİ 18,5'in altında olamaz. Haftada 1 kg'dan hızlı kayıpta uyarı verilir.
- Yapay zekâ başarısız olunca kullanıcı eli boş kalmamalı (yerel tahmin).
