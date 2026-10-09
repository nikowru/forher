// ---- Google Apps Script backend (optional; see backend/SETUP.md) ----
// Paste your deployed web app URL here once you've followed backend/SETUP.md.
// Leave blank to skip remote saving entirely; sign-up/reply still save locally.
const APPS_SCRIPT_URL = "";
// Paste the published "Memories" tab CSV URL here (backend/SETUP.md step 5).
// Leave blank to use the clips.json placeholders in this repo instead.
const MEMORIES_CSV_URL = "";

// ---- "No" button feel (sign-up card, final step) - tweak these to change how it dodges ----
// Units: px, seconds (per-second values are px/s or px/s^2), ms where named. Sensible range in [].
const NO_RADIUS = 160;           // [100-240] pointer closer than this (measured to the button's EDGE) makes No flee
const NO_RADIUS_SPEED = 0.35;    // [0-0.6] a fast pointer triggers the flee earlier: extra radius = this x pointer speed (px/s)
const NO_RADIUS_BONUS_MAX = 600; // [200-900] cap on that extra radius (px)
const NO_LOOKAHEAD_MS = 110;     // [0-200] No flees from where the pointer will be this many ms from now (its current heading), not just where it is
const NO_FLEE_ACCEL = 11000;     // [4000-16000] push strength at point-blank; fades linearly to 0 at NO_RADIUS
const NO_CURVE = 0.9;            // [0-1.5] sideways (perpendicular) push relative to the straight-away push. 0 = flees in a line, ~1 = swirls around the cursor
const NO_POINTER_GAIN = 1.6;     // [0-3] extra push per 1000px/s of pointer speed, so a fast cursor can't catch it
const NO_POINTER_GAIN_MAX = 3;   // [1-5] cap on that push multiplier
const NO_BASE_SPEED = 650;       // [400-1000] top speed (px/s) against a slow or still pointer
const NO_SPEED_FOLLOW = 0.9;     // [0-1.5] top speed also rises by this x the pointer's own speed
const NO_MAX_SPEED = 4200;       // [1500-4500] HARD speed ceiling (px/s): velocity is clamped to this every frame, never exceeded
const NO_DAMPING = 3.2;          // [1.5-6] friction per second: higher = stops sooner / feels heavier, lower = floatier
const NO_MARGIN = 16;            // [8-40] safe gap kept between the button and the viewport edges
const NO_WALL_RANGE = 90;        // [50-140] distance from an edge where the soft wall push starts
const NO_WALL_ACCEL = 5000;      // [2000-9000] strength of that wall push (it also steers the button along the edge)
const NO_WALL_SLIDE = 0.9;       // [0-1.5] sideways slide along a wall, relative to the wall push
const NO_YES_CLEARANCE = 18;     // [8-40] gap always kept between No and the Yes button
const NO_CORNER_ZONE = 110;      // [70-160] within this of two edges at once counts as "in a corner"
const NO_CORNER_TRIGGER = 110;   // [60-150] cursor this close (to the button's edge) to a cornered / pinned No sets off the glide-away
const NO_GLIDE_MS = 600;         // [400-900] duration of the smooth curved glide to a far part of the screen
const NO_DASH_MS = 340;          // [200-500] duration of the quick curved dash when a tap/click lands on No
const NO_TOUCH_SLOP = 24;        // [0-40] extra px around No that still count as "on it" for touch/click pre-emption
const NO_SWAY_AMP = 5;           // [0-10] idle sway size (px); 0 turns idle sway off
const NO_SWAY_PERIOD_MS = 4200;  // [2500-7000] time of one idle sway cycle
const NO_IDLE_PAUSE_MS = 5000;   // [2000-15000] with no pointer/key activity this long the animation loop stops (saves battery)
const NO_FADE_MS = 160;          // [100-300] reduced-motion only: fade out, and again fade in, at the new spot

