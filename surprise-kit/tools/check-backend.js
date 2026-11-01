// Runs backend/Code.gs in Node against in-memory stand-ins for the Sheet, Script Properties, the cache
// and the lock, and walks every action the site calls through doPost - the same front door the web app
// uses. Nothing here touches the network, so it cannot reach the deployed script or the real Sheet.
//
//   node tools/check-backend.js
//   ADMIN_DEFAULT=<the default admin password> node tools/check-backend.js   # also signs in with the real default
//
// The default admin password is deliberately not written here either. Without ADMIN_DEFAULT the run
// proves the default is SEEDED (the stored hash is the salted form of DEFAULT_ADMIN_DIGEST) and does
// every sign-in with a harness password set through ADMIN_PASSWORD, the same way you would change it.
//
// What it can prove: routing, who may do what with which token, lockouts, hashing, what is stored and
// what is returned. What it cannot: how the real Sheet parses a cell (dates, "=" formulas) or how
// LockService behaves under real concurrency. Those it only checks were asked for correctly.
const fs = require("fs"), path = require("path"), vm = require("vm"), crypto = require("crypto");

const SRC = fs.readFileSync(path.join(__dirname, "..", "backend", "Code.gs"), "utf8");

// ---- Apps Script stand-ins ---------------------------------------------------------------------
function makeSheet(name) {
  const rows = [];   // rows[r - 1][c - 1], 1-based like the real thing
  const formats = {};
  const cellAt = (r, c) => (rows[r - 1] && rows[r - 1][c - 1] !== undefined ? rows[r - 1][c - 1] : "");
  const put = (r, c, v) => { while (rows.length < r) rows.push([]); rows[r - 1][c - 1] = v; };
  const blank = v => v === "" || v == null;
  const sheet = {
    name, rows, formats,
    getLastRow() { for (let r = rows.length; r > 0; r--) if (rows[r - 1].some(v => !blank(v))) return r; return 0; },
    getLastColumn() { let m = 0; rows.forEach(row => row.forEach((v, i) => { if (!blank(v)) m = Math.max(m, i + 1); })); return m; },
    setFrozenRows() {},
    getRange(r, c, nr, nc) {
      nr = nr || 1; nc = nc || 1;
      const range = {
        getValues() { const out = []; for (let i = 0; i < nr; i++) { const row = []; for (let j = 0; j < nc; j++) row.push(cellAt(r + i, c + j)); out.push(row); } return out; },
        setValues(v) {
          if (v.length !== nr || v.some(row => row.length !== nc)) throw new Error("setValues: shape mismatch on " + name);
          v.forEach((row, i) => row.forEach((x, j) => put(r + i, c + j, x))); return range;
        },
        setValue(x) { put(r, c, x); return range; },
        clearContent() { for (let i = 0; i < nr; i++) for (let j = 0; j < nc; j++) put(r + i, c + j, ""); return range; },
        setFontWeight() { return range; },
        setNumberFormats(f) { f.forEach((row, i) => row.forEach((x, j) => { formats[(r + i) + ":" + (c + j)] = x; })); return range; },
        setNumberFormat(x) { for (let i = 0; i < nr; i++) for (let j = 0; j < nc; j++) formats[(r + i) + ":" + (c + j)] = x; return range; }
      };
      return range;
    }
  };
  return sheet;
}

