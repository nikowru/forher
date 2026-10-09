// ---- Edit all wording here ----
const CONFIG = {
  pageTitle: "A little something for you", // the browser tab
  heading: "Would You Like To Open?",
  hint: "A little something for you",
  letter: ["My love,", "Your message goes here: a memory, a promise, something only the two of us would understand.", "Always yours,", "(your name)"],
  button: "Continue",
  // the clips and collection names live in clips.json
  gallery: {
    title: "Our little inventory",
    sub: "Pick a slot to play a memory",
    all: "All",
    empty: "Nothing in here yet.",
    error: "The clips couldn't load. Check the internet connection and refresh the page."
  },
  player: {
    close: "Close", previous: "Previous clip", next: "Next clip",
    unavailable: "This clip can't play here, but you can still watch it on YouTube.",
    openOnYouTube: "Open on YouTube"
  },
  // read aloud by screen readers only
  labels: { theme: "Minimal theme", seal: "Open the envelope", collections: "Collections", letter: "Letter" }
};
const $ = id => document.getElementById(id);
document.title = CONFIG.pageTitle;
$("theme").setAttribute("aria-label", CONFIG.labels.theme); $("seal").setAttribute("aria-label", CONFIG.labels.seal);
$("tabs").setAttribute("aria-label", CONFIG.labels.collections);
$("title").textContent = CONFIG.heading; $("hint").textContent = CONFIG.hint; $("go").textContent = CONFIG.button;
$("g-title").textContent = CONFIG.gallery.title; $("g-sub").textContent = CONFIG.gallery.sub;
$("p-close").setAttribute("aria-label", CONFIG.player.close);
$("p-prev").setAttribute("aria-label", CONFIG.player.previous); $("p-next").setAttribute("aria-label", CONFIG.player.next);
CONFIG.letter.forEach(t => { const p = document.createElement("p"); p.textContent = t; $("text").appendChild(p); });

// drifting dust and petals
const air = $("air");
for (let i = 0; i < 18; i++) {
  const s = document.createElement("span"), size = 3 + Math.random() * 5, petal = i % 4 === 0;
  if (petal) { s.className = "pt"; s.style.width = s.style.height = size * 2 + "px"; } else { s.style.width = s.style.height = size / 1.6 + "px"; }
  s.style.left = Math.random() * 100 + "vw"; s.style.setProperty("--dx", (Math.random() * 16 - 8) + "vw");
  s.style.animationDuration = 16 + Math.random() * 14 + "s"; s.style.animationDelay = -Math.random() * 30 + "s";
  air.appendChild(s);
}

// opening sequence
const scene = $("scene"); let opened = false;
$("seal").addEventListener("click", () => {
  if (opened) return; opened = true;
  $("seal").classList.add("broken"); $("seal").disabled = true; // gone from view, so gone from the Tab order too
  setTimeout(() => scene.classList.add("open"), 350);
  setTimeout(() => scene.classList.add("flapback"), 800);
  setTimeout(() => { scene.classList.add("rise"); $("title").classList.add("fade"); $("hint").classList.add("fade"); }, 1250);
  setTimeout(() => {
    scene.classList.add("read");
    // a long letter scrolls inside the paper; let keyboard users reach it too
    const text = $("text");
    if (text.scrollHeight > text.clientHeight) {
      text.tabIndex = 0; text.setAttribute("role", "region"); text.setAttribute("aria-label", CONFIG.labels.letter);
      const more = () => text.classList.toggle("more", text.scrollTop + text.clientHeight < text.scrollHeight - 2);
      text.addEventListener("scroll", more, { passive: true }); more();
    }
    // the letter only becomes reachable once it can be read; keyboard focus lands on it
    $("letter").inert = false;
    (text.tabIndex === 0 ? text : $("go")).focus({ preventScroll: true });
  }, 2500);
});
// Continue: the envelope fades and the inventory is unveiled
const gallery = $("gallery");
$("go").addEventListener("click", () => {
  scene.classList.add("gone");
  $("stage").inert = true;
  setTimeout(() => {
    gallery.hidden = false; void gallery.offsetWidth; gallery.classList.add("show");
    $("g-title").focus({ preventScroll: true });
    setTimeout(() => gallery.classList.add("settled"), 2000); // drop the reveal mask; later tab switches ripple without the wait
  }, 700);
});

