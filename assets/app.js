/* The Daily Why — front end (v3: General knowledge, Sport, Philosophy)
   Plain JavaScript, no build step.
   Data: data/index.json + data/articles/<date>.json            (general knowledge)
         data/sport/index.json + data/sport/articles/<date>.json
         data/philosophy/index.json + data/philosophy/articles/<date>.json */
(function () {
  "use strict";

  const app = document.getElementById("app");
  const PREVIEW = window.TDW_DATA || null;   // only set in the offline preview build
  const NEW_DAY_HOUR = 6;                     // new topics appear at 06:00
  const TZ_OFFSET = 2;                        // South African time (UTC+2)

  /* ---------- helpers ---------- */
  const esc = (s) => String(s == null ? "" : s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");

  const store = {
    get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* storage off */ } }
  };

  function siteDay(shift = 0) {
    return new Date(Date.now() + (TZ_OFFSET - NEW_DAY_HOUR) * 3600e3 + shift * 864e5).toISOString().slice(0, 10);
  }
  function addDays(iso, n) { const d = new Date(iso + "T12:00:00Z"); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); }
  function prettyDate(iso, opts) {
    return new Date(iso + "T12:00:00Z").toLocaleDateString("en-ZA",
      Object.assign({ weekday: "long", day: "numeric", month: "long", timeZone: "UTC" }, opts));
  }

  /* ---------- icons ---------- */
  const ICON = {
    gear: '<circle cx="12" cy="12" r="3.5"/><path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.3 5.3l2.1 2.1M16.6 16.6l2.1 2.1M5.3 18.7l2.1-2.1M16.6 7.4l2.1-2.1"/>',
    flask: '<path d="M9 3h6M10 3v6l-5.2 8.8A2 2 0 0 0 6.5 21h11a2 2 0 0 0 1.7-3.2L14 9V3M7.5 15h9"/>',
    leaf: '<path d="M5 20c0-9 6-15 15-15 0 9-6 15-15 15ZM5 20l8-8"/>',
    planet: '<circle cx="12" cy="12" r="5.5"/><path d="M3.5 16.5c-1.5-2.5 3-6 8.5-8s10.5-2 11 0.5"/>',
    cup: '<path d="M4 9h12v5a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5ZM16 10.5h1.5a2.5 2.5 0 0 1 0 5H16M8 3.5v2.5M12 3.5v2.5"/>',
    coin: '<circle cx="12" cy="12" r="8.5"/><path d="M14.5 9.3c-.5-.8-1.4-1.3-2.5-1.3-1.5 0-2.6.8-2.6 2s1.1 1.7 2.6 2 2.6.8 2.6 2-1.1 2-2.6 2c-1.1 0-2-.5-2.5-1.3M12 6.5V8M12 16v1.5"/>',
    book: '<path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v15H6.5A2.5 2.5 0 0 0 4 20.5ZM4 20.5A2.5 2.5 0 0 0 6.5 23H20v-5"/>',
    globe: '<circle cx="12" cy="12" r="8.5"/><path d="M3.5 12h17M12 3.5c3 3 3 14 0 17M12 3.5c-3 3-3 14 0 17"/>',
    speech: '<path d="M4 5h16v11H10l-5 4v-4H4Z"/>',
    people: '<circle cx="9" cy="8" r="3.2"/><circle cx="17" cy="9.5" r="2.5"/><path d="M3 20c0-3.3 2.7-5.5 6-5.5s6 2.2 6 5.5M15.5 14.6c3 0 5.5 1.7 5.5 5"/>',
    clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
    flame: '<path d="M12 2.5c.6 3.2 5.5 5.4 5.5 10.5a5.5 5.5 0 0 1-11 0c0-2.4 1.2-4.1 2.4-5.1 0 2 .9 3.3 2.1 3.6-.4-3.6.4-6.2 1-9Z"/>',
    check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
    x: '<path d="M6.5 6.5l11 11M17.5 6.5l-11 11"/>',
    bulb: '<path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-3.6 10.8c.6.5 1 1.2 1 2V16h5.2v-.2c0-.8.4-1.5 1-2A6 6 0 0 0 12 3Z"/>',
    spark: '<path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M6 18l2.5-2.5M15.5 8.5 18 6"/>',
    timer: '<circle cx="12" cy="13" r="7.5"/><path d="M12 9.5V13l2 1.5M9.5 2.5h5"/>',
    calendar: '<rect x="3.5" y="5" width="17" height="15.5" rx="2.5"/><path d="M3.5 10h17M8 3v4M16 3v4"/>',
    brain: '<path d="M9 4.5a3 3 0 0 0-3 3 3 3 0 0 0-2 5 3 3 0 0 0 2 5 3 3 0 0 0 3 2.5h0a2.5 2.5 0 0 0 3-2.4V6.8A2.5 2.5 0 0 0 9 4.5ZM15 4.5a3 3 0 0 1 3 3 3 3 0 0 1 2 5 3 3 0 0 1-2 5 3 3 0 0 1-3 2.5 2.5 2.5 0 0 1-3-2.4"/>',
    ball: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5l3.6 2.6-1.4 4.2H9.8l-1.4-4.2ZM12 3.5v4M15.6 10.1l4.4-1.4M14.2 14.3l2.7 3.8M9.8 14.3l-2.7 3.8M8.4 10.1 4 8.7"/>',
    trophy: '<path d="M8 4h8v5a4 4 0 0 1-8 0ZM8 6H5a3 3 0 0 0 3 4M16 6h3a3 3 0 0 1-3 4M12 13v4M8.5 20.5h7M10 17h4v3.5h-4Z"/>',
    column: '<path d="M3.5 21h17M5 18h14M6.5 18V9.5M10 18V9.5M14 18V9.5M17.5 18V9.5M4 9.5h16M12 3l8.5 4.5h-17Z"/>',
    grid: '<rect x="4" y="4" width="7" height="7" rx="1.5"/><rect x="13" y="4" width="7" height="7" rx="1.5"/><rect x="4" y="13" width="7" height="7" rx="1.5"/><rect x="13" y="13" width="7" height="7" rx="1.5"/>',
    arrow: '<path d="M5 12h14M13 6l6 6-6 6"/>'
  };
  const icon = (name, fill) => '<svg viewBox="0 0 24 24" aria-hidden="true" fill="' + (fill ? "currentColor" : "none") +
    '" stroke="currentColor" stroke-width="' + (fill ? 0 : 1.8) + '" stroke-linecap="round" stroke-linejoin="round">' + (ICON[name] || ICON.spark) + '</svg>';

  /* ---------- the three sections ---------- */
  const SECTIONS = {
    general: {
      label: "General knowledge", base: "data/", color: "#f2711c", icon: "spark",
      tagline: (d) => "Here's your why for " + d + ".", tick: "I learned something today", archiveTitle: "General knowledge"
    },
    sport: {
      label: "Sport", base: "data/sport/", color: "#12844a", icon: "ball",
      tagline: () => "Today's story from the world of sport.", tick: "Got it. Tick it off", archiveTitle: "Sport"
    },
    philosophy: {
      label: "Philosophy", base: "data/philosophy/", color: "#3f3a8f", icon: "column",
      tagline: () => "Today's great thinker, in five minutes.", tick: "I've thought about it", archiveTitle: "Philosophy"
    }
  };
  const SECTION_KEYS = Object.keys(SECTIONS);

  // General knowledge categories each get their own colour and icon.
  const CATEGORIES = {
    "How things work":                { color: "#e2683c", icon: "gear" },
    "Science in everyday life":       { color: "#3b82c4", icon: "flask" },
    "Nature and animals":             { color: "#3f9b5a", icon: "leaf" },
    "Space":                          { color: "#6d5bd0", icon: "planet" },
    "Food and drink":                 { color: "#d9822b", icon: "cup" },
    "Money and the economy":          { color: "#1f9d8a", icon: "coin" },
    "History behind everyday things": { color: "#b0613a", icon: "book" },
    "Places and the world":           { color: "#2b8fb0", icon: "globe" },
    "Language and words":             { color: "#c2477a", icon: "speech" },
    "People and society":             { color: "#8a5cc2", icon: "people" },
    "Time and calendars":             { color: "#c98a1a", icon: "clock" }
  };
  function look(section, category) {
    if (section === "sport") return { color: null, icon: category === "Olympics and more" || category === "Athletics" ? "trophy" : "ball" };
    if (section === "philosophy") return { color: null, icon: "column" };
    return CATEGORIES[category] || { color: "#e2683c", icon: "spark" };
  }
  function catStyle(section, category) {
    const c = look(section, category).color;
    if (!c) return "";
    return '--accent:' + c + ';--accent-soft:color-mix(in srgb,' + c + ' 15%, var(--surface));--accent-ink:color-mix(in srgb,' + c + ' 78%, var(--ink));';
  }
  const chip = (section, category) => '<span class="chip">' + icon(look(section, category).icon) + esc(category) + '</span>';
  const placeholder = (section, category) => '<div class="placeholder">' + icon(look(section, category).icon) + '</div>';

  /* ---------- data ---------- */
  const indexCache = {};
  const articleCache = {};

  async function getIndex(section) {
    if (indexCache[section]) return indexCache[section];
    let list = [];
    if (PREVIEW) list = (PREVIEW[section] && PREVIEW[section].index) || [];
    else {
      const res = await fetch(SECTIONS[section].base + "index.json", { cache: "no-cache" });
      list = res.ok ? await res.json() : [];
    }
    const today = siteDay();
    return (indexCache[section] = list.filter((a) => a.date <= today).sort((a, b) => b.date.localeCompare(a.date)));
  }

  async function getArticle(section, date) {
    const key = section + ":" + date;
    if (articleCache[key]) return articleCache[key];
    let a;
    if (PREVIEW) a = PREVIEW[section].articles[date];
    else {
      const res = await fetch(SECTIONS[section].base + "articles/" + date + ".json");
      if (!res.ok) throw new Error("Could not load that article");
      a = await res.json();
    }
    return (articleCache[key] = a);
  }

  /* ---------- the reader: name, streak, progress ---------- */
  const reader = {
    name: () => store.get("tdw-name", ""),
    days: () => store.get("tdw-days", []),       // site days on which you ticked off at least one of that day's topics
    read: () => store.get("tdw-read", []),       // "section:date" for every topic you've ticked off
    best: () => store.get("tdw-best", 0)
  };

  // Keep progress saved by older versions of the site.
  (function migrate() {
    const old = store.get("tdw-done", null);
    if (old) {
      const days = old.filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d));
      const read = old.map((d) => "general:" + d.replace("read:", ""));
      store.set("tdw-days", Array.from(new Set(reader.days().concat(days))));
      store.set("tdw-read", Array.from(new Set(reader.read().concat(read))));
      try { localStorage.removeItem("tdw-done"); } catch (e) { /* ignore */ }
    }
    const r = reader.read();
    if (r.some((x) => /^\d/.test(x))) store.set("tdw-read", r.map((x) => (/^\d/.test(x) ? "general:" + x : x)));
  })();

  const isRead = (section, date) => reader.read().includes(section + ":" + date);

  function currentStreak() {
    const set = new Set(reader.days());
    let day = set.has(siteDay(0)) ? 0 : -1;
    let n = 0;
    while (set.has(siteDay(day))) { n++; day--; }
    return n;
  }

  function tickOff(section, date) {
    const read = reader.read();
    const key = section + ":" + date;
    if (!read.includes(key)) { read.push(key); store.set("tdw-read", read); }
    if (date === siteDay()) {
      const days = reader.days();
      if (!days.includes(date)) { days.push(date); store.set("tdw-days", days); }
    }
    const s = currentStreak();
    if (s > reader.best()) store.set("tdw-best", s);
    renderChip(); renderTabs(currentSection);
    return s;
  }

  async function todaysTopics() {
    const out = {};
    for (const k of SECTION_KEYS) {
      const idx = await getIndex(k);
      out[k] = idx[0] && idx[0].date === siteDay() ? idx[0].date : null;
    }
    return out;
  }

  function streakMessage(n, tickedToday, doneCount) {
    if (!tickedToday) {
      if (n === 0) return "Read any of today's topics and tick it off at the bottom to start your streak.";
      return "Tick off one of today's topics to make it " + (n + 1) + " days in a row.";
    }
    const milestones = {
      1: "First one done. That's how every habit starts.",
      3: "Three days in a row. This is becoming a habit.",
      5: "Five days straight. Your brain is warming up nicely.",
      7: "A full week. Seven days of new things in your head.",
      14: "Two weeks without missing a day. Seriously impressive.",
      21: "21 days. They say that's how long a habit takes to stick.",
      30: "A whole month. You're officially the person who knows things.",
      50: "50 days. Legend status is close.",
      100: "100 days. Legendary."
    };
    const extra = doneCount === 3 ? " All three topics done today. Clean sweep." : doneCount === 2 ? " Two out of three today." : "";
    return (milestones[n] || "Day " + n + ". Streak safe. See you tomorrow at 06:00.") + extra;
  }

  async function streakCardHtml() {
    const n = currentStreak();
    const today = siteDay();
    const ticked = reader.days().includes(today);
    const days = new Set(reader.days());
    const dow = (new Date(today + "T12:00:00Z").getUTCDay() + 6) % 7;
    const letters = ["M", "T", "W", "T", "F", "S", "S"];
    let week = "";
    for (let i = 0; i < 7; i++) {
      const d = addDays(today, i - dow);
      const cls = ["day", days.has(d) ? "done" : "", d === today ? "today" : "", d > today ? "future" : ""].join(" ");
      week += '<div class="' + cls + '" data-day="' + d + '"><span class="dot">' + icon("check") + '</span>' + letters[i] + '</div>';
    }
    const topics = await todaysTopics();
    let doneCount = 0;
    const pills = SECTION_KEYS.map((k) => {
      const date = topics[k];
      const done = date && isRead(k, date);
      if (done) doneCount++;
      return '<a class="today-pill' + (done ? " done" : "") + '" style="--pill:' + SECTIONS[k].color + '" href="#' + k + '">' +
        '<span class="c">' + icon("check") + '</span>' + esc(SECTIONS[k].label) + '</a>';
    }).join("");
    return '<section class="streak-card' + (n ? "" : " cold") + '" id="streak" aria-label="Your reading streak">' +
      '<div class="streak-top">' +
        '<div class="flame">' + icon("flame", true) + '</div>' +
        '<div><div class="streak-num">' + n + ' day' + (n === 1 ? "" : "s") + '</div>' +
        '<div class="streak-sub">Best streak: ' + Math.max(n, reader.best()) + ' · Topics learned: ' + reader.read().length + '</div></div>' +
      '</div>' +
      '<div class="week">' + week + '</div>' +
      '<div class="today-row" aria-label="Today\'s topics">' + pills + '</div>' +
      '<p class="streak-msg">' + esc(streakMessage(n, ticked, doneCount)) + '</p>' +
    '</section>';
  }

  function renderChip() {
    const el = document.getElementById("streak-chip");
    const n = currentStreak();
    el.innerHTML = icon("flame", true) + n;
    el.classList.toggle("cold", !reader.days().includes(siteDay()));
    el.setAttribute("aria-label", n + " day streak");
    el.setAttribute("href", "#" + (currentSection === "general" ? "" : currentSection));
  }

  function greeting() {
    const h = new Date().getHours();
    const part = h < 5 ? "Up late" : h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
    const name = reader.name();
    return part + (name ? ", " + name : "") + ".";
  }

  /* ---------- header: tabs + archive link ---------- */
  let currentSection = "general";

  async function renderTabs(active, isArchive) {
    const tabs = document.getElementById("tabs");
    const topics = await todaysTopics().catch(() => ({}));
    tabs.innerHTML = SECTION_KEYS.map((k) => {
      const learned = topics[k] && isRead(k, topics[k]);
      return '<a class="tab' + (learned ? " learned" : "") + '" style="--tab-color:' + SECTIONS[k].color + '" href="#' + (k === "general" ? "general" : k) + '"' +
        (!isArchive && k === active ? ' aria-current="page"' : "") + '>' + icon(SECTIONS[k].icon) + esc(SECTIONS[k].label) +
        '<span class="tick" title="Done today">' + icon("check") + '</span></a>';
    }).join("");
    const al = document.getElementById("archive-link");
    al.setAttribute("href", "#archive-" + active);
    if (isArchive) al.setAttribute("aria-current", "page"); else al.removeAttribute("aria-current");
  }

  function setSection(section) {
    currentSection = section;
    document.body.dataset.section = section;
  }

  /* ---------- pictures ---------- */
  function imgTag(src, alt) {
    return '<img src="' + esc(src) + '" alt="' + esc(alt || "") + '" loading="lazy" decoding="async" onerror="this.closest(\'[data-hide-on-error]\')?.remove();this.remove()">';
  }
  function creditHtml(img) {
    if (!img) return "";
    return 'Photo: ' + esc(img.credit || "Wikimedia Commons") + (img.license ? ", " + esc(img.license) : "") +
      (img.sourceUrl ? ' · <a href="' + esc(img.sourceUrl) + '" rel="noopener">source</a>' : "");
  }

  // For articles saved without pictures: fetch photos from the Wikipedia article (live site only).
  let currentView = 0;
  const pictureCache = {};
  function wikiPictures(title) {
    if (!pictureCache[title]) pictureCache[title] = fetchWikiPictures(title).catch((e) => { delete pictureCache[title]; throw e; });
    return pictureCache[title];
  }
  async function fetchWikiPictures(title) {
    const base = "https://en.wikipedia.org/w/api.php?format=json&formatversion=2&origin=*&redirects=1&";
    const q = (p) => fetch(base + new URLSearchParams(p)).then((r) => r.json());
    const [lead, files] = await Promise.all([
      q({ action: "query", titles: title, prop: "pageimages", piprop: "name" }),
      q({ action: "query", titles: title, generator: "images", gimlimit: "40", prop: "imageinfo", iiprop: "url|extmetadata|size|mime", iiurlwidth: "1200" })
    ]);
    const leadName = ((lead && lead.query && lead.query.pages && lead.query.pages[0] && lead.query.pages[0].pageimage) || "").replace(/ /g, "_");
    const BAD = /(logo|icon|flag|symbol|seal|coat[_ ]of|signature|commons-|wiki|edit-|question|portal|padlock|disambig|stub|ambox|crystal|nuvola)/i;
    const pages = (files && files.query && files.query.pages) || [];
    const strip = (s) => String((s && s.value) || "").replace(/<[^>]*>/g, "").trim();
    const pics = pages.map((p) => {
      const ii = p.imageinfo && p.imageinfo[0];
      if (!ii || !/image\/(jpeg|png|webp)/.test(ii.mime || "") || ii.width < 500 || ii.height < 300 || BAD.test(p.title)) return null;
      const m = ii.extmetadata || {};
      const name = p.title.replace(/^File:/, "");
      return {
        isLead: name.replace(/ /g, "_") === leadName,
        url: ii.thumburl || ii.url,
        alt: strip(m.ObjectName) || name.replace(/\.\w+$/, "").replace(/_/g, " "),
        credit: strip(m.Artist).slice(0, 100) || "Wikimedia Commons",
        license: strip(m.LicenseShortName),
        sourceUrl: ii.descriptionurl
      };
    }).filter((p) => p && p.license);
    pics.sort((a, b) => b.isLead - a.isLead);
    return pics.slice(0, 4);
  }

  /* ---------- article building blocks ---------- */
  function nameCardHtml() {
    if (reader.name() || store.get("tdw-name-skip", false)) return "";
    return '<section class="name-card" id="name-card">' +
      '<p>Hi, welcome to The Daily Why. Three short topics a day: general knowledge, sport and philosophy. What should I call you?</p>' +
      '<form id="name-form"><label class="sr-only" for="name-input">Your first name</label>' +
        '<input id="name-input" maxlength="24" placeholder="Your first name" autocomplete="given-name">' +
        '<button class="btn" type="submit">Save</button></form>' +
      '<button class="link-btn" type="button" id="name-skip">Maybe later</button>' +
    '</section>';
  }

  function chapterHtml(s, i) {
    return '<section class="chapter"><span class="chapter-num">' + String(i + 1).padStart(2, "0") + '</span>' +
      '<h2>' + esc(s.heading) + '</h2>' + (s.paragraphs || []).map((p) => '<p>' + esc(p) + '</p>').join("") + '</section>';
  }
  function photoHtml(img, slot) {
    if (!img || !img.url) return '<div data-photo-slot="' + slot + '"></div>';
    return '<figure class="photo" data-hide-on-error><div class="frame">' + imgTag(img.url, img.alt) + '</div>' +
      '<figcaption>' + creditHtml(img) + '</figcaption></figure>';
  }
  function guessHtml(g) {
    if (!g || !g.q || !Array.isArray(g.options)) return "";
    return '<section class="card guess" id="guess">' +
      '<span class="label">' + icon("brain") + 'Quick guess before you read on</span>' +
      '<p class="q-text">' + esc(g.q) + '</p>' +
      '<div class="options">' + g.options.map((o, i) => '<button class="opt" type="button" data-i="' + i + '">' + esc(o) + '<span></span></button>').join("") + '</div>' +
      '<p class="guess-explain" id="guess-explain" hidden></p></section>';
  }
  function bigNumberHtml(b) {
    if (!b || !b.value) return "";
    return '<section class="card big-number"><div class="value">' + esc(b.value) + '</div><p class="what">' + esc(b.label) + '</p></section>';
  }
  function mythFactHtml(m) {
    if (!m || !m.myth || !m.fact) return "";
    return '<section class="card mythfact" aria-label="Myth versus fact">' +
      '<div class="mf myth"><span class="badge">' + icon("x") + '</span><div><b>Myth</b><p>' + esc(m.myth) + '</p></div></div>' +
      '<div class="mf fact"><span class="badge">' + icon("check") + '</span><div><b>Fact</b><p>' + esc(m.fact) + '</p></div></div></section>';
  }
  function dykHtml(t) {
    if (!t) return "";
    return '<section class="card dyk"><div class="bulb">' + icon("bulb") + '</div><div><span class="label">Did you know?</span><p>' + esc(t) + '</p></div></section>';
  }

  /* ---------- views ---------- */
  let navTicket = 0;   // the newest navigation wins; slower, older ones are dropped

  async function showArticle(section, date, isToday) {
    const ticket = ++navTicket;
    setSection(section);
    const S = SECTIONS[section];
    const index = await getIndex(section);
    renderTabs(section);
    renderChip();

    if (ticket !== navTicket) return;
    if (!index.length) {
      app.innerHTML = '<div class="page fade-in">' + (isToday ? '<div class="greet"><h1>' + esc(greeting()) + '</h1><p>' + esc(S.tagline(prettyDate(siteDay()))) + '</p></div>' + await streakCardHtml() : "") +
        '<p class="empty" style="margin:2rem 0">The first ' + esc(S.label.toLowerCase()) + ' topic is on its way. It lands tomorrow at 06:00.</p></div>';
      return;
    }
    if (!date) date = index[0].date;
    const pos = index.findIndex((a) => a.date === date);
    if (pos === -1) { app.innerHTML = '<p class="empty">That topic could not be found. <a href="#' + section + '">Go to today\'s topic</a>.</p>'; return; }

    const a = await getArticle(section, date);
    const older = index[pos + 1] || null;
    const newer = index[pos - 1] || null;
    const sections = a.sections || [];
    const gallery = (a.gallery || []).slice();
    const ticked = isRead(section, a.date);
    const link = (d) => "#" + section + "-" + d;

    let yesterday = "";
    if (isToday && older) {
      const prev = await getArticle(section, older.date).catch(() => null);
      if (prev && prev.recall && prev.recall[0]) {
        yesterday = '<section class="card yesterday reveal" style="' + catStyle(section, prev.category) + '">' +
          '<span class="label">' + icon("timer") + 'Yesterday\'s question</span>' +
          '<p class="q-text">' + esc(prev.recall[0].q) + '</p>' +
          '<button class="reveal-btn" type="button">Answer it in your head, then tap to check</button>' +
          '<div class="reveal-ans">' + esc(prev.recall[0].a) + '<br><a href="' + link(prev.date) + '">Re-read: ' + esc(prev.title) + '</a></div></section>';
      }
    }

    let body = "";
    sections.forEach((s, i) => {
      body += chapterHtml(s, i);
      if (i === 0) body += guessHtml(a.guess);
      if (i === 1) body += photoHtml(gallery[0], 0);
      if (i === 2) body += bigNumberHtml(a.bigNumber);
      if (i === 3) body += photoHtml(gallery[1], 1) + mythFactHtml(a.mythFact);
      if (i === sections.length - 2 && sections.length < 4) body += mythFactHtml(a.mythFact);
    });
    body += dykHtml(a.didYouKnow);

    const recall = (a.recall || []).map((r, i) =>
      '<div class="recall-item reveal"><div class="q-text"><span class="n">' + (i + 1) + '</span><span>' + esc(r.q) + '</span></div>' +
      '<button class="reveal-btn" type="button">Think first, then tap to reveal</button>' +
      '<div class="reveal-ans">' + esc(r.a) + '</div></div>').join("");

    const hero = a.image && a.image.url ? imgTag(a.image.url, a.image.alt || a.title) : placeholder(section, a.category);
    const streakHtml = isToday ? await streakCardHtml() : "";
    if (ticket !== navTicket) return;

    app.innerHTML =
      '<div class="page fade-in" style="' + catStyle(section, a.category) + '">' +
        (isToday ? '<div class="greet"><h1>' + esc(greeting()) + '</h1><p>' + esc(S.tagline(prettyDate(a.date))) + '</p></div>' + nameCardHtml() + streakHtml : "") +
        '<article>' +
          '<header class="hero">' +
            '<div class="hero-media" id="hero-media">' + hero + chip(section, a.category) + '</div>' +
            (a.image && a.image.url ? '<p class="credit">' + creditHtml(a.image) + '</p>' : '<p class="credit" id="hero-credit"></p>') +
            '<div class="hero-text">' +
              '<div class="meta"><span>' + icon(S.icon) + esc(S.label) + '</span><span>' + icon("calendar") + (a.date === siteDay() ? "Today" : esc(prettyDate(a.date))) + '</span><span>' + icon("timer") + esc(a.readMinutes || 5) + ' min read</span></div>' +
              '<h1 class="title">' + esc(a.title) + '</h1>' +
              '<p class="hook">' + esc(a.hook) + '</p>' +
            '</div>' +
          '</header>' +
          yesterday +
          '<div class="body">' + body + '</div>' +
          '<section class="remember"><span class="label">' + icon("spark") + 'Remember it like this</span>' +
            '<blockquote>' + esc(a.rememberIt) + '</blockquote>' +
            '<div class="copy"><button class="small-btn" type="button" id="share-btn">Copy to send to a friend</button></div></section>' +
          '<section class="recall"><h2>Can you remember?</h2>' +
            '<p class="intro">Answer each one in your head before you reveal it. This is the bit that makes it stick.</p>' +
            '<div class="recall-list">' + recall + '</div></section>' +
          '<div class="tick-wrap">' +
            '<button class="tick-btn' + (ticked ? " done" : "") + '" type="button" id="tick-btn"' + (ticked ? " disabled" : "") + '>' +
              '<span class="tick-box">' + icon("check") + '</span>' +
              '<span id="tick-label">' + (ticked ? "Done. Nice one." : esc(S.tick)) + '</span></button>' +
            '<p class="tick-note" id="tick-note">' + (ticked ? "" : (a.date === siteDay() ? "Tick it off to keep your streak going." : "Older topics count towards your total, not your streak.")) + '</p>' +
          '</div>' +
          (a.source && a.source.url ? '<p class="source">Based on the Wikipedia article <a href="' + esc(a.source.url) + '" rel="noopener">' + esc(a.source.title) + '</a>.</p>' : "") +
          '<nav class="pager" aria-label="More topics">' +
            (older ? '<a href="' + link(older.date) + '"><small>Previous</small>' + esc(older.title) + '</a>' : "") +
            (newer ? '<a class="next" href="' + link(newer.date) + '"><small>Next</small>' + esc(newer.title) + '</a>' : "") +
          '</nav>' +
          '<a class="archive-btn" href="#archive-' + section + '">' + icon("grid") + 'Browse the ' + esc(S.archiveTitle) + ' archive</a>' +
        '</article>' +
      '</div>';

    wireArticle(section, a);

    // Photos are fetched in the background. Each page view gets its own number, and the photos are
    // only placed if you're still on the same page when they arrive (fixes photos landing in the wrong tab).
    const viewId = ++currentView;
    const stillHere = () => viewId === currentView && app.dataset.view === section + ":" + a.date;
    app.dataset.view = section + ":" + a.date;

    if (!PREVIEW && a.source && a.source.title && (!a.image || !a.image.url || !gallery.length)) {
      wikiPictures(a.source.title).then((found) => {
        if (!stillHere() || !found.length) return;
        const pics = found.slice();
        if (!a.image || !a.image.url) {
          const first = pics.shift();
          const ph = app.querySelector("#hero-media .placeholder");
          if (ph) {
            const im = new Image(); im.alt = first.alt; im.decoding = "async";
            im.onload = () => {
              if (!stillHere() || !ph.isConnected) return;
              ph.replaceWith(im);
              const c = app.querySelector("#hero-credit"); if (c) c.innerHTML = creditHtml(first);
            };
            im.src = first.url;
          }
        }
        if (!gallery.length) app.querySelectorAll("[data-photo-slot]").forEach((slot, i) => { if (pics[i]) slot.outerHTML = photoHtml(pics[i], i); });
      }).catch(() => { /* keep placeholders */ });
    }
  }

  function wireArticle(section, a) {
    app.querySelectorAll(".reveal-btn").forEach((b) => b.addEventListener("click", () => b.closest(".reveal").classList.add("revealed")));

    const g = a.guess;
    const guess = document.getElementById("guess");
    if (guess && g) {
      guess.querySelectorAll(".opt").forEach((btn) => btn.addEventListener("click", () => {
        const pick = Number(btn.dataset.i);
        guess.querySelectorAll(".opt").forEach((o) => {
          o.disabled = true;
          if (Number(o.dataset.i) === g.answer) { o.classList.add("right"); o.querySelector("span").innerHTML = icon("check"); }
        });
        if (pick !== g.answer) { btn.classList.add("wrong"); btn.querySelector("span").innerHTML = icon("x"); }
        const ex = document.getElementById("guess-explain");
        ex.textContent = (pick === g.answer ? "Spot on. " : "Not quite. ") + (g.explain || "");
        ex.hidden = false;
      }));
    }

    const share = document.getElementById("share-btn");
    if (share) share.addEventListener("click", async () => {
      const text = a.title + "\n" + a.rememberIt + "\n\nFrom The Daily Why: " + location.href.split("#")[0] + "#" + section + "-" + a.date;
      try { await navigator.clipboard.writeText(text); share.textContent = "Copied. Go impress someone."; }
      catch (e) { share.textContent = "Couldn't copy on this device"; }
    });

    const form = document.getElementById("name-form");
    if (form) {
      form.addEventListener("submit", (e) => {
        e.preventDefault();
        const v = document.getElementById("name-input").value.trim().slice(0, 24);
        if (!v) return;
        store.set("tdw-name", v);
        document.getElementById("name-card").remove();
        const h = app.querySelector(".greet h1"); if (h) h.textContent = greeting();
      });
      document.getElementById("name-skip").addEventListener("click", () => {
        store.set("tdw-name-skip", true);
        document.getElementById("name-card").remove();
      });
    }

    const tick = document.getElementById("tick-btn");
    if (tick && !tick.disabled) tick.addEventListener("click", async () => {
      const wasTicked = reader.days().includes(siteDay());
      const n = tickOff(section, a.date);
      tick.classList.add("done"); tick.disabled = true;
      document.getElementById("tick-label").textContent = "Done. Nice one.";
      const countsToday = a.date === siteDay();
      confetti(tick);
      const card = document.getElementById("streak");
      if (card) {
        card.outerHTML = await streakCardHtml();
        const d = document.querySelector('#streak .day[data-day="' + siteDay() + '"]');
        if (d && countsToday && !wasTicked) d.classList.add("pop");
      }
      const topics = await todaysTopics();
      const doneCount = SECTION_KEYS.filter((k) => topics[k] && isRead(k, topics[k])).length;
      const left = SECTION_KEYS.filter((k) => topics[k] && !isRead(k, topics[k]));
      let note = countsToday ? streakMessage(n, true, doneCount) : "Added to your topics learned.";
      if (countsToday && left.length) note += " Still waiting for you today: " + left.map((k) => SECTIONS[k].label).join(" and ") + ".";
      document.getElementById("tick-note").textContent = note;
    });
  }

  async function showArchive(filter) {
    const ticket = ++navTicket;
    currentView++; app.dataset.view = "archive";
    const active = filter && SECTIONS[filter] ? filter : "all";
    setSection(active === "all" ? currentSection : active);
    renderTabs(currentSection, true);
    renderChip();

    let items = [];
    for (const k of SECTION_KEYS) {
      if (active !== "all" && k !== active) continue;
      (await getIndex(k)).forEach((a) => items.push(Object.assign({ section: k }, a)));
    }
    items.sort((a, b) => b.date.localeCompare(a.date) || SECTION_KEYS.indexOf(a.section) - SECTION_KEYS.indexOf(b.section));

    const filters = [["all", "All", "grid", ""]].concat(SECTION_KEYS.map((k) => [k, SECTIONS[k].label, SECTIONS[k].icon, SECTIONS[k].color]))
      .map(([k, label, ic, color]) => '<a class="filter" href="#archive' + (k === "all" ? "" : "-" + k) + '"' + (color ? ' style="--f:' + color + '"' : "") +
        (k === active ? ' aria-current="page"' : "") + '>' + icon(ic) + esc(label) + '</a>').join("");

    if (ticket !== navTicket) return;
    const title = active === "all" ? "Everything you've learned" : SECTIONS[active].archiveTitle + " archive";
    app.innerHTML =
      '<section class="page archive fade-in" style="max-width:62rem">' +
        '<h1>' + esc(title) + '</h1>' +
        '<p class="sub">Going back to an old topic is one of the best ways to keep it in your head.</p>' +
        '<div class="stats">' +
          '<div class="stat"><b>' + currentStreak() + '</b><span>Day streak</span></div>' +
          '<div class="stat"><b>' + Math.max(reader.best(), currentStreak()) + '</b><span>Best streak</span></div>' +
          '<div class="stat"><b>' + reader.read().length + '</b><span>Topics learned</span></div>' +
        '</div>' +
        '<nav class="filters" aria-label="Choose an archive">' + filters + '</nav>' +
        '<label class="sr-only" for="q">Search topics</label>' +
        '<input class="search" id="q" type="search" placeholder="Search, e.g. rugby, Plato, space" autocomplete="off">' +
        '<div class="grid" id="results"></div>' +
      '</section>';

    const results = document.getElementById("results");
    const input = document.getElementById("q");
    function draw(term) {
      const t = term.trim().toLowerCase();
      const list = items.filter((a) => !t || (a.title + " " + a.category + " " + (a.hook || "") + " " + SECTIONS[a.section].label).toLowerCase().includes(t));
      if (!list.length) { results.innerHTML = '<p class="empty" style="margin:1rem 0">No topics match that yet.</p>'; return; }
      results.innerHTML = list.map((a) =>
        '<a class="tile" data-section="' + a.section + '" href="#' + a.section + '-' + esc(a.date) + '" style="--sec-color:' + SECTIONS[a.section].color + ';' +
          (a.section === "general" ? catStyle("general", a.category) : "--accent:" + SECTIONS[a.section].color + ";--accent-soft:color-mix(in srgb," + SECTIONS[a.section].color + " 15%, var(--surface));") + '">' +
          '<div class="media">' + (a.thumb ? imgTag(a.thumb, "") : placeholder(a.section, a.category)) + chip(a.section, a.category) +
            (isRead(a.section, a.date) ? '<span class="done-badge" title="You learned this">' + icon("check") + '</span>' : "") + '</div>' +
          '<div class="txt"><span class="sec">' + esc(SECTIONS[a.section].label) + '</span><h3>' + esc(a.title) + '</h3><span class="when">' + esc(prettyDate(a.date)) + '</span></div>' +
        '</a>').join("");
    }
    draw("");
    input.addEventListener("input", () => draw(input.value));
  }

  /* ---------- confetti ---------- */
  function confetti(from) {
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const c = document.getElementById("confetti");
    const ctx = c.getContext("2d");
    const dpr = window.devicePixelRatio || 1;
    c.width = innerWidth * dpr; c.height = innerHeight * dpr; ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const r = from.getBoundingClientRect();
    const colors = ["#f2711c", "#ffd75e", "#12844a", "#3f3a8f", "#c2477a", "#3b82c4"];
    const bits = Array.from({ length: 90 }, () => ({
      x: r.left + r.width / 2, y: r.top + r.height / 2,
      vx: (Math.random() - .5) * 13, vy: -Math.random() * 12 - 4,
      s: Math.random() * 6 + 4, rot: Math.random() * 6, vr: (Math.random() - .5) * .3,
      color: colors[(Math.random() * colors.length) | 0]
    }));
    const start = performance.now();
    (function frame(t) {
      const age = t - start;
      ctx.clearRect(0, 0, innerWidth, innerHeight);
      bits.forEach((b) => {
        b.vy += .38; b.vx *= .99; b.x += b.vx; b.y += b.vy; b.rot += b.vr;
        ctx.save(); ctx.translate(b.x, b.y); ctx.rotate(b.rot);
        ctx.globalAlpha = Math.max(0, 1 - age / 1600);
        ctx.fillStyle = b.color; ctx.fillRect(-b.s / 2, -b.s / 4, b.s, b.s / 2);
        ctx.restore();
      });
      if (age < 1600) requestAnimationFrame(frame); else ctx.clearRect(0, 0, innerWidth, innerHeight);
    })(start);
  }

  /* ---------- routing ----------
     #general  #sport  #philosophy           today's topic in that section ("" = general)
     #general-2026-11-17 (and sport-, philosophy-)   a specific day
     #archive  #archive-sport  ...           the archive, filtered
     #a-2026-11-17                           old links from version 1 */
  async function route() {
    const h = location.hash.replace(/^#/, "");
    let m;
    try {
      if (h === "archive") await showArchive("all");
      else if ((m = h.match(/^archive-(general|sport|philosophy)$/))) await showArchive(m[1]);
      else if ((m = h.match(/^(general|sport|philosophy)-(\d{4}-\d{2}-\d{2})$/)) || (m = h.match(/^(a)-(\d{4}-\d{2}-\d{2})$/))) {
        const section = m[1] === "a" ? "general" : m[1];
        const index = await getIndex(section);
        await showArticle(section, m[2], index[0] && index[0].date === m[2] && m[2] === siteDay());
      }
      else if (SECTIONS[h]) await showArticle(h, null, true);
      else await showArticle("general", null, true);
    } catch (e) {
      app.innerHTML = '<p class="empty">Something went wrong loading this page. Please refresh.</p>';
      console.error(e);
    }
    window.scrollTo(0, 0);
    updateProgress();
  }

  /* ---------- reading progress ---------- */
  const bar = document.getElementById("progress-bar");
  function updateProgress() {
    const max = document.documentElement.scrollHeight - innerHeight;
    bar.style.width = (max > 0 ? Math.min(100, (scrollY / max) * 100) : 0) + "%";
  }
  addEventListener("scroll", updateProgress, { passive: true });
  addEventListener("resize", updateProgress);

  /* ---------- theme ---------- */
  const root = document.documentElement;
  root.dataset.theme = store.get("tdw-theme", null) || (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
  document.getElementById("theme-toggle").addEventListener("click", () => {
    root.dataset.theme = root.dataset.theme === "dark" ? "light" : "dark";
    store.set("tdw-theme", root.dataset.theme);
  });

  addEventListener("hashchange", route);
  route();
})();
