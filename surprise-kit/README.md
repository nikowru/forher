# Would You Like To Open?

A private four-page surprise: she signs up, an intro plays, she clicks the wax seal, reads the letter, writes a reply, then the page lights up and opens an inventory of video clips that play right inside the page.

Plain HTML, CSS and JavaScript. There's no build step and nothing to install for the site itself. One optional piece — a Google Sheet, for saving her sign-up/reply and for editing the clip inventory without redeploying — is covered in its own section below.

### Pages

She moves through them in order, and each one unlocks the next. Opening one early just redirects her back to where she should be.

| Page | What it is |
|---|---|
| `index.html` | The sign-up: her name, a secret word, mood, icon and music. Once an account exists, this sends her to the login instead. |
| `login.html` | "Welcome back" — her username and secret word, so she can pick up where she left off |
| `proposal.html` | "will you be my baby forever?" — the reveal, the dodging No, and the Yes |
| `letter.html` | The letter falling in, the notification, the seal, and her reply |
| `memories.html` | The clip inventory, with collection tabs and the video player |
| `inbox.html` | What she wrote, kept for her to re-read |

### Everything else

| File | What it holds |
|---|---|
| `style.css` | All styling for every page. Both color themes are CSS variables at the top. |
| `js/config.js` | **Edit wording here.** The `CONFIG` block, plus the `ICONS`, `MOODS` and `MUSIC` lists and the No-button tunables. |
| `js/common.js` | Shared behavior: storage, progress and page guards, music across pages, the header and footer, page fades, `?reset=1` |
| `js/api.js` | Every read and write goes through here. Blank URL = it all stays in her browser; URL set = the Sheet is the only store. |
| `js/nodge.js` | The dodging "No" button |
| `js/signup.js`, `js/login.js`, `js/proposal.js`, `js/letter.js`, `js/memories.js`, `js/inbox.js` | One file per page, loaded only by that page |
| `clips.json` | Fallback clip list, used if the Memories sheet isn't set up (or its fetch fails) |
| `assets/icons/` | Icon images for the sign-up "choose an icon" step |
| `assets/music/` | Audio tracks for the sign-up "choose your music" step |
| `assets/favicon.svg` | The little envelope in the tab |
| `backend/Code.gs` | The optional Google Apps Script backend — see "Save her answers to a Google Sheet" below |
| `docs/backend-setup.md` | Step-by-step setup for the Sheet + Apps Script |
| `robots.txt` | Asks search engines to stay away |
| `docs/` | `PRD.md` (the spec) and `board.md` (task board) |

Each page loads `js/config.js`, then `js/common.js`, then `js/api.js`, then its own file. They're ordinary scripts sharing one `Surprise` object — deliberately not ES modules, so the pages still work when opened straight from a folder.

## Run it locally

Double-clicking `index.html` works for the sign-up and the letter, but **the memories page stays empty**, because browsers won't let a double-clicked page read `clips.json`. Use a small local server instead — and definitely use one for the real thing.

**Option A: VS Code.** Install the **Live Server** extension, open the `surprise-kit` folder, right-click `index.html`, and choose **Open with Live Server**.

