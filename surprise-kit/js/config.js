// Shared configuration: all wording, option lists and tunables live here (classic script, shared via window.Surprise).
window.Surprise = window.Surprise || {};

// ---- Google Apps Script backend (optional; see docs/backend-setup.md) ----
// Paste your deployed web app URL (ends in /exec) here once you have followed docs/backend-setup.md.
// BLANK = everything stays in this browser (local mode). Set = the Sheet is the only store (no silent local fallback).
const APPS_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbzMOcR-BNlTO8dC6Z7XhjNM_CAPMU-AN3QZkIffp0dWPK07Sx3lpIbyRPBvn6IlYXS88w/exec";

// ---- "No" button feel (sign-up card, final step) - tweak these to change how it dodges ----
// Units: px, seconds (per-second values are px/s or px/s^2), ms where named. Sensible range in [].
const NO_RADIUS = 160;           // [100-240] pointer closer than this (measured to the button's EDGE) makes No flee
const NO_RADIUS_SPEED = 0.35;    // [0-0.6] a fast pointer triggers the flee earlier: extra radius = this x pointer speed (px/s)
const NO_RADIUS_BONUS_MAX = 600; // [200-900] cap on that extra radius (px)
const NO_LOOKAHEAD_MS = 110;     // [0-200] No flees from where the pointer will be this many ms from now (its current heading), not just where it is
const NO_FLEE_ACCEL = 11000;     // [4000-16000] push strength at point-blank; fades linearly to 0 at NO_RADIUS
const NO_CURVE = 0.9;            // [0-1.5] sideways (perpendicular) push relative to the straight-away push. 0 = flees in a line, ~1 = swirls around the cursor
const NO_POINTER_GAIN = 1.6;     // [0-3] extra push per 1000px/s of pointer speed, so a fast cursor can't catch it
const NO_POINTER_GAIN_MAX = 3;   // [1-5] cap on that push multiplier
const NO_BASE_SPEED = 650;       // [400-1000] top speed (px/s) against a slow or still pointer
const NO_SPEED_FOLLOW = 0.9;     // [0-1.5] top speed also rises by this x the pointer's own speed
const NO_MAX_SPEED = 4200;       // [1500-4500] HARD speed ceiling (px/s): velocity is clamped to this every frame, never exceeded
const NO_DAMPING = 3.2;          // [1.5-6] friction per second: higher = stops sooner / feels heavier, lower = floatier
const NO_MARGIN = 16;            // [8-40] safe gap kept between the button and the viewport edges
const NO_WALL_RANGE = 90;        // [50-140] distance from an edge where the soft wall push starts
const NO_WALL_ACCEL = 5000;      // [2000-9000] strength of that wall push (it also steers the button along the edge)
const NO_WALL_SLIDE = 0.9;       // [0-1.5] sideways slide along a wall, relative to the wall push
const NO_YES_CLEARANCE = 18;     // [8-40] gap always kept between No and the Yes button
const NO_CORNER_ZONE = 110;      // [70-160] within this of two edges at once counts as "in a corner"
const NO_CORNER_TRIGGER = 110;   // [60-150] cursor this close (to the button's edge) to a cornered / pinned No sets off the glide-away
const NO_GLIDE_MS = 600;         // [400-900] duration of the smooth curved glide to a far part of the screen
const NO_DASH_MS = 340;          // [200-500] duration of the quick curved dash when a tap/click lands on No
const NO_TOUCH_SLOP = 24;        // [0-40] extra px around No that still count as "on it" for touch/click pre-emption
const NO_SWAY_AMP = 5;           // [0-10] idle sway size (px); 0 turns idle sway off
const NO_SWAY_PERIOD_MS = 4200;  // [2500-7000] time of one idle sway cycle
const NO_IDLE_PAUSE_MS = 5000;   // [2000-15000] with no pointer/key activity this long the animation loop stops (saves battery)
const NO_FADE_MS = 160;          // [100-300] reduced-motion only: fade out, and again fade in, at the new spot
const NO_PIN_MS = 300;           // [100-500] a pinned (cornered / against Yes) No waits this long with the pointer close before it glides away
const NO_SHORT_GLIDES = false;   // true = the corner-escape glide is a short hop (NO_STEP_MIN..NO_STEP_MAX) instead of a trip to a far part of the screen
const NO_STEP_MIN = 200;         // [100-260] smallest hop (px) when No steps to a "nearby" spot (keyboard focus, click/tap dash, reduced-motion fade)
const NO_STEP_MAX = 290;         // [160-360] largest such hop (px); candidates are tried on two rings, one at each of these distances

