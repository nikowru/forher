// Shared configuration: all wording, option lists and tunables live here (classic script, shared via window.Surprise).
window.Surprise = window.Surprise || {};

// ---- Google Apps Script backend (optional; see docs/backend-setup.md) ----
// Paste your deployed web app URL (ends in /exec) here once you have followed docs/backend-setup.md.
// BLANK = everything stays in this browser (local mode). Set = the Sheet is the only store (no silent local fallback).
const APPS_SCRIPT_URL = "";

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
  letter: ["My love,", "Your message goes here: a memory, a promise, something only the two of us would understand.", "Always yours,", "(your name)"],
  button: "Continue",
  // the clips and collection names live in clips.json
  gallery: {
    title: "Our little inventory",
    sub: "Pick a slot to play a memory",
    all: "All",
    empty: "Nothing in here yet.",
    error: "The clips couldn't load. Check the internet connection and refresh the page."
  },
  player: {
    close: "Close", previous: "Previous clip", next: "Next clip",
    unavailable: "This clip can't play here, but you can still watch it on YouTube.",
    openOnYouTube: "Open on YouTube"
  },
  // proposal.html question page (js/proposal.js). Wording may contain {name}: it becomes "baby" (nameWord) or, when
  // useUsername is true, her saved username. Edit the strings freely; keep {name} wherever the pet name belongs.
  proposal: {
    title: "A question for you",
    line1: "hi {name},",
    line2: "will you be my {name} forever?",
    cheeky: "are you sure, {name}?",
    confirm: "I knew you would say yes, {name}.",
    yes: "Yes",
    no: "No",
    useUsername: false,   // false = use nameWord ("baby"); true = use the username she chose at sign-up
    nameWord: "baby",     // the word {name} stands for while useUsername is false (also the fallback if no username is saved)
    // timing, in ms (the 1.8s fade of each line itself is in style.css)
    firstLineDelayMs: 900,   // pause after the page opens before "hi baby,"
    beatMs: 2400,            // pause between line 1 and line 2
    buttonsDelayMs: 2800,    // pause after line 2 before Yes / No appear
    dodgesBeforeCheeky: 4,   // after this many dodges No shrinks, Yes grows and the cheeky line appears (once)
    yesBeatMs: 2800,         // after Yes: celebration + confirmation shown this long before fading to letter.html
    yesBeatReducedMs: 900    // the same beat under reduced motion
  },
  // read aloud by screen readers only
  labels: { theme: "Minimal theme", seal: "Open the envelope", collections: "Collections", letter: "Letter" },
  // music controls (js/common.js); placeholder wording, edit freely
  music: {
    resume: "Tap to resume music",
    mute: "Mute music",
    unmute: "Unmute music"
  },
  // shared header / footer / page titles (js/common.js); placeholder wording, edit freely
  site: {
    brand: "For you",
    footer: "Made with love, just for you",
    titles: { letter: "A letter for you", memories: "Our memories", inbox: "What you wrote" },
    nav: { letter: "Letter", memories: "Memories", inbox: "Inbox" },
    // shown (in the footer line) when she clicks a page that isn't open yet
    locked: {
      letter: "This one opens once you've said yes.",
      memories: "This one opens once you've written back.",
      inbox: "This one opens once you've written back."
    },
    labels: { pages: "Pages", inbox: "Inbox", inboxNew: "Inbox, 1 new", theme: "Switch theme" }
  },
  // The gate (index.html): the sliding card she lands on. The panel invites her to sign up the
  // first time; once her account exists it turns into a warm nudge back to signing in instead.
  welcome: {
    title: "Welcome back",            // heading over the sign-in fields
    panelTitle: "Hello you",          // the coloured panel, before she has an account
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
    iconLabel: "Pili ka pfp bwhehe",
    musicLabel: "MUSIC TASTEEE",
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
      secret: "Whisper me our secret word first, please?",
      music: "Pick a song for us first, please?"
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
    // "not me" confirmation dialog: forgets only this device, never the saved account
    confirm: {
      title: "Not you?",
      text: "This forgets who this device was signed in as. Nothing you saved is deleted.",
      yes: "Yes, start fresh",
      no: "Keep me here"
    }
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
  // letter reply + inbox wording (Phase 3 P6); edit freely, same CONFIG convention
  reply: {
    label: "Write back?",
    submit: "submit sa baby ko",
    nudge: "Say anything, or leave it blank — I'll still see this.",
    inboxTitle: "What you wrote",
    inboxEmpty: "Nothing here yet.",
    placeholder: "Write something here...",
    toMemories: "Open our memories"
  }
};

const MOODS = [
  { id: "masak8 :<, pero it'll come to pass(no baby tell me)", emoji: "\u{1F622}", label: "i'm not okay" },
  { id: "i'm not fine", emoji: "\u{1F641}", label: "A little down" },
  { id: "k lang.", emoji: "\u{1F610}", label: "sakto lang.." },
  { id: "okay lang", emoji: "\u{1F642}", label: "Happy" },
  { id: "I'M VERY HAPPY BABY", emoji: "\u{1F604}", label: "SOAPER HAPPY BABYYY" }
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
  { id: "a17", label: "Setup", file: "assets/icons/avatar-17.jpg" },
  { id: "a18", label: "Morning", file: "assets/icons/avatar-18.jpg" }
];
// Her own photo: the upload tile is added after the list above. The picked file never leaves the
// browser - it is cropped to a square and shrunk to AVATAR_PX before being stored, so it stays
// small enough for localStorage (and for a Sheet cell when the backend is switched on).
const AVATAR_PX = 256;        // [128-384] stored size of an uploaded photo
const AVATAR_QUALITY = 0.82;  // [0.6-0.9] JPEG quality for an uploaded photo
const AVATAR_MAX_CHARS = 40000; // a Sheet cell holds 50k; above this the photo stays on her device only

// Placeholder tracks for "choose your music". SWAP REAL FILES IN HERE: drop your own
// audio files under /assets/music/ (mp3, ogg or wav all work) and update `file` below -
// the placeholders here are real (silent) files so a normal run never 404s; any missing/
// broken file is still handled gracefully regardless, see startMusic() below.
const MUSIC = [
  { id: "track-1", title: "Track 1 (placeholder)", file: "assets/music/track-1.wav" },
  { id: "track-2", title: "Track 2 (placeholder)", file: "assets/music/track-2.wav" },
  { id: "track-3", title: "Track 3 (placeholder)", file: "assets/music/track-3.wav" }
];

// Top-level const above is already global to other classic scripts; hang them on Surprise too, for explicitness.
Surprise.APPS_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbzMOcR-BNlTO8dC6Z7XhjNM_CAPMU-AN3QZkIffp0dWPK07Sx3lpIbyRPBvn6IlYXS88w/exec";
Surprise.CONFIG = CONFIG;
Surprise.MOODS = MOODS;
Surprise.ICONS = ICONS;
Surprise.AVATAR_PX = AVATAR_PX;
Surprise.AVATAR_QUALITY = AVATAR_QUALITY;
Surprise.AVATAR_MAX_CHARS = AVATAR_MAX_CHARS;
Surprise.MUSIC = MUSIC;
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
