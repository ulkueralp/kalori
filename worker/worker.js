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
    const admPath = url.pathname.startsWith("/admin/") && url.pathname !== "/admin/login"; // yönetici paneli: oturum imzasıyla korunur, sık işlem yapabilsin
    if (list.length >= 20 && !admPath) return json({ error: "Çok fazla istek" }, 429);
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
      if (url.pathname.startsWith("/cloud/")) return await handleCloud(url.pathname.slice(7), body, env, json);
      if (url.pathname.startsWith("/admin/")) return await handleAdmin(url.pathname.slice(7), body, request, env, json);
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

/* ===================== Bulut yedeği ===================== */
// Her kullanıcının telefonunda bir kurtarma kodu vardır (12 karakter, ~60 bit; tek gizli bilgi budur).
// KV anahtarı: "u:<sha256(kod) ilk 32 hex>" → güncel verinin tamamı (JSON); metadata: ad, zaman, boyut (yönetici listesi için).
// Günlük kopyalar: "b:<id>:<YYYY-MM-DD>" → o günün ilk yedeği; 30 günden eskiler silinir.
// Ücretsiz kotaya dost: uygulama en sık 3 dakikada bir ve sadece değişiklik varsa gönderir; günlük kopya için günde 1 yazma + 1 listeleme.
const CODE_RE = /^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{12}$/;
async function cloudId(code) {
  const h = await crypto.subtle.digest("SHA-256", new TextEncoder().encode("kalori-cloud:" + code));
  return [...new Uint8Array(h)].slice(0, 16).map(b => b.toString(16).padStart(2, "0")).join("");
}
function istDate(ts = Date.now()) { return localNow("Europe/Istanbul", ts).date; }
async function handleCloud(op, body, env, json) {
  if (!env.SUBS) return json({ error: "SUBS KV bağlanmamış" }, 500);
  let code = String(body.code || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (code.length === 15 && code.startsWith("KLR")) code = code.slice(3); // "KLR-XXXX-XXXX-XXXX" biçimi de kabul
  if (!CODE_RE.test(code)) return json({ error: "Geçersiz kurtarma kodu" }, 400);
  const id = await cloudId(code), uk = "u:" + id;
  if (op === "save") {
    const d = body.data;
    if (!d || typeof d !== "object" || !d.profile || !d.days) return json({ error: "Geçersiz veri" }, 400);
    const adm = +(await env.SUBS.get("m:" + id)) || 0; // yöneticinin son düzeltme zamanı
    if (adm > (+body.as || 0)) return json({ error: "Yönetici güncellemesi var", adm }, 409); // telefon önce yönetici sürümünü alsın
    const raw = JSON.stringify(d), now = Date.now(), p = d.profile || {};
    const pe = typeof body.pe === "string" && /^https:\/\//.test(body.pe) && body.pe.length < 600 ? await subKey(body.pe) : "";
    const meta = { n: String(p.name || "").slice(0, 40), sx: p.sex === "m" ? "m" : "f", at: now, sz: raw.length, dn: Object.keys(d.days).length, c: code, v: String(body.v || "").slice(0, 20), pk: pe, ad: adm };
    await env.SUBS.put(uk, raw, { metadata: meta });
    let snap = false;
    if (body.snap) { // günün ilk yedeği: kopyasını sakla, 30 günden eskileri sil
      const today = istDate(now);
      await env.SUBS.put(`b:${id}:${today}`, raw, { metadata: { at: now, sz: raw.length } });
      snap = true;
      const old = (await env.SUBS.list({ prefix: `b:${id}:` })).keys.map(k => k.name).filter(n => n.slice(-10) < istDate(now - 30 * 864e5));
      await Promise.all(old.map(n => env.SUBS.delete(n)));
    }
    return json({ ok: true, at: now, snap });
  }
  if (op === "load") { // tarih verilirse o günün kopyası, verilmezse en güncel
    const date = typeof body.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(body.date) ? body.date : "";
    const r = await env.SUBS.getWithMetadata(date ? `b:${id}:${date}` : uk);
    if (r.value === null) return json({ error: date ? "Bu tarihte yedek yok" : "Bu koda ait yedek bulunamadı" }, 404);
    return json({ ok: true, data: JSON.parse(r.value), at: (r.metadata || {}).at || 0, adm: +(await env.SUBS.get("m:" + id)) || 0 });
  }
  if (op === "check") return json({ ok: true, adm: +(await env.SUBS.get("m:" + id)) || 0 }); // küçük okuma: yönetici düzeltmesi var mı?
  if (op === "list") {
    const ks = (await env.SUBS.list({ prefix: `b:${id}:` })).keys;
    const cur = (await env.SUBS.list({ prefix: uk })).keys.find(k => k.name === uk);
    return json({ ok: true, latest: cur ? (cur.metadata || {}).at || 0 : 0, days: ks.map(k => ({ date: k.name.slice(-10), at: (k.metadata || {}).at || 0, sz: (k.metadata || {}).sz || 0 })).sort((a, b) => a.date < b.date ? 1 : -1) });
  }
  if (op === "delete") { // kullanıcı buluttaki verilerini tamamen silebilir
    const ks = (await env.SUBS.list({ prefix: `b:${id}:` })).keys.map(k => k.name);
    await Promise.all([uk, "m:" + id, "p:" + id, ...ks].map(n => env.SUBS.delete(n)));
    return json({ ok: true, deleted: ks.length + 1 });
  }
  return json({ error: "Bulunamadı" }, 404);
}

/* ===================== Yönetici paneli ===================== */
// Giriş: ADMIN_PASSWORD (Cloudflare secret). Oturum anahtarı: "bitiş.imza" (HMAC-SHA256, anahtar = şifre); şifre değişince eski oturumlar geçersiz olur.
// IP başına 15 dakikada 5 yanlış denemeden sonra kilit. Her işlem "adm:log" kaydına yazılır (son 200).
// Yönetici bir kullanıcının verisini değiştirince: önceki sürüm "p:<id>"e saklanır, "m:<id>" = düzeltme zamanı yazılır;
// telefon bir sonraki açılışta bunu görür ve yönetici sürümünü sessizce alır (kullanıcı kararı: bildirim gösterilmez).
const ADMIN_TTL = 12 * 3600 * 1000;
async function hmacB64(key, msg) {
  const k = await crypto.subtle.importKey("raw", new TextEncoder().encode(key), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return bytesToB64u(await crypto.subtle.sign("HMAC", k, new TextEncoder().encode(msg)));
}
async function sha256hex(t) { return [...new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(t)))].map(b => b.toString(16).padStart(2, "0")).join(""); }
async function adminOk(env, tok) {
  const [exp, sig] = String(tok || "").split(".");
  if (!env.ADMIN_PASSWORD || !exp || !sig || +exp < Date.now()) return false;
  return sig === await hmacB64(env.ADMIN_PASSWORD, "adm:" + exp);
}
async function adminLog(env, entry) {
  let list = []; try { list = JSON.parse(await env.SUBS.get("adm:log") || "[]"); } catch {}
  list.unshift({ t: Date.now(), ...entry }); await env.SUBS.put("adm:log", JSON.stringify(list.slice(0, 200)));
}
const ID_RE = /^[0-9a-f]{32}$/;
async function adminPutUser(env, id, data, note) { // yönetici sürümünü yaz (önceki sürüm p:<id>'de saklanır)
  const cur = await env.SUBS.getWithMetadata("u:" + id);
  if (cur.value === null) return null;
  await env.SUBS.put("p:" + id, cur.value, { metadata: { at: Date.now(), note } });
  const now = Date.now(), raw = JSON.stringify(data), pr = data.profile || {};
  await env.SUBS.put("u:" + id, raw, { metadata: { ...(cur.metadata || {}), n: String(pr.name || "").slice(0, 40), sx: pr.sex === "m" ? "m" : "f", at: now, sz: raw.length, dn: Object.keys(data.days || {}).length, ad: now } });
  await env.SUBS.put("m:" + id, String(now));
  return now;
}
async function handleAdmin(op, body, request, env, json) {
  if (!env.SUBS) return json({ error: "SUBS KV bağlanmamış" }, 500);
  if (!env.ADMIN_PASSWORD) return json({ error: "ADMIN_PASSWORD ayarlanmamış" }, 500);
  const ip = request.headers.get("CF-Connecting-IP") || "x";
  if (op === "login") {
    const fk = "adm:fail:" + await sha256hex(ip), fails = +(await env.SUBS.get(fk)) || 0;
    if (fails >= 5) return json({ error: "Çok fazla yanlış deneme. 15 dakika sonra tekrar dene." }, 429);
    const ok = await sha256hex("k:" + String(body.password || "")) === await sha256hex("k:" + env.ADMIN_PASSWORD);
    if (!ok) { await env.SUBS.put(fk, String(fails + 1), { expirationTtl: 900 }); return json({ error: `Şifre yanlış (${4 - fails} hakkın kaldı)` }, 401); }
    if (fails) await env.SUBS.delete(fk);
    const exp = Date.now() + ADMIN_TTL;
    await adminLog(env, { op: "giriş", ip: ip.slice(0, 45) });
    return json({ ok: true, token: exp + "." + await hmacB64(env.ADMIN_PASSWORD, "adm:" + exp), exp });
  }
  if (!await adminOk(env, body.token)) return json({ error: "Oturum süresi doldu, tekrar giriş yap" }, 401);
  if (op === "users") {
    const users = [], subs = new Set();
    let c; do { const pg = await env.SUBS.list({ prefix: "sub:", cursor: c }); pg.keys.forEach(k => subs.add(k.name)); c = pg.list_complete ? null : pg.cursor; } while (c);
    c = undefined; do { const pg = await env.SUBS.list({ prefix: "u:", cursor: c }); pg.keys.forEach(k => users.push({ id: k.name.slice(2), ...(k.metadata || {}), push: !!(k.metadata && k.metadata.pk && subs.has(k.metadata.pk)) })); c = pg.list_complete ? null : pg.cursor; } while (c);
    users.sort((a, b) => (b.at || 0) - (a.at || 0));
    return json({ ok: true, users, subs: subs.size });
  }
  if (op === "log") return json({ ok: true, log: JSON.parse(await env.SUBS.get("adm:log") || "[]") });
  const id = String(body.id || "");
  if (!ID_RE.test(id)) return json({ error: "Geçersiz kullanıcı" }, 400);
  if (op === "user") {
    const r = await env.SUBS.getWithMetadata("u:" + id);
    if (r.value === null) return json({ error: "Kullanıcı bulunamadı" }, 404);
    const snaps = (await env.SUBS.list({ prefix: `b:${id}:` })).keys.map(k => k.name.slice(-10)).sort().reverse();
    const prev = await env.SUBS.getWithMetadata("p:" + id);
    return json({ ok: true, data: JSON.parse(r.value), meta: r.metadata || {}, snaps, prev: prev.value !== null ? (prev.metadata || {}) : null });
  }
  if (op === "save") {
    const d = body.data;
    if (!d || typeof d !== "object" || !d.profile || !d.days) return json({ error: "Geçersiz veri (profile ve days olmalı)" }, 400);
    const cur = await env.SUBS.getWithMetadata("u:" + id);
    if (cur.value === null) return json({ error: "Kullanıcı bulunamadı" }, 404);
    if (body.base && (cur.metadata || {}).at !== body.base) return json({ error: "Bu arada kullanıcının telefonundan yeni yedek geldi. Kullanıcıyı yeniden açıp tekrar dene.", at: (cur.metadata || {}).at }, 409);
    const at = await adminPutUser(env, id, d, String(body.note || "düzenleme").slice(0, 80));
    await adminLog(env, { op: "düzenleme", id, n: (cur.metadata || {}).n || "", info: String(body.note || "").slice(0, 120) });
    return json({ ok: true, at });
  }
  if (op === "restore") { // günlük kopyaya ya da yöneticinin son düzeltmesinden önceki sürüme dön
    const date = String(body.date || "");
    const src = date === "prev" ? await env.SUBS.get("p:" + id) : /^\d{4}-\d{2}-\d{2}$/.test(date) ? await env.SUBS.get(`b:${id}:${date}`) : null;
    if (src === null) return json({ error: "Yedek bulunamadı" }, 404);
    const m = (await env.SUBS.getWithMetadata("u:" + id)).metadata || {};
    const at = await adminPutUser(env, id, JSON.parse(src), "geri yükleme " + date);
    await adminLog(env, { op: "geri yükleme", id, n: m.n || "", info: date === "prev" ? "önceki sürüm" : date });
    return json({ ok: true, at });
  }
  if (op === "push") {
    const title = String(body.title || "").slice(0, 80), text = String(body.body || "").slice(0, 300);
    if (!title || !text) return json({ error: "Başlık ve metin gerekli" }, 400);
    const m = (await env.SUBS.getWithMetadata("u:" + id)).metadata || {};
    if (!m.pk) return json({ error: "Bu kullanıcının telefon bildirimleri kapalı" }, 404);
    const sub = await env.SUBS.getWithMetadata(m.pk);
    if (!sub.metadata) return json({ error: "Bildirim aboneliği bulunamadı (kullanıcı bildirimleri kapatmış olabilir)" }, 404);
    const res = await sendPush(env, sub.metadata, { type: "admin", title, body: text, url: "./" });
    if (res.status === 404 || res.status === 410) await env.SUBS.delete(m.pk);
    await adminLog(env, { op: "bildirim", id, n: m.n || "", info: title });
    return json({ ok: res.ok, status: res.status });
  }
  if (op === "delete") { // kullanıcının buluttaki bütün verisi (telefondaki veri silinmez)
    const m = (await env.SUBS.getWithMetadata("u:" + id)).metadata || {};
    const ks = (await env.SUBS.list({ prefix: `b:${id}:` })).keys.map(k => k.name);
    await Promise.all(["u:" + id, "m:" + id, "p:" + id, ...ks].map(n => env.SUBS.delete(n)));
    await adminLog(env, { op: "silme", id, n: m.n || "" });
    return json({ ok: true });
  }
  return json({ error: "Bulunamadı" }, 404);
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
