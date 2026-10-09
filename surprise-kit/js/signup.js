// Sign-up page (index.html): returning-visitor redirect, card wording, mood/icon/track pickers, validation,
// the "No" button physics and the Yes submit. Classic script; needs js/config.js and js/common.js first.
// Everything is guarded, so it quietly does nothing if the sign-up elements are not on the page.
(function () {
  const S = window.Surprise;
  if (!S || !S.Store || !S.Chrome) return;
  const { Store, Progress, Send, Music, CONFIG, MOODS, ICONS, MUSIC } = S;
  const N = S.NO; // "No" button tunables live in js/config.js
  const $ = id => document.getElementById(id);
  const signupSection = $("signup");
  if (!signupSection || !$("su-form") || !$("su-no") || !$("su-yes") || !$("su-msg")) return;

  // ---- returning visitor: a saved sign-up means the card never replays; go straight on to the letter.
  // (?reset=1 was already handled by js/common.js, which runs first, so a reset visitor has no saved sign-up here.)
  // location.replace keeps index.html out of the history so Back doesn't bounce her. Guard.target("letter") also
  // self-heals a missing progress flag.
  const SIGNUP_KEY = S.KEYS.signup;
  const saved = Store.getJSON(SIGNUP_KEY, null);
  if (saved && saved.yes && S.Guard.target("letter") === null) {
    signupSection.hidden = true; // never flash the card while the redirect happens
    location.replace("letter.html");
    return;
  }

  document.title = CONFIG.pageTitle;
  const setText = (id, t) => { const el = $(id); if (el) el.textContent = t; };
  const themeBtn = $("theme"); if (themeBtn) themeBtn.setAttribute("aria-label", CONFIG.labels.theme);
  // sign-up card wording
  setText("su-title", CONFIG.signup.title);
  const unameLabel = document.querySelector('label[for="su-username"]'); if (unameLabel) unameLabel.textContent = CONFIG.signup.usernameLabel;
  if ($("su-username")) $("su-username").placeholder = CONFIG.signup.usernamePlaceholder;
  setText("su-mood-label", CONFIG.signup.moodLabel);
  setText("su-icon-label", CONFIG.signup.iconLabel);
  setText("su-music-label", CONFIG.signup.musicLabel);
  setText("su-final-q", CONFIG.signup.finalQuestion);
  setText("su-yes", CONFIG.signup.yes);
  setText("su-no", CONFIG.signup.no);

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
    b.setAttribute("aria-pressed", "true"); selectedMood = b.dataset.id; signupFixed("mood");
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
    b.setAttribute("aria-pressed", "true"); selectedIconId = b.dataset.id; signupFixed("icon");
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
    b.setAttribute("aria-selected", "true"); selectedTrackId = b.dataset.id; signupFixed("music");
  });
}

renderMoods(); renderIcons(); renderTracks();

// gentle validation (Yes with something missing): a sweet message in #su-msg + a highlight on the step, never an alert
const stepEl = key => document.querySelector('.su-step[data-step="' + key + '"]');
function signupFixed(key) { // she filled it in: drop that highlight, and the message once nothing is left to fix
  const st = stepEl(key); if (st) st.classList.remove("su-missing");
  if (!document.querySelector(".su-step.su-missing") && !$("su-msg").hidden) { $("su-msg").hidden = true; $("su-msg").textContent = ""; noRehome(); }
}
$("su-username").addEventListener("input", () => { if ($("su-username").value.trim()) signupFixed("username"); });
function firstMissing() {
  if (!$("su-username").value.trim()) return { key: "username", focus: $("su-username") };
  if (!selectedMood) return { key: "mood", focus: document.querySelector("#su-moods .su-mood") };
  if (!selectedIconId) return { key: "icon", focus: document.querySelector("#su-icons .su-icon") };
  if (!selectedTrackId) return { key: "music", focus: document.querySelector("#su-tracks .su-track") };
  return null;
}

// ---- final step: "Will you be my baby forever?" - #su-no dodges, #su-yes always works ----
const noBtn = $("su-no"), yesBtn = $("su-yes");
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
  live: false,             // false until her first real dodge trigger: until then No has NO inline style, NO transform, NO loop
  hl: 0, ht: 0,            // last known natural (home) spot, so a late layout shift can be absorbed
  raf: 0, last: 0, lastActive: 0, lastMoveStart: -1e9, cooldownUntil: 0, pinnedMs: 0, armed: true
};
const ptr = { active: false, x: 0, y: 0, t: 0, speed: 0, vx: 0, vy: 0 };
const clampN = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const easeInOut = u => u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2;

