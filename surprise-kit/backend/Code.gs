/**
 * Apps Script backend for the surprise site (Phase B).
 *
 * One account, one Google Sheet. The site talks to this through js/api.js's remote driver.
 * Setup walkthrough: docs/backend-setup.md. Run setup() once before deploying.
 *
 * WHAT THIS PROTECTS, HONESTLY
 * - The secret word is stored only as a salted SHA-256 hash; the salt lives in Script Properties,
 *   never in this file and never in the repo. A leaked Sheet alone does not reveal the word.
 * - SHA-256 is FAST, so a short secret word would not survive determined offline guessing if the
 *   Sheet AND the salt both leaked. This is "a username and a secret word", not strong auth.
 * - The Web app URL is necessarily visible in the site's source. Anyone who finds it can call
 *   getMemories (the clip list) and attempt logins (rate-limited). They cannot read her profile or
 *   her reply without a valid session token.
 * - The mailbox has two kinds of session that can never stand in for each other: hers (she reads
 *   mail sent to her, writes mail to him) and his admin one (the reverse). They live in separate
 *   lists, so a token from one is simply unknown to the other.
 * - The admin password is weak by choice (the private link is the real protection) and is kept the
 *   same way as her word: only a salted hash, in Script Properties. See adminHash_ for changing it.
 * - Everything is as private as the Google account that owns this Sheet.
 */

var SHEET_ACCOUNT = 'Account';
var SHEET_MEMORIES = 'Memories';
var SHEET_MESSAGES = 'Messages';

var PROP_SALT = 'SECRET_SALT';      // created by setup() if missing; never leaves the server
var PROP_TOKENS = 'SESSION_TOKENS'; // JSON array of { h: <token hash>, exp: <ms> }

var MAX_USERNAME = 60;
var MAX_SECRET = 100;
var MAX_REPLY = 2000;               // matches REPLY_MAX in js/api.js
var MAX_FIELD = 60;                 // mood / icon / music ids
var TOKEN_TTL_MS = 1000 * 60 * 60 * 24 * 30; // 30 days; she should not be asked to log in often
var MAX_TOKENS = 10;                // keep a handful of devices, prune the rest

var LOCKOUT_TRIES = 5;              // wrong attempts in a row...
var LOCKOUT_SECONDS = 300;          // ...then locked for ~5 minutes (approved decision)
var CACHE_FAILS = 'login_fails';
var CACHE_LOCKED = 'login_locked';

// "I forgot our secret word". The word itself can never be sent: only its salted hash is kept, and
// that is the point of hashing it. So instead a one-time word is minted, emailed to the owner of this
// script, and accepted ALONGSIDE her real one for a short while. Her own word keeps working - if she
// remembers it an hour later, nothing has been taken away from her.
var PROP_TEMP = 'TEMP_SECRET';      // { h: <hash>, exp: <ms> }, at most one at a time
var TEMP_TTL_MS = 1000 * 60 * 60;   // the emailed word is good for an hour
var CACHE_FORGOT = 'forgot_sent';
var FORGOT_QUIET_SECONDS = 600;     // at most one email every ten minutes, so the button cannot be used to spam

var ACCOUNT_HEADERS = ['username', 'secretHash', 'mood', 'icon', 'music', 'accepted',
                       'unlocked', 'reply', 'replyTime', 'created', 'displayName'];
var MEMORIES_HEADERS = ['title', 'note', 'date', 'youtubeId', 'collection', 'order'];
var FLOW = ['proposal', 'letter', 'memories', 'inbox'];

// The mailbox. One row per mail; direction says who it is for. Her letter reply is NOT copied in here:
// it stays on the Account row where saveReply has always put it, and getMessages shows it to him as the
// first mail she wrote, so the letter flow is untouched and there is only ever one copy of it.
var MESSAGES_HEADERS = ['id', 'direction', 'body', 'created', 'readAt'];
var TO_HER = 'to-her', TO_ME = 'to-me';
var MAX_MESSAGE = 4000;             // matches MESSAGE_MAX in js/api.js: a long letter, not a novel
var MAX_MARK = 50;                  // ids in one markRead call
var REPLY_ID = 'reply';             // the id getMessages gives her letter reply
var PROP_REPLY_READ = 'REPLY_READ'; // { ts: <the reply's timestamp>, at: <ms> } once he has read it
var MAIL_RESERVE = 5;               // emails a day kept back for "I forgot our secret word"; see tellHim_

// His admin page. Its sessions are a separate list from hers, and its wrong guesses a separate
// lockout, so a stranger hammering the admin sign-in can never lock her out of her own.
var PROP_ADMIN_TOKENS = 'ADMIN_TOKENS';     // same shape as SESSION_TOKENS
var PROP_ADMIN_HASH = 'ADMIN_HASH';         // the only form the admin password is ever kept in
var PROP_ADMIN_USER = 'ADMIN_USER';         // optional; the username is 'admin' while this is unset
var PROP_ADMIN_PASSWORD = 'ADMIN_PASSWORD'; // set this to CHANGE the password; see adminHash_
var CACHE_ADMIN_FAILS = 'admin_fails';
var CACHE_ADMIN_LOCKED = 'admin_locked';
// The default password, as an unsalted SHA-256 so the word itself is not written in the repo.
// Honestly: the digest of a dictionary word is one lookup away, so this keeps it from a glance, not
// from anyone trying. What is STORED is a salted hash of this digest; replacing the default for real
// is one script property (ADMIN_PASSWORD), after which this constant is never consulted again.
var DEFAULT_ADMIN_DIGEST = '240be518fabd2724ddb6f04eeb1da5967448d7e831c08c8fa822809f74c720a9';

