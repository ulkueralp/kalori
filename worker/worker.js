// Kalori uygulaması – Cloudflare Worker
// 1) Gemini köprüsü: API anahtarını gizli tutar (POST /  veya  POST /ai)
// 2) Su bildirimleri: Web Push abonelerine zamanında "su iç" bildirimi gönderir
//
// Cloudflare'de ayarlanacaklar (Settings → Variables and Secrets / Bindings / Triggers):
//   GEMINI_API_KEY     (Secret)  Google AI Studio anahtarı
//   ALLOWED_ORIGIN     (Text)    Uygulamanın adresi, örn. https://kullaniciadin.github.io
//   GEMINI_MODEL       (Text, isteğe bağlı) örn. gemini-flash-latest
//   VAPID_PUBLIC_KEY   (Text)    tools/vapid-anahtar-uret.html ile üretilen açık anahtar
//   VAPID_PRIVATE_KEY  (Secret)  aynı araçla üretilen gizli anahtar
//   VAPID_SUBJECT      (Text)    mailto:seninmailin@ornek.com
//   SUBS               (KV namespace binding) aboneliklerin saklandığı yer
//   Cron Trigger:      */15 * * * *   (her 15 dakikada bir çalışır; su ve öğün hatırlatmaları)

const MAX_BODY = 6 * 1024 * 1024;
const hits = new Map();

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const origin = request.headers.get("Origin") || "";
    const allowed = (env.ALLOWED_ORIGIN || "").split(",").map(s => s.trim()).filter(Boolean);
    const okOrigin = allowed.length === 0 || allowed.includes(origin);
    const cors = {
      "Access-Control-Allow-Origin": okOrigin ? (origin || "*") : "null",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      "Vary": "Origin",
    };
    const json = (obj, status = 200) =>
      new Response(JSON.stringify(obj), { status, headers: { ...cors, "Content-Type": "application/json" } });

    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
    if (!okOrigin) return json({ error: "Bu adresten erişime izin yok" }, 403);

    // basit kötüye kullanım koruması: IP başına dakikada 20 istek
    const ip = request.headers.get("CF-Connecting-IP") || "x";
    const now = Date.now();
    const list = (hits.get(ip) || []).filter(t => now - t < 60000);
    if (list.length >= 20) return json({ error: "Çok fazla istek" }, 429);
    list.push(now); hits.set(ip, list);
    if (hits.size > 5000) hits.clear();

    try {
      if (url.pathname === "/push/key" && request.method === "GET") {
        if (!env.VAPID_PUBLIC_KEY) return json({ error: "VAPID_PUBLIC_KEY ayarlanmamış" }, 500);
        return json({ publicKey: env.VAPID_PUBLIC_KEY });
      }
      if (request.method !== "POST") return json({ error: "POST bekleniyor" }, 405);

      const raw = await request.text();
      if (raw.length > MAX_BODY) return json({ error: "İstek çok büyük" }, 413);
      let body;
      try { body = JSON.parse(raw); } catch { return json({ error: "Geçersiz JSON" }, 400); }

      if (url.pathname === "/" || url.pathname === "/ai") return await handleAI(body, env, json);
      if (url.pathname === "/push/subscribe") return await handleSubscribe(body, env, json);
      if (url.pathname === "/push/unsubscribe") return await handleUnsubscribe(body, env, json);
      if (url.pathname === "/push/done") return await handleDone(body, env, json);
      if (url.pathname === "/push/meal") return await handleMealDone(body, env, json);
      if (url.pathname === "/push/test") return await handleTest(body, env, json);
      return json({ error: "Bulunamadı" }, 404);
    } catch (e) {
      return json({ error: "Sunucu hatası", detail: String(e && e.message || e).slice(0, 200) }, 500);
    }
  },

  // Her 15 dakikada bir Cron Trigger ile çalışır
  async scheduled(event, env, ctx) {
    ctx.waitUntil(sendDueReminders(env, event.scheduledTime || Date.now()));
  },
};

