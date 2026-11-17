// The Daily Why — daily article generator
// Runs in GitHub Actions every morning (Node 20+, no packages needed).
//
// 1. Picks a random unused everyday topic from topics/topics.json
// 2. Pulls the facts and a freely licensed image from Wikipedia / Wikimedia Commons
// 3. Asks a free AI (Groq) to turn it into a 5-minute, easy-to-remember article
// 4. Checks the result and saves it to data/articles/<date>.json + data/index.json

import { readFile, writeFile, access } from "node:fs/promises";

const GROQ_API_KEY = process.env.GROQ_API_KEY;
const GROQ_MODEL = process.env.GROQ_MODEL || "llama-3.3-70b-versatile";
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

// Only use images hosted on Wikimedia Commons (freely licensed), with credit + licence.
async function getImage(fileName, alt) {
  if (!fileName) return null;
  const url = "https://commons.wikimedia.org/w/api.php?" + new URLSearchParams({
    action: "query", format: "json", formatversion: "2",
    prop: "imageinfo", iiprop: "url|extmetadata", iiurlwidth: "1400",
    titles: "File:" + fileName
  });
  try {
    const data = await wikiJson(url);
    const page = data?.query?.pages?.[0];
    const info = page?.imageinfo?.[0];
    if (!info || page.missing) return null;
    const meta = info.extmetadata || {};
    const license = stripHtml(meta.LicenseShortName?.value);
    if (!license) return null;
    return {
      url: info.thumburl || info.url,
      thumb: info.thumburl ? info.thumburl.replace(/\/\d+px-/, "/300px-") : info.url,
      alt,
      credit: stripHtml(meta.Artist?.value).slice(0, 120) || "Wikimedia Commons",
      license,
      sourceUrl: info.descriptionurl
    };
  } catch {
    return null;
  }
}

// ---------- AI ----------

const SYSTEM_PROMPT = `You write one article a day for "The Daily Why", a general-knowledge website for ordinary people of all ages.

GOAL
Help readers know more about the everyday world in a way that sticks. One topic, about a 5-minute read, not in-depth. After reading, someone should be able to explain the topic to a friend the next day.

ACCURACY
- Use ONLY facts found in the SOURCE TEXT. Never invent numbers, dates, names or quotes.
- If you are not sure a fact is in the source, leave it out.
- Busting a common myth is welcome, but only if the source supports it.
- Prefer rounded, memorable numbers ("about 12 cm") over false precision.

STRUCTURE
- title: a short, curious question or statement, max about 10 words.
- hook: 1-2 sentences that make the reader curious. Never start with "Have you ever wondered".
- sections: 4 or 5 sections. Each has a plain "heading" and 1-3 short "paragraphs". Tell it like a story: what you notice, how it works, then a surprising twist or a bit of history.
- Include at least one comparison to something familiar from daily life.
- rememberIt: one line, max about 15 words, that sums up the whole topic and is easy to repeat.
- recall: exactly 3 objects {"q","a"}. Short questions that check understanding, not tiny details. Answers are one sentence.

STYLE
- 700 to 1000 words in total.
- Plain English, short sentences, a 13-year-old should understand it. Explain any jargon in passing.
- Warm and curious, never smug or lecturing. No emojis. No clickbait. No exclamation marks.
- Avoid: "delve", "in today's world", "it's not X, it's Y", "fascinating", "In conclusion".

SAFETY
- Content must suit a general audience of any age: nothing sexual, graphic, gory, hateful, frightening or politically one-sided.
- If the topic cannot be written safely, return {"skip": true}.

OUTPUT
Return ONLY a JSON object with exactly these keys:
{"title": "", "hook": "", "sections": [{"heading": "", "paragraphs": [""]}], "rememberIt": "", "recall": [{"q": "", "a": ""}]}`;