// ---- Sign-up gate (Phase 3 P4): decided before anything else runs, so a returning
// visitor never sees #signup flash before it's hidden. ?reset=1 clears the saved
// answers (for testing); otherwise, if a valid saved sign-up already exists, #signup
// is hidden immediately and #stage (today's envelope scene) is what she sees first,
// exactly as it behaves with no sign-up at all.
const SIGNUP_KEY = "surprise-signup";
if (/(?:^|[?&])reset=1(?:&|$)/.test(location.search)) {
  try { localStorage.removeItem(SIGNUP_KEY); } catch (e) {}
}
function readSignup() {
  try {
    const raw = localStorage.getItem(SIGNUP_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    return data && data.yes ? data : null;
  } catch (e) { return null; }
}
const savedSignup = readSignup();
if (savedSignup) document.getElementById("signup").hidden = true;

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
  labels: { theme: "Minimal theme", seal: "Open the envelope", collections: "Collections", letter: "Letter" },
  // sign-up card wording (Phase 3 section 4.2); edit freely, same CONFIG convention as the rest of the page
  signup: {
    title: "A little something for you",
    usernameLabel: "What should I call you?",
    usernamePlaceholder: "baby ko",
    moodLabel: "Are you happy?",
    iconLabel: "Choose an icon",
    musicLabel: "Choose your music",
    finalQuestion: "Will you be my baby forever?",
    yes: "Yes",
    no: "No"
  },
  // intro / dim-and-unfold beat (Phase 3 P5), shown once right after a first-time sign-up
  intro: {
    heading: "uy may love note!"
  },
  // letter reply + inbox wording (Phase 3 P6); edit freely, same CONFIG convention
  reply: {
    label: "Write back?",
    submit: "submit sa baby ko",
    nudge: "Say anything, or leave it blank — I'll still see this.",
    inboxTitle: "What you wrote"
  }
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
// sign-up card wording
$("su-title").textContent = CONFIG.signup.title;
document.querySelector('label[for="su-username"]').textContent = CONFIG.signup.usernameLabel;
$("su-username").placeholder = CONFIG.signup.usernamePlaceholder;
$("su-mood-label").textContent = CONFIG.signup.moodLabel;
$("su-icon-label").textContent = CONFIG.signup.iconLabel;
$("su-music-label").textContent = CONFIG.signup.musicLabel;
$("su-final-q").textContent = CONFIG.signup.finalQuestion;
$("su-yes").textContent = CONFIG.signup.yes;
$("su-no").textContent = CONFIG.signup.no;
// intro heading + letter reply + inbox wording (static text only, same convention as above)
$("intro-msg").textContent = CONFIG.intro.heading;
document.querySelector('label[for="reply-text"]').textContent = CONFIG.reply.label;
$("reply-submit").textContent = CONFIG.reply.submit;
$("reply-nudge").textContent = CONFIG.reply.nudge;
$("inbox-title").textContent = CONFIG.reply.inboxTitle;

// ---- sign-up card logic (Phase 3 P2-P4): username / mood / icon / music / Yes-No ----
// All three arrays below are the single source of truth for their step; nothing here
// is duplicated or hard-coded into the HTML.
const MOODS = [
  { id: "sad", emoji: "\u{1F622}", label: "Sad" },
  { id: "down", emoji: "\u{1F641}", label: "A little down" },
  { id: "okay", emoji: "\u{1F610}", label: "Okay" },
  { id: "happy", emoji: "\u{1F642}", label: "Happy" },
  { id: "very-happy", emoji: "\u{1F604}", label: "Very happy" }
];

// Placeholder icons for "choose an icon". SWAP REAL FILES IN HERE: replace the files
// at these paths under /assets/icons/ (or change `file`/`label` to point at your own
// images) - keep the {id, label, file} shape, since `id` is what gets saved/sent.
const ICONS = [
  { id: "icon-1", label: "One", file: "assets/icons/icon-1.svg" },
  { id: "icon-2", label: "Two", file: "assets/icons/icon-2.svg" },
  { id: "icon-3", label: "Three", file: "assets/icons/icon-3.svg" },
  { id: "icon-4", label: "Four", file: "assets/icons/icon-4.svg" },
  { id: "icon-5", label: "Five", file: "assets/icons/icon-5.svg" }
];

// Placeholder tracks for "choose your music". SWAP REAL FILES IN HERE: drop your own
// audio files under /assets/music/ (mp3, ogg or wav all work) and update `file` below -
// the placeholders here are real (silent) files so a normal run never 404s; any missing/
// broken file is still handled gracefully regardless, see startMusic() below.
const MUSIC = [
  { id: "track-1", title: "Track 1 (placeholder)", file: "assets/music/track-1.wav" },
  { id: "track-2", title: "Track 2 (placeholder)", file: "assets/music/track-2.wav" },
  { id: "track-3", title: "Track 3 (placeholder)", file: "assets/music/track-3.wav" }
];

let selectedMood = null, selectedIconId = null, selectedTrackId = null;

function renderMoods() {
  const box = $("su-moods");
  box.replaceChildren(...MOODS.map(m => {
    const b = document.createElement("button");
    b.type = "button"; b.className = "su-mood"; b.dataset.id = m.id;
    b.setAttribute("aria-pressed", "false"); b.setAttribute("aria-label", m.label);
    b.textContent = m.emoji;
    return b;
  }));
  // single-select, radio-like: plain buttons, so Tab/Enter/Space already work with no extra keyboard code
  box.addEventListener("click", e => {
    const b = e.target.closest(".su-mood"); if (!b) return;
    for (const o of box.children) o.setAttribute("aria-pressed", "false");
    b.setAttribute("aria-pressed", "true"); selectedMood = b.dataset.id;
  });
}

function renderIcons() {
  const box = $("su-icons");
  box.replaceChildren(...ICONS.map(ic => {
    const b = document.createElement("button"), img = document.createElement("img");
    b.type = "button"; b.className = "su-icon"; b.dataset.id = ic.id;
    b.setAttribute("aria-pressed", "false"); b.setAttribute("aria-label", ic.label);
    img.src = ic.file; img.alt = ""; img.loading = "lazy"; img.width = 32; img.height = 32;
    b.append(img);
    return b;
  }));
  box.addEventListener("click", e => {
    const b = e.target.closest(".su-icon"); if (!b) return;
    for (const o of box.children) o.setAttribute("aria-pressed", "false");
    b.setAttribute("aria-pressed", "true"); selectedIconId = b.dataset.id;
  });
}

function renderTracks() {
  const list = $("su-tracks");
  list.replaceChildren(...MUSIC.map(tr => {
    const li = document.createElement("li"), b = document.createElement("button");
    b.type = "button"; b.className = "su-track"; b.dataset.id = tr.id;
    b.setAttribute("aria-selected", "false"); b.textContent = tr.title;
    li.append(b);
    return li;
  }));
  list.addEventListener("click", e => {
    const b = e.target.closest(".su-track"); if (!b) return;
    for (const o of list.querySelectorAll(".su-track")) o.setAttribute("aria-selected", "false");
    b.setAttribute("aria-selected", "true"); selectedTrackId = b.dataset.id;
  });
}

renderMoods(); renderIcons(); renderTracks();

// ---- final step: "Will you be my baby forever?" - #su-no dodges, #su-yes always works ----
const noBtn = $("su-no"), yesBtn = $("su-yes"), signupSection = $("signup");
const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)");

// How it works (tunables are at the top of this file):
// - #su-no stays an ordinary in-flow flex item, so the layout never changes. Once it moves, ONLY
//   `transform: translate3d()` changes (plus opacity under reduced motion). Its position is kept in
//   viewport coordinates (s.x/s.y); the transform is that minus where the button naturally sits.
// - A requestAnimationFrame loop integrates position + velocity: pointer repulsion (with a
//   perpendicular "orbit" part, scaled by pointer speed) + soft wall push + damping.
// - Cornered -> a smooth curved glide (Bezier + easing) to a far part of the screen; never a teleport.
// - The loop stops itself when nothing is happening and restarts on the next relevant event.
const noS = {
  engaged: false, x: 0, y: 0, vx: 0, vy: 0, orbit: 1,
  mode: "free",            // "free" (physics) | "glide" (curved traverse) | "fade" (reduced motion)
  g: null, f: null,        // active glide / fade descriptors
  tx: 0, ty: 0,            // translate currently applied (includes idle sway)
  env: 0,                  // idle-sway envelope 0..1
  raf: 0, last: 0, lastActive: 0, lastMoveStart: -1e9, cooldownUntil: 0, pinnedMs: 0, armed: true
};
const ptr = { active: false, x: 0, y: 0, t: 0, speed: 0, vx: 0, vy: 0 };
const clampN = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const easeInOut = u => u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2;

// the button's natural spot (transform removed), the viewport arena it may roam, and things to keep clear of
function noMeasure() {
  const w = noBtn.offsetWidth, h = noBtn.offsetHeight, r = noBtn.getBoundingClientRect();
  const vw = document.documentElement.clientWidth, vh = document.documentElement.clientHeight;
  const minX = NO_MARGIN, minY = NO_MARGIN;
  const rects = [];
  const add = (el, pad) => {
    if (!el) return; // #theme / #mute live outside #signup but are fixed on top of it, so they count too
    const b = el.getBoundingClientRect();
    if (b.width && b.height) rects.push({ l: b.left - pad, t: b.top - pad, r: b.right + pad, b: b.bottom + pad });
  };
  add(yesBtn, NO_YES_CLEARANCE); add($("theme"), 8); add($("mute"), 8);
  const o = { w, h, homeL: r.left - noS.tx, homeT: r.top - noS.ty, minX, minY,
    maxX: Math.max(minX, vw - NO_MARGIN - w), maxY: Math.max(minY, vh - NO_MARGIN - h), vw, vh, rects };
  // "near a corner" must stay meaningful on a narrow screen: never more than ~30% of the roaming width/height
  o.zx = Math.min(NO_CORNER_ZONE, (o.maxX - o.minX) * 0.3); o.zy = Math.min(NO_CORNER_ZONE, (o.maxY - o.minY) * 0.3);
  return o;
}
// distance from point (px,py) to the rectangle (x,y,w,h); 0 inside
const rectDist = (px, py, x, y, w, h) => Math.hypot(Math.max(x - px, 0, px - (x + w)), Math.max(y - py, 0, py - (y + h)));
// gap between the button at (x,y) and the nearest obstacle rect (0 if touching/overlapping)
const noObstacleGap = (m, x, y) => m.rects.reduce((g, q) => Math.min(g, Math.hypot(Math.max(q.l - (x + m.w), 0, x - q.r), Math.max(q.t - (y + m.h), 0, y - q.b))), Infinity);
const noHits = (m, x, y) => m.rects.some(q => x < q.r && x + m.w > q.l && y < q.b && y + m.h > q.t);