/* ===================== Yapay zekâ (Gemini) ===================== */
async function handleAI(body, env, json) {
  if (!env.GEMINI_API_KEY) return json({ error: "GEMINI_API_KEY ayarlanmamış" }, 500);
  const prompt = String(body.prompt || "").slice(0, 8000);
  if (!prompt) return json({ error: "prompt boş" }, 400);
  const parts = [{ text: prompt }];
  if (body.image && body.image.data) {
    const mime = /^image\/(jpeg|png|webp|heic|heif)$/.test(body.image.mime) ? body.image.mime : "image/jpeg";
    parts.push({ inline_data: { mime_type: mime, data: String(body.image.data) } });
  }
  // Sesle ekleme: uygulama 16 kHz mono WAV gönderir (telefonun kendi ses tanıması çalışmadığında)
  if (body.audio && body.audio.data) {
    const mime = /^audio\/(wav|x-wav|mp3|mpeg|aac|ogg|flac|webm|mp4)$/.test(body.audio.mime) ? body.audio.mime : "audio/wav";
    parts.push({ inline_data: { mime_type: mime, data: String(body.audio.data) } });
  }
  // Ana model yoğunsa (503), kotası dolduysa (429) ya da geç cevap verirse sıradaki modele geçilir.
  // Ücretsiz kota model başına ayrı olduğu için yedek modeller hem yoğunlukta hem kota dolunca işe yarar.
  const extra = (env.GEMINI_FALLBACK_MODELS || "gemini-flash-lite-latest,gemini-2.5-flash,gemini-2.5-flash-lite")
    .split(",").map(s => s.trim()).filter(Boolean);
  const models = [...new Set([env.GEMINI_MODEL || "gemini-flash-latest", ...extra])];
  const payload = JSON.stringify({
    contents: [{ role: "user", parts }],
    generationConfig: { responseMimeType: "application/json", temperature: 0.4 },
  });
  const started = Date.now();
  const tried = [];
  for (const model of models) {
    const left = 50000 - (Date.now() - started); // istemci 60 sn bekliyor; toplamda 50 sn'yi geçme
    if (left < 5000) break;
    let g;
    try {
      g = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": env.GEMINI_API_KEY },
        body: payload,
        signal: AbortSignal.timeout(Math.min(20000, left)),
      });
    } catch (e) {
      tried.push(model + ":zaman aşımı");
      continue;
    }
    if (g.ok) {
      const data = await g.json();
      const text = (data.candidates?.[0]?.content?.parts || []).map(p => p.text || "").join("");
      if (text) return json({ text, model });
      tried.push(model + ":boş cevap");
      continue;
    }
    const detail = (await g.text()).slice(0, 200);
    tried.push(model + ":" + g.status);
    // 400 = istek hatalı (ör. bozuk görsel): başka model de aynı cevabı verir, hemen dön
    if (g.status === 400) return json({ error: "Gemini isteği reddetti", status: 400, detail }, 400);
    // 404 = model adı yok, 429 = kota, 5xx/524 = yoğunluk → sıradaki modeli dene
  }
  const allQuota = tried.length > 0 && tried.every(t => t.endsWith(":429"));
  if (allQuota) return json({ error: "Gemini ücretsiz kotası doldu", tried }, 429);
  return json({ error: "Gemini şu an çok yoğun", tried }, 503);
}