/** Run this ONCE from the Apps Script editor before deploying. Safe to run again. */
function setup() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!ss) throw new Error('No Sheet attached. Open this script from the Sheet: Extensions > Apps Script.');
  ensureSheet_(ss, SHEET_ACCOUNT, ACCOUNT_HEADERS);
  ensureSheet_(ss, SHEET_MEMORIES, MEMORIES_HEADERS);
  ensureMessages_(ss);
  var props = PropertiesService.getScriptProperties();
  if (!props.getProperty(PROP_SALT)) props.setProperty(PROP_SALT, randomHex_(32));
  adminHash_();   // seeds the default admin password, or takes up a new one set as ADMIN_PASSWORD
  return 'Setup complete. Tabs "' + SHEET_ACCOUNT + '", "' + SHEET_MEMORIES + '" and "' + SHEET_MESSAGES +
    '" are ready, a salt was generated and the admin password is stored hashed.';
}

/** Wipes the account so you can test sign-up again. Memories and the salt are left alone. */
function resetAccount() {
  wipeAccount_();
  return 'Account cleared. The site will offer sign-up again.';
}

/**
 * Run from the editor to empty the Messages tab completely - his mail as well as hers. resetAccount
 * deliberately keeps his; this is for clearing out test mail before the reveal.
 */
function clearMessages() {
  var sh = sheet_(SHEET_MESSAGES);
  if (sh && sh.getLastRow() > 1) sh.getRange(2, 1, sh.getLastRow() - 1, MESSAGES_HEADERS.length).clearContent();
  PropertiesService.getScriptProperties().deleteProperty(PROP_REPLY_READ);
  return 'Messages cleared. The account and her letter reply are untouched.';
}

/**
 * The account row, every live session and the lockout counters. The Memories tab and the salt
 * stay, so the clips and the hashing survive a reset.
 *
 * Her mail goes with her account; his does not. What she wrote to him is part of "everything saved
 * with it", so it is erased. What he wrote to her is his and survives, marked unread again, so a
 * fresh start finds it waiting rather than already opened. His admin sessions are left alone.
 */
function wipeAccount_() {
  var sh = sheet_(SHEET_ACCOUNT);
  if (sh && sh.getLastRow() > 1) sh.getRange(2, 1, sh.getLastRow() - 1, sh.getLastColumn()).clearContent();
  var props = PropertiesService.getScriptProperties();
  props.deleteProperty(PROP_TOKENS);
  props.deleteProperty(PROP_REPLY_READ);
  CacheService.getScriptCache().removeAll([CACHE_FAILS, CACHE_LOCKED]);
  var mail = sheet_(SHEET_MESSAGES);
  if (!mail || mail.getLastRow() < 2) return;
  var range = mail.getRange(2, 1, mail.getLastRow() - 1, MESSAGES_HEADERS.length);
  var rows = range.getValues(), keep = [];
  for (var i = 0; i < rows.length; i++) {
    if (String(rows[i][1]) === TO_HER) keep.push([rows[i][0], rows[i][1], rows[i][2], rows[i][3], '']);
  }
  range.clearContent();
  if (keep.length) writeRows_(mail, 2, keep);
}

function ensureSheet_(ss, name, headers) {
  var sh = ss.getSheetByName(name);
  if (!sh) sh = ss.insertSheet(name);
  var row = sh.getRange(1, 1, 1, headers.length);
  var have = row.getValues()[0], same = true;
  for (var i = 0; i < headers.length; i++) if (String(have[i] || '') !== headers[i]) { same = false; break; }
  if (!same) row.setValues([headers]).setFontWeight('bold'); // row 1 only; her data in row 2 is never touched
  sh.setFrozenRows(1);
  return sh;
}

function sheet_(name) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  return ss ? ss.getSheetByName(name) : null;
}

/**
 * The Messages tab, made on first use too: a mail he sends must not fail just because setup() was not
 * run again after this tab was added to the script.
 */
function ensureMessages_(ss) {
  return ensureSheet_(ss || SpreadsheetApp.getActiveSpreadsheet(), SHEET_MESSAGES, MESSAGES_HEADERS);
}

/**
 * Writes mail rows with the text columns set to plain text first. Left to itself the Sheet reads a
 * body like "12/25" as a date, "007" as 7 and one that starts with "=" as a formula, and then hands
 * back something other than what was written.
 */
function writeRows_(sh, row, rows) {
  var range = sh.getRange(row, 1, rows.length, MESSAGES_HEADERS.length), formats = [];
  for (var i = 0; i < rows.length; i++) formats.push(['@', '@', '@', '0', '0']);
  range.setNumberFormats(formats);
  range.setValues(rows);
}

/* ------------------------------------------------------------------ router */

/**
 * The site POSTs a text/plain body (a JSON string) so the browser sends no CORS preflight,
 * which an Apps Script web app cannot answer.
 */
