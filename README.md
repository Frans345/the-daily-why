# The Daily Why

One everyday topic a day. A five-minute read that actually sticks.

**Live site:** https://frans345.github.io/the-daily-why/

## How it works

- Every morning at 05:00 South African time, a GitHub Action runs `scripts/generate.mjs`.
- It picks a random, unused everyday topic from `topics/topics.json`.
- It pulls the facts and a freely licensed image from Wikipedia / Wikimedia Commons.
- A free AI model (Groq) rewrites it into a short, story-style article with a "Remember it like this" line and 3 recall questions.
- The article is saved to `data/articles/<date>.json`, and the site is republished to GitHub Pages.
- The website shows the new topic from 06:00, opens with yesterday's question, and tracks your streak in your browser.

## Built with

Plain HTML, CSS and JavaScript (no frameworks, no build step) · GitHub Actions · GitHub Pages · Groq API · Wikipedia API

## Project structure

```
index.html                  the page
assets/style.css            design (light + dark mode)
assets/app.js               loads articles, archive, streak, recall questions
data/index.json             list of all published topics
data/articles/*.json        one file per day
topics/topics.json          the pool of everyday topics
topics/used.json            topics already written about
scripts/generate.mjs        the daily AI writer
.github/workflows/daily.yml the daily schedule + deploy
```

## Add more topics

Add an entry to `topics/topics.json` using the exact Wikipedia article title:

```json
{ "title": "Paper plane", "category": "How things work" }
```