async function askAI(topic, source) {
  const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: { "Authorization": `Bearer ${GROQ_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: GROQ_MODEL,
      temperature: 0.6,
      max_tokens: 3000,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: `TOPIC: ${source.title}\nCATEGORY: ${topic.category}\n\nSOURCE TEXT (from Wikipedia):\n${source.text}` }
      ]
    })
  });
  if (res.status === 429) throw new Error("Groq rate limit reached (free tier). Try again later.");
  if (!res.ok) throw new Error(`Groq request failed (${res.status}): ${(await res.text()).slice(0, 300)}`);
  const data = await res.json();
  return JSON.parse(data.choices[0].message.content);
}

// ---------- checks ----------

const BLOCKLIST = /\b(sex|sexual|porn|nude|naked|rape|suicide|self-harm|gore|torture|murder|kill(?:ed|ing)? (?:him|her|them)|terroris[mt]|nazi|drug dealer|cocaine|heroin)\b/i;

function check(article) {
  const problems = [];
  if (article.skip) return ["AI skipped this topic as unsuitable"];
  if (!article.title || !article.hook || !article.rememberIt) problems.push("missing title, hook or rememberIt");
  if (!Array.isArray(article.sections) || article.sections.length < 4 || article.sections.length > 6) problems.push("needs 4-5 sections");
  if (!Array.isArray(article.recall) || article.recall.length !== 3 || article.recall.some((r) => !r.q || !r.a)) problems.push("needs exactly 3 recall questions");

  const allText = [article.title, article.hook, article.rememberIt,
    ...(article.sections || []).flatMap((s) => [s.heading, ...(s.paragraphs || [])]),
    ...(article.recall || []).flatMap((r) => [r.q, r.a])].join(" ");
  const words = allText.split(/\s+/).filter(Boolean).length;
  if (words < 550 || words > 1300) problems.push(`length is ${words} words (want about 700-1000)`);
  if (BLOCKLIST.test(allText)) problems.push("contains a blocked word");
  return problems;
}

// ---------- main ----------

async function main() {
  const articlePath = `data/articles/${DATE}.json`;
  if (await exists(articlePath)) {
    console.log(`Article for ${DATE} already exists. Nothing to do.`);
    return;
  }
  if (!GROQ_API_KEY) throw new Error("GROQ_API_KEY is missing. Add it under Settings > Secrets and variables > Actions.");

  const topics = await readJson("topics/topics.json", []);
  let used = await readJson("topics/used.json", []);
  let pool = topics.filter((t) => !used.includes(t.title));
  if (!pool.length) { console.log("All topics used. Starting the list again."); used = []; pool = topics; }

  // Shuffle so the order is truly random.
  pool = pool.map((t) => [Math.random(), t]).sort((a, b) => a[0] - b[0]).map((x) => x[1]);

  for (const topic of pool.slice(0, MAX_TOPIC_TRIES)) {
    console.log(`\nTrying topic: ${topic.title}`);
    let source;
    try { source = await getSource(topic.title); }
    catch (e) { console.log(`  Skipped: ${e.message}`); used.push(topic.title); continue; }

    for (let attempt = 1; attempt <= MAX_AI_TRIES; attempt++) {
      let draft;
      try { draft = await askAI(topic, source); }
      catch (e) { console.log(`  AI attempt ${attempt} failed: ${e.message}`); await sleep(4000); continue; }

      const problems = check(draft);
      if (problems.length) {
        console.log(`  Attempt ${attempt} rejected: ${problems.join("; ")}`);
        if (draft.skip) break;
        continue;
      }

      const words = JSON.stringify(draft.sections).split(/\s+/).length;
      const image = await getImage(source.imageName, source.title);
      const slug = draft.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 70);

      const article = {
        date: DATE,
        slug,
        category: topic.category,
        title: draft.title.trim(),
        hook: draft.hook.trim(),
        readMinutes: Math.max(3, Math.min(7, Math.round(words / 190))),
        sections: draft.sections.slice(0, 5).map((s) => ({ heading: String(s.heading).trim(), paragraphs: (s.paragraphs || []).map((p) => String(p).trim()).filter(Boolean) })),
        rememberIt: draft.rememberIt.trim(),
        recall: draft.recall.slice(0, 3).map((r) => ({ q: String(r.q).trim(), a: String(r.a).trim() })),
        image: image ? { url: image.url, alt: image.alt, credit: image.credit, license: image.license, sourceUrl: image.sourceUrl } : null,
        source: { title: source.title, url: source.url }
      };

      await writeJson(articlePath, article);

      const index = await readJson("data/index.json", []);
      index.unshift({ date: DATE, slug, title: article.title, category: article.category, hook: article.hook, thumb: image ? image.thumb : null });
      await writeJson("data/index.json", index);

      used.push(topic.title);
      await writeJson("topics/used.json", used);

      console.log(`\nSaved ${articlePath}: "${article.title}"`);
      return;
    }
    console.log(`  Giving up on "${topic.title}", trying another topic.`);
  }

  await writeJson("topics/used.json", used);
  throw new Error("Could not create an article today. Check the log above for the reason.");
}

main().catch((e) => { console.error("\nERROR:", e.message); process.exit(1); });