**Option B: terminal** (needs [Node.js](https://nodejs.org)):

```sh
cd surprise-kit
npx serve
```

Then open the address it prints (usually http://localhost:3000).

To try the other theme, use the sun/moon button in the top right. To reset to "follow my system setting", run `localStorage.clear()` in the browser console.

To start the whole thing over while testing, add `?reset=1` to the address, e.g. `http://localhost:3000/?reset=1`. That clears her answers, her reply and which pages she's unlocked, and puts her back on a fresh sign-up — but it deliberately keeps your light/dark choice.

Because the pages unlock in order, opening `letter.html` or `memories.html` directly before she's got there will just send you back to the right page. That's the guard working, not a bug.

## Edit the wording

Everything she reads is in the `CONFIG` block at the top of `js/config.js`:

```js
const CONFIG = {
  pageTitle: "A little something for you", // text on the browser tab
  heading: "Would You Like To Open?",   // big title on the envelope screen
  hint: "A little something for you",   // small line under the envelope
  letter: ["My love,", "...", "Always yours,", "(your name)"], // one string per paragraph
  button: "Continue",                   // kept for compatibility; the button itself is hidden now (see below)
  gallery: { title, sub, all, empty, error },     // gallery heading, subtitle, "All" tab, messages
  player:  { close, previous, next, unavailable, openOnYouTube }, // player labels and fallback text
  labels:  { theme, seal, collections, letter },                  // read aloud by screen readers only
  signup:  { title, usernameLabel, usernamePlaceholder, moodLabel, iconLabel, musicLabel,
             finalQuestion, yes, no, missing: { username, mood, icon, music } }, // sign-up card + its gentle prompts
  intro:   { heading },                 // "uy may love note!" — shown right after sign-up
  reply:   { label, placeholder, submit, nudge, toMemories, inboxTitle, inboxEmpty }, // reply lines + inbox page
  music:   { resume, mute, unmute },    // the header's music buttons
  site:    { brand, footer, titles: {...}, nav: {...}, locked: {...}, labels: {...} } // header, footer, tab titles
};
```

- **Letter:** each string in `letter` is one paragraph. Long letters are fine, because the paper scrolls.
- **Quotes:** keep the quotation marks and commas. A missing comma breaks the page. If something stops working, check the browser console (F12).
- **Header and footer:** `site.brand` is the little title top-left, `site.footer` is the footer line, `site.nav` are the three link labels, and `site.titles` are the browser-tab titles per page. `site.locked` is the gentle note she sees if she clicks a page she hasn't reached yet.
- **The old "Continue" button:** gone from view — submitting her reply is what opens the memories now.

## Edit the sign-up, intro and reply screens

All their wording is in the same `CONFIG` block as above (`CONFIG.signup`, `CONFIG.intro`, `CONFIG.reply`) — edit it the same way.

**Icons** (the "choose an icon" grid): edit the `ICONS` array in `js/config.js`:

```js
const ICONS = [
  { id: "icon-1", label: "One", file: "assets/icons/icon-1.svg" },
  // ...
];
```

Drop your own image files into `assets/icons/` and point `file` at them (any image format works — svg, png, jpg). `label` is read aloud by screen readers, so make it describe the icon, not just a number. `id` is what gets saved/sent, so keep it unique and stable once she's used the site.

**Music** (the "choose your music" list): edit the `MUSIC` array the same way, just below `ICONS`:

```js
const MUSIC = [
  { id: "track-1", title: "Track 1 (placeholder)", file: "assets/music/track-1.wav" },
  // ...
];
```

Drop real audio files into `assets/music/` (mp3, ogg or wav all work) and update `file`/`title`. The placeholders there now are silent files, just so the page never shows a broken-file error before you've added real tracks — replace them whenever you like. The chosen track loops quietly (15% volume) across every later screen; she can mute it with the button next to the theme toggle.

**The "No" button:** dodges the pointer, touch and keyboard focus on purpose (it's part of the "Will you be my baby forever?" bit) — there's nothing to configure here, just know it's intentional if you see it move while testing. It sits still until she actually goes near it. If you want to tune how it feels, the values are at the top of `js/config.js` (`NO_RADIUS`, `NO_FLEE_ACCEL`, `NO_CURVE`, `NO_DAMPING` and friends, each with a sensible range in a comment).

### How the music behaves between pages

Worth knowing, because it's a real limitation rather than a bug: moving to a new page destroys the audio element, so the track **cannot** play seamlessly across a navigation. Instead the site saves the track and position as she goes and picks it up on the next page, which means a gap of roughly half a second each time she moves.

Separately, browsers decide for themselves whether a page is allowed to start audio on its own. Chrome and Edge usually allow it once she's interacted with the site; Firefox and Safari often don't. When a browser refuses, she gets a small **"tap to resume music"** button in the header instead of an error or silence she can't fix. Worth testing in the browser she actually uses.

## Add or change clips

There are two ways to feed the inventory. If you've set up the Google Sheet (see the next section), its **Memories** tab is the real source — add a row there and reload the site, no code changes or redeploys needed. `clips.json` is the fallback used only when the Memories sheet isn't set up yet, or if it fails to load — keep it updated too if you want a working inventory before you bother with the Sheet.

### Option A: the Memories sheet (no redeploy needed)

Once [`docs/backend-setup.md`](docs/backend-setup.md) is done and `APPS_SCRIPT_URL` is filled in in `js/config.js`, just add a row to the **Memories** tab: `title | note | date | youtubeId | collection | order` — same rules as the table below (`date` as `YYYY-MM-DD`, `youtubeId` the bare 11-character id, `collection` matching one you are already using). The site builds its tabs from whatever collection names appear in the sheet, so a brand-new one just works, and `order` sets the sequence.

### Option B: clips.json (needs a redeploy)

Adding a clip means adding one entry; no code changes.

```json
{
  "collections": [
    { "id": "2023", "title": "2023", "icon": "🌸" }
  ],
  "clips": [
    {
      "id": "c009",
      "youtubeId": "dQw4w9WgXcQ",
      "title": "First trip",
      "date": "2023-05-14",
      "caption": "One line only she will understand",
      "collection": "2023",
      "startSeconds": 0
    }
  ]
}
```

| Field | Rule |
|---|---|
| `id` | Unique, for example `c009`, `c010` |
| `youtubeId` | The 11-character video ID (see below) |
| `title` | Shown on the slot and in the player |
| `date` | `YYYY-MM-DD` |
| `caption` | One line, shown under the video |
| `collection` | Must match an `id` in `collections`. That's what the tabs are. |
| `startSeconds` | Where playback starts. Use `0` for the beginning. |

- **Order:** slots appear in the same order as the list.
- **Collections:** a new collection only needs an entry in `collections`. Its tab appears automatically.
- **Icon:** optional.
- **Typos:** open the browser console (F12) after editing. A duplicate id, a wrong-length video ID, a bad date or an unknown collection each shows a yellow warning naming the clip.

### Getting the video ID from a YouTube link

| Link | ID |
|---|---|
| `https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=10s` | `dQw4w9WgXcQ` (the part after `v=`, up to any `&`) |
| `https://youtu.be/dQw4w9WgXcQ?si=abc` | `dQw4w9WgXcQ` (the part after `youtu.be/`, up to any `?`) |
| `https://www.youtube.com/shorts/dQw4w9WgXcQ` | `dQw4w9WgXcQ` (the part after `shorts/`) |

### YouTube tips

- **Visibility:** upload as **Unlisted**, not Private. Private videos won't play for her.
- **Embedding:** must be **allowed**. In YouTube Studio, open the video, then **Details**, **Show more**, and tick **Allow embedding**.
- **Other people's videos:** these, especially music videos, often turn embedding off, so the IDs in the examples above may not play here. Your own uploads with embedding allowed will.
- **Music:** copyrighted music can get a clip blocked from playing on other sites. If that happens, the player shows the caption and an **Open on YouTube** button instead, so nothing breaks. Still, test every clip before the reveal.
- **Medal clips:** not supported yet. The page only plays YouTube.

The placeholder clips use the fake ID `XXXXXXXXXXX`, so they show an empty thumbnail and the "can't play here" message until you replace them.

## Change the look

- **Colors:** both themes are the token blocks at the top of `style.css`: light/colorful first, then dark/minimal. The dark values appear twice on purpose (one for the toggle, one for the system setting), so change both copies.
- **Heading font:** Pinyon Script is a stand-in. To swap in another Google Font:
  1. Change the font link in `index.html`.
  2. Replace `'Pinyon Script'` everywhere in `style.css`. It's used for the main title, the gallery title and the clip title in the player.

## Save her answers to a Google Sheet (optional)

By default everything lives in her own browser's storage — fine for testing, but it's lost if she clears her browser, and it doesn't follow her to another device. A free Google Sheet + Apps Script fixes that: her answers, her progress and her reply live in a Sheet in your own Drive, so she can open the site anywhere and carry on.

**Full step-by-step instructions are in [`docs/backend-setup.md`](docs/backend-setup.md).** Short version:

1. Create a **blank** Google Sheet.
2. **Extensions → Apps Script**, paste in `backend/Code.gs`, save.
3. Run the `setup` function once and approve the permissions. It builds the `Account` and `Memories` tabs and generates the salt for you.
4. **Deploy → New deployment → Web app**, with **Execute as: Me** and **Who has access: Anyone**. Copy the `/exec` URL.
5. Paste it into `APPS_SCRIPT_URL` at the top of `js/config.js`. That one value is the whole switch.

A few things worth knowing:

- **One account, ever.** The first sign-up claims it; after that the script refuses a second one and the site shows the login instead. She gets back in with her username and secret word.
- **The secret word is never stored in readable form** — only a salted SHA-256 hash, with the salt kept in Script Properties, out of this repo. Be clear-eyed about what that buys you though: it's a username and a secret word, not real security. See the "limits, honestly" section of the setup doc.
- **No keys or secrets in the repo.** `APPS_SCRIPT_URL` ships blank, and the only thing you ever paste in is the deployed URL — which is necessarily visible in the page source anyway. That's why the script returns nothing personal without a valid session.
- **The clip list is public, her letter is not.** Anyone with the URL can fetch the Memories rows; her profile and reply need a session token.
- **Leave `APPS_SCRIPT_URL` blank** if you don't want any of this — the site works exactly the same, just confined to her browser, and the inventory uses `clips.json`.
- **If a request fails,** she sees a warm message and keeps whatever she typed; the site retries quietly. It never shows a raw error. The first request after a quiet spell takes a few seconds while Google wakes the script, so there's a loading state.
- **Redeploying after you edit the script:** use **Deploy → Manage deployments → pencil → New version**, not "New deployment" — that keeps the same URL so you don't touch `js/config.js` again.
- **Testing:** `?reset=1` or `#reset` only clears *that browser*. To clear the account itself, run the `resetAccount` function in the Apps Script editor.

## Deploy (private)

1. **Keep the GitHub repo private.**
   - **Why:** anyone who can see the repo can read the letter and the clip list.
   - **Not GitHub Pages:** its free plan needs a public repo, so use one of the hosts below. All three have free plans that deploy from a private repo.
2. **Connect the repo to one host.** The site lives in the `surprise-kit` folder of the repo, and there is no build step:

| Host | Settings |
|---|---|
| Cloudflare Pages | Framework preset **None**, build command *empty*, build output directory `surprise-kit` |
| Netlify | Base directory `surprise-kit`, build command *empty*, publish directory `surprise-kit` |
| Vercel | Root directory `surprise-kit`, framework **Other**, build command *empty* |

3. **Redeploys:** every push to the connected branch redeploys automatically.
4. **Branch previews:** these hosts also make preview links for other branches. Don't share those either.

**Before you deploy, know what gets published.** The host serves *everything* in `surprise-kit`. That includes `README.md`, `docs/` and `backend/` (the Apps Script source — harmless if seen, since it has no secrets in it, but still describes the surprise), none of which she needs. Nobody can find them without the link, but she could if she typed the address. To avoid that, move the site files that actually need to be public (the four `.html` pages, `style.css`, `js/`, `clips.json`, `robots.txt`, `assets/`) into their own folder, and point the host at that folder instead.

### Privacy, honestly

The `noindex` tag and `robots.txt` keep search engines away, and unlisted videos don't show up in searches. Neither is a lock: **anyone with the link can open the site.** Share it only with her, and only on reveal day.

## Reveal-day checklist

- [ ] The real letter is in `CONFIG.letter`, and the placeholders `(your name)` and `XXXXXXXXXXX` are gone
- [ ] Real icons are in `assets/icons/` and the `ICONS` array points at them
- [ ] Real music is in `assets/music/` and the `MUSIC` array points at it (or you're fine with the placeholder silence)
- [ ] If you set up the Google Sheet: `APPS_SCRIPT_URL` is filled in in `js/config.js`, a test sign-up lands a row in the `Account` tab, and `resetAccount` has been run afterwards so hers is the first
- [ ] You know her secret word too, since there is no "forgot it" — only `resetAccount`
- [ ] Every clip plays in the deployed site, not just locally
- [ ] Tested on her laptop's browser and wifi, in both themes
- [ ] Opened in a private window with `?reset=1`: sign-up appears, no console errors (F12), and the full flow (sign-up → intro → letter → reply → inventory) works end to end
- [ ] Backup plan: a phone hotspot in case the wifi is bad
