// Shared helpers used by every page: storage, progress, ?reset=1, theme toggle.
// Classic script (no modules, so it works from file://); everything is exposed on window.Surprise.
(function () {
  const S = window.Surprise = window.Surprise || {};

  // ---- storage: every read/write is try/catch'd (private mode, blocked storage, bad JSON) ----
  const Store = {
    get(key, fallback) { try { const v = localStorage.getItem(key); return v === null ? fallback : v; } catch (e) { return fallback; } },
    set(key, value) { try { localStorage.setItem(key, value); return true; } catch (e) { return false; } },
    remove(key) { try { localStorage.removeItem(key); return true; } catch (e) { return false; } },
    getJSON(key, fallback) { try { const raw = localStorage.getItem(key); return raw ? JSON.parse(raw) : fallback; } catch (e) { return fallback; } },
    setJSON(key, value) { try { localStorage.setItem(key, JSON.stringify(value)); return true; } catch (e) { return false; } }
  };
  S.Store = Store;

  // every key the site owns. `theme` is deliberately NOT here: it is a preference, not progress.
  const KEYS = { signup: "surprise-signup", reply: "surprise-reply", pending: "surprise-pending-sends", muted: "surprise-muted", progress: "surprise-progress", music: "surprise-music", inboxSeen: "surprise-inbox-seen", theme: "theme" };
  S.KEYS = KEYS;
  const RESET_KEYS = [KEYS.signup, KEYS.reply, KEYS.pending, KEYS.muted, KEYS.progress, KEYS.music, KEYS.inboxSeen];

  // ?reset=1 clears all progress (but keeps the theme); must run before anything reads storage
  if (/(?:^|[?&])reset=1(?:&|$)/.test(location.search)) RESET_KEYS.forEach(k => Store.remove(k));

  // ---- progress: which later pages are unlocked. letter after Yes; memories + inbox after the reply ----
  const PAGES = ["letter", "memories", "inbox"];
  const Progress = {
    read() {
      const p = Store.getJSON(KEYS.progress, null), out = {};
      PAGES.forEach(k => { out[k] = !!(p && typeof p === "object" && p[k] === true); });
      return out;
    },
    unlock(page) {
      if (PAGES.indexOf(page) < 0) return false;
      const p = Progress.read(); p[page] = true;
      return Store.setJSON(KEYS.progress, p);
    },
    isUnlocked(page) { return Progress.read()[page] === true; }
  };
  S.Progress = Progress;

  // ---- which page is this? "letter" | "memories" | "inbox", or null (index.html, or anything else). Works for
  // letter.html, /letter.html and extensionless /letter hosting, and for any href (pass a pathname).
  function pageOf(pathname) {
    let seg = String(pathname || "").split("/").pop();
    try { seg = decodeURIComponent(seg); } catch (e) { /* keep raw */ }
    seg = seg.replace(/\.html?$/i, "");
    return PAGES.indexOf(seg) >= 0 ? seg : null;
  }
  const currentPage = () => pageOf(location.pathname);

  // ---- inbox "unread" mark: she has an unread reply until she has visited the inbox page. Persisted (the old
  // dialog's badge was in-memory only); derived from the saved reply + one "seen" flag so no second copy of state.
  const Inbox = {
    hasUnread() {
      const r = Store.getJSON(KEYS.reply, null);
      return !!(r && typeof r === "object") && Store.get(KEYS.inboxSeen, null) !== "1";
    },
    markSeen() { Store.set(KEYS.inboxSeen, "1"); if (S.Chrome) S.Chrome.refresh(); }
  };
  S.Inbox = Inbox;

  // ---- page guards: a page file calls Surprise.Guard.require("memories") on load ----
  // Rules: letter needs a saved sign-up (Yes); memories + inbox need the unlock that the reply sets. Not allowed ->
  // sign-up (index.html) if she never signed up, else letter.html. The target is never the page itself, so no loop
  // (letter's only fallback is index.html; index.html is not guarded by this function). A saved sign-up / reply
  // whose progress flag went missing self-heals instead of bouncing her.
  const Guard = {
    target(page) {
      if (PAGES.indexOf(page) < 0 || Progress.isUnlocked(page)) return null;
      const su = Store.getJSON(KEYS.signup, null), signedUp = !!(su && su.yes);
      if (page === "letter") { if (signedUp) { Progress.unlock("letter"); return null; } return "index.html"; }
      const rep = Store.getJSON(KEYS.reply, null);
      if (signedUp && rep && typeof rep === "object") { Progress.unlock("memories"); Progress.unlock("inbox"); return null; }
      return signedUp ? "letter.html" : "index.html";
    },
    // true = stay; false = she is being redirected (location.replace, so the guarded URL isn't left in history)
    require(page) {
      const to = Guard.target(page);
      if (!to) return true;
      if (pageOf(to) === page) return true; // belt and braces against a loop
      location.replace(to);
      return false;
    }
  };
  S.Guard = Guard;

  // ---- theme toggle (colorful <-> minimal neutral); with no saved choice the CSS follows the system setting ----
  // binds whichever of the floating #theme (index.html) / header #hdr-theme exists on this page
  const root = document.documentElement;
  const tbtns = ["theme", "hdr-theme"].map(id => document.getElementById(id)).filter(Boolean);
  const sysDark = matchMedia("(prefers-color-scheme: dark)");
  const t = Store.get(KEYS.theme, null);
  if (t === "light" || t === "dark") root.dataset.theme = t;
  if (tbtns.length) {
    const isDark = () => root.dataset.theme ? root.dataset.theme === "dark" : sysDark.matches;
    const paint = () => { const d = isDark(); tbtns.forEach(b => { b.textContent = d ? "\u2600" : "\u263E"; b.setAttribute("aria-pressed", d); }); };
    tbtns.forEach(b => b.addEventListener("click", () => {
      root.dataset.theme = isDark() ? "light" : "dark";
      Store.set(KEYS.theme, root.dataset.theme);
      paint();
    }));
    sysDark.addEventListener("change", paint);
    paint();
  }

  // ---- backend send queue: used by the sign-up and letter pages ----
  // text/plain + no-cors (Apps Script web apps don't handle a CORS preflight); the response is opaque,
  // so a rejected promise is the only failure signal. Failures are queued and never shown to her.
  const Send = {
    queue(payload) {
      const q = Store.getJSON(KEYS.pending, []);
      if (!Array.isArray(q)) return;
      q.push(payload);
      Store.setJSON(KEYS.pending, q);
    },
    send(payload) {
      if (!S.APPS_SCRIPT_URL) { Send.queue(payload); return; } // nothing deployed yet (see backend/SETUP.md)
      try {
        fetch(S.APPS_SCRIPT_URL, { method: "POST", mode: "no-cors", headers: { "Content-Type": "text/plain" }, body: JSON.stringify(payload) })
          .catch(err => { console.warn("surprise-kit: send failed, queued for retry", err); Send.queue(payload); });
      } catch (err) { console.warn("surprise-kit: send failed, queued for retry", err); Send.queue(payload); }
    },
    flush() {
      if (!S.APPS_SCRIPT_URL) return;
      const queue = Store.getJSON(KEYS.pending, []);
      if (!Array.isArray(queue) || !queue.length) return;
      Store.remove(KEYS.pending);
      queue.forEach(Send.send); // any that fail again just re-queue themselves
    }
  };
  S.Send = Send;
  Send.flush();
  setTimeout(Send.flush, 20000); // one more quiet retry a little later; no need for backoff here

  // ---- music: one <audio> per page, resumed from the saved position after each navigation ----
  // A real page change destroys the element, so every page re-creates it and seeks to the saved time
  // (a short audible gap is unavoidable). Saved record: { id, time, muted, ts } under KEYS.music;
  // KEYS.muted stays the source of truth for the mute preference.
  const SAVE_EVERY_MS = 1500;
  const labels = () => (S.CONFIG && S.CONFIG.music) || {};
  let mutedPref = Store.get(KEYS.muted, null) === "1";
  let audioEl = null, trackId = null, wantPlay = false, pendingSeek = null, lastSave = 0, blocked = false;
  let muteBtn = null;

  function tracks() { return Array.isArray(S.MUSIC) ? S.MUSIC : []; }
  function emit(name) { try { document.dispatchEvent(new CustomEvent(name)); } catch (e) { /* no CustomEvent: signal is also on Music.blocked */ } }

  function setBlocked(v) {
    if (blocked === v) return;
    blocked = v; Music.blocked = v;
    if (v) armGesture();
    emit("surprise:music-blocked-change");
  }
  // while blocked, the next real gesture anywhere retries play() (the header's tap button just calls Music.resume())
  let gestureArmed = false;
  function armGesture() {
    if (gestureArmed) return;
    gestureArmed = true;
    const go = () => {
      document.removeEventListener("pointerdown", go, true); document.removeEventListener("keydown", go, true);
      gestureArmed = false;
      if (blocked) Music.resume();
    };
    document.addEventListener("pointerdown", go, true); document.addEventListener("keydown", go, true);
  }

  function getAudioEl() {
    if (audioEl) return audioEl;
    audioEl = document.createElement("audio");
    audioEl.loop = true; audioEl.volume = 0.15; audioEl.muted = mutedPref;
    audioEl.addEventListener("error", () => {}); // a missing placeholder track must never throw or block the UI
    audioEl.addEventListener("loadedmetadata", applySeek);
    audioEl.addEventListener("playing", () => setBlocked(false));
    audioEl.addEventListener("timeupdate", () => { if (Date.now() - lastSave >= SAVE_EVERY_MS) save(); });
    (document.body || document.documentElement).appendChild(audioEl);
    return audioEl;
  }

  function applySeek() {
    if (pendingSeek === null || !audioEl) return;
    const d = audioEl.duration;
    let t = pendingSeek;
    if (!isFinite(t) || t < 0 || (isFinite(d) && d > 0 && t >= d)) t = 0; // past the end (or junk): wrap to the start
    pendingSeek = null;
    try { audioEl.currentTime = t; } catch (e) { /* not seekable yet */ }
  }

  function save() {
    if (!trackId) return;
    lastSave = Date.now();
    const t = audioEl && isFinite(audioEl.currentTime) ? audioEl.currentTime : 0;
    Store.setJSON(KEYS.music, { id: trackId, time: Math.round(t * 10) / 10, muted: mutedPref, ts: lastSave });
  }

  function tryPlay() {
    if (!audioEl) return Promise.resolve(false);
    let p;
    try { p = audioEl.play(); } catch (e) { return Promise.resolve(false); }
    if (!p || typeof p.then !== "function") return Promise.resolve(true);
    return p.then(() => { setBlocked(false); return true; }, err => {
      // only a real autoplay refusal counts as "needs a tap"; a missing/unsupported file or an aborted load does not
      if (err && err.name === "NotAllowedError") setBlocked(true);
      return false;
    });
  }

  function paintMute() {
    if (!muteBtn) return;
    const L = labels();
    muteBtn.textContent = mutedPref ? "\u{1F507}" : "\u{1F50A}";
    muteBtn.setAttribute("aria-pressed", String(mutedPref));
    muteBtn.setAttribute("aria-label", (mutedPref ? L.unmute : L.mute) || (mutedPref ? "Unmute music" : "Mute music"));
  }

  const Music = {
    blocked: false,
    // start (or switch to) a track. With no explicit `time`, resumes the saved position if the saved record is for this same track.
    start(id, time) {
      const list = tracks();
      const track = list.find(m => m.id === id) || list[0];
      if (!track) return Promise.resolve(false);
      const el = getAudioEl();
      const changed = trackId !== track.id || el.getAttribute("src") !== track.file;
      trackId = track.id; wantPlay = true;
      if (changed) {
        let t = time;
        if (t === undefined) { const rec = Store.getJSON(KEYS.music, null); t = rec && rec.id === track.id && typeof rec.time === "number" ? rec.time : 0; }
        pendingSeek = t > 0 ? t : null;
        el.src = track.file;
        if (el.readyState > 0) applySeek();
      }
      return tryPlay();
    },
    // retry play() after a block; call from a user gesture (e.g. the header's "tap to resume" button)
    resume() { return audioEl && trackId ? tryPlay() : Promise.resolve(false); },
    pause() { wantPlay = false; if (audioEl) try { audioEl.pause(); } catch (e) { /* ignore */ } save(); },
    isMuted() { return mutedPref; },
    setMuted(m) {
      mutedPref = !!m;
      if (audioEl) audioEl.muted = mutedPref;
      Store.set(KEYS.muted, mutedPref ? "1" : "0");
      paintMute(); save();
      emit("surprise:music-mute-change");
      if (!mutedPref) Music.resume(); // un-muting is a user gesture; worth another try
    },
    toggleMute() { Music.setMuted(!mutedPref); return mutedPref; },
    currentTrack() { return trackId; },
    // the header can subscribe: cb(blocked) fires whenever the autoplay-blocked state changes
    onBlockedChange(cb) { document.addEventListener("surprise:music-blocked-change", () => cb(blocked)); },
    // wire a mute button (a page's header button); with no argument, uses #mute or creates a floating one
    bindMuteButton(btn) {
      if (!btn) return null;
      muteBtn = btn;
      btn.addEventListener("click", () => Music.toggleMute());
      paintMute();
      return btn;
    },
    ensureMuteButton() {
      if (muteBtn) return muteBtn;
      let b = document.getElementById("mute");
      if (!b) {
        b = document.createElement("button");
        b.type = "button"; b.id = "mute"; b.className = "mute";
        document.body.appendChild(b);
      }
      return Music.bindMuteButton(b);
    }
  };
  S.Music = Music;

  // save on pagehide and when the tab is hidden (mobile/Safari often fire only the latter); timeupdate covers the rest
  window.addEventListener("pagehide", save);
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "hidden") save(); });

  // ---- shared chrome: header / footer wiring, locked nav, fade-on-navigate ----
  // Everything is guarded by element lookups, so on index.html (no header) it quietly does nothing.
  const FADE_MS = 200; // matches `body.page-leaving` in style.css
  const reduceMotionQ = matchMedia("(prefers-reduced-motion: reduce)");
  const siteCfg = () => (S.CONFIG && S.CONFIG.site) || {};
  const byId = id => document.getElementById(id);
  const navLinks = () => PAGES.map(p => ({ page: p, el: byId("nav-" + p) })).filter(x => x.el);
  let leaving = false, hintTimer = 0, footerSaved = null;

  const Chrome = {
    // repaint everything that depends on progress / current page / unread; safe to call any time
    refresh() {
      const c = siteCfg(), cur = currentPage(), labels = c.labels || {};
      navLinks().forEach(({ page, el }) => {
        if (c.nav && c.nav[page]) el.textContent = c.nav[page];
        const here = page === cur, locked = !Progress.isUnlocked(page) && !here;
        el.classList.toggle("is-current", here);
        if (here) el.setAttribute("aria-current", "page"); else el.removeAttribute("aria-current");
        el.classList.toggle("is-locked", locked);
        if (locked) el.setAttribute("aria-disabled", "true"); else el.removeAttribute("aria-disabled");
      });
      const inboxBtn = byId("hdr-inbox"), badge = byId("hdr-inbox-badge");
      if (inboxBtn) {
        const lockedInbox = !Progress.isUnlocked("inbox") && cur !== "inbox";
        if (lockedInbox) inboxBtn.setAttribute("aria-disabled", "true"); else inboxBtn.removeAttribute("aria-disabled");
        const unread = !lockedInbox && cur !== "inbox" && Inbox.hasUnread();
        if (badge) badge.hidden = !unread;
        const lab = unread ? labels.inboxNew : labels.inbox;
        if (lab) inboxBtn.setAttribute("aria-label", lab);
      }
    },
    // gentle "why can't I click this" note: shown briefly in the footer line (an existing styled, aria-live slot)
    hint(page) {
      const el = byId("site-footer-text"), c = siteCfg(), msg = c.locked && c.locked[page];
      if (!el || !msg) return;
      if (footerSaved === null) footerSaved = el.textContent;
      el.setAttribute("role", "status"); el.setAttribute("aria-live", "polite");
      el.textContent = msg;
      clearTimeout(hintTimer);
      hintTimer = setTimeout(() => { el.textContent = footerSaved; footerSaved = null; }, 3500);
    },
    // fade the page out, then go (immediately under reduced motion, which keeps .page-leaving at opacity 1)
    go(href) {
      if (leaving) return;
      leaving = true;
      document.body.classList.add("page-leaving");
      const delay = reduceMotionQ.matches ? 0 : FADE_MS;
      setTimeout(() => { location.assign(href); }, delay);
      // if we are still here a few seconds later (blocked / failed navigation), never stay faded out
      setTimeout(() => Chrome.restore(), delay + 4000);
    },
    restore() { leaving = false; if (document.body) document.body.classList.remove("page-leaving"); }
  };
  S.Chrome = Chrome;

  function onLinkClick(e) {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    const a = e.target && e.target.closest ? e.target.closest("a[href]") : null;
    if (!a) return;
    let u;
    try { u = new URL(a.getAttribute("href"), location.href); } catch (err) { return; }
    // locked pages never navigate, however she got to the link (nav, header envelope, any future link)
    const page = pageOf(u.pathname);
    if (page && u.origin === location.origin && !Progress.isUnlocked(page) && page !== currentPage()) {
      e.preventDefault(); Chrome.hint(page); return;
    }
    const tgt = a.getAttribute("target");
    if ((tgt && tgt !== "_self") || a.hasAttribute("download")) return;
    if (u.protocol !== location.protocol || u.origin !== location.origin) return; // external, mailto:, javascript: ...
    if (u.hash && u.href.split("#")[0] === location.href.split("#")[0]) return;   // in-page anchor
    e.preventDefault();
    Chrome.go(u.href);
  }

  function initChrome() {
    const c = siteCfg(), cur = currentPage();
    if (cur && c.titles && c.titles[cur]) document.title = c.titles[cur];
    const brand = byId("brand"), foot = byId("site-footer-text"), nav = document.querySelector("#site-header .hdr-nav");
    if (brand && c.brand) brand.textContent = c.brand;
    if (foot && c.footer) foot.textContent = c.footer;
    if (nav && c.labels && c.labels.pages) nav.setAttribute("aria-label", c.labels.pages);
    const th = byId("hdr-theme"); if (th && c.labels && c.labels.theme) th.setAttribute("aria-label", c.labels.theme);
    if (cur === "inbox" && Progress.isUnlocked("inbox")) Store.set(KEYS.inboxSeen, "1"); // visiting the inbox = seen
    Chrome.refresh();
    // header music controls (bound before ensureMuteButton so it never makes a second, floating mute button)
    Music.bindMuteButton(byId("hdr-mute"));
    const rs = byId("hdr-resume");
    if (rs) {
      const L = labels();
      if (L.resume) rs.textContent = L.resume;
      const paintResume = b => { rs.hidden = !b; };
      rs.addEventListener("click", () => { Music.resume(); });
      Music.onBlockedChange(paintResume);
      paintResume(Music.blocked);
    }
    window.addEventListener("storage", Chrome.refresh); // another tab unlocked something
  }
  // links work on every page (index.html has none to intercept); bfcache restore must not stay faded
  document.addEventListener("click", onLinkClick);
  window.addEventListener("pageshow", () => { Chrome.restore(); Chrome.refresh(); });

  // ---- drifting dust and petals (decorative #air); ONE implementation shared by index.html and letter.html ----
  S.Air = {
    init() {
      const air = byId("air");
      if (!air || air.childElementCount) return;
      for (let i = 0; i < 18; i++) {
        const s = document.createElement("span"), size = 3 + Math.random() * 5, petal = i % 4 === 0;
        if (petal) { s.className = "pt"; s.style.width = s.style.height = size * 2 + "px"; } else { s.style.width = s.style.height = size / 1.6 + "px"; }
        s.style.left = Math.random() * 100 + "vw"; s.style.setProperty("--dx", (Math.random() * 16 - 8) + "vw");
        s.style.animationDuration = 16 + Math.random() * 14 + "s"; s.style.animationDelay = -Math.random() * 30 + "s";
        air.appendChild(s);
      }
    }
  };

  // resume after a navigation: a saved record means a track was playing on the previous page
  function init() {
    initChrome();
    S.Air.init();
    Music.ensureMuteButton();
    const rec = Store.getJSON(KEYS.music, null);
    if (rec && typeof rec === "object" && typeof rec.id === "string") Music.start(rec.id); // unknown id falls back to the first track
  }
  if (document.body) init(); else document.addEventListener("DOMContentLoaded", init);
})();
