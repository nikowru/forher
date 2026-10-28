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
 * - Everything is as private as the Google account that owns this Sheet.
 */

var SHEET_ACCOUNT = 'Account';
var SHEET_MEMORIES = 'Memories';

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

/** Run this ONCE from the Apps Script editor before deploying. Safe to run again. */
function setup() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!ss) throw new Error('No Sheet attached. Open this script from the Sheet: Extensions > Apps Script.');
  ensureSheet_(ss, SHEET_ACCOUNT, ACCOUNT_HEADERS);
  ensureSheet_(ss, SHEET_MEMORIES, MEMORIES_HEADERS);
  var props = PropertiesService.getScriptProperties();
  if (!props.getProperty(PROP_SALT)) props.setProperty(PROP_SALT, randomHex_(32));
  return 'Setup complete. Tabs "' + SHEET_ACCOUNT + '" and "' + SHEET_MEMORIES + '" are ready and a salt was generated.';
}

/** Wipes the account so you can test sign-up again. Memories and the salt are left alone. */
function resetAccount() {
  wipeAccount_();
  return 'Account cleared. The site will offer sign-up again.';
}

/**
 * The account row, every live session and the lockout counters. The Memories tab and the salt
 * stay, so the clips and the hashing survive a reset.
 */
function wipeAccount_() {
  var sh = sheet_(SHEET_ACCOUNT);
  if (sh && sh.getLastRow() > 1) sh.getRange(2, 1, sh.getLastRow() - 1, sh.getLastColumn()).clearContent();
  PropertiesService.getScriptProperties().deleteProperty(PROP_TOKENS);
  CacheService.getScriptCache().removeAll([CACHE_FAILS, CACHE_LOCKED]);
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

function readTokens_() {
  var raw = PropertiesService.getScriptProperties().getProperty(PROP_TOKENS);
  var list = [];
  try { list = JSON.parse(raw || '[]') || []; } catch (err) { list = []; }
  var now = Date.now(), live = [];
  for (var i = 0; i < list.length; i++) if (Number(list[i].exp) > now) live.push(list[i]);
  return live;
}

function newToken_() {
  var token = randomHex_(24);                       // returned once, never stored in the clear
  var live = readTokens_();
  live.push({ h: sha256_(token), exp: Date.now() + TOKEN_TTL_MS });
  if (live.length > MAX_TOKENS) live = live.slice(-MAX_TOKENS);
  PropertiesService.getScriptProperties().setProperty(PROP_TOKENS, JSON.stringify(live));
  return token;
}

function validToken_(token) {
  if (!token) return false;
  var want = sha256_(String(token)), live = readTokens_();
  for (var i = 0; i < live.length; i++) if (sameHash_(live[i].h, want)) return true;
  return false;
}

/* ------------------------------------------------------------------ lockout */

function lockedOut_() { return !!CacheService.getScriptCache().get(CACHE_LOCKED); }

function noteFail_() {
  var cache = CacheService.getScriptCache();
  var n = Number(cache.get(CACHE_FAILS) || 0) + 1;
  if (n >= LOCKOUT_TRIES) {
    cache.put(CACHE_LOCKED, '1', LOCKOUT_SECONDS);
    cache.remove(CACHE_FAILS);
  } else {
    cache.put(CACHE_FAILS, String(n), LOCKOUT_SECONDS);
  }
}

function clearFails_() { CacheService.getScriptCache().removeAll([CACHE_FAILS, CACHE_LOCKED]); }

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
    MailApp.sendEmail({
      to: ownerEmail_(),
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
    return { ok: true, mailed: false };
  }
  return { ok: true, mailed: true };
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

/** Whoever owns this script. Deliberately not written down anywhere in the repo. */
function ownerEmail_() {
  var set = PropertiesService.getScriptProperties().getProperty('OWNER_EMAIL');
  if (set) return set;
  return Session.getEffectiveUser().getEmail();
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
