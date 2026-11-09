# HanziFlow — Full Project Analysis

**Analysed on:** 2026-11-09  
**Live site:** https://cpamukcu.github.io/hanziflow/  
**Repository:** `cpamukcu/hanziflow` (branch `main`)  
**Reference material:** `README.md`, `index.html` (314,026 bytes / 2,006 lines), the 5 attached Liquid Glass UI reference images, and runtime checks of `pinyin-pro@3.18.2`.

> This document is Part A. The copy‑paste Kimi Code implementation guide is in `HanziFlow_Kimi_Code_Step_By_Step_Guide.md`.

---

## 1. Executive summary

HanziFlow is a **single‑file, no‑build, localStorage‑only Chinese flashcard PWA‑style app** for HSK 2/3 learners. The concept is good and most of the study engine already exists: weekly decks, SM‑2 scheduling, flip cards, quizzes, tone colours, speech synthesis, stats, dark mode, JSON backup.

The app does **not** work reliably as a "paste words → get complete cards" tool. The failure is not one bug but a chain of design decisions:

1. The importer only splits on `\n` and only does **exact string matching** against a small in‑file dictionary.
2. That dictionary has **1,147 HSK 1–4 entries**. The placeholder in the app itself (`苹果 / 环境 / 保护 / 经济…`) contains `经济`, which is **not in the dictionary** — so the app's own demo input produces an incomplete card.
3. Words outside the dictionary get **pinyin only**, with empty meaning, empty example sentence, `HSK 3` guessed, and an `AUTO` badge. The user still has to fill everything manually.
4. `pinyin-pro` is loaded from jsDelivr with **no local fallback**. If the CDN is blocked, slow, or fails, the pinyin field is silently left blank — no error is shown.
5. There is **no free‑text word extraction**: the system cannot "find words" inside a sentence or a textbook paragraph.

At the same time, the UI is a flat light/dark card layout with solid white surfaces, while the attached references show a **Liquid Glass / frosted‑glass** design language: translucent layered panels, blurred backgrounds, specular borders, floating pill docks, pastel glass tiles, and a neon dark variant.

**Bottom line:** keep the study engine, replace the data layer, rewrite the import pipeline, vendor the dependencies, and rebuild the visual system. Do not try to patch only the CSS.

---

## 2. Repository and architecture

| Item | Value |
|---|---|
| Files in repo root | `README.md` (3,473 B), `index.html` (314,026 B) |
| Build step | None. Static file served by GitHub Pages |
| HTML | Lines 1–288 – head, inline CSS (12–173), screen markup (175–286) |
| Dictionary data | Lines 289–1438 – `const HSK_DICT=[...]`, inline JS literal |
| Application JS | Lines 1439–2003 – one `"use strict"` IIFE‑less classic script |
| External scripts | Lines 10–11: `chart.js@4.4.1`, `pinyin-pro@3.18.2` from `cdn.jsdelivr.net` |
| External CSS / fonts | None |
| Persistence | `localStorage["hanziflow.v1"]` (line 1442) |
| Offline claim | README says "works offline once loaded"; only true after CDN assets are already cached |
| Target viewport | `#app{max-width:640px}` (line 33) – mobile‑first, wasted space on PC |

The whole app is one `<script>` with **44 named functions**, no modules, no tests, no type checking, and no schema versioning.

### 2.1 Code map (line numbers refer to `index.html` on `main`)

