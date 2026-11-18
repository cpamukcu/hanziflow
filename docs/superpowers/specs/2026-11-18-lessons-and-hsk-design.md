# HanziFlow: Lessons tab + HSK content (design)

Date: 2026-11-18 · Status: draft, awaiting approval

## Intent and why

The learner has three Chinese apps: HanziFlow (spaced-repetition flashcards, their favourite
because it's interactive), the 学中文 flashcard app (HSK word lists, grammar points, dialogues)
and a new photo study page (`chinese learning app/study/`, textbook photos → interactive
lesson). They want **one app: HanziFlow**, in HanziFlow's UI, containing both the photo
study assistant and the HSK content.

## Goals

1. **Lessons tab** in HanziFlow: photos of a textbook lesson → AI extraction → the six
   interactive steps (New words, Listen & pick, Read the text, Grammar, Build it, Check-up),
   saved and resumable. Same behaviour as the study page, redrawn in Liquid Glass.
2. **Lesson words become flashcards:** after the review screen, the lesson's words are added
   to a new HanziFlow deck named after the lesson, so they join daily *Study Now* reviews.
3. **Built-in lessons from 学中文:** the 12 grammar points (HSK 2/3) and 16 dialogues appear
   in the Lessons tab as ready-made lessons that run through the same steps (no AI needed).
4. **HSK decks:** from Decks, "+ HSK deck" adds any HSK 2.0 level (1–5) or HSK 3.0 band (1–6)
   as a HanziFlow deck.
5. Lessons sync between phone and computer and are included in backup/export, like decks.

## Non-goals

- No changes to the 学中文 app or the study page in `chinese learning app` (they stay as they
  are; retiring them is a later decision).
- No new AI features beyond extraction (no AI chat, no AI grading).
- No change to HanziFlow's SRS scheduling, quiz, stats or sync transport.

## Anti-goals

- HanziFlow feels like two apps glued together (different colours, buttons, fonts).
- Adding an HSK deck floods daily reviews (hundreds of new cards at once).
- The AI key leaves the device through sync or backup.
- Existing user data (decks, cards, progress) is changed or lost.

## Constraints

- HanziFlow is a static site (GitHub Pages, `cpamukcu.github.io/hanziflow`), plain JS with
  `window.*` modules, a service worker (`npm run stamp` after any app file change, enforced
  by `npm test`), Node tests in `tests/*.test.mjs`.
- State is `hanziflow.v2` in localStorage; sync merges `decks` and `cards` by id with `u`
  timestamps and tombstones (`js/sync.js`).
- AI call: browser → OpenRouter (default `google/gemma-4-31b-it:free`) or a custom
  OpenAI-compatible endpoint, learner's own key. Zhipu was ruled out (no CORS).

## Approach

One sensible way: build it natively into HanziFlow's structure. Embedding the study page in
an iframe or linking out would break the single look and keep two storage systems; rewriting
HanziFlow around the study page would throw away its tested SRS and sync. So:

- `js/lesson-core.js` (`window.HFLesson`): port of `study/core.js` (parsing, validation,
  segmentation, exercise generation, request building, error mapping, reply reading) with its
  26 tests moved to `tests/lesson-core.test.mjs`. Storage moves out of it (HanziFlow's `S`).
- `js/lessons.js`: the Lessons screens and step widgets, using HanziFlow's helpers
  (`esc`, `speak`, `colorHanzi`, `hfDialog`, `toast`, `openWriter`) and theme classes.
- `data/hsk-content.js` (`window.HF_HSK`): HSK lists, grammar points and dialogues copied once
  from 学中文 `index.html` by `tools/extract_hsk.mjs` (kept so it can be re-run).

## Claude's calls (correctable)

- **Navigation:** a sixth tab **Lessons** between Decks and Study. If six labelled tabs don't
  fit at 375 px, labels shrink/hide on narrow screens (icons stay).
- **Lessons screen:** "＋ Lesson from photos" button; "Your lessons" (photo lessons, newest
  first, with progress); "Grammar" (12, grouped HSK 2 / HSK 3); "Dialogues" (16).
- **Built-in lessons** are converted to the lesson shape on the fly: a grammar point becomes a
  lesson with one grammar entry and its words taken from the example sentences via HanziFlow's
  segmenter + dictionary; a dialogue becomes a lesson with one text and its words likewise.
  Only steps that have content show (existing `buildSteps` rule). Built-ins are not stored.
- **Photo lesson → deck:** the review screen has "Add N words to flashcards" (on by default).
  Creates deck "<lesson title>"; words already in that deck are skipped; pinyin/meaning the
  AI left empty and an example sentence are filled from HanziFlow's dictionary
  (`HF` lookup), marked with the usual status chip.
- **HSK decks:** dialog to pick standard + level, shows word count and how many are already in
  HanziFlow; words already present anywhere are skipped (toast says how many). Cards are
  filled from the dictionary (curated examples), falling back to the list's pinyin/meaning.
  Flooding is already prevented by the existing *New cards per session* cap; the dialog says
  so ("New cards arrive 15 a day").
- **Storage & sync:** photo lessons live in `S.lessons` (array, each with `id`, `u`) and sync
  with the same newest-wins + tombstone rule as decks (add `"lessons"` to `sync.js`'s kinds,
  with tests). Lesson progress (`step`, `missed`) is per device in `hanziflow.lessonProgress`.
  AI settings in `hanziflow.ai` — never in `S`, so never synced or exported.
- **Settings:** an "AI for photo lessons" card (provider, model, key with show/hide) in the
  existing Settings screen.
- **Look:** `.card`, `.btn`, `.quiz-opt`, `.grade`, `.pill`, glass classes from `theme.css`;
  tone-coloured hanzi and pinyin as elsewhere in HanziFlow; a ✍️ stroke-order button on word
  cards (existing `openWriter`). Works in light and dark themes.
- **Offline:** built-in lessons and HSK decks work offline; photo lessons need the network only
  for extraction.

## Left to the builder

- Exact layout of each step within HanziFlow's components.
- How the extract tool parses 学中文's `index.html` (it's plain JS object literals).
- Whether `lessons.js` splits into more files.