/* ===================== Abonelikler ===================== */
// Her abonelik KV'de "sub:<hash>" anahtarıyla, tüm bilgisi METADATA içinde saklanır.
// Böylece zamanlayıcı her çalıştığında tek bir list() çağrısı yeterli olur (ücretsiz kotaya dost).
function validSub(s) {
  return s && typeof s.endpoint === "string" && /^https:\/\//.test(s.endpoint) && s.endpoint.length < 600 &&
    s.keys && typeof s.keys.p256dh === "string" && typeof s.keys.auth === "string";
}
async function subKey(endpoint) {
  const h = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(endpoint));
  return "sub:" + [...new Uint8Array(h)].slice(0, 16).map(b => b.toString(16).padStart(2, "0")).join("");
}
function cleanSettings(b) {
  const int = n => Math.round(Number(n));
  const tz = typeof b.tz === "string" && b.tz.length < 64 ? b.tz : "Europe/Istanbul";
  try { new Intl.DateTimeFormat("en", { timeZone: tz }); } catch { return null; }
  const interval = [30, 60, 90, 120, 180].includes(int(b.interval)) ? int(b.interval) : 90;
  const start = Math.min(23, Math.max(0, int(b.start) || 8));
  const end = Math.min(24, Math.max(1, int(b.end) || 23));
  const goal = Math.min(8000, Math.max(500, int(b.goal) || 2000));
  // Öğün hatırlatma saatleri (kahvaltı, öğle, akşam, ara) gece yarısından itibaren dakika; -1 = kapalı
  const meals = b.mealsOn && Array.isArray(b.meals)
    ? [0, 1, 2, 3].map(i => { const n = int(b.meals[i]); return n >= 0 && n < 1440 ? n : -1; })
    : [];
  // Döngü hatırlatmaları (kullanıcı onayıyla): yalnızca yaklaşan en fazla 4 tarih + tür, ör. "261124f" (24.11.2026 doğurgan dönem).
  // Türler: s = regl 2 gün sonra, t = tahmini regl günü, f = doğurgan dönem başlıyor, p = PMS başlıyor. Döngü geçmişi sunucuya gelmez.
  const cy = b.cycle && typeof b.cycle === "object" && typeof b.cycle.ev === "string" && /^\d{6}[stfp](,\d{6}[stfp]){0,3}$/.test(b.cycle.ev) ? b.cycle : null;
  return { tz, interval, start, end, goal, on: b.enabled !== false, ml: meals.some(n => n >= 0) ? meals.join(",") : "", wk: b.weekly === false ? 0 : 1,
    cy: cy ? cy.ev : "", cyT: cy ? Math.min(1439, Math.max(0, int(cy.t) || 540)) : 0, cyD: cy && cy.d === false ? 0 : 1 };
}
async function handleSubscribe(body, env, json) {
  if (!env.SUBS) return json({ error: "SUBS KV bağlanmamış" }, 500);
  if (!validSub(body.subscription)) return json({ error: "Geçersiz abonelik" }, 400);
  const st = cleanSettings(body);
  if (!st) return json({ error: "Geçersiz saat dilimi" }, 400);
  const s = body.subscription;
  const key = await subKey(s.endpoint);
  const old = (await env.SUBS.getWithMetadata(key)).metadata || {};
  const meta = { e: s.endpoint, p: s.keys.p256dh, a: s.keys.auth, ...st, done: old.done || "", md: old.md || "" };
  await env.SUBS.put(key, "1", { metadata: meta });
  return json({ ok: true });
}
async function handleUnsubscribe(body, env, json) {
  if (!env.SUBS) return json({ error: "SUBS KV bağlanmamış" }, 500);
  if (typeof body.endpoint !== "string") return json({ error: "endpoint gerekli" }, 400);
  await env.SUBS.delete(await subKey(body.endpoint));
  return json({ ok: true });
}
// Uygulama, su hedefi tamamlanınca o günün tarihini bildirir; o gün başka hatırlatma gitmez.
async function handleDone(body, env, json) {
  if (!env.SUBS) return json({ error: "SUBS KV bağlanmamış" }, 500);
  if (typeof body.endpoint !== "string") return json({ error: "endpoint gerekli" }, 400);
  const key = await subKey(body.endpoint);
  const r = await env.SUBS.getWithMetadata(key);
  if (!r.metadata) return json({ error: "Abonelik bulunamadı" }, 404);
  const done = typeof body.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(body.date) ? body.date : "";
  if (r.metadata.done !== done) await env.SUBS.put(key, "1", { metadata: { ...r.metadata, done } });
  return json({ ok: true });
}
// Uygulama, bugün hangi öğünlere yemek eklendiğini bildirir (bit maskesi: 1 kahvaltı, 2 öğle, 4 akşam, 8 ara).
// O öğünlerin hatırlatması o gün gönderilmez. Kullanıcı başına günde en fazla birkaç KV yazması olur.
async function handleMealDone(body, env, json) {
  if (!env.SUBS) return json({ error: "SUBS KV bağlanmamış" }, 500);
  if (typeof body.endpoint !== "string") return json({ error: "endpoint gerekli" }, 400);
  if (typeof body.date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(body.date)) return json({ error: "date gerekli" }, 400);
  const bits = Math.min(15, Math.max(0, Math.round(Number(body.bits)) || 0));
  const key = await subKey(body.endpoint);
  const r = await env.SUBS.getWithMetadata(key);
  if (!r.metadata) return json({ error: "Abonelik bulunamadı" }, 404);
  const md = `${body.date}:${bits}`;
  if (r.metadata.md !== md) await env.SUBS.put(key, "1", { metadata: { ...r.metadata, md } });
  return json({ ok: true });
}
async function handleTest(body, env, json) {
  if (!env.SUBS) return json({ error: "SUBS KV bağlanmamış" }, 500);
  if (typeof body.endpoint !== "string") return json({ error: "endpoint gerekli" }, 400);
  const r = await env.SUBS.getWithMetadata(await subKey(body.endpoint));
  if (!r.metadata) return json({ error: "Abonelik bulunamadı" }, 404);
  const res = await sendPush(env, r.metadata, { title: "💧 Bildirimler çalışıyor!", body: "Su hatırlatmaları bu şekilde gelecek.", url: "./" });
  return json({ ok: res.ok, status: res.status });
}

