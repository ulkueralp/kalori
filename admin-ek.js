/* Kalori yönetici paneli, 3. adım: duyurular, istatistik, içerik yönetimi, ayarlar.
   admin.html'deki ortak değişkenleri (TOKEN, USERS, MSG, BUSY, call, say, esc, render, ago, fmtT, num) kullanır. */
let CFG = null, STATS = null, CD = null, CDIRTY = false, SD = null, BASEF = null, FQ = "", CRV = "tatli", PICK = null;
const ANN0 = () => ({ id: "", icon: "📣", title: "", body: "", target: "all", ids: [], at: "", until: "", push: true });
let ANNF = ANN0(), PM = { title: "💚 Seni özledik", body: "Kalori'de seni bekliyoruz! Bugün bir öğününü kaydetmeye ne dersin?" };
const FLAGS = [["photo","📸 Fotoğrafla yemek ekleme"],["voice","🎤 Sesle ekleme"],["barcode","📦 Barkod"],["sugg","💬 Koç sekmesi (sohbet + öneriler)"],["cycle","🌸 Regl takibi"],["dertles","💬 Dertleş (regl kartında)"],["shop","🛒 Alışveriş listesi"]];
const CRAVES = [["tatli","🍫 Tatlı krizi"],["tuzlu","🥨 Tuzlu"],["protein","💪 Yüksek protein"],["pratik","⚡ Pratik"],["hafif","🥗 Hafif"],["gece","🌙 Gece"]];
const dtl = ts => { if (!ts) return ""; const d = new Date(ts - new Date(ts).getTimezoneOffset() * 6e4); return d.toISOString().slice(0, 16); };
const lc = s => String(s || "").toLocaleLowerCase("tr");

async function loadCfg() { try { CFG = (await call("config")).cfg; CD = null; SD = null; render(); } catch (e) { if (e.message !== "401") say(e.message, 1); } }
async function loadStats() { try { STATS = await call("stats"); PICK = new Set(STATS.users.filter(u => u.push && Date.now() - u.at > 3 * 864e5).map(u => u.id)); render(); } catch (e) { if (e.message !== "401") say(e.message, 1); } }
async function loadBase() { // uygulamadaki hazır yemek listesini index.html'den oku
  try { const t = await (await fetch("index.html", { cache: "no-store" })).text(); const m = t.match(/const FOOD_DB = (\[[\s\S]*?\n\])\.map/);
    BASEF = m ? new Function("return " + m[1])() : []; } catch (e) { BASEF = []; } render();
}
const need = () => { if (!CFG) { loadCfg(); return `<div class="card">Yükleniyor…</div>`; } return ""; };