// ---- proposal.html "No" retune (js/proposal.js passes these to Nodge as per-page overrides of the NO_* values above) ----
const PR_NO_RADIUS = 100;        // [90-110] pointer this close (to the button's EDGE) makes No flee; far smaller than the sign-up's 160
const PR_NO_RADIUS_SPEED = 0.05; // [0-0.4] a fast pointer widens that radius by this x its speed (px/s), so a flick cannot reach it; 0 = always exactly RADIUS
const PR_NO_RADIUS_BONUS_MAX = 60; // [0-250] cap on that widening (px): the trigger is 100px, up to 160px for a fast pointer
const PR_NO_GLIDE_MS = 420;      // [300-500] smooth curved glide when No is cornered
const PR_NO_DASH_MS = 380;       // [300-500] curved dash when a click/tap lands on No
const PR_NO_STEP_MIN = 120;      // [120-220] hop length for focus / dash / reduced-motion fade: shortest...
const PR_NO_STEP_MAX = 220;      // [120-220] ...and longest
const PR_NO_CORNER_TRIGGER = 100; // [60-110] cornered No glides away when the pointer is this close (keep at or under the radius)
const PR_NO_SHORT_GLIDES = false; // true = corner-escape glide is a 120-220px hop instead of a longer curved trip (tested: hops get caught more often, so off)
const PR_NO_PIN_MS = 120;        // [80-300] how long a pinned No waits before the corner-escape glide (short, so the pointer cannot close in first)
const PR_NO_SWAY_AMP = 0;        // [0-5] idle sway (px); 0 = No holds perfectly still between dodges (no jitter)
const PR_NO_DAMPING = 4.2;       // [2.5-6] higher = No settles sooner after a flee and never wobbles

