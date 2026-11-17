# The Daily Why

Three short topics a day: **general knowledge**, **sport** and **philosophy**. Five-minute reads built to actually stick, with a daily streak to keep you coming back.

**Live site:** https://frans345.github.io/the-daily-why/

## How it works

- Every morning at 05:00 South African time, a GitHub Action runs `scripts/generate.mjs`.
- For each section it picks a random, unused topic (`topics/topics.json`, `topics/sport.json`, `topics/philosophy.json`).
- It pulls the facts and a freely licensed image from Wikipedia / Wikimedia Commons.
- A free AI model (Groq) rewrites it into a short, friendly article with a quick guess question, a big-number card, myth vs fact, "Did you know?", a "Remember it like this" line and 3 recall questions.
- Articles are saved to `data/` (general), `data/sport/` and `data/philosophy/`, and the site is republished to GitHub Pages.
- The website shows the new topics from 06:00, greets you by name, opens with yesterday's question, and tracks your streak in your browser. Each section has its own colours and style.

## Built with

Plain HTML, CSS and JavaScript (no frameworks, no build step) · GitHub Actions · GitHub Pages · Groq API · Wikipedia API

## Project structure

```
index.html                  the page
assets/style.css            design (light + dark mode)
assets/app.js               loads articles, archive, streak, recall questions
data/index.json             general knowledge: list of topics
data/articles/*.json        general knowledge: one file per day
data/sport/...              sport: same structure
data/philosophy/...         philosophy: same structure
topics/topics.json          everyday topics (general knowledge)
topics/sport.json           sport topics (no American sports)
topics/philosophy.json      philosophers and big ideas
topics/used*.json           topics already written about
scripts/generate.mjs        the daily AI writer
.github/workflows/daily.yml the daily schedule + deploy
```

## Add more topics

Add an entry to the right topics file using the exact Wikipedia article title:

```json
{ "title": "Paper plane", "category": "How things work" }
```