// smoothly-reached target spots (all chosen inside the arena and clear of Yes - never a blind jump)
function pickFar(m, px, py) {
  let best = null, bestScore = -Infinity;
  for (let i = 0; i < 5; i++) for (let j = 0; j < 4; j++) {
    const x = m.minX + (m.maxX - m.minX) * i / 4, y = m.minY + (m.maxY - m.minY) * j / 3;
    if (noHits(m, x, y)) continue;
    const cornerish = Math.min(x - m.minX, m.maxX - x) < m.zx && Math.min(y - m.minY, m.maxY - y) < m.zy;
    if (cornerish || Math.hypot(x - noS.x, y - noS.y) < 150) continue;
    // far from the pointer AND in the direction away from it (never through/toward it)
    const ux = noS.x + m.w / 2 - px, uy = noS.y + m.h / 2 - py, vx = x - noS.x, vy = y - noS.y;
    const cos = (ux * vx + uy * vy) / ((Math.hypot(ux, uy) * Math.hypot(vx, vy)) || 1);
    const score = Math.hypot(x + m.w / 2 - px, y + m.h / 2 - py) + 500 * cos;
    if (score > bestScore) { bestScore = score; best = { x, y }; }
  }
  return best || { x: clampN((m.minX + m.maxX) / 2, m.minX, m.maxX), y: clampN((m.minY + m.maxY) / 2, m.minY, m.maxY) };
}
function pickNear(m, px, py) {
  let best = null, bestScore = -Infinity;
  const cx = noS.x + m.w / 2, cy = noS.y + m.h / 2;
  for (const rad of [200, 290]) for (let k = 0; k < 24; k++) {
    const a = k / 24 * Math.PI * 2, x = cx + Math.cos(a) * rad - m.w / 2, y = cy + Math.sin(a) * rad - m.h / 2;
    if (x < m.minX || x > m.maxX || y < m.minY || y > m.maxY || noHits(m, x, y)) continue;
    const wall = Math.min(x - m.minX, m.maxX - x, y - m.minY, m.maxY - y);
    const score = Math.hypot(x + m.w / 2 - px, y + m.h / 2 - py) + 0.5 * Math.min(wall, 150) + Math.random() * 40;
    if (score > bestScore) { bestScore = score; best = { x, y }; }
  }
  return best || pickFar(m, px, py);
}

// every sensible far-away spot (grid over the arena, not in a corner, clear of Yes etc.), for noStartMove to rank
function noFarCandidates(m) {
  const out = [];
  for (let i = 0; i < 7; i++) for (let j = 0; j < 6; j++) {
    const x = m.minX + (m.maxX - m.minX) * i / 6, y = m.minY + (m.maxY - m.minY) * j / 5;
    if (noHits(m, x, y) || Math.hypot(x - noS.x, y - noS.y) < 120) continue;
    // corner spots are allowed (a narrow screen is all "corner") but ranked lower in noStartMove
    out.push({ x, y, corner: Math.min(x - m.minX, m.maxX - x) < m.zx && Math.min(y - m.minY, m.maxY - y) < m.zy });
  }
  return out.length ? out : [pickFar(m, ptr.x, ptr.y)];
}

function noStartMove(kind, px, py) {
  if (signupSection.hidden) return;
  const m = noMeasure(), s = noS, now = performance.now();
  if (!s.engaged) { s.x = m.homeL; s.y = m.homeT; s.relaxCheck = true; }
  s.engaged = true; s.lastMoveStart = now; s.vx = s.vy = 0;
  if (reduceMotion.matches) {
    const t = pickNear(m, px, py);
    s.mode = "fade"; s.f = { t0: now, x: t.x, y: t.y, moved: false };
  } else {
    // Choose the target AND the arc's bend side together by simulating the path: the winner keeps the
    // button's rect farthest from the pointer all the way along, so a glide never swings into the pointer.
    const cands = kind === "far" ? noFarCandidates(m) : [pickNear(m, px, py)];
    let best = null, bestScore = -Infinity;
    for (const t of cands) {
      const len = Math.hypot(t.x - s.x, t.y - s.y);
      if (len < 4) continue;
      for (const sg of [s.orbit, -s.orbit]) {
        const bend = len * 0.35 * sg; // control point = midpoint pushed sideways (kept in the arena, so the whole Bezier is too)
        const cx1 = clampN((s.x + t.x) / 2 - (t.y - s.y) / len * bend, m.minX, m.maxX);
        const cy1 = clampN((s.y + t.y) / 2 + (t.x - s.x) / len * bend, m.minY, m.maxY);
        let pathMin = Infinity;
        for (let i = 1; i <= 10; i++) {
          const u = i / 10, e = 1 - Math.pow(1 - u, 3), q = 1 - e;
          const bx = q * q * s.x + 2 * q * e * cx1 + e * e * t.x, by = q * q * s.y + 2 * q * e * cy1 + e * e * t.y;
          pathMin = Math.min(pathMin, rectDist(px, py, bx, by, m.w, m.h));
        }
        const score = pathMin + 0.3 * rectDist(px, py, t.x, t.y, m.w, m.h) + 0.5 * Math.min(120, t.x - m.minX, m.maxX - t.x, t.y - m.minY, m.maxY - t.y) - (t.corner ? 150 : 0); // prefer far-from-pointer, open spots, not corners
        if (score > bestScore) { bestScore = score; best = { t, c1x: cx1, c1y: cy1 }; }
      }
    }
    if (!best) { noWake(); return; }
    const t = best.t, c1x = best.c1x, c1y = best.c1y;
    s.mode = "glide";
    s.g = { kind, t0: now, ms: kind === "dash" ? NO_DASH_MS : NO_GLIDE_MS, x0: s.x, y0: s.y, x1: c1x, y1: c1y, x2: t.x, y2: t.y };
  }
  noWake();
}

