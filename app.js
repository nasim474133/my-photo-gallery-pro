(() => {
"use strict";
const $ = id => document.getElementById(id);
const PAGE = 60;
const UNDO_MS = 7000;
const PLATFORMS = ["Facebook", "YouTube", "Instagram", "TikTok", "WhatsApp", "Others"];
const CATS = {
  photo: [
    { id: "animals", label: "Animals Pictures", emoji: "🐾" },
    { id: "others", label: "Others Pictures", emoji: "🖼️" }
  ],
  video: [
    { id: "baby", label: "Baby Video", emoji: "👶" },
    { id: "animals", label: "Animals Video", emoji: "🐾" },
    { id: "other1", label: "Other Video 1", emoji: "🎬" },
    { id: "other2", label: "Other Video 2", emoji: "🎞️" }
  ]
};
const KIND_NAME = { photo: "ছবি", video: "ভিডিও" };
const KIND_TITLE = { photo: "All Pictures", video: "All Videos" };
const PK = {
  image: { title: "Prompt to Image", ready: "Image ready", done: "Image ready Done" },
  video: { title: "Prompt to Video", ready: "Video ready", done: "Video ready Done" }
};
const VIEWS = { home: "homeView", kind: "kindView", media: "mediaView", phome: "promptHome", plist: "promptView" };
const ART = {
  photo: '<svg viewBox="0 0 120 90" fill="none"><rect x="8" y="12" width="104" height="66" rx="10" fill="#dbeafe" stroke="#1d4ed8" stroke-width="3"/><circle cx="34" cy="34" r="8" fill="#fbbf24"/><path d="M12 72l30-26 20 16 18-14 28 24z" fill="#60a5fa"/></svg>',
  video: '<svg viewBox="0 0 120 90" fill="none"><rect x="8" y="12" width="104" height="66" rx="10" fill="#dbeafe" stroke="#1d4ed8" stroke-width="3"/><circle cx="60" cy="45" r="19" fill="#1d4ed8"/><path d="M54 36l17 9-17 9z" fill="#fff"/></svg>',
  prompt: '<svg viewBox="0 0 120 90" fill="none"><rect x="8" y="12" width="104" height="66" rx="10" fill="#dbeafe" stroke="#1d4ed8" stroke-width="3"/><path d="M60 24l6 15 15 6-15 6-6 15-6-15-15-6 15-6z" fill="#fbbf24" stroke="#f59e0b" stroke-width="2" stroke-linejoin="round"/></svg>'
};

let db, items = [], prompts = [];
let cur = { v: "home" };
let tab = "all", limit = PAGE, nextSerial = 1;
let urls = [];
const selected = new Set();
const pendingDel = new Set();      // media ids inside the undo window of a permanent delete
const pendingPDel = new Set();     // prompt ids, same
const native = window.native || { isNative: false };

const status = s => { $("status").textContent = s; };
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const isKind = x => x.kind || ((x.type || "").startsWith("video/") ? "video" : "photo");
const catOf = x => x.category || (isKind(x) === "photo" ? "others" : "other1");
const catLabel = (k, id) => (CATS[k].find(c => c.id === id) || CATS[k][0]).label;
const fmtDate = t => {
  const d = new Date(t);
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }) + ", " +
    d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
};
const track = u => { urls.push(u); return u; };
const live = () => items.filter(x => !x.deleted && !pendingDel.has(x.id));
const livePrompts = () => prompts.filter(x => !x.deleted && !pendingPDel.has(x.id));

