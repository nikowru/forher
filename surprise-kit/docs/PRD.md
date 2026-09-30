# PRD: "Would You Like To Open?" (surprise clip-inventory site)

## 1. Summary
A private, one-page website for one viewer (my girlfriend) on her laptop. She clicks a wax seal, a letter comes out of an envelope, then the background unveils an "inventory" of many video clips of the two of us from way back. Videos play inside the page.

## 2. Goals and non-goals
Goals: feel warm, handmade and vintage; work first time on reveal day; easy for me to add or edit clips and wording without touching the design.
Non-goals: accounts or logins, comments, public sharing, phone layout, analytics, monetization.

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

## 6. Data model (phase 1: clips.json)
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

## 7. Tech stack
| Layer | Choice | Why |
|---|---|---|
| Frontend | Plain HTML, CSS, ES-module JavaScript, no build step | Nothing to break on reveal day; easy to edit |
| Data (phase 1) | clips.json in the repo | 100 to 500 clips is tiny; loads instantly; no server |
| Data (phase 2, optional) | Supabase (Postgres) `clips` table + a private admin page | Only if I want to add clips from a phone or without redeploying |
| Video | Unlisted YouTube, embedded with the IFrame Player API on youtube-nocookie.com | Free, handles large or long clips |
| Thumbnails | img.youtube.com/vi/{id}/hqdefault.jpg | No images to make by hand |
| Repo | GitHub, private | Nobody sees clips.json early |
| Hosting | Cloudflare Pages, Netlify or Vercel, auto-deploy from GitHub | Free and works with private repos. GitHub Pages needs a public repo on free accounts, so avoid it |
| Tooling | VS Code | Repeatable workflow |

Why no database first: a JSON file is faster, free and cannot go down. Add Supabase only when editing JSON becomes a pain.

## 8. Non-functional requirements
- Performance: lazy thumbnails, player loads on click, first paint under 2 seconds on wifi.
- Accessibility: body text contrast of at least 4.5:1 (use --ink), keyboard focus visible, Esc closes the modal, reduced motion respected.
- Privacy: unlisted videos, private repo, `noindex` meta tag and robots.txt, link shared with nobody else. Unlisted is obscurity, not security.
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

## 12. Open questions
- Exact Canva heading font name.
- Fifth swatch of the Minimal Neutral palette (hidden in the screenshot).
- Wax seal: keep red, or use the palette brown #5C4130.
- Which theme is the default when her system is set to dark.
- Gallery style: game-inventory slots or pinned polaroids.
- Number of clips and how to group them.
- Deployment target: Cloudflare Pages, Netlify or Vercel.