/* ---------------- Duyurular ---------------- */
function annHTML() {
  const w = need(); if (w) return w;
  if (!USERS) { call("users").then(r => { USERS = r.users; render(); }).catch(() => {}); }
  const f = ANNF, now = Date.now();
  const st = a => a.until && a.until < now ? `<span class="pill g">süresi doldu</span>` : a.at > now ? `<span class="pill g">zamanlandı: ${fmtT(a.at)}</span>` : `<span class="pill">yayında</span>`;
  return `<div class="card"><h2>${f.id ? "Duyuruyu düzenle" : "Yeni duyuru"}</h2>
    <p class="small muted">Duyuru, uygulamada <b>Bugün</b> ekranının en üstünde kart olarak görünür; kişi "Tamam"a basınca bir daha çıkmaz. İstersen telefonuna bildirim olarak da gider.</p>
    <div class="row"><div style="width:80px"><label>Simge</label><input data-af="icon" value="${esc(f.icon)}" maxlength="4"></div><div style="flex:1"><label>Başlık</label><input data-af="title" value="${esc(f.title)}" maxlength="80" placeholder="Örn: Yeni özellik geldi!"></div></div>
    <label>Metin</label><textarea data-af="body" rows="3" maxlength="500" style="font-family:inherit;font-size:14px" placeholder="Örn: Artık Ekle'de sesle yemek ekleyebilirsin 🎤">${esc(f.body)}</textarea>
    <label>Kime</label><div class="row"><label class="row" style="margin:0;color:var(--ink);font-size:14px"><input type="radio" name="tg" data-af="target" value="all" ${f.target==="all"?"checked":""} style="width:auto"> Herkes</label>
      <label class="row" style="margin:0;color:var(--ink);font-size:14px"><input type="radio" name="tg" data-af="target" value="some" ${f.target==="some"?"checked":""} style="width:auto"> Seçtiğim kişiler</label></div>
    ${f.target === "some" ? `<div class="row" style="margin-top:6px">${(USERS || []).map(u => `<label class="row" style="margin:0;color:var(--ink);font-size:14px;border:1px solid var(--line);border-radius:10px;padding:4px 8px"><input type="checkbox" data-aid="${u.id}" ${f.ids.includes(u.id)?"checked":""} style="width:auto"> ${esc(u.n || "(isimsiz)")}</label>`).join("") || '<span class="muted small">Kullanıcı yok</span>'}</div>` : ""}
    <div class="row"><div><label>Başlangıç (boş = hemen)</label><input type="datetime-local" data-af="at" value="${esc(f.at)}"></div><div><label>Bitiş (isteğe bağlı)</label><input type="datetime-local" data-af="until" value="${esc(f.until)}"></div></div>
    <label class="row" style="color:var(--ink);font-size:14px;margin-top:10px"><input type="checkbox" data-af="push" ${f.push?"checked":""} style="width:auto"> Telefonlarına bildirim olarak da gönder (bildirimi açık olanlara; zamanlıysa o saatte, en geç 15 dk içinde)</label>
    <div class="row" style="margin-top:10px"><button data-a="annSave" ${BUSY?"disabled":""}>📣 ${f.id ? "Kaydet" : "Yayınla"}</button>${f.id ? `<button class="ghost" data-a="annNew">Vazgeç</button>` : ""}</div></div>
  <div class="card"><h2>Duyurular (${CFG.ann.length})</h2><table>${CFG.ann.map(a => `<tr><td style="width:30px;font-size:20px">${esc(a.icon)}</td><td><b>${esc(a.title)}</b><div class="tiny muted">${esc(a.body.slice(0, 90))}</div>
      <div class="tiny">${st(a)} ${a.ids.length ? `<span class="pill g">${a.ids.length} kişi</span>` : `<span class="pill g">herkes</span>`} ${a.push ? (a.pushed ? '<span class="pill">🔔 gönderildi</span>' : '<span class="pill g">🔔 bekliyor</span>') : ""}</div></td>
      <td style="text-align:right;white-space:nowrap"><button class="ghost sm" data-a="annEdit" data-id="${a.id}">Düzenle</button> <button class="ghost sm" data-a="annDel" data-id="${a.id}">${ARM==="ad:"+a.id?"Emin misin?":"Sil"}</button></td></tr>`).join("") || `<tr><td class="muted">Henüz duyuru yok</td></tr>`}</table></div>
  <div class="card"><h2>Sadece bildirim gönder (kart olmadan)</h2><p class="small muted">Bildirimi açık olan herkese hemen gider. Belirli kişilere göndermek için İstatistik sayfasını ya da kişinin kendi sayfasını kullan.</p>
    <label>Başlık</label><input id="bpT" maxlength="80" placeholder="Örn: Bayramınız kutlu olsun 🎉"><label>Metin</label><textarea id="bpB" rows="2" maxlength="300" style="font-family:inherit;font-size:14px"></textarea>
    <button style="margin-top:8px" data-a="pushAll" ${BUSY?"disabled":""}>🔔 Herkese gönder</button></div>`;
}

