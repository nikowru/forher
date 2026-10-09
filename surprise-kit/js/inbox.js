// Inbox page (inbox.html): guard, wording, and her saved reply shown back to her (read-only).
// Classic script; needs js/config.js and js/common.js first. "Seen" is handled by common.js (visiting the inbox
// page sets the seen flag in initChrome and the badge never shows on the inbox page itself), so nothing to do here.
(function () {
  const S = window.Surprise;
  if (!S || !S.Store || !S.Guard) return;
  if (!S.Guard.require("inbox")) return; // not unlocked: being sent back to the letter/sign-up, so do not initialise

  const { Store, CONFIG, KEYS } = S;
  const $ = id => document.getElementById(id);
  const heading = $("inbox-heading"), replyEl = $("inbox-reply"), whenEl = $("inbox-when"), emptyEl = $("inbox-empty");
  if (!heading || !replyEl || !whenEl || !emptyEl) return;

  // ---- wording (all from CONFIG) ----
  document.title = CONFIG.site.titles.inbox;
  heading.textContent = CONFIG.reply.inboxTitle;
  emptyEl.textContent = CONFIG.reply.inboxEmpty;

  // ---- her saved reply: textContent only (untrusted); CSS white-space:pre-wrap keeps her line breaks ----
  const saved = Store.getJSON(KEYS.reply, null);
  const text = saved && typeof saved === "object" && typeof saved.text === "string" ? saved.text : "";
  if (text.trim()) {
    replyEl.textContent = text;
    const d = new Date(saved.timestamp); // millisecond timestamp from Date.now()
    if (typeof saved.timestamp === "number" && !isNaN(d)) {
      whenEl.textContent = d.toLocaleString(undefined, { dateStyle: "long", timeStyle: "short" });
    }
  } else {
    emptyEl.hidden = false; // #inbox-reply / #inbox-when stay empty (the CSS hides them when :empty)
  }

  heading.focus({ preventScroll: true });
})();
