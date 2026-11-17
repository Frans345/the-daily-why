/* The Daily Why — front end
   Plain JavaScript, no build step. Reads data/index.json and data/articles/<date>.json. */
(function () {
  "use strict";

  const app = document.getElementById("app");
  const PREVIEW = window.TDW_DATA || null;    // set only in the offline preview build
  const NEW_DAY_HOUR = 6;                      // new topic appears at 06:00
  const TZ_OFFSET = 2;                         // South African time (UTC+2, no daylight saving)

  /* ---------- small helpers ---------- */
  const esc = (s) => String(s == null ? "" : s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");

  const store = {
    get(key, fallback) {
      try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : fallback; }
      catch (e) { return fallback; }
    },
    set(key, value) { try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) { /* storage off */ } }
  };

  // The "site day": South African date, rolling over at 06:00.
  function siteDay(shiftDays = 0) {
    const ms = Date.now() + (TZ_OFFSET - NEW_DAY_HOUR) * 3600e3 + shiftDays * 864e5;
    return new Date(ms).toISOString().slice(0, 10);
  }

  function prettyDate(iso, opts) {
    const d = new Date(iso + "T12:00:00Z");
    return d.toLocaleDateString("en-ZA", Object.assign({ weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }, opts));
  }

  /* ---------- data ---------- */
  let indexCache = null;
  const articleCache = {};

  async function getIndex() {
    if (indexCache) return indexCache;
    let list;
    if (PREVIEW) list = PREVIEW.index;
    else {
      const res = await fetch("data/index.json", { cache: "no-cache" });
      if (!res.ok) throw new Error("Could not load the article list");
      list = await res.json();
    }
    const today = siteDay();
    // Only show articles whose day has arrived, newest first.
    indexCache = list.filter((a) => a.date <= today).sort((a, b) => b.date.localeCompare(a.date));
    return indexCache;
  }

  async function getArticle(date) {
    if (articleCache[date]) return articleCache[date];
    let a;
    if (PREVIEW) a = PREVIEW.articles[date];
    else {
      const res = await fetch("data/articles/" + date + ".json");
      if (!res.ok) throw new Error("Could not load that article");
      a = await res.json();
    }
    articleCache[date] = a;
    return a;
  }

  /* ---------- progress: read days + streak ---------- */
  const done = () => store.get("tdw-done", []);

  function markDone(date) {
    const list = done();
    if (!list.includes(date)) { list.push(date); store.set("tdw-done", list); }
    renderStreak();
  }

  function streakCount() {
    const set = new Set(done());
    let day = 0;
    if (!set.has(siteDay(0))) day = -1;      // today not finished yet: streak still alive from yesterday
    let count = 0;
    while (set.has(siteDay(day))) { count++; day--; }
    return count;
  }

  function renderStreak() {
    const el = document.getElementById("streak");
    const n = streakCount();
    if (n > 0) { el.hidden = false; el.textContent = n + "-day streak"; }
    else el.hidden = true;
  }

  /* ---------- images ---------- */
  function placeholder() {
    return '<div class="placeholder" aria-hidden="true"><span>?</span></div>';
  }

  function imageHtml(img, alt) {
    if (img && img.url) return '<img src="' + esc(img.url) + '" alt="' + esc(img.alt || alt) + '" loading="lazy" decoding="async" onerror="this.replaceWith(Object.assign(document.createElement(\'div\'),{className:\'placeholder\',innerHTML:\'<span>?</span>\'}))">';
    return placeholder();
  }

  /* ---------- views ---------- */
  function setNav(current) {
    document.querySelectorAll(".nav-link").forEach((a) => {
      if (a.getAttribute("href") === "#" + current) a.setAttribute("aria-current", "page");
      else a.removeAttribute("aria-current");
    });
  }

  async function showArticle(date, isToday) {
    const index = await getIndex();
    if (!index.length) { app.innerHTML = '<p class="empty">The first topic is on its way. Check back tomorrow morning.</p>'; return; }
    if (!date) date = index[0].date;

    const pos = index.findIndex((a) => a.date === date);
    if (pos === -1) { app.innerHTML = '<p class="empty">That topic could not be found. <a href="#">Go to today\'s topic</a>.</p>'; return; }

    const a = await getArticle(date);
    const older = index[pos + 1] || null;
    const newer = index[pos - 1] || null;

    // "Yesterday's question" uses the previous article's first recall question.
    let yesterdayHtml = "";
    if (isToday && older) {
      const prev = await getArticle(older.date).catch(() => null);
      if (prev && prev.recall && prev.recall[0]) {
        yesterdayHtml =
          '<aside class="yesterday" aria-label="Yesterday\'s question">' +
            '<span class="label">Yesterday\'s question</span>' +
            '<p>' + esc(prev.recall[0].q) + '</p>' +
            '<details><summary>Think of your answer, then tap to check</summary>' +
              '<p class="ans">' + esc(prev.recall[0].a) + '</p>' +
              '<a class="back" href="#a-' + esc(prev.date) + '">Re-read: ' + esc(prev.title) + '</a>' +
            '</details>' +
          '</aside>';
      }
    }

    const sections = (a.sections || []).map((s) =>
      '<h2>' + esc(s.heading) + '</h2>' + (s.paragraphs || []).map((p) => '<p>' + esc(p) + '</p>').join("")
    ).join("");

    const recall = (a.recall || []).map((r) =>
      '<li><details class="q"><summary>' + esc(r.q) + '</summary><p class="a">' + esc(r.a) + '</p></details></li>'
    ).join("");

    const img = a.image || {};
    let caption = "";
    if (img.url && (img.credit || img.license)) {
      caption = '<figcaption>' + esc(img.alt || "") + (img.alt ? " · " : "") + 'Image: ' + esc(img.credit || "Wikimedia Commons") +
        (img.license ? ", " + esc(img.license) : "") +
        (img.sourceUrl ? ' · <a href="' + esc(img.sourceUrl) + '" rel="noopener">source</a>' : "") + '</figcaption>';
    }

    const already = done().includes(a.date);

    app.innerHTML =
      '<article class="article fade-in">' +
        '<div class="meta">' +
          '<span class="pill">' + esc(a.category) + '</span>' +
          '<span>' + (isToday ? "Today · " : "") + esc(prettyDate(a.date)) + '</span>' +
          '<span class="dot">' + esc(a.readMinutes || 5) + ' min read</span>' +
        '</div>' +
        '<h1 class="title">' + esc(a.title) + '</h1>' +
        '<p class="hook">' + esc(a.hook) + '</p>' +
        yesterdayHtml +
        '<figure class="figure"><div class="frame" id="frame">' + imageHtml(img, a.title) + '</div>' + caption + '</figure>' +
        '<div class="body">' + sections + '</div>' +
        '<section class="remember" aria-label="Remember it like this">' +
          '<span class="label">Remember it like this</span>' +
          '<blockquote>' + esc(a.rememberIt) + '</blockquote>' +
        '</section>' +
        '<section class="recall" aria-labelledby="recall-h">' +
          '<h2 id="recall-h">Quick recall</h2>' +
          '<p class="intro">Try to answer each one in your head before you reveal it. This is the part that makes it stick.</p>' +
          '<ol>' + recall + '</ol>' +
          '<p class="done-note' + (already ? " show" : "") + '" id="done-note" role="status">' +
            (already ? "Done. This one's in the bank." : "") + '</p>' +
        '</section>' +
        (a.source && a.source.url ? '<p class="source">Based on the Wikipedia article <a href="' + esc(a.source.url) + '" rel="noopener">' + esc(a.source.title) + '</a>.</p>' : "") +
        '<nav class="pager" aria-label="More topics">' +
          (older ? '<a href="#a-' + esc(older.date) + '"><small>Previous</small>' + esc(older.title) + '</a>' : "") +
          (newer ? '<a class="next" href="#a-' + esc(newer.date) + '"><small>Next</small>' + esc(newer.title) + '</a>' : "") +
        '</nav>' +
      '</article>';

    // Recall tracking: revealing all questions marks the day as done.
    const qs = app.querySelectorAll(".q");
    qs.forEach((d) => d.addEventListener("toggle", () => {
      const allOpened = Array.from(qs).every((x) => x.dataset.seen === "1" || x.open);
      if (d.open) d.dataset.seen = "1";
      if (allOpened && qs.length) {
        const note = document.getElementById("done-note");
        if (!note.classList.contains("show")) {
          note.textContent = "Nice. That's today's topic locked in. See you tomorrow.";
          note.classList.add("show");
        }
        // Streak only counts the current day's topic.
        if (a.date === siteDay()) markDone(a.date);
        else { const list = done(); if (!list.includes("read:" + a.date)) { list.push("read:" + a.date); store.set("tdw-done", list); } }
      }
    }));

    // Old seed articles may have no stored image: try Wikipedia's lead image (works on the live site).
    if (!img.url && a.source && a.source.title && !PREVIEW) loadWikiImage(a.source.title);
  }

  async function loadWikiImage(title) {
    try {
      const res = await fetch("https://en.wikipedia.org/api/rest_v1/page/summary/" + encodeURIComponent(title.replace(/ /g, "_")));
      if (!res.ok) return;
      const data = await res.json();
      const src = (data.originalimage && data.originalimage.source) || (data.thumbnail && data.thumbnail.source);
      const frame = document.getElementById("frame");
      if (!src || !frame) return;
      const im = new Image();
      im.alt = data.title || title; im.decoding = "async";
      im.onload = () => {
        frame.innerHTML = ""; frame.appendChild(im);
        const cap = document.createElement("figcaption");
        cap.innerHTML = 'Image via <a href="' + esc(data.content_urls && data.content_urls.desktop ? data.content_urls.desktop.page : "https://en.wikipedia.org") + '" rel="noopener">Wikipedia</a> (see the article for credit and licence)';
        frame.parentNode.appendChild(cap);
      };
      im.src = src;
    } catch (e) { /* keep placeholder */ }
  }

  async function showArchive() {
    const index = await getIndex();
    const readSet = new Set(done().map((d) => d.replace("read:", "")));

    app.innerHTML =
      '<section class="archive fade-in">' +
        '<h1>Archive</h1>' +
        '<p class="sub">' + index.length + ' topic' + (index.length === 1 ? "" : "s") + ' so far. Revisiting an old one is one of the best ways to keep it.</p>' +
        '<label class="visually-hidden" for="q" style="position:absolute;left:-9999px">Search topics</label>' +
        '<input class="search" id="q" type="search" placeholder="Search topics, e.g. space, money, food" autocomplete="off">' +
        '<div id="results"></div>' +
      '</section>';

    const results = document.getElementById("results");
    const input = document.getElementById("q");

    function draw(term) {
      const t = term.trim().toLowerCase();
      const list = index.filter((a) => !t || (a.title + " " + a.category + " " + (a.hook || "")).toLowerCase().includes(t));
      if (!list.length) { results.innerHTML = '<p class="empty" style="margin:1rem 0">No topics match that yet.</p>'; return; }
      let html = "", month = "";
      list.forEach((a) => {
        const m = prettyDate(a.date, { weekday: undefined, day: undefined, month: "long", year: "numeric" });
        if (m !== month) { if (month) html += "</ul>"; html += '<h2 class="month">' + esc(m) + '</h2><ul class="list">'; month = m; }
        html += '<li class="item"><a href="#a-' + esc(a.date) + '">' +
          '<div class="thumb">' + imageHtml(a.thumb ? { url: a.thumb } : null, "") + '</div>' +
          '<div><h3>' + esc(a.title) + '</h3><span class="when">' + esc(a.category) + ' · ' +
          esc(prettyDate(a.date, { weekday: "short", year: undefined })) +
          (readSet.has(a.date) ? ' · <span class="read-tick">Read</span>' : "") + '</span></div>' +
        '</a></li>';
      });
      results.innerHTML = html + "</ul>";
    }
    draw("");
    input.addEventListener("input", () => draw(input.value));
  }

  /* ---------- routing (#, #archive, #a-YYYY-MM-DD) ---------- */
  async function route() {
    const h = location.hash.replace(/^#/, "");
    try {
      if (h === "archive") { setNav("archive"); await showArchive(); }
      else if (/^a-\d{4}-\d{2}-\d{2}$/.test(h)) {
        setNav("");
        const date = h.slice(2);
        const index = await getIndex();
        await showArticle(date, index[0] && index[0].date === date);
      }
      else { setNav(""); await showArticle(null, true); }
    } catch (e) {
      app.innerHTML = '<p class="empty">Something went wrong loading this page. Please refresh.</p>';
      console.error(e);
    }
    window.scrollTo(0, 0);
    updateProgress();
  }

  /* ---------- reading progress bar ---------- */
  const bar = document.getElementById("progress-bar");
  function updateProgress() {
    const max = document.documentElement.scrollHeight - innerHeight;
    bar.style.width = (max > 0 ? Math.min(100, (scrollY / max) * 100) : 0) + "%";
  }
  addEventListener("scroll", updateProgress, { passive: true });
  addEventListener("resize", updateProgress);

  /* ---------- theme ---------- */
  const root = document.documentElement;
  const savedTheme = store.get("tdw-theme", null);
  const systemDark = matchMedia("(prefers-color-scheme: dark)").matches;
  root.dataset.theme = savedTheme || (systemDark ? "dark" : "light");
  document.getElementById("theme-toggle").addEventListener("click", () => {
    root.dataset.theme = root.dataset.theme === "dark" ? "light" : "dark";
    store.set("tdw-theme", root.dataset.theme);
  });

  addEventListener("hashchange", route);
  renderStreak();
  route();
})();
