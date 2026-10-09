// Letter page (letter.html): guard, wording, intro dim-and-unfold, seal -> letter, reply (soft confirm), fold into the
// header inbox, light-up, then the "open our memories" link. Classic script; needs js/config.js and js/common.js first.
// Returning visitor (reply already saved): no intro, no dim; the letter is shown open with her reply read-only and
// #to-memories visible straight away.
(function () {
  const S = window.Surprise;
  if (!S || !S.Store || !S.Guard) return;
  const { Store, Progress, Send, Inbox, CONFIG, KEYS } = S;
  const $ = id => document.getElementById(id);
  const stage = $("stage"), scene = $("scene"), seal = $("seal"), letter = $("letter"), text = $("text");
  if (!stage || !scene || !seal || !letter || !text || !$("reply-form")) return;
  if (!S.Guard.require("letter")) return; // not signed up: being sent to index.html, so do not initialise

  const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)");
  const R = CONFIG.reply;

  // ---- wording (all from CONFIG) ----
  document.title = CONFIG.site.titles.letter;
  $("intro-msg").textContent = CONFIG.intro.heading;
  $("title").textContent = CONFIG.heading;
  $("hint").textContent = CONFIG.hint;
  seal.setAttribute("aria-label", CONFIG.labels.seal);
  CONFIG.letter.forEach(t => { const p = document.createElement("p"); p.textContent = t; text.appendChild(p); });
  document.querySelector('label[for="reply-text"]').textContent = R.label;
  $("reply-text").placeholder = R.placeholder;
  $("reply-submit").textContent = R.submit;
  $("reply-nudge").textContent = R.nudge;
  $("to-memories").textContent = R.toMemories;

  // a long letter scrolls inside the paper; let keyboard users reach it too
  function makeScrollable() {
    if (text.scrollHeight <= text.clientHeight) return;
    text.tabIndex = 0; text.setAttribute("role", "region"); text.setAttribute("aria-label", CONFIG.labels.letter);
    const more = () => text.classList.toggle("more", text.scrollTop + text.clientHeight < text.scrollHeight - 2);
    text.addEventListener("scroll", more, { passive: true }); more();
  }

  const saved = Store.getJSON(KEYS.reply, null);
  const replied = !!(saved && typeof saved === "object");

  if (replied) {
    // ---- returning visitor: show the finished state, no replay ----
    scene.classList.add("open", "flapback", "rise", "read");
    seal.classList.add("broken"); seal.disabled = true;
    $("title").classList.add("fade"); $("hint").classList.add("fade");
    makeScrollable();
    letter.inert = false;
    const rt = $("reply-text");
    rt.value = typeof saved.text === "string" ? saved.text : "";
    rt.readOnly = true; $("reply-submit").hidden = true;
    scene.classList.add("gone"); // same as after the fold: the paper is put away; the link takes over
    scene.inert = true;
    const link = $("to-memories"); link.hidden = false;
    link.focus({ preventScroll: true });
    return;
  }

  // ---- intro: dim the page, show the heading, let the envelope drop in, then focus the seal ----
  stage.classList.add("intro-dim", "intro-msg-on", "intro-pre");
  // two rAFs so the pre-entrance state is painted at least once; otherwise the removal could be coalesced into the
  // same frame and the entrance transition would never run
  requestAnimationFrame(() => requestAnimationFrame(() => stage.classList.remove("intro-pre")));
  setTimeout(() => stage.classList.remove("intro-msg-on"), 1100); // heading fades as the unfold finishes
  setTimeout(() => seal.focus({ preventScroll: true }), 2200);

  // ---- seal -> letter ----
  let opened = false;
  seal.addEventListener("click", () => {
    if (opened) return; opened = true;
    seal.classList.add("broken"); seal.disabled = true; // gone from view, so gone from the Tab order too
    setTimeout(() => scene.classList.add("open"), 350);
    setTimeout(() => scene.classList.add("flapback"), 800);
    setTimeout(() => { scene.classList.add("rise"); $("title").classList.add("fade"); $("hint").classList.add("fade"); }, 1250);
    setTimeout(() => {
      scene.classList.add("read");
      makeScrollable();
      // the letter only becomes reachable once it can be read; keyboard focus lands on it
      letter.inert = false;
      (text.tabIndex === 0 ? text : $("reply-text")).focus({ preventScroll: true });
    }, 2500);
  });

  // ---- reply: soft confirm, save, send, fold, light up, reveal the link to memories ----
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
    Store.setJSON(KEYS.reply, { text: replyText, timestamp: Date.now() });
    Progress.unlock("memories"); Progress.unlock("inbox");
    const su = Store.getJSON(KEYS.signup, null);
    Send.send({ type: "reply", username: su && su.username ? su.username : "", reply: replyText, website });

    letter.classList.add("folding"); // CSS shrinks it toward the header inbox icon
    setTimeout(() => {
      stage.classList.remove("intro-dim");            // the light-up
      scene.classList.add("gone"); scene.inert = true; // paper put away, as the old reveal did
      if (S.Chrome) S.Chrome.refresh();               // common.js owns the badge: the new unread reply shows now
      const link = $("to-memories"); link.hidden = false;
      link.focus({ preventScroll: true });            // keyboard users are not left on a vanished form
    }, reduceMotion.matches ? 0 : 650); // matches #letter.folding's transition in style.css
  });
})();