function makeWorld() {
  const sheets = {}, props = {}, cache = {}, mail = [];
  const env = { quota: 100, email: "owner@example.invalid", sendFails: false };   // knobs for the mail path
  const ss = {
    getSheetByName: n => sheets[n] || null,
    insertSheet: n => (sheets[n] = makeSheet(n))
  };
  const g = {
    console: { log() {} },
    Logger: { log() {} },
    SpreadsheetApp: { getActiveSpreadsheet: () => ss },
    PropertiesService: { getScriptProperties: () => ({
      getProperty: k => (Object.prototype.hasOwnProperty.call(props, k) ? props[k] : null),
      setProperty: (k, v) => { props[k] = String(v); },
      deleteProperty: k => { delete props[k]; }
    }) },
    CacheService: { getScriptCache: () => ({
      get: k => (Object.prototype.hasOwnProperty.call(cache, k) ? cache[k] : null),
      put: (k, v) => { cache[k] = String(v); },
      remove: k => { delete cache[k]; },
      removeAll: ks => ks.forEach(k => { delete cache[k]; })
    }) },
    LockService: { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) },
    Utilities: {
      DigestAlgorithm: { SHA_256: "sha256" }, Charset: { UTF_8: "utf8" },
      computeDigest: (alg, text) => Array.from(crypto.createHash("sha256").update(String(text), "utf8").digest()).map(b => (b > 127 ? b - 256 : b)),
      getUuid: () => crypto.randomUUID(),
      formatDate: d => d.toISOString().slice(0, 10)
    },
    ContentService: { MimeType: { JSON: "json" }, createTextOutput: s => ({ content: s, setMimeType() { return this; } }) },
    MailApp: { sendEmail: m => { if (env.onSend) env.onSend(m); if (env.sendFails) throw new Error("Service invoked too many times"); mail.push(m); }, getRemainingDailyQuota: () => env.quota },
    Session: { getEffectiveUser: () => ({ getEmail: () => env.email }), getScriptTimeZone: () => "UTC" }
  };
  const ctx = vm.createContext(g);
  vm.runInContext(SRC, ctx, { filename: "Code.gs" });
  const call = body => JSON.parse(ctx.doPost({ postData: { contents: JSON.stringify(body) } }).content);
  return { ctx, call, sheets, props, cache, mail, env };
}

// ---- the checks ----------------------------------------------------------------------------------
const results = [];
const check = (name, cond, detail) => results.push({ name, pass: !!cond, detail: cond ? undefined : detail });
const skip = name => results.push({ name, pass: true, skipped: true });
const DEFAULT = process.env.ADMIN_DEFAULT || "";
const PW = "harness-Pass-1";   // a password only this harness uses, set the way you would set a real one
const digestOf = s => crypto.createHash("sha256").update(s, "utf8").digest("hex");