| Area | Lines | Notes |
|---|---|---|
| Design tokens / CSS | 12–173 | `:root` + `[data-theme="dark"]`, flat solid cards |
| Screen containers | 182–276 | `home, weeks, week-detail, add, study, quiz, browse, stats, settings` |
| Bottom tab bar | 279–285 | 5 tabs: Home / Decks / Study / Stats / Settings |
| `HSK_DICT` | 289–1438 | 1,147 entries: `{w,p,m,h,s:{z,y,e}}` |
| Store / state | 1442–1460 | `KEY`, `defaultState()`, `load()`, `save()`, `dictMap` |
| Tone colours | 1462–1507 | `TONE_MARKS`, `splitSyllables()`, `colorHanzi()`, `colorPinyin()` |
| TTS | 1509–1518 | `speechSynthesis`, `zh-CN`, rate 0.85 |
| SRS | 1524–1575 | `newSRS`, `stageOf`, `gradeCard`, `studyQueue` |
| Router | 1577–1590 | `go(name)`, tab click delegation |
| Home / decks | 1592–1681 | `renderHome`, `openWeek`, `cardRowHTML` |
| **Bulk paste / auto‑fill** | **1683–1747** | `startPaste`, `reviewRows` – the broken path |
| Single card form | 1749–1792 | `cardForm` – partial live autofill |
| Study / flip | 1793–1861 | `startStudy`, `renderStudyCard`, `finishSession` |
| Quiz | 1863–1913 | `startQuiz`, `renderQuiz`, `finishQuiz` |
| Browse | 1914–1927 | filter by HSK, capped at 200 rows |
| Stats | 1929–1947 | 3 Chart.js charts, hardcoded teal |
| Settings / backup | 1949–1997 | export, import, reset, theme toggle |
| Init | 1999–2002 | `load(); setTheme(...); go("home")` |

### 2.2 Data model

```js
// localStorage["hanziflow.v1"]
{
  decks:   [{ id, name, created }],
  cards:   [{ id, deckId, w, p, m, h, s:{z,y,e}, auto, srs:{e,ivl,due,reps,lapses} }],
  settings:{ target:20, newCap:15, theme:"light" },
  streak:  { count, last },
  reviews: { "YYYY-MM-DD": { n, ok } }
}
```

`w` = hanzi, `p` = pinyin, `m` = English meaning, `h` = HSK level, `s` = example sentence (Chinese / pinyin / English). There is **no `version` field**, no `source`, no `confidence`, and no migration path.

---

## 3. Dictionary audit

Measured against the actual `HSK_DICT` literal:

| Metric | Value |
|---|---|
| Parsed entries | **1,147** |
| HSK 1 | 152 |
| HSK 2 | 144 |
| HSK 3 | 296 |
| HSK 4 | 555 |
| Missing pinyin / meaning / example | 0 / 0 / 0 (curated data is complete) |
| Duplicate headwords | 1 (`长` appears twice with different readings) |
| Coverage | HSK 1–4 only; no HSK 5–6, no phrases, no proper nouns, no traditional forms |

Spot checks that matter:

| Pasted word | In dict? | Result today |
|---|---|---|
| `苹果` | yes | full card |
| `环境` | yes | full card |
| `保护` | yes | full card |
| `经济` | **no** | pinyin only, empty meaning/example, `AUTO`, HSK 3 guessed |
| `你好` | **no** | pinyin only |
| `所以` | **no** | pinyin only |
| `图书馆` | yes | full card |

`经济` is literally the 4th example in the textarea placeholder at line 1690. **The shipped demo input demonstrates the bug.**

---

## 4. Root cause: "doesn't pick up the words automatically"

Severity: P0 = breaks the core promise, P1 = major friction, P2 = polish.