function noWake() {
  const now = performance.now();
  noS.lastActive = now;
  if (!noS.raf && !signupSection.hidden) { noS.last = now; noS.raf = requestAnimationFrame(noFrame); }
}
function noStop() {
  if (noS.raf) cancelAnimationFrame(noS.raf);
  noS.raf = 0; noS.vx = noS.vy = 0;
}

function noFrame(now) {
  const s = noS; s.raf = 0;
  if (signupSection.hidden) { noStop(); return; }
  const dt = clampN((now - s.last) / 1000 || 0.016, 0.001, 0.034); s.last = now; // clamped: a tab-switch never explodes the physics
  const reduced = reduceMotion.matches;
  const m = noMeasure(), w = m.w, h = m.h;
  if (!s.engaged) { s.x = m.homeL; s.y = m.homeT; }
  if (s.x < m.minX || s.x > m.maxX || s.y < m.minY || s.y > m.maxY) { s.relax = true; } else s.relax = false; // outside only if the page changed under it (resize / first move)
  const pAge = now - ptr.t;
  const pSpeed = ptr.active ? ptr.speed * Math.exp(-pAge / 150) : 0; // pointer speed fades once it stops moving
  let dist = Infinity;

  if (s.mode === "glide") {
    const u = clampN((now - s.g.t0) / s.g.ms, 0, 1), e = 1 - Math.pow(1 - u, 3), q = 1 - e, g = s.g; // ease-OUT: leaves fast, settles gently
    const ox = s.x, oy = s.y;
    s.x = q * q * g.x0 + 2 * q * e * g.x1 + e * e * g.x2;
    s.y = q * q * g.y0 + 2 * q * e * g.y1 + e * e * g.y2;
    // once it is clear of the corner / wall / Yes that pinned it, hand over to the physics WITH its current velocity,
    // so it keeps its momentum instead of crawling to a stop where the pointer can catch up
    const free = u >= 0.3 && !(Math.min(s.x - m.minX, m.maxX - s.x) < m.zx * 0.6 && Math.min(s.y - m.minY, m.maxY - s.y) < m.zy * 0.6) && noObstacleGap(m, s.x, s.y) > 36;
    // ...or if the pointer closes in anyway mid-glide, drop back to the (reactive) physics at once, with its momentum
    const danger = ptr.active && u > 0.05 && rectDist(ptr.x, ptr.y, s.x, s.y, w, h) < 70;
    if ((free || danger) && u < 1 && g.kind === "far") {
      const hv = Math.hypot(s.x - ox, s.y - oy) / dt, f = hv > NO_MAX_SPEED ? NO_MAX_SPEED / hv : 1;
      s.vx = (s.x - ox) / dt * f; s.vy = (s.y - oy) / dt * f;
      s.mode = "free"; s.g = null; s.pinnedMs = 0; s.cooldownUntil = now + 120;
    } else if (u >= 1) { s.mode = "free"; s.g = null; s.vx = s.vy = 0; s.pinnedMs = 0; s.cooldownUntil = now + 250; }
  } else if (s.mode === "fade") {
    const el = now - s.f.t0;
    if (!s.f.moved && el >= NO_FADE_MS) { s.f.moved = true; s.x = s.f.x; s.y = s.f.y; }
    const o = el < NO_FADE_MS ? 1 - el / NO_FADE_MS : Math.min(1, (el - NO_FADE_MS) / NO_FADE_MS);
    noBtn.style.opacity = o >= 1 ? "" : String(Math.max(0, o).toFixed(3));
    noBtn.style.pointerEvents = o >= 1 ? "" : "none"; // not clickable while invisible
    if (el >= NO_FADE_MS * 2) { s.mode = "free"; s.f = null; noBtn.style.opacity = ""; noBtn.style.pointerEvents = ""; }
  } else if (!reduced) {
    // ---- free physics ----
    const cx = s.x + w / 2, cy = s.y + h / 2;
    const dl = s.x - m.minX, dr = m.maxX - s.x, dtp = s.y - m.minY, db = m.maxY - s.y;
    let ax = 0, ay = 0;
    // pointer: edge distance to the CURRENT and the PREDICTED (look-ahead) position; flee from the nearer one
    let pxe = ptr.x, pye = ptr.y;
    if (ptr.active) {
      const fade = Math.exp(-pAge / 150), la = NO_LOOKAHEAD_MS / 1000;
      const lx = clampN(ptr.vx * fade * la, -400, 400), ly = clampN(ptr.vy * fade * la, -400, 400);
      const d0 = rectDist(ptr.x, ptr.y, s.x, s.y, w, h), d1 = rectDist(ptr.x + lx, ptr.y + ly, s.x, s.y, w, h);
      if (d1 < d0) { pxe = ptr.x + lx; pye = ptr.y + ly; }
      dist = Math.min(d0, d1); // edge distance, used for the radius and the corner trigger
      const R = NO_RADIUS + Math.min(NO_RADIUS_BONUS_MAX, pSpeed * NO_RADIUS_SPEED); // a fast pointer is "near" sooner
      if (dist < R) {
        const dx = cx - pxe, dy = cy - pye, dc = Math.hypot(dx, dy);
        let rx, ry; // unit vector pointer -> button; never divides by ~0
        if (dc > 0.001) { rx = dx / dc; ry = dy / dc; }
        else { const ex = m.vw / 2 - cx, ey = m.vh / 2 - cy, el = Math.hypot(ex, ey) || 1; rx = ex / el; ry = ey / el; }
        // which way to curve: keep the sideways drift it already has; if nearly still or at a wall, curve toward open space
        const cross = rx * s.vy - ry * s.vx, toCx = m.vw / 2 - cx, toCy = m.vh / 2 - cy;
        const nearWall = Math.min(dl, dr, dtp, db) < NO_WALL_RANGE;
        if (nearWall || Math.hypot(s.vx, s.vy) < 100 || Math.abs(cross) <= 30) s.orbit = (-ry * toCx + rx * toCy) >= 0 ? 1 : -1;
        else s.orbit = cross > 0 ? 1 : -1;
        const k = 1 - dist / R + (dist < 60 ? (1 - dist / 60) * 1.5 : 0); // ramps up, and panics when really close
        const gain = Math.min(NO_POINTER_GAIN_MAX, 1 + NO_POINTER_GAIN * pSpeed / 1000); // fast cursor -> harder shove
        const mag = NO_FLEE_ACCEL * k * gain;
        ax += (rx - s.orbit * ry * NO_CURVE) * mag;   // straight away + perpendicular (rotated 90deg) part
        ay += (ry + s.orbit * rx * NO_CURVE) * mag;
      }
    }
    // soft walls: push inward ramping up near an edge, plus a slide along the edge (away from the pointer)
    const slideDir = (c, p, v) => { const dd = p === null ? 0 : c - p; return Math.abs(dd) > 1 ? Math.sign(dd) : (Math.sign(v) || s.orbit); };
    const wallK = d0 => { const f = 1 - Math.max(d0, 0) / NO_WALL_RANGE; return f > 0 ? f * f : 0; };
    const py = ptr.active ? ptr.y : null, px = ptr.active ? ptr.x : null;
    let k = wallK(dl); if (k) { ax += NO_WALL_ACCEL * k; ay += NO_WALL_ACCEL * NO_WALL_SLIDE * k * slideDir(cy, py, s.vy); }
    k = wallK(dr);  if (k) { ax -= NO_WALL_ACCEL * k; ay += NO_WALL_ACCEL * NO_WALL_SLIDE * k * slideDir(cy, py, s.vy); }
    k = wallK(dtp); if (k) { ay += NO_WALL_ACCEL * k; ax += NO_WALL_ACCEL * NO_WALL_SLIDE * k * slideDir(cx, px, s.vx); }
    k = wallK(db);  if (k) { ay -= NO_WALL_ACCEL * k; ax += NO_WALL_ACCEL * NO_WALL_SLIDE * k * slideDir(cx, px, s.vx); }
    // Yes / theme / mute count as walls too: soft push away from them plus a slide along them
    for (const q of m.rects) {
      const gap = Math.hypot(Math.max(q.l - (s.x + w), 0, s.x - q.r), Math.max(q.t - (s.y + h), 0, s.y - q.b)), kq = wallK(gap);
      if (!kq) continue;
      let ox = cx - (q.l + q.r) / 2, oy = cy - (q.t + q.b) / 2; const ol = Math.hypot(ox, oy) || 1; ox /= ol; oy /= ol;
      const sd = ptr.active ? (Math.sign(-oy * (cx - ptr.x) + ox * (cy - ptr.y)) || 1) : 1;
      ax += NO_WALL_ACCEL * kq * (ox - oy * sd * NO_WALL_SLIDE); ay += NO_WALL_ACCEL * kq * (oy + ox * sd * NO_WALL_SLIDE);
    }
    // integrate: accelerate, damp (frame-rate independent), soft speed limit, move
    s.vx += ax * dt; s.vy += ay * dt;
    const damp = Math.exp(-NO_DAMPING * dt);
    s.vx *= damp; s.vy *= damp;
    const maxS = Math.min(NO_MAX_SPEED, NO_BASE_SPEED + pSpeed * NO_SPEED_FOLLOW), sp = Math.hypot(s.vx, s.vy);
    if (sp > maxS) { const f = (sp + (maxS - sp) * Math.min(1, dt * 8)) / sp; s.vx *= f; s.vy *= f; }
    { const sp2 = Math.hypot(s.vx, s.vy); if (sp2 > NO_MAX_SPEED) { s.vx *= NO_MAX_SPEED / sp2; s.vy *= NO_MAX_SPEED / sp2; } } // true hard ceiling
    s.x += s.vx * dt; s.y += s.vy * dt;
    if (!s.engaged && sp > 1) s.engaged = true;

    // cornered? pointer very close while pinned against walls -> glide (curved, eased) to a far part of the arena
    const nx = Math.min(dl, dr) < m.zx, ny = Math.min(dtp, db) < m.zy;
    const nr = noObstacleGap(m, s.x, s.y) < 36; // pressed against Yes / theme / mute counts like a wall
    const blocked = nx || ny || nr;
    if (ptr.active && dist < NO_CORNER_TRIGGER && blocked && sp < 120) s.pinnedMs += dt * 1000; else s.pinnedMs = 0;
    if (ptr.active && dist < NO_CORNER_TRIGGER && now > s.cooldownUntil && ((nx && ny) || (nr && (nx || ny)) || s.pinnedMs > 300 || (nr && dist < 50))) {
      noStartMove("far", ptr.x, ptr.y); // sets mode "glide" from the current position; no position change this frame
    }
  }

  {
    if (s.mode !== "fade") {
      // 1) arena: always a hard limit - except when the page itself moved it out (resize, or first move from an off-screen
      //    home spot, flagged by s.relax), in which case it is eased back in rather than snapped
      const cxx = clampN(s.x, m.minX, m.maxX), cyy = clampN(s.y, m.minY, m.maxY);
      if (s.relax) { s.x += (cxx - s.x) * Math.min(1, dt * 8); s.y += (cyy - s.y) * Math.min(1, dt * 8); } else { s.x = cxx; s.y = cyy; }
      if ((s.x <= m.minX && s.vx < 0) || (s.x >= m.maxX && s.vx > 0)) s.vx *= -0.25;
      if ((s.y <= m.minY && s.vy < 0) || (s.y >= m.maxY && s.vy > 0)) s.vy *= -0.25;
      // 2) keep clear of Yes / theme / mute: slide out along the shortest way that stays inside the arena
      for (const q of m.rects) {
        if (s.x < q.r && s.x + w > q.l && s.y < q.b && s.y + h > q.t) {
          const opts = [[q.l - w - s.x, 0], [q.r - s.x, 0], [0, q.t - h - s.y], [0, q.b - s.y]]
            .filter(o => (o[0] ? s.x + o[0] >= m.minX && s.x + o[0] <= m.maxX : s.y + o[1] >= m.minY && s.y + o[1] <= m.maxY));
          const all = opts.length ? opts : [[q.l - w - s.x, 0], [q.r - s.x, 0], [0, q.t - h - s.y], [0, q.b - s.y]];
          const o = all.reduce((a, b) => Math.abs(a[0] + a[1]) < Math.abs(b[0] + b[1]) ? a : b);
          s.x += o[0]; s.y += o[1];
          if (o[0] && Math.sign(s.vx) === -Math.sign(o[0])) s.vx = 0;
          if (o[1] && Math.sign(s.vy) === -Math.sign(o[1])) s.vy = 0;
        }
      }
      // 3) the arena wins any conflict: final hard clamp (never outside the viewport margins, whatever the speed)
      if (!s.relax) { s.x = clampN(s.x, m.minX, m.maxX); s.y = clampN(s.y, m.minY, m.maxY); }
    }
  }
  if (!isFinite(s.x + s.y + s.vx + s.vy)) { s.x = m.homeL; s.y = m.homeT; s.vx = s.vy = 0; s.engaged = false; s.mode = "free"; }

  // idle sway: a small drifting offset (visual only), eased in while there has been recent activity, out afterwards
  const swayOn = !reduced && NO_SWAY_AMP > 0 && now - s.lastActive < NO_IDLE_PAUSE_MS;
  s.env += ((swayOn ? 1 : 0) - s.env) * Math.min(1, dt * 3);
  if (!swayOn && s.env < 0.02) s.env = 0;
  const ph = now / NO_SWAY_PERIOD_MS * Math.PI * 2;
  const swx = s.env * NO_SWAY_AMP * Math.sin(ph), swy = s.env * NO_SWAY_AMP * 0.7 * Math.sin(ph * 0.73 + 1.3);
  s.tx = s.x - m.homeL + swx; s.ty = s.y - m.homeT + swy;
  noBtn.style.transform = (s.engaged || s.env) ? "translate3d(" + s.tx.toFixed(2) + "px," + s.ty.toFixed(2) + "px,0)" : "";

  // keep looping only while something is moving or recently active; otherwise stop (restarts via noWake)
  const speed = Math.hypot(s.vx, s.vy);
  const ptrNear = ptr.active && dist < NO_RADIUS && (pAge < 1500 || speed > 8);
  if (s.mode !== "free" || (!reduced && (speed > 8 || ptrNear || s.env > 0))) {
    if (!s.raf) s.raf = requestAnimationFrame(noFrame); // noStartMove may already have re-armed it
  } else {
    s.vx = s.vy = 0;
    if (!s.engaged) noBtn.style.transform = "";
  }
}