/* ---------------- İstatistik ---------------- */
function statsHTML2() {
  if (!STATS) { loadStats(); return `<div class="card">Yükleniyor…</div>`; }
  const S = STATS, now = Date.now(), days = u => Math.floor((now - u.at) / 864e5);
  const avg = k => { const l = S.users.filter(u => u[k]); return l.length ? Math.round(l.reduce((s, u) => s + u[k], 0) / l.length) : 0; };
  const tile = (v, l) => `<div class="card" style="margin:0;text-align:center"><div style="font-size:22px;font-weight:800">${v}</div><div class="tiny muted">${l}</div></div>`;
  return `<div class="grid" style="gap:10px;margin-bottom:12px">${tile(S.total, "kullanıcı")}${tile(S.active7, "son 7 günde aktif")}${tile(S.users.filter(u => u.push).length, "bildirimi açık")}
      ${tile(avg("kcal") + " kcal", "ort. günlük kalori")}${tile((avg("water") / 1000).toFixed(1).replace(".", ",") + " L", "ort. su")}${tile(avg("steps").toLocaleString("tr-TR"), "ort. adım")}</div>
  <div class="card"><div class="row" style="justify-content:space-between"><h2 style="margin:0">Kişiler (son 7 gün)</h2><button class="ghost sm" data-a="statsReload">↻ Yenile</button></div>
    <p class="tiny muted">3 günden uzun süredir uygulamayı açmayanlar turuncu. Seçili kişilere aşağıdan bildirim gönderebilirsin.</p>
    <div class="scroll"><table><tr><th></th><th>Ad</th><th>Son açılış</th><th>Kayıtlı gün</th><th>Ort. kcal</th><th>Ort. su</th><th>Ort. adım</th><th>Spor günü</th><th>Kilo</th></tr>
    ${S.users.map(u => `<tr style="${days(u) >= 3 ? "background:rgba(217,119,6,.12)" : ""}"><td><input type="checkbox" data-sid="${u.id}" ${PICK.has(u.id)?"checked":""} ${u.push?"":"disabled title='Bildirimi kapalı'"} style="width:auto"></td>
      <td><a href="#" data-a="open2" data-id="${u.id}"><b>${esc(u.n || "(isimsiz)")}</b></a> ${u.push ? "🔔" : ""}</td><td>${ago(u.at)}</td><td>${u.d7}/7</td><td>${u.kcal || "—"}</td>
      <td>${u.water ? (u.water / 1000).toFixed(1).replace(".", ",") + " L" : "—"}</td><td>${u.steps ? u.steps.toLocaleString("tr-TR") : "—"}</td><td>${u.sport}</td>
      <td>${u.kg ? u.kg + " kg" : "—"}${u.kgDelta ? ` <span class="tiny ${u.kgDelta < 0 ? "" : "muted"}">(${u.kgDelta > 0 ? "+" : ""}${String(u.kgDelta).replace(".", ",")})</span>` : ""}</td></tr>`).join("") || `<tr><td colspan="9" class="muted">Henüz kullanıcı yok</td></tr>`}</table></div>
    <h3>Seçilenlere bildirim (${PICK.size} kişi)</h3>
    <label>Başlık</label><input data-pm="title" value="${esc(PM.title)}" maxlength="80"><label>Metin</label><textarea data-pm="body" rows="2" maxlength="300" style="font-family:inherit;font-size:14px">${esc(PM.body)}</textarea>
    <button style="margin-top:8px" data-a="pushPick" ${BUSY||!PICK.size?"disabled":""}>💚 Seçilenlere gönder</button></div>
  <div class="card"><h2>En çok eklenen yemekler (son 30 gün, herkes)</h2>${S.top.length ? `<table>${S.top.map(([n, c], i) => `<tr><td style="width:24px" class="muted">${i + 1}</td><td>${esc(n)}</td><td style="text-align:right">${c} kez</td></tr>`).join("")}</table>` : '<p class="muted small">Henüz veri yok</p>'}</div>`;
}