(function run() {
  const W = makeWorld(), call = W.call;

  // setup: a Messages tab with the right header, the admin password stored only as a salted hash
  const setupMsg = W.ctx.setup();
  const msgs = W.sheets.Messages;
  check("setup makes the Messages tab", !!msgs, setupMsg);
  check("Messages header is id, direction, body, created, readAt",
    msgs && JSON.stringify(msgs.getRange(1, 1, 1, 5).getValues()[0]) === JSON.stringify(["id", "direction", "body", "created", "readAt"]),
    msgs && msgs.getRange(1, 1, 1, 5).getValues()[0]);
  check("an ADMIN_HASH is stored", /^[0-9a-f]{64}$/.test(W.props.ADMIN_HASH || ""), W.props.ADMIN_HASH);
  check("the admin hash is salted (not the bare digest)", W.props.ADMIN_HASH !== W.ctx.DEFAULT_ADMIN_DIGEST);
  check("the stored hash is the salted default", W.props.ADMIN_HASH === W.ctx.adminDigest_(W.ctx.DEFAULT_ADMIN_DIGEST));
  const apiSrc = fs.readFileSync(path.join(__dirname, "..", "js", "api.js"), "utf8");
  check("js/api.js's local stand-in uses the same default digest", apiSrc.indexOf('"' + W.ctx.DEFAULT_ADMIN_DIGEST + '"') >= 0);
  if (DEFAULT) {
    check("ADMIN_DEFAULT really is the default", digestOf(DEFAULT) === W.ctx.DEFAULT_ADMIN_DIGEST);
    check("no script property holds the plain default", !Object.values(W.props).some(v => String(v).indexOf(DEFAULT) >= 0));
    for (const f of ["backend/Code.gs", "js/api.js", "tools/check-backend.js"]) {
      check(f + " does not contain the plain default", fs.readFileSync(path.join(__dirname, "..", f), "utf8").indexOf(DEFAULT) < 0);
    }
    const d = call({ action: "adminLogin", username: "admin", password: DEFAULT });
    check("the default admin password signs in", d.ok, d);
  } else skip("signing in with the real default (set ADMIN_DEFAULT to include it)");
  const hashBefore = W.props.ADMIN_HASH;
  W.ctx.setup();
  check("running setup() again keeps the same admin hash", W.props.ADMIN_HASH === hashBefore);
  // from here on, the harness's own password - set exactly as the setup doc tells you to change it
  W.props.ADMIN_PASSWORD = PW;
  W.ctx.setup();
  check("setup() takes up ADMIN_PASSWORD and deletes it", !("ADMIN_PASSWORD" in W.props) && W.props.ADMIN_HASH !== hashBefore);
  check("no script property holds the plain new password", !Object.values(W.props).some(v => String(v).indexOf(PW) >= 0));

  // her account, as the site makes it
  const su = call({ action: "signup", username: "Aki", secret: "lighthouse", mood: "happy" });
  check("signup still works", su.ok && su.token, su);
  const her = su.token;

  // admin sign-in
  check("adminLogin: wrong password is 'wrong'", call({ action: "adminLogin", username: "admin", password: "nope" }).error === "wrong");
  check("adminLogin: wrong username is the same 'wrong'", call({ action: "adminLogin", username: "root", password: PW }).error === "wrong");
  check("adminLogin: her secret word is not the admin password", call({ action: "adminLogin", username: "Aki", password: "lighthouse" }).error === "wrong");
  const al = call({ action: "adminLogin", username: " Admin ", password: PW });
  check("adminLogin: right credentials give a token (username forgiving)", al.ok && al.token, al);
  check("adminLogin: password is case-sensitive", call({ action: "adminLogin", username: "admin", password: PW.toUpperCase() }).error === "wrong");
  const adm = call({ action: "adminLogin", username: "admin", password: PW }).token;
  check("adminLogin answer carries no profile", !("profile" in al));

  // the two kinds of session are not interchangeable
  check("her token is not an admin token for getProfile's sake either way", call({ action: "getProfile", token: adm }).error === "auth");
  check("her token still reads her profile", call({ action: "getProfile", token: her }).ok);

  // sending
  check("sendMessage without a token is 'auth'", call({ action: "sendMessage", body: "hi" }).error === "auth");
  check("sendMessage with junk token is 'auth'", call({ action: "sendMessage", token: "x", body: "hi" }).error === "auth");
  check("sendMessage with an empty body is 'invalid'", call({ action: "sendMessage", token: adm, body: "   " }).error === "invalid");
  check("sendMessage with a non-string body is 'invalid'", call({ action: "sendMessage", token: adm, body: 42 }).error === "invalid");
  const s1 = call({ action: "sendMessage", token: adm, body: "first, from me" });
  check("admin sends: direction is to-her", s1.ok && s1.message.direction === "to-her", s1);
  check("his own send emails nobody", W.mail.length === 0, W.mail.length);
  // her mail on the tab, as a row the Sheet actually holds
  const saved = text => msgs.getLastRow() > 1 &&
    msgs.getRange(2, 1, msgs.getLastRow() - 1, 5).getValues().some(r => r[1] === "to-me" && r[2] === text);
  let rowExistedAtSend = null;
  W.env.onSend = () => { rowExistedAtSend = saved("hello you"); };
  const s2 = call({ action: "sendMessage", token: her, body: "hello you" });
  W.env.onSend = null;
  check("she sends: direction is to-me", s2.ok && s2.message.direction === "to-me", s2);

  // the email to him: same path as the forgot-word email, her words in it, and never at her expense
  const note = W.mail[W.mail.length - 1];
  check("her send emails him", W.mail.length === 1 && note.to === "owner@example.invalid", W.mail);
  check("...with her words in the body", !!note && note.body.indexOf("hello you") >= 0, note && note.body);
  check("...and her name in the subject", !!note && note.subject.indexOf("Aki") >= 0, note && note.subject);
  check("...sent only once her mail was already saved", rowExistedAtSend === true, rowExistedAtSend);
  W.env.email = "";   // no OWNER_EMAIL and no effective user: ownerEmail_() throws
  const nA = call({ action: "sendMessage", token: her, body: "no address yet" });
  check("with no address set, her send still succeeds", nA.ok, nA);
  check("...and her mail is saved", saved("no address yet"));
  check("...and nothing was mailed", W.mail.length === 1, W.mail.length);
  W.env.email = "owner@example.invalid";
  W.env.sendFails = true;
  const nB = call({ action: "sendMessage", token: her, body: "mail service down" });
  check("when MailApp throws, her send still succeeds", nB.ok, nB);
  check("...and her mail is saved", saved("mail service down"));
  W.env.sendFails = false;
  W.env.quota = 5;
  const nC = call({ action: "sendMessage", token: her, body: "late at night" });
  check("with the day's last emails left, her send still succeeds and is saved", nC.ok && saved("late at night"), nC);
  check("...and those last emails are kept for the forgot-word email", W.mail.length === 1, W.mail.length);
  W.env.quota = 100;
  check("the failed-email sends say nothing about it to her page", [nA, nB, nC].every(r => Object.keys(r).join() === "ok,message"));
  const s3 = call({ action: "sendMessage", token: adm, body: "12/25", direction: "to-me" });
  check("a direction in the request is ignored", s3.ok && s3.message.direction === "to-her", s3);
  const long = call({ action: "sendMessage", token: adm, body: "x".repeat(5000) });
  check("an over-long body is capped at 4000", long.ok && long.message.body.length === 4000, long.message && long.message.body.length);
  const lastRow = msgs.getLastRow();
  check("the body cell is written as plain text ('@')", msgs.formats[lastRow + ":3"] === "@", msgs.formats[lastRow + ":3"]);
  check("id and direction cells are plain text too", msgs.formats[lastRow + ":1"] === "@" && msgs.formats[lastRow + ":2"] === "@");

  // her letter reply, the old way, still works and becomes his first mail from her
  const rep = call({ action: "saveReply", token: her, text: "yes, always" });
  check("saveReply still works", rep.ok && rep.progress.inbox === true, rep);

  // reading
  const hers = call({ action: "getMessages", token: her });
  check("she reads only to-her mail", hers.ok && hers.messages.length === 3 && hers.messages.every(m => m.direction === "to-her"), hers.messages && hers.messages.map(m => m.direction));
  check("her list is newest first", hers.ok && hers.messages.every((m, i, a) => i === 0 || a[i - 1].created >= m.created));
  check("her list never includes the letter reply", hers.ok && !hers.messages.some(m => m.id === "reply"));
  check("her list carries no row numbers", hers.ok && !hers.messages.some(m => "row" in m));
  const his = call({ action: "getMessages", token: adm });
  check("he reads both directions", his.ok && his.messages.some(m => m.direction === "to-me") && his.messages.some(m => m.direction === "to-her"));
  const rm = his.ok && his.messages.find(m => m.id === "reply");
  check("he sees her letter reply as a to-me mail", rm && rm.direction === "to-me" && rm.body === "yes, always" && rm.letterReply === true, rm);
  check("the letter reply was not copied into the Messages tab",
    !msgs.getRange(2, 1, msgs.getLastRow() - 1, 5).getValues().some(r => r[2] === "yes, always"));
  check("getMessages without a token is 'auth'", call({ action: "getMessages" }).error === "auth");

  // marking read
  const toHerId = s1.message.id, toMeId = s2.message.id;
  check("she cannot mark his inbox (to-me) read", call({ action: "markRead", token: her, ids: [toMeId] }).marked === 0);
  check("she marks a to-her mail read", call({ action: "markRead", token: her, ids: [toHerId] }).marked === 1);
  const firstRead = call({ action: "getMessages", token: her }).messages.find(m => m.id === toHerId).readAt;
  check("readAt is set", typeof firstRead === "number" && firstRead > 0, firstRead);
  check("marking it again changes nothing", call({ action: "markRead", token: her, ids: [toHerId] }).marked === 0);
  check("the first readAt is kept", call({ action: "getMessages", token: her }).messages.find(m => m.id === toHerId).readAt === firstRead);
  check("he cannot mark her inbox (to-her) read", call({ action: "markRead", token: adm, ids: [s3.message.id] }).marked === 0);
  check("he marks a to-me mail read", call({ action: "markRead", token: adm, ids: [toMeId] }).marked === 1);
  check("he marks the letter reply read", call({ action: "markRead", token: adm, ids: ["reply"] }).marked === 1);
  check("the letter reply now shows read", !!call({ action: "getMessages", token: adm }).messages.find(m => m.id === "reply").readAt);
  check("she cannot mark the letter reply", call({ action: "markRead", token: her, ids: ["reply"] }).marked === 0);
  check("markRead with no ids is a harmless 0", call({ action: "markRead", token: her }).marked === 0);
  check("markRead with prototype-ish ids is a harmless 0", call({ action: "markRead", token: her, ids: ["constructor", "__proto__", null] }).marked === 0);
  check("markRead without a token is 'auth'", call({ action: "markRead", ids: [toHerId] }).error === "auth");

  // the existing actions are unharmed
  check("login still works", call({ action: "login", username: "aki", secret: "Lighthouse " }).ok);
  check("getProfile still returns the reply", call({ action: "getProfile", token: her }).profile.reply.text === "yes, always");
  check("status still works", call({ action: "status" }).exists === true);
  check("an unknown action is still 'invalid'", call({ action: "dropTables" }).error === "invalid");

  // separate lockouts: a stranger at the admin door cannot lock her out, and the reverse
  for (let i = 0; i < 5; i++) call({ action: "adminLogin", username: "admin", password: "guess" + i });
  check("five wrong admin passwords lock the admin door", call({ action: "adminLogin", username: "admin", password: PW }).error === "locked");
  check("...and she can still sign in", call({ action: "login", username: "Aki", secret: "lighthouse" }).ok);
  W.cache.admin_locked && delete W.cache.admin_locked;
  for (let i = 0; i < 5; i++) call({ action: "login", username: "Aki", secret: "guess" + i });
  check("five wrong secret words lock her door", call({ action: "login", username: "Aki", secret: "lighthouse" }).error === "locked");
  check("...and he can still sign in", call({ action: "adminLogin", username: "admin", password: PW }).ok);
  delete W.cache.login_locked;

  // changing the admin password from a script property
  W.props.ADMIN_PASSWORD = "Tulips-2026";
  check("after ADMIN_PASSWORD is set, the old password fails", call({ action: "adminLogin", username: "admin", password: PW }).error === "wrong");
  check("ADMIN_PASSWORD is consumed and deleted", !("ADMIN_PASSWORD" in W.props));
  check("the old admin token is signed out", call({ action: "getMessages", token: adm }).error === "auth");
  delete W.cache.admin_fails;
  const nl = call({ action: "adminLogin", username: "admin", password: "Tulips-2026" });
  check("the new password works", nl.ok, nl);
  const adm2 = nl.token;
  W.props.ADMIN_USER = "Neo";
  check("ADMIN_USER renames the admin", call({ action: "adminLogin", username: "neo", password: "Tulips-2026" }).ok);

  // resetAccount: her mail goes, his stays and is unread again, her sessions die, his do not
  W.ctx.resetAccount();
  check("after resetAccount her token is dead", call({ action: "getMessages", token: her }).error === "auth");
  const after = call({ action: "getMessages", token: adm2 });
  check("after resetAccount his admin session survives", after.ok, after);
  check("after resetAccount her to-me mail is gone", after.ok && !after.messages.some(m => m.direction === "to-me"));
  check("after resetAccount his to-her mail is kept", after.ok && after.messages.filter(m => m.direction === "to-her").length === 3);
  check("after resetAccount his mail is unread again", after.ok && after.messages.every(m => !m.readAt));
  check("after resetAccount the reply read mark is gone", !("REPLY_READ" in W.props));

  // a fresh sign-up: his kept mail is waiting; a new reply is unread even though the old one was marked
  const su2 = call({ action: "signup", username: "Aki", secret: "harbour" });
  check("she can sign up again", su2.ok);
  check("his kept mail is waiting for her", call({ action: "getMessages", token: su2.token }).messages.length === 3);
  call({ action: "saveReply", token: su2.token, text: "again, yes" });
  check("a new letter reply is unread", !call({ action: "getMessages", token: adm2 }).messages.find(m => m.id === "reply").readAt);

  // clearMessages: the whole tab, nothing else
  W.ctx.clearMessages();
  const cleared = call({ action: "getMessages", token: adm2 });
  check("clearMessages empties the tab", cleared.ok && cleared.messages.length === 1 && cleared.messages[0].id === "reply", cleared.messages);
  check("clearMessages leaves her account alone", call({ action: "getProfile", token: su2.token }).ok);

  // an older deployment where setup() ran before the Messages tab existed and was never re-run:
  // Account is there, Messages and the admin hash are not. The tab must appear on the first send.
  const W2 = makeWorld();
  W2.props.SECRET_SALT = "s";
  W2.ctx.ensureSheet_(W2.ctx.SpreadsheetApp.getActiveSpreadsheet(), "Account", W2.ctx.ACCOUNT_HEADERS);
  const su3 = W2.call({ action: "signup", username: "Aki", secret: "x" });
  check("without setup() re-run, reading mail is an empty list, not an error", W2.call({ action: "getMessages", token: su3.token }).messages.length === 0);
  W2.call({ action: "adminLogin", username: "admin", password: "not it" });
  check("without setup() re-run, the first admin sign-in seeds the default",
    W2.props.ADMIN_HASH === W2.ctx.adminDigest_(W2.ctx.DEFAULT_ADMIN_DIGEST), W2.props.ADMIN_HASH);
  if (DEFAULT) check("...and the default signs in", W2.call({ action: "adminLogin", username: "admin", password: DEFAULT }).ok);
  W2.props.ADMIN_PASSWORD = PW;
  const a3 = W2.call({ action: "adminLogin", username: "admin", password: PW });
  check("without setup() re-run, ADMIN_PASSWORD is taken up at sign-in", a3.ok && !("ADMIN_PASSWORD" in W2.props), a3);
  check("without setup() re-run, the first send creates the tab", W2.call({ action: "sendMessage", token: a3.token, body: "hi" }).ok && !!W2.sheets.Messages);
})();

