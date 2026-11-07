# HanziFlow 🀄

A single-file Chinese flashcard self-study web app for HSK 2/3 learners. No backend, no build step, no accounts — everything runs in your browser and stays on your device.

## What it does

- **Weekly decks** — create a deck per week ("Week 3 — Food") and paste 30–50 words from your textbook.
- **Auto-fill** — pasting Chinese words (one per line) looks them up in a built-in HSK 1–4 dictionary (~1,100 words with pinyin, meaning and example sentences). Words not in the dictionary get pinyin auto-generated via `pinyin-pro` (needs internet) and are flagged `AUTO` so you can double-check them.
- **Flashcard study** — tap-to-flip cards with Anki-style grading (Again / Hard / Good / Easy) powered by an SM-2 spaced-repetition engine.
- **Multiple-choice quiz** — Chinese → English and reverse, with distractors from the same deck. Quiz answers feed back into the SRS schedule.
- **Audio** — word and sentence playback via the browser's built-in Chinese speech synthesis (no external TTS).
- **Tone colors** — hanzi and pinyin are color-coded by tone everywhere (1st red, 2nd green, 3rd blue, 4th purple, neutral gray).
- **Progress** — daily streak, daily target, per-deck mastery bars, and a stats page with charts (Chart.js).
- **Dark mode**, export/import JSON backups, works offline once loaded.

## How to add words

1. **Decks → + New Week** (optionally rename it, e.g. "Week 3 — Food").
2. Tap **📋 Paste words**, paste your vocabulary (one Chinese word per line), tap **Auto-fill**.
3. Review the parsed cards — fix pinyin/meaning/HSK tag, delete rows you don't want — then **Save**.
4. You can also add cards one by one (+ Card) or edit any existing card by tapping it in the deck view or in All Cards (Home → search isn't there; use the Decks or long-press… actually: tap any card row to edit).

## How to study

- **Home → Study Now** reviews everything due today plus up to *N* new cards (set in Settings).
- Flip the card to see pinyin, meaning and the example sentence; grade yourself honestly — Again re-shows the card in the same session.
- **Decks → [deck] → 🎯 Quiz** for a 15-question multiple-choice round.

## Deploy on GitHub Pages

1. Create a new GitHub repository (e.g. `hanzi-flow`).
2. Upload `index.html` (and this `README.md`) to the repo root.
3. Repo **Settings → Pages → Build and deployment → Deploy from a branch**, pick `main` / `/ (root)`, save.
4. Your app appears at `https://<username>.github.io/hanzi-flow/` within a minute or two. Open it on your phone and "Add to Home Screen" for an app-like feel.

## Backup & restore

All data lives in `localStorage` under the key `hanziflow.v1` — it is tied to the browser/device you used. To move devices or stay safe:

- **Settings → ⬇️ Export backup** downloads a timestamped JSON file.
- **Settings → ⬆️ Import backup** restores it; choose OK to fully replace current data, or Cancel to merge (keeps both).

Export regularly — clearing browser data erases everything.

## Tech notes

- One file: `index.html` with inline CSS/JS; only CDN dependencies are Chart.js and pinyin-pro (both optional — the app still works if they fail to load, minus charts and auto-pinyin for unknown words).
- SRS: SM-2 variant. Ease starts at 2.5; Again → relearn in ~10 min, Hard/Good/Easy scale the interval. Mastery stages derive from interval: New → Learning (<3d) → Reviewing (<21d) → Mastered (≥21d).
