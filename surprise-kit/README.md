# Would You Like To Open?

A private one-page surprise: she signs up, an intro plays, she clicks the wax seal, reads the letter, writes a reply, then the page lights up to reveal an inventory of video clips that play right inside the page.

Plain HTML, CSS and JavaScript. There's no build step and nothing to install for the site itself. One optional piece — a Google Sheet, for saving her sign-up/reply and for editing the clip inventory without redeploying — is covered in its own section below.

| File | What it holds |
|---|---|
| `index.html` | Page structure only |
| `style.css` | All styling. Both color themes are CSS variables at the top. |
| `script.js` | All behavior. The `CONFIG` block at the top holds every piece of wording. |
| `clips.json` | Fallback clip list, used if the Memories sheet isn't set up (or its fetch fails) |
| `assets/icons/` | Icon images for the sign-up "choose an icon" step |
| `assets/music/` | Audio tracks for the sign-up "choose your music" step |
| `backend/Code.gs` | The optional Google Apps Script source — see "Save her answers to a Google Sheet" below |
| `backend/SETUP.md` | Step-by-step setup for the Sheet + Apps Script |
| `robots.txt` | Asks search engines to stay away |
| `docs/` | `PRD.md` (the spec) and `board.md` (task board) |

## Run it locally

Double-clicking `index.html` shows the envelope, but **the gallery stays empty**, because browsers won't let a double-clicked page read `clips.json`. Use a small local server instead.

**Option A: VS Code.** Install the **Live Server** extension, open the `surprise-kit` folder, right-click `index.html`, and choose **Open with Live Server**.

