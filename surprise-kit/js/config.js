// Shared configuration: all wording, option lists and tunables live here (classic script, shared via window.Surprise).
window.Surprise = window.Surprise || {};

// ---- Google Apps Script backend (optional; see backend/SETUP.md) ----
// Paste your deployed web app URL here once you've followed backend/SETUP.md.
// Leave blank to skip remote saving entirely; sign-up/reply still save locally.
const APPS_SCRIPT_URL = "";
// Paste the published "Memories" tab CSV URL here (backend/SETUP.md step 5).
// Leave blank to use the clips.json placeholders in this repo instead.
const MEMORIES_CSV_URL = "";

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

// ---- Edit all wording here ----
const CONFIG = {
  pageTitle: "A little something for you", // the browser tab
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
  // sign-up card wording (Phase 3 section 4.2); edit freely, same CONFIG convention as the rest of the page
  signup: {
    title: "A little something for you",
    usernameLabel: "What should I call you?",
    usernamePlaceholder: "baby ko",
    moodLabel: "Are you happy?",
    iconLabel: "Choose an icon",
    musicLabel: "Choose your music",
    finalQuestion: "Will you be my baby forever?",
    yes: "Yes",
    no: "No",
    // gentle prompts shown in #su-msg when Yes is pressed with something still missing (first missing one wins)
    missing: {
      username: "Tell me what to call you first, please?",
      mood: "Pick how you're feeling first, please?",
      icon: "Choose an icon you like first, please?",
      music: "Pick a song for us first, please?"
    }
  },
  // intro / dim-and-unfold beat (Phase 3 P5), shown once right after a first-time sign-up
  intro: {
    heading: "uy may love note!"
  },
  // letter reply + inbox wording (Phase 3 P6); edit freely, same CONFIG convention
  reply: {
    label: "Write back?",
    submit: "submit sa baby ko",
    nudge: "Say anything, or leave it blank — I'll still see this.",
    inboxTitle: "What you wrote",
    placeholder: "Write something here...",
    toMemories: "Open our memories"
  }
};

const MOODS = [
  { id: "sad", emoji: "\u{1F622}", label: "Sad" },
  { id: "down", emoji: "\u{1F641}", label: "A little down" },
  { id: "okay", emoji: "\u{1F610}", label: "Okay" },
  { id: "happy", emoji: "\u{1F642}", label: "Happy" },
  { id: "very-happy", emoji: "\u{1F604}", label: "Very happy" }
];

// Placeholder icons for "choose an icon". SWAP REAL FILES IN HERE: replace the files
// at these paths under /assets/icons/ (or change `file`/`label` to point at your own
// images) - keep the {id, label, file} shape, since `id` is what gets saved/sent.
const ICONS = [
  { id: "icon-1", label: "One", file: "assets/icons/icon-1.svg" },
  { id: "icon-2", label: "Two", file: "assets/icons/icon-2.svg" },
  { id: "icon-3", label: "Three", file: "assets/icons/icon-3.svg" },
  { id: "icon-4", label: "Four", file: "assets/icons/icon-4.svg" },
  { id: "icon-5", label: "Five", file: "assets/icons/icon-5.svg" }
];

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
Surprise.APPS_SCRIPT_URL = APPS_SCRIPT_URL;
Surprise.MEMORIES_CSV_URL = MEMORIES_CSV_URL;
Surprise.CONFIG = CONFIG;
Surprise.MOODS = MOODS;
Surprise.ICONS = ICONS;
Surprise.MUSIC = MUSIC;
Surprise.NO = {
  RADIUS: NO_RADIUS, RADIUS_SPEED: NO_RADIUS_SPEED, RADIUS_BONUS_MAX: NO_RADIUS_BONUS_MAX, LOOKAHEAD_MS: NO_LOOKAHEAD_MS,
  FLEE_ACCEL: NO_FLEE_ACCEL, CURVE: NO_CURVE, POINTER_GAIN: NO_POINTER_GAIN, POINTER_GAIN_MAX: NO_POINTER_GAIN_MAX,
  BASE_SPEED: NO_BASE_SPEED, SPEED_FOLLOW: NO_SPEED_FOLLOW, MAX_SPEED: NO_MAX_SPEED, DAMPING: NO_DAMPING, MARGIN: NO_MARGIN,
  WALL_RANGE: NO_WALL_RANGE, WALL_ACCEL: NO_WALL_ACCEL, WALL_SLIDE: NO_WALL_SLIDE, YES_CLEARANCE: NO_YES_CLEARANCE,
  CORNER_ZONE: NO_CORNER_ZONE, CORNER_TRIGGER: NO_CORNER_TRIGGER, GLIDE_MS: NO_GLIDE_MS, DASH_MS: NO_DASH_MS,
  TOUCH_SLOP: NO_TOUCH_SLOP, SWAY_AMP: NO_SWAY_AMP, SWAY_PERIOD_MS: NO_SWAY_PERIOD_MS, IDLE_PAUSE_MS: NO_IDLE_PAUSE_MS, FADE_MS: NO_FADE_MS
};