/* ---------------- İçerik ---------------- */
function contentHTML() {
  const w = need(); if (w) return w;
  if (!CD) { const c = CFG.content || {}; CD = { foods: (c.foods || []).map(x => x.slice()), hide: (c.hide || []).slice(), motiv: (c.motiv || []).slice(), crave: JSON.parse(JSON.stringify(c.crave || {})) }; }
  if (!BASEF) { loadBase(); }
  const hid = new Set(CD.hide.map(lc)), mine = new Map(CD.foods.map(f => [lc(f[0]), f]));
  return `<div class="card"><h2>🍲 Hazır yemek listesi</h2>
    <p class="small muted">Uygulamada "🔎 Liste"de ve yapay zekâ çalışmadığında kullanılan liste. Buradan yemek ekleyebilir, var olanın kalorisini düzeltebilir ya da gizleyebilirsin. Kaydedince herkesin uygulamasına bir sonraki açılışta gelir.</p>
    <label>Listede ara (${BASEF ? BASEF.length : "…"} yemek)</label><input id="fq" value="${esc(FQ)}" placeholder="Örn: mercimek">
    <div id="fqRes">${foodSearchHTML(hid, mine)}</div>
    <h3>Eklediğin ya da düzelttiğin yemekler (${CD.foods.length})</h3>
    <div class="scroll"><table><tr><th>Ad</th><th>Porsiyon</th><th>kcal</th><th>Protein</th><th>Karb.</th><th>Yağ</th><th></th></tr>
    ${CD.foods.map((f, i) => `<tr>${[0,1,2,3,4,5].map(j => `<td><input data-cf="${i}:${j}" value="${esc(f[j])}" ${j>1?'type="number" step="0.1" style="width:72px"':j?'style="min-width:90px"':'style="min-width:150px"'}></td>`).join("")}
      <td>${BASEF && BASEF.some(b => lc(b[0]) === lc(f[0])) ? '<span class="pill g">düzeltme</span>' : '<span class="pill">yeni</span>'} <button class="ghost sm" data-a="cfDel" data-i="${i}">✕</button></td></tr>`).join("") || `<tr><td colspan="7" class="muted">Henüz yok</td></tr>`}</table></div>
    <button class="ghost sm" style="margin-top:6px" data-a="cfAdd">+ Yeni yemek</button>
    ${CD.hide.length ? `<h3>Gizlenen yemekler</h3><div class="row">${CD.hide.map((n, i) => `<span class="pill g" style="font-size:13px">${esc(n)} <a href="#" data-a="unhide" data-i="${i}">↩︎</a></span>`).join("")}</div>` : ""}
  </div>
  <div class="card"><h2>💬 Motivasyon mesajları</h2><p class="small muted">Bugün ekranının üstündeki yeşil şeritte, uygulamanın kendi mesajlarıyla sırayla gösterilir. Her satır bir mesaj; başına emoji koyabilirsin.</p>
    <textarea id="cm" rows="6" style="font-family:inherit;font-size:14px" placeholder="🌟 Bugün kendine iyi bak!&#10;💧 Bir bardak su, iyi bir başlangıç.">${esc(CD.motiv.join("\n"))}</textarea></div>
  <div class="card"><h2>🍫 "Canın ne istiyor?" alternatifleri</h2><p class="small muted">Öneri sekmesinde yapay zekâ yoğunken gösterilen hazır alternatiflere ekleme yapar.</p>
    <div class="tabs">${CRAVES.map(([k, l]) => `<button class="${CRV===k?"on":""}" data-a="crv" data-k="${k}">${l} ${(CD.crave[k] || []).length ? `(${CD.crave[k].length})` : ""}</button>`).join("")}</div>
    <div class="scroll"><table><tr><th>Ad</th><th>Porsiyon</th><th>kcal</th><th>P</th><th>K</th><th>Y</th><th>Neden / nasıl</th><th></th></tr>
    ${(CD.crave[CRV] || []).map((f, i) => `<tr>${[0,1,2,3,4,5,6].map(j => `<td><input data-cc="${i}:${j}" value="${esc(f[j] ?? "")}" ${j>1&&j<6?'type="number" step="0.1" style="width:64px"':'style="min-width:110px"'}></td>`).join("")}<td><button class="ghost sm" data-a="ccDel" data-i="${i}">✕</button></td></tr>`).join("") || `<tr><td colspan="8" class="muted">Ekleme yok</td></tr>`}</table></div>
    <button class="ghost sm" style="margin-top:6px" data-a="ccAdd">+ Alternatif ekle</button></div>
  ${cbarHTML()}`;
}
const cbarHTML = () => `<div class="dirty" id="cbar"${CDIRTY ? "" : ' style="border-color:var(--line)"'}><b>${CDIRTY ? "Kaydedilmemiş değişiklikler var" : "İçerik"}</b><span style="flex:1"></span>${CDIRTY ? `<button class="ghost sm" data-a="cReset">Vazgeç</button>` : ""}<button data-a="cSave" ${BUSY?"disabled":""}>💾 İçeriği kaydet</button></div>`;
// Yazarken sayfayı yeniden çizmeden sadece alttaki çubuğu güncelle (odak ve yazılan değer kaybolmasın)
const cdirty = () => { if (!CDIRTY) { CDIRTY = true; const c = $("#cbar"); if (c) c.outerHTML = cbarHTML(); } };
function foodSearchHTML(hid, mine) {
  if (!BASEF) return `<p class="muted small">Liste yükleniyor…</p>`;
  const q = lc(FQ).trim(); if (!q) return "";
  const res = BASEF.filter(f => lc(f[0]).includes(q)).slice(0, 15);
  return `<table style="margin-top:6px">${res.map(f => { const h = hid.has(lc(f[0])), m = mine.get(lc(f[0])), v = m || f;
    return `<tr style="${h ? "opacity:.5" : ""}"><td>${esc(f[0])}<div class="tiny muted">${esc(v[1])} · ${v[2]} kcal · P ${v[3]} · K ${v[4]} · Y ${v[5]}${m ? " · <b>düzeltildi</b>" : ""}</div></td>
      <td style="text-align:right;white-space:nowrap">${m ? "" : `<button class="ghost sm" data-a="fEdit" data-n="${esc(f[0])}">Düzelt</button>`} <button class="ghost sm" data-a="${h ? "fShow" : "fHide"}" data-n="${esc(f[0])}">${h ? "Göster" : "Gizle"}</button></td></tr>`; }).join("") || `<tr><td class="muted small">Bulunamadı. Aşağıdan "+ Yeni yemek" ile ekleyebilirsin.</td></tr>`}</table>`;
}

