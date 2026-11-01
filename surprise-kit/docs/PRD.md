# PRD: "Would You Like To Open?" (surprise clip-inventory site)

## 1. Summary
A private, one-page website for one viewer (my girlfriend) on her laptop. She clicks a wax seal, a letter comes out of an envelope, then the background unveils an "inventory" of many video clips of the two of us from way back. Videos play inside the page.

## 2. Goals and non-goals
Goals: feel warm, handmade and vintage; work first time on reveal day; easy for me to add or edit clips and wording without touching the design.
Non-goals: accounts or logins, comments, public sharing, phone layout, analytics, monetization.
**Phase 3 exception (approved 2026-10-09):** "accounts or logins" and "comments" are no longer non-goals for the one-time sign-up card and the letter-reply flow in section 4.2. These stay small on purpose: the sign-up is a local, single-viewer profile saved to her browser's localStorage (no server auth, no multi-user accounts, no password), and the letter reply is one private message back to me (not a public comment thread). **Phase 5 exception (APPROVED 2026-10-10):** the "local, single-viewer profile ... no server auth ... no password" limit above is relaxed. There is still exactly ONE account, but it gets a "secret word only we know" (a lightweight password) and, in Phase B, is checked on a small server (section 4.6). Still not goals: multi-user accounts, sign-up for anyone else, comments, public sharing.
Public sharing, analytics and monetization are still non-goals and nothing here changes that. "Phone layout" also remains a non-goal per Decision D below, except the sign-up card itself (4.2), which is explicitly mobile-friendly at my request; every other screen stays desktop-first.

## 3. Audience and context
One viewer, a laptop (16:9), latest Chrome or Edge, opened once as a surprise and maybe revisited. Needs internet.

## 4. Experience
- Scene 1 (done): envelope, pulsing seal; click cracks the seal, flap opens in 3D, letter slides up, Continue.
- Scene 2: the background unveils the clip inventory: a grid of slots with thumbnails, title and date, grouped in tabs/collections (by year, trip, "firsts").
- Scene 3: clicking a slot opens a large modal player inside the page, with a close button and next/previous.

### 4.1 Color themes
Two themes, same layout, chosen by my girlfriend. First load follows the system setting (colorful is the default); a small sun/moon toggle switches and remembers the choice. The pink from the original Canva mockup is retired; the layout and envelope concept stay.

**Light / Colorful mode** (teal palette)
| Token | Hex | Use |
|---|---|---|
| --teal | #5BC2C3 | main background |
| --aqua | #2FD5D6 | bright accent: glows, hover, active tab |
| --mint | #86D3CE | gallery slot fill, secondary surfaces |
| --mist | #BEEBE3 | soft highlights, modal backdrop tint |
| --deep-teal | #22575E | headings, buttons, vignette |
| --ocean | #2CAABA | icons, tab underline |
| --sage | #51897B | secondary accents |
| --cream | #F0EDDA | letter paper, cards |
| --ink | #5C4130 | body and letter text |
| --sand | #B4A87F, #BEC4A7 | envelope and book tones |
| --olive | #898452 | small details (tape, stems) |
| --slate | #8D99A1, #A7B9C1 | borders, muted text, disabled |

**Dark / Minimal Neutral mode**
| Token | Hex | Use |
|---|---|---|
| --bg | #374151 | main background (darker vignette) |
| --line | #6B7280 | borders, dividers |
| --text-muted | #D1D5DB | secondary text |
| --paper | #F3F4F6 | letter paper, cards, headings |
| --ink | #374151 | text on paper |
| --deep | TBD | 5th swatch was hidden in the screenshot; proposed #111827 for vignette and modal backdrop |

Rules:
- All colors are CSS variables, swapped by a `data-theme` attribute; no color is hard-coded in a component.
- Contrast: cream on mid-teal is only about 1.8:1, so headings use --deep-teal (about 6:1 on --mist) or sit on a deep background; body text uses --ink. Check every text/background pair for 4.5:1 (3:1 for large headings).
- The red wax seal stays red in both themes unless I decide otherwise (open question).