// ---- js/api.js's REMOTE driver, wired to the backend above ---------------------------------------
// The browser harness covers the local driver. This covers the other one: the real api.js, with a URL
// set, its fetch answered by doPost in this process. A field named differently on the two sides
// (body/text, ids, password) would pass every check above and fail only once deployed - this is where
// that shows. The URL is a reserved .invalid name and fetch never leaves Node.
async function remote() {
  const W = makeWorld();
  W.ctx.setup();
  W.props.ADMIN_PASSWORD = PW;
  const seen = [];
  const mem = {};
  const Store = {
    get: (k, f) => (k in mem ? mem[k] : f), set: (k, v) => { mem[k] = String(v); return true; },
    remove: k => { delete mem[k]; return true; },
    getJSON: (k, f) => { try { return k in mem ? JSON.parse(mem[k]) : f; } catch (e) { return f; } },
    setJSON: (k, v) => { mem[k] = JSON.stringify(v); return true; }
  };
  const KEYS = { account: "a", session: "s", progress: "p", reply: "r", signup: "su", remember: "rm", mail: "m", adminSession: "ad",
    letterSeen: "ls", pending: "pe", unread: "un", inboxSeen: "is", theme: "th" };
  const FLOWS = ["proposal", "letter", "memories", "inbox", "profile", "accepted"];
  const Progress = {
    read: () => { const p = Store.getJSON(KEYS.progress, {}) || {}, o = {}; FLOWS.forEach(k => { o[k] = p[k] === true; }); return o; },
    apply: o => Store.setJSON(KEYS.progress, o), unlock: k => { const p = Progress.read(); p[k] = true; Store.setJSON(KEYS.progress, p); }
  };
  const Session = { get: () => Store.getJSON(KEYS.session, null), start: t => Store.setJSON(KEYS.session, { v: 1, token: t }), clear: () => Store.remove(KEYS.session) };
  const win = { Surprise: { Store, KEYS, Progress, Session, APPS_SCRIPT_URL: "https://backend.invalid/exec" } };
  const sandbox = vm.createContext({
    window: win, location: { pathname: "/profile.html", replace() {} }, setTimeout, clearTimeout, AbortController, Promise,
    fetch: (url, opts) => {
      if (url !== "https://backend.invalid/exec") return Promise.reject(new Error("unexpected url " + url));
      const body = JSON.parse(opts.body); seen.push(body);
      const res = W.call(body);
      return Promise.resolve({ text: () => Promise.resolve(JSON.stringify(res)) });
    }
  });
  vm.runInContext(fs.readFileSync(path.join(__dirname, "..", "js", "api.js"), "utf8"), sandbox, { filename: "api.js" });
  const A = win.Surprise.Api;
  check("remote: api.js picked the remote driver", A && A.driver === "remote", A && A.driver);

  // every call through here records exactly what went over the wire for it
  const via = async fn => { const n = seen.length, r = await fn(); return { r, sent: seen.slice(n) }; };
  // this device has been through the story with an account since reset: what it kept of that one must not carry over
  Store.setJSON(KEYS.progress, { proposal: true, letter: true, memories: true, inbox: true, profile: true, accepted: true });
  Store.setJSON(KEYS.reply, { text: "", timestamp: 1 }); Store.set(KEYS.letterSeen, "1"); Store.set(KEYS.unread, "3");
  Store.set(KEYS.theme, "dark");
  const su = await A.signup({ username: "Aki", secret: "lighthouse" });
  check("remote: signup through the driver", su.ok, su);
  const fresh = Progress.read();
  check("remote: a new sign-up starts the story over on this device - only the proposal open, nothing of the old account kept",
    fresh.proposal && !fresh.accepted && !fresh.memories && !fresh.inbox && !Store.get(KEYS.reply, null) && !Store.get(KEYS.letterSeen, null)
      && !Store.get(KEYS.unread, null) && Store.get(KEYS.theme, null) === "dark", { fresh, kept: Object.keys(mem) });
  const li = await A.admin.login("admin", PW);
  check("remote: admin.login sends the fields adminLogin reads", li.ok && A.admin.signedIn(), li);
  const herTok = Session.get().token, hisTok = Store.getJSON(KEYS.adminSession, {}).token;
  check("remote: the two sessions are different tokens", herTok && hisTok && herTok !== hisTok);
  const onlyHis = x => x.sent.length > 0 && x.sent.every(b => b.token === hisTok);
  const onlyHers = x => x.sent.length > 0 && x.sent.every(b => b.token === herTok);

  const s1 = await via(() => A.admin.sendMessage("from me, remotely"));
  check("remote: admin.sendMessage arrives as to-her", s1.r.ok && s1.r.message.direction === "to-her", s1.r);
  check("remote: admin.sendMessage sends his token and only his", onlyHis(s1), s1.sent);
  const s2 = await via(() => A.sendMessage("from her, remotely"));
  check("remote: sendMessage arrives as to-me", s2.r.ok && s2.r.message.direction === "to-me", s2.r);
  check("remote: sendMessage sends her token and only hers", onlyHers(s2), s2.sent);
  const bad = await via(() => A.sendMessage("   "));
  check("remote: a refused send is asked once, not retried", bad.r.error === "invalid" && bad.sent.length === 1, bad.sent.length);
  const g = await via(() => A.getMessages());
  check("remote: getMessages returns her mail", g.r.ok && g.r.messages.length === 1 && g.r.messages[0].body === "from me, remotely", g.r);
  check("remote: getMessages sends her token", onlyHers(g), g.sent);
  const m = await via(() => A.markRead([s1.r.message.id]));
  check("remote: markRead sends the ids markRead_ reads", m.r.ok && m.r.marked === 1, m.r);
  check("remote: markRead sends her token", onlyHers(m), m.sent);
  const h = await via(() => A.admin.getMessages());
  check("remote: admin.getMessages shows her mail and the read mark",
    h.r.ok && h.r.messages.some(x => x.body === "from her, remotely") && h.r.messages.find(x => x.id === s1.r.message.id).readAt > 0, h.r);
  check("remote: admin.getMessages sends his token", onlyHis(h), h.sent);
  const hm = await via(() => A.admin.markRead([s2.r.message.id]));
  check("remote: admin.markRead marks hers-to-him with his token", hm.r.marked === 1 && onlyHis(hm), hm);
  await A.admin.logout();
  check("remote: after logout admin calls are auth", (await A.admin.getMessages()).error === "auth");
}

remote().catch(e => check("remote driver run", false, String(e && e.stack || e))).then(() => {
  const failed = results.filter(r => !r.pass);
  results.forEach(r => console.log((r.skipped ? "  skip  " : r.pass ? "  ok    " : "  FAIL  ") + r.name + (r.pass ? "" : "   -> " + JSON.stringify(r.detail))));
  console.log("\n  " + (results.length - failed.length) + "/" + results.length + " passed");
  process.exit(failed.length ? 1 : 0);
});