/* ---------------- Ayarlar ---------------- */
function settingsHTML() {
  const w = need(); if (w) return w;
  if (!SD) SD = { flags: Object.fromEntries(FLAGS.map(([k]) => [k, (CFG.flags || {})[k] !== false])), defaults: { ...(CFG.defaults || {}) }, maint: { on: false, msg: "", ...(CFG.maint || {}) }, limits: { coach: (CFG.limits || {}).coach || 45 } };
  const d = SD.defaults, inp = (k, l, ph) => `<div><label>${l}</label><input type="number" data-sdf="${k}" value="${esc(d[k] ?? "")}" placeholder="${ph}"></div>`;
  return `<div class="card"><h2>Özellikler</h2><p class="small muted">Kapattığın özellik herkesin uygulamasında gizlenir (veriler silinmez). Uygulama bir sonraki açılışta ya da en geç 10 dakika içinde günceller.</p>
    ${FLAGS.map(([k, l]) => `<label class="row" style="color:var(--ink);font-size:15px;margin:8px 0"><input type="checkbox" data-sfl="${k}" ${SD.flags[k]?"checked":""} style="width:auto"> ${l}</label>`).join("")}</div>
  <div class="card"><h2>Yeni kullanıcıların başlangıç ayarları</h2><p class="small muted">Sadece uygulamayı ilk kez kuran kişiler için geçerli; mevcut kullanıcıların ayarları değişmez. Boş bırakılan uygulamanın kendi varsayılanını kullanır.</p>
    <div class="grid">${inp("reminderMin", "Su hatırlatma aralığı (dk)", "90")}${inp("wakeStart", "Hatırlatma başlangıç saati", "8")}${inp("wakeEnd", "Hatırlatma bitiş saati", "23")}${inp("glass", "Bardak (ml)", "200")}</div></div>
  <div class="card"><h2>💬 Koç</h2><p class="small muted">Kişi başı günlük mesaj sınırı (yapay zekânın ücretsiz kotası için). Gidişat yorumu bu sınıra sayılmaz.</p>
    <div style="max-width:200px"><label>Günlük mesaj</label><input type="number" data-slm="coach" value="${esc(SD.limits.coach)}" min="1" max="500"></div></div>
  <div class="card"><h2>🛠️ Bakım modu</h2><p class="small muted">Açıkken herkesin uygulamasında üstte bir uyarı şeridi görünür. Uygulama çalışmaya devam eder.</p>
    <label class="row" style="color:var(--ink);font-size:15px"><input type="checkbox" data-smt="on" ${SD.maint.on?"checked":""} style="width:auto"> Bakım uyarısını göster</label>
    <label>Mesaj</label><input data-smt="msg" value="${esc(SD.maint.msg)}" maxlength="200" placeholder="Kısa bir güncelleme yapılıyor; bazı özellikler birkaç dakika çalışmayabilir."></div>
  <button data-a="sSave" ${BUSY?"disabled":""}>💾 Ayarları kaydet</button>`;
}
window.SECTIONS = { ann: annHTML, stats: statsHTML2, content: contentHTML, settings: settingsHTML };