// ---- inputs ----
function noPointerSeen(e, down) {
  if (signupSection.hidden) return false;
  const t = performance.now(), dtm = t - ptr.t;
  if (!ptr.active) { ptr.speed = 0; ptr.vx = ptr.vy = 0; } // a pointer coming back has no stale speed
  if (ptr.active && dtm > 0 && !down) {
    const inst = Math.min(6000, Math.hypot(e.clientX - ptr.x, e.clientY - ptr.y) / dtm * 1000);
    ptr.speed = ptr.speed * 0.5 + inst * 0.5;
    const ivx = (e.clientX - ptr.x) / dtm * 1000, ivy = (e.clientY - ptr.y) / dtm * 1000;
    ptr.vx = ptr.vx * 0.4 + ivx * 0.6; ptr.vy = ptr.vy * 0.4 + ivy * 0.6; // heading, for look-ahead
  }
  ptr.x = e.clientX; ptr.y = e.clientY; ptr.t = t; ptr.active = true;
  if (down && e.pointerType === "touch") ptr.speed = Math.max(ptr.speed, 900); // a tap counts as a fast approach
  return true;
}
// is the pointer on (or within a small slop of) the No button?
function noOnButton(x, y) {
  const r = noBtn.getBoundingClientRect(), p = NO_TOUCH_SLOP;
  return x >= r.left - p && x <= r.right + p && y >= r.top - p && y <= r.bottom + p;
}
// reduced motion has no chase: one fade-move when the pointer first comes near, re-armed once it has left
function noReducedCheck(x, y) {
  const r = noBtn.getBoundingClientRect(), d = Math.hypot(r.left + r.width / 2 - x, r.top + r.height / 2 - y);
  if (d > NO_RADIUS * 1.5) noS.armed = true;
  else if (d < NO_RADIUS && noS.armed && noS.mode === "free" && performance.now() > noS.cooldownUntil) {
    noS.armed = false; noS.cooldownUntil = performance.now() + 400; noStartMove("near", x, y);
  }
}