| # | Sev | Where | What happens | Why it fails |
|---|---|---|---|---|
| 1 | **P0** | 1701 | `const hit = dictMap[w]` | Exact string match only. No trim variants, no traditional→simplified, no punctuation stripping, no fuzzy match, no segmentation. `苹果 ` / `1. 苹果` / `苹果（píngguǒ）` / `圖書館` all miss. |
| 2 | **P0** | 1698 | `value.split("\n").map(s=>s.trim())` | Only newline‑separated, one word per line. Real textbook pastes contain numbers, tabs, commas, pinyin, English glosses, `、`, `；`, `|`, or a whole paragraph. |
| 3 | **P0** | 1703–1705 | unknown word returns `{p, m:"", s:{z:"",y:"",e:""}, auto:true}` | The system never produces meaning or example sentences for unknown words. It only creates a blank card with an `AUTO` label. |
| 4 | **P0/P1** | 10–11, 1704 | `window.pinyinPro` from jsDelivr, wrapped in `try{}catch(e){}` | If the CDN is blocked/unavailable (common on some networks in China), `p` stays `""` and **no error is shown**. Verified: the UMD bundle does expose `window.pinyinPro` and `pinyin('苹果') → "píng guǒ"`, so the API call itself is correct — the dependency delivery is fragile. |
| 5 | P1 | 289–1438 | 1,147‑word dictionary | HSK 2/3 textbooks contain compounds and phrases well outside this list. Most real batches will be partly `AUTO`. |
| 6 | P1 | 1684–1710 | no text‑extraction mode | The stated goal "the system help me find the words" is not implemented anywhere. There is no segmentation of a pasted sentence/paragraph. |
| 7 | P1 | 1705 | `h:3` hardcoded | Unknown words are silently labelled HSK 3. Misleading metadata. |
| 8 | P1 | 1772–1776 | `cardForm` live lookup | Only fires on `#cf-w` `input`, only if the pinyin field is empty, no debounce, no suggestion list, no paste‑of‑many‑words handling. If the user typed pinyin first, dictionary meaning is never filled. |
| 9 | P2 | 1717 | `<span class="tag-auto">AUTO</span>` | `AUTO` is presented as a warning but there is no "re‑lookup", "generate example", or confidence detail. |
| 10 | P2 | 1742 | `rows.forEach(... S.cards.push(...))` | Saves incomplete cards without validation. Users end up with empty back faces and quiz cards that are silently skipped. |

**Verified runtime behaviour of `pinyin-pro@3.18.2`** (UMD loaded in Node):

```
pinyin('苹果')                       → "píng guǒ"
pinyin('经济')                       → "jīng jì"
pinyin('我今天去图书馆看书，因为明天要考试。', {type:'array'})
  → ["wǒ","jīn","tiān","qù","tú","shū","guǎn","kàn","shū","，","yīn","wèi","míng","tiān","yào","kǎo","shì","。"]
pinyin('银行的行长来了')              → "yín háng de xíng cháng lái le"
```

So pinyin generation is solvable locally; the missing pieces are **data coverage, input normalisation, sentence generation, and dependency resilience**.

---

## 5. Other defects, risks and technical debt

| # | Sev | Where | Issue | Fix direction |
|---|---|---|---|---|
| A | **High** | 1496–1507 | `colorHanzi()` / `colorPinyin()` insert raw characters into `innerHTML` without `esc()` for non‑Chinese chars and pinyin. A pasted `A&B` or `<` can inject HTML. | Escape every interpolated value. |
| B | High | 1933 | When Chart.js is missing: `canvas.replaceWith("Charts need internet…")` destroys the canvas. Charts can never render later in that session even if the library appears. | Show a message sibling, keep the canvas; recreate on next render. |
| C | High | 1442–1459 | No schema version / migration. Any new card fields break old backups; `load()` swallows all `JSON.parse` errors silently. | `hanziflow.v2` + `migrateV1toV2()` + visible warning. |
| D | Medium | 1866 | Quiz pool is `.filter(c => c.m)` — all `AUTO` cards with empty meaning are unusable in quizzes. | Enrich first; fall back to pinyin/hanzi distractors. |
| E | Medium | 1868, 1875, 1876 | `sort(() => Math.random()-0.5)` is a biased shuffle. | Fisher–Yates. |
| F | Medium | 1965–1985 | Import "merge" dedupes by `id` only, so the same word imported twice creates duplicates. | Dedupe by `(deckId, normalised word)`. |
| G | Medium | 1563–1566 | `dueCards()` is dead code and contains `&& false`; `studyQueue()` reimplements the logic. | Remove dead code, one queue builder. |
| H | Medium | 1532–1542 | `Again` sets `due = now + 10 min` **and** requeues in the same session; `stageOf()` can flip a card to `Learning` from a single lapse. Acceptable but needs explicit tests. | Add SRS unit tests. |
| I | Medium | 1468–1495 | `splitSyllables()` is a heuristic. Polyphones, neutral tones, apostrophes, capitalised proper nouns (`Běijīng`) and whole example sentences can misalign tone colours. | Use `pinyinPro.pinyin(..., {type:'array'})` and align by character index. |
| J | Medium | 1937–1946 | Chart colours hardcoded `#0d9488`; will clash with the new theme. | Read CSS variables / theme palette. |
| K | Medium | 33, 41–48 | `max-width:640px` + bottom bar only. On PC the app is a narrow column; reference images are wide dashboards. | Responsive 2‑column shell + glass rail. |
| L | Medium | 10–11 | Both CDN `<script>` tags are blocking and un‑vendored. No `defer`, no SRI, no local copy, no service worker. | Vendor into `vendor/`, `defer`, optional SW. |
| M | Low | 1859, 1911 | Inline `onclick="startStudy(null)"` / string‑interpolated `startQuiz('id')` rely on globals. | Event delegation. |
| N | Low | 1916–1925 | Browse caps at 200 rows, no pagination; README admits Home has no search. | Virtualised list / global search. |
| O | Low | 289–1438 | 1,100 dictionary objects inline in HTML makes the file 314 KB and hard to edit. | Generated `data/dictionary.js`. |
| P | Low | 1820–1823 | `colorHanzi(c.s.z, c.s.y)` tone‑colours an entire sentence by assuming 1 syllable = 1 hanzi; punctuation and numbers drift. | Store per‑character pinyin array for examples. |