/* ---------------- Girdiler ---------------- */
document.addEventListener("input", e => {
  const t = e.target, d = t.dataset;
  if (d.af && d.af !== "target" && d.af !== "push") ANNF[d.af] = t.value;
  else if (d.pm) PM[d.pm] = t.value;
  else if (d.cf) { const [i, j] = d.cf.split(":").map(Number); CD.foods[i][j] = j > 1 ? num(t.value) : t.value; cdirty(); }
  else if (d.cc) { const [i, j] = d.cc.split(":").map(Number); CD.crave[CRV][i][j] = j > 1 && j < 6 ? num(t.value) : t.value; cdirty(); }
  else if (t.id === "cm") { CD.motiv = t.value.split("\n").map(x => x.trim()).filter(Boolean); cdirty(); }
  else if (t.id === "fq") { FQ = t.value; const hid = new Set(CD.hide.map(lc)), mine = new Map(CD.foods.map(f => [lc(f[0]), f])); $("#fqRes").innerHTML = foodSearchHTML(hid, mine); }
  else if (d.sdf) SD.defaults[d.sdf] = t.value === "" ? "" : num(t.value);
  else if (d.smt === "msg") SD.maint.msg = t.value;
  else if (d.slm) SD.limits[d.slm] = num(t.value);
});
document.addEventListener("change", e => {
  const t = e.target, d = t.dataset;
  if (d.af === "target") { ANNF.target = t.value; render(); }
  else if (d.af === "push") ANNF.push = t.checked;
  else if (d.aid) { ANNF.ids = t.checked ? [...new Set([...ANNF.ids, d.aid])] : ANNF.ids.filter(x => x !== d.aid); }
  else if (d.sid) { t.checked ? PICK.add(d.sid) : PICK.delete(d.sid); render(); }
  else if (d.sfl) SD.flags[d.sfl] = t.checked;
  else if (d.smt === "on") SD.maint.on = t.checked;
});

