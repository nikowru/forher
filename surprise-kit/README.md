# Would You Like To Open?

A private one-page surprise: click the wax seal, read the letter, then open an inventory of video clips that play right inside the page.

Plain HTML, CSS and JavaScript. There's no build step and nothing to install for the site itself.

| File | What it holds |
|---|---|
| `index.html` | Page structure only |
| `style.css` | All styling. Both color themes are CSS variables at the top. |
| `script.js` | All behavior. The `CONFIG` block at the top holds every piece of wording. |
| `clips.json` | The clips and their collections |
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

## Edit the wording

Everything she reads is in the `CONFIG` block at the top of `script.js`:

```js
const CONFIG = {
  pageTitle: "A little something for you", // text on the browser tab
  heading: "Would You Like To Open?",   // big title on the envelope screen
  hint: "A little something for you",   // small line under the envelope
  letter: ["My love,", "...", "Always yours,", "(your name)"], // one string per paragraph
  button: "Continue",                   // button at the bottom of the letter
  gallery: { title, sub, all, empty, error },     // gallery heading, subtitle, "All" tab, messages
  player:  { close, previous, next, unavailable, openOnYouTube }, // player labels and fallback text
  labels:  { theme, seal, collections, letter }                   // read aloud by screen readers only
};
```

- **Letter:** each string in `letter` is one paragraph. Long letters are fine, because the paper scrolls.
- **Quotes:** keep the quotation marks and commas. A missing comma breaks the page. If something stops working, check the browser console (F12).

## Add or change clips

Clips live in `clips.json`. Adding a clip means adding one entry; no code changes.

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

**Before you deploy, know what gets published.** The host serves *everything* in `surprise-kit`. That includes `README.md` and `docs/`, which describe the surprise. Nobody can find them without the link, but she could if she typed the address. To avoid that, move the five site files (`index.html`, `style.css`, `script.js`, `clips.json`, `robots.txt`) into their own folder, and point the host at that folder instead.

### Privacy, honestly

The `noindex` tag and `robots.txt` keep search engines away, and unlisted videos don't show up in searches. Neither is a lock: **anyone with the link can open the site.** Share it only with her, and only on reveal day.

## Reveal-day checklist

- [ ] The real letter is in `CONFIG.letter`, and the placeholders `(your name)` and `XXXXXXXXXXX` are gone
- [ ] Every clip plays in the deployed site, not just locally
- [ ] Tested on her laptop's browser and wifi, in both themes
- [ ] Opened in a private window: no console errors (F12), and the gallery loads
- [ ] Backup plan: a phone hotspot in case the wifi is bad
