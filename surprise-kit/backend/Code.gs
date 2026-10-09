// Apps Script backend for the surprise site.
// What this does: accepts her sign-up answers and her letter reply and appends
// each as a timestamped row in the "Responses" tab of a Google Sheet in your Drive.
// There is no doGet and no read path of any kind: this script can only be written
// to, never read from, so her replies can never come back out through the public
// URL. You read them by opening the Sheet yourself.
// Full setup walkthrough: backend/SETUP.md.

const RESPONSES_SHEET = 'Responses';
const HONEYPOT_FIELD = 'website'; // must arrive empty; bots tend to fill every field they see
const MAX_REPLY_LENGTH = 2000;
const MAX_FIELD_LENGTH = 200;

function doPost(e) {
  try {
    const data = parseBody(e);
    if (data[HONEYPOT_FIELD]) return respond(); // quietly drop suspected bot submissions
    if (data.type === 'signup') appendSignup(data);
    else if (data.type === 'reply') appendReply(data);
    // any other/missing type: ignore, still respond the same way below
  } catch (err) {
    // never surface script errors to the caller; the site doesn't read this response anyway
  }
  return respond();
}

// Deliberately no doGet(): visiting the web app URL in a browser returns nothing useful,
// and there is no endpoint that hands back stored rows.
function respond() {
  return ContentService.createTextOutput('ok').setMimeType(ContentService.MimeType.TEXT);
}

function parseBody(e) {
  // The site posts as text/plain (see script.js) to avoid a CORS preflight, which
  // Apps Script web apps don't handle. The body is still a JSON string underneath.
  if (e && e.postData && e.postData.contents) {
    try { return JSON.parse(e.postData.contents); } catch (err) { return {}; }
  }
  return {};
}

function getResponsesSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(RESPONSES_SHEET);
  if (!sheet) {
    sheet = ss.insertSheet(RESPONSES_SHEET);
    sheet.appendRow(['Timestamp', 'Type', 'Username', 'Mood', 'Icon', 'Music', 'Reply']);
  }
  return sheet;
}

function appendSignup(data) {
  getResponsesSheet().appendRow([
    new Date(), 'signup',
    clean(data.username, MAX_FIELD_LENGTH), clean(data.mood, MAX_FIELD_LENGTH),
    clean(data.icon, MAX_FIELD_LENGTH), clean(data.music, MAX_FIELD_LENGTH), ''
  ]);
}

function appendReply(data) {
  getResponsesSheet().appendRow([
    new Date(), 'reply',
    clean(data.username, MAX_FIELD_LENGTH), '', '', '',
    clean(data.reply, MAX_REPLY_LENGTH)
  ]);
}

function clean(value, maxLength) {
  return String(value == null ? '' : value).slice(0, maxLength);
}