**Option B: terminal** (needs [Node.js](https://nodejs.org)):

```sh
cd surprise-kit
npx serve
```

Then open the address it prints (usually http://localhost:3000).

To try the other theme, use the sun/moon button in the top right. To reset to "follow my system setting", run `localStorage.clear()` in the browser console.

To replay the sign-up card while testing (instead of clearing everything), add `?reset=1` to the address, e.g. `http://localhost:3000/?reset=1`.

## Edit the wording

Everything she reads is in the `CONFIG` block at the top of `script.js`:

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
  signup:  { title, usernameLabel, usernamePlaceholder, moodLabel, iconLabel, musicLabel, finalQuestion, yes, no }, // sign-up card
  intro:   { heading },                 // "uy may love note!" — shown right after sign-up
  reply:   { label, submit, nudge, inboxTitle }                    // the ruled-lines reply + inbox readback
};
```

- **Letter:** each string in `letter` is one paragraph. Long letters are fine, because the paper scrolls.
- **Quotes:** keep the quotation marks and commas. A missing comma breaks the page. If something stops working, check the browser console (F12).
- **The old "Continue" button:** the page no longer shows it — submitting the reply is what reveals the inventory now. It's still in the code (hidden) because the reveal logic reuses it internally; you don't need to touch it.

## Edit the sign-up, intro and reply screens

All their wording is in the same `CONFIG` block as above (`CONFIG.signup`, `CONFIG.intro`, `CONFIG.reply`) — edit it the same way.

**Icons** (the "choose an icon" grid): edit the `ICONS` array near the top of `script.js`:

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

**The "No" button:** dodges the pointer, touch and keyboard focus on purpose (it's part of the "Will you be my baby forever?" bit) — there's nothing to configure here, just know it's intentional if you see it move while testing.

## Add or change clips

There are two ways to feed the inventory. If you've set up the Google Sheet (see the next section), its **Memories** tab is the real source — add a row there and reload the site, no code changes or redeploys needed. `clips.json` is the fallback used only when the Memories sheet isn't set up yet, or if it fails to load — keep it updated too if you want a working inventory before you bother with the Sheet.

### Option A: the Memories sheet (no redeploy needed)

Once `backend/SETUP.md` is done and `MEMORIES_CSV_URL` is filled in in `script.js`, just add a row to the **Memories** tab: `title | note | date | youtubeId | collection` — same rules as the table below (`date` as `YYYY-MM-DD`, `youtubeId` the 11-character id, `collection` matching a collection you're already using elsewhere in the sheet). The site derives its tabs from whatever collection names appear in the sheet, so a brand-new collection name just works.

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

By default, her sign-up answers and letter reply only live in her own browser's storage — fine for testing, but you'll lose them if she clears her browser or uses a different device. Setting up a free Google Sheet + Apps Script fixes that: her sign-up and reply each get saved as a timestamped row, in a Sheet in your own Drive, that only you can read.

**Full step-by-step instructions are in [`backend/SETUP.md`](backend/SETUP.md).** Short version:

1. Create a Google Sheet with two tabs: `Responses` (the script fills this in itself) and `Memories` (you fill this in — see "Add or change clips" above).
2. In the Sheet, **Extensions → Apps Script**, paste in `backend/Code.gs`, and deploy it as a web app (**Execute as: Me**, **Who has access: Anyone**).
3. Copy the deployed URL into `APPS_SCRIPT_URL` near the top of `script.js`.
4. **File → Share → Publish to web**, publish the `Memories` tab as CSV, and copy that URL into `MEMORIES_CSV_URL`, also near the top of `script.js`.

A few things worth knowing:

- **It's write-only, on purpose.** The script has no way to send data back out — it can only add new rows. You read her replies by opening the Sheet yourself; the website can never display them, even if someone found the Apps Script URL.
- **No API key in the repo.** Nothing secret is checked into the code; the deployed URL itself is the only thing you paste in, and it can only be used to submit new rows, never read them.
- **If sending fails** (she's offline, or you haven't set this up yet), her answers stay saved in her browser and the site quietly retries later — she never sees an error either way.
- **Leave both config values blank** if you don't want this at all; the site works exactly the same, it just doesn't send anywhere beyond her own browser, and the inventory uses `clips.json` instead of the Memories sheet.
- **Redeploying the script later:** use "New version" under **Deploy → Manage deployments**, not "New deployment" — that keeps the same URL so you don't have to update `script.js` again. Full explanation, plus the (generous, won't-matter-for-one-person) quota limits, is in `backend/SETUP.md`.

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

**Before you deploy, know what gets published.** The host serves *everything* in `surprise-kit`. That includes `README.md`, `docs/` and `backend/` (the Apps Script source — harmless if seen, since it has no secrets in it, but still describes the surprise), none of which she needs. Nobody can find them without the link, but she could if she typed the address. To avoid that, move the site files that actually need to be public (`index.html`, `style.css`, `script.js`, `clips.json`, `robots.txt`, `assets/`) into their own folder, and point the host at that folder instead.

### Privacy, honestly

The `noindex` tag and `robots.txt` keep search engines away, and unlisted videos don't show up in searches. Neither is a lock: **anyone with the link can open the site.** Share it only with her, and only on reveal day.

## Reveal-day checklist

- [ ] The real letter is in `CONFIG.letter`, and the placeholders `(your name)` and `XXXXXXXXXXX` are gone
- [ ] Real icons are in `assets/icons/` and the `ICONS` array points at them
- [ ] Real music is in `assets/music/` and the `MUSIC` array points at it (or you're fine with the placeholder silence)
- [ ] If you set up the Google Sheet: `APPS_SCRIPT_URL` and `MEMORIES_CSV_URL` are filled in in `script.js`, and a test sign-up actually lands a row in the `Responses` tab
- [ ] Every clip plays in the deployed site, not just locally
- [ ] Tested on her laptop's browser and wifi, in both themes
- [ ] Opened in a private window with `?reset=1`: sign-up appears, no console errors (F12), and the full flow (sign-up → intro → letter → reply → inventory) works end to end
- [ ] Backup plan: a phone hotspot in case the wifi is bad
