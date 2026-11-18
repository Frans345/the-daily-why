// The Daily Why — daily article generator
// Runs in GitHub Actions every morning (Node 20+, no packages needed).
//
// Writes THREE articles every morning: general knowledge, sport and philosophy.
// For each section it:
// 1. Picks a random unused topic from that section's list in topics/
// 2. Pulls the facts and a freely licensed image from Wikipedia / Wikimedia Commons
// 3. Asks a free AI (Groq) to turn it into a 5-minute, easy-to-remember article
// 4. Checks the result and saves it to data/articles/<date>.json + data/index.json

import { readFile, writeFile, access, mkdir } from "node:fs/promises";

const GROQ_API_KEY = process.env.GROQ_API_KEY;
// Groq retires models from time to time, so we try a list in order and use the first one that works.
// You can put your own choice first by adding a repository variable called GROQ_MODEL on GitHub.
const MODELS = [process.env.GROQ_MODEL, "openai/gpt-oss-120b", "qwen/qwen3.6-27b", "openai/gpt-oss-20b"].filter(Boolean);
let workingModel = null;
const USER_AGENT = "TheDailyWhy/1.0 (https://github.com/Frans345/the-daily-why)";
const MAX_TOPIC_TRIES = 5;
const MAX_AI_TRIES = 3;

// South African date (UTC+2). The job runs at 05:00 SAST, the site shows it from 06:00.
const DATE = process.env.ARTICLE_DATE || new Date(Date.now() + 2 * 3600e3).toISOString().slice(0, 10);

const readJson = async (p, fallback) => {
  try { return JSON.parse(await readFile(p, "utf8")); } catch { return fallback; }
};
const writeJson = (p, data) => writeFile(p, JSON.stringify(data, null, 2) + "\n");
const exists = async (p) => { try { await access(p); return true; } catch { return false; } };
const stripHtml = (s) => String(s || "").replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------- Wikipedia ----------

async function wikiJson(url) {
  const res = await fetch(url, { headers: { "User-Agent": USER_AGENT, "Accept": "application/json" } });
  if (!res.ok) throw new Error(`Wikipedia request failed (${res.status})`);
  return res.json();
}

async function getSource(title) {
  const url = "https://en.wikipedia.org/w/api.php?" + new URLSearchParams({
    action: "query", format: "json", formatversion: "2", redirects: "1",
    prop: "extracts|pageimages|info", explaintext: "1", exsectionformat: "plain",
    piprop: "name", inprop: "url", titles: title
  });
  const data = await wikiJson(url);
  const page = data?.query?.pages?.[0];
  if (!page || page.missing || !page.extract) throw new Error(`No Wikipedia article for "${title}"`);

  // Keep the useful start of the article; drop reference-style sections.
  let text = page.extract.split(/\n(?:See also|References|Notes|Further reading|External links)\n/)[0];
  text = text.slice(0, 12000);

  return {
    title: page.title,
    url: page.fullurl || `https://en.wikipedia.org/wiki/${encodeURIComponent(page.title.replace(/ /g, "_"))}`,
    text,
    imageName: page.pageimage || null
  };
}

// Collect up to 4 freely licensed photos used in the Wikipedia article (lead photo first).
const BAD_IMAGE = /(logo|icon|flag|symbol|seal|coat[_ ]of|signature|commons-|wiki|edit-|question|portal|padlock|disambig|stub|ambox|crystal|nuvola)/i;

async function getPictures(title, leadName) {
  const url = "https://en.wikipedia.org/w/api.php?" + new URLSearchParams({
    action: "query", format: "json", formatversion: "2", redirects: "1",
    titles: title, generator: "images", gimlimit: "40",
    prop: "imageinfo", iiprop: "url|extmetadata|size|mime", iiurlwidth: "1400"
  });
  try {
    const data = await wikiJson(url);
    const pages = data?.query?.pages || [];
    const lead = (leadName || "").replace(/ /g, "_");
    const pics = pages.map((p) => {
      const ii = p.imageinfo?.[0];
      if (!ii || !/image\/(jpeg|png|webp)/.test(ii.mime || "") || ii.width < 500 || ii.height < 300 || BAD_IMAGE.test(p.title)) return null;
      const meta = ii.extmetadata || {};
      const license = stripHtml(meta.LicenseShortName?.value);
      if (!license) return null;   // only freely licensed Commons files carry this
      const name = p.title.replace(/^File:/, "");
      return {
        isLead: name.replace(/ /g, "_") === lead,
        url: ii.thumburl || ii.url,
        thumb: ii.thumburl ? ii.thumburl.replace(/\/\d+px-/, "/400px-") : ii.url,
        alt: stripHtml(meta.ObjectName?.value) || name.replace(/\.\w+$/, "").replace(/_/g, " "),
        credit: stripHtml(meta.Artist?.value).slice(0, 120) || "Wikimedia Commons",
        license,
        sourceUrl: ii.descriptionurl
      };
    }).filter(Boolean);
    pics.sort((a, b) => b.isLead - a.isLead);
    return pics.slice(0, 4);
  } catch {
    return [];
  }
}

