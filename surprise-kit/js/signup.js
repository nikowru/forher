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

    // Her uploaded photo, if she picks one: a square data URL kept under its own key so the
    // account row stays small. CUSTOM_ICON is the id saved in place of one of the ICONS ids.
    const CUSTOM_ICON = "custom";
    const avatarKey = () => S.KEYS.avatar || "surprise-avatar";
    const readAvatar = () => Store.get(avatarKey(), "") || "";

    // Crop to a centred square and shrink to AVATAR_PX before storing: a phone photo is several MB,
    // which would blow localStorage. This keeps it to roughly 15-30KB.
    function squareDataURL(file) {
      return new Promise((resolve, reject) => {
        const url = URL.createObjectURL(file), img = new Image();
        img.onload = () => {
          try {
            const px = S.AVATAR_PX || 256, side = Math.min(img.naturalWidth, img.naturalHeight);
            const sx = (img.naturalWidth - side) / 2, sy = (img.naturalHeight - side) / 2;
            const c = document.createElement("canvas"); c.width = c.height = px;
            c.getContext("2d").drawImage(img, sx, sy, side, side, 0, 0, px, px);
            resolve(c.toDataURL("image/jpeg", S.AVATAR_QUALITY || 0.82));
          } catch (err) { reject(err); } finally { URL.revokeObjectURL(url); }
        };
        img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("not an image")); };
        img.src = url;
      });
    }

    function renderIcons() {
      const box = $("su-icons");
      const tile = (id, label) => {
        const b = document.createElement("button");
        b.type = "button"; b.className = "su-icon"; b.dataset.id = id;
        b.setAttribute("aria-pressed", "false"); b.setAttribute("aria-label", label); b.title = label;
        return b;
      };
      const tiles = ICONS.map((ic, i) => {
        const b = tile(ic.id, ic.label), img = document.createElement("img");
        img.src = ic.file; img.alt = ""; img.loading = "lazy"; img.decoding = "async";
        img.width = 64; img.height = 64;
        b.style.setProperty("--i", i); // staggers the entrance
        b.append(img);
        return b;
      });

      // "use my own photo" tile, always last
      const up = tile(CUSTOM_ICON, CONFIG.signup.uploadLabel);
      up.classList.add("su-icon-upload");
      up.style.setProperty("--i", ICONS.length);
      const upImg = document.createElement("img");
      upImg.alt = ""; upImg.width = 64; upImg.height = 64; upImg.hidden = true;
      const file = document.createElement("input");
      file.type = "file"; file.accept = "image/*"; file.className = "su-file"; file.tabIndex = -1;
      up.append(upImg, file);
      const saved = readAvatar();
      if (saved) { upImg.src = saved; upImg.hidden = false; up.classList.add("has-photo"); }

      up.addEventListener("click", e => { if (e.target !== file) file.click(); });
      file.addEventListener("click", e => e.stopPropagation()); // don't bounce back into the tile
      file.addEventListener("change", () => {
        const f = file.files && file.files[0];
        if (!f) return;
        up.classList.add("is-loading");
        squareDataURL(f).then(data => {
          Store.set(avatarKey(), data);
          upImg.src = data; upImg.hidden = false;
          up.classList.add("has-photo", "just-set");
          setTimeout(() => up.classList.remove("just-set"), 700);
          select(up);
        }).catch(() => { showMsg(CONFIG.signup.uploadFailed); })
          .finally(() => { up.classList.remove("is-loading"); file.value = ""; });
      });

      box.replaceChildren(...tiles, up);

      function select(b) {
        for (const o of box.children) o.setAttribute("aria-pressed", "false");
        b.setAttribute("aria-pressed", "true");
        selectedIconId = b.dataset.id; signupFixed("icon");
      }
      box.addEventListener("click", e => {
        const b = e.target.closest(".su-icon"); if (!b) return;
        if (b === up && !up.classList.contains("has-photo")) return; // wait for the file first
        select(b);
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
