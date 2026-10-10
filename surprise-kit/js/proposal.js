// Proposal page (proposal.html): the two-line reveal, the dodging No, the escalation, and Yes -> letter.html.
// ALL wording and tunables live in js/config.js (CONFIG.proposal for wording/timing/threshold, Surprise.PR_NO for the
// No button's retune); edit them there, not here.
// Classic script; needs js/config.js, js/common.js, js/api.js and js/nodge.js first.
(function () {
  const S = window.Surprise;
  if (!S || !S.Store || !S.Chrome || !S.Api || !S.Nodge || !S.CONFIG || !S.CONFIG.proposal) return;
  const $ = id => document.getElementById(id);
  if (!$("pr-inner") || !$("pr-yes") || !$("pr-no") || !$("pr-buttons")) return; // not the proposal page
  if (!S.Guard.require("proposal")) return; // she needs a finished sign-up; she is being redirected

  const { Store, Progress, Api, Chrome, KEYS } = S, P = S.CONFIG.proposal;
  const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)");
  const yes = $("pr-yes"), no = $("pr-no"), buttons = $("pr-buttons"), inner = $("pr-inner");
  const timers = [];
  const later = (fn, ms) => { timers.push(setTimeout(fn, ms)); };

  // ---- wording: {name} -> "baby", or her saved username when P.useUsername is on ----
  function petName() {
    if (P.useUsername) {
      const su = Store.getJSON(KEYS.signup, null), acct = Store.getJSON(KEYS.account, null);
      const u = String((su && su.username) || (acct && acct.username) || "").trim();
      if (u) return u;
    }
    return P.nameWord || "baby";
  }
  const say = text => String(text == null ? "" : text).replace(/\{name\}/g, petName());

  document.title = P.title || document.title;
  const themeBtn = $("theme"); if (themeBtn && S.CONFIG.labels) themeBtn.setAttribute("aria-label", S.CONFIG.labels.theme);
  $("pr-line1").textContent = say(P.line1);
  $("pr-line2").textContent = say(P.line2);
  yes.textContent = say(P.yes);
  no.textContent = say(P.no);
  $("pr-confirm").textContent = say(P.confirm);
  $("pr-cheeky").textContent = say(P.cheeky);

  // ---- the dodging No ----
  let nodge = null, dodgeTimer = 0, dodges = 0, escalated = false, accepted = false;
  // The words are obstacles, but only where there is ink: a wrapped title's block is as wide as its widest line, which would
  // wall off the whole middle of the screen. Each text LINE is an obstacle of its own (read fresh every frame via a Range, so
  // wrapping, resizes and late web fonts are always current). Nodge takes any object with getBoundingClientRect().
  function inkLines(el, count) {
    const range = document.createRange();
    return Array.from({ length: count }, (_, i) => ({
      getBoundingClientRect() {
        try {
          range.selectNodeContents(el);
          const r = Array.from(range.getClientRects()).filter(q => q.width > 1 && q.height > 1)[i];
          if (r) return r;
        } catch (e) { /* fall through to the empty rect */ }
        return { left: 0, top: 0, right: 0, bottom: 0, width: 0, height: 0 };
      }
    }));
  }
  function startNodge() {
    nodge = S.Nodge.init({
      no, yes, container: buttons,
      avoid: ["theme", "mute"].concat(inkLines($("pr-line1"), 2), inkLines($("pr-line2"), 4), inkLines($("pr-cheeky"), 2)),
      tunables: S.PR_NO
    });
    if (nodge) watchDodges();
  }

  // A "dodge" = No setting off (from standing still, or starting a glide / hop) because the pointer came near; a keyboard
  // focus on it counts too. It is judged from Nodge's own state, because the pointer never actually gets inside the radius
  // (No leaves first). Counted at most every 900 ms, so one long chase is one dodge.
  function watchDodges() {
    const st = nodge.state;
    let moving = false, lastCount = -1e9, lastMove = st.lastMoveStart;
    const count = () => {
      const now = performance.now();
      if (accepted || escalated || now - lastCount < 900) return;
      lastCount = now; dodges++;
      if (dodges >= P.dodgesBeforeCheeky) escalate();
    };
    dodgeTimer = setInterval(() => {
      const speed = Math.hypot(st.vx, st.vy), now = st.mode !== "free" || speed > 60;
      if (now && !moving) count();
      moving = now;
      if (st.lastMoveStart !== lastMove) { lastMove = st.lastMoveStart; count(); }
    }, 60);
    no.addEventListener("focus", count);
  }

  // No shrinks, Yes grows, the cheeky line shows: once. The class changes shift the row's layout (over the 0.7s size
  // transition), so No's home spot is re-measured now (the layout has not moved yet, so this records the old spot), and
  // Nodge is then kept awake for the transition: it re-reads home every frame, so No holds its place on screen instead of
  // riding the layout, and Yes growing into it just pushes it aside.
  function escalate() {
    if (escalated || accepted) return;
    escalated = true; clearInterval(dodgeTimer);
    if (nodge) nodge.rehome(); // record the layout BEFORE the classes change it
    no.classList.add("pr-no-small");
    yes.classList.add("pr-yes-big");
    $("pr-cheeky").hidden = false;
    if (!nodge) return;
    nodge.rehome(); // and again now that the classes are on
    const until = performance.now() + 900;
    (function pump() { nodge.wake(); if (performance.now() < until) requestAnimationFrame(pump); })();
  }

  // ---- the reveal: line 1, a beat, line 2, a beat, then the buttons ----
  function reveal() {
    const showButtons = () => { yes.classList.add("is-in"); no.classList.add("is-in"); startNodge(); };
    if (reduceMotion.matches) { // no drawn-out staging: everything is up almost at once
      $("pr-line1").classList.add("is-in"); $("pr-line2").classList.add("is-in");
      later(showButtons, 50);
      return;
    }
    later(() => $("pr-line1").classList.add("is-in"), P.firstLineDelayMs);
    later(() => $("pr-line2").classList.add("is-in"), P.firstLineDelayMs + P.beatMs);
    later(showButtons, P.firstLineDelayMs + P.beatMs + P.buttonsDelayMs);
  }

  // ---- Yes: celebrate, swap the text, save `accepted`, fade to letter.html ----
  // Acceptance is saved BEFORE navigating (letter.html's guard needs `accepted`): Progress.accept() writes it on this
  // device straight away (so she can never bounce back), then Api.saveProgress() sends it to the account (the server,
  // in Phase B). If the account call fails she still goes on; the device copy is the one the guard reads.
  function onYes() {
    if (accepted) return; // a second click (or Enter key repeat) can never double-fire
    accepted = true; clearInterval(dodgeTimer);
    timers.splice(0).forEach(clearTimeout); // a pending reveal step must not fire into the celebration
    $("pr-line1").classList.add("is-in"); $("pr-line2").classList.add("is-in");
    buttons.inert = true;
    Progress.accept();
    const saved = Api.saveProgress(Progress.read()).catch(() => null);
    buttons.classList.add("is-celebrating");
    inner.classList.add("is-confirmed");
    $("pr-confirm").hidden = false;
    $("pr-cheeky").hidden = true;
    const beat = new Promise(res => setTimeout(res, reduceMotion.matches ? P.yesBeatReducedMs : P.yesBeatMs));
    const cap = new Promise(res => setTimeout(res, 2500)); // never wait on the account for longer than this
    Promise.all([beat, Promise.race([saved, cap])]).then(() => Chrome.go("letter.html"));
  }
  yes.addEventListener("click", onYes);

  reveal();
})();