document.addEventListener("pointermove", e => {
  if (!noPointerSeen(e, false)) return;
  if (reduceMotion.matches) noReducedCheck(e.clientX, e.clientY); else noWake();
}, { passive: true });
// Touch / click pre-emption: the button leaves on pointerdown (and touchstart as a fallback), i.e. before
// pointerup/click can land on it. Nothing is preventDefault-ed here, and #su-yes is never touched.
function noPress(x, y, e, isPointer) {
  if (isPointer) { if (!noPointerSeen(e, true)) return; } else { if (signupSection.hidden) return; ptr.x = x; ptr.y = y; ptr.t = performance.now(); ptr.active = true; ptr.speed = Math.max(ptr.speed, 900); }
  if (noOnButton(x, y)) {
    const recent = noS.mode === "glide" && noS.g && noS.g.ms === NO_DASH_MS && performance.now() - noS.g.t0 < 300;
    if (!recent) noStartMove("dash", x, y);
  } else if (reduceMotion.matches) noReducedCheck(x, y); else noWake();
}
document.addEventListener("pointerdown", e => noPress(e.clientX, e.clientY, e, true), { passive: true });
document.addEventListener("touchstart", e => { const t = e.touches[0]; if (t) noPress(t.clientX, t.clientY, e, false); }, { passive: true });
// a finger that lifts is no longer "hovering"; a mouse that leaves the window likewise
const noPointerGone = e => { if (!e || !e.pointerType || e.pointerType === "touch") ptr.active = false; };
document.addEventListener("pointerup", noPointerGone, { passive: true });
document.addEventListener("pointercancel", noPointerGone, { passive: true });
document.addEventListener("touchend", () => { ptr.active = false; }, { passive: true });
document.addEventListener("touchcancel", () => { ptr.active = false; }, { passive: true });
document.documentElement.addEventListener("pointerleave", () => { ptr.active = false; }, { passive: true });
window.addEventListener("blur", () => { ptr.active = false; });
window.addEventListener("resize", () => { noS.relaxCheck = true; noWake(); }, { passive: true });
signupSection.addEventListener("scroll", noWake, { passive: true });
// keyboard: focus makes No glide smoothly to a nearby free spot. Focus itself never moves, it stays
// tabbable, and Enter/Space still fire its click - Tab / Shift+Tab leave it as with any button.
noBtn.addEventListener("focus", () => {
  if (performance.now() - noS.lastMoveStart < 400) return; // a pointer press already moved it
  const r = noBtn.getBoundingClientRect();
  noStartMove("near", r.left + r.width / 2, r.top + r.height / 2);
});
// a pointer "click" on No (detail > 0) is swallowed, since it's only reachable if the dodge failed;
// a keyboard activation (detail 0) just makes it step away again, as before.
noBtn.addEventListener("click", e => {
  if (e.detail > 0) { e.preventDefault(); e.stopImmediatePropagation(); noStartMove("dash", e.clientX, e.clientY); }
  else noStartMove("near", ptr.x, ptr.y);
}, true);
reduceMotion.addEventListener("change", () => {
  noStop(); noS.mode = "free"; noS.g = noS.f = null; noS.armed = true;
  noBtn.style.opacity = ""; noBtn.style.pointerEvents = "";
  noWake();
});
// No sits above everything on the card while it roams, and is promoted to its own layer. Neither changes layout.
noBtn.style.position = "relative"; noBtn.style.zIndex = "2"; noBtn.style.willChange = "transform";
noWake(); // a few seconds of idle sway on load, then the loop pauses by itself

// ---- persistence + backend send (P4) ----
const PENDING_KEY = "surprise-pending-sends";

function queueSend(payload) {
  try {
    const q = JSON.parse(localStorage.getItem(PENDING_KEY) || "[]");
    q.push(payload);
    localStorage.setItem(PENDING_KEY, JSON.stringify(q));
  } catch (e) {}
}