function fileKind(f) {
  const t = (f.type || "").toLowerCase(), n = (f.name || "").toLowerCase();
  if (t.startsWith("image/")) return "photo";
  if (t.startsWith("video/")) return "video";
  if (/\.(jpe?g|png|webp|gif|heic|heif|bmp|avif)$/.test(n)) return "photo";
  if (/\.(mp4|mov|m4v|webm|mkv|3gp|avi)$/.test(n)) return "video";
  return null;
}
function guessMime(name, kind) {
  const e = ((name || "").split(".").pop() || "").toLowerCase();
  const m = { jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp", gif: "image/gif", heic: "image/heic", heif: "image/heif", avif: "image/avif", bmp: "image/bmp",
    mp4: "video/mp4", m4v: "video/mp4", mov: "video/quicktime", webm: "video/webm", "3gp": "video/3gpp", mkv: "video/x-matroska", avi: "video/x-msvideo" };
  return m[e] || (kind === "video" ? "video/mp4" : "image/jpeg");
}
function parseCaption(text) {
  const tags = [];
  const cap = String(text || "").replace(/#[^\s#]+/g, tag => { if (tags.length < 5) tags.push(tag); return ""; });
  const caption = cap.split(/\r?\n/).map(s => s.replace(/[ \t]+/g, " ").trim()).join("\n").replace(/\n{3,}/g, "\n\n").trim();
  return { caption, hashtags: tags.join(" ") };
}

/* ---------- database ---------- */
function openDB() {
  return new Promise((resolve, reject) => {
    const r = indexedDB.open("MyPhotoGalleryProDB", 2);
    r.onupgradeneeded = () => {
      const d = r.result;
      if (!d.objectStoreNames.contains("media")) {
        const st = d.createObjectStore("media", { keyPath: "id", autoIncrement: true });
        st.createIndex("createdAt", "createdAt");
      }
      if (!d.objectStoreNames.contains("prompts")) d.createObjectStore("prompts", { keyPath: "id", autoIncrement: true });
    };
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}
const req = r => new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
const tx = (name, mode = "readonly") => db.transaction(name, mode).objectStore(name);
const getAll = name => req(tx(name).getAll());
const put = (name, x) => req(tx(name, "readwrite").put(x));
const del = (name, id) => req(tx(name, "readwrite").delete(id));

function normalize(x) {
  if (!x.kind) x.kind = isKind(x);
  if (!x.status) x.status = "unused";
  if (typeof x.deleted !== "boolean") x.deleted = false;
  if (!x.category) x.category = catOf(x);
}
async function reload() {
  items = await getAll("media");
  prompts = await getAll("prompts");
  items.forEach(normalize);
  prompts.forEach(p => { if (!p.status) p.status = "ready"; if (typeof p.deleted !== "boolean") p.deleted = false; });
  nextSerial = items.reduce((m, x) => Math.max(m, x.serial || 0), 0) + 1;
  renderCurrent();
}

/* ---------- navigation ---------- */
function go(s, push = true) {
  cur = s;
  selected.clear();
  tab = "all";
  limit = PAGE;
  $("search").value = "";
  if (push) history.pushState(s, "");
  Object.entries(VIEWS).forEach(([k, id]) => $(id).classList.toggle("hidden", k !== s.v));
  document.querySelectorAll("[data-tab]").forEach(b => b.classList.toggle("active", b.dataset.tab === "all"));
  document.querySelectorAll("[data-ptab]").forEach(b => b.classList.toggle("active", b.dataset.ptab === "all"));
  if (s.v === "media") {
    $("mediaTitle").textContent = catLabel(s.kind, s.cat);
    $("uploadLabel").textContent = s.kind === "photo" ? "＋ ছবি Upload" : "＋ ভিডিও Upload";
    $("mediaInput").accept = s.kind === "photo" ? "image/*" : "video/*";
  }
  if (s.v === "plist") {
    $("promptTitle").textContent = PK[s.pk].title;
    $("ptabReady").textContent = PK[s.pk].ready;
    $("ptabDone").textContent = PK[s.pk].done;
    $("promptText").value = "";
  }
  const navKey = s.v === "home" ? "home" : (s.v === "kind" || s.v === "media") ? s.kind : "prompt";
  document.querySelectorAll("[data-nav]").forEach(b => b.classList.toggle("active", b.dataset.nav === navKey));
  renderCurrent();
  window.scrollTo(0, 0);
}
function renderCurrent() {
  updateDashboard();
  if (cur.v === "kind") renderKind();
  else if (cur.v === "media") renderMedia();
  else if (cur.v === "phome") renderPromptHome();
  else if (cur.v === "plist") renderPrompts();
}

/* ---------- small UI helpers ---------- */
let snackTimer = null;
function snack(msg, undo) {
  const el = $("snack");
  $("snackMsg").textContent = msg;
  el.classList.remove("hidden");
  const b = $("snackUndo");
  b.classList.toggle("hidden", !undo);
  b.onclick = async () => { clearTimeout(snackTimer); el.classList.add("hidden"); if (undo) await undo(); };
  clearTimeout(snackTimer);
  snackTimer = setTimeout(() => el.classList.add("hidden"), UNDO_MS);
}
function askChoice(title, msg, options) {
  return new Promise(resolve => {
    $("mTitle").textContent = title;
    $("mMsg").textContent = msg || "";
    const box = $("mBtns");
    box.innerHTML = "";
    const close = v => { $("modal").classList.add("hidden"); resolve(v); };
    options.forEach(o => {
      const b = document.createElement("button");
      b.textContent = o.label;
      b.onclick = () => close(o.value);
      box.appendChild(b);
    });
    const c = document.createElement("button");
    c.className = "gray";
    c.textContent = "বাতিল";
    c.onclick = () => close(null);
    box.appendChild(c);
    $("modal").classList.remove("hidden");
  });
}
const emptyBox = (art, text) => `<div class="empty">${ART[art]}<div>${text}</div></div>`;
function applyTheme(t) {
  document.documentElement.dataset.theme = t;
  $("themeBtn").textContent = t === "dark" ? "☀️" : "🌙";
  try { localStorage.setItem("mgp_theme", t); } catch {}
}

/* ---------- dashboard & category pages ---------- */
function summary(k) {
  const l = live().filter(x => isKind(x) === k);
  const used = l.filter(x => x.status === "used").length;
  return `${l.length} ${KIND_NAME[k]} · Upload ${l.length - used} · Upload Done ${used}`;
}
function updateDashboard() {
  $("photoSummary").textContent = summary("photo");
  $("videoSummary").textContent = summary("video");
  const pi = livePrompts().filter(p => p.kind === "image").length, pv = livePrompts().filter(p => p.kind === "video").length;
  $("promptSummary").textContent = `Image ${pi} টি · Video ${pv} টি`;
}
function renderKind() {
  const k = cur.kind;
  $("kindTitle").textContent = KIND_TITLE[k];
  $("catGrid").innerHTML = CATS[k].map(c => {
    const l = live().filter(x => isKind(x) === k && catOf(x) === c.id);
    const used = l.filter(x => x.status === "used").length;
    return `<button class="dashcard" data-cat="${c.id}"><span class="emoji">${c.emoji}</span><strong>${esc(c.label)}</strong><span class="sub">${l.length} টি · Upload ${l.length - used} · Upload Done ${used}</span></button>`;
  }).join("");
}

/* ---------- media ---------- */
function matchesTab(x) {
  if (tab === "trash") return !!x.deleted;
  if (x.deleted) return false;
  if (tab === "used") return x.status === "used";
  if (tab === "unused") return x.status !== "used";
  return true;
}
function sorter() {
  const s = $("sort").value;
  if (s === "old") return (a, b) => (a.createdAt || 0) - (b.createdAt || 0) || a.id - b.id;
  if (s === "serial") return (a, b) => (a.serial || a.id) - (b.serial || b.id);
  return (a, b) => (b.createdAt || 0) - (a.createdAt || 0) || b.id - a.id;
}
function visibleMedia() {
  const q = $("search").value.trim().toLowerCase();
  return items
    .filter(x => isKind(x) === cur.kind && catOf(x) === cur.cat && !pendingDel.has(x.id) && matchesTab(x))
    .filter(x => !q || String(x.serial || x.id).includes(q) || (x.name || "").toLowerCase().includes(q))
    .sort(sorter());
}
function renderMedia() {
  urls.forEach(u => URL.revokeObjectURL(u));
  urls = [];
  const kind = cur.kind;
  const all = visibleMedia();
  const shown = all.slice(0, limit);
  $("mediaCount").textContent = `${all.length} টি ${KIND_NAME[kind]}`;
  $("selectedCount").textContent = `${selected.size} নির্বাচিত`;
  const g = $("gallery");
  g.innerHTML = "";
  if (!all.length) {
    g.innerHTML = emptyBox(kind, `এই ফোল্ডারে কোনো ${KIND_NAME[kind]} নেই।<br>উপরের Upload বাটনে চাপ দিয়ে যোগ করো।`);
    return;
  }
  for (const x of shown) {
    const url = track(URL.createObjectURL(x.blob));
    let media;
    if (kind === "video") {
      const th = x.thumb ? track(URL.createObjectURL(x.thumb)) : "";
      media = `<video controls playsinline preload="${th ? "none" : "metadata"}" ${th ? `poster="${th}"` : ""} src="${url}${th ? "" : "#t=0.1"}"></video>`;
    } else {
      media = `<img loading="lazy" src="${url}" alt="${esc(x.name)}">`;
    }
    const captionText = [x.caption || "", x.hashtags || ""].filter(Boolean).join("\n");
    const usedInfo = x.status === "used" && !x.deleted
      ? `<div class="usedinfo">✅ Upload Done${x.usedOn ? " · " + esc(x.usedOn) : ""}${x.usedAt ? " · " + fmtDate(x.usedAt) : ""}</div>` : "";
    const el = document.createElement("article");
    el.className = "item";
    el.innerHTML = `<div class="row" style="justify-content:space-between"><div class="serial">#${x.serial || x.id} · ${KIND_NAME[kind]}</div><label class="small"><input type="checkbox" data-select="${x.id}" ${selected.has(x.id) ? "checked" : ""}> Select</label></div>
  ${media}<div class="muted small" style="overflow-wrap:anywhere;margin-top:7px">${esc(x.name || "")}</div>
  ${usedInfo}
  <div class="caption">${esc(captionText || "এখনো Caption/Hashtag যোগ করা হয়নি।")}</div>
  <textarea class="hidden" data-editor="${x.id}" placeholder="এক লাইনে Caption লিখুন। পরের লাইনে সর্বোচ্চ ৫টি Hashtag দিন।">${esc(captionText)}</textarea>
  <div class="row">
   <button data-act="edit" data-id="${x.id}" class="gray">Edit</button><button data-act="copy" data-id="${x.id}">Copy</button>
   ${x.deleted
      ? `<button data-act="restore" data-id="${x.id}" class="gray">Restore</button><button data-act="purge" data-id="${x.id}" class="red">Delete Forever</button>`
      : `<button data-act="move" data-id="${x.id}" class="gray">${x.status === "used" ? "Upload" : "Upload Done"}</button><button data-act="trash" data-id="${x.id}" class="red">Recycle</button>`}
   <button data-act="share" data-id="${x.id}" class="gray">Facebook Share</button>
  </div>
  <div class="row hidden" data-savebox="${x.id}"><button data-act="save" data-id="${x.id}">Save Caption</button><span class="muted small">Caption ও Hashtag আলাদা লাইনে লিখবে</span></div>`;
    g.appendChild(el);
  }
  if (all.length > shown.length) {
    const more = document.createElement("div");
    more.style.cssText = "grid-column:1/-1;text-align:center";
    more.innerHTML = `<button class="gray" data-more>আরও দেখাও (${all.length - shown.length} টি বাকি)</button>`;
    g.appendChild(more);
  }
}

async function makeVideoThumb(file) {
  return new Promise(res => {
    const url = URL.createObjectURL(file);
    const v = document.createElement("video");
    v.muted = true; v.playsInline = true; v.preload = "metadata";
    let done = false, timer;
    const fin = b => { if (done) return; done = true; clearTimeout(timer); URL.revokeObjectURL(url); res(b || null); };
    timer = setTimeout(() => fin(null), 8000);
    v.onerror = () => fin(null);
    v.onloadedmetadata = () => { try { v.currentTime = Math.min(0.1, (v.duration || 1) / 2); } catch { fin(null); } };
    v.onseeked = () => {
      try {
        const w = Math.min(480, v.videoWidth || 480);
        const h = Math.round(w * (v.videoHeight || 270) / (v.videoWidth || 480));
        const c = document.createElement("canvas");
        c.width = w; c.height = h;
        c.getContext("2d").drawImage(v, 0, 0, w, h);
        c.toBlob(b => fin(b), "image/jpeg", 0.75);
      } catch { fin(null); }
    };
    v.src = url;
  });
}
async function addMedia(file, o) {
  const x = {
    serial: nextSerial++, name: file.name, kind: o.kind, category: o.category, blob: file,
    caption: o.caption || "", hashtags: o.hashtags || "", status: "unused", deleted: false, createdAt: Date.now()
  };
  if (o.kind === "video") { const t = await makeVideoThumb(file); if (t) x.thumb = t; }
  await put("media", x);
}
async function upload(list) {
  const kind = cur.kind;
  const accepted = list.filter(f => fileKind(f) === kind);
  if (!accepted.length) { status("ফাইলের ধরন মেলেনি।"); return; }
  let n = 0;
  for (const f of accepted) {
    status(`সংরক্ষণ হচ্ছে: ${f.name} (${++n}/${accepted.length})`);
    await addMedia(f, { kind, category: cur.cat });
  }
  status(`${accepted.length} টি ${KIND_NAME[kind]} সংরক্ষিত হয়েছে।`);
  await reload();
}
async function shareItems(arr) {
  if (!arr.length) { status("আগে ফাইল নির্বাচন করো।"); return; }
  const files = arr.map(x => new File([x.blob], x.name || `${isKind(x)}-${x.serial || x.id}`, { type: x.blob.type || "application/octet-stream" }));
  const text = arr.map(x => [x.caption || "", x.hashtags || ""].filter(Boolean).join("\n")).filter(Boolean).join("\n\n");
  try {
    if (navigator.share && (!navigator.canShare || navigator.canShare({ files }))) await navigator.share({ title: "My Photo Gallery Pro", text, files });
    else if (arr.length === 1) { const a = document.createElement("a"); a.href = URL.createObjectURL(arr[0].blob); a.download = arr[0].name || "media"; a.click(); status("এই ব্রাউজারে সরাসরি Share সমর্থিত নয়; ফাইল ডাউনলোড হয়েছে।"); }
    else status("এই ব্রাউজারে একসঙ্গে একাধিক ফাইল Share সমর্থিত নয়।");
  } catch (e) { if (e.name !== "AbortError") status("Share করা যায়নি: " + e.message); }
}

async function markDone(list) {
  const where = await askChoice("কোথায় আপলোড করেছ?", "Upload Done চিহ্নিত হবে এবং তারিখ সংরক্ষিত থাকবে।", PLATFORMS.map(p => ({ label: p, value: p })));
  if (!where) return;
  const now = Date.now();
  for (const x of list) { x.status = "used"; x.usedOn = where; x.usedAt = now; await put("media", x); }
  selected.clear();
  await reload();
  status(`${list.length} টি ফাইল Upload Done (${where}) হয়েছে।`);
}
async function markUpload(list) {
  for (const x of list) { x.status = "unused"; delete x.usedOn; delete x.usedAt; await put("media", x); }
  selected.clear();
  await reload();
}
async function trashItems(list) {
  const ids = list.map(x => x.id);
  for (const x of list) { x.deleted = true; x.deletedAt = Date.now(); await put("media", x); }
  selected.clear();
  await reload();
  snack(`${ids.length} টি Recycle Bin এ গেছে`, async () => {
    for (const id of ids) { const x = items.find(y => y.id === id); if (x) { x.deleted = false; delete x.deletedAt; await put("media", x); } }
    await reload();
  });
}
async function restoreItems(list) {
  for (const x of list) { x.deleted = false; delete x.deletedAt; await put("media", x); }
  selected.clear();
  await reload();
}
function purgeItems(list) {
  const ids = list.map(x => x.id);
  ids.forEach(id => { pendingDel.add(id); selected.delete(id); });
  renderCurrent();
  let undone = false;
  const t = setTimeout(async () => {
    if (undone) return;
    for (const id of ids) await del("media", id);
    ids.forEach(id => pendingDel.delete(id));
    await reload();
  }, UNDO_MS);
  snack(`${ids.length} টি স্থায়ীভাবে মুছে যাচ্ছে`, async () => {
    undone = true;
    clearTimeout(t);
    ids.forEach(id => pendingDel.delete(id));
    renderCurrent();
  });
}

/* ---------- prompts ---------- */
function renderPromptHome() {
  const c = k => livePrompts().filter(p => p.kind === k);
  const line = k => { const l = c(k), d = l.filter(p => p.status === "done").length; return `${l.length} টি · ${PK[k].ready} ${l.length - d} · ${PK[k].done} ${d}`; };
  $("pImageSummary").textContent = line("image");
  $("pVideoSummary").textContent = line("video");
}
function pTabMatch(p) {
  if (tab === "trash") return !!p.deleted;
  if (p.deleted) return false;
  if (tab === "ready") return p.status !== "done";
  if (tab === "done") return p.status === "done";
  return true;
}
function renderPrompts() {
  const k = cur.pk;
  const list = prompts.filter(p => p.kind === k && !pendingPDel.has(p.id) && pTabMatch(p)).sort((a, b) => (b.serial || 0) - (a.serial || 0));
  $("promptCount").textContent = `${list.length} টি`;
  const g = $("promptList");
  g.innerHTML = "";
  if (!list.length) { g.innerHTML = emptyBox("prompt", "এই বিভাগে কোনো Prompt নেই।<br>উপরে লিখে Prompt Save করো।"); return; }
  for (const p of list) {
    const done = p.status === "done";
    const el = document.createElement("article");
    el.className = "item";
    el.style.gridColumn = "1/-1";
    el.innerHTML = `<div class="row" style="justify-content:space-between;margin-top:0"><div class="serial" style="margin:0">#${p.serial} · ${PK[k].title}</div><span class="badge ${done ? "done" : ""}">${done ? PK[k].done : PK[k].ready}</span></div>
  <div class="caption">${esc(p.text)}</div>
  <textarea class="hidden" data-peditor="${p.id}">${esc(p.text)}</textarea>
  <div class="row">
   <button data-pact="edit" data-id="${p.id}" class="gray">Edit</button><button data-pact="copy" data-id="${p.id}">Copy</button>
   ${p.deleted
      ? `<button data-pact="restore" data-id="${p.id}" class="gray">Restore</button><button data-pact="purge" data-id="${p.id}" class="red">Delete Forever</button>`
      : `<button data-pact="toggle" data-id="${p.id}" class="gray">${done ? PK[k].ready : PK[k].done}</button><button data-pact="trash" data-id="${p.id}" class="red">Delete</button>`}
  </div>
  <div class="row hidden" data-psavebox="${p.id}"><button data-pact="save" data-id="${p.id}">Save</button></div>`;
    g.appendChild(el);
  }
}
async function addPrompt(kind, text) {
  const serial = prompts.filter(p => p.kind === kind).reduce((m, p) => Math.max(m, p.serial || 0), 0) + 1;
  const p = { kind, serial, text, status: "ready", deleted: false, createdAt: Date.now() };
  const id = await put("prompts", p);
  p.id = id;
  prompts.push(p);
}
function purgePrompts(list) {
  const ids = list.map(p => p.id);
  ids.forEach(id => pendingPDel.add(id));
  renderCurrent();
  let undone = false;
  const t = setTimeout(async () => {
    if (undone) return;
    for (const id of ids) await del("prompts", id);
    ids.forEach(id => pendingPDel.delete(id));
    await reload();
  }, UNDO_MS);
  snack("Prompt স্থায়ীভাবে মুছে যাচ্ছে", async () => {
    undone = true;
    clearTimeout(t);
    ids.forEach(id => pendingPDel.delete(id));
    renderCurrent();
  });
}

/* ---------- files shared in from other apps (ChatGPT, Gemini ...) ---------- */
let incomingBusy = false;
const isLocked = () => !$("lockedScreen").classList.contains("hidden");
async function checkIncoming() {
  if (incomingBusy || !native.isNative || !native.takeIncoming || isLocked() || !db) return;
  incomingBusy = true;
  try {
    const list = await native.takeIncoming();
    for (const p of list) await handleIncoming(p);
  } catch (e) { status("শেয়ার করা ফাইল নিতে সমস্যা: " + e.message); }
  incomingBusy = false;
}
async function handleIncoming(p) {
  const text = (p.text || "").trim();
  const files = (p.files || []).map(f => ({ ...f, kind: fileKind(f) }));
  const media = files.filter(f => f.kind);
  const cleanup = () => files.forEach(f => native.deleteFile && f.path && native.deleteFile(f.path));
  if (!media.length) {
    if (text) {
      const to = await askChoice("শেয়ার করা লেখা এসেছে", "কোথায় সংরক্ষণ করবে?", [
        { label: "Prompt to Image", value: "image" }, { label: "Prompt to Video", value: "video" }]);
      if (to) { await addPrompt(to, text); await reload(); go({ v: "plist", pk: to }); snack("Prompt সংরক্ষিত হয়েছে"); }
    }
    cleanup();
    return;
  }
  const { caption, hashtags } = parseCaption(text);
  let last = null, failed = 0;
  for (const kind of ["photo", "video"]) {
    const group = media.filter(f => f.kind === kind);
    if (!group.length) continue;
    const cat = await askChoice(`${group.length} টি ${KIND_NAME[kind]} এসেছে`, "কোন ফোল্ডারে রাখবে?", CATS[kind].map(c => ({ label: c.label, value: c.id })));
    if (!cat) continue;
    let ok = 0;
    for (const f of group) {
      try {
        status(`শেয়ার করা ফাইল সংরক্ষণ হচ্ছে: ${f.name || ""}`);
        const type = f.type || guessMime(f.name, kind);
        const blob = await native.readFile(f.path, type);
        const file = new File([blob], f.name || `shared-${Date.now()}`, { type });
        await addMedia(file, { kind, category: cat, caption, hashtags });
        ok++;
      } catch { failed++; }
    }
    if (ok) last = { kind, cat, n: ok };
  }
  cleanup();
  await reload();
  if (last) { go({ v: "media", kind: last.kind, cat: last.cat }); status(`${last.n} টি ফাইল সংরক্ষিত হয়েছে${failed ? ` (${failed} টি পড়া যায়নি)` : ""}।`); }
  else if (failed) status(`${failed} টি ফাইল পড়া যায়নি।`);
}

/* ---------- events ---------- */
window.addEventListener("popstate", e => go(e.state || { v: "home" }, false));
window.addEventListener("nativeShare", checkIncoming);
document.addEventListener("visibilitychange", () => { if (!document.hidden) checkIncoming(); });
$("themeBtn").onclick = () => applyTheme(document.documentElement.dataset.theme === "dark" ? "light" : "dark");
document.querySelectorAll("[data-back]").forEach(b => b.onclick = () => history.back());
document.querySelectorAll("[data-nav]").forEach(b => b.onclick = () => {
  const n = b.dataset.nav;
  go(n === "home" ? { v: "home" } : n === "prompt" ? { v: "phome" } : { v: "kind", kind: n });
});
$("homeView").addEventListener("click", e => {
  const b = e.target.closest("[data-open]");
  if (!b) return;
  b.dataset.open === "prompt" ? go({ v: "phome" }) : go({ v: "kind", kind: b.dataset.open });
});
$("catGrid").addEventListener("click", e => { const b = e.target.closest("[data-cat]"); if (b) go({ v: "media", kind: cur.kind, cat: b.dataset.cat }); });
$("promptHome").addEventListener("click", e => { const b = e.target.closest("[data-popen]"); if (b) go({ v: "plist", pk: b.dataset.popen }); });

$("mediaInput").onchange = e => upload([...e.target.files]).finally(() => e.target.value = "");
$("search").oninput = () => { limit = PAGE; renderMedia(); };
try { const s = localStorage.getItem("mgp_sort"); if (s) $("sort").value = s; } catch {}
$("sort").onchange = () => { try { localStorage.setItem("mgp_sort", $("sort").value); } catch {} limit = PAGE; renderMedia(); };
document.querySelectorAll("[data-tab]").forEach(b => b.onclick = () => {
  tab = b.dataset.tab; selected.clear(); limit = PAGE;
  document.querySelectorAll("[data-tab]").forEach(x => x.classList.toggle("active", x === b));
  renderMedia();
});
$("gallery").onclick = async e => {
  if (e.target.closest("[data-more]")) { limit += PAGE; renderMedia(); return; }
  const cb = e.target.closest("[data-select]");
  if (cb) { const id = Number(cb.dataset.select); cb.checked ? selected.add(id) : selected.delete(id); $("selectedCount").textContent = `${selected.size} নির্বাচিত`; return; }
  const b = e.target.closest("button");
  if (!b || !b.dataset.act) return;
  const id = Number(b.dataset.id), x = items.find(y => y.id === id);
  if (!x) return;
  switch (b.dataset.act) {
    case "edit": document.querySelector(`[data-editor="${id}"]`).classList.remove("hidden"); document.querySelector(`[data-savebox="${id}"]`).classList.remove("hidden"); break;
    case "save": {
      const lines = document.querySelector(`[data-editor="${id}"]`).value.split(/\r?\n/);
      x.hashtags = lines.filter(s => s.trim().startsWith("#")).join(" ").split(/\s+/).filter(Boolean).slice(0, 5).join(" ");
      x.caption = lines.filter(s => !s.trim().startsWith("#")).join("\n").trim();
      await put("media", x); await reload(); break;
    }
    case "copy": {
      const value = [x.caption || "", x.hashtags || ""].filter(Boolean).join("\n");
      try { await navigator.clipboard.writeText(value); status("Caption ও Hashtag কপি হয়েছে।"); } catch { status("Clipboard অনুমতি পাওয়া যায়নি।"); }
      break;
    }
    case "move": x.status === "used" ? await markUpload([x]) : await markDone([x]); break;
    case "trash": await trashItems([x]); break;
    case "restore": await restoreItems([x]); break;
    case "purge": purgeItems([x]); break;
    case "share": await shareItems([x]); break;
  }
};
$("selectAll").onclick = () => {
  const all = visibleMedia();
  if (all.length && all.every(x => selected.has(x.id))) all.forEach(x => selected.delete(x.id)); else all.forEach(x => selected.add(x.id));
  renderMedia();
};
const chosen = () => items.filter(x => selected.has(x.id) && isKind(x) === cur.kind && catOf(x) === cur.cat);
async function bulk(action) {
  const list = chosen();
  if (!list.length) { status("আগে ফাইল নির্বাচন করো।"); return; }
  if (action === "used") await markDone(list);
  else if (action === "unused") await markUpload(list);
  else if (action === "trash") await trashItems(list);
  else if (action === "purge") purgeItems(list);
}
$("bulkUsed").onclick = () => bulk("used");
$("bulkUnused").onclick = () => bulk("unused");
$("bulkTrash").onclick = () => bulk("trash");
$("bulkDelete").onclick = () => bulk("purge");
$("shareSelected").onclick = () => shareItems(chosen());

document.querySelectorAll("[data-ptab]").forEach(b => b.onclick = () => {
  tab = b.dataset.ptab;
  document.querySelectorAll("[data-ptab]").forEach(x => x.classList.toggle("active", x === b));
  renderPrompts();
});
$("promptSave").onclick = async () => {
  const t = $("promptText").value.trim();
  if (!t) { status("আগে Prompt লেখো।"); return; }
  await addPrompt(cur.pk, t);
  $("promptText").value = "";
  renderCurrent();
  snack("Prompt সংরক্ষিত হয়েছে");
};
$("promptList").onclick = async e => {
  const b = e.target.closest("button");
  if (!b || !b.dataset.pact) return;
  const id = Number(b.dataset.id), p = prompts.find(y => y.id === id);
  if (!p) return;
  switch (b.dataset.pact) {
    case "edit": document.querySelector(`[data-peditor="${id}"]`).classList.remove("hidden"); document.querySelector(`[data-psavebox="${id}"]`).classList.remove("hidden"); break;
    case "save": { const t = document.querySelector(`[data-peditor="${id}"]`).value.trim(); if (t) { p.text = t; await put("prompts", p); } await reload(); break; }
    case "copy": try { await navigator.clipboard.writeText(p.text); snack("Prompt কপি হয়েছে"); } catch { snack("Clipboard অনুমতি পাওয়া যায়নি।"); } break;
    case "toggle": p.status = p.status === "done" ? "ready" : "done"; await put("prompts", p); await reload(); break;
    case "trash": { p.deleted = true; await put("prompts", p); await reload(); snack("Prompt Delete বিভাগে গেছে", async () => { p.deleted = false; await put("prompts", p); await reload(); }); break; }
    case "restore": p.deleted = false; await put("prompts", p); await reload(); break;
    case "purge": purgePrompts([p]); break;
  }
};

/* ---------- PIN & backup ---------- */
$("setPin").onclick = () => { const p = $("pin").value; if (!/^\d{4,8}$/.test(p)) { alert("৪–৮ সংখ্যার PIN দিন"); return; } localStorage.setItem("mgp_pin", p); $("pin").value = ""; alert("এই ডিভাইসে PIN সেট হয়েছে।"); };
$("lock").onclick = () => { if (!localStorage.getItem("mgp_pin")) { alert("আগে PIN সেট করুন।"); return; } $("lockedScreen").classList.remove("hidden"); };
function unlock() { if ($("screenPin").value === localStorage.getItem("mgp_pin")) { $("lockedScreen").classList.add("hidden"); $("screenPin").value = ""; checkIncoming(); } else alert("ভুল PIN"); }
$("screenUnlock").onclick = unlock;
$("screenPin").addEventListener("keydown", e => { if (e.key === "Enter") unlock(); });
$("unlock").onclick = () => { if ($("unlockPin").value === localStorage.getItem("mgp_pin")) { $("unlockArea").classList.add("hidden"); $("unlockPin").value = ""; } else alert("ভুল PIN"); };
$("export").onclick = async () => {
  const media = (await getAll("media")).map(({ blob, thumb, ...x }) => x);
  const data = { version: 2, exportedAt: new Date().toISOString(), media, prompts: await getAll("prompts") };
  const a = document.createElement("a");
  const u = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }));
  a.href = u; a.download = "gallery-metadata-backup.json"; a.click();
  setTimeout(() => URL.revokeObjectURL(u), 3000);
};

/* ---------- start ---------- */
let startTheme = "light";
try { startTheme = localStorage.getItem("mgp_theme") || (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"); } catch {}
applyTheme(startTheme);
history.replaceState({ v: "home" }, "");
if (native.setBars) native.setBars("#172554", true);
openDB().then(async d => { db = d; await reload(); checkIncoming(); }).catch(e => status("Database চালু হয়নি: " + e.message));
})();