// ---------- AI ----------

const GOALS = {
  general: `GOAL
Help readers know more about the everyday world in a way that sticks. One everyday topic, about a 5-minute read, not in-depth. After reading, someone should be able to explain it to a friend the next day.
Tell it like a story: what you notice, how it works, then a surprising twist or a bit of history.`,

  sport: `GOAL
Tell one great story from the world of sport, or explain the rules of a sport in a way that finally makes sense. About a 5-minute read, not in-depth, written for someone who is not a sports expert.
- For an EVENT (a match, final, race or record): set the scene, build the tension, describe the key moment, then explain why it still matters.
- For a RULE or part of the game: start with a moment where the rule decides a match, explain it with a simple everyday comparison, then add a surprising bit of history.
- For a PERSON or TEAM: focus on one or two defining moments and what made them special, not a list of statistics.
Never cover American sports (American football, baseball, basketball, ice hockey). No betting or gambling content.`,

  philosophy: `GOAL
Introduce one philosopher (or one big philosophical idea) to a curious beginner. About a 5-minute read, not in-depth, no academic language.
Cover, in this order: who they were and when and where they lived; one or two key moments from their life; their main beliefs, explained simply with everyday examples (a South African example where it fits naturally); how their ideas still show up today.
- Present beliefs fairly and neutrally, as "they believed" or "they argued", never as the one right answer.
- For religious or political thinkers, explain the ideas without taking sides or making it a debate.
- Only quote the philosopher if the quote is in the source text, and keep it under 15 words.`
};

function buildPrompt(section) {
  return `You write one article a day for "The Daily Why", a learning website for ordinary people of all ages.

${GOALS[section]}

ACCURACY
- Use ONLY facts found in the SOURCE TEXT. Never invent numbers, dates, names, scores or quotes.
- If you are not sure a fact is in the source, leave it out.
- Busting a common myth is welcome, but only if the source supports it.
- Prefer rounded, memorable numbers ("about 12 cm") over false precision.

STRUCTURE
- title: a short, curious title, max about 10 words.
- hook: 1-2 sentences that make the reader curious. Never start with "Have you ever wondered".
- sections: 4 or 5 sections. Each has a plain "heading" and 1-3 short "paragraphs".
- Include at least one comparison to something familiar from daily life.
- rememberIt: one line, max about 15 words, that sums up the whole topic and is easy to repeat.
- recall: exactly 3 objects {"q","a"}. Short questions that check understanding, not tiny details. Answers are one sentence.
- guess: a fun multiple-choice question asked BEFORE the reader learns the answer (shown after section 1). {"q": "", "options": ["", "", ""], "answer": <index 0-2 of the correct option>, "explain": "one or two sentences"}. Make the wrong options believable.
- bigNumber: one striking number from the source (a score, a year, a distance, a record) with a short explanation. {"value": "e.g. 15–12", "label": "max about 20 words"}.
- mythFact: a common misunderstanding and the truth. {"myth": "", "fact": ""}. Only if the source supports it, otherwise null.
- didYouKnow: one extra surprising fact from the source that is NOT already in the sections. One or two sentences.

STYLE
- Write like a friendly, curious person chatting to one reader over coffee. Use "you" and "we". Light, warm humour is welcome.
- Use everyday examples a South African reader would recognise when they fit naturally (a braai, load shedding, a taxi ride), but never force them.
- 700 to 1000 words in total.
- Plain English, short sentences, a 13-year-old should understand it. Explain any jargon in passing.
- Warm and curious, never smug or lecturing. No emojis. No clickbait. No exclamation marks.
- Avoid: "delve", "in today's world", "it's not X, it's Y", "fascinating", "In conclusion".

SAFETY
- Content must suit a general audience of any age: nothing sexual, graphic, gory, hateful, frightening or politically one-sided.
- Mention deaths, wars or injuries only briefly and without detail, when the story needs it.
- If the topic cannot be written safely, return {"skip": true}.

OUTPUT
Return ONLY a JSON object with exactly these keys:
{"title": "", "hook": "", "sections": [{"heading": "", "paragraphs": [""]}], "guess": {"q": "", "options": ["", "", ""], "answer": 0, "explain": ""}, "bigNumber": {"value": "", "label": ""}, "mythFact": {"myth": "", "fact": ""}, "didYouKnow": "", "rememberIt": "", "recall": [{"q": "", "a": ""}]}`;
}

