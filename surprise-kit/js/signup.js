// Sign-up page (index.html): chooses sign-up vs login, fills the card's wording, mood/icon/track pickers, gentle
// validation and the Continue submit. The dodging No button now lives in js/nodge.js (used by proposal.html).
// Classic script; needs js/config.js, js/common.js and js/api.js first. Guarded: does nothing off the sign-up page.
(function () {
  const S = window.Surprise;
  if (!S || !S.Store || !S.Chrome || !S.Api) return;
  const { Store, Music, Api, CONFIG, MOODS, ICONS, MUSIC } = S;
  const $ = id => document.getElementById(id);
  const signupSection = $("signup");
  if (!signupSection || !$("su-form") || !$("su-continue") || !$("su-msg")) return;

  // ---- which page is this visitor for? ask the api whether the one account already exists.
  // (?reset=1 / #reset were already handled by js/common.js, which runs first, so a reset visitor has no account here
  // and simply gets a fresh sign-up.) The card stays hidden until the answer is in, so there is no flash of the wrong
  // UI; the local api answers within a microtask, before the browser paints. location.replace keeps index.html out
  // of the history so Back doesn't bounce her. If she is already signed in on this device she goes straight on.
  signupSection.hidden = true;
  Api.status().then(r => {
    if (r.ok && r.exists) {
      const onward = S.Session.isActive() && S.Progress.furthest() ? S.Guard.onward() : "login.html";
      location.replace(onward);
      return;
    }
    signupSection.hidden = false; // no account (or the server could not be asked): the sign-up card, as normal
    start();
  });

  function start() {
    document.title = CONFIG.pageTitle;
    const setText = (id, t) => { const el = $(id); if (el) el.textContent = t; };
    const themeBtn = $("theme"); if (themeBtn) themeBtn.setAttribute("aria-label", CONFIG.labels.theme);
    // sign-up card wording
    setText("su-title", CONFIG.signup.title);
    const unameLabel = document.querySelector('label[for="su-username"]'); if (unameLabel) unameLabel.textContent = CONFIG.signup.usernameLabel;
    if ($("su-username")) $("su-username").placeholder = CONFIG.signup.usernamePlaceholder;
    const secretLabel = document.querySelector('label[for="su-secret"]'); if (secretLabel) secretLabel.textContent = CONFIG.signup.secretLabel;
    setText("su-secret-hint", CONFIG.signup.secretHint);
    setText("su-mood-label", CONFIG.signup.moodLabel);
    setText("su-icon-label", CONFIG.signup.iconLabel);
    setText("su-music-label", CONFIG.signup.musicLabel);
    setText("su-continue", CONFIG.signup.continue);

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

    // gentle validation (Continue with something missing): a sweet message in #su-msg + a highlight on the step, never an alert
    const stepEl = key => document.querySelector('.su-step[data-step="' + key + '"]');
    const showMsg = text => { $("su-msg").textContent = text; $("su-msg").hidden = false; };
    function signupFixed(key) { // she filled it in: drop that highlight, and the message once nothing is left to fix
      const st = stepEl(key); if (st) st.classList.remove("su-missing");
      if (!document.querySelector(".su-step.su-missing") && !$("su-msg").hidden) { $("su-msg").hidden = true; $("su-msg").textContent = ""; }
    }
    $("su-username").addEventListener("input", () => { if ($("su-username").value.trim()) signupFixed("username"); });
    $("su-secret").addEventListener("input", () => { if ($("su-secret").value.trim()) signupFixed("secret"); });
    // order = the order on the card
    function firstMissing() {
      if (!$("su-username").value.trim()) return { key: "username", focus: $("su-username") };
      if (!$("su-secret").value.trim()) return { key: "secret", focus: $("su-secret") };
      if (!selectedMood) return { key: "mood", focus: document.querySelector("#su-moods .su-mood") };
      if (!selectedIconId) return { key: "icon", focus: document.querySelector("#su-icons .su-icon") };
      if (!selectedTrackId) return { key: "music", focus: document.querySelector("#su-tracks .su-track") };
      return null;
    }

    // ---- submit: create the account, start the music, fade on to proposal.html ----
    // Music.start happens here (her first real gesture) rather than on the next page, so autoplay is most likely
    // allowed and the next page's resume works. Chrome.go (js/common.js) is the one fade-then-navigate
    // implementation (immediate under reduced motion). proposal.html is built by a later task.
    let submitting = false;
    $("su-form").addEventListener("submit", e => {
      e.preventDefault();
      if (submitting) return;
      const missing = firstMissing();
      if (missing) {
        for (const st of document.querySelectorAll(".su-step.su-missing")) st.classList.remove("su-missing");
        stepEl(missing.key).classList.add("su-missing");
        showMsg(CONFIG.signup.missing[missing.key]);
        if (missing.focus) missing.focus.focus();
        return; // nothing saved, no music, stays on the card
      }
      submitting = true;
      const btn = $("su-continue");
      btn.disabled = true; btn.setAttribute("aria-busy", "true"); btn.textContent = CONFIG.signup.loading; // no double-submit; she sees it working
      const username = $("su-username").value.trim();
      const answers = { username, secret: $("su-secret").value, mood: selectedMood, iconId: selectedIconId, musicId: selectedTrackId };
      Api.signup(answers).then(r => {
        if (!r.ok) {
          if (r.error === "exists") { location.replace("login.html"); return; } // an account appeared meanwhile: she logs in instead
          submitting = false;
          btn.disabled = false; btn.removeAttribute("aria-busy"); btn.textContent = CONFIG.signup.continue; // everything she typed stays as it was
          showMsg(CONFIG.signup.errors[r.error] || CONFIG.signup.errors.network);
          return;
        }
        // keep a small non-secret copy of her answers for the pages that still read it (the secret is never stored here)
        Store.setJSON(S.KEYS.signup, { username, mood: selectedMood, iconId: selectedIconId, musicId: selectedTrackId });
        Music.start(selectedTrackId); // only start playback after an actual completed sign-up interaction
        S.Chrome.go("proposal.html");
      });
    });
  }

  // the drifting dust and petals (#air) are drawn by js/common.js (Surprise.Air), shared with letter.html
})();