// ---- Edit all wording here ----
const CONFIG = {
  pageTitle: "Space for my aki/baby", // the browser tab
  heading: "Would You Like To Open?",
  hint: "A little something for you",
  // The love note, one line per entry. It is set like real stationery, so the SHAPE matters: the first entry is
  // the greeting (set in script), the last two are the sign-off and your name (script again), and everything in
  // between is the letter itself, one paragraph per entry. Add as many middle paragraphs as you like.
  letter: [
    "To my duo/baby/future wife/aki,",
    "Honestly, I don't even know where to start, kasi words have always felt too small when it comes to explaining how much you mean to me. From the first day I met you, I never would've imagined that I'd have the privilege of being loved by someone like you, and even more, to be able to love you back.",
    "Unang una phue thank you, Lord for me being able to meet you and di 'to sponsored, pero laking pasasalamat ko na rin kay Pinoy Gamers BWAHDGSHGSHS. Imagine, out of all the people in this world, somehow, our paths crossed. And now, I get to call you mine. I get to love you, and I get to be loved by you baby ehehhehe arghhhh i’m getting stomach butterflies(STOMACH BUTTERFLIES?!?!)",
    "At first, hindi na rin talaga ako mag-eengage sana in anything na online love, but then you came along. And somehow, you made me believe in something I thought I wasn't going to believe in again. From the moment you walked into my life and we started sharing our stories with each other, I don't know exactly when it happened, but I found myself wanting to be someone you could always feel safe with. Someone you could run to when the world gets a little too heavy. Someone who could make you smile even on days when smiling feels difficult.",
    "Mahal na mahal kita, aki. Baby, my wife. I genuinely want to keep saying these words to you, kasi that's exactly what my heart feels whenever I'm with you. And even when we're apart, there's this part of me that always feels close to you.",
    "Your giggles, your humor, your pretty and cute face, the way you speak, kahit nga paghinga mo eh BWAHDGSHGSHS. Everything about you makes my heart race in ways I can't even explain. You have this way of making the simplest moments feel so special, and I hope you know that even the little things you do are things I'll always treasure.",
    "I love how you make me laugh. I love how you make me feel. I love that I get to know the person behind all those smiles, all those stories, and even the little things you might not think are worth sharing. I love you in every moment we have.",
    "First time kong gumawa ng love letter BWAHDGSHGSA idk if I'm doing good or what, pero I just want to be honest and genuine with you. I want you to know how much I love you, even if I don't always know the right words to say it.",
    "Recently, I've also found myself doubting if I'm deserving enough for a woman like you. Sometimes, I wonder if I'm already the person you deserve, or if there's still so much I need to work on. But rather than letting those doubts hold me back, you've inspired me to become better. To work harder, to grow, and to become someone who can give you the love, care, and future you deserve.",
    "And to me as ur future hubby(FUTURE HUBBY?!?!) BWAHDGSHGSA. But seriously, aki, I really do look forward to the day when I get to stand beside you and call you my wife. To build a life with you, to share the ordinary days with you, and to keep choosing you even when life gets difficult.",
    "I know I can't promise that everything will always be perfect, but I can promise that I'll keep trying. I'll keep learning how to love you better, how to understand you more, and how to be the kind of partner you can always count on.",
    "I hope that when you look back on the days we've spent together, you'll always find reasons to smile. And I hope that as we continue to grow, you'll never have to wonder whether you're loved, because I want to spend my life making sure you know that you are.",
    "Thank you for being you, aki. Thank you for letting me into your life, for sharing your heart with me, and for giving me the chance to love you.",
    "If I could go back to the day we first met, knowing everything I know now, I would still choose to meet you. I'd still choose to get to know you. I'd still choose to fall in love with you.",
    "And if life gives me the chance to choose you over and over again, I hope you know that I'd never get tired of choosing you.",
    "Mahal na mahal kita, baby. My aki, my love, my future wife.",
    "I love you, always."
  ],
  button: "Continue",               // under the open letter: puts it away into her inbox and opens the rest of the site
  // the clips and collection names live in clips.json
  gallery: {
    title: "Our memory album (aka the clips)",
    sub: "Pick a slot to play a memory",
    all: "All",
    empty: "Nothing in here yet.",
    error: "The clips couldn't load. Check the internet connection and refresh the page.",
    // The tabs: one per month, in this order. A clip goes under the month of its date (YYYY-MM-DD) - or, if its
    // collection is a month name (July, Jul or 7), under that month instead. A clip with neither is under All only.
    // Remove every entry here to go back to tabs named by the collection column.
    months: [
      { month: 7, title: "July" }, { month: 8, title: "August" }, { month: 9, title: "September" },
      { month: 10, title: "October" }, { month: 11, title: "November" }, { month: 12, title: "December" }
    ]
  },
  player: {
    close: "Close", previous: "Previous clip", next: "Next clip",
    unavailable: "This clip can't play here, but you can still watch it on YouTube.",
    openOnYouTube: "Open on YouTube",
    // when a clip ends, the next one in the tab she is on starts by itself; after the last one it simply stops.
    // false = each clip waits for her to press next.
    autoplayNext: true
  },
  // proposal.html question page (js/proposal.js). Wording may contain {name}: it becomes "baby" (nameWord) or, when
  // useUsername is true, her saved username. Edit the strings freely; keep {name} wherever the pet name belongs.
  proposal: {
    title: "Question for u, baby hehe",
    line1: "hi {name},",
    line2: "will you be my wife one day and be my forever?",
    cheeky: "are you sure, {name}?",
    confirm: "sabi q na yes ihh, kinikilig na nmn si baby.",
    yes: "Yes",
    no: "No",
    useUsername: false,   // false = use nameWord ("baby"); true = use the username she chose at sign-up
    nameWord: "baby",     // the word {name} stands for while useUsername is false (also the fallback if no username is saved)
    // timing, in ms (the 1.8s fade of each line itself is in style.css)
    firstLineDelayMs: 900,   // pause after the page opens before "hi baby,"
    beatMs: 2400,            // pause between line 1 and line 2
    buttonsDelayMs: 2800,    // pause after line 2 before Yes / No appear
    dodgesBeforeCheeky: 4,   // after this many dodges No shrinks, Yes grows and the cheeky line appears (once)
    yesBeatMs: 2800,         // after Yes: celebration + confirmation shown this long before fading to memories.html
    yesBeatReducedMs: 900    // the same beat under reduced motion
  },
  // read aloud by screen readers only
  // `me` is the pixel drawing of you that arrives beside the open letter, holding the flowers out.
  // `page...` are for a letter longer than one sheet, read a page at a time: {n} is the page she is on, {total} how
  // many there are. `page` is what shows between the arrows, `pageSpoken` what a screen reader says instead.
  labels: { theme: "Minimal theme", seal: "Open the envelope", collections: "Collections", letter: "Letter",
    me: "Me, holding flowers out to you",
    page: "{n} / {total}", pageSpoken: "Page {n} of {total}", pagePrev: "Previous page", pageNext: "Next page" },
  // music controls (js/common.js); placeholder wording, edit freely
  music: {
    // the song picker in the top-right corner (js/common.js)
    pick: "Music",                       // the button's screen-reader name
    panelTitle: "What should we listen to?",
    nowPlaying: "Playing",               // marks the track the site is humming
    playlistTitle: "The playlist I made you"  // heading over the Spotify embed, when one is set
  },
  // shared header / footer / page titles (js/common.js); placeholder wording, edit freely
  site: {
    brand: "For you",
    footer: "Made with love, just for you",
    titles: { memories: "Our memories", inbox: "Your letters", profile: "You" },
    nav: { memories: "Memories", inbox: "Inbox", profile: "Profile" },
    // shown (in the footer line) when she clicks a page that isn't open yet
    locked: {
      memories: "This one opens once you've said yes.",
      inbox: "This one opens once you've written back.",
      profile: "This one opens once you've written back."
    },
    labels: { pages: "Pages", inbox: "Inbox", inboxNew: "Inbox, {n} new", theme: "Switch theme" }   // {n} = how many letters she has not opened
  },
  // The gate (index.html): the sliding card she lands on. The panel invites her to sign up the
  // first time; once her account exists it turns into a warm nudge back to signing in instead.
  welcome: {
    title: "Welcome back",            // heading over the sign-in fields
    panelTitle: "Hallo phueee",          // the coloured panel, before she has an account
    panelText: "Made for one person only. Come in and start.",
    signUp: "Sign up",                // the panel's button -> signup.html
    toSignUpSmall: "No account yet? Sign up",   // same thing, for narrow screens where the panel stacks
    // shown on the panel once an account already exists (only one can)
    takenTitle: "Already yours",
    takenText: "You have your place here. Sign in and pick up where you left off.",
    signIn: "Sign in instead"
  },
  // sign-up card wording (Phase 3 section 4.2); edit freely, same CONFIG convention as the rest of the page
  signup: {
    title: "Exclusively for my baby/aki",
    usernameLabel: "A-Anue phue na-name m-mo crushicakes k-ko?",
    usernamePlaceholder: "baby/aki/therru/xarom/Somebody Else/Osmanthus",
    moodLabel: "Are u okie babyy, masaya ka phue ba?",
    iconLabel: "Pili ka pfp baby bwhehe",
    // the secret word (js/signup.js): she types it here and again on the login page; trimmed + lowercased when compared
    secretLabel: "Secret word na tau lang makakaalam (password phue baby/aki)",
    secretHint: "I love youuuuuu",
    continue: "Continue",
    loading: "One moment...", // Continue's label while the account is being created (it is disabled meanwhile)
    // the last tile in the icon row: she picks a photo from her own device. It never leaves the
    // browser - it is cropped square, shrunk, and kept with the rest of her answers.
    uploadLabel: "Use my own",
    uploadFailed: "That picture would not open. Try another one?",
    finalQuestion: "P-pwede phue ba ikaw lang baby ko furiver n iver?",
    yes: "Yes",
    no: "No",
    // gentle prompts shown in #su-msg when Yes is pressed with something still missing (first missing one wins)
    missing: {
      username: "Tell me what to call you first, please?",
      mood: "Pick how you're feeling first, please?",
      icon: "Choose an icon you like first, please?",
      secret: "Whisper me our secret word first, please?"
    },
    // shown in #su-msg when the account could not be created
    errors: {
      invalid: "I need your name and our secret word first, please?",
      network: "Something went wrong on my side. Try once more in a moment?",
      locked: "Too many tries for now. Give it a few minutes and try again, sweetheart?"
    }
  },
  // login page wording (js/login.js); placeholder copy, edit freely
  login: {
    title: "Welcome back",
    usernameLabel: "What should I call you?",
    secretLabel: "Our secret word",
    continue: "Continue",
    loading: "One moment...", // Continue's label while the login request is in flight (it is disabled meanwhile)
    reset: "Not me / start fresh",
    remember: "Remember me on this laptop",
    // shown under the fields once she has got the word wrong, so it is there when she needs it and
    // not before. Nothing here says whether an account exists.
    forgot: "I forgot our secret word",
    forgotSending: "One moment...",
    forgotSent: "I've let him know, baby. He'll send you a word to get in with.",
    // gentle prompts when Continue is pressed with a field empty (first empty one wins)
    missing: {
      username: "Tell me who you are first, please?",
      secret: "And our secret word, please?"
    },
    // ONE message for a wrong username or a wrong word: never say which was wrong
    wrong: "Hmm, that does not look right. Try again, sweetheart?",
    network: "Something went wrong on my side. Try once more in a moment?",
    // too many wrong tries in a row: the server pauses logins for a few minutes (kind, and says nothing about which part was wrong)
    locked: "Too many tries for now. Give it a few minutes and try again, sweetheart?",
    // "not me / start fresh" dialog. This one really does erase the account, so it asks for the
    // secret word first and says plainly what goes. Everything below is wording: edit freely.
    confirm: {
      title: "Start over?",
      text: "This erases the account and everything saved with it - including the letter you wrote back - so the whole thing begins again from the very first page. It cannot be undone.",
      secretLabel: "Type our secret word to be sure",
      yes: "Yes, start over",
      no: "Keep me here",
      working: "Erasing...",        // the Yes button while the request is in flight
      wrong: "That is not our secret word.",
      network: "Something went wrong on my side. Try once more in a moment?",
      locked: "Too many tries for now. Give it a few minutes, sweetheart?"
    }
  },
  // Her profile card (profile.html). Wording only; the card's pictures live in /assets/profile.
  // The card is written as a letter about her, so most of these are sentence parts rather than
  // labels: `...Lead` is the words before her value and `...Tail` the words after it (often just a
  // full stop). Write them so that lead + value + tail reads as one sentence. The plain `...Label`
  // keys are still here and still do a job - they are the accessible name of each field, read out
  // by a screen reader and never shown, because the sentence already says what the value is.
  profile: {
    nameLabel: "your name",                // not shown: her name is the letter's salutation
    nameChange: "change it",
    moodLabel: "feeling right now",        // not shown
    moodLead: "Today you are feeling",     // ... her mood gif ... "soft" ...
    moodTail: ".",
    moodChange: "change it",
    secretLabel: "our secret word",        // not shown
    secretLead: "Our word is",
    secretTail: ".",
    secretShow: "show it",
    secretHide: "hide it",
    // Replaces that whole line on a device that was never told to remember her, so write it as a
    // full sentence: secretLead and secretTail are hidden when this one is used.
    secretUnknown: "Our word is one that only you know.",
    secretChange: "change our word",
    secretNew: "the new word",
    secretSave: "save it",
    secretSaved: "done, that is our word now",
    secretTooShort: "give it a word first?",
    rankLabel: "valorant",                 // not shown
    // The game is named in the words, not left to the icon: rankIcon is optional and the sentence
    // has to still say what the rank is a rank in when the file is missing or blanked.
    rankLead: "In Valorant you are",
    rank: "Gold 2",                        // edit freely; rankIcon may be left blank
    rankTail: ".",
    rankIcon: "assets/profile/rankgold2.png",
    playlistLabel: "And this is what you have had on repeat:",  // the line that introduces the embed
    playlistTitle: "your playlist",        // not shown: the embed's accessible name
    usLabel: "the two of us",              // not shown: the accessible name of the pixel drawing
    usCaption: "for you, always",
    sinceLabel: "yours since",             // ... + the date her account was made, as the letter's date
    sign: "— me",                          // signed at the foot
    saving: "saving...",
    saveFailed: "that did not save. try once more?",
    editName: "change your name",
    nameTooShort: "a name, please?"
  },
  // phone-style notification on the letter page (js/letter.js), shown once during the first-time intro
  notify: {
    text: "uy may love note!",
    delayMs: 2000,       // after the page opens: the letter has landed (2s fall) and the decorations have unfolded
    durationMs: 4500,    // shown this long, then it dismisses itself (clicking it dismisses sooner)
    // OPTIONAL sound, played quietly with the notification. Blank = nothing is requested, nothing plays (no 404).
    // To use one: drop a file in /assets (for example assets/notify.mp3) and put that path here. A missing or blocked file stays silent.
    sound: "",
    volume: 0.4          // [0-1]
  },
  // The song that plays as the letter arrives (js/letter.js). It starts with the notification above and fades in.
  // A browser that wants a tap before any sound (iPhones, Safari) starts it on her first tap instead - usually the
  // seal. It plays once, keeps going after she has put the letter away, and fades out when she opens a clip or the
  // music panel. A round button beside the music one appears once it is playing, to pause it and play it again.
  // iPhones ignore a page's volume: there it plays at the phone's own volume, with no fade.
  song: {
    file: "assets/music/The Only Exception.mp3",   // "" = no song
    volume: 0.5,               // [0-1]
    fadeInMs: 3000,
    fadeOutMs: 1200,
    stopWhenPutAway: false,    // true = it fades out when she presses Continue
    play: "Play the song",     // the button's name while it is paused (read out, and shown on hover)
    pause: "Pause the song"    // ...and while it is playing
  },
  // Her reply to the love note, for an account that wrote one before the letter stopped asking: it is shown under
  // the love note in her inbox. New letters have no reply on them - she writes to you from her card instead.
  reply: {
    inboxTitle: "What you wrote back",
    inboxEmpty: "Nothing here yet."
  },
  // her inbox (inbox.html, js/inbox.js): the letters you have sent her, kept as a stack, with the love note at
  // the bottom of it. She writes to you from her card (profile.html, the `write` block below), not from here.
  inbox: {
    title: "Your letters",
    sub: "Newest on top. The first one is at the bottom, where it started.",
    stackLabel: "Your letters, newest first",   // not shown: the list's accessible name
    unread: "not opened yet",                    // not shown: read out for a letter with its seal still on
    firstLetter: "the first one",                // stands in for a date on the love note
    checking: "checking for new letters...",
    offline: "Couldn't check for new letters just now. The ones you have are all here."
  },
  // the form to write to you, under her card on profile.html. You stand beside it - waiting while she writes,
  // glad once she has sent it.
  write: {
    label: "Write to me",
    placeholder: "Anything at all. I read every one.",
    send: "send it to me",
    sending: "sending...",
    empty: "Write something first, love.",
    failed: "That didn't send, but nothing is lost - your words are still here. Try again?",
    sentTitle: "Got it.",
    sentText: "I'm probably reading it twice already.",
    again: "write another",
    meWaiting: "Me, waiting to read what you write",
    meHappy: "Me, very happy you wrote"
  },
  // YOUR back office (admin.html, js/admin.js). Only you see past the sign-in. Signed out, the page
  // says nothing about what it is - keep `title` and the field labels plain for that reason.
  admin: {
    title: "Sign in",                    // the tab, signed out
    titleIn: "Letters",                  // the tab, signed in
    user: "Username",
    pass: "Password",
    signIn: "Sign in",
    signingIn: "Signing in...",
    wrong: "That isn't right.",
    locked: "Too many tries. Wait a few minutes, then try again.",
    network: "Couldn't reach the Sheet. Try again in a moment.",
    signedOut: "You were signed out. Sign in again - anything you were writing is still there.",
    heading: "Letters",                  // over the signed-in page
    signOut: "Sign out",
    kicker: "whenever you like",         // the small script line over the compose heading
    composeTitle: "Write to her",
    bodyLabel: "Your letter",
    placeholder: "Write it the way you'd say it...",
    send: "Send to her",
    sending: "Sending...",
    sent: "Sent. It's waiting in her inbox.",
    empty: "Write something first.",
    sendFailed: "Couldn't send it. Nothing is lost - your words are still here, try again.",
    listTitle: "Sent and received",
    refresh: "Refresh",
    none: "Nothing yet, either way.",
    toHer: "You wrote",                  // a mail you sent
    toMe: "She wrote",                   // a mail she sent
    letterReply: "Her reply to the letter",
    opened: "opened",                    // followed by when
    notOpened: "not opened yet",
    isNew: "new"                         // her mail you have not seen before this visit
  }
};