/* ---------------- İşlemler ---------------- */
window.act2 = async (a, b) => {
  const go = () => { render(); return true; };
  switch (a) {
    case "annNew": ANNF = ANN0(); return go();
    case "annEdit": { const x = CFG.ann.find(y => y.id === b.dataset.id); ANNF = { id: x.id, icon: x.icon, title: x.title, body: x.body, target: x.ids.length ? "some" : "all", ids: x.ids.slice(), at: dtl(x.at), until: dtl(x.until), push: x.push }; scrollTo(0, 0); return go(); }
    case "annDel": { if (!arm("ad:" + b.dataset.id)) return true; await call("ann-delete", { id: b.dataset.id }); await loadCfg(); say("Duyuru silindi"); return true; }
    case "annSave": { const f = ANNF; if (!f.title.trim() || !f.body.trim()) { say("Başlık ve metin yaz", 1); return true; }
      if (f.target === "some" && !f.ids.length) { say("En az bir kişi seç", 1); return true; }
      const at = f.at ? new Date(f.at).getTime() : 0, until = f.until ? new Date(f.until).getTime() : 0;
      if (until && until <= (at || Date.now())) { say("Bitiş, başlangıçtan sonra olmalı", 1); return true; }
      BUSY = true; render();
      try { const r = await call("ann-save", { ann: { id: f.id, icon: f.icon, title: f.title, body: f.body, ids: f.target === "some" ? f.ids : [], at, until, push: f.push } });
        BUSY = false; ANNF = ANN0(); await loadCfg();
        say("Duyuru kaydedildi ✓" + (r.sent ? ` ${r.sent.ok} telefona bildirim gitti.` : at > Date.now() ? " Zamanı gelince görünecek." : " Uygulamayı açanlar görecek."));
      } catch (e) { BUSY = false; say(e.message, 1); } return true; }
    case "pushAll": { const title = $("#bpT").value.trim(), body = $("#bpB").value.trim(); if (!title || !body) { say("Başlık ve metin yaz", 1); return true; }
      if (!confirm("Bildirimi açık herkese gönderilsin mi?")) return true;
      BUSY = true; render(); try { const r = await call("pushmany", { ids: [], title, body }); BUSY = false; say(`Bildirim gönderildi ✓ (${r.sent.ok}/${r.sent.total})`); } catch (e) { BUSY = false; say(e.message, 1); } return true; }
    case "statsReload": STATS = null; return go();
    case "open2": SEC = "users"; await openUser(b.dataset.id); return true;
    case "pushPick": { if (!PM.title.trim() || !PM.body.trim()) { say("Başlık ve metin yaz", 1); return true; }
      BUSY = true; render(); try { const r = await call("pushmany", { ids: [...PICK], title: PM.title, body: PM.body }); BUSY = false; say(`Bildirim gönderildi ✓ (${r.sent.ok}/${r.sent.total})`); } catch (e) { BUSY = false; say(e.message, 1); } return true; }
    case "fEdit": { const f = BASEF.find(x => x[0] === b.dataset.n); CD.foods.unshift(f.slice(0, 6)); CDIRTY = true; return go(); }
    case "fHide": CD.hide.push(b.dataset.n); CDIRTY = true; return go();
    case "fShow": CD.hide = CD.hide.filter(x => lc(x) !== lc(b.dataset.n)); CDIRTY = true; return go();
    case "unhide": CD.hide.splice(+b.dataset.i, 1); CDIRTY = true; return go();
    case "cfAdd": CD.foods.unshift(["Yeni yemek", "1 porsiyon", 0, 0, 0, 0]); CDIRTY = true; return go();
    case "cfDel": CD.foods.splice(+b.dataset.i, 1); CDIRTY = true; return go();
    case "crv": CRV = b.dataset.k; return go();
    case "ccAdd": (CD.crave[CRV] = CD.crave[CRV] || []).push(["", "1 porsiyon", 0, 0, 0, 0, ""]); CDIRTY = true; return go();
    case "ccDel": CD.crave[CRV].splice(+b.dataset.i, 1); CDIRTY = true; return go();
    case "cReset": CD = null; CDIRTY = false; return go();
    case "cSave": { const bad = CD.foods.find(f => !String(f[0]).trim() || !(+f[2] >= 0));
      if (bad) { say("Her yemeğin adı ve kalorisi olmalı", 1); return true; }
      for (const k in CD.crave) CD.crave[k] = CD.crave[k].filter(f => String(f[0]).trim());
      BUSY = true; render();
      try { const r = await call("config-save", { cfg: { content: CD } }); CFG = r.cfg; CD = null; CDIRTY = false; BUSY = false; say("İçerik kaydedildi ✓ Uygulamayı açanlara gelecek."); }
      catch (e) { BUSY = false; say(e.message, 1); } return true; }
    case "sSave": { BUSY = true; render();
      try { const r = await call("config-save", { cfg: SD }); CFG = r.cfg; SD = null; BUSY = false; say("Ayarlar kaydedildi ✓"); } catch (e) { BUSY = false; say(e.message, 1); } return true; }
  }
  return false;
};
