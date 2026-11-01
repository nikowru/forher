// His back office (admin.html): sign in, write to her, and see what has gone each way.
// Classic script; needs js/config.js, js/common.js and js/api.js first.
//
// Not part of her flow. There is no guard and no header, and nothing here reads her session or her
// progress: every call goes through Surprise.Api.admin, which sends his admin token and only that. So
// a visit from her browser - signed in as her or not - finds the same plain sign-in as anyone, and no
// mail is ever asked for until the admin sign-in has succeeded.
(function () {
  const S = window.Surprise;
  if (!S || !S.Api || !S.Api.admin || !S.CONFIG) return;
  const A = S.Api.admin, T = S.CONFIG.admin || {};
  const $ = id => document.getElementById(id);
  const signin = $("ad-signin"), desk = $("ad-desk"), user = $("ad-user"), pass = $("ad-pass");
  const go = $("ad-signin-go"), body = $("ad-body"), send = $("ad-send"), list = $("ad-mail");
  if (!signin || !desk || !user || !pass || !go || !body || !send || !list) return;

  // ---- wording (all from CONFIG.admin) ----
  const text = (id, s) => { const el = $(id); if (el) el.textContent = s || ""; };
  text("ad-user-label", T.user); text("ad-pass-label", T.pass); text("ad-signin-go", T.signIn);
  text("ad-heading", T.heading); text("ad-signout", T.signOut); text("ad-kicker", T.kicker);
  text("ad-compose-title", T.composeTitle); text("ad-body-label", T.bodyLabel); text("ad-send", T.send);
  text("ad-list-title", T.listTitle); text("ad-refresh", T.refresh); text("ad-none", T.none);
  body.placeholder = T.placeholder || "";

  const say = (id, s) => { const el = $(id); if (!el) return; el.textContent = s || ""; el.hidden = !s; };
  const when = ms => {
    const d = new Date(Number(ms));
    return ms && !isNaN(d) ? d.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" }) : "";
  };
  const errorText = code => (code === "locked" ? T.locked : code === "network" ? T.network : T.wrong);

  // ---- signed in or not: the whole page is one or the other ----
  function show(inside) {
    signin.hidden = inside;
    desk.hidden = !inside;
    document.title = (inside ? T.titleIn : T.title) || "";
    if (inside) load();
    else list.replaceChildren();   // nothing of hers lingers in the page once signed out
  }
  // the session died under him (password changed, expired): back to the sign-in, draft untouched
  function lost() {
    say("ad-signin-msg", T.signedOut);
    show(false);
    user.focus();
  }

  let signingIn = false;
  signin.addEventListener("submit", e => {
    e.preventDefault();
    if (signingIn) return;
    signingIn = true; go.disabled = true; go.textContent = T.signingIn || "";
    A.login(user.value, pass.value).then(r => {
      signingIn = false; go.disabled = false; go.textContent = T.signIn || "";
      if (!r.ok) { say("ad-signin-msg", errorText(r.error)); pass.select(); return; }
      pass.value = "";
      say("ad-signin-msg", "");
      show(true);
      body.focus({ preventScroll: true });
    });
  });

  $("ad-signout").addEventListener("click", () => {
    A.logout();
    say("ad-send-msg", ""); say("ad-list-msg", "");
    show(false);
    user.focus();
  });

  // ---- the list: both directions, newest first ----
  function item(m) {
    const li = document.createElement("li"), mine = m.direction === "to-her";
    li.className = "ad-item " + (mine ? "is-to-her" : "is-to-me");
    const meta = document.createElement("p"); meta.className = "ad-meta";
    const who = document.createElement("span"); who.className = "ad-who";
    who.textContent = m.letterReply ? T.letterReply : mine ? T.toHer : T.toMe;
    const at = document.createElement("time"); at.className = "ad-when";
    at.dateTime = new Date(Number(m.created) || 0).toISOString(); at.textContent = when(m.created);
    meta.append(who, at);
    if (mine) {
      const st = document.createElement("span"); st.className = "ad-state";
      st.textContent = m.readAt ? (T.opened + " " + when(m.readAt)) : T.notOpened;
      meta.append(st);
    } else if (!m.readAt) {
      const n = document.createElement("span"); n.className = "ad-new"; n.textContent = T.isNew;
      meta.append(n);
    }
    const p = document.createElement("p"); p.className = "ad-text";
    p.textContent = m.body;          // textContent only: her words are never parsed as markup
    li.append(meta, p);
    return li;
  }

  let loading = 0;
  function load() {
    const n = ++loading;
    return A.getMessages().then(r => {
      if (n !== loading) return;     // an older answer arriving after a newer one changes nothing
      if (!r.ok) {
        if (r.error === "auth") return lost();
        say("ad-list-msg", T.network);
        return;
      }
      say("ad-list-msg", "");
      const mail = Array.isArray(r.messages) ? r.messages : [];
      list.replaceChildren(...mail.map(item));
      $("ad-none").hidden = mail.length > 0;
      // He has now seen everything she sent. The "new" marks stay on this view; the next one is quiet.
      const unseen = mail.filter(m => m.direction === "to-me" && !m.readAt).map(m => m.id);
      if (unseen.length) A.markRead(unseen);
    });
  }
  $("ad-refresh").addEventListener("click", () => load());

  // ---- compose ----
  const count = () => { text("ad-count", body.value.length + " / " + body.maxLength); };
  body.addEventListener("input", () => { count(); say("ad-send-msg", ""); });
  count();

  let sending = false;
  $("ad-compose").addEventListener("submit", e => {
    e.preventDefault();
    if (sending) return;
    const words = body.value.trim();
    if (!words) { say("ad-send-msg", T.empty); body.focus(); return; }
    sending = true; send.disabled = true; send.textContent = T.sending || "";
    A.sendMessage(words).then(r => {
      sending = false; send.disabled = false; send.textContent = T.send || "";
      if (r.ok) {
        body.value = ""; count();
        say("ad-send-msg", T.sent);
        load();
        return;
      }
      if (r.error === "auth") return lost();   // the draft stays in the field for after signing in
      say("ad-send-msg", T.sendFailed);
    });
  });

  show(A.signedIn());
})();