function sendToBackend(payload) {
  if (!APPS_SCRIPT_URL) { queueSend(payload); return; } // nothing deployed yet (see backend/SETUP.md)
  // text/plain + no-cors: Apps Script web apps don't handle a real CORS preflight;
  // the response is opaque either way, so a rejected promise is the only failure signal we get.
  fetch(APPS_SCRIPT_URL, { method: "POST", mode: "no-cors", headers: { "Content-Type": "text/plain" }, body: JSON.stringify(payload) })
    .catch(err => { console.warn("surprise-kit: send failed, queued for retry", err); queueSend(payload); });
}

function flushPending() {
  if (!APPS_SCRIPT_URL) return;
  let queue;
  try { queue = JSON.parse(localStorage.getItem(PENDING_KEY) || "[]"); } catch (e) { queue = []; }
  if (!queue.length) return;
  try { localStorage.removeItem(PENDING_KEY); } catch (e) {}
  queue.forEach(sendToBackend); // any that fail again just re-queue themselves
}
flushPending();
setTimeout(flushPending, 20000); // one more quiet retry a little later; no need for backoff here

// ---- music + mute control ----
const MUTE_KEY = "surprise-muted";
let mutedPref = false;
try { mutedPref = localStorage.getItem(MUTE_KEY) === "1"; } catch (e) {}
let audioEl = null;

function getAudioEl() {
  if (audioEl) return audioEl;
  audioEl = document.createElement("audio");
  audioEl.loop = true; audioEl.volume = 0.15; audioEl.muted = mutedPref;
  audioEl.addEventListener("error", () => {}); // a missing placeholder track must never throw or block the UI
  document.body.appendChild(audioEl);
  return audioEl;
}

function startMusic(trackId) {
  const track = MUSIC.find(m => m.id === trackId) || MUSIC[0];
  if (!track) return;
  const el = getAudioEl();
  if (el.getAttribute("src") !== track.file) el.src = track.file;
  el.play().catch(() => {}); // autoplay blocked: fail silently; the mute button still works
}

let muteBtn = null;
function paintMute() {
  if (!muteBtn) return;
  muteBtn.textContent = mutedPref ? "\u{1F507}" : "\u{1F50A}";
  muteBtn.setAttribute("aria-pressed", String(mutedPref));
  muteBtn.setAttribute("aria-label", mutedPref ? "Unmute music" : "Mute music");
}
function ensureMuteButton() {
  if (muteBtn) return muteBtn;
  muteBtn = document.createElement("button");
  muteBtn.type = "button"; muteBtn.id = "mute"; muteBtn.className = "mute";
  paintMute();
  muteBtn.addEventListener("click", () => {
    mutedPref = !mutedPref;
    getAudioEl().muted = mutedPref;
    try { localStorage.setItem(MUTE_KEY, mutedPref ? "1" : "0"); } catch (e) {}
    paintMute();
    if (!mutedPref) getAudioEl().play().catch(() => {}); // her click is a user gesture; worth another try
  });
  document.body.appendChild(muteBtn);
  return muteBtn;
}
ensureMuteButton();

// submit: save answers, send to backend, start music, hand off to #stage (the existing
// envelope scene) via the intro dim-and-unfold beat below (Phase 3 P5).
$("su-form").addEventListener("submit", e => {
  e.preventDefault();
  const username = $("su-username").value.trim();
  const website = $("su-website").value; // honeypot: read as-is, only a bot would have filled it
  const answers = { username, mood: selectedMood, iconId: selectedIconId, musicId: selectedTrackId, yes: true };
  try { localStorage.setItem(SIGNUP_KEY, JSON.stringify(answers)); } catch (err) {}
  sendToBackend({ type: "signup", username, mood: selectedMood, icon: selectedIconId, music: selectedTrackId, website });
  signupSection.hidden = true;
  startMusic(selectedTrackId); // only start playback after an actual completed sign-up interaction
  // Phase 3 P5: intro dim-and-unfold beat, before she reaches the seal. Same staggered
  // setTimeout style as the seal-open sequence further down. #stage's default (no class)
  // state is today's normal, fully-entered look, so this one-time trigger is the only thing
  // that ever adds the "not yet entered" starting state - a returning visit with a saved
  // sign-up never runs this handler at all and goes straight to #stage exactly as before.
  const stageEl = $("stage");
  stageEl.classList.add("intro-dim", "intro-msg-on", "intro-pre");
  // two rAFs so the browser paints the pre-entrance state at least once before it's removed,
  // otherwise the removal could be coalesced into the same frame and the transition would
  // never run (same reason the seal-open sequence below uses setTimeout, not an immediate class swap)
  requestAnimationFrame(() => requestAnimationFrame(() => stageEl.classList.remove("intro-pre")));
  setTimeout(() => stageEl.classList.remove("intro-msg-on"), 1100); // heading fades as the unfold finishes
  setTimeout(() => $("seal").focus({ preventScroll: true }), 2200); // same focus call as before, just after the beat
});

// a returning visitor skips the card entirely (see the early check at the top of this
// file); PRD 4.2 says the chosen track keeps playing "on every later screen", so we
// also try to resume it here on later visits - autoplay is still caught silently if
// the browser blocks it, exactly as it is on first finishing sign-up.
if (savedSignup) startMusic(savedSignup.musicId);

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
    // (#go is retired/hidden now that the reply form is how she moves the flow forward)
    $("letter").inert = false;
    (text.tabIndex === 0 ? text : $("reply-text")).focus({ preventScroll: true });
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

// ---- letter reply + inbox (Phase 3 P7): submit folds the letter into the inbox icon,
// saves/sends the reply, then lights the page up and hands off to the existing, already-
// working gallery reveal (#go's own click handler above) instead of duplicating it.
const REPLY_KEY = "surprise-reply";
const inboxBtn = $("inbox"), inboxBadge = $("inbox-badge"), inboxView = $("inbox-view"), inboxText = $("inbox-text");
let replyAttempted = false, replyDone = false; // same one-flag-per-step style as `opened` above

$("reply-form").addEventListener("submit", e => {
  e.preventDefault();
  if (replyDone) return; // belt-and-suspenders against a second Enter/click while folding
  const replyText = $("reply-text").value.trim();
  const website = $("reply-website").value; // honeypot: read as-is, only a bot would fill it

  // Decision H: the submit button is always enabled; an empty reply never hard-blocks.
  // First empty attempt only nudges and gives her a chance to type after all - nothing is
  // folded/saved/sent yet. A second empty attempt, or any non-empty reply on the first try,
  // falls through to the full flow below.
  if (!replyText && !replyAttempted) {
    replyAttempted = true;
    $("reply-nudge").textContent = CONFIG.reply.nudge; // already set once at load; reasserted here to be sure
    $("reply-nudge").hidden = false;
    $("reply-text").focus({ preventScroll: true });
    return;
  }
  replyAttempted = true; replyDone = true;

  try { localStorage.setItem(REPLY_KEY, JSON.stringify({ text: replyText, timestamp: Date.now() })); } catch (err) {}
  let username = "";
  try { const su = JSON.parse(localStorage.getItem(SIGNUP_KEY) || "null"); if (su && su.username) username = su.username; } catch (err) {}
  sendToBackend({ type: "reply", username, reply: replyText, website });

  // fold the letter up toward the inbox icon (CSS does the shrink/translate/fade; see
  // #letter.folding in style.css), then light up and trigger the existing reveal
  const letterEl = $("letter");
  letterEl.classList.add("folding");
  setTimeout(() => {
    inboxBtn.hidden = false;
    inboxBadge.hidden = false;
    $("stage").classList.remove("intro-dim"); // light-up trigger; P8 polishes the transition itself
    $("go").click(); // reuses #go's existing, already-working gallery reveal rather than rewriting it
  }, 650); // matches #letter.folding's own transition durations in style.css
});