---

## 6. Visual gap vs. the 5 attached references

Current UI: solid `#ffffff` / `#182229` cards, 14 px radius, small flat shadows, teal gradient hero, emoji tab bar, 640 px column.

| Image | Pattern to adopt | HanziFlow mapping |
|---|---|---|
| 1 — landscape + glass pill nav | Blurred scenic background, floating capsule dock, dark circular active bubble, white specular rim | Bottom tab bar → floating glass dock; active tab gets an inner bubble |
| 2 — smart‑home dashboard | Layered frosted panels over a soft interior, top status pill, left icon rail, room switcher, green toggles | Desktop left rail, top welcome/theme pill, deck/room switcher, glass switches |
| 3 — Liquid Glass Kit | One large glass sheet, pastel lilac/mint tiles, segmented control, circular progress, coral CTA | Dashboard grid, HSK filter segmented control, mastery ring, coral "Add words" button |
| 4 — company cards finance | Light grey grid background, holographic rainbow cards, glass chart panel, neon‑rim upgrade CTA | Deck cards with subtle iridescence, stats glass panels, accent "Upgrade/Study" tile |
| 5 — dark UI kit | Deep navy, cyan/magenta neon edges, glowing buttons/rings, high‑contrast white text | `data-theme="dark"` variant with restrained glow, not full neon overload |

Design principles to carry over: **translucency + blur, 24–32 px radii, 1 px light stroke, inset top highlight, layered depth, pastel/iridescent accents, generous whitespace, and a real light/dark pair**. Keep the five tone colours readable — they are a learning feature, not decoration.

---

## 7. Recommended target architecture

```
hanziflow/
├── index.html                  # markup + deferred script tags only
├── assets/
│   └── theme.css               # Liquid Glass design system
├── vendor/
│   ├── pinyin-pro.min.js       # local copy, no CDN
│   └── chart.umd.min.js        # local copy, no CDN
├── data/
│   ├── dictionary.js           # generated: window.HF_DATA = {...}
│   └── LICENSES.md             # CC-CEDICT / Tatoeba attribution
├── js/
│   ├── lookup.js               # normalise, segment, enrich, confidence
│   └── app.js                  # existing 44 functions, refactored
├── tools/
│   └── build_data.mjs          # CEDICT + Tatoeba + pinyin-pro → dictionary.js
├── tests/
│   └── lookup.test.mjs         # Node test suite for the import pipeline
├── sw.js                       # optional offline cache
├── README.md                   # updated
└── HanziFlow_*.md              # this analysis + the Kimi Code guide
```