### 4.2 Phase 3: sign-up, intro, letter reply (new, approved 2026-10-09)
> PARTLY SUPERSEDED by section 4.5 (APPROVED 2026-10-10): the "Will you be my baby forever?" Yes/No moves off the sign-up card onto its own page, `proposal.html`; the "uy may love note!" top heading becomes a notification; sign-up gains a secret-word field. The reply step, fold-to-inbox and light-up in this section are unchanged.
Adds a one-time sign-up step before Scene 1, and replaces the old "Continue" click with a letter-reply step that lights the page back up into the inventory. Scene 1's seal/flap/letter interaction and Scene 2/3 (inventory + player) are not redesigned, only retimed/re-triggered as noted below.

**Flow:** 0. Sign-up (first visit only) -> 1. Intro / dim-and-unfold -> 2. Scene 1 letter (unchanged) -> 3. Letter reply + inbox -> 4. Light-up + inventory reveal (existing Scene 2/3, unchanged content).

**0. Sign-up card** (the one screen that is mobile-friendly by request; every other screen stays desktop-first per Decision D)
- One centered card, same fonts and the same two palettes as the rest of the site (no new colors; see the constraints below).
- Steps, in order: username (text input, placeholder "baby ko"); "Are you happy?" (5 emoji buttons sad to very happy, single-select, a clear selected state); "Choose an icon" (a grid driven by one `ICONS` array in script.js: `{id, label, file}`, files under `/assets/icons/`, placeholders for now with a code comment marking exactly where real files go); "Choose your music" (a list driven by one `MUSIC` array in script.js: `{id, title, file}`, files under `/assets/music/`, same placeholder-comment convention); final question "Will you be my baby forever?" with Yes/No, where No evades pointer proximity, touch-near and keyboard focus (a simpler move under `prefers-reduced-motion`), and Yes is always easy to reach and is the only way to finish.
- On finishing: the chosen track starts as background audio at about 15% volume, loops, and keeps playing across every later screen, with a mute/unmute control. Browsers that block autoplay must fail silently (wrapped so nothing throws); the mute control still works once she interacts with the page.
- All answers (username, mood, icon id, music id, "yes") save to `localStorage` wrapped in try/catch. A later visit with saved answers skips sign-up. `?reset=1` in the URL clears the saved answers, for testing.

**1. Intro / dim-and-unfold** (after sign-up, before the seal is clickable)
- Heading "uy may love note!" at the top.
- The background dims to a darker shade of the active theme's own palette (derived from the existing tokens via opacity, `color-mix()` or an overlay, defined for both themes - no new hex colors).
- The envelope/letter animates down from the top, then flowers/notes/decorations unfold with a staggered animation.
- The existing red wax seal then opens the letter exactly as Scene 1 already works today (seal -> flap -> letter rise). That interaction is not redesigned.

**2. Letter reply + inbox** (replaces the old "Continue" button)
- Below the existing letter text: ruled blank lines (a textarea styled like the ruled paper) and a "submit sa baby ko" button.
- Settled (2026-10-09): submit is always enabled; when the reply is empty, a gentle inline nudge (e.g. "say anything, or leave it blank") shows instead of blocking submission. See Decisions in docs/board.md.
- On submit: the letter folds/animates up into a small inbox icon fixed top-right with an unread badge; the dimmed background then lights up smoothly to the normal theme colors; the inventory pops in with a staggered animation (replacing the old Continue-triggered unveil).
- Clicking the inbox later re-opens a small view of her saved reply, read back from her own browser's localStorage - this is independent of where the reply is also sent (below), and is never a read of anything stored server-side.
- Settled (2026-10-09): where the reply (and the sign-up answers) go beyond localStorage is a Google Apps Script web app backed by a private Google Sheet in my Drive - see section 4.3. It only accepts new rows; it can never serve a stored reply back to the site, so her letters can't be read through the public URL - only by me, opening the Sheet directly.

**3. Inventory reveal**
- The same inventory behavior (tabs, thumbnails, dates, modal player - FR-4 to FR-10, Scene 2/3) stays as built; only two things change: the trigger (a light-up transition at the end of the letter-reply step, instead of a "Continue" click) and, settled 2026-10-09, the data source - see section 4.3 and section 6. Videos themselves stay on YouTube, played exactly as today.

