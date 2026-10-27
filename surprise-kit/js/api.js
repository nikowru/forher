// The one client every page calls for account / progress / reply / memories: Surprise.Api.
// Classic script; load after js/config.js and js/common.js. Every method returns a real Promise and resolves with
//   { ok: true, ... }  or  { ok: false, error: "<code>" }
// so pages never need try/catch. Error codes: "invalid" (missing/bad input), "exists" (sign-up refused: an account
// is already there), "wrong" (username/secret did not match; deliberately the same answer for both), "auth" (no
// valid session), "locked" (remote only: too many wrong logins, paused a few minutes), "network" (the server could not be
// reached or understood).
//
// Phase A runs on the LOCAL driver (localStorage stands in for the server). Phase B adds a REMOTE driver (Google
// Apps Script) behind the same call shapes, so no page changes.
//
// Which driver is used is decided ONCE, below, from the single config value Surprise.APPS_SCRIPT_URL:
//   blank -> local driver   |   set -> remote driver (and ONLY the remote driver).
// The local driver can never silently stand in for an unreachable remote one, by construction:
//   1. exactly one driver object is picked at load; there is no per-call choice and no catch-and-retry on another;
//   2. the local driver's factory is only CALLED in the blank-URL branch, and its object is not exported, so no code
//      path that has a URL set can even reach it;
//   3. a remote failure resolves { ok:false, error:"network" } and stops there.
// (A second, divergent local account while the real one lives on the server is the failure this prevents.)
(function () {
  const S = window.Surprise;
  if (!S || !S.Store || !S.Progress || !S.Session) return;
  const { Store, KEYS, Progress, Session } = S;

  const norm = v => String(v == null ? "" : v).trim().toLowerCase(); // username and secret word: forgiving ("Our Word " == "our word")
  const ok = extra => Promise.resolve(Object.assign({ ok: true }, extra));
  const fail = error => Promise.resolve({ ok: false, error });
  const FLOW = ["proposal", "letter", "memories", "inbox"];
  const cleanProgress = p => { const o = {}; FLOW.concat("accepted").forEach(k => { o[k] = !!(p && typeof p === "object" && p[k] === true); }); return o; };
  const REPLY_MAX = 2000;

  // ---- local driver: pretends to be the server. HONEST NOTE: in Phase A the secret word is a local stand-in only,
  // not security. Anyone with this browser's devtools can read or edit localStorage. The salted SHA-256 below only
  // makes the stored value non-obvious and gives Phase B the same shape ({ alg, salt, hash }); in Phase B the
  // browser sends the plain secret to the server over HTTPS and the SERVER hashes it with a salt kept out of the repo.
  function makeLocalDriver() {
    const load = () => { const a = Store.getJSON(KEYS.account, null); return a && typeof a === "object" && a.username ? a : null; };
    const save = a => Store.setJSON(KEYS.account, a);
    const rand = () => {
      try { const b = new Uint8Array(16); crypto.getRandomValues(b); return Array.prototype.map.call(b, x => ("0" + x.toString(16)).slice(-2)).join(""); }
      catch (e) { return String(Math.random()).slice(2) + String(Date.now()); }
    };
    // async on purpose (SubtleCrypto is); falls back to a plain marker where it is missing (e.g. http on a LAN address)
    function hashSecret(secret, salt) {
      const text = salt + ":" + norm(secret);
      try {
        if (window.crypto && crypto.subtle && window.TextEncoder) {
          return crypto.subtle.digest("SHA-256", new TextEncoder().encode(text)).then(buf =>
            ({ alg: "sha256-local", salt, hash: Array.prototype.map.call(new Uint8Array(buf), x => ("0" + x.toString(16)).slice(-2)).join("") }));
        }
      } catch (e) { /* fall through */ }
      return Promise.resolve({ alg: "plain-local", salt, hash: text });
    }
    function matches(stored, secret) {
      if (!stored || !stored.salt) return Promise.resolve(false);
      return hashSecret(secret, stored.salt).then(h => h.alg === stored.alg && h.hash === stored.hash);
    }
    function newToken(acct) {
      const t = rand();
      acct.tokens = (Array.isArray(acct.tokens) ? acct.tokens : []).concat(t).slice(-5);
      return t;
    }
    const authed = (acct, token) => !!(acct && token && Array.isArray(acct.tokens) && acct.tokens.indexOf(token) >= 0);
    const profileOf = a => ({ username: a.username, mood: a.mood, iconId: a.iconId, musicId: a.musicId, accepted: a.progress.accepted === true, progress: cleanProgress(a.progress), reply: a.reply || null });

    return {
      status() { return ok({ exists: !!load() }); },

      signup(data) {
        const d = data || {};
        if (!String(d.username || "").trim() || !norm(d.secret)) return fail("invalid");
        if (load()) return fail("exists"); // one account only; the server refuses a second sign-up the same way
        const salt = rand();
        return hashSecret(d.secret, salt).then(secret => {
          if (load()) return { ok: false, error: "exists" }; // re-check after the async hash, like the server's lock
          const acct = {
            v: 1, username: String(d.username).trim(), secret,
            mood: d.mood == null ? null : d.mood, iconId: d.iconId == null ? null : d.iconId, musicId: d.musicId == null ? null : d.musicId,
            progress: Object.assign(cleanProgress(null), { proposal: true }), reply: null, created: Date.now(), tokens: []
          };
          const token = newToken(acct);
          save(acct);
          return { ok: true, token, profile: profileOf(acct) };
        });
      },

      // Phase B adds a global lockout (5 wrong in a row -> ~5 minutes); the local stand-in has none.
      login(username, secret) {
        const acct = load();
        if (!acct || norm(username) !== norm(acct.username)) return fail("wrong");
        const live = acct.temp && Number(acct.temp.exp) > Date.now() ? acct.temp.secret : null;
        return matches(acct.secret, secret)
          .then(good => good || (live ? matches(live, secret) : false))
          .then(good => {
            if (!good) return { ok: false, error: "wrong" };
            delete acct.temp;            // whichever word worked, the stand-in has done its job
            const token = newToken(acct); save(acct);
            return { ok: true, token, profile: profileOf(acct) };
          });
      },

      // server-side rules: flags only ever turn ON; letter needs accepted; memories + inbox need the reply
      saveProgress(token, progress) {
        const acct = load();
        if (!authed(acct, token)) return fail("auth");
        const want = cleanProgress(progress), cur = acct.progress = cleanProgress(acct.progress);
        if (want.proposal) cur.proposal = true;
        if (want.accepted) cur.accepted = true;
        if (want.letter && cur.accepted) cur.letter = true;
        if (acct.reply) { if (want.memories) cur.memories = true; if (want.inbox) cur.inbox = true; }
        save(acct);
        return ok({ progress: cleanProgress(cur) });
      },

      saveReply(token, text) {
        const acct = load();
        if (!authed(acct, token)) return fail("auth");
        if (typeof text !== "string") return fail("invalid");
        acct.reply = { text: text.slice(0, REPLY_MAX), timestamp: Date.now() };
        Object.assign(acct.progress = cleanProgress(acct.progress), { memories: true, inbox: true });
        save(acct);
        return ok({ progress: cleanProgress(acct.progress), reply: acct.reply });
      },

      getProfile(token) {
        const acct = load();
        if (!authed(acct, token)) return fail("auth");
        return ok({ profile: profileOf(acct) });
      },

      // Phase A has no mail. It mints the same kind of one-hour word and prints it to the console so the
      // flow can still be walked end to end; Phase B emails it instead. Both answer ok either way.
      forgotSecret() {
        const acct = load();
        if (!acct) return ok({});
        const word = "try-" + Math.random().toString(36).slice(2, 6) + "-" + Math.random().toString(36).slice(2, 6);
        return hashSecret(word, rand()).then(h => {
          acct.temp = { secret: h, exp: Date.now() + 60 * 60 * 1000 };
          save(acct);
          try { console.info("[surprise] local stand-in for the emailed word:", word); } catch (e) { /* ignore */ }
          return { ok: true, mailed: false };
        });
      },

      // "Not me / start fresh": erase the account so sign-up can be lived again. Gated on the secret
      // word like the server, so the two drivers refuse and accept in exactly the same cases.
      deleteAccount(username, secret) {
        const acct = load();
        if (!acct) return ok({ existed: false }); // already gone; a repeated call is still a success
        if (norm(username) !== norm(acct.username)) return fail("wrong");
        return matches(acct.secret, secret).then(good => {
          if (!good) return { ok: false, error: "wrong" }; // one answer for either part
          Store.remove(KEYS.account);
          return { ok: true, existed: true };
        });
      },

      // public, like the real getMemories: the Memories data. Phase A reads the repo's clips.json.
      getMemories() {
        return fetch("clips.json").then(r => { if (!r.ok) throw new Error("HTTP " + r.status); return r.json(); })
          .then(j => ({ ok: true, source: "clips.json", collections: Array.isArray(j.collections) ? j.collections : [], clips: Array.isArray(j.clips) ? j.clips : [] }))
          .catch(() => ({ ok: false, error: "network" }));
      }
    };
  }

  // ---- remote driver: Google Apps Script (backend/Code.gs, set up by docs/backend-setup.md). One POST per call, body a
  // JSON string sent as text/plain so the browser makes no CORS preflight (an Apps Script web app cannot answer one).
  // fetch follows Apps Script's 302 to script.googleusercontent.com by itself; the response is read normally (no no-cors).
  // Policy, in one place:
  //   - every failure to get a usable JSON answer (offline, timeout, HTML error page, unknown/"server" code) is "network";
  //   - ATTEMPT_MS bounds each attempt (cold starts take a few seconds), TOTAL_MS bounds a whole call;
  //   - idempotent calls retry quietly up to RETRIES more times with a short backoff, never past TOTAL_MS: status,
  //     getMemories, getProfile (reads), saveProgress (flags only turn ON), saveReply (replaces with the same text), login
  //     (a repeat just checks the same word again);
  //   - signup is NEVER auto-retried: a lost answer could hide a created account. If she tries again the server answers
  //     "exists" (it allows exactly one account) and signup.js sends her to login, so no second account is possible.
  function makeRemoteDriver(endpoint) {
    const ATTEMPT_MS = 18000, TOTAL_MS = 30000, RETRIES = 2, BACKOFF_MS = [600, 1500];
    const KNOWN = { invalid: 1, exists: 1, wrong: 1, auth: 1, locked: 1 };
    const wait = ms => new Promise(res => setTimeout(res, ms));

    function once(payload, ms) {
      let timer, ctl = null;
      try { ctl = typeof AbortController === "function" ? new AbortController() : null; } catch (e) { ctl = null; }
      const timeout = new Promise(res => { timer = setTimeout(() => { try { if (ctl) ctl.abort(); } catch (e) { /* ignore */ } res(null); }, ms); });
      const req = fetch(endpoint, {
        method: "POST", headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify(payload), signal: ctl ? ctl.signal : undefined, credentials: "omit"
      }).then(r => r.text()).then(t => { try { return JSON.parse(t); } catch (e) { return null; } }) // HTML error page -> null
        .catch(() => null);
      return Promise.race([req, timeout]).then(j => { clearTimeout(timer); return j; });
    }
    // -> { ok:true, ... } | { ok:false, error } with a client error code
    function call(payload, retry) {
      const started = Date.now();
      const attempt = n => once(payload, Math.max(1000, Math.min(ATTEMPT_MS, TOTAL_MS - (Date.now() - started)))).then(j => {
        if (j && typeof j === "object" && j.ok === true) return j;
        const code = j && typeof j === "object" && KNOWN[j.error] ? j.error : "network"; // "server", junk, no answer
        if (code !== "network") return { ok: false, error: code };
        const delay = BACKOFF_MS[n] || 1500;
        if (!retry || n >= RETRIES || Date.now() - started + delay >= TOTAL_MS) return { ok: false, error: "network" };
        return wait(delay).then(() => attempt(n + 1));
      });
      return attempt(0);
    }
    return {
      status() { return call({ action: "status" }, true); },
      signup(d) { d = d || {}; return call({ action: "signup", username: d.username, secret: d.secret, mood: d.mood, iconId: d.iconId, musicId: d.musicId }, false); },
      login(username, secret) { return call({ action: "login", username, secret }, true); },
      saveProgress(token, progress) { return call({ action: "saveProgress", token, progress }, true); },
      saveReply(token, text) { return call({ action: "saveReply", token, text }, true); },
      getProfile(token) { return call({ action: "getProfile", token }, true); },
      deleteAccount(username, secret) { return call({ action: "deleteAccount", username, secret }, true); },
      forgotSecret() { return call({ action: "forgotSecret" }, false); }, // never retried: one ask, one email
      getMemories() { return call({ action: "getMemories" }, true); }
    };
  }

  const url = String(S.APPS_SCRIPT_URL || "").trim();
  const driver = url ? makeRemoteDriver(url) : makeLocalDriver(); // the ONLY place a driver is chosen
  const tokenNow = () => { const s = Session.get(); return s && s.token ? s.token : null; };
  // keep this device's Progress in step with the account: flags only ever turn on, never off
  function mergeProgress(remote) {
    const local = Progress.read(), r = cleanProgress(remote), m = {};
    FLOW.concat("accepted").forEach(k => { m[k] = local[k] || r[k]; });
    Progress.apply(m);
  }
  // A dead session (expired, or the account was reset server-side): forget it and send her to login instead of leaving her
  // on a page whose saves silently fail. Remote only (the local driver's tokens cannot go stale). Never fires on the
  // login / sign-up pages themselves. Her device copies (progress, reply) are kept and re-sent after she logs in again.
  const onAuthPage = () => /(^|\/)(login|index)(\.html?)?$|\/$/.test(location.pathname);
  function authLost(r) {
    if (url && r && r.ok === false && r.error === "auth") {
      Session.clear();
      if (!onAuthPage()) location.replace("index.html");
    }
    return r;
  }
  // after a login on the server: push whatever this device has that the account lacks (a reply or Yes that failed to save
  // when the session died). Capped so a slow server cannot hold her on the login page.
  function catchUp(profile) {
    if (!url) return Promise.resolve();
    const reply = Store.getJSON(KEYS.reply, null), p = profile || {};
    let job = Promise.resolve();
    if (reply && typeof reply.text === "string" && !p.reply) job = driver.saveReply(tokenNow(), reply.text);
    else {
      const have = cleanProgress(p.progress), mine = Progress.read();
      if (FLOW.concat("accepted").some(k => mine[k] && !have[k])) job = driver.saveProgress(tokenNow(), mine);
    }
    return Promise.race([job.catch(() => null), new Promise(res => setTimeout(res, 4000))]);
  }
  const guard = fn => { try { return Promise.resolve(fn()).catch(() => ({ ok: false, error: "network" })); } catch (e) { return fail("network"); } };

  S.Api = {
    driver: url ? "remote" : "local", // for display / debugging only
    status() { return guard(() => driver.status()); },
    // data: { username, secret, mood, iconId, musicId }. On success the device is logged in and `proposal` is unlocked.
    signup(data) {
      return guard(() => driver.signup(data)).then(r => {
        if (r.ok) { Session.start(r.token); mergeProgress(r.profile && r.profile.progress); Progress.unlock("proposal"); }
        return r;
      });
    },
    // On success the device is logged in and its Progress catches up with the account (so she can be sent to Progress.furthest()).
    login(username, secret) {
      return guard(() => driver.login(username, secret)).then(r => {
        if (!r.ok) return r;
        Session.start(r.token); mergeProgress(r.profile && r.profile.progress); Progress.unlock("proposal");
        return catchUp(r.profile).then(() => r);
      });
    },
    saveProgress(progress) {
      return guard(() => driver.saveProgress(tokenNow(), progress || Progress.read())).then(authLost).then(r => { if (r.ok) mergeProgress(r.progress); return r; });
    },
    saveReply(text) {
      return guard(() => driver.saveReply(tokenNow(), text)).then(authLost).then(r => { if (r.ok) mergeProgress(r.progress); return r; });
    },
    getProfile() { return guard(() => driver.getProfile(tokenNow())).then(authLost); },
    getMemories() { return guard(() => driver.getMemories()); },
    // "Not me / start fresh": forget this device's login only (the account itself stays)
    logout() { Session.clear(); return ok({}); },
    // "I forgot our secret word": asks the server to mint a one-hour word and email it to him. Her own
    // word is untouched, and the answer is the same whether or not anything was sent, so the gate never
    // becomes a way of finding out whether an account exists.
    forgotSecret() { return guard(() => driver.forgotSecret()); },
    // Erase the account everywhere, so the whole thing can be lived again from the sign-up card.
    // The secret word has to be right, and only once the server confirms does this device drop its
    // own copies - a refused delete leaves her exactly where she was.
    deleteAccount(username, secret) {
      return guard(() => driver.deleteAccount(username, secret)).then(r => {
        if (r.ok && typeof S.reset === "function") S.reset(); // clears every key but the theme, and stops teardown writing it back
        return r;
      });
    }
  };
})();