Why generated data instead of an API at runtime: GitHub Pages has no backend, CORS is unreliable, and an API key in a static frontend is visible to anyone. **Build once, ship static data.** Runtime LLM enrichment can be added later as an optional, clearly labelled, user‑supplied key feature for local use only.

### 7.1 Data sources

| Need | Source | License / note |
|---|---|---|
| Headwords, traditional/simplified, definitions, readings | **CC‑CEDICT** (`cedict_ts.u8`, https://www.mdbg.net/chinese/export?format=cedict , mirror: https://github.com/edvardsr/cc-cedict/tree/main/data ) | CC BY‑SA 4.0 — attribute and share‑alike the derived dictionary file (https://cc-cedict.org/wiki/) |
| Chinese ↔ English example sentences | **Tatoeba** weekly exports: `sentences` + `links` (https://tatoeba.org/eng/downloads ) | CC BY 2.0 FR — attribute (download page states this) |
| Tone‑marked pinyin for words/sentences | **pinyin‑pro** (https://github.com/zh-lx/pinyin-pro , https://pinyin-pro.cn/ ) | MIT, run at build time and locally at runtime |
| Curated HSK 1–4 examples | Existing `HSK_DICT` (lines 289–1438) | Keep as priority; it is already high quality |
| HSK levels | Existing `h` values + an HSK 1–6 word list if desired | Keep `h:null` when unknown, never guess |

CC‑CEDICT lines look like `傳統 传统 [chuan2 tong3] /traditional/…`; the build script should parse both headwords, keep the simplified form as the key, convert `u:` → `ü`, keep the original numbered reading as a cross‑check, and generate display pinyin with `pinyin-pro` from the Chinese string (better polyphone handling in phrase context).

---

## 8. What "working perfectly" means — acceptance criteria

1. Pasting `苹果 / 环境 / 保护 / 经济` (newlines, commas, numbered list, or tab‑separated) yields **4 cards with pinyin + meaning + Chinese example + example pinyin + English translation**. `经济` is no longer blank.
2. Pasting `我今天去图书馆看书，因为明天要考试。` in **Text mode** returns a selectable list of found words (e.g. 今天 / 图书馆 / 看书 / 因为 / 明天 / 考试) with enrichment.
3. `1. 图书馆  túshūguǎn  library`, `圖書館`, `苹果，香蕉；牛奶` and trailing punctuation all resolve correctly.
4. With jsDelivr blocked / DevTools offline, pinyin, dictionary and charts still work because assets are vendored/cached.
5. Every row shows a clear status: `Curated` / `Dictionary` / `Pinyin only – needs review`, with an inline edit and a re‑lookup action. No silent empty saves.
6. Light and dark Liquid Glass themes both match the references; tone colours remain ≥ 4.5:1 contrast; `prefers-reduced-motion` / no‑`backdrop-filter` fallbacks work.
7. Existing `hanziflow.v1` data is migrated automatically; export → reset → import round‑trip preserves decks, cards, SRS and streak.
8. Desktop ≥ 900 px uses a wider dashboard; mobile keeps the floating dock.
9. `node tests/lookup.test.mjs` passes; browser QA walks all 9 screens without console errors.
10. GitHub Pages deploy serves the new files with correct paths; attribution for CC‑CEDICT and Tatoeba is visible in the app/README.

---

## 9. Priority order

| Phase | Work | Risk |
|---|---|---|
| 0 | Backup + Git branch + vendored dependencies | Low |
| 1 | Build `dictionary.js` (CEDICT + Tatoeba + curated HSK) | Medium (licensing, file size) |
| 2 | New `lookup.js` pipeline + importer UI | **High value, core fix** |
| 3 | Liquid Glass CSS + responsive shell | Medium (visual regression) |
| 4 | Schema v2, security escaping, SRS/quiz/stats fixes | Medium |
| 5 | Tests, service worker, deploy | Low |

Do **Phase 1 + 2 before Phase 3**. A beautiful glass UI over broken data will still feel broken.
