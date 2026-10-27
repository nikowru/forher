// The gate (index.html): sign in on one side, an invitation to sign up on the other.
// Classic script; needs js/config.js, js/common.js and js/api.js first. Does nothing off this page.
//
// Only one account can ever exist, so the panel has two faces: an invitation while nobody has
// signed up, and a warm nudge back to signing in once someone has. Which one it shows comes from
// Api.status(), not from this device's storage, so a brand-new device still gets the right face.
(function () {
  const S = window.Surprise;
  if (!S || !S.Store || !S.Chrome || !S.Api) return;
  const { Api, Progress, Guard, CONFIG, Store, KEYS } = S;
  const L = CONFIG.login, W = CONFIG.welcome;
  const $ = id => document.getElementById(id);
  const gate = $("gate");
  if (!gate || !$("lg-form") || !$("lg-username") || !$("lg-secret") || !$("lg-msg") || !$("lg-continue")) return;

  // The gate is the front door and she always sees it. It used to jump an already-signed-in visitor
  // straight to her furthest page, which meant that once this browser had a session the sign-in was
  // never shown again. "Remember me" is the opt-in version of that: it fills the fields in rather than
  // skipping past them, so she is always the one who decides to go through.
  gate.hidden = true;

  // ---- what this laptop remembers ----
  // Only ever written when she ticks the box, and wiped the moment she unticks it or starts fresh.
  // HONEST NOTE: to type the secret word back in for her it has to be kept as she typed it, in this
  // browser's localStorage. Anyone who can open her unlocked laptop could read it there. That was
  // already true of being silently signed in - they could simply walk into the site - so this does not
  // widen anything, but it is a real trade and it is why the box is off unless she asks for it.
  const remembered = () => { const r = Store.getJSON(KEYS.remember, null); return r && typeof r === "object" ? r : null; };
  function rememberNow(on, who, word) {
    if (!on) return Store.remove(KEYS.remember);
    return Store.setJSON(KEYS.remember, { v: 1, username: String(who || ""), secret: String(word || "") });
  }

  fillWording();
  // if this laptop remembers her, the fields are already filled and Continue is one click away
  (function prefill() {
    const r = remembered(); if (!r) return;
    const u = $("lg-username"), s = $("lg-secret"), box = $("lg-remember");
    if (u) u.value = r.username || "";
    if (s) s.value = r.secret || "";
    if (box) box.checked = true;
  })();

  // The form is useful either way, so show the card immediately and let the panel settle once the
  // server answers. A slow backend then costs her nothing: she can already start typing.
  gate.hidden = false;
  requestAnimationFrame(() => gate.classList.add("is-in"));
  Api.status().then(r => setPanel(!!(r && r.ok && r.exists)));
  start();

  function setText(id, t) { const el = $(id); if (el) el.textContent = t; }

  function fillWording() {
    document.title = W.title;
    const rem = $("lg-remember-label"); if (rem) rem.textContent = L.remember;
    const fg = $("lg-forgot"); if (fg) fg.textContent = L.forgot;
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
            const fg = $("lg-forgot"); if (fg) fg.hidden = false; // now it is worth offering
          } else showMsg(L.network);
          return;
        }
        // only now, with the word proven right, is it worth keeping
        const box = $("lg-remember");
        rememberNow(!!(box && box.checked), username.value.trim(), secret.value);
        const prof = r.profile || {};
        S.Chrome.go(Guard.onward());
      });
    });

    // ---- "I forgot our secret word": ask him for help, without giving anything away ----
    // One ask is enough; the button retires itself so she cannot sit there sending a dozen.
    const forgotBtn = $("lg-forgot");
    if (forgotBtn) forgotBtn.addEventListener("click", () => {
      if (forgotBtn.disabled) return;
      forgotBtn.disabled = true; forgotBtn.textContent = L.forgotSending;
      Api.forgotSecret().then(() => {
        forgotBtn.hidden = true;        // done: the message below says what happens next
        showMsg(L.forgotSent);
        secret.focus();
      });
    });

    // ---- "not me / start fresh": erase the account everywhere, so the whole thing can be lived again ----
    // This is the one destructive thing on the site, so it asks for the secret word before doing it and
    // says plainly what goes. <dialog> gives Esc-to-close, a focus trap and an inert page behind it.
    const dlg = $("lg-confirm"), resetBtn = $("lg-reset");
    if (!dlg || !resetBtn) return;
    const C = L.confirm, dSecret = $("lg-confirm-secret"), dMsg = $("lg-confirm-msg"), dYes = $("lg-confirm-yes");
    const dLabel = document.querySelector(".lg-confirm-label");
    if (dLabel) dLabel.textContent = C.secretLabel;
    let erasing = false;
    const dShow = t => { dMsg.textContent = t; dMsg.hidden = false; };
    const dClear = () => { dMsg.textContent = ""; dMsg.hidden = true; };

    resetBtn.addEventListener("click", () => {
      if (typeof dlg.showModal !== "function") return;
      if (dlg.open) return;
      dlg.returnValue = ""; dSecret.value = ""; dClear();
      dlg.showModal();
      $("lg-confirm-no").focus(); // the safe choice has focus first
    });
    $("lg-confirm-no").addEventListener("click", () => { if (!erasing) dlg.close(); });
    dlg.addEventListener("click", e => { if (e.target === dlg && !erasing) dlg.close(); }); // click outside the box
    dlg.addEventListener("close", () => { if (!erasing) resetBtn.focus(); });               // focus back: Esc and No alike
    dSecret.addEventListener("input", dClear);

    $("lg-confirm-form").addEventListener("submit", e => {
      e.preventDefault();                       // the dialog must not close until the server has answered
      if (erasing) return;
      const word = dSecret.value;
      if (!word.trim()) { dShow(C.secretLabel); dSecret.focus(); return; }
      // the username comes from the sign-in field she is already looking at; empty means she only typed the word
      const who = username.value.trim();
      erasing = true;
      dYes.disabled = true; dYes.setAttribute("aria-busy", "true"); dYes.textContent = C.working;
      Store.remove(KEYS.remember); // whatever happens next, this laptop should not hold her word any more
      Api.deleteAccount(who || (S.Store.getJSON(S.KEYS.signup, {}) || {}).username || "", word).then(r => {
        if (r.ok) { location.replace("index.html"); return; } // gone: straight back to a first-time gate
        erasing = false;
        dYes.disabled = false; dYes.removeAttribute("aria-busy"); dYes.textContent = C.yes;
        dShow(C[r.error === "wrong" ? "wrong" : r.error === "locked" ? "locked" : "network"]);
        dSecret.value = ""; dSecret.focus();   // she stays in the dialog and can try again
      });
    });
  }
})();