// inbox: open/close/readback, mirroring #player/.p-box's own <dialog> accessibility pattern
// (showModal traps focus and gives Esc for free; close button, backdrop click, and focus
// return on close are the exact same three pieces #player already wires above)
inboxBtn.addEventListener("click", () => {
  let saved = null;
  try { saved = JSON.parse(localStorage.getItem(REPLY_KEY) || "null"); } catch (err) {}
  inboxText.textContent = (saved && saved.text) || ""; // read fresh every time, never a stale in-memory copy
  inboxBadge.hidden = true; // local-only "read" mark - her own click, never anything from the Sheet (PRD 4.3)
  if (!inboxView.open) inboxView.showModal();
  $("inbox-close").focus();
});
$("inbox-close").addEventListener("click", () => inboxView.close());
inboxView.addEventListener("click", e => { if (e.target === inboxView) inboxView.close(); }); // click outside the box
inboxView.addEventListener("close", () => inboxBtn.focus()); // back to the button that opened it

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
// `source` just labels where the warning came from (clips.json vs the Memories CSV) - the
// checks themselves are identical either way, per PRD 6.1 ("same rules apply to both").
function checkClips(data, source) {
  source ||= "clips.json";
  const cols = new Set((data.collections || []).map(c => c.id)), ids = new Set();
  for (const c of data.clips || []) {
    const w = msg => console.warn(source + ", clip " + (c.id || "(no id)") + ": " + msg);
    if (ids.has(c.id)) w("duplicate id"); ids.add(c.id);
    if (!/^[\w-]{11}$/.test(c.youtubeId || "")) w("youtubeId should be the 11-character id from the YouTube link");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(c.date || "")) w("date should look like 2023-05-14");
    if (!cols.has(c.collection)) w('collection "' + c.collection + '" is not listed in "collections"');
    if (!c.title || !c.caption) w("missing title or caption");
  }
}

// ---- Memories CSV (Phase 3 P9): dependency-free, quote-aware CSV parser ----
// Handles what Google Sheets' published CSV export actually produces: a header row,
// commas inside quoted fields, an embedded "" as an escaped quote, and \r\n or \n line
// endings. Not a full RFC4180 implementation - just enough for that one export shape.
function parseCSV(text) {
  const rows = [];
  let row = [], field = "", inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else inQuotes = false; }
      else field += ch;
    } else if (ch === '"') inQuotes = true;
    else if (ch === ",") { row.push(field); field = ""; }
    else if (ch === "\r") { /* nothing - the \n that follows (if any) does the row push */ }
    else if (ch === "\n") { row.push(field); rows.push(row); row = []; field = ""; }
    else field += ch;
  }
  if (field !== "" || row.length) { row.push(field); rows.push(row); } // last line with no trailing newline
  return rows;
}

// Turns parsed CSV rows (header: title, note, date, youtubeId, collection - backend/SETUP.md
// step 1.3) into the same {collections, clips} shape clips.json already provides, so
// checkClips/buildTabs/showTab don't need to know which source they're looking at.
// There's no separate "collections" sheet - they're derived here from the distinct
// `collection` values present, in first-seen order; buildTabs only needs {id, title} and
// already treats `icon` as optional, so these simply have no icon.
// id scheme: "m" + <row's 1-based position among the data rows, header excluded>, e.g. the
// first Memories row becomes "m1". That ties id to row position (stable across reloads of
// the same sheet) rather than to a counter of kept rows, matching clips.json's "id unique"
// rule without the sheet needing an id column of its own.
function memoriesFromCSV(text) {
  const rows = parseCSV(text).filter(r => !(r.length === 1 && r[0].trim() === "")); // drop blank lines
  if (rows.length < 2) return null; // header only, or nothing at all - doesn't look right
  const header = rows[0].map(h => h.trim().toLowerCase());
  const idx = name => header.indexOf(name);
  const iTitle = idx("title"), iNote = idx("note"), iDate = idx("date"), iYouTube = idx("youtubeid"), iCollection = idx("collection");
  if (iTitle < 0 || iYouTube < 0 || iCollection < 0) return null; // not the Memories tab's header

  const collections = [], seen = new Set(), clips = [];
  for (let r = 1; r < rows.length; r++) {
    const row = rows[r];
    const title = (row[iTitle] || "").trim(), youtubeId = (row[iYouTube] || "").trim(), collection = (row[iCollection] || "").trim();
    if (!title && !youtubeId) continue; // blank row
    if (!seen.has(collection)) { seen.add(collection); collections.push({ id: collection, title: collection }); }
    clips.push({
      id: "m" + r, youtubeId, title, collection,
      date: iDate >= 0 ? (row[iDate] || "").trim() : "",
      caption: iNote >= 0 ? (row[iNote] || "").trim() : ""
    });
  }
  return clips.length ? { collections, clips } : null; // zero usable rows counts as a failure
}

function loadMemoriesCSV() {
  if (!MEMORIES_CSV_URL) return Promise.reject(new Error("MEMORIES_CSV_URL is blank"));
  return fetch(MEMORIES_CSV_URL)
    .then(r => { if (!r.ok) throw new Error("HTTP " + r.status); return r.text(); })
    .then(text => { const data = memoriesFromCSV(text); if (!data) throw new Error("Memories CSV had no usable rows"); return data; });
}

function loadClipsJSON() {
  return fetch("clips.json").then(r => { if (!r.ok) throw new Error("HTTP " + r.status); return r.json(); });
}

// Try the Memories CSV first; any failure (blank URL, network/HTTP error, or a CSV that
// doesn't parse into usable rows) falls back to clips.json, completely unchanged from how
// it loaded before this task - same checkClips hygiene, same final .catch/error message.
loadMemoriesCSV()
  .then(data => { checkClips(data, "Memories CSV"); return data; })
  .catch(err => {
    console.warn("surprise-kit: Memories CSV unavailable, falling back to clips.json", err);
    return loadClipsJSON().then(data => { checkClips(data); return data; });
  })
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
