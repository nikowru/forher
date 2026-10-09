# Backend setup: Google Sheet + Apps Script

This gives you two things, both living in one Google Sheet in your own Drive:
1. A private log of her sign-up answers and her letter reply (you only, via `doPost`; the site can never read it back).
2. A "Memories" tab you edit directly to add clips to the inventory, without touching any code.

Nothing here costs money or needs a server you maintain.

## 1. Create the Sheet

1. Go to [sheets.google.com](https://sheets.google.com) and create a new blank spreadsheet. Name it whatever you like (e.g. "Surprise site data").
2. Rename the first tab (bottom-left) to exactly `Responses`. Leave it empty — the script adds its own header row the first time it runs.
3. Add a second tab named `Memories`. Give it this header row, matching `clips.json`:
   `title | note | date | youtubeId | collection`
   Fill in rows as you get clips, same rules as `clips.json`: `date` as `YYYY-MM-DD`, `youtubeId` the 11-character id from the video URL, `collection` matching one of your collection ids.

## 2. Add the script

1. In the Sheet, open **Extensions → Apps Script**.
2. Delete the placeholder `Code.gs` content and paste in the contents of this repo's `backend/Code.gs`.
3. Save (Ctrl/Cmd+S). Give the project a name if prompted (e.g. "Surprise site backend").

## 3. Deploy it as a web app

1. Click **Deploy → New deployment**.
2. Click the gear next to "Select type" and choose **Web app**.
3. Settings: **Execute as: Me**, **Who has access: Anyone**. (This has to be "Anyone" for the site to reach it with no login — that's fine, because the script never hands back any stored data; it only accepts new rows.)
4. Click **Deploy**. The first time, Google will ask you to authorize the script — click through the "unverified app" warning (it's your own script); this is normal for personal Apps Script projects.
5. Copy the **Web app URL** it gives you (ends in `/exec`).

## 4. Wire it into the site

Open `script.js` and find:
```js
const APPS_SCRIPT_URL = "";
```
Paste your `/exec` URL between the quotes.

## 5. Publish the Memories tab as CSV

1. Back in the Sheet: **File → Share → Publish to web**.
2. In the first dropdown, choose the **Memories** sheet (not "Entire document"). In the second, choose **Comma-separated values (.csv)**.
3. Click **Publish**, confirm. Copy the URL it gives you.
4. Paste it into `script.js`:
```js
const MEMORIES_CSV_URL = "";
```
If you ever add or reorder columns, re-publish (or just re-save — published ranges usually auto-update within a few minutes).

## 6. Try it

- Load the site, go through sign-up and the letter reply. Check the `Responses` tab — two new rows should appear (a `signup` row and a `reply` row).
- Add a row to `Memories` and reload the site; the new clip should appear in the inventory. If `MEMORIES_CSV_URL` is blank or the fetch fails, the site quietly falls back to the placeholders in `clips.json` — nothing breaks.

## Limits, in plain words

- **Quotas**: a personal Google account gets 20,000 `doPost`/`doGet` calls per day and a handful of other limits (Apps Script quotas page has the exact numbers). For a private site shown to one person, you will never come close.
- **Slow first response**: if the script hasn't run in a while, the first request after that gap can take a few seconds (Google "waking it up"). Later requests are fast. The site already hides this — it never shows her an error, and a slow response just means her data saves a moment later.
- **Redeploying**: if you edit `Code.gs` later, use **Deploy → Manage deployments → edit (pencil) → New version**, not "New deployment". A *new version* of the same deployment keeps the same `/exec` URL. A brand *new deployment* gets a different URL, which means updating `APPS_SCRIPT_URL` in `script.js` again and redeploying the site. Prefer "new version" unless you specifically want a fresh URL.
- **Access setting**: keep "Who has access: Anyone" — without it, the browser request from her visit will be rejected. This only allows *submitting* new rows; nobody can read existing ones through this URL, because the script has no code path that returns them.