function doPost(e) {
  var res;
  try {
    var body = {};
    if (e && e.postData && e.postData.contents) {
      try { body = JSON.parse(e.postData.contents) || {}; } catch (err) { body = {}; }
    }
    res = route_(String(body.action || ''), body);
  } catch (err) {
    res = { ok: false, error: 'server' }; // never leak a stack trace to the caller
  }
  return ContentService.createTextOutput(JSON.stringify(res)).setMimeType(ContentService.MimeType.JSON);
}

/** A GET returns nothing useful on purpose; everything meaningful goes through doPost. */
function doGet() {
  return ContentService.createTextOutput(JSON.stringify({ ok: false, error: 'invalid' }))
    .setMimeType(ContentService.MimeType.JSON);
}

function route_(action, body) {
  switch (action) {
    case 'status':       return { ok: true, exists: !!readAccount_() };
    case 'getMemories':  return getMemories_();            // public, no token
    case 'signup':       return signup_(body);
    case 'login':        return login_(body);
    case 'saveProgress': return saveProgress_(body);
    case 'saveReply':    return saveReply_(body);
    case 'getProfile':   return getProfile_(body);
    case 'deleteAccount': return deleteAccount_(body);
    case 'forgotSecret':  return forgotSecret_();
    case 'changeSecret':  return changeSecret_(body);
    case 'updateProfile': return updateProfile_(body);
    case 'adminLogin':   return adminLogin_(body);
    case 'sendMessage':  return sendMessage_(body);
    case 'getMessages':  return getMessages_(body);
    case 'markRead':     return markRead_(body);
    default:             return { ok: false, error: 'invalid' }; // unknown actions are ignored
  }
}

/* ------------------------------------------------------------------ helpers */

function str_(v, max) { return String(v == null ? '' : v).slice(0, max); }
function norm_(v) { return str_(v, 200).trim().toLowerCase(); } // forgiving: "Our Word " == "our word"

function randomHex_(bytes) {
  var out = '';
  for (var i = 0; i < bytes; i++) out += ('0' + Math.floor(Math.random() * 256).toString(16)).slice(-2);
  return out + Utilities.getUuid().replace(/-/g, '');
}

function sha256_(text) {
  var raw = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, text, Utilities.Charset.UTF_8);
  var hex = '';
  for (var i = 0; i < raw.length; i++) hex += ('0' + (raw[i] & 0xff).toString(16)).slice(-2);
  return hex;
}

function salt_() {
  var s = PropertiesService.getScriptProperties().getProperty(PROP_SALT);
  if (!s) throw new Error('No salt set. Run setup() once.');
  return s;
}

function hashSecret_(secret) { return sha256_(salt_() + ':' + norm_(secret)); }

