// The gate (index.html): sign in on one side, an invitation to sign up on the other.
// Classic script; needs js/config.js, js/common.js and js/api.js first. Does nothing off this page.
//
// Only one account can ever exist, so the panel has two faces: an invitation while nobody has
// signed up, and a warm nudge back to signing in once someone has. Which one it shows comes from
// Api.status(), not from this device's storage, so a brand-new device still gets the right face.
(function () {
  const S = window.Surprise;
  if (!S || !S.Store || !S.Chrome || !S.Api) return;
  const { Api, Music, Session, Progress, Guard, CONFIG } = S;
  const L = CONFIG.login, W = CONFIG.welcome;
  const $ = id => document.getElementById(id);
  const gate = $("gate");
  if (!gate || !$("lg-form") || !$("lg-username") || !$("lg-secret") || !$("lg-msg") || !$("lg-continue")) return;

  // Already signed in on this device and part-way through -> straight on, no flash of the gate.
  gate.hidden = true;
  if (Session.isActive() && Progress.furthest()) { location.replace(Guard.onward()); return; }

  fillWording();
  // The form is useful either way, so show the card immediately and let the panel settle once the
  // server answers. A slow backend then costs her nothing: she can already start typing.
  gate.hidden = false;
  requestAnimationFrame(() => gate.classList.add("is-in"));
  Api.status().then(r => setPanel(!!(r && r.ok && r.exists)));
  start();

  function setText(id, t) { const el = $(id); if (el) el.textContent = t; }

  function fillWording() {
    document.title = W.title;
    const themeBtn = $("theme"); if (themeBtn) themeBtn.setAttribute("aria-label", CONFIG.labels.theme);
    setText("wl-title", W.title);
    const lab = (id, t) => { const el = document.querySelector('label[for="' + id + '"]'); if (el) el.textContent = t; };
    lab("lg-username", L.usernameLabel); lab("lg-secret", L.secretLabel);
    setText("lg-continue", L.continue);
    setText("lg-reset", L.reset);
    setText("lg-confirm-title", L.confirm.title);
    setText("lg-confirm-text", L.confirm.text);
    setText("lg-confirm-yes", L.confirm.yes);
    setText("lg-confirm-no", L.confirm.no);
  }

  // `taken` = an account already exists, so sign-up is closed and the panel points her at signing in.
  function setPanel(taken) {
    setText("wl-panel-title", taken ? W.takenTitle : W.panelTitle);
    setText("wl-panel-text", taken ? W.takenText : W.panelText);
    setText("wl-signup", W.signUp);
    setText("wl-signin", W.signIn);
    setText("wl-to-signup-small", W.toSignUpSmall);
    const up = $("wl-signup"), inBtn = $("wl-signin"), small = $("wl-to-signup-small");
    if (up) up.hidden = taken;          // an <a> to signup.html
    if (small) small.hidden = taken;    // the stacked-layout twin of the same link
    if (inBtn) inBtn.hidden = !taken;
    gate.classList.toggle("is-taken", taken);
  }

  function start() {
    const username = $("lg-username"), secret = $("lg-secret"), msg = $("lg-msg");
    const showMsg = t => { msg.textContent = t; msg.hidden = false; };
    const clearMsg = () => { if (!msg.hidden) { msg.hidden = true; msg.textContent = ""; } };
    const stepOf = el => el.closest(".su-step");
    const unmark = () => document.querySelectorAll(".su-step.su-missing").forEach(s => s.classList.remove("su-missing"));
    const mark = el => { unmark(); const s = stepOf(el); if (s) s.classList.add("su-missing"); };
    username.addEventListener("input", () => { clearMsg(); unmark(); });
    secret.addEventListener("input", () => { clearMsg(); unmark(); });

    // "sign in instead" (shown when the account is taken): draw the eye to the form rather than navigate
    const inBtn = $("wl-signin");
    if (inBtn) inBtn.addEventListener("click", () => {
      gate.classList.add("nudge-form");
      setTimeout(() => gate.classList.remove("nudge-form"), 700);
      username.focus();
    });

    let busy = false;
    $("lg-form").addEventListener("submit", e => {
      e.preventDefault();
      if (busy) return;
      // gentle validation: a sweet message + highlight on the first empty field, nothing sent
      const field = !username.value.trim() ? "username" : !secret.value.trim() ? "secret" : null;
      if (field) {
        const el = field === "username" ? username : secret;
        mark(el); showMsg(L.missing[field]); el.focus();
        return;
      }
      busy = true; unmark(); clearMsg();
      const btn = $("lg-continue");
      btn.disabled = true; btn.setAttribute("aria-busy", "true"); btn.textContent = L.loading; // no double-submit; she sees it working
      Api.login(username.value, secret.value).then(r => {
        if (!r.ok) {
          busy = false;
          btn.disabled = false; btn.removeAttribute("aria-busy"); btn.textContent = L.continue;
          if (r.error === "locked") showMsg(L.locked); // paused for a few minutes: keep both fields as typed
          else if (r.error === "wrong") { // one message whichever part was wrong; the typed username stays, the word is cleared
            showMsg(L.wrong); secret.value = ""; secret.focus();
          } else showMsg(L.network);
          return;
        }
        // resume her music (chosen at sign-up); the saved position is picked up when it is the same track
        const prof = r.profile || {};
        if (prof.musicId) Music.start(prof.musicId);
        S.Chrome.go(Guard.onward());
      });
    });

    // ---- "not me / start fresh": confirm, then forget THIS DEVICE's session only (the account stays) ----
    // <dialog> gives Esc-to-close, a focus trap and an inert page behind it; focus goes in on open and back on close.
    const dlg = $("lg-confirm"), resetBtn = $("lg-reset");
    if (!dlg || !resetBtn) return;
    resetBtn.addEventListener("click", () => {
      if (typeof dlg.showModal !== "function") return;
      if (!dlg.open) { dlg.returnValue = ""; dlg.showModal(); $("lg-confirm-no").focus(); } // the safe choice has focus first
    });
    $("lg-confirm-no").addEventListener("click", () => dlg.close());
    dlg.addEventListener("click", e => { if (e.target === dlg) dlg.close(); }); // click outside the box
    dlg.addEventListener("close", () => { (dlg.returnValue === "fresh" ? username : resetBtn).focus(); }); // focus back: Esc, No and Yes alike
    $("lg-confirm-yes").addEventListener("click", () => {
      Api.logout();        // clears the session only; the account and the saved answers are untouched
      Music.pause();
      username.value = ""; secret.value = ""; clearMsg(); unmark();
      dlg.close("fresh");
    });
  }
})();
