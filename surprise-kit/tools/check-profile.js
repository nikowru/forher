// Verifies profile.html in a real browser: both themes, 1440 and 390 wide, plus a reduced-motion
// pass. It asserts computed values only - display, real clickability via elementFromPoint, hit-target
// height, focus rings, and text contrast measured against the composited background actually painted
// behind each role. It never reads the hidden attribute: the bug worth catching is an element that
// is "hidden" and still laid out over the page swallowing clicks.
//
// It also walks the mailbox through the local driver and the Surprise.Api facade - who may send, read
// and mark what - to the same rules tools/check-backend.js holds the server to. The admin half needs
// the default admin password, which is not written in the repo: run with ADMIN_DEFAULT=<it> set, or
// the report says that half was skipped.
//
// The site is served by tools/localmode.js, which blanks APPS_SCRIPT_URL in flight. This harness
// never serves the pages itself and never rewrites config.js: pointing a browser anywhere else
// talks to her real account on the live Sheet.
//
//   node tools/localmode.js                      # in one terminal, first
//   node tools/check-profile.js [screenshot-dir] # in another
//
// Needs Playwright, which this project does not otherwise use and does not vendor:
//   npm i -D playwright && npx playwright install chromium
// or, to leave no footprint in the repo, point NODE_PATH at an existing install:
//   NODE_PATH=/path/to/node_modules node tools/check-profile.js
const path = require("path");
let chromium;
try { ({ chromium } = require("playwright")); }
catch (e) {
  console.error("\n  This needs Playwright:  npm i -D playwright  (then: npx playwright install chromium)\n");
  process.exit(1);
}

const BASE = "http://localhost:3012";
const LIVE_HOST = "script.google.com";
const OUT = process.argv[2] || null;   // no directory given: run the checks, skip the screenshots

// --- in-page helpers, stringified once and reused in every pass --------------------------------
// measuring helpers shared by every in-page probe: colour parsing, contrast, clickability
const HELPERS = `
  const px = v => parseFloat(v) || 0;
  const ws = new RegExp(String.fromCharCode(92) + "s+", "g");   // no literal backslash: see header
  // Chromium serializes color-mix() as color(srgb ...), so let the browser resolve every colour for
  // us by painting one pixel of it: getImageData gives non-premultiplied RGBA whatever the syntax.
  const cvs = document.createElement("canvas"); cvs.width = cvs.height = 1;
  const ctx = cvs.getContext("2d", { willReadFrequently: true });
  const parse = c => {
    if (!c || c === "none") return null;
    ctx.clearRect(0, 0, 1, 1); ctx.fillStyle = "#123456"; ctx.fillStyle = c;
    ctx.fillRect(0, 0, 1, 1);
    const d = ctx.getImageData(0, 0, 1, 1).data;
    return { r: d[0], g: d[1], b: d[2], a: d[3] / 255 };
  };
  const over = (fg, bg) => ({ r: fg.r * fg.a + bg.r * (1 - fg.a), g: fg.g * fg.a + bg.g * (1 - fg.a), b: fg.b * fg.a + bg.b * (1 - fg.a), a: 1 });
  // the real painted background behind an element, its own tint included: walk up through every
  // transparent layer and composite them in paint order
  const bgOf = el => {
    let acc = { r: 255, g: 255, b: 255, a: 1 }, chain = [];
    for (let n = el; n; n = n.parentElement) {
      const c = parse(getComputedStyle(n).backgroundColor);
      if (c && c.a > 0) chain.unshift(c);
    }
    const page = parse(getComputedStyle(document.body).backgroundColor);
    if (page && page.a > 0) chain.unshift(page);
    for (const c of chain) acc = over(c, acc);
    return acc;
  };
  const lum = c => { const f = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
    return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b); };
  const ratio = (a, b) => { const l1 = lum(a), l2 = lum(b); return +(((Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05))).toFixed(2); };

  const vis = id => { const el = document.getElementById(id); if (!el) return { id, exists: false };
    const cs = getComputedStyle(el), r = el.getBoundingClientRect();
    return { id, exists: true, display: cs.display, visibility: cs.visibility, opacity: cs.opacity,
      w: Math.round(r.width), h: Math.round(r.height) }; };

  // a control is usable only if the topmost element at its centre is it, and it is big enough to hit
  const control = id => { const el = document.getElementById(id); if (!el) return { id, hit: "missing" };
    const r = el.getBoundingClientRect();
    if (!r.width || !r.height) return { id, hit: "zero-size" };
    const cx = Math.round(r.left + r.width / 2), cy = Math.round(r.top + r.height / 2);
    if (cy < 0 || cy > innerHeight) return { id, hit: "offscreen", h: Math.round(r.height) };
    const top = document.elementFromPoint(cx, cy);
    return { id, h: Math.round(r.height), w: Math.round(r.width),
      hit: top === el || el.contains(top) ? "ok" : "blocked-by:" + (top ? (top.id || top.className || top.tagName) : "null") }; };

  const contrast = (sel, label) => { const el = document.querySelector(sel); if (!el) return { label, missing: true };
    const cs = getComputedStyle(el);
    const fg = parse(cs.color), bg = bgOf(el);
    const sized = px(cs.fontSize), bold = px(cs.fontWeight) >= 700;
    const large = sized >= 24 || (sized >= 18.66 && bold);
    const cr = ratio(over(fg, bg), bg);
    return { label, size: Math.round(sized), weight: cs.fontWeight, ratio: cr, needs: large ? 3 : 4.5, pass: cr >= (large ? 3 : 4.5) }; };

  // one honest convention: nothing on the sheet is underlined, so an underline can never be mistaken
  // for "you can click this". The buttons carry the whole affordance.
  const underlined = sel => [...document.querySelectorAll(sel)]
    .filter(el => getComputedStyle(el).textDecorationLine !== "none")
    .map(el => el.id || el.className);

`;
const PROBE = `(() => {${HELPERS}
  const card = document.getElementById("pf");
  return {
    theme: document.documentElement.getAttribute("data-theme") || "(system)",
    hScroll: { scrollW: document.scrollingElement.scrollWidth, clientW: document.scrollingElement.clientWidth },
    cardW: Math.round(card.getBoundingClientRect().width),
    cardH: Math.round(card.getBoundingClientRect().height),
    renders: ["pf-photo", "pf-avatar", "pf-name", "pf-mood-img", "pf-mood-text", "pf-secret-val",
      "pf-rank-img", "pf-rank-text", "pf-us-img", "pf-us-cap", "pf-since", "pf-sign", "pf-write-me", "pf-write-form"].map(vis),
    startsHidden: ["pf-nameform", "pf-secretform", "pf-mood-pick", "pf-msg"].map(vis),
    controls: ["pf-name-edit", "pf-mood-edit", "pf-secret-toggle", "pf-secret-change"].map(control),
    underlines: underlined(".pf-val, .pf-name, .pf-line, .pf-us-cap, .pf-sign, .wr-label"),
    embed: (() => { const f = document.querySelector("#pf-tunes-embed iframe");
      return f ? { exists: true, h: Math.round(f.getBoundingClientRect().height), w: Math.round(f.getBoundingClientRect().width), title: f.getAttribute("title") } : { exists: false }; })(),
    // every element in the arrival sequence must actually carry an animation (or none at all, under
    // reduced motion) - a stagger that silently stopped running would still look fine in a still
    arrival: [".pf", ".pf-date", ".pf-photo", ".pf-salute", ".pf-item", ".pf-enclosed", ".pf-sign", ".profile-main .wr"]
      .map(s => { const el = document.querySelector(s); if (!el) return { sel: s, missing: true };
        const cs = getComputedStyle(el);
        return { sel: s, name: cs.animationName, delay: cs.animationDelay, dur: cs.animationDuration }; }),
    text: [
      contrast(".pf-line", "sentence"),
      contrast(".pf-val", "a filled blank"),
      contrast(".pf-date", "the date"),
      contrast(".pf-act", "a change button"),
      contrast(".pf-name", "her name"),
      contrast(".pf-lead-in", "playlist lead-in"),
      contrast(".pf-us-cap", "us caption"),
      contrast(".pf-sign", "signature"),
      contrast(".pf-secret-val", "the secret word"),
      contrast("#pf-write-label", "write label"),
      contrast("#pf-write-text", "her words, typing"),
      contrast("#pf-write-send", "send button")
    ],
    fonts: { line: getComputedStyle(document.querySelector(".pf-line")).font,
             name: getComputedStyle(document.querySelector(".pf-name")).font,
             align: getComputedStyle(document.querySelector(".pf-name")).textAlign,
             shadow: getComputedStyle(document.querySelector(".pf-name")).textShadow }
  };
})()`;

