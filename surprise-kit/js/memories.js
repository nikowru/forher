// Memories page (memories.html): guard, wording, clip inventory (collection tabs + slots) and the video player.
// Classic script; needs js/config.js and js/common.js first (CONFIG and MEMORIES_CSV_URL are config.js globals).
// All clip data comes from the Memories CSV or clips.json; nothing is hard-coded here.
(function () {
  const S = window.Surprise;
  if (!S || !S.Guard) return;
  if (!S.Guard.require("memories")) return; // not unlocked: being sent back to the letter/sign-up, so do not initialise

  const $ = id => document.getElementById(id);
  const gallery = $("gallery");
  document.title = CONFIG.site.titles.memories;
  // Arrival: .show opens the wash (next frame so the transition runs), .settled drops the clip-path once it is done.
  // Always called once setup ends (even if setup threw, or the clip data later fails), so she is never left on a blank page.
  let revealed = false;
  function reveal() {
    if (revealed) return; revealed = true;
    requestAnimationFrame(() => requestAnimationFrame(() => gallery.classList.add("show")));
    setTimeout(() => gallery.classList.add("settled"), 2000);
  }
  try {
  $("tabs").setAttribute("aria-label", CONFIG.labels.collections);
  $("g-title").textContent = CONFIG.gallery.title; $("g-sub").textContent = CONFIG.gallery.sub;
  $("p-close").setAttribute("aria-label", CONFIG.player.close);
  $("p-prev").setAttribute("aria-label", CONFIG.player.previous); $("p-next").setAttribute("aria-label", CONFIG.player.next);

    // ---- scene 2: clip inventory (all clip data comes from clips.json) ----
    const tabs = $("tabs"), grid = $("grid"), msg = $("g-msg");
    let clips = [], shown = [];
    const thumb = id => "https://img.youtube.com/vi/" + encodeURIComponent(id) + "/hqdefault.jpg";
    const niceDate = d => { const t = new Date(d + "T00:00:00"); return isNaN(t) ? d : t.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" }); };

    function slot(c, i) {
      const li = document.createElement("li"), b = document.createElement("button"), frame = document.createElement("span"),
        img = document.createElement("img"), name = document.createElement("span"), when = document.createElement("time");
      b.type = "button"; b.className = "slot";
      img.className = "thumb"; img.alt = ""; img.loading = "lazy"; img.decoding = "async"; img.width = 480; img.height = 360;
      // YouTube answers unknown ids with a 120px grey stand-in; treat that like a missing thumbnail
      img.addEventListener("load", () => { if (img.naturalWidth <= 120) b.classList.add("no-thumb"); });
      img.addEventListener("error", () => b.classList.add("no-thumb"));
      img.src = thumb(c.youtubeId);
      name.className = "name"; name.textContent = c.title;
      when.className = "when"; when.dateTime = c.date; when.textContent = niceDate(c.date);
      frame.className = "frame"; frame.append(img);
      b.append(frame, name, when); li.append(b);
      b.addEventListener("click", () => openClip(i));
      return li;
    }

    function showTab(id) {
      for (const t of tabs.children) { const on = t.dataset.id === id; t.setAttribute("aria-selected", on); t.tabIndex = on ? 0 : -1; }
      $("panel").setAttribute("aria-labelledby", "tab-" + id);
      shown = id === "all" ? clips : clips.filter(c => c.collection === id);
      grid.replaceChildren(...shown.map((c, i) => { const li = slot(c, i); li.style.setProperty("--i", i); return li; }));
      msg.textContent = shown.length ? "" : CONFIG.gallery.empty;
    }

    function buildTabs(collections) {
      for (const c of [{ id: "all", title: CONFIG.gallery.all }, ...collections]) {
        const t = document.createElement("button");
        t.type = "button"; t.setAttribute("role", "tab"); t.id = "tab-" + c.id; t.dataset.id = c.id; t.className = "tab";
        t.setAttribute("aria-controls", "panel");
        if (c.icon) { const i = document.createElement("span"); i.setAttribute("aria-hidden", "true"); i.textContent = c.icon + " "; t.append(i); }
        t.append(c.title);
        t.addEventListener("click", () => showTab(c.id));
        tabs.append(t);
      }
      // arrow keys move between tabs (WAI-ARIA tabs pattern)
      tabs.addEventListener("keydown", e => {
        const list = [...tabs.children], i = list.indexOf(document.activeElement);
        const next = { ArrowRight: i + 1, ArrowLeft: i - 1, Home: 0, End: list.length - 1 }[e.key];
        if (i < 0 || next === undefined) return;
        e.preventDefault();
        const t = list[(next + list.length) % list.length]; t.focus(); t.click();
      });
    }

    // ---- scene 3: clip player (the YouTube player loads only when a slot is clicked) ----
    // <dialog> gives us Esc to close, a focus trap and an inert page behind it for free.
    const player = $("player"), video = $("p-video");
    let yt = null, ytApi = null, current = -1, openId = 0;

    function loadYouTubeApi() {
      ytApi ||= new Promise((ok, fail) => {
        window.onYouTubeIframeAPIReady = ok;
        const s = document.createElement("script");
        s.src = "https://www.youtube.com/iframe_api"; s.onerror = fail;
        document.head.append(s);
      }).catch(err => { ytApi = null; throw err; }); // allow a retry on the next click
      return ytApi;
    }

    function dropPlayer() { if (yt) { yt.destroy(); yt = null; } }

    // FR-8: when a video can't play here, show its caption (already under the video) and a link to YouTube
    function fallback(c) {
      dropPlayer();
      const box = document.createElement("div"), p = document.createElement("p"), a = document.createElement("a");
      box.className = "p-fallback"; p.textContent = CONFIG.player.unavailable;
      a.href = "https://www.youtube.com/watch?v=" + encodeURIComponent(c.youtubeId) + (c.startSeconds ? "&t=" + c.startSeconds + "s" : "");
      a.target = "_blank"; a.rel = "noopener"; a.textContent = CONFIG.player.openOnYouTube;
      box.append(p, a); video.replaceChildren(box);
    }

    function openClip(i) {
      if (!shown.length) return;
      current = (i + shown.length) % shown.length;
      const c = shown[current], id = ++openId, live = () => id === openId && player.open;
      dropPlayer();
      $("p-title").textContent = c.title; $("p-caption").textContent = c.caption || "";
      $("p-count").textContent = (current + 1) + " / " + shown.length;
      $("p-nav").hidden = shown.length < 2;
      const mount = document.createElement("div"); video.replaceChildren(mount);
      if (!player.open) { player.showModal(); $("p-close").focus(); }
      if (!/^[\w-]{11}$/.test(c.youtubeId || "")) return fallback(c);
      // YouTube blocked or very slow: don't leave her looking at a black box
      const timer = setTimeout(() => { if (live() && !yt) fallback(c); }, 10000);
      loadYouTubeApi().then(() => {
        clearTimeout(timer);
        if (!live() || !mount.isConnected) return; // closed, switched clip, or already fell back
        yt = new YT.Player(mount, {
          host: "https://www.youtube-nocookie.com", videoId: c.youtubeId, width: "100%", height: "100%",
          playerVars: { autoplay: 1, start: c.startSeconds || 0, rel: 0, playsinline: 1 },
          events: { onError: () => setTimeout(() => { if (id === openId) fallback(c); }) } // bad id, removed, or embedding off
        });
      }).catch(() => { clearTimeout(timer); if (live()) fallback(c); });
    }

    $("p-prev").addEventListener("click", () => openClip(current - 1));
    $("p-next").addEventListener("click", () => openClip(current + 1));
    player.addEventListener("keydown", e => {
      if (shown.length < 2 || e.altKey || e.ctrlKey || e.metaKey) return;
      if (e.key === "ArrowLeft") { e.preventDefault(); openClip(current - 1); }
      if (e.key === "ArrowRight") { e.preventDefault(); openClip(current + 1); }
    });
    $("p-close").addEventListener("click", () => player.close());
    player.addEventListener("click", e => { if (e.target === player) player.close(); }); // click outside the box
    player.addEventListener("close", () => {
      openId++; dropPlayer();
      video.replaceChildren(); // never leave a player running in the background
      const s = grid.querySelectorAll(".slot")[current]; if (s) s.focus(); // back to the clip she was on
    });

    // friendly warnings in the console (F12) while adding clips; the page still shows what it can
    // `source` just labels where the warning came from (clips.json vs the Memories CSV) - the
    // checks themselves are identical either way, per PRD 6.1 ("same rules apply to both").
    function checkClips(data, source) {
      source ||= "clips.json";
      const cols = new Set((data.collections || []).map(c => c.id)), ids = new Set();
      for (const c of data.clips || []) {
        const w = msg => console.warn(source + ", clip " + (c.id || "(no id)") + ": " + msg);
        if (ids.has(c.id)) w("duplicate id"); ids.add(c.id);
        if (!/^[\w-]{11}$/.test(c.youtubeId || "")) w("youtubeId should be the 11-character id from the YouTube link");
        if (!/^\d{4}-\d{2}-\d{2}$/.test(c.date || "")) w("date should look like 2023-05-14");
        if (!cols.has(c.collection)) w('collection "' + c.collection + '" is not listed in "collections"');
        if (!c.title || !c.caption) w("missing title or caption");
      }
    }

    // ---- Memories CSV (Phase 3 P9): dependency-free, quote-aware CSV parser ----
    // Handles what Google Sheets' published CSV export actually produces: a header row,
    // commas inside quoted fields, an embedded "" as an escaped quote, and \r\n or \n line
    // endings. Not a full RFC4180 implementation - just enough for that one export shape.
    function parseCSV(text) {
      const rows = [];
      let row = [], field = "", inQuotes = false;
      for (let i = 0; i < text.length; i++) {
        const ch = text[i];
        if (inQuotes) {
          if (ch === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else inQuotes = false; }
          else field += ch;
        } else if (ch === '"') inQuotes = true;
        else if (ch === ",") { row.push(field); field = ""; }
        else if (ch === "\r") { /* nothing - the \n that follows (if any) does the row push */ }
        else if (ch === "\n") { row.push(field); rows.push(row); row = []; field = ""; }
        else field += ch;
      }
      if (field !== "" || row.length) { row.push(field); rows.push(row); } // last line with no trailing newline
      return rows;
    }

    // Turns parsed CSV rows (header: title, note, date, youtubeId, collection - backend/SETUP.md
    // step 1.3) into the same {collections, clips} shape clips.json already provides, so
    // checkClips/buildTabs/showTab don't need to know which source they're looking at.
    // There's no separate "collections" sheet - they're derived here from the distinct
    // `collection` values present, in first-seen order; buildTabs only needs {id, title} and
    // already treats `icon` as optional, so these simply have no icon.
    // id scheme: "m" + <row's 1-based position among the data rows, header excluded>, e.g. the
    // first Memories row becomes "m1". That ties id to row position (stable across reloads of
    // the same sheet) rather than to a counter of kept rows, matching clips.json's "id unique"
    // rule without the sheet needing an id column of its own.
    function memoriesFromCSV(text) {
      const rows = parseCSV(text).filter(r => !(r.length === 1 && r[0].trim() === "")); // drop blank lines
      if (rows.length < 2) return null; // header only, or nothing at all - doesn't look right
      const header = rows[0].map(h => h.trim().toLowerCase());
      const idx = name => header.indexOf(name);
      const iTitle = idx("title"), iNote = idx("note"), iDate = idx("date"), iYouTube = idx("youtubeid"), iCollection = idx("collection");
      if (iTitle < 0 || iYouTube < 0 || iCollection < 0) return null; // not the Memories tab's header

      const collections = [], seen = new Set(), clips = [];
      for (let r = 1; r < rows.length; r++) {
        const row = rows[r];
        const title = (row[iTitle] || "").trim(), youtubeId = (row[iYouTube] || "").trim(), collection = (row[iCollection] || "").trim();
        if (!title && !youtubeId) continue; // blank row
        if (!seen.has(collection)) { seen.add(collection); collections.push({ id: collection, title: collection }); }
        clips.push({
          id: "m" + r, youtubeId, title, collection,
          date: iDate >= 0 ? (row[iDate] || "").trim() : "",
          caption: iNote >= 0 ? (row[iNote] || "").trim() : ""
        });
      }
      return clips.length ? { collections, clips } : null; // zero usable rows counts as a failure
    }

    function loadMemoriesCSV() {
      if (!MEMORIES_CSV_URL) return Promise.reject(new Error("MEMORIES_CSV_URL is blank"));
      return fetch(MEMORIES_CSV_URL)
        .then(r => { if (!r.ok) throw new Error("HTTP " + r.status); return r.text(); })
        .then(text => { const data = memoriesFromCSV(text); if (!data) throw new Error("Memories CSV had no usable rows"); return data; });
    }

    function loadClipsJSON() {
      return fetch("clips.json").then(r => { if (!r.ok) throw new Error("HTTP " + r.status); return r.json(); });
    }

    // The api is the one door for data (Phase B swaps its driver). Order: the Memories CSV if a URL is set, then
    // Api.getMemories() (the local driver serves clips.json), then a direct clips.json read as the last resort.
    // Any failure falls through to the next, with the same checkClips hygiene and the same final .catch/error message.
    function loadFromApi() {
      if (!S.Api) return Promise.reject(new Error("api.js not loaded"));
      return S.Api.getMemories().then(r => {
        if (!r || !r.ok || !Array.isArray(r.clips) || !r.clips.length) throw new Error("api: " + (r && r.error || "no clips"));
        const data = { collections: r.collections || [], clips: r.clips };
        checkClips(data, r.source || "api"); return data;
      });
    }
    loadMemoriesCSV()
      .then(data => { checkClips(data, "Memories CSV"); return data; })
      .catch(() => loadFromApi())
      .catch(err => {
        console.warn("surprise-kit: memories api unavailable, falling back to clips.json", err);
        return loadClipsJSON().then(data => { checkClips(data); return data; });
      })
      .then(data => { clips = data.clips || []; buildTabs(data.collections || []); showTab("all"); })
      .catch(err => {
        console.error("clips.json could not be loaded. Open the site through a local server (see README).", err);
        msg.textContent = CONFIG.gallery.error;
      });
  } catch (err) { console.error("surprise-kit: memories page failed to start", err); }
  reveal();
})();
