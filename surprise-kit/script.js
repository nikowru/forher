// ---- Edit all wording here ----
const CONFIG = {
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
  }
};
const $ = id => document.getElementById(id);
$("title").textContent = CONFIG.heading; $("hint").textContent = CONFIG.hint; $("go").textContent = CONFIG.button;
$("g-title").textContent = CONFIG.gallery.title; $("g-sub").textContent = CONFIG.gallery.sub;
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
  $("seal").classList.add("broken");
  setTimeout(() => scene.classList.add("open"), 350);
  setTimeout(() => scene.classList.add("flapback"), 800);
  setTimeout(() => { scene.classList.add("rise"); $("title").classList.add("fade"); $("hint").classList.add("fade"); }, 1250);
  setTimeout(() => {
    scene.classList.add("read");
    // a long letter scrolls inside the paper; let keyboard users reach it too
    const text = $("text");
    if (text.scrollHeight > text.clientHeight) {
      text.tabIndex = 0; text.setAttribute("role", "region"); text.setAttribute("aria-label", "Letter");
      const more = () => text.classList.toggle("more", text.scrollTop + text.clientHeight < text.scrollHeight - 2);
      text.addEventListener("scroll", more, { passive: true }); more();
    }
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

function slot(c) {
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
  return li; // the player (scene 3) hooks into these buttons next
}

function showTab(id) {
  for (const t of tabs.children) { const on = t.dataset.id === id; t.setAttribute("aria-selected", on); t.tabIndex = on ? 0 : -1; }
  $("panel").setAttribute("aria-labelledby", "tab-" + id);
  shown = id === "all" ? clips : clips.filter(c => c.collection === id);
  grid.replaceChildren(...shown.map((c, i) => { const li = slot(c); li.style.setProperty("--i", i); return li; }));
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

fetch("clips.json")
  .then(r => { if (!r.ok) throw new Error("HTTP " + r.status); return r.json(); })
  .then(data => { clips = data.clips || []; buildTabs(data.collections || []); showTab("all"); })
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
