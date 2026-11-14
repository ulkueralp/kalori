# Kalori uygulamasını ücretsiz yayına alma

Toplam süre: yaklaşık 30 dakika. Hepsi ücretsiz, kredi kartı gerekmez.

Uygulama üç parçadan oluşur:
1. **Gemini API anahtarı:** Yapay zekâ (Google, ücretsiz).
2. **Cloudflare Worker:** Gemini anahtarını gizli tutan ve su bildirimlerini gönderen küçük sunucu (ücretsiz).
3. **GitHub Pages:** Uygulamanın yayınlandığı site (ücretsiz).

> Neden sunucu gerekiyor? Anahtarı doğrudan uygulamanın içine koyarsan, sayfayı açan herkes onu görüp kullanabilir. Ayrıca telefon kapalıyken bildirimi, sadece bir sunucu gönderebilir.

---

## 1. Gemini API anahtarını al

1. https://aistudio.google.com adresine git ve Google hesabınla giriş yap.
2. **Get API key** → **Create API key**.
3. Anahtarı kopyala ve bir yere not et.
   ⚠️ Kimseyle paylaşma, sohbetlere ya da GitHub'a yapıştırma.

Faturalandırmayı (billing) açma. Açık değilse hiçbir zaman ücret çıkmaz; kota dolarsa yapay zekâ sadece bir süre bekler.

---

## 2. Bildirim anahtarlarını üret

1. Paketteki `tools/vapid-anahtar-uret.html` dosyasını bilgisayarında çift tıklayarak tarayıcıda aç.
2. **Anahtar üret**'e bas.
3. Çıkan iki anahtarı not et:
   - **VAPID_PUBLIC_KEY** (açık anahtar)
   - **VAPID_PRIVATE_KEY** (gizli anahtar, kimseyle paylaşma)

Bunu **sadece bir kez** yap. Anahtarları değiştirirsen herkesin bildirimleri tekrar açması gerekir.

---

## 3. Cloudflare Worker'ı kur

1. https://dash.cloudflare.com adresinde ücretsiz hesap aç.
2. **Workers & Pages** → **Create** → **Create Worker**. Adını `kalori-ai` yap → **Deploy**.
3. **Edit code** → içindeki her şeyi sil → `worker/worker.js` dosyasının tamamını yapıştır → **Deploy**.

### 3a. Abonelik deposu (KV) oluştur
4. Sol menüden **Storage & Databases** → **KV** → **Create** → adını `KALORI_SUBS` yap.
5. Worker sayfasına dön → **Bindings** → **Add binding** → **KV namespace**:
   - Variable name: `SUBS`
   - KV namespace: `KALORI_SUBS`

### 3b. Değişkenleri ekle
6. Worker sayfasında **Settings** → **Variables and Secrets** → **Add**:

| Ad | Tür | Değer |
|---|---|---|
| `GEMINI_API_KEY` | **Secret** | 1. adımdaki Gemini anahtarı |
| `VAPID_PRIVATE_KEY` | **Secret** | 2. adımdaki gizli anahtar |
| `VAPID_PUBLIC_KEY` | Text | 2. adımdaki açık anahtar |
| `VAPID_SUBJECT` | Text | `mailto:seninmailin@ornek.com` (kendi e-postan) |
| `ALLOWED_ORIGIN` | Text | `https://KULLANICIADIN.github.io` (4. adımdaki GitHub kullanıcı adınla) |
| `GEMINI_MODEL` | Text (isteğe bağlı) | Boş bırakırsan `gemini-flash-latest` kullanılır |

### 3c. Zamanlayıcıyı aç
7. Worker sayfasında **Settings** → **Trigger Events** (ya da **Triggers**) → **Add** → **Cron Triggers** → `*/15 * * * *` yaz → kaydet.
   Bu ayar, sunucunun her 15 dakikada bir "kimin hatırlatma zamanı geldi?" diye bakmasını sağlar.

8. Worker'ın adresini kopyala. Şuna benzer: `https://kalori-ai.KULLANICIADIN.workers.dev`

---

## 4. GitHub Pages'te yayınla

1. https://github.com adresinde ücretsiz hesap aç.
2. **+** → **New repository** → adını `kalori` yap, **Public** seç → **Create repository**.
3. **uploading an existing file** bağlantısına tıkla ve şu dosyaları sürükle:
   `index.html`, `manifest.json`, `sw.js`, `icon-192.png`, `icon-512.png`
   (`worker` ve `tools` klasörlerini yükleme.) Ardından **Commit changes**.