// the button's natural spot (transform removed), the viewport arena it may roam, and things to keep clear of
function noMeasure() {
  const w = noBtn.offsetWidth, h = noBtn.offsetHeight, r = noBtn.getBoundingClientRect();
  const vw = document.documentElement.clientWidth, vh = document.documentElement.clientHeight;
  const minX = N.MARGIN, minY = N.MARGIN;
  const rects = [];
  const add = (el, pad) => {
    if (!el) return; // #theme / #mute live outside #signup but are fixed on top of it, so they count too
    const b = el.getBoundingClientRect();
    if (b.width && b.height) rects.push({ l: b.left - pad, t: b.top - pad, r: b.right + pad, b: b.bottom + pad });
  };
  add(yesBtn, N.YES_CLEARANCE); add($("theme"), 8); add($("mute"), 8);
  const o = { w, h, homeL: r.left - noS.tx, homeT: r.top - noS.ty, minX, minY,
    maxX: Math.max(minX, vw - N.MARGIN - w), maxY: Math.max(minY, vh - N.MARGIN - h), vw, vh, rects };
  // "near a corner" must stay meaningful on a narrow screen: never more than ~30% of the roaming width/height
  o.zx = Math.min(N.CORNER_ZONE, (o.maxX - o.minX) * 0.3); o.zy = Math.min(N.CORNER_ZONE, (o.maxY - o.minY) * 0.3);
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

// First real trigger: only now does No get any inline positioning (until then CSS alone places it, next to Yes).
function noArm() {
  if (noS.live) return;
  noS.live = true;
  noBtn.style.position = "relative"; noBtn.style.zIndex = "2"; noBtn.style.willChange = "transform";
}
// Re-measure home after anything that can shift layout (fonts, resize, message shown). If No has already
// moved, its viewport position is shifted by the same amount so it never ends up stale.
function noRehome() {
  const m = noMeasure(), s = noS;
  if (s.live && s.engaged) { s.x += m.homeL - s.hl; s.y += m.homeT - s.ht; noWake(); }
  s.hl = m.homeL; s.ht = m.homeT;
}
// pointer / touch moved: wake the dodge only once she is actually within range of No
function noProximity(x, y) {
  if (noS.live) { noWake(); return; }
  if (signupSection.hidden) return;
  const r = noBtn.getBoundingClientRect(), R = N.RADIUS + Math.min(N.RADIUS_BONUS_MAX, ptr.speed * N.RADIUS_SPEED);
  if (rectDist(x, y, r.left, r.top, r.width, r.height) < R) { noArm(); noWake(); }
}

function noStartMove(kind, px, py) {
  if (signupSection.hidden) return;
  noArm();
  const m = noMeasure(), s = noS, now = performance.now();
  if (!s.engaged) { s.x = m.homeL; s.y = m.homeT; s.hl = m.homeL; s.ht = m.homeT; s.relaxCheck = true; }
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
    s.g = { kind, t0: now, ms: kind === "dash" ? N.DASH_MS : N.GLIDE_MS, x0: s.x, y0: s.y, x1: c1x, y1: c1y, x2: t.x, y2: t.y };
  }
  noWake();
}

