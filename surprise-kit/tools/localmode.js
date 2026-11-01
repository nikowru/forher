// Serves this project with APPS_SCRIPT_URL blanked, so the site runs in LOCAL mode: every read and
// write goes to localStorage instead of the deployed Apps Script and the real Sheet.
//
// Why this exists: js/config.js holds a live deployment URL, so opening the pages any other way -
// file://, Live Server, python -m http.server - talks to her actual account. A browser test run
// that way once appended a reply row and flipped her progress flags on the live Sheet.
//
// Nothing on disk is modified; the rewrite happens in flight. If the rewrite ever fails to match,
// this refuses to serve rather than quietly handing out the live URL.
//
//   node tools/localmode.js [port]        default 3012
//
const http = require("http"), fs = require("fs"), path = require("path");
const ROOT = path.join(__dirname, "..");
const PORT = Number(process.argv[2]) || 3012;
const CONFIG = "/js/config.js";
const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8", ".json": "application/json; charset=utf-8", ".svg": "image/svg+xml",
  ".wav": "audio/wav", ".mp3": "audio/mpeg", ".mp4": "video/mp4", ".webm": "video/webm",
  ".gif": "image/gif", ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg",
  ".webp": "image/webp", ".woff2": "font/woff2", ".ttf": "font/ttf", ".ico": "image/x-icon" };

// The const declaration carries the value; the Surprise.* export line only forwards it.
const blank = src => src.replace(/const APPS_SCRIPT_URL\s*=\s*"[^"]*"/, 'const APPS_SCRIPT_URL = ""');

// Prove the rewrite works before accepting a single request. A regex that silently stops matching
// - because the declaration was reformatted - would serve the live URL and look perfectly fine.
(function selfCheck() {
  const file = path.join(ROOT, CONFIG);
  if (!fs.existsSync(file)) fail("cannot find " + CONFIG);
  const src = fs.readFileSync(file, "utf8");
  if (!/const APPS_SCRIPT_URL\s*=\s*"[^"]*"/.test(src)) fail("the APPS_SCRIPT_URL declaration in " + CONFIG + " no longer matches the pattern this rewrites");
  if (/script\.google\.com/.test(blank(src))) fail("blanking left a live URL behind in " + CONFIG);
  function fail(why) { console.error("\n  REFUSING TO START: " + why + "\n  Fix this before testing, or a run will hit the live Sheet.\n"); process.exit(1); }
})();

http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split("?")[0].split("#")[0]);
  if (p === "/") p = "/index.html";
  if (p.indexOf("\0") >= 0) { res.writeHead(400); return res.end("bad"); }
  const tries = [p]; if (!path.extname(p)) tries.push(p + ".html");
  for (const c of tries) {
    const file = path.join(ROOT, c);
    if (path.relative(ROOT, file).startsWith("..")) continue;   // no climbing out of the project
    try {
      if (!fs.existsSync(file) || !fs.statSync(file).isFile()) continue;
      let body = fs.readFileSync(file);
      if (c === CONFIG) {
        const out = blank(body.toString("utf8"));
        if (/script\.google\.com/.test(out)) {                   // never hand out the live URL
          res.writeHead(500); return res.end("local-mode rewrite failed; refusing to serve config.js");
        }
        body = Buffer.from(out, "utf8");
      }
      res.writeHead(200, { "content-type": TYPES[path.extname(file)] || "application/octet-stream", "cache-control": "no-store" });
      return res.end(body);
    } catch (e) { /* fall through to 404 */ }
  }
  res.writeHead(404); res.end("not found");
}).listen(PORT, () => {
  console.log("\n  local mode on http://localhost:" + PORT);
  console.log("  APPS_SCRIPT_URL is blanked in flight - localStorage is the backend.");
  console.log("  Nothing here can reach the live Sheet.\n");
});
