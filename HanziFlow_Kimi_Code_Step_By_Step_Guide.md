# HanziFlow — Step‑by‑Step Guide for Kimi Code

**Goal:** turn https://cpamukcu.github.io/hanziflow/ into a reliable Chinese‑learning app and restyle it to the **Liquid Glass** language shown in the 5 attached reference images.

**Companion file:** `HanziFlow_Project_Analysis.md` (read it first — it contains the line‑by‑line audit, root causes, data sources and acceptance criteria).

**How to use this guide**

1. Put both `.md` files in the repository root.
2. Paste **one prompt at a time** into Kimi Code. Do not combine steps.
3. After each step, run the **Acceptance checks**. If any fail, fix them before moving on.
4. Ask Kimi Code to make **one Git commit per step** with a message like `step-2: generate dictionary data`.
5. Keep the browser open on `https://cpamukcu.github.io/hanziflow/` (or `python3 -m http.server` locally) and re‑test on both a phone‑sized window and a ≥ 1200 px desktop window.

> ⚠️ Before Step 0: in the live app go to **Settings → Export backup (JSON)** and save the file. All user data lives in `localStorage` and is not in the repo.

---

## Pre‑flight checklist

- [ ] Git working tree is clean; branch `main` is up to date.
- [ ] `index.html` is the 314 KB / 2,006‑line file described in the analysis.
- [ ] Node.js ≥ 18 available locally (`node -v`) for the one‑off data build script.
- [ ] Python 3 available (`python3 -m http.server 8080`) for local preview.
- [ ] Both `.md` files committed to the repo so Kimi Code can read them.
- [ ] A JSON backup of real user data is saved outside the repo.

---

## Step 0 — Baseline, backup and safe restructuring

**Goal:** freeze the working version, create a rollback point, and split the single file into maintainable pieces without changing behaviour.

**Prompt**

~~~text
Kimi Code, read HanziFlow_Project_Analysis.md first. Work in the repository root.

1. Create a Git branch `redesign` from `main`. Tag the current commit `pre-redesign`.
2. Copy the current `index.html` to `legacy/index.before-redesign.html` and commit it. Do not delete or edit it.
3. Create this folder structure with placeholder files (do not change app behaviour yet):
   assets/theme.css
   vendor/            (empty, .gitkeep)
   data/              (empty, .gitkeep)
   js/                (empty, .gitkeep)
   tools/             (empty, .gitkeep)
   tests/             (empty, .gitkeep)
4. In index.html, replace the inline <style> block (lines 12–173) with
   <link rel="stylesheet" href="assets/theme.css">, and paste the original CSS
   into assets/theme.css unchanged. Replace the inline application <script>
   (lines 1439–2003) with <script defer src="js/app.js"></script> and move the
   code verbatim into js/app.js. Leave HSK_DICT inline for now.
5. Add `defer` to the two CDN <script> tags in <head>.
6. Add a tiny boot guard at the end of js/app.js: if `window.pinyinPro` or
   `window.Chart` is missing, log a clear console warning and show a non-blocking
   banner in the UI instead of failing silently.
7. Verify all 9 screens still render and that Settings → Export backup still
   downloads identical JSON.
8. Commit as `step-0: baseline backup and file split`.

Report: which files changed, the byte size of each new file, and the result of
the export/import round-trip check.
~~~

**Acceptance checks**

- `git tag` lists `pre-redesign`; `legacy/index.before-redesign.html` is byte‑identical to the original `index.html`.
- App loads from `python3 -m http.server 8080` with no console errors.
- Dark mode toggle, deck creation, study, quiz, stats and export all still work.
- No visual change yet — this step is structural only.

**Rollback:** `git checkout pre-redesign -- index.html`.

---

## Step 1 — Vendor the dependencies (kill the CDN failure)

**Goal:** `pinyin-pro` and Chart.js must work offline and on networks where jsDelivr is blocked.

**Prompt**

~~~text
Kimi Code, continue from Step 0.

1. Download these exact versions into vendor/ and commit the files:
   - https://cdn.jsdelivr.net/npm/pinyin-pro@3.18.2/dist/index.min.js  -> vendor/pinyin-pro.min.js
   - https://cdn.jsdelivr.net/npm/chart.js@4.4.1/dist/chart.umd.min.js -> vendor/chart.umd.min.js
   (If the network blocks a URL, use `npm pack pinyin-pro@3.18.2` /
   `npm pack chart.js@4.4.1` and copy the dist file. Never keep a runtime CDN
   dependency.)
2. In index.html replace both CDN <script src> with local `vendor/...` paths,
   keep `defer`, and add `integrity`-free simple `onerror` handlers that set
   `window.HF_MISSING_DEPS.push('pinyin-pro')` / `('chart.js')`.
3. Add `window.HF_MISSING_DEPS = []` in a tiny inline script BEFORE those tags.
4. In js/app.js, make `pinyinPro` usage resilient:
   - Helper `hfPinyin(text, opts)` returns "" and records a warning if the lib is missing.
   - Never wrap a failed lookup in an empty `catch(e){}` again.
   - Show a toast "Pinyin engine unavailable — check vendor/pinyin-pro.min.js" once.
5. Update the boot guard from Step 0 to read `HF_MISSING_DEPS`.
6. Test with Chrome DevTools → Network → Offline: reload, paste 苹果, confirm
   pinyin still appears and charts still render from local files.
7. Commit as `step-1: vendor pinyin-pro and Chart.js`.

Report the SHA/byte size of both vendored files and the offline test result.
~~~

**Acceptance checks**