/** Compare without leaking where two strings first differ. */
function sameHash_(a, b) {
  a = String(a || ''); b = String(b || '');
  if (a.length !== b.length) return false;
  var diff = 0;
  for (var i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function cleanProgress_(p) {
  var o = {}, i;
  for (i = 0; i < FLOW.length; i++) o[FLOW[i]] = !!(p && p[FLOW[i]] === true);
  o.accepted = !!(p && p.accepted === true);
  return o;
}

/* ------------------------------------------------------------------ account row */

function readAccount_() {
  var sh = sheet_(SHEET_ACCOUNT);
  if (!sh || sh.getLastRow() < 2) return null;
  var v = sh.getRange(2, 1, 1, ACCOUNT_HEADERS.length).getValues()[0];
  if (!String(v[0] || '').trim()) return null;
  var unlocked = {};
  try { unlocked = JSON.parse(v[6] || '{}') || {}; } catch (err) { unlocked = {}; }
  unlocked.accepted = v[5] === true || String(v[5]).toLowerCase() === 'true';
  return {
    username: String(v[0]), secretHash: String(v[1]), mood: v[2] === '' ? null : v[2],
    icon: v[3] === '' ? null : v[3], music: v[4] === '' ? null : v[4],
    progress: cleanProgress_(unlocked),
    reply: String(v[7] || '') ? { text: String(v[7]), timestamp: Number(v[8]) || 0 } : null,
    created: Number(v[9]) || 0, displayName: String(v[10] || '')
  };
}

function writeAccount_(a) {
  var sh = sheet_(SHEET_ACCOUNT);
  if (!sh) throw new Error('No "' + SHEET_ACCOUNT + '" tab. Run setup().');
  sh.getRange(2, 1, 1, ACCOUNT_HEADERS.length).setValues([[
    a.username, a.secretHash, a.mood == null ? '' : a.mood, a.icon == null ? '' : a.icon,
    a.music == null ? '' : a.music, a.progress.accepted === true,
    JSON.stringify(a.progress), a.reply ? a.reply.text : '',
    a.reply ? a.reply.timestamp : '', a.created || Date.now(),
    a.displayName == null ? '' : a.displayName
  ]]);
}

/** Exactly what the site is allowed to see. The hash is never included. */
function profileOf_(a) {
  return {
    username: a.username, mood: a.mood, iconId: a.icon, musicId: a.music,
    accepted: a.progress.accepted === true, progress: cleanProgress_(a.progress),
    reply: a.reply || null, created: a.created || 0,
    // what the profile shows. Falls back to her sign-up name, so there is always something to print.
    displayName: a.displayName || a.username
  };
}

/* ------------------------------------------------------------------ sessions */

// Her sessions by default; pass PROP_ADMIN_TOKENS for his. Same code, separate lists.
function readTokens_(prop) {
  var raw = PropertiesService.getScriptProperties().getProperty(prop || PROP_TOKENS);
  var list = [];
  try { list = JSON.parse(raw || '[]') || []; } catch (err) { list = []; }
  var now = Date.now(), live = [];
  for (var i = 0; i < list.length; i++) if (Number(list[i].exp) > now) live.push(list[i]);
  return live;
}

function newToken_(prop) {
  var token = randomHex_(24);                       // returned once, never stored in the clear
  var live = readTokens_(prop);
  live.push({ h: sha256_(token), exp: Date.now() + TOKEN_TTL_MS });
  if (live.length > MAX_TOKENS) live = live.slice(-MAX_TOKENS);
  PropertiesService.getScriptProperties().setProperty(prop || PROP_TOKENS, JSON.stringify(live));
  return token;
}

function validToken_(token, prop) {
  if (!token) return false;
  var want = sha256_(String(token)), live = readTokens_(prop);
  for (var i = 0; i < live.length; i++) if (sameHash_(live[i].h, want)) return true;
  return false;
}

/** 'admin', 'her', or null. The mailbox actions decide what a caller may do from this alone. */
function roleOf_(token) {
  if (validToken_(token, PROP_ADMIN_TOKENS)) return 'admin';
  if (validToken_(token)) return 'her';
  return null;
}

/* ------------------------------------------------------------------ lockout */

// Her sign-in by default; pass ADMIN_LOCK for his. Separate counters on purpose - see PROP_ADMIN_TOKENS.
var LOGIN_LOCK = { fails: CACHE_FAILS, locked: CACHE_LOCKED };
var ADMIN_LOCK = { fails: CACHE_ADMIN_FAILS, locked: CACHE_ADMIN_LOCKED };

function lockedOut_(k) { return !!CacheService.getScriptCache().get((k || LOGIN_LOCK).locked); }

function noteFail_(k) {
  k = k || LOGIN_LOCK;
  var cache = CacheService.getScriptCache();
  var n = Number(cache.get(k.fails) || 0) + 1;
  if (n >= LOCKOUT_TRIES) {
    cache.put(k.locked, '1', LOCKOUT_SECONDS);
    cache.remove(k.fails);
  } else {
    cache.put(k.fails, String(n), LOCKOUT_SECONDS);
  }
}

function clearFails_(k) { k = k || LOGIN_LOCK; CacheService.getScriptCache().removeAll([k.fails, k.locked]); }

/* ------------------------------------------------------------------ admin password */

function adminDigest_(digest) { return sha256_(salt_() + ':admin:' + digest); }

function adminUser_() {
  return norm_(PropertiesService.getScriptProperties().getProperty(PROP_ADMIN_USER) || 'admin');
}

/**
 * The stored admin hash. Seeds the default the first time, and takes up a new password whenever one
 * has been put in an ADMIN_PASSWORD script property: that property is hashed and DELETED straight
 * away, and every admin session is signed out, so the plain word sits in Script Properties only until
 * the next sign-in or setup() run. The password is case-sensitive; the username is not.
 */
function adminHash_() {
  var props = PropertiesService.getScriptProperties();
  var fresh = props.getProperty(PROP_ADMIN_PASSWORD);
  if (fresh) {
    props.setProperty(PROP_ADMIN_HASH, adminDigest_(sha256_(String(fresh))));
    props.deleteProperty(PROP_ADMIN_PASSWORD);
    props.deleteProperty(PROP_ADMIN_TOKENS);
  } else if (!props.getProperty(PROP_ADMIN_HASH)) {
    props.setProperty(PROP_ADMIN_HASH, adminDigest_(DEFAULT_ADMIN_DIGEST));
  }
  return props.getProperty(PROP_ADMIN_HASH);
}

/* ------------------------------------------------- forgotten word */

function readTemp_() {
  var raw = PropertiesService.getScriptProperties().getProperty(PROP_TEMP);
  var t = null;
  try { t = JSON.parse(raw || 'null'); } catch (err) { t = null; }
  if (!t || !t.h || Number(t.exp) <= Date.now()) return null;
  return t;
}

function clearTemp_() { PropertiesService.getScriptProperties().deleteProperty(PROP_TEMP); }

/** True if `secret` is the live emailed word. Safe when there isn't one. */
function usableTemp_(secret) {
  var t = readTemp_();
  return !!t && sameHash_(t.h, hashSecret_(secret));
}

/**
 * A word she can actually read down the phone and type: no 0/O or 1/l, no punctuation.
 * Three short groups, which is plenty - it only lives for an hour and only reaches one inbox.
 */
function tempWord_() {
  var ABC = 'abcdefghjkmnpqrstuvwxyz23456789', out = [];
  for (var g = 0; g < 3; g++) {
    var part = '';
    for (var i = 0; i < 4; i++) part += ABC.charAt(Math.floor(Math.random() * ABC.length));
    out.push(part);
  }
  return out.join('-');
}

/**
 * "I forgot our secret word": mint a one-hour word, email it to whoever owns this script, and let it
 * work alongside her real one. Always answers ok, even with no account or while quiet - the gate must
 * not become a way of asking whether an account exists, and she gets the same kind sentence either way.
 */
function forgotSecret_() {
  var acct = readAccount_();
  if (!acct) return { ok: true };                                  // nothing to recover; say nothing either way
  var cache = CacheService.getScriptCache();
  if (cache.get(CACHE_FORGOT)) return { ok: true };                // already sent recently: do not send again
  var word = tempWord_();
  PropertiesService.getScriptProperties().setProperty(PROP_TEMP,
    JSON.stringify({ h: hashSecret_(word), exp: Date.now() + TEMP_TTL_MS }));
  cache.put(CACHE_FORGOT, '1', FORGOT_QUIET_SECONDS);
  try {
    var to = ownerEmail_();
    // Executions in the editor will show this, so "it said it sent but nothing arrived" is answerable.
    console.log('forgotSecret: sending to ' + to + ' (quota left ' + MailApp.getRemainingDailyQuota() + ')');
    MailApp.sendEmail({
      to: to,
      subject: 'She forgot the secret word',
      body: [
        acct.username + ' asked for help getting in.',
        '',
        'Her own secret word has NOT been changed and still works - it is stored as a hash, so',
        'nobody can read it back, not even this script.',
        '',
        'Give her this word instead. It works for one hour, then stops by itself:',
        '',
        '    ' + word,
        '',
        'Once she is in, she can keep using it until it expires. To give her a new permanent word,',
        'open the Apps Script editor and run:  setSecret("whatever you two choose")',
        '',
        'If this was not her, you can ignore it: nothing has been changed and this word only',
        'reached your inbox.'
      ].join('\n')
    });
  } catch (err) {
    // the word is already live, so she can still be let in by hand; never leak the reason to the page
    console.log('forgotSecret: send FAILED - ' + err);
    return { ok: true, mailed: false };
  }
  return { ok: true, mailed: true };
}

/**
 * Run this from the editor to actually send yourself one test email, and say where it went. Use it
 * when a recovery email does not arrive: run here, the Execution log shows the address, the quota and
 * any error in full, none of which the web app is willing to tell a caller.
 */
function sendTestEmail() {
  var to;
  try { to = ownerEmail_(); }
  catch (err) { Logger.log('No address: ' + err + '\nSet an OWNER_EMAIL script property.'); return 'no address'; }
  Logger.log('Sending to: ' + to);
  Logger.log('Mail quota left today: ' + MailApp.getRemainingDailyQuota());
  MailApp.sendEmail({ to: to, subject: 'Test from the surprise site',
    body: 'If you are reading this, recovery email works and this is the inbox it reaches.' });
  Logger.log('Sent. If nothing arrives, check All Mail and Sent - a message you send to yourself can skip the Inbox.');
  return to;
}

/**
 * Run this from the editor to SEE where "I forgot our secret word" would send mail, without sending
 * any. Worth doing once before the reveal, so there is no doubt about whose inbox it reaches.
 */
function whoGetsTheEmail() {
  var who = ownerEmail_();
  var how = PropertiesService.getScriptProperties().getProperty("OWNER_EMAIL")
    ? "set by the OWNER_EMAIL script property"
    : "the account that owns this script";
  // Logger.log, not a bare return: the editor only shows what is logged, never a returned value.
  Logger.log("Recovery mail would go to: " + who + "  (" + how + ")");
  return who;
}

/**
 * The bits of her profile she can edit: the name shown on her card, and how she feels today.
 *
 * Deliberately NOT the sign-in name. She signs in with the username she chose at sign-up, and leaving
 * that alone means renaming herself on a whim can never lock her out, and never has to drag the
 * forgot-word and remember-me paths along with it.
 */
function updateProfile_(body) {
  if (!validToken_(body.token)) return { ok: false, error: 'auth' };
  var lock = LockService.getScriptLock();
  try { lock.waitLock(10000); } catch (err) { return { ok: false, error: 'server' }; }
  try {
    var acct = readAccount_();
    if (!acct) return { ok: false, error: 'auth' };
    if (body.displayName != null) {
      var nm = str_(body.displayName, MAX_USERNAME).trim();
      if (!nm) return { ok: false, error: 'invalid' };  // a blank card name helps nobody
      acct.displayName = nm;
    }
    if (body.mood != null) acct.mood = str_(body.mood, MAX_FIELD);
    writeAccount_(acct);
    return { ok: true, profile: profileOf_(acct) };
  } finally {
    lock.releaseLock();
  }
}

/**
 * She changes the word herself, from inside the site. This is what makes "I forgot it" actually end:
 * the emailed word gets her in, and then she sets one she will remember, instead of being locked out
 * again an hour later.
 *
 * A valid session is the authorisation - she is already signed in, having proved either her own word
 * or the emailed one - so it does NOT ask for the old word. Someone who has forgotten it could not
 * supply it, which would defeat the whole point.
 */
function changeSecret_(body) {
  if (!validToken_(body.token)) return { ok: false, error: 'auth' };
  var word = str_(body.secret, MAX_SECRET);
  if (!norm_(word)) return { ok: false, error: 'invalid' };
  var lock = LockService.getScriptLock();
  try { lock.waitLock(10000); } catch (err) { return { ok: false, error: 'server' }; }
  try {
    var acct = readAccount_();
    if (!acct) return { ok: false, error: 'auth' };
    acct.secretHash = hashSecret_(word);
    writeAccount_(acct);
    clearTemp_();    // the emailed word has served its purpose and must not outlive this
    clearFails_();
    return { ok: true };
  } finally {
    lock.releaseLock();
  }
}

/**
 * Where recovery mail goes. Deliberately not written down anywhere in the repo.
 *
 * OWNER_EMAIL is checked first and is the RELIABLE answer. Session.getEffectiveUser() is only a
 * convenience: inside a web app answering an anonymous caller it can come back empty, and an empty
 * "to" makes MailApp fail in ways that are easy to miss. So this throws rather than guessing, and
 * forgotSecret_ reports that as mailed:false instead of pretending it sent.
 */
function ownerEmail_() {
  var set = String(PropertiesService.getScriptProperties().getProperty('OWNER_EMAIL') || '').trim();
  if (set) return set;
  var who = '';
  try { who = String(Session.getEffectiveUser().getEmail() || '').trim(); } catch (err) { who = ''; }
  if (!who) throw new Error('No recovery address. Set an OWNER_EMAIL script property.');
  return who;
}

/**
 * Run from the editor to give her a new permanent word, keeping her account, her progress and her
 * reply exactly as they are. This is the answer to "she forgot it" that costs her nothing.
 */
function setSecret(newWord) {
  var word = String(newWord == null ? '' : newWord);
  if (!norm_(word)) return 'Give it a word: setSecret("our new word")';
  var acct = readAccount_();
  if (!acct) return 'There is no account yet.';
  acct.secretHash = hashSecret_(word);
  writeAccount_(acct);
  clearTemp_();
  clearFails_();
  PropertiesService.getScriptProperties().deleteProperty(PROP_TOKENS); // every device signs in again with the new word
  return 'Done. The secret word is now what you just set; everything else is untouched.';
}

/* ------------------------------------------------------------------ actions */

function signup_(body) {
  var username = str_(body.username, MAX_USERNAME).trim();
  var secret = str_(body.secret, MAX_SECRET);
  if (!username || !norm_(secret)) return { ok: false, error: 'invalid' };

  var lock = LockService.getScriptLock();
  try { lock.waitLock(10000); } catch (err) { return { ok: false, error: 'server' }; }
  try {
    if (readAccount_()) return { ok: false, error: 'exists' }; // one account only, checked under the lock
    var acct = {
      username: username, secretHash: hashSecret_(secret),
      mood: body.mood == null ? null : str_(body.mood, MAX_FIELD),
      icon: body.iconId == null ? null : str_(body.iconId, MAX_FIELD),
      music: body.musicId == null ? null : str_(body.musicId, MAX_FIELD),
      progress: cleanProgress_({ proposal: true }), reply: null, created: Date.now()
    };
    writeAccount_(acct);
    clearFails_();
    return { ok: true, token: newToken_(), profile: profileOf_(acct) };
  } finally { lock.releaseLock(); }
}

function login_(body) {
  if (lockedOut_()) return { ok: false, error: 'locked' };
  var acct = readAccount_();
  var username = str_(body.username, MAX_USERNAME);
  var secret = str_(body.secret, MAX_SECRET);
  // One answer for a wrong username, a wrong word, or no account at all: never say which.
  var right = !!acct && norm_(username) === norm_(acct.username) &&
    (sameHash_(acct.secretHash, hashSecret_(secret)) || usableTemp_(secret));
  if (!right) {
    noteFail_();
    return { ok: false, error: 'wrong' };
  }
  clearTemp_();   // whichever word got her in, the emailed one has done its job
  clearFails_();
  return { ok: true, token: newToken_(), profile: profileOf_(acct) };
}

/**
 * "Not me / start fresh": erases the one account so the whole thing can be lived again from the
 * sign-up card. Gated on the secret word, because the Web app URL ships inside the page source -
 * without that check anyone holding the link could wipe her account and her reply. Wrong answers
 * feed the same lockout as login, so the word cannot be guessed at speed.
 * Deleting an account that is already gone is a success: a retried call must not look like a failure.
 */
function deleteAccount_(body) {
  if (lockedOut_()) return { ok: false, error: 'locked' };
  var username = str_(body.username, MAX_USERNAME);
  var secret = str_(body.secret, MAX_SECRET);
  var lock = LockService.getScriptLock();
  try { lock.waitLock(10000); } catch (err) { return { ok: false, error: 'server' }; }
  try {
    var acct = readAccount_();
    if (!acct) return { ok: true, existed: false }; // nothing to erase, and status already says as much
    // One answer for a wrong username or a wrong word, exactly like login: never say which.
    if (norm_(username) !== norm_(acct.username) || !sameHash_(acct.secretHash, hashSecret_(secret))) {
      noteFail_();
      return { ok: false, error: 'wrong' };
    }
    wipeAccount_();
    return { ok: true, existed: true };
  } finally {
    lock.releaseLock();
  }
}

function saveProgress_(body) {
  if (!validToken_(body.token)) return { ok: false, error: 'auth' };
  var lock = LockService.getScriptLock();
  try { lock.waitLock(10000); } catch (err) { return { ok: false, error: 'server' }; }
  try {
    var acct = readAccount_();
    if (!acct) return { ok: false, error: 'auth' };
    // Flags only ever turn ON, and only when earned: letter needs accepted, memories/inbox need the reply.
    var want = cleanProgress_(body.progress), cur = acct.progress;
    if (want.proposal) cur.proposal = true;
    if (want.accepted) cur.accepted = true;
    if (want.letter && cur.accepted) cur.letter = true;
    if (acct.reply) { if (want.memories) cur.memories = true; if (want.inbox) cur.inbox = true; }
    writeAccount_(acct);
    return { ok: true, progress: cleanProgress_(cur) };
  } finally { lock.releaseLock(); }
}

function saveReply_(body) {
  if (!validToken_(body.token)) return { ok: false, error: 'auth' };
  if (typeof body.text !== 'string') return { ok: false, error: 'invalid' };
  var lock = LockService.getScriptLock();
  try { lock.waitLock(10000); } catch (err) { return { ok: false, error: 'server' }; }
  try {
    var acct = readAccount_();
    if (!acct) return { ok: false, error: 'auth' };
    acct.reply = { text: str_(body.text, MAX_REPLY), timestamp: Date.now() };
    acct.progress.memories = true;
    acct.progress.inbox = true;
    writeAccount_(acct);
    return { ok: true, progress: cleanProgress_(acct.progress), reply: acct.reply };
  } finally { lock.releaseLock(); }
}

function getProfile_(body) {
  if (!validToken_(body.token)) return { ok: false, error: 'auth' };
  var acct = readAccount_();
  if (!acct) return { ok: false, error: 'auth' };
  return { ok: true, profile: profileOf_(acct) };
}

/* ------------------------------------------------------------------ mailbox */

/** His admin page signs in here. One answer for a wrong username or a wrong password, like hers. */
function adminLogin_(body) {
  if (lockedOut_(ADMIN_LOCK)) return { ok: false, error: 'locked' };
  var username = str_(body.username, MAX_USERNAME);
  var password = str_(body.password, MAX_SECRET);
  var right = norm_(username) === adminUser_() && sameHash_(adminHash_(), adminDigest_(sha256_(password)));
  if (!right) {
    noteFail_(ADMIN_LOCK);
    return { ok: false, error: 'wrong' };
  }
  clearFails_(ADMIN_LOCK);
  return { ok: true, token: newToken_(PROP_ADMIN_TOKENS) };
}

/** Every mail on the tab in sheet order, with its row number for markRead. Junk rows are skipped. */
function readMessages_() {
  var sh = sheet_(SHEET_MESSAGES);
  if (!sh || sh.getLastRow() < 2) return [];
  var rows = sh.getRange(2, 1, sh.getLastRow() - 1, MESSAGES_HEADERS.length).getValues(), out = [];
  for (var i = 0; i < rows.length; i++) {
    var r = rows[i], dir = String(r[1]);
    if (!String(r[0]) || (dir !== TO_HER && dir !== TO_ME)) continue;
    out.push({ id: String(r[0]), direction: dir, body: String(r[2]), created: Number(r[3]) || 0,
      readAt: Number(r[4]) || null, row: i + 2 });
  }
  return out;
}

/** Exactly what the site is allowed to see of a mail. */
function publicMail_(m) {
  return { id: m.id, direction: m.direction, body: m.body, created: m.created, readAt: m.readAt };
}

/**
 * Her letter reply, shown to him as the first mail she wrote. It stays on the Account row; this only
 * presents it. Its read mark is tied to the reply's own timestamp, so a new reply after a reset is
 * unread again instead of inheriting the old one's mark.
 */
function replyAsMail_(acct) {
  if (!acct || !acct.reply) return null;
  var seen = null;
  try { seen = JSON.parse(PropertiesService.getScriptProperties().getProperty(PROP_REPLY_READ) || 'null'); }
  catch (err) { seen = null; }
  var ts = Number(acct.reply.timestamp) || 0;
  return { id: REPLY_ID, direction: TO_ME, body: acct.reply.text, created: ts,
    readAt: seen && Number(seen.ts) === ts ? (Number(seen.at) || null) : null, letterReply: true };
}

/**
 * One mail, in the direction the session decides: his writes to her, hers writes to him. The caller
 * never names a direction, so neither side can write into its own inbox.
 */
function sendMessage_(body) {
  var role = roleOf_(body.token);
  if (!role) return { ok: false, error: 'auth' };
  if (typeof body.body !== 'string') return { ok: false, error: 'invalid' };
  var text = str_(body.body, MAX_MESSAGE);
  if (!text.trim()) return { ok: false, error: 'invalid' };
  var lock = LockService.getScriptLock(), mail;
  try { lock.waitLock(10000); } catch (err) { return { ok: false, error: 'server' }; }
  try {
    if (role === 'her' && !readAccount_()) return { ok: false, error: 'auth' };
    var sh = ensureMessages_();
    mail = { id: Utilities.getUuid(), direction: role === 'admin' ? TO_HER : TO_ME,
      body: text, created: Date.now(), readAt: null };
    writeRows_(sh, sh.getLastRow() + 1, [[mail.id, mail.direction, mail.body, mail.created, '']]);
  } finally { lock.releaseLock(); }
  // Saved first, mailed second, and outside the lock so a slow MailApp never holds up anyone else.
  // Whatever happens to the email, her mail is already on the tab and she is told it was sent.
  if (role === 'her') tellHim_(mail);
  return { ok: true, message: mail };
}

/**
 * "She wrote to you": the same mail path as forgotSecret_ - ownerEmail_() and MailApp - with her words
 * in the body, so he can read them without opening the site. Only ever called once her mail is saved,
 * and every failure is swallowed: ownerEmail_() throws when no address is set, MailApp can fail or run
 * out of quota, and none of that may cost her what she wrote or reach her page as an error.
 *
 * The last few emails of the day are left for the forgot-word email: if she ever wrote dozens of mails
 * in one day, being able to get her back in matters more than one more notification. Her mail is still
 * saved and still on the admin page either way.
 */
function tellHim_(mail) {
  try {
    var left = MailApp.getRemainingDailyQuota();
    if (left <= MAIL_RESERVE) {
      console.log('sendMessage: not emailing - ' + left + ' left today, kept for the forgot-word email');
      return false;
    }
    var to = ownerEmail_();
    var acct = readAccount_(), who = acct ? (acct.displayName || acct.username) : 'She';
    var when = Utilities.formatDate(new Date(mail.created), Session.getScriptTimeZone(), 'd MMM yyyy, HH:mm');
    console.log('sendMessage: telling ' + to + ' (quota left ' + left + ')');
    MailApp.sendEmail({
      to: to,
      subject: who + ' wrote to you',
      body: [
        who + ' wrote to you on the site, ' + when + ':',
        '',
        mail.body,
        '',
        '-',
        'It is saved in the Messages tab and on your admin page. Replying to this email does not reach her;',
        'write back from the admin page.'
      ].join('\n')
    });
    return true;
  } catch (err) {
    console.log('sendMessage: email FAILED, her mail is saved - ' + err);
    return false;
  }
}

/**
 * Newest first. She sees the mail sent to her. He sees both directions: what he sent, with whether she
 * has opened it, and what she wrote back, her letter reply included.
 */
function getMessages_(body) {
  var role = roleOf_(body.token);
  if (!role) return { ok: false, error: 'auth' };
  var acct = readAccount_();
  if (role === 'her' && !acct) return { ok: false, error: 'auth' };
  var all = readMessages_(), out = [];
  for (var i = 0; i < all.length; i++) {
    if (role === 'admin' || all[i].direction === TO_HER) out.push(publicMail_(all[i]));
  }
  if (role === 'admin') { var reply = replyAsMail_(acct); if (reply) out.push(reply); }
  out.sort(function (a, b) { return b.created - a.created; });
  return { ok: true, messages: out };
}

/**
 * Marks mail opened - only mail addressed to the caller: she marks what he sent her, he marks what she
 * sent him. An id from the other direction is ignored rather than refused, and a mail already read
 * keeps its first readAt, so repeating a call changes nothing.
 */
function markRead_(body) {
  var role = roleOf_(body.token);
  if (!role) return { ok: false, error: 'auth' };
  var ids = Array.isArray(body.ids) ? body.ids.slice(0, MAX_MARK) : [], want = {}, i;
  for (i = 0; i < ids.length; i++) want[str_(ids[i], 64)] = true;
  var asked = function (id) { return Object.prototype.hasOwnProperty.call(want, id); };
  if (!ids.length) return { ok: true, marked: 0 };
  var mine = role === 'admin' ? TO_ME : TO_HER, now = Date.now(), marked = 0;
  var lock = LockService.getScriptLock();
  try { lock.waitLock(10000); } catch (err) { return { ok: false, error: 'server' }; }
  try {
    var acct = readAccount_();
    if (role === 'her' && !acct) return { ok: false, error: 'auth' };
    var all = readMessages_(), sh = sheet_(SHEET_MESSAGES);
    for (i = 0; i < all.length; i++) {
      var m = all[i];
      if (asked(m.id) && m.direction === mine && !m.readAt) { sh.getRange(m.row, 5).setValue(now); marked++; }
    }
    if (role === 'admin' && asked(REPLY_ID)) {
      var reply = replyAsMail_(acct);
      if (reply && !reply.readAt) {
        PropertiesService.getScriptProperties().setProperty(PROP_REPLY_READ, JSON.stringify({ ts: reply.created, at: now }));
        marked++;
      }
    }
    return { ok: true, marked: marked };
  } finally { lock.releaseLock(); }
}

/**
 * Public on purpose: the clip list is not sensitive and the memories page must work before login.
 * Returns the same shape clips.json uses, with collections derived from the rows in first-seen order.
 */
function getMemories_() {
  var sh = sheet_(SHEET_MEMORIES);
  if (!sh || sh.getLastRow() < 2) return { ok: true, source: 'sheet', collections: [], clips: [] };
  var rows = sh.getRange(2, 1, sh.getLastRow() - 1, MEMORIES_HEADERS.length).getValues();
  var clips = [], seen = {}, collections = [], i;
  for (i = 0; i < rows.length; i++) {
    var r = rows[i];
    var youtubeId = String(r[3] || '').trim();
    var title = String(r[0] || '').trim();
    if (!youtubeId && !title) continue;                       // blank row
    var collection = String(r[4] || '').trim() || 'all';
    if (!seen[collection]) { seen[collection] = true; collections.push({ id: collection, title: collection }); }
    clips.push({
      id: 'm' + (i + 1), youtubeId: youtubeId, title: title,
      date: formatDate_(r[2]), caption: String(r[1] || '').trim(),
      collection: collection, order: Number(r[5]) || (i + 1)
    });
  }
  clips.sort(function (a, b) { return a.order - b.order; });
  return { ok: true, source: 'sheet', collections: collections, clips: clips };
}

/** The site wants YYYY-MM-DD; the Sheet may hand back a real Date or free text. */
function formatDate_(v) {
  if (v instanceof Date && !isNaN(v.getTime())) {
    return Utilities.formatDate(v, Session.getScriptTimeZone(), 'yyyy-MM-dd');
  }
  return String(v || '').trim();
}