**Constraints on all of the above (extends section 4.1's rules):**
- Only the existing CSS custom properties / two palettes may be used for any new UI (light: #5BC2C3, #22575E, #F0EDDA, #5C4130; dark: #374151, #6B7280, #D1D5DB, #F3F4F6), switched by `data-theme`, exactly as today. The red wax seal is the only exception and stays as-is. Any hover/selected/shadow/dimmed shade is derived from these tokens via opacity, `color-mix()`, or an overlay - never a new hex value.
- File structure: SUPERSEDED by section 4.4 (proposed multi-page split, pending approval). Until approved: index.html (structure only) / style.css (all styling) / script.js (all logic, including the `CONFIG` wording block and the new `ICONS` and `MUSIC` arrays) - no inline CSS or JS in HTML, no new JS/CSS files. New binary assets live under `/assets/icons/` and `/assets/music/` (placeholders until I supply real files).
- Accessibility: every new control keeps a visible focus state and is keyboard-operable (choosing a mood, an icon, a track, and the Yes/No step included - "No" evading focus must still land somewhere reachable, never trap keyboard users); contrast holds in both themes; every new animation (unfold, dim/light-up, fold-to-inbox, the No dodge) has a non-motion or simpler-motion alternative under `prefers-reduced-motion`.
- Process: Decision E already lets me pre-approve a batch of tasks instead of one-at-a-time review; Phase 3 is planned as one such batch, but tasks stay small (45 minutes or less) so I can still review individually if I choose to.

### 4.3 Data backend: Google Sheets + Apps Script (settled 2026-10-09)
> SUPERSEDED for Phase B by section 4.6 (APPROVED 2026-10-10, reverses board Decision I). This section describes the write-only script that is in the repo today and stays true until Phase B ships. Specifically retired by 4.6: "never returns stored rows" / "no read path of any kind", the "Responses" tab, the published-CSV Memories fetch and `MEMORIES_CSV_URL`, and the `no-cors` fire-and-forget send (login needs a readable response).
Settles what was open in section 12 about where the letter reply goes, and becomes the phase-2 data store for both the sign-up/reply answers and the memories inventory (replacing the Supabase idea in section 7). One Apps Script web app, backed by one private Google Sheet in my own Drive, handles both directions; the Apps Script source lives in the repo under /backend (or /docs) - not in script.js, since it runs on Google's servers, not in her browser.

**Writing: sign-up + letter reply -> Sheet, "Responses" tab**
- The site POSTs to the Apps Script web app URL when sign-up finishes and again when the letter reply is submitted; each write appends one row with a timestamp (schema in section 6.2).
- The script implements only `doPost`. It never returns stored rows, so a reply can never be read back through the public URL - I read replies by opening the Sheet myself, not through the site.
- No API key or secret lives in the repo; the web app URL is the only config value, pasted into script.js, and it only accepts writes.
- Apps Script web apps don't handle CORS preflight well, so the site sends a plain POST (`text/plain` body, or `fetch` with `mode: 'no-cors'`), accepting that the response can't be read back by the browser. If a send fails (offline, blocked, quota), the data stays queued in localStorage and the site retries later automatically; she is never shown an error.
- Basic spam guard: a hidden honeypot field (a real submission never fills it) and a length cap on the reply text; the script drops anything that fails either check.

**Reading: memories inventory <- Sheet, "Memories" tab**
- A second tab (title, note, date, YouTube id, collection - same meaning as clips.json's fields in section 6.1) is published as a CSV and fetched by the site on load, so I can add or edit clips from my phone or from Sheets directly, with no code change and no redeploy.
- If the CSV fetch fails for any reason, the site falls back to the clips.json placeholders already in script.js; FR-3/FR-9 behavior is unchanged either way.

**Setup** (documented step by step in README, per the release task in docs/board.md): create the Sheet with its two tabs; paste in the Apps Script source; deploy it as a web app; copy the resulting URL into one config value in script.js; publish the Memories tab as CSV and copy that URL too. The README also explains, in plain language: Apps Script's quotas/limits, that the first response after the script has sat idle can be slow, and that redeploying as a "new version" keeps the same web app URL while a "new deployment" issues a new one (which would mean updating script.js's config value).

### 4.4 Multi-page structure (APPROVED 2026-10-09; see docs/board.md Phase 4)
Turns the one-page experience into an "official" multi-page site with the same scenes, in this order of unlocking.
- Pages (plain static HTML, no build step, relative links): `index.html` sign-up; `letter.html` intro, seal, letter, reply, fold-to-inbox, light-up and a button to memories; `memories.html` the clip inventory (collection filters, numbered slots, YouTube player); `inbox.html` her saved reply.
- Shared: one `style.css` (the two palettes stay CSS variables on `data-theme`); `js/config.js` (all wording, `ICONS`, `MUSIC`), `js/common.js` (theme, storage helpers, music, header, guards, page fade), and one file per page (`signup.js`, `letter.js`, `memories.js`, `inbox.js`) loaded only on that page. Classic scripts, not ES modules, so it also works opened from a folder (section 7's "ES-module" wording is relaxed to this). No inline CSS or JS in any HTML file.
- Header on every page after sign-up: brand text (from CONFIG, script font) left; Letter / Memories / Inbox links centre, locked (greyed, not hidden) until unlocked; inbox icon with badge, mute button and theme toggle right. Simple footer with editable placeholder text; no invented personal content. Per-page titles, SVG favicon, meta tags; short fade between pages.
- State in localStorage (try/catch): sign-up answers, reply, `surprise-progress` unlock flags, music `{track, time, muted}`. Unlock rules: letter after sign-up Yes; memories and inbox after the reply. Guards redirect out-of-order visits to the right page. `?reset=1` clears everything.
- Music: saved track/time/muted resume at about 15% volume on the next page, with a small "tap to resume music" header button when the browser blocks autoplay. A page change always causes a brief audible gap; truly gapless playback is not possible without single-page navigation.
- Layout: laptop-first (tested at 1366x768, 1440x900, 1920x1080); below about 900px pages stack to one column and nothing more.
- Data backend (section 4.3) and the Phase 3 behaviours are unchanged.
- **Phase 5 changes (APPROVED 2026-10-10):** two more pages, `proposal.html` and `login.html`, so the order is `index.html` (sign-up, or login if an account exists) -> `proposal.html` -> `letter.html` -> `memories.html` (+ `inbox.html`). New files `js/proposal.js`, `js/login.js`, `js/nodge.js` (the No-button physics moved out of `signup.js`), `js/api.js` (all storage/backend calls). The header/nav is hidden on index, login and proposal (only the theme toggle and mute button show). Progress adds `proposal` and an `accepted` flag: proposal after sign-up/login; letter after `accepted`; memories + inbox after the reply. See 4.5.

### 4.5 Phase 5: sign-up, login, proposal, falling letter (APPROVED 2026-10-10; built in Phase A on localStorage, then Phase B moves it to the server)
Laptop-first (1366x768, 1440x900, 1920x1080); below about 900px pages stack to one column. Same fonts and the same two palettes (CSS variables only; the red wax seal is the one exception). Every animation has a `prefers-reduced-motion` alternative; focus states and contrast hold in both themes. No invented personal content: letter, icons, music, clips and the notification sound stay placeholders.

**Sign-up (`index.html`)**: the "Will you be my baby forever?" question and Yes/No buttons are removed. Fields: username (placeholder "baby ko"), five mood emoji, icon, music, and a new "a secret word only we know" field with a small editable hint (CONFIG). "Continue" validates gently (a sweet message pointing at the first missing field), saves her answers, starts the chosen music and fades to `proposal.html`. If an account already exists, `index.html` shows the login instead of the sign-up (Phase A: simulated in localStorage; Phase B: asked of the server, so it also works on a new device or private window). Only one account can exist; once it does, sign-up is refused for everyone.

**Login (`login.html`)**: same card style, "welcome back" in the script font, username + secret word, "Continue". A wrong guess gets a sweet message. A small "not me / start fresh" link asks for confirmation; in Phase B it clears only this device's saved session, never the server account. After a successful login: load her saved profile and progress, resume her chosen music, go to the last page she unlocked (the furthest of proposal, letter, memories).

**Proposal (`proposal.html`)**: full-screen, centred. A dimmed, shaded version of the current theme background (derived from existing tokens, no new colors), a soft glow behind the text, slow floating petals/hearts in palette colors. Lines reveal slowly, one by one, large in the script font (Dancing Script): "hi baby," then a beat, then "will you be my baby forever?". The exact wording and timing sit in one CONFIG value, with a flag to use her saved username instead of "baby" (default off). Then the buttons appear: a big Yes with a gentle pulsing glow and the dodging No. No starts still beside Yes, visible in both themes; it dodges only when the pointer comes within about 90-110px, with smooth curved glides (about 300-500 ms, steps of about 120-220px, no jitter), always fully inside the viewport, never over Yes or any other element, never catchable by the pointer; keyboard focus moves it smoothly; reduced motion uses a simple smooth fade to a nearby spot. After several dodges No shrinks a little, Yes grows slightly and a cheeky line ("are you sure, baby?", editable) appears. Tunables sit in the CONFIG file with comments. On Yes: a short celebration (hearts/petals bursting from the button), the text becomes a sweet confirmation line (editable), then a fade into `letter.html`; `accepted = true` is saved. Guards: `proposal.html` needs a finished sign-up; `letter.html` needs `accepted`.

**Letter (`letter.html`)**: the page stays dimmed. The envelope/letter falls from the top with a natural bounce and a slight sway as it settles, and the flowers, notes and decorations unfold around it. Then a phone-style notification slides in from the top ("uy may love note!", editable) with a small envelope icon and disappears after a few seconds or when clicked; an optional notification sound uses a placeholder path under /assets and is silent if the file is missing. After that the seal, letter pop-up, reply lines, "submit sa baby ko", fold into the inbox, light-up and memories reveal work as they do today (section 4.2).

**General**: music keeps resuming across pages (track, playback time and mute state saved; if autoplay is blocked, a small "tap to resume music" button). `?reset=1` keeps working from any page, and so does a `#reset` URL hash (the hash survives a dev server that strips the query).

### 4.6 Data backend v2: Google Sheets + Apps Script with accounts (APPROVED 2026-10-10; Phase B; reverses board Decision I)
One Apps Script web app (`backend/Code.gs`) attached to a Sheet the user creates blank. `setup()` creates the tabs and header rows. **This deliberately adds a read path** that section 4.3 forbade: her profile and reply can be read back, but only with a valid session token.
- **Actions** (POST, `text/plain` body so no CORS preflight; anything else is ignored): `status` (does an account exist?), `signup` (refused if an account exists), `login`, `saveProgress`, `saveReply`, `getProfile`, `getMemories`. Inputs are validated and length-limited.
- **Secret word**: stored only as a salted hash; the salt lives in Script Properties, never in the code, the Sheet or the repo. A lockout follows several wrong attempts in a row. A successful login returns a random session token; only its hash and an expiry are stored. `saveProgress`, `saveReply` and `getProfile` require a valid token; no hash or personal data is ever returned without one. `getMemories` needs no login and returns only the Memories tab.
- **Site side**: one client module `js/api.js` with one config value for the Web app URL; `fetch` POST, redirect handling, safe JSON parse; the token lives in localStorage on that device and is cleared on logout. A failed request shows a gentle message, keeps what she typed, retries quietly and never shows a raw error; a small loading state covers the slow first request. Her answers, `accepted`, reply and unlocked pages follow her to any device. If the URL is blank, the local (Phase A) driver is used for development.
- **Sheet tabs**: `Account` (username, secret hash, mood, icon, music, accepted, unlocked pages, reply, reply time, created time) and `Memories` (title, note, date, youtubeId, collection, order). The old `Responses` tab and the published-CSV step are retired.
- **Honest limits (also stated in docs/backend-setup.md)**: this protects only as much as a username plus a short secret word can. The Web app URL is visible in the site's source. Apps Script offers fast SHA-256 only, so a short word hashed once is weak against offline guessing if someone obtains both the Sheet and the salt; keeping the salt in Script Properties means a leaked Sheet alone is not enough, but anyone with access to the Google account sees everything, including her reply. The lockout is global (one account), so a stranger with the URL could briefly lock her out. `getMemories` is public. This is proportionate for one private surprise and is not strong authentication.

## 5. Functional requirements
| ID | Requirement |
|---|---|
| FR-1 | Scene 1 as built; all wording lives in the CONFIG block in script.js |
| FR-2 | Continue transitions smoothly to the gallery |
| FR-3 | Gallery renders slots from clips.json (no clip data hard-coded in HTML) |
| FR-4 | Collections/tabs filter the grid; scroll or paginate for 100+ clips |
| FR-5 | Thumbnails come from the YouTube video ID and load lazily |
| FR-6 | The video player loads only after a slot is clicked (never 100 players at once) |
| FR-7 | Modal: play, close (Esc and button), next/previous, keyboard accessible |
| FR-8 | If a video fails to load, show its caption and an "open on YouTube" link |
| FR-9 | Adding a clip = adding one entry to clips.json; no code changes |
| FR-10 | Letter text, heading and collection names editable in one place |
| FR-11 | Two themes (colorful and minimal neutral) via CSS variables; toggle button; follows system setting on first load; choice remembered (wrap storage access in try/catch) |

## 6. Data model

### 6.1 Memories: clips.json (fallback) and the "Memories" CSV tab (primary, phase 2, section 4.3)
```json
{
  "collections": [{ "id": "2023", "title": "2023", "icon": "🌸" }],
  "clips": [{
    "id": "c001",
    "youtubeId": "XXXXXXXXXXX",
    "title": "First trip",
    "date": "2023-05-14",
    "caption": "One line only she will understand",
    "collection": "2023",
    "startSeconds": 0
  }]
}
```
Rules: id unique; youtubeId is 11 characters; date is ISO; every clip has a collection that exists.

The "Memories" Sheet tab (published as CSV, fetched by the site per 4.3) carries the same fields under one header row: `title, note, date, youtubeId, collection` (PROPOSED Phase 5 adds an `order` column, section 4.6; `note` = clips.json's `caption`; the row's position stands in for `id`; collections are implied by the `collection` column, not a separate list). If the CSV can't be fetched, the site uses the clips.json placeholders instead - same rules apply to both.

### 6.2 Responses: sign-up + letter reply (Sheet tab "Responses", section 4.3)
> SUPERSEDED in Phase B (PROPOSED): replaced by the single-row "Account" tab in section 4.6 (username, secret hash, mood, icon, music, accepted, unlocked pages, reply, reply time, created time). Remains true of the current code until Phase B ships.
One row per write, appended by the Apps Script `doPost`, each with a server-side timestamp:
- Sign-up row: `timestamp, type="signup", username, mood, iconId, musicId, yes=true`.
- Reply row: `timestamp, type="reply", username, reply` (reply text, after the honeypot and length-cap checks).
The sheet never exposes these rows back to the site - they are read only by me, by opening the Sheet.

## 7. Tech stack
| Layer | Choice | Why |
|---|---|---|
| Frontend | Plain HTML, CSS, JavaScript, no build step; multi-page with classic shared scripts (section 4.4, proposed) | Nothing to break on reveal day; easy to edit; works from a folder |
| Data (phase 1, fallback) | clips.json in the repo | 100 to 500 clips is tiny; loads instantly; no server; used if the CSV fetch below fails |
| Data (phase 2, settled 2026-10-09; Phase 5 Phase B PROPOSED to replace the write-only Responses design with the accounts design in section 4.6, adding reads behind a session token) | Google Sheets (private, in my own Drive) + one Google Apps Script web app: `doPost` appends sign-up/reply rows to a "Responses" tab (write-only, never serves them back); a "Memories" tab is published as CSV and fetched by the site for clips (section 4.3, section 6) | Free, no server to host; I can add clips from my phone without redeploying; replies stay private since the script can't be asked to return them; replaces the earlier Supabase idea and the three delivery options once listed in section 12 |
| Video | Unlisted YouTube, embedded with the IFrame Player API on youtube-nocookie.com | Free, handles large or long clips |
| Thumbnails | img.youtube.com/vi/{id}/hqdefault.jpg | No images to make by hand |
| Repo | GitHub, private | Nobody sees clips.json or the Apps Script URL early |
| Hosting | Cloudflare Pages, Netlify or Vercel, auto-deploy from GitHub | Free and works with private repos. GitHub Pages needs a public repo on free accounts, so avoid it |
| Tooling | VS Code, with the test scripts in tools/ (run through tools/localmode.js, so a test never reaches the live Sheet) | Repeatable workflow, safe testing |

Why no database first (phase 1): a JSON file is faster, free and cannot go down. Phase 2 (Google Sheets + Apps Script, section 4.3) is now the settled choice for both the Memories data and the sign-up/reply data - clips.json stays only as the fallback if the published CSV can't be fetched.

## 8. Non-functional requirements
- Performance: lazy thumbnails, player loads on click, first paint under 2 seconds on wifi.
- Accessibility: body text contrast of at least 4.5:1 (use --ink), keyboard focus visible, Esc closes the modal, reduced motion respected.
- Privacy (PROPOSED Phase 5 note: the web app can now return her profile/reply to a valid session, and the Memories list to anyone with the URL; see 4.6): unlisted videos, private repo, `noindex` meta tag and robots.txt, link shared with nobody else. Unlisted is obscurity, not security.
- Reliability: works offline-tolerant messages; fallback when YouTube is blocked.
- Browsers: latest Chrome and Edge; test in the browser she actually uses.

## 9. Milestones
1. M1: Scene 1 (done)
2. M2: Gallery grid from sample clips.json
3. M3: Modal player, next/previous
4. M4: Import real clips and collections
5. M5: Both themes with toggle, real letter, Canva font, final polish
6. M6: Deploy, test on her laptop's browser and wifi
7. M7: Reveal-day checklist

## 10. Acceptance criteria
- From a cold load, the seal click to the readable letter works with no visible glitches.
- The gallery shows all clips; changing clips.json changes the gallery with no code edits.
- Any clip plays in the modal in under 3 seconds on wifi, and closes with Esc.
- No console errors; no clip data appears in HTML or JS.
- A stranger with no link cannot find the site through search.

## 11. Risks
- Copyrighted music can get clips muted or blocked: test a few early.
- YouTube limits uploads on new accounts: upload in batches over several days.
- Link leaks or is opened early: keep repo and link private.
- Autoplay with sound is blocked by browsers: she clicks play.
- Bad wifi on reveal day: test beforehand, keep a backup on a phone hotspot.
- Apps Script web app (section 4.3) can respond slowly on its first request after sitting idle, and has daily quotas: test beforehand; redeploy as a "new version" (not a "new deployment") so script.js's config URL doesn't need updating, and nothing she does ever shows an error either way (failed sends just retry later from localStorage).

- (PROPOSED Phase 5) The Web app URL is visible in the site source; a short secret word hashed with fast SHA-256 is weak against offline guessing if the Sheet and salt both leak; a stranger could trigger the global lockout. Accepted as proportionate for one private surprise (section 4.6).
- (PROPOSED Phase 5) Moving the No-button physics to proposal.html could regress a heavily tuned interaction: move first, retune second, re-run the measured checks.

## 12. Open questions
- Exact Canva heading font name.
- Fifth swatch of the Minimal Neutral palette (hidden in the screenshot).
- Wax seal: keep red, or use the palette brown #5C4130.
- Which theme is the default when her system is set to dark.
- Gallery style: game-inventory slots or pinned polaroids.
- Number of clips and how to group them.
- Deployment target: Cloudflare Pages, Netlify or Vercel.
- Phase 3 - real files for /assets/icons/ and /assets/music/ are placeholders until I supply them.
- (Phase 5, SETTLED 2026-10-10) Decision I reversal approved; secret word trimmed + lowercased; proposal/notification wording and No tunables live in js/config.js; backend/SETUP.md and the Responses tab retire with Phase B; the old test profile is wiped once on first load of the new build; No keeps its continuous physics, retuned rather than rebuilt as hops; lockout is 5 wrong tries then ~5 minutes. Still open: a real notification-sound file (placeholder until supplied).

Settled, no longer open (2026-10-09, see section 4.2, 4.3 and docs/board.md Decisions): the letter-reply submit button (always enabled, gentle nudge when empty) and where the letter reply and sign-up answers are delivered (Google Apps Script web app + private Google Sheet, write-only).
