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

  // every key the site owns. `theme` is deliberately NOT in RESET_KEYS: it is a preference, not progress.
  //   surprise-account  the stand-in for the server's Account row (her profile + secret word + progress copy + reply);
  //                     written only by js/api.js's local driver, cleared only by a full reset
  //   surprise-session  this device is logged in: { v:1, token, ts } (in Phase B `token` is the server's session token)
  //   surprise-schema   data-layout version (SCHEMA); a mismatch wipes the old keys once, see the migration below
  const KEYS = { signup: "surprise-signup", reply: "surprise-reply", pending: "surprise-pending-sends", muted: "surprise-muted", progress: "surprise-progress", music: "surprise-music", inboxSeen: "surprise-inbox-seen", account: "surprise-account", session: "surprise-session", avatar: "surprise-avatar", schema: "surprise-schema", theme: "theme" };
  S.KEYS = KEYS;
  const RESET_KEYS = [KEYS.signup, KEYS.reply, KEYS.pending, KEYS.progress, KEYS.inboxSeen, KEYS.account, KEYS.session, KEYS.avatar];
  const SCHEMA = "2";

  // ---- reset: ?reset=1 OR #reset (also #reset=1) clears everything except `theme`. A hash is never sent to the server,
  // so it survives a dev server that strips the query. Runs here, before anything reads storage, on every page.
  // The flag is then stripped with replaceState so a reload does not wipe her progress again.
  let resetting = false; // set by reset(), so a page teardown cannot write cleared state straight back
  function clearAll() { RESET_KEYS.forEach(k => Store.remove(k)); }
  function hasResetFlag() {
    return /(?:^|[?&])reset=1(?:&|$)/.test(location.search) || /^#reset(?:=1)?$/.test(location.hash);
  }
  function stripResetFlag() {
    try {
      const q = location.search.replace(/([?&])reset=1(?:&|$)/, (m, lead) => (m.slice(-1) === "&" ? lead : "")).replace(/[?&]$/, "");
      const hash = /^#reset(?:=1)?$/.test(location.hash) ? "" : location.hash;
      history.replaceState(history.state, "", location.pathname + q + hash);
    } catch (e) { /* replaceState blocked: a reload would wipe again, nothing more to do */ }
  }
  S.reset = function () { // console helper: Surprise.reset(), then reload
    resetting = true; clearAll(); Store.set(KEYS.schema, SCHEMA);
    return "surprise-kit: cleared (theme kept). Reload the page.";
  };
  if (hasResetFlag()) { clearAll(); stripResetFlag(); }
  // Typing #reset while already on that page is a hash change, not a navigation, so nothing above
  // re-runs and it looks broken (QA). Catch it and reload so the flag is honoured from the top.
  addEventListener("hashchange", () => {
    if (!hasResetFlag()) return;
    resetting = true; clearAll(); stripResetFlag(); location.reload();
  });

  // ---- schema migration: the build before Phase 5 has no secret word and an old `yes:true` that would skip the
  // proposal, so it cannot be converted. On a missing/older schema value, wipe the old keys ONCE (keeping `theme` and
  // the mute preference), then stamp the version. She has not received the site yet, so nothing real is lost.
  if (Store.get(KEYS.schema, null) !== SCHEMA) {
    [KEYS.signup, KEYS.reply, KEYS.pending, KEYS.progress, KEYS.inboxSeen, KEYS.account, KEYS.session].forEach(k => Store.remove(k));
    Store.set(KEYS.schema, SCHEMA);
  }

  // ---- progress: which pages are unlocked. proposal after a finished sign-up/login; letter after `accepted` (Yes);
  // memories + inbox after the reply.
  const PAGES = ["letter", "memories", "inbox"];                      // the pages the header nav knows
  const FLOW = ["proposal", "letter", "memories", "inbox"];           // everything with an unlock flag
  const LANDING = ["memories", "letter", "proposal"];                 // furthest first; inbox is a side page, never a landing target
  const Progress = {
    // { proposal, letter, memories, inbox, accepted } - always all five booleans
    read() {
      const p = Store.getJSON(KEYS.progress, null), out = {};
      FLOW.concat("accepted").forEach(k => { out[k] = !!(p && typeof p === "object" && p[k] === true); });
      return out;
    },
    // unlock one page. Compat: the current index/letter pages still call unlock("letter") / unlock("memories") directly.
    unlock(page) {
      if (FLOW.indexOf(page) < 0) return false;
      const p = Progress.read(); p[page] = true;
      return Store.setJSON(KEYS.progress, p);
    },
    isUnlocked(page) { return FLOW.indexOf(page) >= 0 && Progress.read()[page] === true; },
    // Yes was pressed: sets `accepted` and unlocks the letter together
    accept() { const p = Progress.read(); p.accepted = true; p.letter = true; return Store.setJSON(KEYS.progress, p); },
    isAccepted() { return Progress.read().accepted === true; },
    // the last page she unlocked ("memories" | "letter" | "proposal"), or null; used to send her onward after login
    furthest() { const p = Progress.read(); return LANDING.find(k => p[k]) || null; },
    // replace local progress with a copy (e.g. the server's, after login on a new device); junk is ignored
    apply(obj) {
      const p = {};
      FLOW.concat("accepted").forEach(k => { p[k] = !!(obj && typeof obj === "object" && obj[k] === true); });
      return Store.setJSON(KEYS.progress, p);
    }
  };
  S.Progress = Progress;

  // ---- session: this device is logged in. Kept apart from the account (which stands in for the server) so Phase A
  // mirrors Phase B. "Not me / start fresh" clears only the session.
  const Session = {
    get() { const s = Store.getJSON(KEYS.session, null); return s && typeof s === "object" ? s : null; },
    isActive() { return !!Session.get(); },
    start(token) { return Store.setJSON(KEYS.session, { v: 1, token: token || null, ts: Date.now() }); },
    clear() { return Store.remove(KEYS.session); }
  };
  S.Session = Session;

  // ---- which page is this? "proposal" | "login" | "letter" | "memories" | "inbox", or null (index.html, anything else).
  // Works for letter.html, /letter.html and extensionless /letter hosting, and for any href (pass a pathname).
  const KNOWN = FLOW.concat("login");
  function pageOf(pathname) {
    let seg = String(pathname || "").split("/").pop();
    try { seg = decodeURIComponent(seg); } catch (e) { /* keep raw */ }
    seg = seg.replace(/\.html?$/i, "");
    return KNOWN.indexOf(seg) >= 0 ? seg : null;
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
  // Rules (flag-based; the "accepted" flag is never inferred from old data):
  //   proposal  needs a finished sign-up or login (its unlock flag)  -> else index.html (which shows sign-up or login)
  //   letter    needs `accepted` (Yes), or the letter flag it sets    -> else proposal.html if open, else index.html
  //   memories, inbox  need the unlock the reply sets (a saved reply heals a missing flag) -> else letter.html / proposal.html / index.html
  //   login     the one page that is for logged-OUT visitors: logged in -> her furthest page; no account -> index.html
  // The target is never the page itself, so there is no loop: each fallback is strictly "earlier" in the flow
  // (memories -> letter -> proposal -> index), and index.html and login's onward target are never guarded by a
  // later rule that points back.
  const HREF = p => p + ".html";
  const Guard = {
    // where she belongs when she is NOT allowed on `page`: the furthest open page, or index.html
    onward() { const f = Progress.furthest(); return f ? HREF(f) : "index.html"; },
    target(page) {
      if (page === "login") {
        if (Session.isActive() && Progress.furthest()) return Guard.onward();
        if (!Store.getJSON(KEYS.account, null)) return "index.html";
        return null;
      }
      if (FLOW.indexOf(page) < 0 || Progress.isUnlocked(page)) return null;
      if (page === "proposal") return "index.html";
      if (page === "letter") return Progress.isAccepted() ? (Progress.unlock("letter"), null) : (Progress.isUnlocked("proposal") ? "proposal.html" : "index.html");
      // memories / inbox
      const rep = Store.getJSON(KEYS.reply, null);
      if (rep && typeof rep === "object" && Progress.isUnlocked("letter")) { Progress.unlock("memories"); Progress.unlock("inbox"); return null; }
      return Progress.isUnlocked("letter") ? "letter.html" : (Progress.isUnlocked("proposal") ? "proposal.html" : "index.html");
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
    if (page && FLOW.indexOf(page) >= 0 && u.origin === location.origin && !Progress.isUnlocked(page) && page !== currentPage()) {
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
  // ---- the music panel: the Spotify playlist, reachable from every page ---------------------
  // Deliberately a player she presses herself. An embed is an iframe, so it stops on every page
  // change and will not play hidden - there is no background soundtrack to pair it with.
  const Tunes = {
    build() {
      const cfg = (S.CONFIG && S.CONFIG.music) || {};
      const embed = Tunes.spotify(cfg);
      if (!embed) return; // no playlist configured: no button, no panel

      const btn = document.createElement("button");
      btn.type = "button"; btn.id = "tunes"; btn.className = "tunes";
      btn.setAttribute("aria-label", cfg.pick || "Music");
      btn.setAttribute("aria-expanded", "false");
      btn.textContent = "♫";

      const actions = document.getElementById("hdr-actions") || document.querySelector(".hdr-actions");
      if (actions) { btn.classList.add("hdr-btn"); actions.insertBefore(btn, actions.firstChild); }
      else { btn.classList.add("tunes-float"); document.body.appendChild(btn); }

      const panel = document.createElement("div");
      panel.className = "tunes-panel"; panel.id = "tunes-panel"; panel.hidden = true;
      panel.setAttribute("role", "dialog"); panel.setAttribute("aria-label", cfg.panelTitle || "Music");
      if (cfg.panelTitle) {
        const h = document.createElement("p");
        h.className = "tunes-title"; h.textContent = cfg.panelTitle;
        panel.appendChild(h);
      }
      panel.appendChild(embed);
      document.body.appendChild(panel);

      const close = () => { panel.hidden = true; btn.setAttribute("aria-expanded", "false"); };
      btn.addEventListener("click", e => {
        e.stopPropagation();
        const open = panel.hidden;
        panel.hidden = !open;
        btn.setAttribute("aria-expanded", String(open));
      });
      document.addEventListener("click", e => {
        if (panel.hidden) return;
        if (!panel.contains(e.target) && e.target !== btn) close();
      });
      document.addEventListener("keydown", e => { if (e.key === "Escape" && !panel.hidden) { close(); btn.focus(); } });
    },

    // Accepts a share link or a bare id. Returns null when nothing is configured.
    spotify(cfg) {
      const raw = String(S.SPOTIFY_PLAYLIST || "").trim();
      if (!raw) return null;
      const m = raw.match(/playlist[/:]([A-Za-z0-9]+)/) || raw.match(/^([A-Za-z0-9]{16,})$/);
      if (!m) return null;
      const wrap = document.createElement("div");
      wrap.className = "tunes-spotify";
      const f = document.createElement("iframe");
      f.src = "https://open.spotify.com/embed/playlist/" + m[1] + "?utm_source=generator";
      f.width = "100%"; f.height = "352"; f.loading = "lazy"; f.frameBorder = "0";
      f.allow = "autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture";
      f.setAttribute("title", cfg.panelTitle || "Spotify");
      wrap.appendChild(f);
      return wrap;
    }
  };
  S.Tunes = Tunes;

  function init() {
    initChrome();
    S.Air.init();
    Tunes.build();
  }
  if (document.body) init(); else document.addEventListener("DOMContentLoaded", init);
})();
