// Her profile card (profile.html): the details she can see and change about herself, on a card that
// leans toward the cursor. Classic script; needs js/config.js, js/common.js and js/api.js first.
//
// The secret word is the one thing the server cannot supply - it is kept there only as a salted
// one-way hash - so the card shows the copy THIS device keeps when she ticked "Remember me on this
// laptop", and says something kind on a device that was never told to. See Surprise.Profile.
(function () {
  const S = window.Surprise;
  if (!S || !S.Store || !S.Guard || !S.Api) return;
  const { Api, Store, CONFIG, KEYS, Profile } = S;
  const $ = id => document.getElementById(id);
  const card = $("pf");
  if (!card) return;                       // not this page
  if (!S.Guard.require("profile")) return; // not hers yet: being sent back

  const P = CONFIG.profile, reduceMotion = matchMedia("(prefers-reduced-motion: reduce)");
  document.title = CONFIG.site.titles.profile;
  const setText = (id, t) => { const el = $(id); if (el) el.textContent = t; };
  const show = t => { const m = $("pf-msg"); m.textContent = t; m.hidden = false; };
  const clearMsg = () => { const m = $("pf-msg"); m.textContent = ""; m.hidden = true; };

  // ---- wording ----
  setText("pf-name-label", P.nameLabel);
  setText("pf-mood-label", P.moodLabel);
  setText("pf-secret-label", P.secretLabel);
  setText("pf-rank-label", P.rankLabel);
  setText("pf-rank-text", P.rank);
  setText("pf-us-label", P.usLabel);
  setText("pf-us-cap", P.usCaption);
  setText("pf-tunes-label", P.playlistLabel);
  setText("pf-name-edit", P.moodChange);
  setText("pf-mood-edit", P.moodChange);
  setText("pf-name-save", P.secretSave);
  setText("pf-secret-save", P.secretSave);
  setText("pf-secret-change", P.secretChange);
  setText("pf-name-input-label", P.editName);
  setText("pf-secret-input-label", P.secretNew);

  // the rank icon is optional: a missing file must not leave a broken image on her card
  const rankImg = $("pf-rank-img");
  if (P.rankIcon) {
    rankImg.addEventListener("load", () => { rankImg.hidden = false; });
    rankImg.addEventListener("error", () => { rankImg.remove(); }); // the text badge carries it alone
    rankImg.src = P.rankIcon;
  } else { rankImg.remove(); }

  // ---- the playlist, the same one the music button plays ----
  (function playlist() {
    const raw = String(S.SPOTIFY_PLAYLIST || "").trim();
    const box = $("pf-tunes-embed");
    if (!raw || !box) { const w = box && box.closest(".pf-tunes"); if (w) w.hidden = true; return; }
    const m = raw.match(/playlist[/:]([A-Za-z0-9]+)/) || raw.match(/^([A-Za-z0-9]{16,})$/);
    if (!m) { const w = box.closest(".pf-tunes"); if (w) w.hidden = true; return; }
    const f = document.createElement("iframe");
    f.src = "https://open.spotify.com/embed/playlist/" + m[1];
    f.width = "100%"; f.height = "152"; f.frameBorder = "0"; f.loading = "lazy";
    f.allow = "autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture";
    f.setAttribute("title", P.playlistLabel);
    box.append(f);
  })();

  // ---- her details ----
  let current = null; // the last profile we were given, so an edit can send only what changed

  function paint(r) {
    current = r.account;
    const a = r.account;
    setText("pf-name", a.displayName || a.username || "");
    $("pf-name-input").value = a.displayName || a.username || "";

    const moodImg = $("pf-mood-img");
    if (a.moodFile) { moodImg.src = a.moodFile; moodImg.hidden = false; } else { moodImg.hidden = true; }
    setText("pf-mood-text", a.moodLabel || a.moodId || "");

    const av = $("pf-avatar");
    if (a.avatar) { av.src = a.avatar; } else { av.closest(".pf-badge").hidden = true; }

    if (a.created) {
      const d = new Date(a.created);
      setText("pf-since", isNaN(d) ? "" : P.sinceLabel + " " + d.toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" }));
    }
    paintSecret(r);
  }

  // The word, or an honest note that this device cannot know it. Hidden until she asks either way.
  let secretShown = false;
  function paintSecret(r) {
    const val = $("pf-secret-val"), toggle = $("pf-secret-toggle");
    if (!r.remembered) {
      val.textContent = P.secretUnknown;
      val.classList.add("is-unknown");
      toggle.hidden = true;
      return;
    }
    val.classList.remove("is-unknown");
    toggle.hidden = false;
    toggle.textContent = secretShown ? P.secretHide : P.secretShow;
    val.textContent = secretShown ? r.secret : "•".repeat(Math.max(6, Math.min(14, r.secret.length)));
    val.classList.toggle("is-masked", !secretShown);
  }

  function load() {
    return Profile.read().then(r => {
      if (!r.ok) { show(P.saveFailed); return null; }
      paint(r);
      return r;
    });
  }

  $("pf-secret-toggle").addEventListener("click", () => {
    secretShown = !secretShown;
    Profile.read().then(r => { if (r.ok) paintSecret(r); });
  });

  // ---- editing: name ----
  const nameForm = $("pf-nameform");
  $("pf-name-edit").addEventListener("click", () => {
    const open = !nameForm.hidden;
    nameForm.hidden = open;
    if (!open) $("pf-name-input").focus();
  });
  nameForm.addEventListener("submit", e => {
    e.preventDefault();
    const v = $("pf-name-input").value.trim();
    if (!v) { show(P.nameTooShort); return; }
    busy($("pf-name-save"), true);
    clearMsg();
    Api.updateProfile({ displayName: v }).then(r => {
      busy($("pf-name-save"), false, P.secretSave);
      if (!r.ok) { show(P.saveFailed); return; }
      nameForm.hidden = true;
      load();
    });
  });

  // ---- editing: mood, from the same five she chose at sign-up ----
  const pick = $("pf-mood-pick");
  pick.replaceChildren(...(S.MOODS || []).map((m, i) => {
    const b = document.createElement("button");
    b.type = "button"; b.className = "pf-moodbtn"; b.dataset.id = m.id;
    b.setAttribute("aria-label", m.label); b.title = m.label;
    b.style.setProperty("--i", i);
    if (m.file) {
      const img = document.createElement("img");
      img.src = m.file; img.alt = ""; img.width = 56; img.height = 56; img.decoding = "async";
      b.append(img);
    } else { b.textContent = m.emoji || m.label; }
    return b;
  }));
  $("pf-mood-edit").addEventListener("click", () => {
    pick.hidden = !pick.hidden;
    if (!pick.hidden) { const f = pick.querySelector(".pf-moodbtn"); if (f) f.focus(); }
  });
  pick.addEventListener("click", e => {
    const b = e.target.closest(".pf-moodbtn"); if (!b) return;
    clearMsg();
    Api.updateProfile({ mood: b.dataset.id }).then(r => {
      if (!r.ok) { show(P.saveFailed); return; }
      pick.hidden = true;
      load();
    });
  });

  // ---- editing: the secret word ----
  const secForm = $("pf-secretform");
  $("pf-secret-change").addEventListener("click", () => {
    const open = !secForm.hidden;
    secForm.hidden = open;
    if (!open) $("pf-secret-input").focus();
  });
  secForm.addEventListener("submit", e => {
    e.preventDefault();
    const v = $("pf-secret-input").value;
    if (!v.trim()) { show(P.secretTooShort); return; }
    busy($("pf-secret-save"), true);
    clearMsg();
    Api.changeSecret(v).then(r => {
      busy($("pf-secret-save"), false, P.secretSave);
      if (!r.ok) { show(P.saveFailed); return; }
      secForm.hidden = true;
      $("pf-secret-input").value = "";
      secretShown = false;
      show(P.secretSaved);
      load();
    });
  });

  function busy(btn, on, label) {
    btn.disabled = on;
    if (on) { btn.setAttribute("aria-busy", "true"); btn.textContent = P.saving; }
    else { btn.removeAttribute("aria-busy"); btn.textContent = label || P.secretSave; }
  }

  // ---- the tilt ----
  // The card leans toward the pointer and each layer moves by its own --depth, so the photo sits in
  // front of the HUD and the chips sit behind it. Pointer only: this is a flourish, never a way in,
  // and everything is readable and usable at rest.
  (function tilt() {
    if (reduceMotion.matches) return;
    if (!matchMedia("(hover: hover) and (pointer: fine)").matches) return; // no hover on a phone
    let raf = 0, tx = 0, ty = 0, cx = 0, cy = 0;
    const MAX = 7; // degrees; past about 8 the text starts to swim
    function frame() {
      raf = 0;
      cx += (tx - cx) * 0.12; cy += (ty - cy) * 0.12; // ease, so a flicked pointer does not snap it
      card.style.setProperty("--rx", (-cy * MAX).toFixed(3) + "deg");
      card.style.setProperty("--ry", (cx * MAX).toFixed(3) + "deg");
      card.style.setProperty("--mx", cx.toFixed(4));
      card.style.setProperty("--my", cy.toFixed(4));
      if (Math.abs(tx - cx) > 0.001 || Math.abs(ty - cy) > 0.001) raf = requestAnimationFrame(frame);
    }
    function aim(e) {
      const r = card.getBoundingClientRect();
      tx = Math.max(-1, Math.min(1, (e.clientX - (r.left + r.width / 2)) / (r.width / 2)));
      ty = Math.max(-1, Math.min(1, (e.clientY - (r.top + r.height / 2)) / (r.height / 2)));
      if (!raf) raf = requestAnimationFrame(frame);
    }
    addEventListener("pointermove", aim, { passive: true });
    addEventListener("pointerleave", () => { tx = 0; ty = 0; if (!raf) raf = requestAnimationFrame(frame); });
    card.classList.add("is-tilting");
  })();

  load();
})();