/* ===================== Zamanlayıcı ===================== */
function localNow(tz, ts) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-GB", {
    timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23", weekday: "short",
  }).formatToParts(new Date(ts)).map(p => [p.type, p.value]));
  return { date: `${parts.year}-${parts.month}-${parts.day}`, minutes: (+parts.hour) * 60 + (+parts.minute), weekday: parts.weekday };
}
// Haftalık rapor: Pazartesi 09:30 (yerel saat), 15 dakikalık pencerede bir kez. Eski abonelikte wk yoksa açık sayılır.
// Bugün (yerel tarih) için döngü hatırlatması var mı? Seçilen saatten sonraki 15 dakikalık pencerede bir kez.
function cycleDue(m, ts) {
  if (!m.cy) return [];
  const { date, minutes } = localNow(m.tz, ts);
  if (minutes < m.cyT || minutes >= m.cyT + 15) return [];
  const code = date.slice(2).replace(/-/g, "");
  return m.cy.split(",").filter(e => e.startsWith(code)).map(e => e[6]);
}
const CYCLE_TXT = { s: "🩸 Reglin 2 gün içinde başlayabilir.", t: "🩸 Reglin bugün başlayabilir; başladıysa kaydetmeyi unutma.", f: "🌸 Tahmini doğurgan dönemin bugün başlıyor.", p: "🌧️ PMS dönemin başlıyor; kendine nazik ol." };
function weeklyDue(m, ts) {
  if (m.wk === 0) return false;
  const { minutes, weekday } = localNow(m.tz, ts);
  return weekday === "Mon" && minutes >= 570 && minutes < 585;
}
// Durumsuz zamanlama: başlangıç saatinden itibaren her "interval" dakikada bir, 15 dakikalık pencerede gönder.
// Böylece "son gönderim" için KV'ye yazma gerekmez.
function isDue(m, ts) {
  if (!m.on) return false;
  const { date, minutes } = localNow(m.tz, ts);
  if (m.done === date) return false;
  const startM = m.start * 60, endM = m.end * 60;
  if (minutes < startM || minutes >= endM) return false;
  const since = minutes - startM;
  return since >= m.interval && (since % m.interval) < 15; // ilk hatırlatma, başlangıçtan bir aralık sonra
}
// Öğün hatırlatması: ayarlanan saatten sonraki 15 dakikalık pencerede (cron 15 dk'da bir) bir kez gönderilir.
// O gün o öğüne yemek eklenmişse gönderilmez. Dönüş: öğün sırası (0-3) ya da -1.
const MEAL_KEYS = ["kahvalti", "ogle", "aksam", "ara"];
const MEAL_NAMES = ["🍳 Kahvaltı", "🥗 Öğle yemeği", "🍲 Akşam yemeği", "🍎 Ara öğün"];
function dueMeal(m, ts) {
  if (!m.ml) return -1;
  const { date, minutes } = localNow(m.tz, ts);
  const doneBits = typeof m.md === "string" && m.md.startsWith(date + ":") ? Number(m.md.slice(11)) || 0 : 0;
  const times = m.ml.split(",").map(Number);
  for (let i = 0; i < 4; i++) {
    const t = times[i];
    if (t >= 0 && minutes >= t && minutes - t < 15 && !(doneBits & (1 << i))) return i;
  }
  return -1;
}
const MESSAGES = [
  "Bir bardak su içme zamanı. Vücudun teşekkür edecek!",
  "Su molası! Hedefine bir bardak daha yaklaş.",
  "Susamadan iç: şimdi bir bardak su iyi gelir.",
  "Küçük bir hatırlatma: bir bardak su iç ve uygulamaya ekle.",
];
async function sendDueReminders(env, ts) {
  if (!env.SUBS || !env.VAPID_PRIVATE_KEY) return;
  const rounded = Math.round(ts / 60000) * 60000; // cron birkaç saniye geç çalışabilir
  let cursor;
  do {
    const page = await env.SUBS.list({ prefix: "sub:", cursor });
    const jobs = [];
    for (const k of page.keys) {
      const m = k.metadata;
      if (!m) continue;
      if (isDue(m, rounded)) jobs.push({ k, m, payload: {
        type: "water",
        title: "💧 Su içme zamanı!",
        body: MESSAGES[Math.floor(Math.random() * MESSAGES.length)] + ` (Günlük hedef: ${(m.goal / 1000).toFixed(1)} L)`,
        url: "./",
      } });
      const mi = dueMeal(m, rounded);
      if (mi >= 0) jobs.push({ k, m, payload: {
        type: "meal",
        title: `${MEAL_NAMES[mi]} zamanı`,
        body: "Ne yediğini eklemeyi unutma. Yazman ya da fotoğraf çekmen yeterli.",
        url: `./#ogun-${MEAL_KEYS[mi]}`,
      } });
      const cyc = cycleDue(m, rounded);
      if (cyc.length) jobs.push({ k, m, payload: m.cyD === 0
        ? { type: "cycle", title: "🌸 Döngü hatırlatması", body: cyc.map(c => CYCLE_TXT[c]).join(" "), url: "./#dongu" }
        : { type: "cycle", title: "🌸 Döngü hatırlatması", body: "Ayrıntı için dokun.", url: "./#dongu" } }); // gizli metin (varsayılan)
      if (weeklyDue(m, rounded)) jobs.push({ k, m, payload: {
        type: "weekly",
        title: "📊 Haftalık raporun hazır",
        body: "Geçen haftanın kalori, protein, su ve spor özetine göz at. Yeni rozetlerin de olabilir!",
        url: "./#rapor",
      } });
    }
    const gone = new Set();
    await Promise.all(jobs.map(async ({ k, m, payload }) => {
      const res = await sendPush(env, m, payload).catch(() => null);
      if (res && (res.status === 404 || res.status === 410) && !gone.has(k.name)) { // abonelik geçersiz
        gone.add(k.name);
        await env.SUBS.delete(k.name);
      }
    }));
    cursor = page.list_complete ? undefined : page.cursor;
  } while (cursor);
}