- `grep -R "cdn.jsdelivr" index.html js/ assets/` returns nothing.
- Offline reload: `window.pinyinPro.pinyin('苹果') === 'píng guǒ'`.
- Offline reload: Stats screen draws 3 charts.
- A deliberately renamed `vendor/pinyin-pro.min.js` produces a visible warning, not a blank card.

---

## Step 2 — Generate a real dictionary + example‑sentence bank

**Goal:** replace the 1,147‑word ceiling with static, offline, licensed data. This is the single most important fix.

**Prompt**

~~~text
Kimi Code, continue from Step 1. Read section 7.1 of HanziFlow_Project_Analysis.md.

Create `tools/build_data.mjs` (Node ≥ 18, ESM) that generates
`data/dictionary.js` and `data/LICENSES.md`. Requirements:

A. INPUTS (build-time only, never fetched by the browser)
   1. CC-CEDICT `cedict_ts.u8` from https://www.mdbg.net/chinese/export?format=cedict
      (zip). Fallback mirror if blocked:
      https://raw.githubusercontent.com/edvardsr/cc-cedict/main/data/simplified.js
      or ask me to drop cedict_ts.u8 into tools/. Parse lines shaped like:
      傳統 传统 [chuan2 tong3] /tradition/ traditional/
      Keep BOTH headwords, map traditional -> simplified, convert `u:` to `ü`,
      keep the original numbered reading as `cedictPinyin`, split `/.../`
      senses into an array of English meanings (max 3 senses per entry).
   2. Tatoeba exports from https://tatoeba.org/eng/downloads : the `sentences`
      file and `links.tar.bz2` (sentence id ↔ translation id). Build
      Chinese(cmn) -> English sentence pairs. For each dictionary headword,
      pick the SHORTEST suitable cmn sentence (6–28 hanzi, contains the word,
      has an English link), prefer sentences with simple grammar. Store max 2.
   3. The existing curated `HSK_DICT` from legacy/index.before-redesign.html
      lines 289–1438 (1,147 entries). Its pinyin/meaning/example/HSK level win
      over generated data. Preserve its `s:{z,y,e}` exactly.
   4. `pinyin-pro` (import from vendor/pinyin-pro.min.js or install as a dev
      dependency) to generate tone-marked pinyin for every headword and every
      example sentence. Use `{toneType:'symbol', type:'array'}` and join with
      spaces, preserving punctuation as separate tokens. Flag heteronyms using
      `pinyinPro.polyphonic(word)` where available.

