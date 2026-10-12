// Login page (login.html): wording, gentle validation, Api.login, "not me / start fresh".
// Classic script; needs js/config.js, js/common.js and js/api.js first. Guarded: does nothing off the login page.
(function () {
  const S = window.Surprise;
  if (!S || !S.Store || !S.Chrome || !S.Api) return;
  const { Api, Music, Session, Progress, Guard, CONFIG } = S;
  const L = CONFIG.login;
  const $ = id => document.getElementById(id);
  const section = $("login");
  if (!section || !$("lg-form") || !$("lg-username") || !$("lg-secret") || !$("lg-msg") || !$("lg-continue")) return;

  // Already signed in on this device with progress -> straight on. (Not Guard.target("login"): its "no local account
  // -> index.html" rule would loop with the real server, where a new device has no local account but one exists.)
  // Hidden until we know where she belongs, so nothing flashes.
  section.hidden = true;
  if (Session.isActive() && Progress.furthest()) { location.replace(Guard.onward()); return; }
  Api.status().then(r => {
    if (r.ok && !r.exists) { location.replace("index.html"); return; } // nobody has signed up yet
    section.hidden = false;
    start();
  });

  function start() {
    document.title = L.title;
    const setText = (id, t) => { const el = $(id); if (el) el.textContent = t; };
    const themeBtn = $("theme"); if (themeBtn) themeBtn.setAttribute("aria-label", CONFIG.labels.theme);
    setText("lg-title", L.title);
    const lab = (id, t) => { const el = document.querySelector('label[for="' + id + '"]'); if (el) el.textContent = t; };
    lab("lg-username", L.usernameLabel); lab("lg-secret", L.secretLabel);
    setText("lg-continue", L.continue);
    setText("lg-reset", L.reset);
    setText("lg-confirm-title", L.confirm.title);
    setText("lg-confirm-text", L.confirm.text);
    setText("lg-confirm-yes", L.confirm.yes);
    setText("lg-confirm-no", L.confirm.no);

    const username = $("lg-username"), secret = $("lg-secret"), msg = $("lg-msg");
    const showMsg = t => { msg.textContent = t; msg.hidden = false; };
    const clearMsg = () => { if (!msg.hidden) { msg.hidden = true; msg.textContent = ""; } };
    const stepOf = el => el.closest(".su-step");
    const unmark = () => document.querySelectorAll(".su-step.su-missing").forEach(s => s.classList.remove("su-missing"));
    const mark = el => { unmark(); const s = stepOf(el); if (s) s.classList.add("su-missing"); };
    username.addEventListener("input", () => { clearMsg(); unmark(); });
    secret.addEventListener("input", () => { clearMsg(); unmark(); });

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
