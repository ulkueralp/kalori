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
| `yayinla.ps1` | Tek komutla yayın. (1) `git add/commit/push`; gönderilecek değişikliklerde Gemini anahtarı (`AIza…`), özel anahtar ya da `Bearer …` görürse durur. (2) `worker/worker.js`'in SHA256'sı son yüklemeden farklıysa ve Cloudflare bağlıysa Worker'ı API ile yükler. Yükleme `PUT /accounts/{id}/workers/scripts/kalori-ai/content` ile yapılır: yalnız kod değişir; değişkenler, secret'lar, KV ve Cron'a dokunulmaz. Anahtar komut satırına yazılmaz, geçici başlık dosyasıyla `curl.exe -H @dosya` kullanılır ve dosya silinir. |
| `cloudflare-baglan.ps1` | Bir kerelik; **kullanıcı kendisi çalıştırır** (anahtarı gizli girer). Cloudflare API anahtarını ("Edit Cloudflare Workers" şablonu) doğrular, `kalori-ai` Worker'ının bulunduğu hesabı bulur ve `%USERPROFILE%\.kalori\cloudflare.xml` dosyasına Windows DPAPI ile şifreli kaydeder. Bu dosya depoda değildir. |

**Yayına alma (2026-11-15'ten itibaren):**
- Klasörün tamamı (worker/, tools/, .md dahil) GitHub deposunda (`ulkueralp/kalori`, Pages: https://ulkueralp.github.io/kalori/).
- **Kullanıcının isteği:** Yayını Claude yapar. Her değişiklikten sonra "yayına alayım mı?" diye onay iste. Onay gelince PowerShell'de `powershell -ExecutionPolicy Bypass -File yayinla.ps1 "açıklama"` çalıştır.
- Git kimlik bilgileri Windows'ta kayıtlı, push sorunsuz çalışıyor.
- Son yüklenen Worker'ın izi `%USERPROFILE%\.kalori\worker-son-yukleme.sha256` dosyasında tutulur.
- `cloudflare.xml` yoksa betik, Worker'ı elle yapıştırmayı hatırlatır.
Canlı adresler: Worker `https://kalori-ai.ulkueralp20.workers.dev`, `ALLOWED_ORIGIN = https://ulkueralp.github.io`.

## 4. Uygulama (index.html) yapısı

**Sekmeler** (alttaki menü, `TAB` değişkeni):
- `today`: Kalori halkası, makro çubukları, su bardağı ve hızlı ekleme düğmeleri, günün sporu, öğün öğün yenenler. Her yemeğin yanında ☆ (favori) ve ×. Boş öğünde "ekle · dünküyle aynı" bağlantısı.
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
- `plan`: Haftalık görünüm ve seri (streak) sayacı, gün gün spor takvimi, öğün öğün diyet listesi.
- `sugg`: Kalan kalori ve diyet listesine göre Gemini'den 3 öneri. Yapay zekâ yoksa yerel listeden rastgele öneriyor.
- `me` (kart sırası):
  - **Hesabım:** BMR, TDEE, BKİ, makrolar.
  - **⚖️ İlerlemem** (`progressHTML`):
    - Yeşil kartta mevcut, başlangıç (ilk kilo kaydı) ve hedef kilo (`profile.goalWeight`).
    - "X kg verdin · Hedefe Y kg" ilerleme çubuğu.
    - Tahmini varış: Son 8 haftanın en küçük kareler eğimiyle hesaplanır (`weightTrend`), en az 10 günlük veri gerekir.
    - Haftada 1 kg'dan hızlı kayıpta uyarı verir.
    - Tartılma serisi (`weighStreak`): Ardışık 7 günlük dilimlerde en az bir tartılma. Bu hafta tartılmadıysa "seri tehlikede" yazar.
    - Kilo girişi ve SVG çizgi grafik (`weightChartHTML`): Turuncu kesikli hedef çizgisi var, noktaya dokununca değer görünür. Son 6 kayıt × ile silinebilir.
  - **📏 Ölçülerim** (`measuresHTML`, `S.measures`): Bel ve kalça; ilk ölçüme göre fark ve bel/boy oranı (0,50 altı sağlıklı).
  - **Son 7 gün** grafiği.
  - **🗓️ Haftalık özet** (`weekCardHTML`, `id="weekCard"`):
    - Bugün hariç son 7 günün ortalamaları.
    - Kural tabanlı notlar: protein düşük, kalori üstte ya da çok altta, yağ yüksek, su, spor planına uyum, önceki haftayla kıyas, haftalık kilo değişimi.
    - Hedefin çok altında kalınca "öğün atlama" uyarısı verir, asla daha az yemeyi önermez.
  - **🏅 Rozetlerim** (`badgesCardHTML`): 20 rozet; dokununca açıklama gösterilir.
  - **Su hatırlatıcı:** Push ayarları da bu kartta.
  - **🍽️ Öğün hatırlatmaları ve haftalık rapor:** Pazartesi raporu açma/kapama, öğün hatırlatması açma/kapama ve öğün başına saat.
  - Profil (hedef kilo dahil; BKİ 18,5 altı hedef reddedilir), yedekleme, sıfırlama.

**Rozetler** (`BADGES`, `evalBadges`, `checkBadges`):
- `save()` her çağrıldığında 500 ms sonra kontrol edilir; açılışta da bir kez kontrol edilir. Böylece güncellemeden önceki geçmişe göre hak edilmiş rozetler de verilir.
- Kazanılan rozet `S.badges[id]=tarih` olarak saklanır ve geri alınmaz.
- Yeni rozette alttan kutlama penceresi (`#badgeModal`) açılır. Birden fazlaysa ızgara olarak gösterilir.
- Rozetler: ilk kayıt; ilk su hedefi; ilk tartı; 3, 7 ve 30 gün kayıt serisi; 7 gün su; 5 gün protein; dengeli hafta (7 günde 5 gün hedefin %80-110'u); ilk spor; 10 spor günü; 4 hafta tartılma; hedefe doğru 1 kg, 5 kg ve hedef; planlı; favori; fotoğraf, ses ve barkod.
- Sayaçlar: `S.stats.photo/voice/barcode`.
- **Kural: Hiçbir rozet az yemeyi ödüllendirmez.**

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

**Puan, seviye, seri ve ödüller** (`PTS`, `BADGE_PTS`, `earnedPoints`, `S.rewards`):
- **Günlük puan** (`dayPointItems`):
  - Öğün kaydı 5 puan (en çok 4 öğün)
  - Kalori hedefin %80–110'unda 20 puan. **Hedefin altında kalmak puan kazandırmaz.**
  - Protein (%90+) 15, su hedefi 20, antrenman 15, toplam 30+ dk spor 10
  - Kayıt serisinin her 7. günü 50
- **Diğer puanlar:** Haftada bir tartılma 15, ayda bir ölçü 20. Rozet puanları rozetin zorluğuna göre 25–500 arası (`BADGE_PTS`; örneğin kg5 = 250, goal = 500).
- **Sabitleme:** Geçmiş günlerin puanı ilk hesaplanınca `S.rewards.ptsHist[tarih]` içine kaydedilir. Böylece 90 günden eski günler silinse ya da profil değişse de kazanılmış puan değişmez. Bugün canlı hesaplanır.
- **Bakiye:** Kazanılan − harcanan (`S.rewards.spent`).
- **Seviye:** Seviye n için gereken toplam puan `50·(n−1)·n` (2: 100, 3: 300, 4: 600, 5: 1000…). Seviye adları: Çaylak 🌱 → Efsane 👑.
- **Bildirimler:** `checkPoints()` (`checkBadges()` sonunda çalışır) puan artınca "+N ⭐" baloncuğu gösterir, seviye atlanınca kutlama penceresi açar. İlk açılışta bir kez puan sistemi tanıtım penceresi çıkar (`lastPts === null`).
- **Seriler:** Kayıt (günlük, `logStreak`; en uzunu `bestLogStreak`), su (günlük), spor (haftalık) ve tartılma (haftalık). Plan sekmesinde "🔥 N gün seri" ve "🎯 N gün hedefte" ayrı ayrı gösterilir.
- **Ödüller** ("Ödüllerim" kartı):
  - Kullanıcının kendi ödülleri: ad + puan. İlerleme çubuğu var; harcamak için 4 saniye içinde iki dokunuş gerekir, ardından kutlama penceresi çıkar.
  - 🧊 Seri koruyucu (150 puan): Dün kayıt yoksa ve öncesinde en az 2 günlük seri varsa Bugün ekranında uyarı çıkar. Koruyucu kullanılınca dünün tarihi `S.rewards.frozen`'a eklenir ve seri, rozetler ve puan hesaplarında kayıtlı gün sayılır.
  - 🎨 Renk temaları (400 puan): Okyanus, Lavanta, Gül, Grafit. `:root[data-accent]` ile `--green*` değişkenleri değişir; koyu tema için ayrı değerler var. `applyTheme()` her `render()`'da çalışır.
- **Tasarım kuralı:** Puanlar düzenli ve dengeli davranışı ödüllendirir; az yemek hiçbir yerde ödüllendirilmez.

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
- **Yatış saati önerisi:** Son kalkış saatinden (yoksa `settings.wakeStart`) hedef süre ve 15 dk uykuya dalma payı çıkarılır. Türkçe ek hatası olmasın diye saat cümlelerinde ek kullanılmıyor ("saat 22:00 gibi").
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
  days: { "YYYY-MM-DD": { foods:[{id,meal,name,amount,kcal,p,c,f,t}], water: ml, sport: bool } }, // son 90 gün tutulur
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
             custom:[{id,name,cost}], ptsHist:{tarih:puan}, lastPts, lastLevel },
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
| `POST /push/subscribe` | `{subscription, tz, interval, start, end, goal, enabled, mealsOn, meals:[dk×4], weekly}` (`wk:1/0`; alan yoksa açık) | KV'ye yaz (anahtar `sub:<sha256 ilk 16 bayt>`, **tüm veri metadata'da**; metadata sınırı 1024 bayt, şu an yaklaşık 275 bayt + endpoint). Öğün saatleri `ml:"540,780,1170,-1"` olarak saklanır; `done` ve `md` korunur. |
| `POST /push/unsubscribe` | `{endpoint}` | Sil |
| `POST /push/done` | `{endpoint, date:"YYYY-MM-DD"\|""}` | O gün su hatırlatmasını durdur |
| `POST /push/meal` | `{endpoint, date, bits}` | Bugün yemek eklenen öğünler (bit 1 kahvaltı, 2 öğle, 4 akşam, 8 ara). `md:"tarih:bits"` olarak saklanır; o öğünlere hatırlatma gitmez. |
| `POST /push/test` | `{endpoint}` | Deneme bildirimi |
| `scheduled` (cron `*/15 * * * *`) | – | `list()` metadata'larını okur, zamanı gelene su (`type:"water"`) ve öğün (`type:"meal"`, `url:"./#ogun-…"`) bildirimi gönderir. 404 ya da 410 dönen aboneliği siler. |

- **Zamanlama durumsuz:** Kullanıcının saat dilimindeki dakika için `since = dakika − başlangıç×60` hesaplanır. `since >= interval` ve `since % interval < 15` ise bildirim gönderilir. "Son gönderim" yazılmadığı için KV yazma kotası harcanmaz.
- **Öğün zamanlaması (`dueMeal`):** `0 ≤ dakika − öğünSaati < 15` ve o günün `md` bitinde o öğün yoksa gönderilir. Su hatırlatıcısı kapalı olsa da çalışır; yalnız telefon bildirimlerinin açık olması gerekir.
- **Haftalık rapor (`weeklyDue`):** Yerel saatle Pazartesi 09:30-09:45 arasında `type:"weekly"`, `url:"./#rapor"` bildirimi gönderilir. Sunucuda kullanıcı verisi olmadığı için bildirim yalnızca "raporun hazır" der; rakamları uygulama gösterir. `localNow` artık `weekday` de döndürüyor.
- **sw.js:** Bildirim etiketi `kalori-<type>` olur (water, meal, weekly). "+1 bardak" düğmesi yalnız su bildiriminde görünür. Bildirime tıklanınca `data.url` açılır. Önbellek sürümü `kalori-v4`.
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
- Test ortamı: Bu bilgisayarda Node yok. Python 3.12 (Playwright, scratchpad'deki venv'e kuruldu), Deno, Chrome ve Edge var.

## 7. Durum ve sıradaki işler

**Şu an (2026-11-14):** Site, Worker, KV ve Cron yayında.
- **Çözülen sorun:** "Ekle"de kalori hesabı "internet bağlantısı" hatası veriyordu. Asıl sebep internet değildi: `gemini-flash-latest` aşırı yoğundu. Gemini 503 ("high demand") döndürüyor ya da 125 sn cevapsız kalıp 524 veriyordu (curl ile canlı Worker'da doğrulandı).
- **Çözüm:** Worker'a yedek model zinciri, istemciye ayrıntılı hata mesajları eklendi.
- **Git:** Klasör depoya bağlandı (dal `main`, upstream `origin/main`, yerel `user.name=ulkueralp`, `core.autocrlf=false`). İlk push yapıldı (`d1d5d6e`). Yeni Worker yayında; canlı testte ana model yoğunken `gemini-flash-lite-latest` 4 sn'de cevap verdi. Not: VS Code terminali bazen komutun başına `[?61;4c` gibi kaçış karakterleri ekliyor ve "Missing type name after '['" hatası çıkıyor. Bu durumda yeni terminal açıp komutu elle yazmak yeterli.

- **2026-11-14 ikinci iş:** 7 özellik eklendi: favoriler/sık yenenler/dünkü öğün, yerel tahmin, kilo grafiği, öğün hatırlatmaları, barkod, yaklaşık 200 kalemlik liste, haftalık özet. Ayrıntılar 4. ve 5. bölümde. Yayın için hem push hem Worker yapıştırma gerekiyordu.

- **2026-11-14 üçüncü iş:** Kullanıcı başka uygulamalardan örnekler gösterdi: ilerleme ekranı, fotoğraf üstünde kalori etiketleri ve sesle ekleme, rozetler. Bunlar uygulamanın kendi tarzıyla eklendi; ayrıca Pazartesi haftalık rapor bildirimi geldi. 2026-11-15'te yayına alındı (commit `63500e2`, site `kalori-v4`). Canlı Worker'ın sesi Gemini'ye ilettiği doğrulandı: bozuk ses verisi Gemini'den 400 aldı.

- **2026-11-15 dördüncü iş:** Spor çeşitleri ve yakılan kalori eklendi (yarısı yeme hakkına). Yayın otomasyonu kuruldu (`yayinla.ps1` + `cloudflare-baglan.ps1`). Bu pakette worker.js değişmedi. Commit `3387a07` ile yayına alındı.
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
- Haftalık özet ve öneri metinleri hiçbir zaman "daha az ye" ya da "öğün atla" dememeli. Rozetler az yemeyi ödüllendirmemeli. Hedef kilo BKİ 18,5'in altında olamaz. Haftada 1 kg'dan hızlı kayıpta uyarı verilir.
- Yapay zekâ başarısız olunca kullanıcı eli boş kalmamalı (yerel tahmin).