// The five moods. `file` is the animated gif shown on the button; `label` is the caption under it
// and what a screen reader reads. `id` is what gets saved, so leave ids alone once she has picked.
// To swap a gif: drop a square-ish one in /assets/moods/ and point `file` at it.
const MOODS = [
  { id: "masak8 :<, pero it'll come to pass(no baby tell me)", file: "assets/moods/mood-1.gif", label: "i'm not okay" },
  { id: "i'm not fine", file: "assets/moods/mood-2.gif", label: "A little down" },
  { id: "k lang.", file: "assets/moods/mood-3.gif", label: "sakto lang.." },
  { id: "okay lang", file: "assets/moods/mood-4.gif", label: "Happy" },
  { id: "I'M VERY HAPPY BABY", file: "assets/moods/mood-5.gif", label: "SOAPER HAPPY BABYYY" }
];

// Placeholder icons for "choose an icon". SWAP REAL FILES IN HERE: replace the files
// at these paths under /assets/icons/ (or change `file`/`label` to point at your own
// images) - keep the {id, label, file} shape, since `id` is what gets saved/sent.
// To add one: drop a square image in /assets/icons/ and add a line here. `label` is read out by
// screen readers and shown as a tooltip, so give it a name rather than a number. `id` is what gets
// saved, so don't change an id she may already have picked.
const ICONS = [
  { id: "a01", label: "Red", file: "assets/icons/avatar-01.jpg" },
  { id: "a02", label: "Sparkle", file: "assets/icons/avatar-02.jpg" },
  { id: "a03", label: "Butterfly", file: "assets/icons/avatar-03.jpg" },
  { id: "a04", label: "Bandana", file: "assets/icons/avatar-04.jpg" },
  { id: "a05", label: "Headphones", file: "assets/icons/avatar-05.jpg" },
  { id: "a06", label: "Braid", file: "assets/icons/avatar-06.jpg" },
  { id: "a07", label: "Beanie", file: "assets/icons/avatar-07.jpg" },
  { id: "a08", label: "Storm", file: "assets/icons/avatar-08.jpg" },
  { id: "a09", label: "Pixel", file: "assets/icons/avatar-09.jpg" },
  { id: "a10", label: "Glasses", file: "assets/icons/avatar-10.jpg" },
  { id: "a11", label: "Golden", file: "assets/icons/avatar-11.jpg" },
  { id: "a12", label: "Smile", file: "assets/icons/avatar-12.jpg" },
  { id: "a13", label: "Mirror", file: "assets/icons/avatar-13.jpg" },
  { id: "a14", label: "Neon", file: "assets/icons/avatar-14.jpg" },
  { id: "a15", label: "Pen", file: "assets/icons/avatar-15.jpg" },
  { id: "a16", label: "Suit", file: "assets/icons/avatar-16.jpg" },
  { id: "a17", label: "Babyko", file: "assets/icons/babyko_.png" }
];
// Her own photo: the upload tile is added after the list above. The picked file never leaves the
// browser - it is cropped to a square and shrunk to AVATAR_PX before being stored, so it stays
// small enough for localStorage (and for a Sheet cell when the backend is switched on).
const AVATAR_PX = 256;        // [128-384] stored size of an uploaded photo
const AVATAR_QUALITY = 0.82;  // [0.6-0.9] JPEG quality for an uploaded photo
const AVATAR_MAX_CHARS = 40000; // a Sheet cell holds 50k; above this the photo stays on her device only