// ---- scene 2: clip inventory (all clip data comes from clips.json) ----
const tabs = $("tabs"), grid = $("grid"), msg = $("g-msg");
let clips = [], shown = [];
const thumb = id => "https://img.youtube.com/vi/" + encodeURIComponent(id) + "/hqdefault.jpg";
const niceDate = d => { const t = new Date(d + "T00:00:00"); return isNaN(t) ? d : t.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" }); };

function slot(c, i) {
  const li = document.createElement("li"), b = document.createElement("button"), frame = document.createElement("span"),
    img = document.createElement("img"), name = document.createElement("span"), when = document.createElement("time");
  b.type = "button"; b.className = "slot";
  img.className = "thumb"; img.alt = ""; img.loading = "lazy"; img.decoding = "async"; img.width = 480; img.height = 360;
  // YouTube answers unknown ids with a 120px grey stand-in; treat that like a missing thumbnail
  img.addEventListener("load", () => { if (img.naturalWidth <= 120) b.classList.add("no-thumb"); });
  img.addEventListener("error", () => b.classList.add("no-thumb"));
  img.src = thumb(c.youtubeId);
  name.className = "name"; name.textContent = c.title;
  when.className = "when"; when.dateTime = c.date; when.textContent = niceDate(c.date);
  frame.className = "frame"; frame.append(img);
  b.append(frame, name, when); li.append(b);
  b.addEventListener("click", () => openClip(i));
  return li;
}

function showTab(id) {
  for (const t of tabs.children) { const on = t.dataset.id === id; t.setAttribute("aria-selected", on); t.tabIndex = on ? 0 : -1; }
  $("panel").setAttribute("aria-labelledby", "tab-" + id);
  shown = id === "all" ? clips : clips.filter(c => c.collection === id);
  grid.replaceChildren(...shown.map((c, i) => { const li = slot(c, i); li.style.setProperty("--i", i); return li; }));
  msg.textContent = shown.length ? "" : CONFIG.gallery.empty;
}

function buildTabs(collections) {
  for (const c of [{ id: "all", title: CONFIG.gallery.all }, ...collections]) {
    const t = document.createElement("button");
    t.type = "button"; t.setAttribute("role", "tab"); t.id = "tab-" + c.id; t.dataset.id = c.id; t.className = "tab";
    t.setAttribute("aria-controls", "panel");
    if (c.icon) { const i = document.createElement("span"); i.setAttribute("aria-hidden", "true"); i.textContent = c.icon + " "; t.append(i); }
    t.append(c.title);
    t.addEventListener("click", () => showTab(c.id));
    tabs.append(t);
  }
  // arrow keys move between tabs (WAI-ARIA tabs pattern)
  tabs.addEventListener("keydown", e => {
    const list = [...tabs.children], i = list.indexOf(document.activeElement);
    const next = { ArrowRight: i + 1, ArrowLeft: i - 1, Home: 0, End: list.length - 1 }[e.key];
    if (i < 0 || next === undefined) return;
    e.preventDefault();
    const t = list[(next + list.length) % list.length]; t.focus(); t.click();
  });
}

// ---- scene 3: clip player (the YouTube player loads only when a slot is clicked) ----
// <dialog> gives us Esc to close, a focus trap and an inert page behind it for free.
const player = $("player"), video = $("p-video");
let yt = null, ytApi = null, current = -1, openId = 0;

function loadYouTubeApi() {
  ytApi ||= new Promise((ok, fail) => {
    window.onYouTubeIframeAPIReady = ok;
    const s = document.createElement("script");
    s.src = "https://www.youtube.com/iframe_api"; s.onerror = fail;
    document.head.append(s);
  }).catch(err => { ytApi = null; throw err; }); // allow a retry on the next click
  return ytApi;
}

function dropPlayer() { if (yt) { yt.destroy(); yt = null; } }

// FR-8: when a video can't play here, show its caption (already under the video) and a link to YouTube
function fallback(c) {
  dropPlayer();
  const box = document.createElement("div"), p = document.createElement("p"), a = document.createElement("a");
  box.className = "p-fallback"; p.textContent = CONFIG.player.unavailable;
  a.href = "https://www.youtube.com/watch?v=" + encodeURIComponent(c.youtubeId) + (c.startSeconds ? "&t=" + c.startSeconds + "s" : "");
  a.target = "_blank"; a.rel = "noopener"; a.textContent = CONFIG.player.openOnYouTube;
  box.append(p, a); video.replaceChildren(box);
}

function openClip(i) {
  if (!shown.length) return;
  current = (i + shown.length) % shown.length;
  const c = shown[current], id = ++openId, live = () => id === openId && player.open;
  dropPlayer();
  $("p-title").textContent = c.title; $("p-caption").textContent = c.caption || "";
  $("p-count").textContent = (current + 1) + " / " + shown.length;
  $("p-nav").hidden = shown.length < 2;
  const mount = document.createElement("div"); video.replaceChildren(mount);
  if (!player.open) { player.showModal(); $("p-close").focus(); }
  if (!/^[\w-]{11}$/.test(c.youtubeId || "")) return fallback(c);
  // YouTube blocked or very slow: don't leave her looking at a black box
  const timer = setTimeout(() => { if (live() && !yt) fallback(c); }, 10000);
  loadYouTubeApi().then(() => {
    clearTimeout(timer);
    if (!live() || !mount.isConnected) return; // closed, switched clip, or already fell back
    yt = new YT.Player(mount, {
      host: "https://www.youtube-nocookie.com", videoId: c.youtubeId, width: "100%", height: "100%",
      playerVars: { autoplay: 1, start: c.startSeconds || 0, rel: 0, playsinline: 1 },
      events: { onError: () => setTimeout(() => { if (id === openId) fallback(c); }) } // bad id, removed, or embedding off
    });
  }).catch(() => { clearTimeout(timer); if (live()) fallback(c); });
}

$("p-prev").addEventListener("click", () => openClip(current - 1));
$("p-next").addEventListener("click", () => openClip(current + 1));
player.addEventListener("keydown", e => {
  if (shown.length < 2 || e.altKey || e.ctrlKey || e.metaKey) return;
  if (e.key === "ArrowLeft") { e.preventDefault(); openClip(current - 1); }
  if (e.key === "ArrowRight") { e.preventDefault(); openClip(current + 1); }
});
$("p-close").addEventListener("click", () => player.close());
player.addEventListener("click", e => { if (e.target === player) player.close(); }); // click outside the box
player.addEventListener("close", () => {
  openId++; dropPlayer();
  video.replaceChildren(); // never leave a player running in the background
  const s = grid.querySelectorAll(".slot")[current]; if (s) s.focus(); // back to the clip she was on
});

// friendly warnings in the console (F12) while adding clips; the page still shows what it can
function checkClips(data) {
  const cols = new Set((data.collections || []).map(c => c.id)), ids = new Set();
  for (const c of data.clips || []) {
    const w = msg => console.warn("clips.json, clip " + (c.id || "(no id)") + ": " + msg);
    if (ids.has(c.id)) w("duplicate id"); ids.add(c.id);
    if (!/^[\w-]{11}$/.test(c.youtubeId || "")) w("youtubeId should be the 11-character id from the YouTube link");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(c.date || "")) w("date should look like 2023-05-14");
    if (!cols.has(c.collection)) w('collection "' + c.collection + '" is not listed in "collections"');
    if (!c.title || !c.caption) w("missing title or caption");
  }
}

fetch("clips.json")
  .then(r => { if (!r.ok) throw new Error("HTTP " + r.status); return r.json(); })
  .then(data => { checkClips(data); clips = data.clips || []; buildTabs(data.collections || []); showTab("all"); })
  .catch(err => {
    console.error("clips.json could not be loaded. Open the site through a local server (see README).", err);
    msg.textContent = CONFIG.gallery.error;
  });

// theme toggle (colorful <-> minimal neutral); with no saved choice the CSS follows the system setting
const root = document.documentElement, tbtn = $("theme"), sysDark = matchMedia("(prefers-color-scheme: dark)");
try { const t = localStorage.getItem("theme"); if (t === "light" || t === "dark") root.dataset.theme = t; } catch (e) {}
const isDark = () => root.dataset.theme ? root.dataset.theme === "dark" : sysDark.matches;
function paint() { const d = isDark(); tbtn.textContent = d ? "\u2600" : "\u263E"; tbtn.setAttribute("aria-pressed", d); }
tbtn.addEventListener("click", () => {
  root.dataset.theme = isDark() ? "light" : "dark";
  try { localStorage.setItem("theme", root.dataset.theme); } catch (e) {}
  paint();
});
sysDark.addEventListener("change", paint);
paint();
