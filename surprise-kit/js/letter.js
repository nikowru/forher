// The letter, delivered as an overlay on the memories page (#letter-over in memories.html): the notification
// pops, the envelope falls in over a dimmed, inert gallery, then seal -> letter -> reply (soft confirm) -> fold
// into the header inbox -> the light-up, which hands the page back to the gallery underneath.
// Classic script; needs js/config.js, js/common.js and js/memories.js first.
//
// Once she has replied it never shows at all: the gallery is simply there, lit, and js/memories.js runs alone.
// That is why there is no returning-visitor branch here any more - the old letter.html had one because the
// letter WAS the page; here, "already replied" just means no overlay.
(function () {
  const S = window.Surprise;
  if (!S || !S.Store || !S.Guard) return;
  const { Store, Progress, CONFIG, KEYS } = S;
  const $ = id => document.getElementById(id);
  const over = $("letter-over");
  const stage = $("stage"), scene = $("scene"), seal = $("seal"), letter = $("letter"), text = $("text");
  if (!over || !stage || !scene || !seal || !letter || !text || !$("reply-form")) return; // not the host page
  if (S.Guard.target("memories")) return;        // she does not belong here; memories.js is already redirecting
  // "Already written" has two sources. This device's copy is the usual one, but after signing in on a NEW
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
  const R = CONFIG.reply;
  // She has opened the envelope before but not written back yet (she wandered off, or reloaded). The letter
  // still has to be here - the reply is what unlocks the rest - but making her watch it arrive a second time
  // is the bug she reported. So on a return it is simply already open, waiting for her.
  const seen = Store.get(KEYS.letterSeen, "") === "1";

  // ---- wording (all from CONFIG) ----
  $("title").textContent = CONFIG.heading; // the page title stays "Our memories": this is a layer on that page
  $("hint").textContent = CONFIG.hint;
  seal.setAttribute("aria-label", CONFIG.labels.seal);
  CONFIG.letter.forEach(t => { const p = document.createElement("p"); p.textContent = t; text.appendChild(p); });
  document.querySelector('label[for="reply-text"]').textContent = R.label;
  $("reply-text").placeholder = R.placeholder;
  $("reply-submit").textContent = R.submit;
  $("reply-nudge").textContent = R.nudge;

  // a long letter scrolls inside the paper; let keyboard users reach it too
  function makeScrollable() {
    if (text.scrollHeight <= text.clientHeight) return;
    text.tabIndex = 0; text.setAttribute("role", "region"); text.setAttribute("aria-label", CONFIG.labels.letter);
    const more = () => text.classList.toggle("more", text.scrollTop + text.clientHeight < text.scrollHeight - 2);
    text.addEventListener("scroll", more, { passive: true }); more();
  }

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

  // ---- seal -> letter ----
  // One opener for both ways in. `instant` is the return visit: the same end state with no choreography,
  // so she picks up exactly where she left off instead of watching the envelope open again.
  let opened = false;
  function openLetter(instant) {
    if (opened) return; opened = true;
    Store.set(KEYS.letterSeen, "1"); // remembered from here on, so a reload does not replay the arrival
    seal.classList.add("broken"); seal.disabled = true; // gone from view, so gone from the Tab order too
    const at = (ms, fn) => (instant ? fn() : setTimeout(fn, ms));
    at(350, () => scene.classList.add("open"));
    at(800, () => scene.classList.add("flapback"));
    at(1250, () => { scene.classList.add("rise"); $("title").classList.add("fade"); $("hint").classList.add("fade"); });
    at(2500, () => {
      scene.classList.add("read");
      makeScrollable();
      // the letter only becomes reachable once it can be read; keyboard focus lands on it
      letter.inert = false;
      // on a return visit do not steal focus or scroll the page about: she did not ask to come back here
      if (!instant) (text.tabIndex === 0 ? text : $("reply-text")).focus({ preventScroll: true });
    });
  }
  seal.addEventListener("click", () => openLetter(false));
  if (seen) openLetter(true); // already opened once: it is simply open, waiting for her reply

  // ---- reply: soft confirm, save, fold, light up, reveal the link to memories ----
  let replyAttempted = false, replyDone = false;
  $("reply-form").addEventListener("submit", e => {
    e.preventDefault();
    if (replyDone) return; // a second Enter/click while folding
    const replyText = $("reply-text").value.trim();
    const website = $("reply-website").value; // honeypot: read as-is, only a bot would fill it

    // The submit button is always enabled; an empty reply never hard-blocks. The first empty attempt only nudges
    // (nothing saved/folded/sent); a second empty attempt, or any non-empty first attempt, runs the full flow.
    if (!replyText && !replyAttempted) {
      replyAttempted = true;
      $("reply-nudge").textContent = R.nudge;
      $("reply-nudge").hidden = false;
      $("reply-text").focus({ preventScroll: true });
      return;
    }
    replyAttempted = true; replyDone = true;

    Store.remove(KEYS.inboxSeen); // this reply is unread until she opens the inbox page
    // local copy first (guards, the unread badge and the returning-visitor view read it), then the api (the account's copy)
    Store.setJSON(KEYS.reply, { text: replyText, timestamp: Date.now() });
    Progress.unlock("memories"); Progress.unlock("inbox"); Progress.unlock("profile");
    if (S.Api && !website) { // honeypot filled = a bot: the page flow runs as normal but nothing is sent
      S.Api.saveReply(replyText).then(() => S.Api.saveProgress(Progress.read()));
    }

    letter.classList.add("folding"); // CSS shrinks it toward the header inbox icon
    setTimeout(() => {
      stage.classList.remove("intro-dim");             // the light-up
      scene.classList.add("gone"); scene.inert = true; // paper put away, as the old reveal did
      if (S.Chrome) S.Chrome.refresh();                // common.js owns the badge: the new unread reply shows now
      // hand the page back: the overlay fades out and the gallery underneath becomes hers
      over.classList.add("leaving");
      holdPage(false);
      setTimeout(() => {
        over.hidden = true;
        over.classList.remove("leaving");
        // keyboard users are not left on a vanished form: put them on the gallery that just lit up
        const first = document.querySelector("#tabs .tab, #grid .slot, #main");
        if (first) { if (!first.hasAttribute("tabindex") && first.id === "main") first.tabIndex = -1; first.focus({ preventScroll: true }); }
      }, reduceMotion.matches ? 0 : 700); // matches .letter-over.leaving in style.css
    }, reduceMotion.matches ? 0 : 650);   // matches #letter.folding's transition in style.css
  });
})();