// ---- Spotify playlist (optional) ----------------------------------------------------------
// Paste your playlist's share link here and it appears inside the music panel, top right.
// Spotify > playlist > ... > Share > Copy link to playlist. A bare id works too. Blank = no embed.
//
// Worth knowing, so it does not surprise you: this is a VISIBLE player she presses herself. It
// cannot be the site's background music - an embed is an iframe, so it stops dead on every page
// change, and Spotify will not let it play hidden or start on its own. It also plays 30-second
// previews unless she happens to be signed into Spotify in that browser (full tracks generally
// want Premium). There is no background soundtrack; this player is the music.
const SPOTIFY_PLAYLIST = "https://open.spotify.com/playlist/1erLS2omxRNJRgrtTY1HR2?si=9uBDEjk8QVOy94iSAvqKjQ";

// Top-level const above is already global to other classic scripts; hang them on Surprise too, for explicitness.
Surprise.APPS_SCRIPT_URL = APPS_SCRIPT_URL;
Surprise.CONFIG = CONFIG;
Surprise.MOODS = MOODS;
Surprise.ICONS = ICONS;
Surprise.AVATAR_PX = AVATAR_PX;
Surprise.AVATAR_QUALITY = AVATAR_QUALITY;
Surprise.AVATAR_MAX_CHARS = AVATAR_MAX_CHARS;
Surprise.SPOTIFY_PLAYLIST = SPOTIFY_PLAYLIST;
Surprise.PR_NO = {
  RADIUS: PR_NO_RADIUS, RADIUS_SPEED: PR_NO_RADIUS_SPEED, RADIUS_BONUS_MAX: PR_NO_RADIUS_BONUS_MAX, GLIDE_MS: PR_NO_GLIDE_MS,
  DASH_MS: PR_NO_DASH_MS, STEP_MIN: PR_NO_STEP_MIN, STEP_MAX: PR_NO_STEP_MAX, CORNER_TRIGGER: PR_NO_CORNER_TRIGGER,
  SWAY_AMP: PR_NO_SWAY_AMP, DAMPING: PR_NO_DAMPING, PIN_MS: PR_NO_PIN_MS, SHORT_GLIDES: PR_NO_SHORT_GLIDES
};
Surprise.NO = {
  RADIUS: NO_RADIUS, RADIUS_SPEED: NO_RADIUS_SPEED, RADIUS_BONUS_MAX: NO_RADIUS_BONUS_MAX, LOOKAHEAD_MS: NO_LOOKAHEAD_MS,
  FLEE_ACCEL: NO_FLEE_ACCEL, CURVE: NO_CURVE, POINTER_GAIN: NO_POINTER_GAIN, POINTER_GAIN_MAX: NO_POINTER_GAIN_MAX,
  BASE_SPEED: NO_BASE_SPEED, SPEED_FOLLOW: NO_SPEED_FOLLOW, MAX_SPEED: NO_MAX_SPEED, DAMPING: NO_DAMPING, MARGIN: NO_MARGIN,
  WALL_RANGE: NO_WALL_RANGE, WALL_ACCEL: NO_WALL_ACCEL, WALL_SLIDE: NO_WALL_SLIDE, YES_CLEARANCE: NO_YES_CLEARANCE,
  CORNER_ZONE: NO_CORNER_ZONE, CORNER_TRIGGER: NO_CORNER_TRIGGER, GLIDE_MS: NO_GLIDE_MS, DASH_MS: NO_DASH_MS,
  TOUCH_SLOP: NO_TOUCH_SLOP, SWAY_AMP: NO_SWAY_AMP, SWAY_PERIOD_MS: NO_SWAY_PERIOD_MS, IDLE_PAUSE_MS: NO_IDLE_PAUSE_MS, FADE_MS: NO_FADE_MS,
  STEP_MIN: NO_STEP_MIN, STEP_MAX: NO_STEP_MAX, PIN_MS: NO_PIN_MS, SHORT_GLIDES: NO_SHORT_GLIDES
};