async function callGroq(model, section, topic, source) {
  const body = {
    model,
    temperature: 0.6,
    max_tokens: 8000,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: buildPrompt(section) },
      { role: "user", content: `SECTION: ${section}\nTOPIC: ${source.title}\nCATEGORY: ${topic.category}\n\nSOURCE TEXT (from Wikipedia):\n${source.text}` }
    ]
  };
  if (model.startsWith("openai/gpt-oss")) body.reasoning_effort = "low";   // keeps answers quick and within limits
  return fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: { "Authorization": `Bearer ${GROQ_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
}

async function askAI(section, topic, source) {
  const candidates = workingModel ? [workingModel] : MODELS;
  let lastError = "no models to try";
  for (const model of candidates) {
    const res = await callGroq(model, section, topic, source);
    if (res.status === 429) throw new Error("Groq rate limit reached (free tier). Try again later.");
    if (res.status === 401) throw new Error("Groq rejected the API key. Check the GROQ_API_KEY secret on GitHub.");
    if (!res.ok) {
      const text = (await res.text()).slice(0, 300);
      // Model retired or not available on this account: try the next one.
      if (res.status === 404 || /model_not_found|decommissioned|does not exist|not supported/i.test(text)) {
        console.log(`  Model "${model}" is not available (${res.status}). Trying the next one.`);
        lastError = text;
        continue;
      }
      throw new Error(`Groq request failed (${res.status}) with ${model}: ${text}`);
    }
    const data = await res.json();
    if (!workingModel) { workingModel = model; console.log(`  Using AI model: ${model}`); }
    let content = data.choices?.[0]?.message?.content || "";
    // Some models add their "thinking" or code fences around the JSON. Keep only the JSON object.
    content = content.replace(/<think>[\s\S]*?<\/think>/gi, "");
    const start = content.indexOf("{"), end = content.lastIndexOf("}");
    if (start === -1 || end <= start) throw new Error("The AI did not return JSON");
    return JSON.parse(content.slice(start, end + 1));
  }
  throw new Error(`None of the AI models worked. Last error: ${lastError}`);
}

// ---------- checks ----------

const BLOCKLIST = /\b(sex|sexual|porn|nude|naked|rape|suicide|self-harm|gore|torture|murder|kill(?:ed|ing)? (?:him|her|them)|terroris[mt]|nazi|drug dealer|cocaine|heroin)\b/i;

function check(article) {
  const problems = [];
  if (article.skip) return ["AI skipped this topic as unsuitable"];
  if (!article.title || !article.hook || !article.rememberIt) problems.push("missing title, hook or rememberIt");
  if (!Array.isArray(article.sections) || article.sections.length < 4 || article.sections.length > 6) problems.push("needs 4-5 sections");
  if (!Array.isArray(article.recall) || article.recall.length !== 3 || article.recall.some((r) => !r.q || !r.a)) problems.push("needs exactly 3 recall questions");
  const g = article.guess;
  if (!g || !g.q || !Array.isArray(g.options) || g.options.length !== 3 || ![0, 1, 2].includes(Number(g.answer))) problems.push("needs a guess question with 3 options");
  if (!article.bigNumber?.value || !article.bigNumber?.label) problems.push("needs a bigNumber");
  if (!article.didYouKnow) problems.push("needs a didYouKnow");

  const allText = [article.title, article.hook, article.rememberIt,
    ...(article.sections || []).flatMap((s) => [s.heading, ...(s.paragraphs || [])]),
    ...(article.recall || []).flatMap((r) => [r.q, r.a])].join(" ");
  const words = allText.split(/\s+/).filter(Boolean).length;
  if (words < 550 || words > 1300) problems.push(`length is ${words} words (want about 700-1000)`);
  if (BLOCKLIST.test(allText)) problems.push("contains a blocked word");
  return problems;
}

// ---------- main ----------

const SECTIONS = [
  { key: "general",    dir: "data",            topics: "topics/topics.json",     used: "topics/used.json" },
  { key: "sport",      dir: "data/sport",      topics: "topics/sport.json",      used: "topics/used-sport.json" },
  { key: "philosophy", dir: "data/philosophy", topics: "topics/philosophy.json", used: "topics/used-philosophy.json" }
];

async function writeSection(sec) {
  const articlePath = `${sec.dir}/articles/${DATE}.json`;
  if (await exists(articlePath)) {
    console.log(`[${sec.key}] Article for ${DATE} already exists. Nothing to do.`);
    return true;
  }

  const topics = await readJson(sec.topics, []);
  let used = await readJson(sec.used, []);
  let pool = topics.filter((t) => !used.includes(t.title));
  if (!pool.length) { console.log(`[${sec.key}] All topics used. Starting the list again.`); used = []; pool = topics; }
  pool = pool.map((t) => [Math.random(), t]).sort((a, b) => a[0] - b[0]).map((x) => x[1]);

  for (const topic of pool.slice(0, MAX_TOPIC_TRIES)) {
    console.log(`\n[${sec.key}] Trying topic: ${topic.title}`);
    let source;
    try { source = await getSource(topic.title); }
    catch (e) { console.log(`  Skipped: ${e.message}`); used.push(topic.title); continue; }

    for (let attempt = 1; attempt <= MAX_AI_TRIES; attempt++) {
      let draft;
      try { draft = await askAI(sec.key, topic, source); }
      catch (e) { console.log(`  AI attempt ${attempt} failed: ${e.message}`); await sleep(5000); continue; }

      const problems = check(draft);
      if (problems.length) {
        console.log(`  Attempt ${attempt} rejected: ${problems.join("; ")}`);
        if (draft.skip) break;
        continue;
      }

      const words = JSON.stringify(draft.sections).split(/\s+/).length;
      const pictures = await getPictures(source.title, source.imageName);
      const clean = (p) => p && { url: p.url, alt: p.alt, credit: p.credit, license: p.license, sourceUrl: p.sourceUrl };
      const image = pictures[0] || null;
      const slug = draft.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 70);

      const article = {
        date: DATE,
        section: sec.key,
        slug,
        category: topic.category,
        title: draft.title.trim(),
        hook: draft.hook.trim(),
        readMinutes: Math.max(3, Math.min(7, Math.round(words / 190))),
        sections: draft.sections.slice(0, 5).map((s) => ({ heading: String(s.heading).trim(), paragraphs: (s.paragraphs || []).map((p) => String(p).trim()).filter(Boolean) })),
        guess: { q: String(draft.guess.q).trim(), options: draft.guess.options.map((o) => String(o).trim()), answer: Number(draft.guess.answer), explain: String(draft.guess.explain || "").trim() },
        bigNumber: { value: String(draft.bigNumber.value).trim(), label: String(draft.bigNumber.label).trim() },
        mythFact: draft.mythFact && draft.mythFact.myth && draft.mythFact.fact ? { myth: String(draft.mythFact.myth).trim(), fact: String(draft.mythFact.fact).trim() } : null,
        didYouKnow: String(draft.didYouKnow).trim(),
        rememberIt: draft.rememberIt.trim(),
        recall: draft.recall.slice(0, 3).map((r) => ({ q: String(r.q).trim(), a: String(r.a).trim() })),
        image: clean(image),
        gallery: pictures.slice(1, 3).map(clean),
        source: { title: source.title, url: source.url }
      };

      await mkdir(`${sec.dir}/articles`, { recursive: true });
      await writeJson(articlePath, article);

      const index = await readJson(`${sec.dir}/index.json`, []);
      index.unshift({ date: DATE, slug, title: article.title, category: article.category, hook: article.hook, thumb: image ? image.thumb : null });
      await writeJson(`${sec.dir}/index.json`, index);

      used.push(topic.title);
      await writeJson(sec.used, used);
      console.log(`[${sec.key}] Saved ${articlePath}: "${article.title}"`);
      return true;
    }
    console.log(`  Giving up on "${topic.title}", trying another topic.`);
  }

  await writeJson(sec.used, used);
  console.log(`[${sec.key}] Could not create an article today.`);
  return false;
}

async function main() {
  if (!GROQ_API_KEY) throw new Error("GROQ_API_KEY is missing. Add it under Settings > Secrets and variables > Actions.");
  const only = process.env.SECTION;   // optional: run just one section, e.g. SECTION=sport
  const results = {};
  for (const sec of SECTIONS) {
    if (only && sec.key !== only) continue;
    results[sec.key] = await writeSection(sec);
    await sleep(3000);   // be gentle with the free AI tier
  }
  console.log("\nSummary:", Object.entries(results).map(([k, ok]) => `${k}: ${ok ? "ok" : "FAILED"}`).join(", "));
  // Only fail the whole job if nothing at all could be written.
  if (!Object.values(results).some(Boolean)) throw new Error("No articles could be created today. Check the log above.");
}

main().catch((e) => { console.error("\nERROR:", e.message); process.exit(1); });
