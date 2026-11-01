# Backend setup: the Google Sheet + Apps Script

This moves her answers off her browser and into a Google Sheet in **your** Drive, so her progress
follows her to any device and you can read her reply. It's free, there's no server to maintain, and
you start from a blank Sheet.

Takes about ten minutes. You don't need to understand the code.

---

## 1. Make the Sheet

1. Go to [sheets.google.com](https://sheets.google.com) and create a **blank** spreadsheet.
2. Name it whatever you like — "Surprise site" is fine.

That's all. The script builds its own tabs in step 3.

## 2. Paste in the script

1. In the Sheet, open **Extensions → Apps Script**. A code editor opens in a new tab.
2. Delete whatever is in the editor (there's usually an empty `myFunction`).
3. Open `backend/Code.gs` from this repo, copy **all** of it, and paste it in.
4. Press **Ctrl/Cmd + S** to save. Name the project anything, e.g. "Surprise backend".

## 3. Run `setup()` once

1. In the toolbar above the code, there's a dropdown of function names. Choose **`setup`**.
2. Click **Run**.
3. Google will ask for permission the first time:
   - Click **Review permissions**, pick your Google account.
   - You'll see **"Google hasn't verified this app"** — that's expected, because *you* just wrote it
     and never submitted it for review. Click **Advanced**, then **Go to … (unsafe)**, then **Allow**.
   - It's asking for access to this spreadsheet, which is the whole point.
4. When it finishes, check the Sheet: you should now have three tabs, **Account**, **Memories** and
   **Messages**, each with a bold header row.

`setup()` also generates a random **salt** and stores it in Script Properties. That salt is what makes
her secret word unreadable in the Sheet. It never appears in the code or in this repo. You don't need
to touch it — but if you ever want to see or change it: **Project Settings** (the gear icon) →
**Script Properties**, under `SECRET_SALT`.

> **Don't change the salt after she's signed up.** Her stored secret was hashed with the old one, so
> changing it locks her out. If that happens, run `resetAccount()` (see "Starting over" below).

## 4. Deploy it as a web app

1. Click **Deploy → New deployment**.
2. Click the gear next to "Select type" and choose **Web app**.
3. Set:
   - **Execute as: Me**
   - **Who has access: Anyone**
4. Click **Deploy**, approve if asked, and **copy the Web app URL** (it ends in `/exec`).

**"Anyone" sounds alarming — here's what it actually means.** It's the only setting that lets her
browser reach the script without a Google login. Anyone who finds the URL can ask for the clip list
and *try* to log in (which locks after 5 wrong guesses). They **cannot** read her profile or her
letter without the secret word.

## 5. Paste the URL into the site

Open `js/config.js` and find:

```js
const APPS_SCRIPT_URL = "";
```

Put your `/exec` URL between the quotes. That one value is the switch: blank means the site keeps
everything in the browser; filled in means it talks to your Sheet.

## 6. Add your clips

In the **Memories** tab, fill in rows under the headers:

| title | note | date | youtubeId | collection | order |
|---|---|---|---|---|---|
| First trip | one line only she'll get | 2023-05-14 | dQw4w9WgXcQ | 2023 | 1 |

- **youtubeId** is just the 11-character code from the URL — `dQw4w9WgXcQ`, not the whole link.
- **date** as `YYYY-MM-DD`.
- **collection** becomes a tab on the memories page; reuse the same word to group clips.
- **order** controls the sequence (lowest first).

Add a row, reload the site, and it's there. No code, no redeploy.

---

## Reading her reply

Open the **Account** tab. It's a single row. Her reply is in the **reply** column, with the time in
**replyTime**. The **secretHash** column is deliberately unreadable — that's the point of it.

## The mailbox

Mail between you lives in the **Messages** tab, one row per mail: `id`, `direction` (`to-her` or
`to-me`), `body`, `created`, `readAt` (both are milliseconds; blank `readAt` means unopened). Her
reply to the letter stays where it always was, on the Account row — the admin page shows it as the
first mail she wrote, so there is only ever one copy of it.

You send and read from the admin page - `admin.html` on the site. Nothing on her pages links to it,
so bookmark it. Signed out it shows only a plain sign-in. Sign in as `admin` with the default password from the
round-three brief. The password is not written anywhere in this repo: the script keeps only a salted
hash of it, in Script Properties under `ADMIN_HASH`.

**When she writes to you, you get an email** with her words in it, sent the same way as the
forgot-word email (to `OWNER_EMAIL`, or the script's owner). Her mail is saved before the email is
attempted, so a missing address, a mail error or an exhausted quota only costs you the email, never
her message. The last 5 emails of each day are held back for the forgot-word email.

**To change the admin password:** Project Settings → Script Properties → add `ADMIN_PASSWORD` with the
new one. The next admin sign-in (or a `setup()` run) hashes it, **deletes** the property and signs out
every admin session. Add `ADMIN_USER` the same way to change the username. Wrong admin passwords have
their own lockout, separate from hers, so nobody guessing at the admin page can lock her out.

**Starting over:** `resetAccount` erases what *she* wrote and keeps what *you* wrote, marked unread
again, so a fresh start finds your mail waiting. `clearMessages` empties the whole tab — use it to
clear out test mail before the reveal. Neither touches the other.

**This needs a redeploy** — see "Changing the script later" below. Running `setup()` again first is
recommended but not required: the tab and the default password also appear on first use.

## Changing the script later

If you edit `Code.gs`, the live site keeps running the **old** version until you redeploy:

**Deploy → Manage deployments → the pencil icon → Version: New version → Deploy**

That keeps the **same URL**, so you don't touch `js/config.js` again. Only use "New deployment" if
you deliberately want a different URL — it'll give you one, and the site will keep calling the old
one until you update the config.

## Starting over while testing

In the Apps Script editor, choose **`resetAccount`** from the dropdown and **Run**. That clears the
account row and all sessions, so the site offers sign-up again. Your Memories rows and the salt are
left alone.

On the site side, `?reset=1` or `#reset` only clears *that browser* — the account itself lives in the
Sheet, so use `resetAccount` for a true reset.

### She can also start over herself

"Not me / start fresh" on the gate erases the account for real, so she can live the whole thing again
from the sign-up card. It asks for the secret word first and says plainly that her reply goes with it.

The word is checked on the server, by the same code and the same lockout as signing in. That check is
the point: the Web app URL is visible in the page source, so without it anyone holding the link could
wipe her account. If she has forgotten the word she can't use this — run `resetAccount` for her.

**This needs a redeploy.** The action lives in `backend/Code.gs`, so paste the file in again and
**Deploy → Manage deployments → edit → Version: New version → Deploy**, or the site will call an
action the deployed script doesn't have and the button will just report a problem.

## If she forgets the secret word

She taps **"I forgot our secret word"** — it appears under the fields once a word has been refused.
You get an email with a temporary word like `k3mq-7bda-xp2w`. Tell it to her; it signs her in and then
expires an hour later. Her real word keeps working the whole time and is never touched.

The email goes to whoever owns the script - the Google account you were signed into when you created
the Sheet and pasted the code in. To check which address that is without sending anything, pick
**`whoGetsTheEmail`** from the editor dropdown and **Run**; it prints the address in the log. Worth
doing once before the reveal. To send it somewhere else instead, add a Script Property called
`OWNER_EMAIL`. Apps Script allows roughly 100 emails a day on a personal account, and the button is
limited to one email per ten minutes, so it cannot be used to flood your inbox.

Once she is in, **she can set a new word herself** - that is what makes the emailed one a bridge
rather than a postponement. The site calls `changeSecret` with her session; it never asks for the old
word, because someone who has forgotten it could not supply one. The emailed word stops working the
moment she does this.

To set a new word **for** her instead, open the Apps Script editor, pick `setSecret` from the dropdown,
and run it with the new word:

~~~js
setSecret("whatever you two choose")
~~~

That keeps her account, her progress and her reply exactly as they are, and signs every device out so
the new word is used from then on. Prefer this to `resetAccount`, which erases everything.

**Both of these need a redeploy** (they live in `backend/Code.gs`): paste the file in again, then
**Deploy → Manage deployments → edit → Version: New version → Deploy**.

The first time the script sends an email, Google will ask you to approve the extra permission.

## The limits, honestly

- **This is a username and a secret word, not real security.** The word is stored only as a salted
  SHA-256 hash, so a leaked Sheet alone doesn't reveal it. But SHA-256 is fast, so a short word
  wouldn't survive determined guessing if both the Sheet and the salt leaked. Pick something a bit
  longer than a single word if that bothers you.
- **The Web app URL is visible in the site's source.** Anyone viewing the page can find it. That's
  unavoidable for a static site, and it's why the script refuses to return anything personal without
  a valid session.
- **Capitalisation and spaces don't matter** for the username or secret word — `"  Our Word "` and
  `"our word"` are the same. Deliberate, so she can't lock herself out over a capital letter.
- **A forgotten secret word is recoverable, but never readable.** It is stored only as a salted hash,
  so nothing — not even this script — can tell you what it was. "I forgot our secret word" on the gate
  therefore does not reveal it: it emails *you* a fresh word that works for one hour alongside hers,
  which you pass to her. Her own word is never changed by this. See "If she forgets" below.
- **"Not me / start fresh" cannot be undone.** It erases the account row, every session, and the
  reply she wrote. The Memories rows and the salt survive. There is no copy kept anywhere.
- **The first request after a quiet spell takes a few seconds** while Google wakes the script up.
  The site shows a loading state rather than looking broken.
- **Quotas** are generous — roughly 20,000 calls a day on a personal account. For one person, you'll
  never come close.