(async () => {
  // Confirm local mode independently rather than trusting that it is running. If localmode.js is not
  // up, or is ever served a config that still carries the URL, stop before any page can load.
  const cfg = await fetch(BASE + "/js/config.js").then(r => r.text()).catch(e => { throw new Error(
    "cannot reach " + BASE + " - start it in the repo with `node tools/localmode.js` (" + e.message + ")"); });
  if (cfg.indexOf(LIVE_HOST) >= 0) throw new Error(
    "the served config.js still carries a live URL - that is NOT local mode, refusing to run");
  if (cfg.indexOf('APPS_SCRIPT_URL = ""') < 0) throw new Error(
    "cannot confirm APPS_SCRIPT_URL is blanked in the served config.js - refusing to run");

  const browser = await chromium.launch();
  const report = { base: BASE, liveHostAttempts: [], errors: [], httpErrors: [], themes: {}, interactions: {}, unremembered: {}, phone: {}, reducedMotion: {} };

  // One page per pass so a reduced-motion context is a fresh page, not a re-styled one.
  const open = async opts => {
    const ctx = await browser.newContext(Object.assign({ viewport: { width: 1440, height: 900 } }, opts));
    const page = await ctx.newPage();
    page.on("pageerror", e => report.errors.push(String(e)));
    page.on("console", m => { if (m.type() === "error" && m.text().indexOf("Failed to load resource") !== 0) report.errors.push("console: " + m.text()); });
    page.on("response", r => { if (r.status() >= 400 && report.httpErrors.indexOf(r.status() + " " + r.url()) < 0) report.httpErrors.push(r.status() + " " + r.url()); });
    // A tripwire, not a safety net: local mode is enforced by the server, so nothing should ever be
    // addressed to the live host. Record any attempt - that would mean local mode had failed - and
    // abort it, so a stray call could not land on her Sheet even then.
    await page.route(url => url.href.indexOf(LIVE_HOST) >= 0, route => {
      report.liveHostAttempts.push(route.request().url());
      return route.abort();
    });
    return page;
  };

  // A fixture written straight into storage in the shape the local driver expects. Going through
  // Api.signup kept racing the gate page's own startup, which is a harness problem, not a site one.
  const seed = async page => {
    await page.goto(BASE + "/index.html?reset=1", { waitUntil: "load" });
    await page.waitForFunction("!!(window.Surprise && window.Surprise.Api)", null, { polling: 150, timeout: 15000 });
    await page.waitForTimeout(200);
    return page.evaluate(async () => {
      const S = window.Surprise;
      const token = "harness-token";
      const progress = { proposal: true, letter: true, memories: true, inbox: true, profile: true, accepted: true };
      S.Store.setJSON(S.KEYS.account, {
        v: 1, username: "Aki", displayName: "Aki",
        secret: { alg: "plain-local", salt: "harness", hash: "harness:lighthouse" },
        mood: S.MOODS[3].id, iconId: S.ICONS[2].id, musicId: null,
        progress, reply: { text: "i wrote back", timestamp: Date.now() },
        created: Date.parse("2026-10-09T10:00:00Z"), tokens: [token]
      });
      S.Store.setJSON(S.KEYS.progress, progress);
      S.Store.setJSON(S.KEYS.reply, { text: "i wrote back", timestamp: Date.now() });
      S.Session.start(token);
      // this device was told to remember the word, so the reveal toggle is in play
      S.Store.setJSON(S.KEYS.remember, { v: 1, username: "Aki", secret: "lighthouse" });
      const check = await S.Api.getProfile();
      return check.ok ? { ok: true, driver: S.Api.driver } : { ok: false, check };
    });
  };

  // Wait for the card to finish arriving, and for nothing else. The page also carries the drifting
  // particles from js/common.js, which run forever, so awaiting every animation on the document
  // never returns - that hung the first run of this harness until it was killed.
  const CARD_ANIMS = `document.getAnimations().filter(a =>
    String(a.animationName || "").indexOf("pf-") === 0 &&
    a.effect.getComputedTiming().iterations !== Infinity)`;
  const settled = async page => {
    await page.waitForSelector("#pf-name:not(:empty)");
    await page.evaluate(`Promise.all(${CARD_ANIMS}.map(a => a.finished.catch(() => {})))`);
    await page.waitForTimeout(120);
  };

  const page = await open();
  const s = await seed(page);
  if (!s.ok) { console.log(JSON.stringify({ seedFailed: s }, null, 2)); await browser.close(); return; }
  report.driver = s.driver;
  if (report.driver !== "local") { console.log(JSON.stringify({ refusing: "driver is " + report.driver }, null, 2)); await browser.close(); return; }

  // --- both themes, desktop ---
  for (const theme of ["light", "dark"]) {
    await page.goto(BASE + "/profile.html", { waitUntil: "load" });
    await page.evaluate(t => document.documentElement.setAttribute("data-theme", t), theme);
    await settled(page);
    report.themes[theme] = await page.evaluate(PROBE);
    // the form under her card sits below the fold on a laptop: measured where she would actually press it
    report.themes[theme].writeSend = await page.evaluate(`(() => {${HELPERS} document.getElementById("pf-write-send").scrollIntoView({ block: "center" }); return control("pf-write-send"); })()`);
    await page.evaluate(() => window.scrollTo(0, 0));
    // the keyboard ring, measured on each control while it actually has focus
    report.themes[theme].focusRings = [];
    for (const id of ["pf-name-edit", "pf-mood-edit", "pf-secret-toggle", "pf-secret-change", "pf-write-send"]) {
      report.themes[theme].focusRings.push(await page.evaluate(i => {
        const el = document.getElementById(i); if (!el) return { id: i, ring: "missing" };
        el.focus();
        const cs = getComputedStyle(el);
        return { id: i, ring: cs.outlineStyle + " " + cs.outlineWidth + " " + cs.outlineColor,
          visible: cs.outlineStyle !== "none" && parseFloat(cs.outlineWidth) >= 2 };
      }, id));
    }
    await page.evaluate(() => document.activeElement.blur());
    if (OUT) await page.screenshot({ path: path.join(OUT, `profile-${theme}.png`), fullPage: true });
  }

  // --- interactions, in the light theme ---
  await page.goto(BASE + "/profile.html", { waitUntil: "load" });
  await page.evaluate(() => document.documentElement.setAttribute("data-theme", "light"));
  await settled(page);
  const shown = id => page.evaluate(i => { const el = document.getElementById(i);
    return { display: getComputedStyle(el).display, h: Math.round(el.getBoundingClientRect().height) }; }, id);
  const I = report.interactions;

  I.nameFormBefore = await shown("pf-nameform");
  await page.click("#pf-name-edit");
  I.nameFormAfter = await shown("pf-nameform");
  I.nameFormAnimates = await page.evaluate(() => getComputedStyle(document.getElementById("pf-nameform")).animationName);
  await page.waitForTimeout(350);
  I.nameInputFocused = await page.evaluate(() => document.activeElement.id);
  await page.fill("#pf-name-input", "Aki my love");
  await page.click("#pf-name-save");
  await page.waitForTimeout(500);
  I.nameSaved = await page.textContent("#pf-name");
  I.nameFormClosed = await shown("pf-nameform");

  await page.click("#pf-mood-edit");
  I.moodPick = await shown("pf-mood-pick");
  I.moodPickAnimates = await page.evaluate(() => getComputedStyle(document.getElementById("pf-mood-pick")).animationName);
  I.moodButtonsAnimate = await page.evaluate(() => getComputedStyle(document.querySelector(".pf-moodbtn")).animationName);
  I.moodButtons = await page.locator("#pf-mood-pick .pf-moodbtn").count();
  await page.waitForTimeout(350);
  await page.locator("#pf-mood-pick .pf-moodbtn").nth(4).click();
  await page.waitForTimeout(500);
  I.moodAfter = (await page.textContent("#pf-mood-text")).slice(0, 40);
  I.moodRendered = await page.evaluate(() => { const el = document.getElementById("pf-mood-text");
    return { transform: getComputedStyle(el).textTransform, asPainted: el.innerText }; });
  I.moodPickClosed = await shown("pf-mood-pick");

  I.secretMasked = await page.textContent("#pf-secret-val");
  await page.click("#pf-secret-toggle");
  await page.waitForTimeout(90);   // the class goes on once the read resolves, not on the click
  I.secretRevealAnimates = await page.evaluate(() => getComputedStyle(document.getElementById("pf-secret-val")).animationName);
  await page.waitForTimeout(600);
  I.secretRevealed = await page.textContent("#pf-secret-val");
  I.toggleLabel = await page.textContent("#pf-secret-toggle");

  // changing the word: the one control the earlier rounds never exercised end to end
  await page.click("#pf-secret-change");
  I.secretFormOpen = await shown("pf-secretform");
  await page.waitForTimeout(350);
  await page.fill("#pf-secret-input", "harbour light");
  await page.click("#pf-secret-save");
  await page.waitForTimeout(600);
  I.secretChanged = await page.evaluate(() => ({
    form: getComputedStyle(document.getElementById("pf-secretform")).display,
    msg: document.getElementById("pf-msg").innerText,
    msgShown: getComputedStyle(document.getElementById("pf-msg")).display,
    value: document.getElementById("pf-secret-val").innerText
  }));
  await page.click("#pf-secret-toggle");
  await page.waitForTimeout(400);
  I.secretAfterChange = await page.textContent("#pf-secret-val");

  // the sentences as a person actually reads them
  I.lines = await page.evaluate(() => { const ws = new RegExp(String.fromCharCode(92) + "s+", "g");
    return [...document.querySelectorAll(".pf-line")].map(p => p.innerText.replace(ws, " ").trim()); });

  // --- a device that was never told to remember her ---
  await page.evaluate(() => window.Surprise.Store.remove(window.Surprise.KEYS.remember));
  await page.goto(BASE + "/profile.html", { waitUntil: "load" });
  await settled(page);
  report.unremembered = await page.evaluate(() => { const ws = new RegExp(String.fromCharCode(92) + "s+", "g");
    const el = document.getElementById("pf-secret-change"), r = el.getBoundingClientRect();
    const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    return {
      line: document.querySelectorAll(".pf-line")[1].innerText.replace(ws, " ").trim(),
      leadDisplay: getComputedStyle(document.getElementById("pf-secret-lead")).display,
      toggleDisplay: getComputedStyle(document.getElementById("pf-secret-toggle")).display,
      changeStillClickable: top === el || el.contains(top)
    }; });
  report.unremembered.contrast = await page.evaluate(`(${PROBE}).text.find(t => t.label === "the secret word")`);

  // --- a phone ---
  // put the remembered word back first: the pass above deliberately took it away, and without it
  // the reveal toggle is legitimately hidden and the phone measurements would be read as a fault
  await page.evaluate(() => window.Surprise.Store.setJSON(window.Surprise.KEYS.remember,
    { v: 1, username: "Aki", secret: "harbour light" }));
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(BASE + "/profile.html", { waitUntil: "load" });
  await settled(page);
  report.phone = await page.evaluate(() => ({
    scrollW: document.scrollingElement.scrollWidth, clientW: document.scrollingElement.clientWidth,
    headDir: getComputedStyle(document.querySelector(".pf-head")).flexDirection,
    enclosedDir: getComputedStyle(document.querySelector(".pf-enclosed")).flexDirection,
    controlHeights: ["pf-name-edit", "pf-mood-edit", "pf-secret-toggle", "pf-secret-change", "pf-write-send"]
      .map(i => { const el = document.getElementById(i);
        return { id: i, h: Math.round(el.getBoundingClientRect().height) }; })
  }));
  if (OUT) await page.screenshot({ path: path.join(OUT, "profile-phone.png"), fullPage: true });
  await page.context().close();

  // --- reduced motion: everything arrives in place, state changes are instant ---
  const rm = await open({ reducedMotion: "reduce" });
  const rmSeed = await seed(rm);
  if (rmSeed.ok) {
    await rm.goto(BASE + "/profile.html", { waitUntil: "load" });
    await settled(rm);
    report.reducedMotion = await rm.evaluate(() => {
      const names = s => { const el = document.querySelector(s);
        return el ? getComputedStyle(el).animationName : "missing"; };
      const card = document.getElementById("pf");
      return {
        cardAnimationsRunning: document.getAnimations()
          .filter(a => String(a.animationName || "").indexOf("pf-") === 0).length,
        card: names(".pf"), item: names(".pf-item"), sign: names(".pf-sign"), write: names(".profile-main .wr"),
        photoTransform: getComputedStyle(document.getElementById("pf-photo")).transform,
        tiltClass: card.classList.contains("is-tilting"),
        everythingVisible: [...document.querySelectorAll(".pf-item, .pf-salute, .pf-enclosed")]
          .every(el => getComputedStyle(el).opacity === "1")
      };
    });
    await rm.click("#pf-name-edit");
    report.reducedMotion.formOpensInstantly = await rm.evaluate(() => {
      const f = document.getElementById("pf-nameform");
      return { display: getComputedStyle(f).display, animation: getComputedStyle(f).animationName,
        h: Math.round(f.getBoundingClientRect().height) };
    });
  } else report.reducedMotion = { seedFailed: rmSeed };
  await rm.context().close();

  // --- the mailbox, through the local driver and the facade: the same rules tools/check-backend.js
  // holds the server to, so the two drivers cannot drift apart. The local stand-in only knows the
  // default admin password, which is not written in this repo: pass it as ADMIN_DEFAULT to include
  // his side, or the run says plainly that it was left out.
  const mp = await open();
  const mSeed = await seed(mp);
  report.mail = !mSeed.ok ? { seedFailed: mSeed } : await mp.evaluate(async pw => {
    const S = window.Surprise, A = S.Api, out = {};
    const t = (k, v) => { out[k] = !!v; };
    t("adminStartsSignedOut", A.admin.signedIn() === false);
    t("adminCallsWithoutSessionAreAuth", (await A.admin.getMessages()).error === "auth");
    t("herSessionDoesNotOpenAdmin", (await A.admin.sendMessage("x")).error === "auth");
    t("wrongAdminPasswordIsWrong", (await A.admin.login("admin", "nope")).error === "wrong");
    t("herWordIsNotTheAdminPassword", (await A.admin.login("Aki", "lighthouse")).error === "wrong");
    if (!pw) { out.adminSide = "SKIPPED - set ADMIN_DEFAULT to include it"; return out; }
    const li = await A.admin.login(" Admin ", pw);
    t("adminLogin", li.ok && !("token" in li) && A.admin.signedIn());
    t("adminLoginLeavesHerSessionAlone", S.Session.get().token === "harness-token");
    const s1 = await A.admin.sendMessage("first, from me");
    const s2 = await A.sendMessage("hello you");
    const s3 = await A.admin.sendMessage("x".repeat(5000));
    t("adminSendsToHer", s1.ok && s1.message.direction === "to-her");
    t("sheSendsToMe", s2.ok && s2.message.direction === "to-me");
    t("emptyIsInvalid", (await A.sendMessage("   ")).error === "invalid");
    t("cappedAt4000", s3.ok && s3.message.body.length === 4000);
    const hers = await A.getMessages();
    t("sheReadsOnlyToHer", hers.ok && hers.messages.length === 2 && hers.messages.every(m => m.direction === "to-her"));
    t("newestFirst", hers.ok && hers.messages[0].created >= hers.messages[1].created);
    const his = await A.admin.getMessages();
    const reply = his.ok && his.messages.find(m => m.id === "reply");
    t("heReadsBoth", his.ok && his.messages.some(m => m.direction === "to-me" && m.id !== "reply"));
    t("heSeesHerLetterReply", reply && reply.letterReply === true && reply.body === "i wrote back");
    t("sheCannotMarkHis", (await A.markRead([s2.message.id])).marked === 0);
    t("sheMarksHers", (await A.markRead([s1.message.id])).marked === 1);
    t("markingAgainChangesNothing", (await A.markRead([s1.message.id])).marked === 0);
    t("heCannotMarkHers", (await A.admin.markRead([s3.message.id])).marked === 0);
    t("heMarksHers", (await A.admin.markRead([s2.message.id])).marked === 1);
    t("heMarksTheLetterReply", (await A.admin.markRead(["reply"])).marked === 1);
    t("sheCannotMarkTheLetterReply", (await A.markRead(["reply"])).marked === 0);
    // start fresh: her mail goes with her account, his stays and is unread again
    await A.changeSecret("lighthouse");   // the fixture's stored word is a stand-in the hasher cannot match
    t("deleteAccount", (await A.deleteAccount("Aki", "lighthouse")).ok);
    const after = await A.admin.getMessages();
    t("afterDeleteAdminStillSignedIn", after.ok);
    t("afterDeleteHerMailIsGone", after.ok && !after.messages.some(m => m.direction === "to-me"));
    t("afterDeleteHisMailIsKeptUnread", after.ok && after.messages.length === 2 && after.messages.every(m => m.direction === "to-her" && !m.readAt));
    t("afterDeleteHerCallsAreAuth", (await A.getMessages()).error === "auth");
    await A.admin.logout();
    t("adminLogout", !A.admin.signedIn() && (await A.admin.getMessages()).error === "auth");
    return out;
  }, process.env.ADMIN_DEFAULT || "");
  report.mail.failed = Object.keys(report.mail).filter(k => report.mail[k] === false);
  await mp.context().close();


  // --- admin.html, his back office ------------------------------------------------------------------
  // First a stray visit from HER browser (her session, no admin one): it must look like nothing. Then,
  // with ADMIN_DEFAULT, his side end to end - sign in, both directions listed, send, a session dying
  // mid-draft, sign out - and both themes at 1440 and 390 with contrast on every text role and real
  // clickability of every control.
  const NL = String.fromCharCode(10);
  const lines = `(el => el.innerText.split(String.fromCharCode(10)).map(s => s.trim()).filter(Boolean).join(" | "))`;
  const AD_PROBE = `(() => {${HELPERS}
    const shown = id => { const el = document.getElementById(id); return el ? getComputedStyle(el).display : "missing"; };
    return {
      theme: document.documentElement.getAttribute("data-theme"),
      hScroll: document.scrollingElement.scrollWidth + "/" + document.scrollingElement.clientWidth,
      signin: shown("ad-signin"), desk: shown("ad-desk"),
      columns: getComputedStyle(document.getElementById("ad-desk")).gridTemplateColumns,
      text: [
        contrast(".ad-heading", "heading"), contrast(".ad-kicker", "kicker"), contrast(".ad-title", "compose title"),
        contrast(".ad-label", "field label"), contrast("#ad-body", "typed letter"), contrast(".ad-count", "counter"),
        contrast("#ad-send", "send button"), contrast("#ad-refresh", "quiet button"), contrast("#ad-send-msg", "status line"),
        contrast(".is-to-her .ad-who", "you-wrote tag"), contrast(".is-to-her .ad-when", "his mail's time"),
        contrast(".is-to-her .ad-state", "opened state"), contrast(".is-to-her .ad-text", "his mail"),
        contrast(".is-to-me .ad-who", "she-wrote tag"), contrast(".is-to-me .ad-when", "her mail's time"),
        contrast(".is-to-me .ad-text", "her mail"), contrast(".ad-new", "new badge")
      ]
    };
  })()`;
  const adControl = (pg, id) => pg.evaluate(`(() => {${HELPERS}
    const el = document.getElementById(${JSON.stringify(id)}); if (el) el.scrollIntoView({ block: "center" });
    const c = control(${JSON.stringify(id)});
    el.focus(); const cs = getComputedStyle(el);
    c.ring = cs.outlineStyle !== "none" && parseFloat(cs.outlineWidth) >= 2; el.blur();
    return c; })()`);
  const finished = pg => pg.evaluate(`Promise.all(document.getAnimations()
    .filter(a => a.effect.getComputedTiming().iterations !== Infinity).map(a => a.finished.catch(() => {})))`);
  const AD = report.admin = {};

  const ap = await open();
  const aSeed = await seed(ap);
  if (!aSeed.ok) AD.seedFailed = aSeed;
  else {
    // she has written to him before he arrives, so his list has both directions to show
    await ap.evaluate(() => window.Surprise.Api.sendMessage("a note from her"));
    await ap.goto(BASE + "/admin.html", { waitUntil: "load" });
    await ap.waitForFunction("document.title !== ''");
    await finished(ap);
    if (OUT) await ap.screenshot({ path: path.join(OUT, "admin-signed-out.png") });
    AD.strayVisit = await ap.evaluate(`(() => ({
      title: document.title,
      signin: getComputedStyle(document.getElementById("ad-signin")).display,
      desk: getComputedStyle(document.getElementById("ad-desk")).display,
      mailInPage: document.querySelectorAll("#ad-mail li").length,
      musicButton: !!document.getElementById("tunes"),
      header: !!document.getElementById("site-header"),
      everythingShown: ${lines}(document.body),
      mentionsHer: document.body.innerText.indexOf("Aki") >= 0 || document.body.innerText.indexOf("from her") >= 0,
      herSessionUntouched: (window.Surprise.Session.get() || {}).token === "harness-token"
    }))()`);
    await ap.fill("#ad-user", "admin");
    await ap.fill("#ad-pass", "nope");
    await ap.click("#ad-signin-go");
    await ap.waitForFunction(() => getComputedStyle(document.getElementById("ad-signin-msg")).display !== "none");
    AD.wrongPassword = await ap.textContent("#ad-signin-msg");
    // reached the way a keyboard user reaches it: after a mouse click the browser rightly withholds
    // :focus-visible from programmatic focus, so el.focus() here would report a ring as missing
    AD.signinGo = await adControl(ap, "ad-signin-go");
    await ap.focus("#ad-pass");
    await ap.keyboard.press("Tab");
    AD.signinGo.ring = await ap.evaluate(() => { const el = document.activeElement, cs = getComputedStyle(el);
      return el.id === "ad-signin-go" && cs.outlineStyle !== "none" && parseFloat(cs.outlineWidth) >= 2; });
    AD.signinText = await ap.evaluate(`(() => {${HELPERS} return [contrast(".ad-label", "label"),
      contrast("#ad-user", "typed name"), contrast("#ad-signin-go", "sign-in button"), contrast("#ad-signin-msg", "message")]; })()`);

    if (!process.env.ADMIN_DEFAULT) AD.adminSide = "SKIPPED - set ADMIN_DEFAULT to include it";
    else {
      await ap.fill("#ad-pass", process.env.ADMIN_DEFAULT);
      await ap.click("#ad-signin-go");
      await ap.waitForFunction(() => document.querySelectorAll("#ad-mail li").length > 0);
      AD.afterSignIn = await ap.evaluate(`(() => ({
        title: document.title,
        signin: getComputedStyle(document.getElementById("ad-signin")).display,
        desk: getComputedStyle(document.getElementById("ad-desk")).display,
        focused: document.activeElement.id,
        passwordCleared: document.getElementById("ad-pass").value === "",
        items: [...document.querySelectorAll("#ad-mail li")].map(${lines})
      }))()`);

      await ap.click("#ad-send");
      AD.emptySend = await ap.evaluate(() => ({ shown: getComputedStyle(document.getElementById("ad-send-msg")).display,
        text: document.getElementById("ad-send-msg").textContent }));

      await ap.fill("#ad-body", "the first one I wrote you from here" + NL + NL + "a second paragraph");
      AD.counter = await ap.textContent("#ad-count");
      await ap.click("#ad-send");
      await ap.waitForFunction(() => document.getElementById("ad-send-msg").textContent === window.Surprise.CONFIG.admin.sent);
      await ap.waitForFunction(() => (document.querySelector("#ad-mail li") || {}).innerText.indexOf("the first one") >= 0);
      AD.afterSend = await ap.evaluate(`(() => {
        const first = document.querySelector("#ad-mail li");
        return { message: document.getElementById("ad-send-msg").textContent,
          fieldCleared: document.getElementById("ad-body").value === "",
          firstIsHis: first.classList.contains("is-to-her"), first: ${lines}(first),
          paragraphsKept: getComputedStyle(first.querySelector(".ad-text")).whiteSpace };
      })()`);
      AD.herInboxHasIt = await ap.evaluate(async () => (await window.Surprise.Api.getMessages()).messages
        .some(m => m.body.indexOf("the first one") === 0 && m.direction === "to-her"));
      await ap.click("#ad-refresh");
      await ap.waitForTimeout(300);
      AD.newMarksSpentAfterOneLook = await ap.evaluate(() => document.querySelectorAll(".ad-new").length === 0);

      AD.views = {};
      for (const w of [1440, 390]) {
        for (const theme of ["light", "dark"]) {
          // a fresh note from her each time, so the "new" badge is on the page to be measured
          await ap.evaluate(t => window.Surprise.Api.sendMessage("another note from her, " + t), w + " " + theme);
          await ap.setViewportSize({ width: w, height: w === 390 ? 844 : 900 });
          await ap.goto(BASE + "/admin.html", { waitUntil: "load" });
          await ap.evaluate(t => document.documentElement.setAttribute("data-theme", t), theme);
          await ap.waitForFunction(() => document.querySelectorAll(".ad-new").length > 0);
          await finished(ap);   // every page fades in from opacity 0; a shot taken mid-fade looks washed out
          const v = AD.views[w + "-" + theme] = await ap.evaluate(AD_PROBE);
          v.controls = [];
          for (const id of ["ad-signout", "ad-refresh", "ad-send", "ad-body"]) v.controls.push(await adControl(ap, id));
          v.contrastAllPass = v.text.every(t => t.pass);
          v.lowest = Math.min(...v.text.map(t => t.ratio));
          if (OUT) {
            await ap.evaluate(() => window.scrollTo(0, 0));
            await ap.screenshot({ path: path.join(OUT, `admin-${w}-${theme}.png`), fullPage: true });
          }
        }
      }
      await ap.setViewportSize({ width: 1440, height: 900 });

      // his session dies mid-draft (say the password was changed from another device): back to the
      // sign-in, nothing of hers left in the page, and the draft still there once he is back in
      await ap.evaluate(() => { const S = window.Surprise, m = S.Store.getJSON(S.KEYS.mail, {}); m.adminTokens = []; S.Store.setJSON(S.KEYS.mail, m); });
      await ap.fill("#ad-body", "a draft I must not lose");
      await ap.click("#ad-send");
      await ap.waitForFunction(() => getComputedStyle(document.getElementById("ad-signin")).display !== "none");
      AD.sessionLost = await ap.evaluate(() => ({
        signin: getComputedStyle(document.getElementById("ad-signin")).display,
        desk: getComputedStyle(document.getElementById("ad-desk")).display,
        message: document.getElementById("ad-signin-msg").textContent,
        mailLeftInPage: document.querySelectorAll("#ad-mail li").length,
        draftKept: document.getElementById("ad-body").value === "a draft I must not lose"
      }));
      await ap.fill("#ad-user", "admin");
      await ap.fill("#ad-pass", process.env.ADMIN_DEFAULT);
      await ap.click("#ad-signin-go");
      await ap.waitForFunction(() => getComputedStyle(document.getElementById("ad-desk")).display !== "none");
      AD.draftAfterSigningBackIn = await ap.inputValue("#ad-body");

      await ap.click("#ad-signout");
      AD.signOut = await ap.evaluate(() => ({
        signin: getComputedStyle(document.getElementById("ad-signin")).display,
        desk: getComputedStyle(document.getElementById("ad-desk")).display,
        mailLeftInPage: document.querySelectorAll("#ad-mail li").length,
        adminSessionGone: !window.Surprise.Api.admin.signedIn(),
        herSessionUntouched: (window.Surprise.Session.get() || {}).token === "harness-token"
      }));
    }
  }
  await ap.context().close();

  // none of her pages, and none of the scripts they load, points at the admin page
  {
    const fs = require("fs"), root = path.join(__dirname, "..");
    const files = fs.readdirSync(root).filter(f => f.endsWith(".html") && f !== "admin.html")
      .concat(fs.readdirSync(path.join(root, "js")).filter(f => f.endsWith(".js") && f !== "admin.js").map(f => "js/" + f));
    // a link or a string the code could navigate to - comments that name the page are not links
    const pointsAt = src => ['href="admin', "'admin.html'", '"admin.html"', "`admin.html`"].some(s => src.indexOf(s) >= 0);
    AD.linkedFromHerSite = files.filter(f => pointsAt(fs.readFileSync(path.join(root, f), "utf8")));
  }


  // --- inbox.html: her letters, kept as a stack (round three, task 3) ------------------------------------
  // Three letters from him are written straight into the local driver's mail store, a day apart and none opened,
  // so this half needs no admin password. Then: the badge on another page counting them, the stack's order, the
  // newest unopened one open on arrival with its seal off - on the page AND in the store - another one opened by
  // hand, the love note with her reply under it, no form here (she writes from her card, checked after), both themes
  // at 1440 and 390, reduced motion.
  const IB = report.inbox = {};
  const seedMail = pg => pg.evaluate(() => {
    const S = window.Surprise, day = 86400000, now = Date.now(), NL2 = String.fromCharCode(10, 10);
    S.Store.setJSON(S.KEYS.mail, { v: 1, adminTokens: [], replyRead: null, rows: [
      { id: "m-old", direction: "to-her", body: "The oldest of his three.", created: now - 3 * day, readAt: null },
      { id: "m-mid", direction: "to-her", body: "The middle one." + NL2 + "With a second paragraph.", created: now - 2 * day, readAt: null },
      { id: "m-new", direction: "to-her", body: "The newest one.", created: now - day, readAt: null }
    ] });
    S.Store.remove(S.KEYS.unread);
  });
  const stored = (pg, id) => pg.evaluate(i => !!((window.Surprise.Store.getJSON(window.Surprise.KEYS.mail, {}).rows || [])
    .find(r => r.id === i) || {}).readAt, id);
  const IB_PROBE = `(() => {${HELPERS}
    const shown = id => { const el = document.getElementById(id); return el ? getComputedStyle(el).display : "missing"; };
    return {
      theme: document.documentElement.getAttribute("data-theme"),
      hScroll: document.scrollingElement.scrollWidth + "/" + document.scrollingElement.clientWidth,
      stackDirection: getComputedStyle(document.getElementById("mb-stack")).flexDirection,
      // she writes to him from her card only: no form of any kind in the inbox
      formsHere: document.querySelectorAll("#main form, #main textarea, #main .wr").length, yours: shown("mb-yours"),
      text: [
        contrast("#inbox-heading", "heading"), contrast("#mb-sub", "subtitle"),
        contrast(".mb-env-date", "slip date"), contrast(".mb-env-line", "slip line"),
        contrast("#mb-date", "letter date"), contrast(".mb-body p", "his words")
      ]
    };
  })()`;

  const ip = await open();
  const iSeed = await seed(ip);
  if (!iSeed.ok) IB.seedFailed = iSeed;
  else {
    await seedMail(ip);
    // the badge, on a page that is not the inbox: three letters she has not opened
    await ip.goto(BASE + "/profile.html", { waitUntil: "load" });
    await ip.waitForFunction(() => getComputedStyle(document.getElementById("hdr-inbox-badge")).display !== "none", null, { timeout: 6000 }).catch(() => {});
    const badge = () => ip.evaluate(() => { const b = document.getElementById("hdr-inbox-badge");
      return { shown: getComputedStyle(b).display, text: b.textContent, label: document.getElementById("hdr-inbox").getAttribute("aria-label") }; });
    IB.badgeWithThreeSealed = await badge();

    await ip.goto(BASE + "/inbox.html", { waitUntil: "load" });
    await ip.waitForFunction(() => document.querySelectorAll("#mb-stack .mb-env").length === 4);
    await finished(ip);
    IB.arrival = await ip.evaluate(() => ({
      order: [...document.querySelectorAll("#mb-stack .mb-env")].map(b => b.dataset.id),
      open: document.querySelector(".mb-env.is-open").dataset.id,
      sealed: [...document.querySelectorAll("#mb-stack .mb-env.is-sealed")].map(b => b.dataset.id),
      seals: document.querySelectorAll(".mb-seal").length,
      words: document.querySelector(".mb-body").innerText.trim(),
      badgeOnTheInboxItself: getComputedStyle(document.getElementById("hdr-inbox-badge")).display,
      yoursUnderHisLetter: getComputedStyle(document.getElementById("mb-yours")).display,
      countKept: window.Surprise.Store.get(window.Surprise.KEYS.unread, null)
    }));
    IB.arrival.newestMarkedInTheStore = await stored(ip, "m-new");
    IB.arrival.othersStillUnreadInTheStore = !(await stored(ip, "m-old")) && !(await stored(ip, "m-mid"));

    await ip.click('.mb-env[data-id="m-old"]');
    await ip.waitForTimeout(650);
    IB.openedByHand = await ip.evaluate(() => ({
      open: document.querySelector(".mb-env.is-open").dataset.id,
      ariaCurrent: document.querySelector(".mb-env.is-open").getAttribute("aria-current"),
      sealOff: !document.querySelector('.mb-env[data-id="m-old"] .mb-seal'),
      stillSealed: [...document.querySelectorAll("#mb-stack .mb-env.is-sealed")].map(b => b.dataset.id),
      words: document.querySelector(".mb-body").innerText.trim()
    }));
    IB.openedByHand.markedInTheStore = await stored(ip, "m-old");

    await ip.click('.mb-env[data-id="love-note"]');
    await ip.waitForTimeout(650);
    IB.loveNote = await ip.evaluate(`(() => {${HELPERS} return {
      date: document.getElementById("mb-date").textContent,
      paragraphs: document.querySelectorAll(".mb-body p").length,
      greetingFont: getComputedStyle(document.querySelector(".mb-body p")).fontFamily,
      yours: getComputedStyle(document.getElementById("mb-yours")).display,
      reply: document.getElementById("inbox-reply").textContent,
      text: [contrast(".mb-body.is-note p", "greeting"), contrast(".mb-body.is-note p:nth-child(2)", "love note words"),
        contrast(".mb-yours-title", "what-you-wrote title"), contrast("#inbox-reply", "her reply"), contrast("#inbox-when", "her reply's date")] }; })()`);


    // back on her card: one letter left sealed on the badge, and the same form, right there under her card
    await ip.goto(BASE + "/profile.html", { waitUntil: "load" });
    await settled(ip);
    await ip.waitForFunction(() => document.getElementById("hdr-inbox-badge").textContent === "1", null, { timeout: 6000 }).catch(() => {});
    IB.badgeWithOneSealed = await badge();
    await finished(ip);
    const PW = report.profileWrite = {};
    PW.atRest = await ip.evaluate(() => ({ form: getComputedStyle(document.getElementById("pf-write-form")).display,
      sent: getComputedStyle(document.getElementById("pf-write-sent")).display,
      label: document.getElementById("pf-write-label").textContent, pose: document.getElementById("pf-write-me").getAttribute("src"),
      underHerCard: document.getElementById("pf-write").getBoundingClientRect().top >= document.getElementById("pf").getBoundingClientRect().bottom,
      sameWidth: Math.round(document.getElementById("pf-write").getBoundingClientRect().width) === Math.round(document.getElementById("pf").getBoundingClientRect().width) }));
    await ip.click("#pf-write-send");
    PW.emptySend = await ip.evaluate(() => ({ shown: getComputedStyle(document.getElementById("pf-write-msg")).display,
      text: document.getElementById("pf-write-msg").textContent }));
    await ip.fill("#pf-write-text", "hello from her card");
    await ip.click("#pf-write-send");
    await ip.waitForFunction(() => getComputedStyle(document.getElementById("pf-write-sent")).display !== "none");
    await finished(ip);
    PW.sent = await ip.evaluate(`(() => {${HELPERS} return {
      form: getComputedStyle(document.getElementById("pf-write-form")).display,
      sent: getComputedStyle(document.getElementById("pf-write-sent")).display,
      pose: document.getElementById("pf-write-me").getAttribute("src"), alt: document.getElementById("pf-write-me").alt,
      focused: document.activeElement.id, again: control("pf-write-again"),
      text: [contrast("#pf-write-sent-title", "sent title"), contrast("#pf-write-sent-text", "sent line"), contrast("#pf-write-again", "write-another button")] }; })()`);
    PW.inHisInbox = await ip.evaluate(() => (window.Surprise.Store.getJSON(window.Surprise.KEYS.mail, {}).rows || [])
      .some(r => r.direction === "to-me" && r.body === "hello from her card"));
    await ip.click("#pf-write-again");
    PW.writeAnother = await ip.evaluate(() => ({ form: getComputedStyle(document.getElementById("pf-write-form")).display,
      sent: getComputedStyle(document.getElementById("pf-write-sent")).display,
      pose: document.getElementById("pf-write-me").getAttribute("src"), focused: document.activeElement.id }));
    if (OUT) {
      await ip.evaluate(() => document.getElementById("pf-write").scrollIntoView({ block: "center" }));
      await ip.screenshot({ path: path.join(OUT, "profile-write.png") });
    }

    IB.views = {};
    for (const w of [1440, 390]) {
      for (const theme of ["light", "dark"]) {
        await ip.setViewportSize({ width: w, height: w === 390 ? 844 : 900 });
        await ip.goto(BASE + "/inbox.html", { waitUntil: "load" });
        await ip.evaluate(t => document.documentElement.setAttribute("data-theme", t), theme);
        await ip.waitForFunction(() => document.querySelectorAll("#mb-stack .mb-env").length === 4);
        await finished(ip);
        const v = IB.views[w + "-" + theme] = await ip.evaluate(IB_PROBE);
        // every slip in the stack is a real button she can actually hit, at least 44px tall
        v.slips = await ip.evaluate(() => [...document.querySelectorAll(".mb-env")].map(b => {
          b.scrollIntoView({ block: "nearest", inline: "nearest" });
          const r = b.getBoundingClientRect(), top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
          return { id: b.dataset.id, h: Math.round(r.height), hit: top === b || b.contains(top) };
        }));
        v.contrastAllPass = v.text.every(t => t.pass);
        v.lowest = Math.min(...v.text.map(t => t.ratio));
        if (OUT) {
          await ip.evaluate(() => window.scrollTo(0, 0));
          await ip.screenshot({ path: path.join(OUT, `inbox-${w}-${theme}.png`), fullPage: true });
        }
      }
    }
  }
  await ip.context().close();

  {
    const rp = await open({ reducedMotion: "reduce" });
    if ((await seed(rp)).ok) {
      await seedMail(rp);
      await rp.goto(BASE + "/inbox.html", { waitUntil: "load" });
      await rp.waitForFunction(() => document.querySelectorAll("#mb-stack .mb-env").length === 4);
      await rp.click('.mb-env[data-id="m-old"]');
      IB.reducedMotion = await rp.evaluate(() => ({
        running: document.getAnimations().filter(a => String(a.animationName || "").indexOf("mb-") === 0).length,
        allVisible: [...document.querySelectorAll(".mb-head, .mb-item, .mb-reading, .mb-sheet")].every(el => getComputedStyle(el).opacity === "1"),
        sealGoneAtOnce: !document.querySelector('.mb-env[data-id="m-old"] .mb-seal')
      }));
    }
    await rp.context().close();
  }

  // --- the love note on memories.html (round three, task 4) ---------------------------------------------
  // A first arrival, lived through: the envelope falls, the seal is clicked, the letter rises and grows into one
  // portrait sheet, and I arrive beside it. Measured once everything has stopped moving: the sheet's shape and place,
  // nothing to scroll, no reply form anywhere on it, where I stand relative to it (beside it on a wide screen, behind
  // its top edge on a phone), the words visible, the envelope's flap and decorations gone, contrast on every text role.
  // The letter in config.js is long, so it is in pages: each one is read in turn with the next arrow, and every piece
  // of every paragraph must show whole on exactly one page, with Continue only on the last. Then "Continue": the fold
  // must end with the letter's centre on the header's inbox icon, the page must be handed back and the inbox opened.
  // Also a short letter (one sheet, no pages), a long one in a short window, the pages by keyboard, a return visit,
  // and reduced motion.
  const LT = report.letter = {};
  const seedLetter = (pg, seen, theme) => pg.evaluate(({ seen, theme }) => {
    const S = window.Surprise, token = "harness-token";
    const progress = { proposal: true, letter: true, memories: true, accepted: true, inbox: false, profile: false };
    S.Store.setJSON(S.KEYS.account, { v: 1, username: "Aki", displayName: "Aki",
      secret: { alg: "plain-local", salt: "harness", hash: "harness:lighthouse" }, mood: S.MOODS[3].id, iconId: S.ICONS[2].id,
      musicId: null, progress, reply: null, created: Date.now(), tokens: [token] });
    S.Store.setJSON(S.KEYS.progress, progress);
    S.Store.remove(S.KEYS.reply);
    S.Session.start(token);
    if (seen) S.Store.set(S.KEYS.letterSeen, "1"); else S.Store.remove(S.KEYS.letterSeen);
    S.Store.set(S.KEYS.theme, theme);
  }, { seen, theme });
  const LT_PROBE = `(() => {${HELPERS}
    const box = el => { const r = el.getBoundingClientRect(); return { l: Math.round(r.left), t: Math.round(r.top),
      r: Math.round(r.right), b: Math.round(r.bottom), w: Math.round(r.width), h: Math.round(r.height) }; };
    const letter = document.getElementById("letter"), me = document.getElementById("me-arrive");
    const L = box(letter), M = me && getComputedStyle(me).display !== "none" ? box(me) : null;
    // the layer on top just below the paper's top edge, in the middle of where I stand: on a phone I am behind it
    let below = null;
    if (M) { const top = document.elementFromPoint(Math.round(M.l + M.w / 2), L.t + 12);
      below = top ? (letter.contains(top) ? "the letter" : (top.id || top.className || top.tagName)) : null; }
    return {
      vw: innerWidth, vh: innerHeight, letter: L, portrait: L.h > L.w,
      insideViewport: L.t >= 0 && L.b <= innerHeight && L.l >= 0 && L.r <= innerWidth,
      me: M, meIn: !!me && me.classList.contains("is-in"), meSrc: me && me.getAttribute("src"), meAlt: me && me.alt,
      meFullyOnScreen: !!M && M.l >= 0 && M.r <= innerWidth && M.t >= 0,
      onTopJustBelowPaperTopWhereIStand: below,
      flapOpacity: getComputedStyle(document.querySelector(".flap")).opacity,
      wordsOpacity: getComputedStyle(document.getElementById("text")).opacity,
      decorOpacity: [".flowers", ".book"].map(s => getComputedStyle(document.querySelector(s)).opacity).join(" "),
      formsOnTheLetter: document.querySelectorAll("#letter form, #letter textarea, #letter input").length,
      scrolls: (t => t.scrollHeight > t.clientHeight + 1)(document.getElementById("text")),
      font: getComputedStyle(document.getElementById("text")).fontSize,
      fit: getComputedStyle(letter).getPropertyValue("--fit") || "1",
      footOpacity: getComputedStyle(document.querySelector("#letter .foot") || document.getElementById("go")).opacity,
      go: control("go"),
      paged: letter.classList.contains("is-paged"),
      page: (document.querySelector("#leaf-count [aria-hidden]") || {}).textContent || null,
      next: control("leaf-next"),
      // a mouse opened it: focus must not have been moved onto the words, drawing a ring round them
      ringOnTheWords: document.getElementById("text").matches(":focus-visible"),
      text: [contrast("#text p:nth-child(2)", "letter words"), contrast("#text p:first-child", "greeting"),
        contrast("#text p:last-child", "your name"), contrast("#go", "continue button"),
        ...(letter.classList.contains("is-paged") ? [contrast("#leaf-count [aria-hidden]", "page count")] : [])]
    };
  })()`;
  // one page of a letter in pages: every piece of a paragraph that shows lies wholly inside the words' area, nothing
  // cut at the page's edges. Over all the pages, the pieces shown must add up to all the pieces there are.
  const ON_PAGE = `(() => {
    const text = document.getElementById("text"), box = text.getBoundingClientRect(), cs = getComputedStyle(text);
    const inner = { l: box.left + parseFloat(cs.paddingLeft) - 1, r: box.right - parseFloat(cs.paddingRight) + 1,
      t: box.top + parseFloat(cs.paddingTop) - 1, b: box.bottom - parseFloat(cs.paddingBottom) + 1 };
    let all = 0, shown = 0, cut = 0;
    for (const p of text.querySelectorAll("p")) for (const r of p.getClientRects()) {
      all++;
      if (r.right <= box.left || r.left >= box.right) continue;
      if (r.left >= inner.l && r.right <= inner.r && r.top >= inner.t && r.bottom <= inner.b) shown++; else cut++;
    }
    return { page: (document.querySelector("#leaf-count [aria-hidden]") || {}).textContent, all, shown, cut,
      flourish: getComputedStyle(document.getElementById("letter"), "::after").opacity };
  })()`;
  // read a letter in pages to the end with the next arrow; on the last page, Continue is there in its place
  const readToTheEnd = async (pg, shoot) => {
    const pagesRead = [await pg.evaluate(ON_PAGE)];
    for (let i = 0; i < 15 && await pg.evaluate(() => !document.getElementById("leaf-next").hidden); i++) {
      const was = pagesRead[pagesRead.length - 1].page;
      await pg.click("#leaf-next");
      // the turn: the words go (160ms), the page lands, and the fades it starts (words in, the flourish out) begin
      // on the next frames. Wait for the landing, then two frames so those fades exist, then for them to end.
      await pg.waitForFunction(n => (document.querySelector("#leaf-count [aria-hidden]") || {}).textContent !== n, was, { timeout: 5000 });
      await pg.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
      await finished(pg);
      pagesRead.push(await pg.evaluate(ON_PAGE));
    }
    if (shoot) await pg.screenshot({ path: shoot });
    const last = await pg.evaluate(`(() => {${HELPERS}
      return { go: control("go"), nextShown: !document.getElementById("leaf-next").hidden, prev: control("leaf-prev"),
        text: [contrast("#text p:last-child", "your name"), contrast("#go", "continue button")] }; })()`);
    await pg.waitForTimeout(700);     // Continue waits a moment after taking the next arrow's place
    return { pages: pagesRead.length, font: await pg.evaluate(() => getComputedStyle(document.getElementById("text")).fontSize),
      everyPieceWholeOnExactlyOnePage: pagesRead.every(x => !x.cut) && pagesRead.reduce((s, x) => s + x.shown, 0) === pagesRead[0].all,
      flourishOnlyOnTheFirst: pagesRead.map(x => x.flourish).join(" "), pagesRead, last };
  };
  // this context's letter swapped for another, on top of what localmode serves
  const withLetter = (pg, lines) => pg.route(u => u.pathname === "/js/config.js", async route => {
    const r = await route.fetch(); let body = await r.text();
    const a = body.indexOf("  letter: ["), b = body.indexOf("],", a);
    if (a >= 0 && b > a) body = body.slice(0, a) + "  letter: " + JSON.stringify(lines) + body.slice(b + 1);
    return route.fulfill({ response: r, body });
  });
  const meArrived = pg => pg.waitForFunction(() => { const m = document.getElementById("me-arrive");
    return !!m && m.classList.contains("is-in"); }, null, { timeout: 15000 });

  LT.views = {};
  for (const [w, h] of [[1440, 900], [390, 844]]) {
    for (const theme of ["light", "dark"]) {
      const key = w + "-" + theme;
      const lp = await open({ viewport: { width: w, height: h } });
      if (!(await seed(lp)).ok) { LT.views[key] = { seedFailed: true }; await lp.context().close(); continue; }
      await seedLetter(lp, false, theme);
      await lp.goto(BASE + "/memories.html", { waitUntil: "load" });
      await lp.waitForSelector("#seal", { state: "visible" });
      await lp.waitForTimeout(2300);   // the envelope's fall and the notification
      // a click that cannot land is a finding, not a crash: record what the seal looked like and move on
      const clicked = await lp.click("#seal", { timeout: 12000 }).then(() => true, () => false);
      if (!clicked) {
        LT.views[key] = { sealClickFailed: await lp.evaluate(() => { const s = document.getElementById("seal"), r = s.getBoundingClientRect();
          return { disabled: s.disabled, cls: s.className, overHidden: document.getElementById("letter-over").hidden,
            box: [r.left, r.top, r.width, r.height].map(Math.round), display: getComputedStyle(s).display, vis: getComputedStyle(s).visibility,
            atCentre: (document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2) || {}).id || null }; }) };
        await lp.context().close();
        continue;
      }
      await meArrived(lp);
      await finished(lp);
      const v = LT.views[key] = await lp.evaluate(LT_PROBE);
      v.contrastAllPass = v.text.every(t => t.pass);
      v.lowest = Math.min(...v.text.map(t => t.ratio));
      if (OUT) await lp.screenshot({ path: path.join(OUT, `letter-${key}.png`) });
      if (v.paged) {
        const read = await readToTheEnd(lp, OUT && path.join(OUT, `letter-${key}-last.png`));
        v.pagesRead = read.pagesRead.map(x => x.page + ": " + x.shown + " shown, " + x.cut + " cut").join(" | ");
        Object.assign(v, { pages: read.pages, pagedFont: read.font, everyPieceWholeOnExactlyOnePage: read.everyPieceWholeOnExactlyOnePage,
          flourishOnlyOnTheFirst: read.flourishOnlyOnTheFirst, lastPage: read.last });
      }
      if (theme === "light") {
        await lp.click("#go");
        await lp.evaluate(() => Promise.all(document.getElementById("letter").getAnimations().map(a => a.finished.catch(() => {}))));
        v.foldEndsOnTheInboxIcon = await lp.evaluate(() => {
          const a = document.getElementById("letter").getBoundingClientRect(), b = document.getElementById("hdr-inbox").getBoundingClientRect();
          return { dx: Math.round(a.left + a.width / 2 - (b.left + b.width / 2)), dy: Math.round(a.top + a.height / 2 - (b.top + b.height / 2)) };
        });
        await lp.waitForFunction(() => document.getElementById("letter-over").hidden, null, { timeout: 6000 });
        v.afterPuttingItAway = await lp.evaluate(() => ({
          overlay: getComputedStyle(document.getElementById("letter-over")).display,
          galleryInert: document.getElementById("main").inert,
          inboxOpen: window.Surprise.Progress.isUnlocked("inbox"),
          // the account's "answered, left blank" path: the inbox opens, and no words are kept
          keptAsBlank: (window.Surprise.Store.getJSON(window.Surprise.KEYS.reply, null) || {}).text === "",
          profileOpen: window.Surprise.Progress.isUnlocked("profile")
        }));
      }
      await lp.context().close();
    }
  }

  // open the letter as she would, with the mouse on the seal; false if the seal could not be clicked
  const arriveAt = async lp => {
    await seedLetter(lp, false, "light");
    await lp.goto(BASE + "/memories.html", { waitUntil: "load" });
    await lp.waitForSelector("#seal", { state: "visible" });
    await lp.waitForTimeout(2300);
    if (!(await lp.click("#seal", { timeout: 12000 }).then(() => true, () => false))) return false;
    await meArrived(lp);
    await finished(lp);
    return true;
  };
  {
    // a short letter: one sheet, no pages - no arrows, no page count, Continue right there, nothing to scroll
    const lp = await open();
    await withLetter(lp, ["My love,", "Your message goes here: a memory, a promise, something only the two of us would understand.", "Always yours,", "(your name)"]);
    if ((await seed(lp)).ok) {
      if (await arriveAt(lp)) {
        const v = await lp.evaluate(LT_PROBE);
        LT.shortLetter = { paged: v.paged, page: v.page, scrolls: v.scrolls, font: v.font, letter: v.letter, portrait: v.portrait, go: v.go,
          turnsShown: await lp.evaluate(() => ["leaf-prev", "leaf-next", "leaf-count"].filter(id => getComputedStyle(document.getElementById(id)).display !== "none")),
          flourish: await lp.evaluate(() => getComputedStyle(document.getElementById("letter"), "::after").opacity) };
        if (OUT) await lp.screenshot({ path: path.join(OUT, "letter-short.png") });
      } else LT.shortLetter = { sealClickFailed: true };
    }
    await lp.context().close();
  }
  {
    // a long letter (about 200 words) in a short 960x540 window: whole and readable, nothing to scroll - on one
    // sheet if it gently can be, in pages if not
    const lp = await open({ viewport: { width: 960, height: 540 } });
    const para = "I keep thinking about the small things, the way you laugh before the end of your own jokes, the way you hold your cup with both hands when it is cold, the way you say my name when you are half asleep. ";
    await withLetter(lp, ["My love,", para + para, para + "And I wanted you to have all of it written down somewhere you can keep.", para,
      "So this is me, trying to fit a whole year into one page, and failing in the best way.", "Always yours,", "(your name)"]);
    if ((await seed(lp)).ok) {
      if (await arriveAt(lp)) {
        const v = await lp.evaluate(LT_PROBE);
        LT.longLetterShortWindow = { words: await lp.evaluate(() => document.getElementById("text").innerText.trim().split(" ").length),
          letter: v.letter, insideViewport: v.insideViewport, scrolls: v.scrolls, font: v.font, fit: v.fit, paged: v.paged, page: v.page,
          go: v.go, next: v.next, me: v.me };
        if (OUT) await lp.screenshot({ path: path.join(OUT, "letter-long-960x540.png") });
        if (v.paged) {
          const read = await readToTheEnd(lp);
          Object.assign(LT.longLetterShortWindow, { pages: read.pages, everyPieceWholeOnExactlyOnePage: read.everyPieceWholeOnExactlyOnePage,
            lastGo: read.last.go });
        }
      } else LT.longLetterShortWindow = { sealClickFailed: true };
    }
    await lp.context().close();
  }
  {
    // the pages by keyboard: the seal opened with Enter puts focus on the words; the arrow keys turn the pages; Enter
    // held on the next arrow walks to the end and lands on Continue, which does not take the very next Enter (that one
    // was meant for "next") - and a fast double click on "next" from the page before the last does not put it away either
    const lp = await open();
    if ((await seed(lp)).ok) {
      await seedLetter(lp, false, "light");
      await lp.goto(BASE + "/memories.html", { waitUntil: "load" });
      await lp.waitForFunction(() => document.activeElement && document.activeElement.id === "seal", null, { timeout: 8000 }).catch(() => {});
      await lp.keyboard.press("Enter");
      await meArrived(lp);
      await finished(lp);
      const K = LT.keyboard = { paged: await lp.evaluate(() => document.getElementById("letter").classList.contains("is-paged")) };
      const where = () => lp.evaluate(() => ({ page: (document.querySelector("#leaf-count [aria-hidden]") || {}).textContent,
        focus: document.activeElement && (document.activeElement.id || document.activeElement.tagName),
        folding: document.getElementById("letter").classList.contains("folding") }));
      K.afterEnterOnTheSeal = await where();
      await lp.keyboard.press("ArrowRight"); await lp.waitForTimeout(550);
      K.afterArrowRight = await where();
      await lp.keyboard.press("ArrowLeft"); await lp.waitForTimeout(550);
      K.afterArrowLeft = await where();
      await lp.focus("#leaf-next");
      for (let i = 0; i < 15 && await lp.evaluate(() => !document.getElementById("leaf-next").hidden); i++) {
        await lp.keyboard.press("Enter"); await lp.waitForTimeout(450);
      }
      await lp.keyboard.press("Enter"); await lp.waitForTimeout(250);   // at once: meant for "next", not for Continue
      K.atTheEnd = await where();
      await lp.keyboard.press("ArrowLeft"); await lp.waitForTimeout(550);
      // the second click comes 300ms after the first: the page has turned (160ms) and Continue is under the pointer
      await lp.click("#leaf-next"); await lp.waitForTimeout(300);
      const go = await lp.evaluate(() => { const g = document.getElementById("go"); if (g.hidden) return null;
        const r = g.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; });
      if (go) await lp.mouse.click(go[0], go[1]);
      await lp.waitForTimeout(250);
      K.afterADoubleClickOnNext = Object.assign(await where(), { secondClickLandedOnContinue: !!go });
    }
    await lp.context().close();
  }
  {
    // a return visit: the letter is open at once, but the envelope still falls in - I must stand where it lands
    const lp = await open();
    if ((await seed(lp)).ok) {
      await seedLetter(lp, true, "light");
      await lp.goto(BASE + "/memories.html", { waitUntil: "load" });
      await meArrived(lp).catch(() => {});
      await finished(lp);
      const v = await lp.evaluate(LT_PROBE);
      LT.returnVisit = { letter: v.letter, me: v.me, meIn: v.meIn,
        standingOnTheScreensBottomEdge: !!v.me && v.me.b === v.vh,
        overlappingThePapersRightEdge: !!v.me && v.me.l < v.letter.r && v.me.r > v.letter.r };
    }
    await lp.context().close();
  }
  {
    const lp = await open({ reducedMotion: "reduce" });
    if ((await seed(lp)).ok) {
      await seedLetter(lp, false, "light");
      await lp.goto(BASE + "/memories.html", { waitUntil: "load" });
      await lp.waitForSelector("#seal", { state: "visible" });
      await lp.click("#seal");
      await lp.waitForTimeout(2800);   // the choreography's steps still run on their timers; nothing between them moves
      LT.reducedMotion = await lp.evaluate(() => { const me = document.getElementById("me-arrive");
        return { meShown: getComputedStyle(me).display, meIn: me.classList.contains("is-in"), meTransform: getComputedStyle(me).transform,
          wordsOpacity: getComputedStyle(document.getElementById("text")).opacity,
          moving: document.getAnimations().filter(a => a.playState === "running" && a.effect.getComputedTiming().iterations !== Infinity).length }; });
    }
    await lp.context().close();
  }

  {
    // a new sign-up on a browser that has been through the story before (her account reset on the server since, as
    // resetAccount() does; here the local driver's stand-in for the server is the account key). This browser still
    // holds the old account's session, its flags, "the envelope was opened" and its put-away letter. Walked through
    // the real pages - sign-up, the proposal, Yes - the new account's letter must arrive from the start: the envelope
    // falls, "uy may love note!" pops, and nothing of the old account is unlocked.
    const lp = await open();
    if ((await seed(lp)).ok) {
      await lp.evaluate(() => { const S = window.Surprise;
        S.Store.set(S.KEYS.letterSeen, "1"); S.Store.setJSON(S.KEYS.reply, { text: "", timestamp: Date.now() - 86400000 });
        S.Store.set(S.KEYS.unread, "2"); S.Store.remove(S.KEYS.account); });
      const NS = LT.newSignUpOnAUsedBrowser = { before: await lp.evaluate(() => window.Surprise.Progress.read()) };
      await lp.goto(BASE + "/signup.html", { waitUntil: "load" });
      await lp.waitForSelector(".su-mood", { timeout: 10000 });
      await lp.fill("#su-username", "Aki"); await lp.fill("#su-secret", "lighthouse");
      await lp.click(".su-mood >> nth=0"); await lp.click(".su-icon >> nth=0"); await lp.click("#su-continue");
      const reached = await lp.waitForURL(/proposal/, { timeout: 10000 }).then(() => true, () => false);
      if (reached) {
        await lp.waitForSelector("#pr-yes", { state: "visible", timeout: 20000 });
        await lp.waitForTimeout(800);
        await lp.click("#pr-yes");
        await lp.waitForURL(/memories/, { timeout: 15000 });
        NS.onArrival = await lp.evaluate(() => ({ overlay: !document.getElementById("letter-over").hidden,
          alreadyOpen: !!document.querySelector("#scene.read"), letterSeen: localStorage.getItem("surprise-letter-seen"),
          reply: localStorage.getItem("surprise-reply"), unread: localStorage.getItem("surprise-unread") }));
        NS.notification = await lp.waitForFunction(() => { const n = document.getElementById("notif");
          return n && !n.hidden && n.classList.contains("is-in") ? document.getElementById("notif-text").textContent : false; },
          null, { timeout: 6000 }).then(h => h.jsonValue(), () => "never shown");
        NS.after = await lp.evaluate(() => window.Surprise.Progress.read());
      } else NS.signUpFailed = await lp.evaluate(() => (document.getElementById("su-msg") || {}).textContent || location.pathname);
    }
    await lp.context().close();
  }

  // --- the letter's song (CONFIG.song) ------------------------------------------------------------------------
  // Under Chrome's own autoplay rule (a browser of its own, so the rule is set, not assumed). Walked through the real
  // pages: after Yes, the song starts by itself with the notification and fades up to its volume; its button floats
  // above the letter's backdrop and answers there; it keeps playing once the letter is put away, its button back in
  // the header; a clip opening and the music panel opening each fade it out. Opened with no touch behind it, the
  // browser refuses it, and it starts on the seal instead. The audio element is reached through a test-only hook.
  {
    const SG = report.song = {};
    const sb = await chromium.launch({ args: ["--autoplay-policy=document-user-activation-required"] });
    const HOOK = `(() => { const play = HTMLMediaElement.prototype.play; window.__media = [];
      HTMLMediaElement.prototype.play = function () { if (window.__media.indexOf(this) < 0) window.__media.push(this); return play.call(this); }; })();`;
    const songNow = pg => pg.evaluate(() => {
      const a = (window.__media || []).find(m => /music/.test(m.src)), b = document.getElementById("hdr-song");
      if (!a) return { started: false };
      const r = b && b.getBoundingClientRect(), top = r && document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      return { playing: !a.paused, at: +a.currentTime.toFixed(1), volume: +a.volume.toFixed(2),
        button: b ? { label: b.getAttribute("aria-label"), afloat: b.classList.contains("is-afloat"),
          inTheHeader: !!b.closest(".hdr-actions"), clickable: !!top && (top === b || b.contains(top)) } : null };
    });
    const tripwire = async ctx => {
      await ctx.addInitScript(HOOK);
      await ctx.route(u => u.href.indexOf("script.google.com") >= 0, r => { report.liveHostAttempts.push(r.request().url()); r.abort(); });
    };
    try {
      const ctx = await sb.newContext({ viewport: { width: 1440, height: 900 } });
      await tripwire(ctx);
      const sp = await ctx.newPage();
      sp.on("pageerror", e => report.errors.push("song: " + e));
      await sp.goto(BASE + "/index.html?reset=1", { waitUntil: "load" }); await sp.waitForTimeout(300);
      await sp.goto(BASE + "/signup.html", { waitUntil: "load" });
      await sp.waitForSelector(".su-mood", { timeout: 10000 });
      await sp.fill("#su-username", "Aki"); await sp.fill("#su-secret", "lighthouse");
      await sp.click(".su-mood >> nth=0"); await sp.click(".su-icon >> nth=0"); await sp.click("#su-continue");
      await sp.waitForURL(/proposal/, { timeout: 10000 });
      await sp.waitForSelector("#pr-yes", { state: "visible", timeout: 20000 });
      await sp.waitForTimeout(800); await sp.click("#pr-yes");
      await sp.waitForURL(/memories/, { timeout: 15000 });
      await sp.waitForTimeout(1500); SG.beforeTheNotification = await songNow(sp);
      await sp.waitForTimeout(1300); SG.withTheNotification = await songNow(sp);
      await sp.waitForTimeout(3500); SG.fadedUp = await songNow(sp);
      // her button, while the letter is open
      await sp.click("#hdr-song"); await sp.waitForTimeout(1600); SG.pausedWhileReading = await songNow(sp);
      await sp.click("#hdr-song"); await sp.waitForTimeout(700); SG.playingAgain = await songNow(sp);
      // she reads it to the end and puts it away
      await sp.click("#seal");
      await sp.waitForFunction(() => { const m = document.getElementById("me-arrive"); return m && m.classList.contains("is-in"); }, null, { timeout: 15000 });
      for (let i = 0; i < 15 && await sp.evaluate(() => !document.getElementById("leaf-next").hidden); i++) { await sp.click("#leaf-next"); await sp.waitForTimeout(450); }
      await sp.waitForTimeout(800); await sp.click("#go");
      await sp.waitForFunction(() => document.getElementById("letter-over").hidden, null, { timeout: 6000 });
      SG.afterPuttingItAway = await songNow(sp);
      const slot = await sp.$("#grid .slot");
      if (slot) { await slot.click(); await sp.waitForTimeout(1700); SG.whenAClipOpens = await songNow(sp); await sp.keyboard.press("Escape"); await sp.waitForTimeout(500); }
      await sp.click("#hdr-song"); await sp.waitForTimeout(600);
      await sp.click("#tunes"); await sp.waitForTimeout(1700); SG.whenTheMusicPanelOpens = await songNow(sp);
      await ctx.close();

      // straight onto the page in a fresh browser, no touch behind it: refused at the notification, started by the seal
      const ctx2 = await sb.newContext({ viewport: { width: 390, height: 844 } });
      await tripwire(ctx2);
      const sp2 = await ctx2.newPage();
      sp2.on("pageerror", e => report.errors.push("song: " + e));
      if ((await seed(sp2)).ok) {
        await seedLetter(sp2, false, "light");
        const sp3 = await ctx2.newPage();   // a new tab: nothing on this page has been touched
        sp3.on("pageerror", e => report.errors.push("song: " + e));
        await sp2.close();
        await sp3.goto(BASE + "/memories.html", { waitUntil: "load" });
        await sp3.waitForTimeout(2800); SG.noTouchYet = await songNow(sp3);
        await sp3.click("#seal"); await sp3.waitForTimeout(1200); SG.startedByTheSeal = await songNow(sp3);
      }
      await ctx2.close();
    } catch (e) { SG.failed = String(e.message || e); }
    await sb.close();
  }

  console.log(JSON.stringify(report, null, 2));
  await browser.close();
})().catch(e => { console.error("HARNESS FAILED:", e.message || e); process.exit(1); });