B. OUTPUT `data/dictionary.js`
   A single classic-script file (NO fetch, NO ES module export, works on
   file:// and GitHub Pages):
     window.HF_DATA = {
       version: "2.0.0",
       generatedAt: "...",
       meta: { sources: [...], licenses: "see data/LICENSES.md" },
       entries: {
         "苹果": { w:"苹果", t:"蘋果", p:"píng guǒ", pa:["píng","guǒ"],
                   m:"apple", senses:["apple"], h:1,
                   ex:[{z:"...", y:"...", e:"..."}],
                   src:"curated|cedict|generated", heteronym:false }
       },
       sentences: { "经济": [{z,y,e,source:"tatoeba|curated"}] },
       trad2simp: { "圖書館":"图书馆", ... },
       stopwords: ["的","了","和","在","是","我","你","他","一","不", ...]
     };
   Target <= 3 MB uncompressed. If larger, keep only HSK 1–6 headwords plus the
   top 20k most common CEDICT entries and split into dictionary.js +
   dictionary-extra.js loaded lazily. Never ship the full 11 MB mirror inline.

C. OUTPUT `data/LICENSES.md`
   - CC-CEDICT: "Creative Commons Attribution-ShareAlike 4.0",
     https://cc-cedict.org/wiki/ , state that the derived dictionary file is
     shared under the same license, name the source and transformation date.
   - Tatoeba: "CC BY 2.0 FR", https://tatoeba.org/eng/downloads , attribute
     the sentence contributors.
   - pinyin-pro: MIT, https://github.com/zh-lx/pinyin-pro .
   - Curated HSK examples: original to this project.

D. VERIFY before finishing
   - `node tools/build_data.mjs` succeeds and is idempotent.
   - `node -e "require('./data/dictionary.js'); ..."` prints counts and proves
     these all resolve with pinyin + meaning + example:
     苹果, 环境, 保护, 经济, 你好, 所以, 图书馆, 圖書館 (via trad2simp), 银行, 长.
   - Add `data/dictionary.js` to index.html with `<script defer src="...">`
     BEFORE js/app.js, and add a guard that shows a clear error if HF_DATA is
     missing. Do NOT delete HSK_DICT yet; keep it as a fallback for this step.

E. Commit as `step-2: generate CC-CEDICT + Tatoeba dictionary data`.

Report: entry count, sentence count, file sizes, license lines, and the 10-word
verification table. If a download is blocked, STOP and tell me exactly which
URL failed instead of silently producing a smaller dictionary.
~~~

**Acceptance checks**

| Check | Expected |
|---|---|
| `node tools/build_data.mjs` | exits 0, prints counts |
| `HF_DATA.entries['经济']` | has `p`, `m`, and at least one `ex` |
| `HF_DATA.trad2simp['圖書館']` | `"图书馆"` |
| `HF_DATA.entries.length` | ≥ 20,000 (or documented smaller target) |
| `data/dictionary.js` | ≤ 3 MB, valid JS, no `fetch()` |
| `data/LICENSES.md` | contains CC BY‑SA 4.0 and CC BY 2.0 FR attributions |
| Live app | still loads; `HF_DATA` present in console |

---

## Step 3 — Build the Smart Lookup engine (the core fix)

**Goal:** any reasonable paste becomes complete, confidence‑labelled cards.

**Prompt**

~~~text
Kimi Code, continue from Step 2. Implement `js/lookup.js` exactly to the
contract in Appendix B of this guide, then wire it into the app.

1. Create `js/lookup.js` as a classic script exposing `window.HF` with:
   normalizeList(raw), extractFromText(raw, opts), lookup(word, opts),
   enrichBatch(words, opts), simplify(text), isHanzi(ch), dedupe(rows).

2. normalizeList MUST handle all of these inputs:
     "苹果\n环境\n保护\n经济"
     "1. 苹果\n2) 环境\n• 保护"
     "苹果, 环境、保护；经济 | 牛奶"
     "图书馆\ttúshūguǎn\tlibrary"
     "苹果（píngguǒ）apple"
     "圖書館"
     "苹果，香蕉；牛奶。"
   Rules: split on newlines and on , ，、 ; ； | / tab / 2+ spaces / bullets;
   strip leading list numbers and bullets; remove bracketed (…) / （…） / 【…】
   annotations; take the maximal CJK run from each token; map traditional →
   simplified via HF_DATA.trad2simp; drop empty/pure-punctuation tokens; dedupe
   preserving order; cap at 200 words with a clear warning.

3. extractFromText("我今天去图书馆看书，因为明天要考试。") must return a
   selectable candidate list using longest-match segmentation against
   HF_DATA.entries (max word length 8), falling back to Intl.Segmenter('zh',
   {granularity:'word'}) for unknown spans. Filter HF_DATA.stopwords and single
   characters unless HSK 1. Return {word, start, end, hsk, matched:boolean}.

4. lookup(word) resolution order:
   curated HSK_DICT entry -> exact HF_DATA.entries -> traditional mapping ->
   fuzzy (strip 们/了/的, trailing 儿, repeated char) -> CEDICT sense split.
   Fill: p (tone marks), pa (array), m (English, max 2 senses joined), h (real
   HSK or null — NEVER guess 3), ex (curated example -> Tatoeba example ->
   generated example), confidence, sources[], needsReview, notes[].
   Use `hfPinyin()` from Step 1 for any missing pinyin. If pinyin-pro reports a
   heteronym, set confidence='medium' and add a note.

5. enrichBatch must be async, run with concurrency 6, support AbortSignal,
   report progress(i,total), and NEVER return a row with empty meaning without
   setting needsReview=true and a visible reason.

6. Do NOT touch `startPaste()` / `reviewRows()` / `cardForm()` yet — the new
   import UI is Step 5. For THIS step only expose the engine and add a
   temporary console API:
     window.HF.debug('苹果\n环境\n保护\n经济') -> prints enriched rows.
   Keep the existing import screens working via the old path for now.

7. Write `tests/lookup.test.mjs` covering every input in point 2 plus:
   - 经济 resolves with meaning + example
   - 圖書館 resolves to 图书馆
   - offline (no pinyinPro) still returns meaning/example from HF_DATA
   - no HTML injection: normalizeList('<img src=x>苹果') returns only 苹果
   - dedupe removes repeated 苹果
   Run `node tests/lookup.test.mjs` and make it pass.

8. Add `<script defer src="js/lookup.js"></script>` BEFORE js/app.js.

9. Commit as `step-3: smart lookup, normalisation and segmentation`.

Report the full output of HF.debug('苹果\\n环境\\n保护\\n经济') and the test
summary. Do not proceed if 经济 still has an empty meaning or example.
~~~

**Acceptance checks**

- `HF.debug('苹果\n环境\n保护\n经济')` → 4 rows, all with `p`, `m`, `ex[0].z`, `ex[0].y`, `ex[0].e`.
- `HF.normalizeList('1. 苹果，香蕉；牛奶。')` → `['苹果','香蕉','牛奶']`.
- `HF.extractFromText('我今天去图书馆看书')` includes `图书馆` and `看书`.
- `node tests/lookup.test.mjs` → all pass.
- With `window.pinyinPro = undefined`, `HF.lookup('经济')` still returns meaning + example from static data.

---

## Step 4 — Liquid Glass theme (light + dark)

**Goal:** match the 5 attached reference images without breaking readability.

**Prompt**

~~~text
Kimi Code, continue from Step 3. Read section 6 of HanziFlow_Project_Analysis.md
and merge Appendix A of this guide into `assets/theme.css`.

1. MERGE, do not wipe: `assets/theme.css` currently contains the original
   layout rules from Step 0. Keep every layout/positioning rule that is still
   needed (.screen, .row, .stats-grid, .flip, .grade-bar, input, textarea,
   .stage, .progress, nav.tabs mobile rules, etc.). REPLACE only the old
   `:root` / `[data-theme="dark"]` token blocks and the flat visual declarations
   (solid background, border-radius, box-shadow, colours) with the Liquid Glass
   system in Appendix A: CSS variables, .glass base class, specular ::before
   highlight, blurred aurora body background, .glass-strong / .glass-soft /
   .glass-pill / .glass-tile, iridescent .holo accents, neon dark variant,
   @supports fallback, prefers-reduced-transparency, prefers-reduced-motion,
   and a >=900px responsive dashboard shell. Append Appendix A verbatim as the
   design-token layer, then override the old component rules below it.

2. Update index.html markup ONLY for structure (no logic changes):
   - Wrap `#app` and `nav.tabs` as the TWO direct children of
     `<div class="shell">`. Remove the old `#app{max-width:640px;margin:0 auto}`
     rule so `.shell` alone controls width and the desktop grid columns.
   - Add `<div class="aurora" aria-hidden="true"></div>` as the first body child.
   - Add a `<header class="top glass-pill">` containing the logo, a welcome
     line, the light/dark toggle and a notification/backup icon (reference 2).
   - Turn `nav.tabs` into a floating glass dock: on mobile a bottom capsule with
     an active `bubble` span (reference 1); on desktop a left vertical rail
     (references 2 and 3).
   - Wrap the Home screen contents in `.dashboard-grid` so hero, stat tiles and
     deck list can span columns on desktop.

3. Apply classes across all screens (CSS only, keep every existing function):
   - .card, .stat, .week-item, .edit-row, .quiz-opt, .face, .summary,
     .browse-list containers -> .glass (or .glass-soft)
   - .hero -> .glass-strong with a teal→cyan aurora gradient
   - .btn primary -> glass pill with teal glow; .btn.ghost -> .glass-pill;
       .btn.danger keeps a red tint
   - .grade buttons -> glass pills with coloured rims/glows
   - .stage badges -> small glass pills, keep the 4 stage colours
   - .progress / master ring -> glossy inset track (reference 3)
   - Add ONE restrained `.holo` accent tile on Home for the "Study Now" CTA
     (reference 4) and a `.neon-ring` around the flip card in dark mode
     (reference 5). Do not make every element glow.
   - Stats `<canvas>` parents -> .glass; read chart colours from CSS variables
     so light/dark both look right.

4. Preserve the five tone colours (--t1..--t4, --t0) with contrast >= 4.5:1 on
   glass. Never put small body text directly on the busy aurora background —
   always inside a .glass surface.

5. `.shell` stays max-width 640px on mobile and widens to ~1120px at >=900px
   with 24px gaps (Appendix A). Ensure the fixed bottom dock does not cover
   the grade bar (add safe-area padding).

6. Visual acceptance — compare against the 5 references:
   [ ] floating capsule/pill navigation with active bubble
   [ ] layered translucent panels with 1px light stroke + inset top highlight
   [ ] blurred colourful background, not flat grey
   [ ] pastel lilac/mint tiles + one coral CTA (light theme)
   [ ] one iridescent/holographic accent, not everywhere
   [ ] dark theme = deep navy + restrained cyan/magenta neon edges
   [ ] all 9 screens legible, no solid white cards left
   [ ] no horizontal scroll at 375px, 768px, 1440px

7. Commit as `step-4: Liquid Glass light/dark theme`.

Do NOT change any JS behaviour in this step. Report the CSS variable table and
the responsive breakpoints you used.
~~~

**Acceptance checks**

- Toggle dark mode: both themes match references 3/5 respectively.
- `backdrop-filter` applied to ≤ 8 large layers (perf), with `@supports` fallback.
- DevTools → Rendering → Emulate `prefers-reduced-motion`: flip/pop animations disabled.
- 375 px / 768 px / 1440 px: no overflow, dock doesn't overlap content.
- Contrast checker: body text ≥ 4.5:1; tone colours distinguishable.

---

## Step 5 — New import UX and complete card pipeline

**Goal:** the user pastes anything, sees what was found, edits if needed, saves complete cards.

**Prompt**

~~~text
Kimi Code, continue from Step 4. Replace the whole add/import flow.

1. In js/app.js replace `startPaste(deckId)` and `reviewRows(deckId, rows)`
   (old lines 1684–1747) with a glass modal/screen containing:
   - Segmented control: [ Word list | Free text | Manual ] (reference 3).
   - Word list: big textarea, placeholder showing all accepted formats,
     live "N words detected" counter, `Auto-fill →` primary button,
     `Cancel` ghost button.
   - Free text: paste a paragraph; on "Find words" run HF.extractFromText,
     show a checkbox list of candidates with HSK level and match status;
     let the user tick/untick before enriching.
   - Manual: keep the existing single-card form but route it through HF.lookup.

2. On Auto-fill:
   - Call `HF.enrichBatch(words, {onProgress, signal})`.
   - Show a glass progress bar and a Cancel button wired to AbortController.
   - Render one `.edit-row.glass` per result with:
       hanzi (tone-coloured), pinyin input, meaning input, HSK select
       (blank/"—" when unknown), example z/y/e inputs, audio button,
       status chip: `Curated` (green) / `Dictionary` (blue) /
       `Pinyin only — needs review` (amber) / `Not found` (red),
       source list, heteronym note, `Re-lookup` and `Delete` actions.
   - Inline edits update the row model immediately (use `input` + `change`).
   - `Save to <deck>` is DISABLED while any row has `needsReview` and an empty
     meaning; show a clear "Fix N rows or mark as reviewed" hint. Allow an
     explicit "Save anyway" checkbox for advanced users.
   - Persist on each card: source, confidence, needsReview, dictionaryVersion,
     exampleSource. Keep srs from newSRS().

3. Update `cardForm(c, deckId)` (old lines 1750–1791):
   - Debounced (250ms) HF.lookup on the hanzi field, on `input` AND `paste`.
   - Show a suggestion dropdown of close matches; clicking one fills all fields.
   - Never overwrite a field the user already edited; fill only empty fields.
   - If a whole list is pasted into the hanzi field, redirect to Word list mode.

4. Update `renderStudyCard()` (old lines 1806–1849):
   - Show a small glass badge on the back face when confidence != high.
   - Use `HF_DATA` per-character pinyin arrays for example-sentence tone colouring
     instead of the old splitSyllables heuristic on whole sentences.

5. Update `startQuiz()` / `renderQuiz()`:
   - Include cards with meaning OR pinyin; if meaning is missing, use pinyin as
     the question. Replace the biased `sort(()=>Math.random()-0.5)` with a
     Fisher–Yates shuffle helper.

6. Remove the `AUTO` tag CSS/logic and the hardcoded `h:3` guess entirely.

7. Commit as `step-5: smart import UI, confidence states, complete cards`.

Report a table for these 4 inputs showing detected words, confidence, meaning
and example sentence for every row:
  "苹果\n环境\n保护\n经济"
  "1. 图书馆  túshūguǎn  library"
  "圖書館，你好！所以…"
  "我今天去图书馆看书，因为明天要考试。"  (Free text mode)
~~~

**Acceptance checks**

- All 4 inputs produce complete cards; `经济` no longer blank.
- Save is blocked (or explicitly overridden) for incomplete rows.
- Cancel mid‑enrichment leaves no partial cards in `localStorage`.
- Re‑lookup upgrades an amber row to green when data is available.
- Free‑text mode shows selectable words, not one giant card.
- Quiz works with cards that only have pinyin.

---

## Step 6 — Correctness, migration and security hardening

**Goal:** make "works perfectly" true, not just "looks perfect".

**Prompt**

~~~text
Kimi Code, continue from Step 5. Apply every fix from section 5 of
HanziFlow_Project_Analysis.md.

1. SCHEMA v2
   - New key `hanziflow.v2`. On load, if v1 exists and v2 does not, run
     `migrateV1toV2()` that copies decks, cards, settings, streak, reviews and
     adds `source:'legacy', confidence:'high', dictionaryVersion:'1.0'` to cards.
   - Keep v1 intact for one release; write v2 only. Add `version:2` to state.
   - `load()` must show a visible warning on parse failure instead of `catch(e){}`.
   - Export/import: include `version`, validate shape, dedupe merge by
     `(deckId, normalised w)` instead of `id` only.

2. SECURITY
   - Fix `colorHanzi()` and `colorPinyin()` (old lines 1496–1507): escape EVERY
     interpolated character via `esc()`, including non-Chinese chars and pinyin.
   - Audit all `innerHTML` template strings for unescaped user/dictionary data.

3. STATS
   - Old line 1933 destroys `<canvas>` with `replaceWith(text)`. Instead insert a
     sibling `.glass` warning and recreate canvases on the next successful render.
   - Read chart colours from CSS variables (`--accent`, etc.) and re-render charts
     when the theme toggles.

4. SRS / QUEUE
   - Delete dead `dueCards()` (old 1563–1566) and its `&& false`.
   - Keep one `studyQueue()`; add unit tests for: new card, Again (+10 min,
     requeue), Hard/Good/Easy intervals, stage transitions, streak rollover.
   - Replace biased shuffles everywhere with Fisher–Yates.

5. EVENTS / ROUTER
   - Remove inline `onclick="startStudy(null)"` and string-interpolated
     `startQuiz('...')`; use delegated `data-action` handlers.
   - Replace all `prompt()`/`confirm()` in the new import flow with in-UI glass
     dialogs where practical (keep native confirm only for destructive reset).

6. BROWSE / TONE ALIGNMENT
   - Replace the 200-row cap with simple pagination or "Load more".
   - Align tone colours using `pinyinPro.pinyin(text,{type:'array'})` per
     character; handle punctuation, neutral tone and capitalised proper nouns
     (e.g. Běijīng) without drift.

7. ACCESSIBILITY / PERF
   - Add `aria-label` to icon-only buttons, `role="progressbar"` to progress,
     focus-visible styles on glass controls.
   - Confirm no more than ~8 simultaneous `backdrop-filter` layers are painted.

8. Commit as `step-6: schema v2, security, SRS and stats fixes`.

Report: migration test result (seed a v1 JSON, reload, assert all cards survive),
export → reset → import round-trip result, and the list of escaped templates.
~~~

**Acceptance checks**

- Seed `localStorage['hanziflow.v1']` with 3 decks / 12 cards → reload → all 12 cards present under v2 with SRS intact.
- Export JSON → Reset all → Import (Replace) → identical counts.
- Injecting `<img src=x onerror=alert(1)>苹果` into a card renders as text only.
- Theme toggle while on Stats re-colours charts without errors.
- No `console.error` while walking all 9 screens.

---

## Step 7 — Automated tests and QA sweep

**Prompt**

~~~text
Kimi Code, continue from Step 6.

1. Finalise `tests/lookup.test.mjs` (Node, no browser needed) with at least 20
   assertions covering normalisation, segmentation, traditional conversion,
   dedupe, offline enrichment, heteronym flagging, XSS-safe output and the
   4 demo inputs from Step 5.
2. Add `tests/srs.test.mjs` for gradeCard / stageOf / studyQueue / streak.
3. Add `npm` scripts (or a simple `tools/run-tests.sh`) so `npm test` runs both.
4. Run the browser QA script in Appendix C from DevTools and paste the full
   console output into your report. It must walk home, weeks, week-detail,
   add, study, quiz, browse, stats, settings in BOTH light and dark themes,
   create a deck, import 经济, study one card, export JSON, and report zero
   errors.
5. Manual checklist (report each as PASS/FAIL):
   - 375px phone, 768px tablet, 1440px desktop
   - keyboard-only tab order reaches every control
   - prefers-reduced-motion disables flip/pop
   - no backdrop-filter fallback = still readable
   - offline reload after first visit
   - tone colours still readable on glass in both themes
   - CC-CEDICT / Tatoeba attribution visible in Settings or About
6. Commit as `step-7: tests and QA sweep`.
~~~

**Acceptance checks**

- `npm test` → 0 failures.
- Appendix C browser script → `QA_RESULT: PASS`, 0 console errors.
- All manual items PASS or explicitly documented as a known limitation.

---

## Step 8 — Offline support, attribution and deploy

**Prompt**

~~~text
Kimi Code, continue from Step 7.

1. Add `sw.js` (cache-first for the app shell: index.html, assets/theme.css,
   vendor/*, data/dictionary.js, js/*; network-first for nothing else since the
   app has no backend). Register it only on https/localhost. Version the cache
   as `hanziflow-v2-<hash>` and clean old caches on activate. Add a visible
   "Offline ready" indicator in Settings.
2. Update README.md:
   - new architecture / file tree
   - how to rebuild data: `node tools/build_data.mjs`
   - how to test: `npm test`, `python3 -m http.server 8080`
   - data sources + CC BY-SA 4.0 / CC BY 2.0 FR attribution (link data/LICENSES.md)
   - note that the derived dictionary file is shared under CC BY-SA 4.0
   - remove the inaccurate "works offline once loaded" claim or make it precise
   - keep the backup/restore warning
3. Add an "About / Data sources" glass card in Settings showing:
   HanziFlow version, dictionary version + entry count, generated date,
   CC-CEDICT (CC BY-SA 4.0), Tatoeba (CC BY 2.0 FR), pinyin-pro (MIT).
4. Cache-bust static assets with a `?v=2.0.0` query on the tags in index.html.
5. Commit as `step-8: service worker, attribution, docs`. Push branch
   `redesign` to origin, open a PR/merge to `main`.
6. Verify GitHub Pages: Settings → Pages → Deploy from branch `main` / `/ (root)`.
   After deploy, open https://cpamukcu.github.io/hanziflow/ and confirm:
   - no 404 for assets/theme.css, vendor/*, data/dictionary.js, js/*
   - `window.HF_DATA.version === "2.0.0"`
   - pasting 苹果/环境/保护/经济 yields 4 complete cards
   - light + dark Liquid Glass render correctly
   - offline reload after first visit works
7. Report the deployed commit SHA and the final acceptance table from section 8
   of HanziFlow_Project_Analysis.md.
~~~

**Acceptance checks**

- Live URL returns 200 for every new asset.
- `HF_DATA.entries['经济']` resolves on the deployed site.
- No CDN requests in the Network tab.
- README and Settings both show attribution.
- Final table: all 10 criteria from the analysis PASS.

---

# Appendix A — Liquid Glass CSS reference implementation

Kimi Code: use these tokens verbatim in Step 4; extend, do not replace the structure.

```css
/* assets/theme.css — HanziFlow Liquid Glass */
:root{
  color-scheme: light;
  --bg-0:#e9f1f6; --bg-1:#f8fcff;
  --glass-fill: rgba(255,255,255,.55);
  --glass-strong: rgba(255,255,255,.74);
  --glass-soft: rgba(255,255,255,.38);
  --glass-stroke: rgba(255,255,255,.68);
  --glass-inner: rgba(255,255,255,.82);
  --glass-shadow: 0 14px 44px rgba(28,52,78,.14), 0 2px 10px rgba(28,52,78,.07);
  --ink:#14212c; --ink-2:#536777;
  --accent:#0d9488; --accent-2:#22d3ee; --accent-3:#f472b6;
  --coral:#ff7a6b; --lilac:#c4b5fd; --mint:#a7f3d0;
  --danger:#e05252;
  --radius:28px; --radius-sm:18px; --blur:24px;
  --t1:#c23b3b; --t2:#2f7d43; --t3:#2f66c2; --t4:#7d46b0; --t0:#64748b;
}
[data-theme="dark"]{
  color-scheme: dark;
  --bg-0:#070b18; --bg-1:#101a33;
  --glass-fill: rgba(20,30,56,.46);
  --glass-strong: rgba(26,38,68,.66);
  --glass-soft: rgba(20,30,56,.30);
  --glass-stroke: rgba(160,205,255,.20);
  --glass-inner: rgba(190,225,255,.14);
  --glass-shadow: 0 18px 52px rgba(0,0,0,.48), 0 0 0 1px rgba(90,190,255,.06);
  --ink:#eef6ff; --ink-2:#9db2c8;
  --accent:#2dd4bf; --accent-2:#22d3ee; --accent-3:#e879f9;
  --t1:#ff8a8a; --t2:#7ee09a; --t3:#8ab4ff; --t4:#d3a4ff; --t0:#93a5b8;
}
*{box-sizing:border-box;-webkit-tap-highlight-color:transparent}
html,body{margin:0;min-height:100%}
body{
  background:var(--bg-1); color:var(--ink);
  font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"Helvetica Neue",Arial,sans-serif;
  font-size:16px; line-height:1.55;
}
.zh{font-family:"PingFang SC","Hiragino Sans GB","Microsoft YaHei","Noto Sans CJK SC","WenQuanYi Micro Hei",sans-serif}
.aurora{
  position:fixed; inset:-25%; z-index:-2; pointer-events:none;
  background:
    radial-gradient(38% 42% at 18% 22%, rgba(34,211,238,.42), transparent 70%),
    radial-gradient(34% 38% at 82% 18%, rgba(244,114,182,.28), transparent 70%),
    radial-gradient(46% 46% at 72% 84%, rgba(167,243,208,.36), transparent 72%),
    radial-gradient(40% 40% at 12% 82%, rgba(196,181,253,.32), transparent 72%),
    linear-gradient(135deg,var(--bg-0),var(--bg-1));
  filter:blur(58px) saturate(130%);
}
[data-theme="dark"] .aurora{
  background:
    radial-gradient(36% 40% at 20% 20%, rgba(34,211,238,.26), transparent 70%),
    radial-gradient(34% 38% at 84% 24%, rgba(232,121,249,.22), transparent 70%),
    radial-gradient(44% 44% at 70% 86%, rgba(45,212,191,.18), transparent 72%),
    linear-gradient(135deg,#050914,#101a33);
}
.glass{
  position:relative; overflow:hidden;
  background:var(--glass-fill);
  -webkit-backdrop-filter:blur(var(--blur)) saturate(170%);
  backdrop-filter:blur(var(--blur)) saturate(170%);
  border:1px solid var(--glass-stroke);
  border-radius:var(--radius);
  box-shadow:var(--glass-shadow), inset 0 1px 0 var(--glass-inner);
}
.glass::before{
  content:""; position:absolute; inset:0; pointer-events:none;
  background:linear-gradient(135deg,rgba(255,255,255,.42),rgba(255,255,255,0) 42%,rgba(255,255,255,.10));
}
[data-theme="dark"] .glass::before{
  background:linear-gradient(135deg,rgba(190,225,255,.14),rgba(190,225,255,0) 46%,rgba(120,200,255,.05));
}
.glass-strong{background:var(--glass-strong)}
.glass-soft{background:var(--glass-soft)}
.glass-pill{border-radius:999px}
.glass-tile{border-radius:var(--radius-sm); padding:16px}
.holo{
  background:linear-gradient(120deg,rgba(34,211,238,.30),rgba(196,181,253,.30),rgba(244,114,182,.26)),var(--glass-fill);
  border-color:rgba(255,255,255,.75);
}
.neon-ring{box-shadow:var(--glass-shadow), 0 0 0 1px rgba(34,211,238,.45), 0 0 26px rgba(232,121,249,.24), inset 0 1px 0 var(--glass-inner)}
.btn,.icon-btn,.grade,.quiz-opt,.pill,.switch .sl{transition:transform .18s ease, box-shadow .18s ease, background .18s ease}
.btn:focus-visible,.icon-btn:focus-visible,.grade:focus-visible,.quiz-opt:focus-visible{outline:2px solid var(--accent-2);outline-offset:3px}
@supports not ((-webkit-backdrop-filter:blur(1px)) or (backdrop-filter:blur(1px))){
  .glass{background:var(--bg-1);backdrop-filter:none;-webkit-backdrop-filter:none}
}
@media (prefers-reduced-transparency: reduce){
  .glass{background:var(--bg-1);backdrop-filter:none;-webkit-backdrop-filter:none}
  .aurora{filter:none;opacity:.35}
}
@media (prefers-reduced-motion: reduce){
  .flip,.pop,.grade,.screen,.btn,.icon-btn{animation:none!important;transition:none!important}
}
.shell{max-width:640px;margin:0 auto;padding:0 16px calc(96px + env(safe-area-inset-bottom))}
@media (min-width:900px){
  .shell{max-width:1120px;display:grid;grid-template-columns:84px 1fr;gap:24px;padding:24px}
  .dashboard-grid{display:grid;grid-template-columns:repeat(12,1fr);gap:18px}
  .hero{grid-column:span 7} .stats-grid{grid-column:span 5}
  nav.tabs{
    position:sticky; top:24px; left:auto; right:auto; bottom:auto;
    width:72px; height:max-content; flex-direction:column;
    border:1px solid var(--glass-stroke); border-radius:999px; padding:10px 0;
  }
}
```

Component mapping to enforce in Step 4:

| Reference | Element | Class |
|---|---|---|
| 1 | floating tab dock + active bubble | `.glass.glass-pill` + `.bubble` |
| 2 | top status pill / left rail / glass switches | `.glass-pill`, rail grid, `.switch` |
| 3 | pastel tiles, segmented control, progress ring | `.glass-tile` + `--lilac/--mint`, `.segmented`, `.ring` |
| 4 | holographic deck card, glass chart panel, CTA rim | `.holo`, `.glass`, `.neon-ring` (dark only) |
| 5 | dark neon edges, glowing buttons | `[data-theme="dark"]` + restrained `.neon-ring` |

---

# Appendix B — `js/lookup.js` API contract

```js
window.HF = {
  version: "2.0.0",

  // "1. 苹果，香蕉；牛奶。" -> ["苹果","香蕉","牛奶"]
  normalizeList(raw) -> string[],

  // free text -> [{word,start,end,hsk,matched}]
  extractFromText(raw, {maxWords=40, minLen=1, includeSingle=false}) -> Candidate[],

  // one complete row; never throws, never silently blanks
  lookup(word, {allowFuzzy=true, preferCurated=true}) -> {
    word, traditional, p, pa, m, senses, h,            // h: number|null
    ex: [{z,y,e,source}], confidence: "high|medium|low",
    sources: string[], needsReview: boolean, notes: string[],
    heteronym: boolean
  },

  enrichBatch(words, {onProgress, signal, concurrency=6}) -> Promise<Row[]>,

  simplify(text) -> string,
  isHanzi(ch) -> boolean,
  dedupe(rows) -> Row[]
};
```

Resolution order for `lookup()`:

1. curated `HSK_DICT` / `HF_DATA.entries[word].src === 'curated'` → `confidence:'high'`.
2. exact `HF_DATA.entries[word]` → `high` if it has meaning + example, else `medium`.
3. `HF_DATA.trad2simp[word]` → recurse on the simplified headword, add note `"converted from traditional"`.
4. fuzzy: strip trailing `们 / 了 / 的 / 儿`, collapse repeated char, try headword again → `medium`.
5. pinyin only from `hfPinyin(word)` → `low`, `needsReview:true`, note `"no dictionary entry; pinyin generated locally"`.
6. Example resolution: curated `ex[0]` → Tatoeba `HF_DATA.sentences[word][0]` → generated sentence (only at build time) → empty + `needsReview:true` + note `"no example sentence found"`.

Confidence rule: **a row with empty `m` or empty `ex[0].z` must always have `needsReview:true` and a visible reason.** No silent `AUTO` cards.

---

# Appendix C — Browser QA script

Paste into DevTools Console after Step 6. It uses only public UI actions.

```js
(async () => {
  const log = [], err = [];
  const origErr = console.error;
  console.error = (...a) => { err.push(a.join(' ')); origErr(...a); };
  const click = s => document.querySelector(s)?.click();
  const screens = ['home','weeks','study','stats','settings'];

  try {
    // 1. theme sweep
    for (const t of ['light','dark']) {
      setTheme ? setTheme(t) : document.documentElement.setAttribute('data-theme',t);
      for (const s of screens) { go(s); await new Promise(r=>setTimeout(r,60)); }
      log.push(`theme ${t}: ${screens.length} screens OK`);
    }
    // 2. data + deck
    click('[data-tab="weeks"]'); click('#btn-new-week');
    const deck = S.decks.at(-1);
    log.push(`deck created: ${deck?.name}`);
    // 3. enrichment smoke test
    const rows = await HF.enrichBatch(['苹果','环境','保护','经济','圖書館','你好','所以']);
    const incomplete = rows.filter(r => !r.m || !r.ex?.[0]?.z);
    log.push(`enriched ${rows.length} rows, incomplete=${incomplete.length}`);
    if (incomplete.length) err.push('incomplete: '+incomplete.map(r=>r.word).join(','));
    // 4. study + quiz + export
    rows.forEach(r => S.cards.push({id:uid(),deckId:deck.id,w:r.word,p:r.p,m:r.m,h:r.h??null,
      s:r.ex[0]||{z:'',y:'',e:''},source:r.sources[0],confidence:r.confidence,
      needsReview:r.needsReview,srs:newSRS(),dictionaryVersion:HF_DATA.version}));
    save(); startStudy(deck.id); go('study');
    log.push(`study queue: ${session?.queue?.length}`);
    startQuiz(deck.id); go('quiz');
    click('#btn-export');
    // 5. all screens again
    for (const s of ['home','weeks','week-detail','add','study','quiz','browse','stats','settings']) {
      go(s); await new Promise(r=>setTimeout(r,40));
    }
    log.push('9 screens walked');
  } catch (e) { err.push(String(e)); }
  console.error = origErr;
  console.table(log.map(x=>({step:x})));
  console.log(err.length ? 'QA_RESULT: FAIL\n'+err.join('\n') : 'QA_RESULT: PASS');
})();
```

---

# Appendix D — Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| Pinyin still blank | `vendor/pinyin-pro.min.js` 404 / wrong load order | Check Network tab; ensure `defer` order: HF_MISSING_DEPS → vendor → `data/dictionary.js` → `js/lookup.js` → `js/app.js` |
| `HF_DATA is undefined` | `data/dictionary.js` not committed / cache | Hard reload, verify 200, bump `?v=` |
| `经济` still has no meaning | build script produced a reduced dictionary | Re‑run `node tools/build_data.mjs`, inspect `HF_DATA.entries['经济']`, check the download‑blocked report |
| CEDICT / Tatoeba download 403 | network policy | Use the GitHub mirror in Step 2, or drop the file into `tools/` manually; never silently skip |
| Example sentences missing | no Tatoeba match for that word | Keep curated HSK examples as priority; generate examples at build time; mark `needsReview` honestly |
| Glass looks grey/washed out | too many stacked `backdrop-filter` layers | Limit blur to the shell + panels; use `.glass-soft` for nested tiles |
| Text unreadable on background | text placed outside a `.glass` surface | Wrap in `.glass`; raise `--glass-strong` opacity |
| Charts wrong colour after theme toggle | hardcoded `#0d9488` | Read `getComputedStyle(document.documentElement).getPropertyValue('--accent')` and re-render |
| Old backup lost | migration not run | Keep `hanziflow.v1`, run `migrateV1toV2()` on load, never overwrite v1 until verified |
| Cards duplicated after import | merge dedupes by `id` | Dedupe by `(deckId, HF.normalizeList(w)[0])` |
| GitHub Pages 404 on new files | case‑sensitive paths / not pushed | Verify exact filenames and branch; Pages → `main` / `/ (root)` |
| App works locally but not deployed | `file://` vs relative paths | Always use relative paths (`assets/...`), never leading `/` |

---

# Appendix E — Optional one‑shot master prompt

Use **only** if you want Kimi Code to attempt everything in one pass. The staged prompts above are safer.

~~~text
Kimi Code, read HanziFlow_Project_Analysis.md and
HanziFlow_Kimi_Code_Step_By_Step_Guide.md in full. Then execute Steps 0–8 in
order, committing after each step. Hard requirements: no runtime CDN calls;
static CC-CEDICT + Tatoeba data generated by tools/build_data.mjs with visible
CC BY-SA 4.0 / CC BY 2.0 FR attribution; HF.lookup must enrich 苹果, 环境,
保护, 经济, 你好, 所以, 圖書館 with pinyin + meaning + Chinese example + example
pinyin + English translation; Word-list AND Free-text import modes; Liquid Glass
light/dark themes matching the 5 reference images; schema v2 migration that
preserves hanziflow.v1 data; escaped all innerHTML; npm test passes; offline
reload works; deployed to https://cpamukcu.github.io/hanziflow/ . Stop and
report at the first failing acceptance check — do not silently skip a step.
~~~

---

## Definition of done

- [ ] All 10 acceptance criteria in section 8 of `HanziFlow_Project_Analysis.md` PASS.
- [ ] `npm test` passes; Appendix C returns `QA_RESULT: PASS`.
- [ ] Live site has 0 CDN requests and 0 console errors.
- [ ] Both `.md` guides and `data/LICENSES.md` are committed.
- [ ] `pre-redesign` tag still exists for rollback.
- [ ] A fresh JSON backup of the user's real data has been re-imported and verified after deploy.
