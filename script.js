// ---- Edit all wording here ----
const CONFIG = {
  heading: "Would You Like To Open?",
  hint: "A little something for you",
  letter: ["My love,", "Your message goes here: a memory, a promise, something only the two of us would understand.", "Always yours,", "(your name)"],
  button: "Continue",
  scene2: "Our little inventory is opening soon…"
};
const $ = id => document.getElementById(id);
$("title").textContent = CONFIG.heading; $("hint").textContent = CONFIG.hint;
$("go").textContent = CONFIG.button; $("s2").textContent = CONFIG.scene2;
CONFIG.letter.forEach(t => { const p = document.createElement("p"); p.textContent = t; $("letter").insertBefore(p, $("go")); });

// drifting dust and petals
const air = $("air");
for (let i = 0; i < 18; i++) {
  const s = document.createElement("span"), size = 3 + Math.random() * 5, petal = i % 4 === 0;
  if (petal) { s.className = "pt"; s.style.width = s.style.height = size * 2 + "px"; } else { s.style.width = s.style.height = size / 1.6 + "px"; }
  s.style.left = Math.random() * 100 + "vw"; s.style.setProperty("--dx", (Math.random() * 16 - 8) + "vw");
  s.style.animationDuration = 16 + Math.random() * 14 + "s"; s.style.animationDelay = -Math.random() * 30 + "s";
  air.appendChild(s);
}

// opening sequence
const scene = $("scene"); let opened = false;
$("seal").addEventListener("click", () => {
  if (opened) return; opened = true;
  $("seal").classList.add("broken");
  setTimeout(() => scene.classList.add("open"), 350);
  setTimeout(() => scene.classList.add("flapback"), 800);
  setTimeout(() => { scene.classList.add("rise"); $("title").classList.add("fade"); $("hint").classList.add("fade"); }, 1250);
  setTimeout(() => scene.classList.add("read"), 2500);
});
// Scene 2 goes here later (gallery); for now a soft placeholder
$("go").addEventListener("click", () => {
  scene.classList.add("gone");
  setTimeout(() => $("scene2").classList.add("show"), 700);
});
