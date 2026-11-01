// Inbox page (inbox.html): her letters, kept as a stack.
// Classic script; needs js/config.js, js/common.js and js/api.js first.
//
// The stack is every letter he has sent her (Api.getMessages, newest first) with the love note at the bottom:
// it was the first one, so it stays where it started, and under it is what she wrote back. One letter is open
// at a time. Opening one IS reading it - its seal comes off and the account is told (Api.markRead), so the badge
// on her other pages and her other devices drops with it. The love note is never sealed: she has read it, she
// answered it. Writing back to him happens on her card (profile.html), not here.
(function () {
  const S = window.Surprise;
  if (!S || !S.Store || !S.Guard) return;
  if (!S.Guard.require("inbox")) return; // not unlocked: being sent back, so do not initialise

  const { Store, CONFIG, KEYS } = S;
  const T = CONFIG.inbox || {}, R = CONFIG.reply || {};
  const $ = id => document.getElementById(id);
  const stack = $("mb-stack"), sheet = $("mb-sheet"), body = $("mb-body"), date = $("mb-date"), note = $("mb-note");
  if (!stack || !sheet || !body || !date) return;
  const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)");
  const narrow = matchMedia("(max-width: 900px)");
  const NOTE = CONFIG.letter || [];

  // ---- wording (all from CONFIG) ----
  document.title = CONFIG.site.titles.inbox;
  $("inbox-heading").textContent = T.title;
  $("mb-sub").textContent = T.sub;
  stack.setAttribute("aria-label", T.stackLabel || "");
  $("mb-yours-title").textContent = R.inboxTitle;
  $("inbox-empty").textContent = R.inboxEmpty;

  const say = (el, s) => { el.textContent = s || ""; el.hidden = !s; };
  const asDate = ms => { const d = new Date(Number(ms)); return ms && !isNaN(d) ? d : null; };
  const short = ms => { const d = asDate(ms); return d ? d.toLocaleDateString(undefined, { month: "short", day: "numeric" }) : ""; };
  const long = ms => { const d = asDate(ms); return d ? d.toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" }) : ""; };

  // ---- the letters ----
  // The love note is made from CONFIG.letter. It has no id on the server and is never unread.
  const LOVE = { id: "love-note", first: true, readAt: 1 };
  let mail = [];         // his letters, newest first, as the account has them
  let openId = null, touched = false;
  const all = () => mail.concat(NOTE.length ? [LOVE] : []);
  const find = id => all().find(m => m.id === id);
  const unreadCount = () => mail.filter(m => !m.readAt).length;

  // the first real line, as the stack shows it: the love note's opening paragraph, or his first line
  function excerpt(m) {
    const src = m.first ? (NOTE[1] || NOTE[0] || "") : String(m.body || "");
    const line = src.split("\n").map(s => s.trim()).find(Boolean) || "";
    return line.length > 90 ? line.slice(0, 88).trimEnd() + "…" : line;
  }

  function card(m) {
    const li = document.createElement("li");
    li.className = "mb-item";
    const b = document.createElement("button");
    b.type = "button"; b.className = "mb-env"; b.dataset.id = m.id;
    const when = document.createElement("span");
    when.className = "mb-env-date"; when.textContent = m.first ? T.firstLetter : short(m.created);
    const line = document.createElement("span");
    line.className = "mb-env-line"; line.textContent = excerpt(m);
    b.append(when, line);
    if (!m.readAt) {
      b.classList.add("is-sealed");
      const seal = document.createElement("span"); seal.className = "mb-seal"; seal.setAttribute("aria-hidden", "true");
      const sr = document.createElement("span"); sr.className = "pf-sr mb-seal-sr"; sr.textContent = T.unread || "";
      b.append(seal, sr);
    }
    b.addEventListener("click", () => { touched = true; open(m.id, true); });
    li.appendChild(b);
    return li;
  }
  const paintStack = () => { stack.replaceChildren(...all().map(card)); $("inbox-empty").hidden = all().length > 0; };

  // the one she should see first: the newest she has not opened, else the newest, else the love note
  function pick() {
    const fresh = mail.find(m => !m.readAt);
    return fresh ? fresh.id : (mail[0] ? mail[0].id : LOVE.id);
  }

  function open(id, byHand) {
    const m = find(id);
    if (!m) return;
    openId = id;
    stack.querySelectorAll(".mb-env").forEach(b => {
      const on = b.dataset.id === id;
      b.classList.toggle("is-open", on);
      if (on) b.setAttribute("aria-current", "true"); else b.removeAttribute("aria-current");
    });
    date.textContent = m.first ? T.firstLetter : long(m.created);
    body.classList.toggle("is-note", !!m.first);
    if (m.first) {
      // set like the letter itself: greeting, paragraphs, sign-off and name (see CONFIG.letter)
      body.replaceChildren(...NOTE.map(t => { const p = document.createElement("p"); p.textContent = t; return p; }));
    } else {
      const p = document.createElement("p");
      p.className = "mb-words"; p.textContent = m.body; // textContent only; CSS white-space keeps his line breaks
      body.replaceChildren(p);
    }
    $("mb-yours").hidden = !(m.first && hasReply);
    // the sheet turns to the letter: the animation lives on .is-turning and is replayed by re-adding the class
    sheet.classList.remove("is-turning"); void sheet.offsetWidth; sheet.classList.add("is-turning");
    if (!m.readAt) read(m);
    if (byHand && narrow.matches) sheet.scrollIntoView({ behavior: reduceMotion.matches ? "auto" : "smooth", block: "start" });
  }

  // opening it is reading it: the seal comes off now, and the account is told in the background
  function read(m) {
    m.readAt = Date.now();
    const b = [...stack.querySelectorAll(".mb-env")].find(x => x.dataset.id === m.id);
    if (b) {
      b.classList.remove("is-sealed");
      const sr = b.querySelector(".mb-seal-sr"); if (sr) sr.remove();
      const seal = b.querySelector(".mb-seal");
      if (seal) {
        if (reduceMotion.matches) seal.remove();
        else { seal.classList.add("is-breaking"); seal.addEventListener("animationend", () => seal.remove(), { once: true }); }
      }
    }
    if (S.Inbox) S.Inbox.set(unreadCount());
    if (S.Api && S.Api.markRead) S.Api.markRead([m.id]);
  }

  // ---- what she wrote back to the love note: the account's copy, else this device's ----
  let hasReply = false;
  function paintReply(saved) {
    const t = saved && typeof saved === "object" && typeof saved.text === "string" ? saved.text : "";
    hasReply = !!t.trim();
    $("inbox-reply").textContent = hasReply ? t : "";
    const when = hasReply && typeof saved.timestamp === "number" ? asDate(saved.timestamp) : null;
    $("inbox-when").textContent = when ? when.toLocaleString(undefined, { dateStyle: "long", timeStyle: "short" }) : "";
    if (openId === LOVE.id) $("mb-yours").hidden = !hasReply;
  }
  const local = () => Store.getJSON(KEYS.reply, null);
  paintReply(local());
  if (S.Api) S.Api.getProfile().then(r => paintReply((r && r.ok && r.profile && r.profile.reply) || local()), () => {});

  // ---- first paint with what is already here (the love note), then his letters when the account answers ----
  paintStack();
  open(pick(), false);
  $("inbox-heading").focus({ preventScroll: true });
  say(note, T.checking);
  (S.Api ? S.Api.getMessages() : Promise.resolve({ ok: false })).then(r => {
    if (!r || !r.ok || !Array.isArray(r.messages)) { say(note, T.offline); return; }
    say(note, "");
    mail = r.messages.filter(m => m.direction === "to-her").map(m => Object.assign({}, m));
    if (S.Inbox) S.Inbox.set(unreadCount());
    const keep = touched && find(openId) ? openId : null; // she already chose one: leave it open
    paintStack();
    open(keep || pick(), false);
  });
})();
