// Her profile card (profile.html): the details she can see and change about herself, written as a
// letter about her rather than printed as a form - every value is set into a sentence, and the words
// on either side of it come from CONFIG.profile as moodLead/moodTail and the rest.
// Classic script; needs js/config.js, js/common.js and js/api.js first.
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
  // The labels are all still set; they are just read rather than shown (.pf-sr in the markup),
  // because each line is a sentence that already says what its value is. The lead/tail pairs are
  // the words that sentence puts on either side of the value.
  setText("pf-name-label", P.nameLabel);
  setText("pf-mood-label", P.moodLabel);
  setText("pf-mood-lead", P.moodLead);
  setText("pf-mood-tail", P.moodTail);
  setText("pf-secret-label", P.secretLabel);
  setText("pf-secret-lead", P.secretLead);
  setText("pf-secret-tail", P.secretTail);
  setText("pf-rank-label", P.rankLabel);
  setText("pf-rank-lead", P.rankLead);
  setText("pf-rank-text", P.rank);
  setText("pf-rank-tail", P.rankTail);
  setText("pf-us-label", P.usLabel);
  setText("pf-us-cap", P.usCaption);
  setText("pf-tunes-label", P.playlistLabel);
  setText("pf-sign", P.sign);
  if (S.Compose) S.Compose.bind($("pf-write"));   // writing to me, under her card
  setText("pf-name-edit", P.nameChange);
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
    // 80 is the compact single-row player. The tall 152 variant lists the tracks, which made the
    // embed the loudest thing on a letter it is only meant to be enclosed with.
    f.width = "100%"; f.height = "80"; f.frameBorder = "0"; f.loading = "lazy";
    f.allow = "autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture";
    f.setAttribute("title", P.playlistTitle);
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
  // Where it cannot be known, the value carries the whole sentence and the words on either side of
  // it step out of the way - otherwise the line would read "our word is only you know this one".
  let secretShown = false;
  function paintSecret(r) {
    const val = $("pf-secret-val"), toggle = $("pf-secret-toggle");
    const lead = $("pf-secret-lead"), tail = $("pf-secret-tail");
    if (!r.remembered) {
      lead.hidden = true;
      tail.hidden = true;
      val.textContent = P.secretUnknown;
      val.classList.add("is-unknown");
      val.classList.remove("is-masked");
      toggle.hidden = true;
      return;
    }
    lead.hidden = false;
    tail.hidden = false;
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

  // Revealing runs an animation on the value itself: the word is let out left to right rather than
  // appearing all at once. The class comes off again at the end so the next reveal replays it, and
  // the forced reflow restarts it if she toggles faster than the animation runs.
  const letOut = el => { el.classList.remove("is-revealing"); void el.offsetWidth; el.classList.add("is-revealing"); };
  $("pf-secret-val").addEventListener("animationend", e => {
    if (e.animationName === "pf-letout") e.target.classList.remove("is-revealing");
  });
  $("pf-secret-toggle").addEventListener("click", () => {
    secretShown = !secretShown;
    Profile.read().then(r => {
      if (!r.ok) return;
      paintSecret(r);
      if (secretShown) letOut($("pf-secret-val"));
    });
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
  pick.replaceChildren(...(S.MOODS || []).map(m => {
    const b = document.createElement("button");
    b.type = "button"; b.className = "pf-moodbtn"; b.dataset.id = m.id;
    b.setAttribute("aria-label", m.label); b.title = m.label;
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
  // Only her photo answers the pointer: --rx/--ry/--mx/--my are set here and style.css applies them
  // to #pf-photo alone, so the print shifts inside its mount while the mount, the stamp and every
  // written word stay still. Leaning the whole card took the text with it and read as the page being
  // crooked. Pointer only: this is a flourish, never a way in, and everything is readable at rest.
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
