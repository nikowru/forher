// The letter, delivered as an overlay on the memories page (#letter-over in memories.html): the notification
// pops, the envelope falls in over a dimmed, inert gallery, then seal -> letter -> she puts it away (#go) -> fold
// into the header inbox -> the light-up, which hands the page back to the gallery underneath. There is no reply on the
// letter any more: she writes to him from her card whenever she likes.
// Classic script; needs js/config.js, js/common.js and js/memories.js first.
//
// Once she has put it away it never shows at all: the gallery is simply there, lit, and js/memories.js runs alone.
// That is why there is no returning-visitor branch here any more - the old letter.html had one because the
// letter WAS the page; here, "already put away" just means no overlay.
(function () {
  const S = window.Surprise;
  if (!S || !S.Store || !S.Guard) return;
  const { Store, Progress, CONFIG, KEYS } = S;
  const $ = id => document.getElementById(id);
  const over = $("letter-over");
  const stage = $("stage"), scene = $("scene"), seal = $("seal"), letter = $("letter"), text = $("text");
  const go = $("go");
  if (!over || !stage || !scene || !seal || !letter || !text || !go) return; // not the host page
  // the page turns; without them (an older memories.html still cached) a long letter scrolls instead, as it used to
  const prev = $("leaf-prev"), next = $("leaf-next"), count = $("leaf-count");
  const canPage = !!(prev && next && count);
  if (S.Guard.target("memories")) return;        // she does not belong here; memories.js is already redirecting
  // "Already put away" has two sources. This device's copy is the usual one, but after signing in on a NEW
  // device that copy is empty while the account knows better - and the inbox flag comes down with the
  // profile. Without the second test the letter would arrive all over again on her phone.
  if (Store.getJSON(KEYS.reply, null) || Progress.isUnlocked("inbox")) return; // the gallery stands alone

  const host = $("main"), nav = document.querySelector(".hdr-nav");
  // the gallery is visible the whole time but must not be clickable or tabbable behind the letter
  const holdPage = on => {
    document.body.classList.toggle("letter-open", on);
    [host, nav].forEach(el => { if (el) el.inert = on; });
  };
  over.hidden = false;
  holdPage(true);

  const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)");
  // She has opened the envelope before but not put the letter away yet (she wandered off, or reloaded). The letter
  // still has to be here - putting it away is what unlocks the rest - but making her watch it arrive a second time
  // is the bug she reported. So on a return it is simply already open, waiting for her.
  const seen = Store.get(KEYS.letterSeen, "") === "1";

  // ---- wording (all from CONFIG) ----
  $("title").textContent = CONFIG.heading; // the page title stays "Our memories": this is a layer on that page
  $("hint").textContent = CONFIG.hint;
  seal.setAttribute("aria-label", CONFIG.labels.seal);
  CONFIG.letter.forEach(t => { const p = document.createElement("p"); p.textContent = t; text.appendChild(p); });
  go.textContent = CONFIG.button;
  text.setAttribute("role", "region"); text.setAttribute("aria-label", CONFIG.labels.letter);
  if (canPage) { prev.setAttribute("aria-label", CONFIG.labels.pagePrev); next.setAttribute("aria-label", CONFIG.labels.pageNext); }

  // ---- the letter fits its sheet, so she never has to scroll it ----
  // CSS sizes the words from the sheet itself (container units in style.css), which is all a letter of ordinary
  // length needs: a plain portrait page. A little longer, and it is made to fit gently, checking after each step:
  //   1. the sheet widens a little, still a portrait page        (--ratio, on .letter-over: .76 up to .92)
  //   2. the words come down a little, still comfortable          (--fit: down to .85)
  // Longer than that, and it is not squeezed any further: it becomes a letter of several pages, each the plain
  // portrait sheet at a comfortable size, read a page at a time (see "pages" below). It all happens with the sheet's
  // own transition off, so every measurement is of the final size, and before the words fade up, so she never sees
  // them move.
  const overflows = () => text.scrollHeight > text.clientHeight + 1;
  function fit() {
    let ratio = 0.76, k = 1;
    const set = () => { over.style.setProperty("--ratio", String(ratio)); letter.style.setProperty("--fit", String(k)); };
    const widen = to => {
      while (overflows() && ratio < to) {
        const was = letter.offsetWidth;
        ratio = Math.round((ratio + 0.04) * 100) / 100; set();
        if (letter.offsetWidth <= was) break;   // the screen's edge: wider is not possible here
      }
    };
    const shrink = to => { while (overflows() && k > to) { k = Math.round((k - 0.03) * 100) / 100; set(); } };
    letter.classList.add("is-fitting");
    letter.classList.remove("is-paged");
    set();
    widen(0.92); shrink(0.85);
    if (overflows() && canPage) { ratio = 0.76; k = 1; set(); paginate(); }
    else if (overflows()) { widen(1.4); shrink(0.6); }   // no page turns to hand: the old squeeze, then it scrolls
    else pages = 1;
    void letter.offsetWidth;
    letter.classList.remove("is-fitting");
  }

  // ---- pages: a letter longer than one sheet is read a page at a time ----
  // In .is-paged (style.css) the words run on in columns exactly one sheet wide, so a paragraph carries over to the
  // next page line by line, as on paper, and the text box shows one column. Turning a page is scrolling that box
  // sideways by one sheet. She never scrolls it by hand (its overflow is hidden); the one other thing that can move it,
  // the browser's find-in-page bringing a word into view, is followed to the page that word is on rather than fought.
  // Every page stays in the document, so a screen reader reads the letter straight through.
  let pages = 1, pageAt = 0, turning = false, goReadyAt = 0;
  const sheetStep = () => text.getBoundingClientRect().width;   // one sheet, to the fraction of a pixel
  const fill = (s, n) => String(s || "").replace("{n}", n).replace("{total}", pages);
  function paginate() {
    letter.classList.add("is-paged");
    const step = sheetStep();
    pages = Math.max(1, Math.round(text.scrollWidth / step));
    pageAt = Math.min(pageAt, pages - 1);   // after a resize: as near her place as the new pages allow
    text.scrollLeft = Math.round(pageAt * step);
  }
  function paintLeaf() {
    if (!canPage) return;
    const paged = pages > 1, last = pageAt >= pages - 1, had = document.activeElement, goWasHidden = go.hidden;
    prev.hidden = count.hidden = !paged;
    next.hidden = !paged || last;
    prev.disabled = pageAt === 0;
    go.hidden = paged && !last;   // she puts it away once she has reached the end
    letter.classList.toggle("past-first", paged && pageAt > 0);   // the flourish belongs to the first page
    if (paged) {
      const seen = document.createElement("span"), said = document.createElement("span");
      seen.setAttribute("aria-hidden", "true"); seen.textContent = fill(CONFIG.labels.page, pageAt + 1);
      said.className = "pf-sr"; said.textContent = fill(CONFIG.labels.pageSpoken, pageAt + 1);
      count.replaceChildren(seen, said);
    }
    // Continue takes the next arrow's place on the last page. A quick second click meant for "next" must not land on
    // it and put the letter away unread, so it waits a moment before it answers.
    if (goWasHidden && !go.hidden && paged) goReadyAt = Date.now() + 600;
    // keyboard focus is never left on a control that has just gone: it moves to the one doing that job now
    if (had === next && next.hidden) go.focus({ preventScroll: true });
    else if (had === go && go.hidden) next.focus({ preventScroll: true });
    else if (had === prev && prev.disabled) next.focus({ preventScroll: true });
  }
  function turn(to) {
    to = Math.max(0, Math.min(pages - 1, to));
    if (to === pageAt || turning || done) return;
    const land = () => { pageAt = to; text.scrollLeft = Math.round(to * sheetStep()); paintLeaf(); };
    if (reduceMotion.matches || !text.animate) { land(); return; }
    // the words lift off, the page changes underneath, and the next words settle in from the side she is going
    turning = true;
    const dir = to > pageAt ? 1 : -1;
    const away = text.animate([{ opacity: 1, transform: "none" }, { opacity: 0, transform: `translateX(${-dir * 14}px)` }],
      { duration: 160, easing: "ease-in", fill: "forwards" });
    away.finished.then(() => {
      land();
      text.animate([{ opacity: 0, transform: `translateX(${dir * 14}px)` }, { opacity: 1, transform: "none" }],
        { duration: 260, easing: "ease-out" });
      away.cancel();
    }, () => {}).then(() => { turning = false; });
  }
  if (canPage) {
    prev.addEventListener("click", () => turn(pageAt - 1));
    next.addEventListener("click", () => turn(pageAt + 1));
    // the arrow keys and Page Up / Page Down turn the pages while the letter is open
    addEventListener("keydown", e => {
      if (pages < 2 || done || over.hidden || !scene.classList.contains("read") || e.altKey || e.ctrlKey || e.metaKey) return;
      const t = e.target;
      if (t && (t.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(t.tagName))) return;
      const by = { ArrowRight: 1, PageDown: 1, ArrowLeft: -1, PageUp: -1 }[e.key];
      if (!by) return;
      e.preventDefault();
      turn(pageAt + by);
    });
    // on a phone, a sideways swipe across the words (style.css leaves sideways moves on .is-paged text to this)
    let swipe = null;
    text.addEventListener("pointerdown", e => { swipe = e.pointerType === "mouse" ? null : { x: e.clientX, y: e.clientY }; });
    text.addEventListener("pointercancel", () => { swipe = null; });
    text.addEventListener("pointerup", e => {
      if (!swipe) return;
      const dx = e.clientX - swipe.x, dy = e.clientY - swipe.y;
      swipe = null;
      if (pages > 1 && Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy) * 1.5) turn(pageAt + (dx < 0 ? 1 : -1));
    });
    // find-in-page: follow it to the page it showed, squared up to that page's edge
    text.addEventListener("scroll", () => {
      if (pages < 2 || turning) return;
      const step = sheetStep(), n = Math.max(0, Math.min(pages - 1, Math.round(text.scrollLeft / step)));
      if (Math.abs(text.scrollLeft - n * step) > 1) text.scrollLeft = Math.round(n * step);
      if (n !== pageAt) { pageAt = n; paintLeaf(); }
    }, { passive: true });
  }
  // the last resort: a letter too long even at the floor scrolls inside the paper, and keyboard users can reach it
  let scrollWatch = false;
  const more = () => text.classList.toggle("more", text.scrollTop + text.clientHeight < text.scrollHeight - 2);
  function makeScrollable() {
    const scrolls = text.scrollHeight > text.clientHeight + 1;
    text.tabIndex = scrolls ? 0 : -1;   // -1: still focusable from here, so focus can land on the letter to read
    if (scrolls && !scrollWatch) { scrollWatch = true; text.addEventListener("scroll", more, { passive: true }); }
    more();
  }
  const settle = () => { fit(); makeScrollable(); paintLeaf(); };
  addEventListener("resize", () => { if (scene.classList.contains("read") && !over.hidden) settle(); });

  // ---- intro: dim the page, let the letter fall and the decorations unfold (pure CSS, see #stage.intro-dim:not(.intro-pre)),
  // slide the notification in once that has landed, then focus the seal ----
  stage.classList.add("intro-dim"); // the dim stays either way: the gallery waits until she has written back
  if (!seen) {
    stage.classList.add("intro-pre");
    // two rAFs so the pre-entrance state is painted at least once; otherwise the removal could be coalesced into the
    // same frame and the entrance animation would never run
    requestAnimationFrame(() => requestAnimationFrame(() => stage.classList.remove("intro-pre")));
    setTimeout(() => seal.focus({ preventScroll: true }), 2200);
  }

  // ---- notification (#notif): show = text, hidden=false, .is-in next frame; dismiss = remove .is-in, hidden=true after the slide ----
  const N = CONFIG.notify, notif = $("notif"), notifBtn = $("notif-btn"), notifText = $("notif-text");
  let notifState = "idle", notifTimer = 0; // idle -> shown -> gone
  function dismissNotif() {
    if (notifState !== "shown") return; // already dismissing/dismissed (or never shown): a second call does nothing
    notifState = "gone";
    clearTimeout(notifTimer); // a manual dismiss cancels the auto-dismiss
    notif.classList.remove("is-in");
    // hide after the 0.55s slide; a timer, not transitionend, so it also works when reduced motion skips the transition
    setTimeout(() => { notif.hidden = true; }, reduceMotion.matches ? 0 : 600);
  }
  function playNotifSound() {
    // blank path = no request at all. Muted = silent. Any failure (missing file, autoplay block) is swallowed.
    if (!N.sound) return;
    try {
      const a = new Audio(N.sound);
      a.volume = Math.max(0, Math.min(1, +N.volume || 0.4));
      a.addEventListener("error", () => {});
      const p = a.play();
      if (p && typeof p.catch === "function") p.catch(() => {});
    } catch (e) { /* silent */ }
  }
  function showNotif() {
    if (!notif || !notifBtn || !notifText || notifState !== "idle") return;
    notifState = "shown";
    notifText.textContent = N.text; // filled at show time so the live region announces it
    notif.hidden = false;
    requestAnimationFrame(() => requestAnimationFrame(() => { if (notifState === "shown") notif.classList.add("is-in"); }));
    notifTimer = setTimeout(dismissNotif, N.durationMs);
    playNotifSound();
  }
  if (notifBtn) notifBtn.addEventListener("click", dismissNotif);
  if (!seen) setTimeout(showNotif, N.delayMs); // it announced the letter once; it is not news any more

  // ---- the song (CONFIG.song): it starts as the letter arrives ----
  // Played once from the start, at the moment the notification pops, fading in. A browser may refuse sound before she
  // has touched this page: Chrome and Edge usually allow it here (she has just pressed Yes on the page before), Safari
  // and iPhones do not - so if it is refused, it starts on her first tap or key instead, which is usually the seal.
  // It steps aside (fades out and pauses) when anything else is about to make a sound: a clip opening, or the music
  // panel (both send "surprise:quiet"). The round button beside the music one pauses it and plays it again; it appears
  // once the song has started. Volume is the page's to set, except on an iPhone, which plays at the phone's own.
  const SONG = CONFIG.song || {};
  const song = SONG.file ? new Audio() : null;
  let songBtn = null, fadeTimer = 0;
  const num = (v, d) => (v == null || isNaN(+v) ? d : +v);
  const songVolume = () => Math.max(0, Math.min(1, num(SONG.volume, 0.5)));
  // a timer, not animation frames: those stop in a background tab, and a fade-out has to finish to pause
  function fadeSong(to, ms, then) {
    clearInterval(fadeTimer);
    const from = song.volume, t0 = Date.now();
    fadeTimer = setInterval(() => {
      const k = ms > 0 ? Math.min(1, (Date.now() - t0) / ms) : 1;
      song.volume = from + (to - from) * k;
      if (k >= 1) { clearInterval(fadeTimer); if (then) then(); }
    }, 40);
  }
  function paintSongBtn() {
    if (!songBtn) return;
    const playing = !song.paused, label = (playing ? SONG.pause : SONG.play) || "";
    songBtn.classList.toggle("is-playing", playing);
    songBtn.setAttribute("aria-label", label); songBtn.title = label;
  }
  function songButton() {   // made at the first play, when the header is certainly there
    if (songBtn) return;
    const actions = document.getElementById("hdr-actions") || document.querySelector(".hdr-actions");
    if (!actions) return;
    songBtn = document.createElement("button");
    songBtn.type = "button"; songBtn.id = "hdr-song"; songBtn.className = "hdr-btn hdr-song";
    const tunes = document.getElementById("tunes");
    actions.insertBefore(songBtn, tunes ? tunes.nextSibling : actions.firstChild);
    songBtn.addEventListener("click", () => { untilTouched(false); if (song.paused) playSong(); else hushSong(); });
    paintSongBtn();
    floatSong();
  }
  // While the letter is open, its dimmed backdrop covers the whole header, and nothing in the header can be lifted
  // above it. So the button floats over the backdrop, on the very spot its place in the header holds (a hidden
  // placeholder keeps that place), and settles back into the header as the page is handed back.
  let songSlot = null;
  function placeSong() {
    if (!songSlot) return;
    const r = songSlot.getBoundingClientRect();
    songBtn.style.left = r.left + "px"; songBtn.style.top = r.top + "px";
  }
  function floatSong() {
    if (!songBtn || songSlot || over.hidden) return;
    songSlot = document.createElement("span");
    songSlot.className = "hdr-btn hdr-song-slot"; songSlot.setAttribute("aria-hidden", "true");
    songBtn.replaceWith(songSlot);
    songBtn.classList.add("is-afloat"); over.appendChild(songBtn);
    placeSong();
    addEventListener("resize", placeSong);
  }
  function dockSong() {
    if (!songSlot) return;
    removeEventListener("resize", placeSong);
    songBtn.classList.remove("is-afloat"); songBtn.style.left = songBtn.style.top = "";
    songSlot.replaceWith(songBtn); songSlot = null;
  }
  // from where it is, fading up; true if it is playing, false if the browser said no
  function playSong() {
    song.volume = 0;
    let p;
    try { p = song.play(); } catch (e) { return Promise.resolve(false); }
    return Promise.resolve(p).then(() => {
      songButton(); paintSongBtn();
      fadeSong(songVolume(), num(SONG.fadeInMs, 3000));
      return true;
    }, () => false);
  }
  function hushSong() { if (song && !song.paused) fadeSong(0, num(SONG.fadeOutMs, 1200), () => song.pause()); }
  // waiting for her first touch: a click (a tap is one too) or a key, caught before anything else hears it. The music
  // button and this song's own button are left to do their own thing. Not every key counts as a touch to a browser
  // (Tab may not), so the waiting ends only once the song is actually playing.
  function onFirstTouch(e) {
    const t = e.target;
    if (!song.paused || (t && t.closest && t.closest("#tunes, #hdr-song"))) return;
    playSong().then(ok => { if (ok) untilTouched(false); });
  }
  function untilTouched(on) {
    ["click", "keydown"].forEach(type => window[on ? "addEventListener" : "removeEventListener"](type, onFirstTouch, true));
  }
  if (song) {
    song.preload = "auto";
    song.src = SONG.file;
    ["play", "pause", "ended"].forEach(type => song.addEventListener(type, paintSongBtn));
    song.addEventListener("error", () => { untilTouched(false); if (songBtn) songBtn.hidden = true; }); // a missing file stays silent
    setTimeout(() => {
      if (done && SONG.stopWhenPutAway) return;   // she was quicker than the notification
      playSong().then(ok => { if (!ok) untilTouched(true); });
    }, N.delayMs);
    // something else is about to make a sound: step aside, and do not start on a later touch either
    document.addEventListener("surprise:quiet", () => { untilTouched(false); hushSong(); });
  }

  // ---- seal -> letter ----
  // One opener for both ways in. `instant` is the return visit: the same end state with no choreography,
  // so she picks up exactly where she left off instead of watching the envelope open again.
  let opened = false;
  function openLetter(instant, byKeyboard) {
    if (opened) return; opened = true;
    Store.set(KEYS.letterSeen, "1"); // remembered from here on, so a reload does not replay the arrival
    seal.classList.add("broken"); seal.disabled = true; // gone from view, so gone from the Tab order too
    const at = (ms, fn) => (instant ? fn() : setTimeout(fn, ms));
    at(350, () => scene.classList.add("open"));
    at(800, () => scene.classList.add("flapback"));
    at(1250, () => { scene.classList.add("rise"); $("title").classList.add("fade"); $("hint").classList.add("fade"); });
    at(2500, () => {
      scene.classList.add("read");
      go.hidden = false;
      // the letter only becomes reachable once it can be read
      letter.inert = false;
    });
    // Settled: the sheet has finished growing to its full size (1.2s in style.css), so the words can be fitted to it
    // now and not before - and before they fade up (style.css holds them back until just after this). Keyboard
    // focus lands on the letter, and I arrive beside it with the flowers.
    // Under reduced motion nothing grows, so this is the same moment as the step above.
    at(reduceMotion.matches ? 2500 : 3800, () => {
      settle();
      if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { if (!over.hidden) settle(); });
      // Focus follows a keyboard (or a screen reader) onto the letter. Not a mouse: the seal it was resting on is gone,
      // and moving it would draw a focus ring round the words she is about to read; the page keys turn pages anyway.
      // On a return visit do not steal focus or scroll the page about: she did not ask to come back here.
      if (!instant && byKeyboard) text.focus({ preventScroll: true });
      arrive();
    });
  }

  // ---- me, arriving at the side of the paper with the flowers ----
  // CSS does the placing and the motion (.me-arrive); this hands it the paper's right edge and top, which depend on the
  // viewport, and keeps them right if the window changes size.
  const me = $("me-arrive");
  function placeMe() {
    if (!me || over.hidden) return;
    const r = letter.getBoundingClientRect();
    me.style.setProperty("--pr", Math.round(r.right) + "px");
    me.style.setProperty("--pt", Math.round(r.top) + "px");
  }
  let arriving = false;
  function arrive() {
    if (!me || arriving) return;
    arriving = true;
    // Measure only once the scene has stopped moving. A return visit opens the letter at once, but the envelope still
    // falls in from above the screen for two seconds, and a measurement taken then puts me 900px too high.
    // Under reduced motion nothing visibly moves, so nothing is waited for: I am simply there.
    const moving = !reduceMotion.matches && scene.getAnimations ? scene.getAnimations({ subtree: true })
      .filter(a => a.effect && a.effect.getComputedTiming().iterations !== Infinity) : [];
    Promise.all(moving.map(a => a.finished.catch(() => {}))).then(() => {
      if (over.hidden) return;   // she put it away in the meantime: the letter is gone, and so is the moment
      me.alt = CONFIG.labels.me || "";
      placeMe();
      me.hidden = false;
      // two frames, so the starting position is painted before .is-in moves it (a returning visit still sees me come up)
      requestAnimationFrame(() => requestAnimationFrame(() => me.classList.add("is-in")));
      addEventListener("resize", placeMe);
    });
  }
  // a click from Enter, Space or a screen reader has no pointer behind it, and says so with detail 0
  seal.addEventListener("click", e => openLetter(false, e.detail === 0));
  if (seen) openLetter(true); // already opened once: it is simply open, waiting for her

  // ---- putting it away: save, fold into the inbox, light up, hand the page back ----
  // This one button is what the reply used to be: the moment that opens her inbox and her card. It goes through the
  // same door the reply did, with no words. saveReply("") is the account's existing "she answered and left it blank"
  // path: it turns the memories and inbox flags on and keeps no text, so the server needs no change. The empty local
  // copy is what lets a save that failed be sent again after her next sign-in (catchUp in js/api.js), exactly as a
  // blank reply always was, and what the guards read to know the letter has been put away.
  let done = false;
  go.addEventListener("click", () => {
    if (done) return; // a second click while folding
    if (Date.now() < goReadyAt) return; // it has only just taken the next arrow's place: that click was meant for "next"
    done = true;
    if (song && SONG.stopWhenPutAway) { untilTouched(false); hushSong(); }
    Store.setJSON(KEYS.reply, { text: "", timestamp: Date.now() });
    Progress.unlock("memories"); Progress.unlock("inbox"); Progress.unlock("profile");
    if (S.Api) S.Api.saveReply("").then(() => S.Api.saveProgress(Progress.read()));

    // CSS shrinks it toward the header inbox icon, along a vector measured now: from the letter's centre to the icon's
    const icon = $("hdr-inbox");
    if (icon) {
      const a = letter.getBoundingClientRect(), b = icon.getBoundingClientRect();
      letter.style.setProperty("--fold-x", Math.round(b.left + b.width / 2 - (a.left + a.width / 2)) + "px");
      letter.style.setProperty("--fold-y", Math.round(b.top + b.height / 2 - (a.top + a.height / 2)) + "px");
    }
    letter.classList.add("folding");
    setTimeout(() => {
      stage.classList.remove("intro-dim");             // the light-up
      scene.classList.add("gone"); scene.inert = true; // paper put away, as the old reveal did
      if (S.Chrome) S.Chrome.refresh();                // the inbox it folded into is open now: unlock its nav link
      // hand the page back: the overlay fades out and the gallery underneath becomes hers
      if (song) dockSong();   // the song's button goes back into the header as the dim lifts off it
      over.classList.add("leaving");
      holdPage(false);
      setTimeout(() => {
        over.hidden = true;
        over.classList.remove("leaving");
        // keyboard users are not left on a vanished button: put them on the gallery that just lit up
        const first = document.querySelector("#tabs .tab, #grid .slot, #main");
        if (first) { if (!first.hasAttribute("tabindex") && first.id === "main") first.tabIndex = -1; first.focus({ preventScroll: true }); }
      }, reduceMotion.matches ? 0 : 700); // matches .letter-over.leaving in style.css
    }, reduceMotion.matches ? 0 : 650);   // matches #letter.folding's transition in style.css
  });
})();