function noWake() {
  const now = performance.now();
  noS.lastActive = now;
  if (noS.live && !noS.raf && !signupSection.hidden) { noS.last = now; noS.raf = requestAnimationFrame(noFrame); }
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
      const hv = Math.hypot(s.x - ox, s.y - oy) / dt, f = hv > N.MAX_SPEED ? N.MAX_SPEED / hv : 1;
      s.vx = (s.x - ox) / dt * f; s.vy = (s.y - oy) / dt * f;
      s.mode = "free"; s.g = null; s.pinnedMs = 0; s.cooldownUntil = now + 120;
    } else if (u >= 1) { s.mode = "free"; s.g = null; s.vx = s.vy = 0; s.pinnedMs = 0; s.cooldownUntil = now + 250; }
  } else if (s.mode === "fade") {
    const el = now - s.f.t0;
    if (!s.f.moved && el >= N.FADE_MS) { s.f.moved = true; s.x = s.f.x; s.y = s.f.y; }
    const o = el < N.FADE_MS ? 1 - el / N.FADE_MS : Math.min(1, (el - N.FADE_MS) / N.FADE_MS);
    noBtn.style.opacity = o >= 1 ? "" : String(Math.max(0, o).toFixed(3));
    noBtn.style.pointerEvents = o >= 1 ? "" : "none"; // not clickable while invisible
    if (el >= N.FADE_MS * 2) { s.mode = "free"; s.f = null; noBtn.style.opacity = ""; noBtn.style.pointerEvents = ""; }
  } else if (!reduced) {
    // ---- free physics ----
    const cx = s.x + w / 2, cy = s.y + h / 2;
    const dl = s.x - m.minX, dr = m.maxX - s.x, dtp = s.y - m.minY, db = m.maxY - s.y;
    let ax = 0, ay = 0;
    // pointer: edge distance to the CURRENT and the PREDICTED (look-ahead) position; flee from the nearer one
    let pxe = ptr.x, pye = ptr.y;
    if (ptr.active) {
      const fade = Math.exp(-pAge / 150), la = N.LOOKAHEAD_MS / 1000;
      const lx = clampN(ptr.vx * fade * la, -400, 400), ly = clampN(ptr.vy * fade * la, -400, 400);
      const d0 = rectDist(ptr.x, ptr.y, s.x, s.y, w, h), d1 = rectDist(ptr.x + lx, ptr.y + ly, s.x, s.y, w, h);
      if (d1 < d0) { pxe = ptr.x + lx; pye = ptr.y + ly; }
      dist = Math.min(d0, d1); // edge distance, used for the radius and the corner trigger
      const R = N.RADIUS + Math.min(N.RADIUS_BONUS_MAX, pSpeed * N.RADIUS_SPEED); // a fast pointer is "near" sooner
      if (dist < R) {
        const dx = cx - pxe, dy = cy - pye, dc = Math.hypot(dx, dy);
        let rx, ry; // unit vector pointer -> button; never divides by ~0
        if (dc > 0.001) { rx = dx / dc; ry = dy / dc; }
        else { const ex = m.vw / 2 - cx, ey = m.vh / 2 - cy, el = Math.hypot(ex, ey) || 1; rx = ex / el; ry = ey / el; }
        // which way to curve: keep the sideways drift it already has; if nearly still or at a wall, curve toward open space
        const cross = rx * s.vy - ry * s.vx, toCx = m.vw / 2 - cx, toCy = m.vh / 2 - cy;
        const nearWall = Math.min(dl, dr, dtp, db) < N.WALL_RANGE;
        if (nearWall || Math.hypot(s.vx, s.vy) < 100 || Math.abs(cross) <= 30) s.orbit = (-ry * toCx + rx * toCy) >= 0 ? 1 : -1;
        else s.orbit = cross > 0 ? 1 : -1;
        const k = 1 - dist / R + (dist < 60 ? (1 - dist / 60) * 1.5 : 0); // ramps up, and panics when really close
        const gain = Math.min(N.POINTER_GAIN_MAX, 1 + N.POINTER_GAIN * pSpeed / 1000); // fast cursor -> harder shove
        const mag = N.FLEE_ACCEL * k * gain;
        ax += (rx - s.orbit * ry * N.CURVE) * mag;   // straight away + perpendicular (rotated 90deg) part
        ay += (ry + s.orbit * rx * N.CURVE) * mag;
      }
    }
    // soft walls: push inward ramping up near an edge, plus a slide along the edge (away from the pointer)
    const slideDir = (c, p, v) => { const dd = p === null ? 0 : c - p; return Math.abs(dd) > 1 ? Math.sign(dd) : (Math.sign(v) || s.orbit); };
    const wallK = d0 => { const f = 1 - Math.max(d0, 0) / N.WALL_RANGE; return f > 0 ? f * f : 0; };
    const py = ptr.active ? ptr.y : null, px = ptr.active ? ptr.x : null;
    let k = wallK(dl); if (k) { ax += N.WALL_ACCEL * k; ay += N.WALL_ACCEL * N.WALL_SLIDE * k * slideDir(cy, py, s.vy); }
    k = wallK(dr);  if (k) { ax -= N.WALL_ACCEL * k; ay += N.WALL_ACCEL * N.WALL_SLIDE * k * slideDir(cy, py, s.vy); }
    k = wallK(dtp); if (k) { ay += N.WALL_ACCEL * k; ax += N.WALL_ACCEL * N.WALL_SLIDE * k * slideDir(cx, px, s.vx); }
    k = wallK(db);  if (k) { ay -= N.WALL_ACCEL * k; ax += N.WALL_ACCEL * N.WALL_SLIDE * k * slideDir(cx, px, s.vx); }
    // Yes / theme / mute count as walls too: soft push away from them plus a slide along them
    for (const q of m.rects) {
      const gap = Math.hypot(Math.max(q.l - (s.x + w), 0, s.x - q.r), Math.max(q.t - (s.y + h), 0, s.y - q.b)), kq = wallK(gap);
      if (!kq) continue;
      let ox = cx - (q.l + q.r) / 2, oy = cy - (q.t + q.b) / 2; const ol = Math.hypot(ox, oy) || 1; ox /= ol; oy /= ol;
      const sd = ptr.active ? (Math.sign(-oy * (cx - ptr.x) + ox * (cy - ptr.y)) || 1) : 1;
      ax += N.WALL_ACCEL * kq * (ox - oy * sd * N.WALL_SLIDE); ay += N.WALL_ACCEL * kq * (oy + ox * sd * N.WALL_SLIDE);
    }
    // integrate: accelerate, damp (frame-rate independent), soft speed limit, move
    s.vx += ax * dt; s.vy += ay * dt;
    const damp = Math.exp(-N.DAMPING * dt);
    s.vx *= damp; s.vy *= damp;
    const maxS = Math.min(N.MAX_SPEED, N.BASE_SPEED + pSpeed * N.SPEED_FOLLOW), sp = Math.hypot(s.vx, s.vy);
    if (sp > maxS) { const f = (sp + (maxS - sp) * Math.min(1, dt * 8)) / sp; s.vx *= f; s.vy *= f; }
    { const sp2 = Math.hypot(s.vx, s.vy); if (sp2 > N.MAX_SPEED) { s.vx *= N.MAX_SPEED / sp2; s.vy *= N.MAX_SPEED / sp2; } } // true hard ceiling
    s.x += s.vx * dt; s.y += s.vy * dt;
    if (!s.engaged && sp > 1) s.engaged = true;

    // cornered? pointer very close while pinned against walls -> glide (curved, eased) to a far part of the arena
    const nx = Math.min(dl, dr) < m.zx, ny = Math.min(dtp, db) < m.zy;
    const nr = noObstacleGap(m, s.x, s.y) < 36; // pressed against Yes / theme / mute counts like a wall
    const blocked = nx || ny || nr;
    if (ptr.active && dist < N.CORNER_TRIGGER && blocked && sp < 120) s.pinnedMs += dt * 1000; else s.pinnedMs = 0;
    if (ptr.active && dist < N.CORNER_TRIGGER && now > s.cooldownUntil && ((nx && ny) || (nr && (nx || ny)) || s.pinnedMs > 300 || (nr && dist < 50))) {
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
  const swayOn = s.engaged && !reduced && N.SWAY_AMP > 0 && now - s.lastActive < N.IDLE_PAUSE_MS;
  s.env += ((swayOn ? 1 : 0) - s.env) * Math.min(1, dt * 3);
  if (!swayOn && s.env < 0.02) s.env = 0;
  const ph = now / N.SWAY_PERIOD_MS * Math.PI * 2;
  const swx = s.env * N.SWAY_AMP * Math.sin(ph), swy = s.env * N.SWAY_AMP * 0.7 * Math.sin(ph * 0.73 + 1.3);
  s.tx = s.x - m.homeL + swx; s.ty = s.y - m.homeT + swy;
  noBtn.style.transform = (s.engaged || s.env) ? "translate3d(" + s.tx.toFixed(2) + "px," + s.ty.toFixed(2) + "px,0)" : "";

  // keep looping only while something is moving or recently active; otherwise stop (restarts via noWake)
  const speed = Math.hypot(s.vx, s.vy);
  const ptrNear = ptr.active && dist < N.RADIUS && (pAge < 1500 || speed > 8);
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
  const r = noBtn.getBoundingClientRect(), p = N.TOUCH_SLOP;
  return x >= r.left - p && x <= r.right + p && y >= r.top - p && y <= r.bottom + p;
}
// reduced motion has no chase: one fade-move when the pointer first comes near, re-armed once it has left
function noReducedCheck(x, y) {
  const r = noBtn.getBoundingClientRect(), d = Math.hypot(r.left + r.width / 2 - x, r.top + r.height / 2 - y);
  if (d > N.RADIUS * 1.5) noS.armed = true;
  else if (d < N.RADIUS && noS.armed && noS.mode === "free" && performance.now() > noS.cooldownUntil) {
    noS.armed = false; noS.cooldownUntil = performance.now() + 400; noStartMove("near", x, y);
  }
}

document.addEventListener("pointermove", e => {
  if (!noPointerSeen(e, false)) return;
  if (reduceMotion.matches) noReducedCheck(e.clientX, e.clientY); else noProximity(e.clientX, e.clientY);
}, { passive: true });
// Touch / click pre-emption: the button leaves on pointerdown (and touchstart as a fallback), i.e. before
// pointerup/click can land on it. Nothing is preventDefault-ed here, and #su-yes is never touched.
function noPress(x, y, e, isPointer) {
  if (isPointer) { if (!noPointerSeen(e, true)) return; } else { if (signupSection.hidden) return; ptr.x = x; ptr.y = y; ptr.t = performance.now(); ptr.active = true; ptr.speed = Math.max(ptr.speed, 900); }
  if (noOnButton(x, y)) {
    const recent = noS.mode === "glide" && noS.g && noS.g.ms === N.DASH_MS && performance.now() - noS.g.t0 < 300;
    if (!recent) noStartMove("dash", x, y);
  } else if (reduceMotion.matches) noReducedCheck(x, y); else noProximity(x, y);
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
window.addEventListener("resize", () => { noRehome(); noS.relaxCheck = true; noWake(); }, { passive: true });
// late-loading web fonts reflow the card: re-measure No's home so a stale measurement can never linger
if (document.fonts) {
  if (document.fonts.ready) document.fonts.ready.then(noRehome);
  if (document.fonts.addEventListener) document.fonts.addEventListener("loadingdone", noRehome);
}
signupSection.addEventListener("scroll", noWake, { passive: true });
// keyboard: focus makes No glide smoothly to a nearby free spot. Focus itself never moves, it stays
// tabbable, and Enter/Space still fire its click - Tab / Shift+Tab leave it as with any button.
noBtn.addEventListener("focus", () => {
  if (performance.now() - noS.lastMoveStart < 400) return; // a pointer press already moved it
  const r = noBtn.getBoundingClientRect();
  noStartMove("near", r.left + r.width / 2, r.top + r.height / 2);
});
// a pointer "click" on No (detail > 0) is swallowed, since it's only reachable if the dodge failed;
// a keyboard activation (detail 0) just makes it step away again, as before. Only once No is actually in
// roaming mode (noS.engaged); at rest it is a plain button and this listener never interferes.
noBtn.addEventListener("click", e => {
  if (!noS.engaged) return;
  if (e.detail > 0) { e.preventDefault(); e.stopImmediatePropagation(); noStartMove("dash", e.clientX, e.clientY); }
  else noStartMove("near", ptr.x, ptr.y);
}, true);
reduceMotion.addEventListener("change", () => {
  noStop(); noS.mode = "free"; noS.g = noS.f = null; noS.armed = true;
  noBtn.style.opacity = ""; noBtn.style.pointerEvents = "";
  noWake();
});
// No starts completely still: no inline style, no transform, no sway and no animation loop until a real
// trigger (pointer in range, touch, keyboard focus) calls noArm() - which is where it gets position:relative,
// z-index and will-change (above everything while it roams; none of it changes layout).

  // ---- submit: save answers, send to backend, unlock the letter, start the music, fade on to letter.html ----
  // Music.start happens here (her first real gesture) rather than on the next page, so autoplay is most likely
  // allowed and the next page's resume works. Chrome.go (js/common.js) is the one fade-then-navigate
  // implementation (immediate under reduced motion).
  let submitted = false;
  $("su-form").addEventListener("submit", e => {
    e.preventDefault();
    if (submitted) return;
    const missing = firstMissing();
    if (missing) {
      for (const st of document.querySelectorAll(".su-step.su-missing")) st.classList.remove("su-missing");
      stepEl(missing.key).classList.add("su-missing");
      const msgEl = $("su-msg"), wasHidden = msgEl.hidden;
      msgEl.textContent = CONFIG.signup.missing[missing.key]; msgEl.hidden = false;
      if (wasHidden) noRehome(); // the message nudges the Yes/No row down; keep No's home measurement honest
      if (missing.focus) missing.focus.focus();
      return; // nothing saved, no music, stays on the card
    }
    submitted = true;
    const username = $("su-username").value.trim();
    const website = $("su-website") ? $("su-website").value : ""; // honeypot: read as-is, only a bot would have filled it
    const answers = { username, mood: selectedMood, iconId: selectedIconId, musicId: selectedTrackId, yes: true };
    Store.setJSON(SIGNUP_KEY, answers);
    Progress.unlock("letter");
    Send.send({ type: "signup", username, mood: selectedMood, icon: selectedIconId, music: selectedTrackId, website });
    Music.start(selectedTrackId); // only start playback after an actual completed sign-up interaction
    S.Chrome.go("letter.html");
  });

  // the drifting dust and petals (#air) are drawn by js/common.js (Surprise.Air), shared with letter.html
})();