/* ===================== Web Push (VAPID + aes128gcm, RFC 8291/8292) ===================== */
const enc = new TextEncoder();
function b64uToBytes(s) {
  s = s.replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(s + "===".slice((s.length + 3) % 4));
  return Uint8Array.from(bin, c => c.charCodeAt(0));
}
function bytesToB64u(b) {
  let s = ""; const a = new Uint8Array(b);
  for (let i = 0; i < a.length; i++) s += String.fromCharCode(a[i]);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function concat(...arrs) {
  const out = new Uint8Array(arrs.reduce((n, a) => n + a.length, 0));
  let o = 0; for (const a of arrs) { out.set(a, o); o += a.length; }
  return out;
}
async function hkdf(salt, ikm, info, bytes) {
  const key = await crypto.subtle.importKey("raw", ikm, "HKDF", false, ["deriveBits"]);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: "HKDF", hash: "SHA-256", salt, info }, key, bytes * 8));
}
async function vapidAuth(env, endpoint) {
  const pub = b64uToBytes(env.VAPID_PUBLIC_KEY);
  const jwk = { kty: "EC", crv: "P-256", x: bytesToB64u(pub.slice(1, 33)), y: bytesToB64u(pub.slice(33, 65)), d: env.VAPID_PRIVATE_KEY, ext: true };
  const key = await crypto.subtle.importKey("jwk", jwk, { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]);
  const header = bytesToB64u(enc.encode(JSON.stringify({ typ: "JWT", alg: "ES256" })));
  const claims = bytesToB64u(enc.encode(JSON.stringify({
    aud: new URL(endpoint).origin,
    exp: Math.floor(Date.now() / 1000) + 12 * 3600,
    sub: env.VAPID_SUBJECT || "mailto:admin@example.com",
  })));
  const sig = await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, key, enc.encode(header + "." + claims));
  return `vapid t=${header}.${claims}.${bytesToB64u(sig)}, k=${env.VAPID_PUBLIC_KEY}`;
}
export async function encryptPayload(p256dhB64u, authB64u, payloadStr) {
  const uaPublic = b64uToBytes(p256dhB64u);
  const authSecret = b64uToBytes(authB64u);
  const asKeys = await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"]);
  const asPublic = new Uint8Array(await crypto.subtle.exportKey("raw", asKeys.publicKey));
  const uaKey = await crypto.subtle.importKey("raw", uaPublic, { name: "ECDH", namedCurve: "P-256" }, false, []);
  const ecdhSecret = new Uint8Array(await crypto.subtle.deriveBits({ name: "ECDH", public: uaKey }, asKeys.privateKey, 256));
  const ikm = await hkdf(authSecret, ecdhSecret, concat(enc.encode("WebPush: info\0"), uaPublic, asPublic), 32);
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const cek = await hkdf(salt, ikm, enc.encode("Content-Encoding: aes128gcm\0"), 16);
  const nonce = await hkdf(salt, ikm, enc.encode("Content-Encoding: nonce\0"), 12);
  const aesKey = await crypto.subtle.importKey("raw", cek, "AES-GCM", false, ["encrypt"]);
  const plaintext = concat(enc.encode(payloadStr), new Uint8Array([2])); // tek kayıt, sonda 0x02
  const ciphertext = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv: nonce }, aesKey, plaintext));
  const header = new Uint8Array(16 + 4 + 1 + 65);
  header.set(salt, 0);
  new DataView(header.buffer).setUint32(16, 4096);
  header[20] = 65;
  header.set(asPublic, 21);
  return concat(header, ciphertext);
}
async function sendPush(env, m, payload) {
  const body = await encryptPayload(m.p, m.a, JSON.stringify(payload));
  return fetch(m.e, {
    method: "POST",
    headers: {
      "Authorization": await vapidAuth(env, m.e),
      "Content-Encoding": "aes128gcm",
      "Content-Type": "application/octet-stream",
      "TTL": "3600",
      "Urgency": "normal",
    },
    body,
  });
}