4. Depoda `index.html` dosyasını aç → kalem ✏️ simgesi → şu satırı bul:
   ```js
   const API_URL = "";
   ```
   3. adımdaki Worker adresini tırnakların arasına yapıştır:
   ```js
   const API_URL = "https://kalori-ai.KULLANICIADIN.workers.dev";
   ```
   → **Commit changes**.
5. **Settings** → **Pages** → **Source: Deploy from a branch** → Branch: **main**, klasör: **/(root)** → **Save**.
6. 1-2 dakika sonra uygulaman şu adreste yayında olur: **https://KULLANICIADIN.github.io/kalori/**

---

## 5. Telefona kur ve bildirimleri aç

**iPhone (iOS 16.4 ve üstü):**
1. Linki **Safari**'de aç → Paylaş ⬆️ → **Ana Ekrana Ekle**.
2. Uygulamayı **ana ekrandaki simgeden** aç. Safari sekmesinden açılırsa bildirim çalışmaz.
3. Profili doldur → **Ben** sekmesi → **🔔 Telefon bildirimlerini aç** → **İzin Ver**.
4. Hemen bir deneme bildirimi gelir. Geldiyse kurulum tamam.

**Android (Chrome):**
1. Linki aç → ⋮ → **Uygulamayı yükle** (ya da **Ana ekrana ekle**).
2. **Ben** → **🔔 Telefon bildirimlerini aç** → **İzin ver**.
3. Android'de bildirimin üzerinde **"+1 bardak içtim"** düğmesi de çıkar.

Linki WhatsApp'tan istediğin kişiye gönderebilirsin. Kimsenin hesap açması gerekmez.

---

## Sorun giderme

| Sorun | Çözüm |
|---|---|
| iPhone'da bildirim düğmesi yerine "ana ekrana ekle" uyarısı çıkıyor | Uygulamayı Safari'den değil, ana ekrandaki simgeden aç. |
| Deneme bildirimi gelmedi | Cloudflare'de `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` ve `SUBS` bağlantısını kontrol et. Telefonda Odak / Rahatsız Etmeyin modu kapalı olsun. |
| "Bildirim izni reddedilmiş" yazıyor | iPhone: Uygulamayı ana ekrandan silip yeniden ekle. Android: Ayarlar → Uygulamalar → Chrome → Bildirimler. |
| Yapay zekâ "hesaplanamadı" diyor | `API_URL` doğru mu, `ALLOWED_ORIGIN` GitHub adresinle birebir aynı mı (sonunda `/` olmadan)? |
| Hatırlatmalar hiç gelmiyor | Cron Trigger (`*/15 * * * *`) eklenmiş mi? Ben sekmesinde başlangıç ve bitiş saatleri doğru mu? |

---

## Bilmen gerekenler

- **Bildirim zamanları:** Başlangıç saatinden bir aralık sonra başlar. Örneğin 08:00'de başlayıp 1,5 saatte birse 09:30, 11:00, 12:30… şeklinde gelir. Su hedefini tamamladığın gün hatırlatmalar durur.
- **iPhone'da güvenilirlik:** Web bildirimleri iPhone'da genelde çalışır ama gerçek bir App Store uygulaması kadar sağlam değildir. Bazen bir süre sonra kesilebilir; öyle olursa bildirimi kapatıp açmak yeter.
- **Ücretsiz sınırlar:**
  - **Gemini:** Kota, uygulamayı kullanan herkes arasında ortaktır. Birkaç kişi için fazlasıyla yeter. Kota Türkiye saatiyle 11:00 civarında sıfırlanır.
  - **Cloudflare:** Ücretsiz plan, yüzlerce kullanıcıya rahatça yeter.
- **Gizlilik:** Ücretsiz Gemini sürümünde Google, gönderilen yazı ve fotoğrafları ürünlerini geliştirmek için kullanabilir. Bu not uygulamada da yazıyor.
- **Yedekleme:** Veriler telefonda saklanır. Telefon değiştirmeden önce **Ben → Yedekle → Yedek indir** ile yedek alınmalı.
- **Güncelleme:** GitHub'daki `index.html` değişince uygulama bir sonraki açılışta kendini günceller. `worker.js` değişince Cloudflare'de yeniden yapıştırıp **Deploy** etmek gerekir.
