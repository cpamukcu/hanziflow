# HanziFlow

A Chinese flashcard app for HSK learners. Paste words in any format and each card fills itself in: pinyin, meaning, HSK level and an example sentence with pinyin and translation. It has spaced repetition, quizzes, tone colours, speech, stats and a Liquid Glass light/dark theme.

It is a static site with no backend or accounts. **All your data lives in this browser's localStorage, so export a backup from Settings regularly.**

Live: https://cpamukcu.github.io/hanziflow/

## Adding words

- **Word list:** newlines, commas, `、`, `；`, numbered lists, tab-separated glosses, `苹果（píngguǒ）apple` and traditional characters all work.
- **Free text:** paste a sentence or paragraph, then tick the words you want.
- **Manual:** type one word and get suggestions and auto-fill. Fields you edited are never overwritten.

Every row shows its status:

| Chip | Meaning |
|---|---|
| Curated | Hand-checked HSK 1–4 entry |
| Dictionary | CC-CEDICT meaning plus a Tatoeba or project example |
| Pieced together / Pinyin only — needs review | Not in the dictionary; check it yourself |
| Not found | Nothing could be generated; saving requires "Save anyway" |

About 14,000 words have a real example sentence. Rarer words get a clearly labelled generic one (`「蓝藻」是什么意思？`), which you can replace.

## Project layout

```
index.html            markup and script tags
assets/theme.css      Liquid Glass design system
js/lookup.js          normalise, segment, look up (window.HF)
js/srs.js             pure scheduling logic (window.HFSRS)
js/app.js             screens and storage
data/dictionary.js    core dictionary, loaded at startup (3 MB)
data/dictionary-extra.js  rest of CC-CEDICT, loaded on first add (11 MB)
vendor/               local copies of pinyin-pro and Chart.js
sw.js                 offline cache
tools/build_data.mjs  regenerates data/ from the sources
tests/                Node test suites
```

## Development

```bash
python3 -m http.server 8080
```

```bash
npm test
```

```bash
npm run build:data
```

After changing any app file, run `npm run stamp` so returning visitors get the new version; `npm test` fails if you forget.

## Offline

After the first online visit the app shell and core dictionary are cached by a service worker and work offline. The full dictionary is cached the first time you add words, so do that once while online. Service workers need https or localhost, so `file://` is not supported for offline use.

## Backup and migration

Data from the old `hanziflow.v1` format is migrated to `hanziflow.v2` automatically, and the v1 copy is left untouched. Older cards saved blank are completed from the dictionary; nothing you wrote is overwritten.

## Data sources and licences

- [CC-CEDICT](https://cc-cedict.org/wiki/): CC BY-SA 4.0. The derived `data/dictionary*.js` files are shared under the same licence.
- [Tatoeba](https://tatoeba.org/eng/downloads): CC BY 2.0 FR, by the Tatoeba contributors.
- [pinyin-pro](https://github.com/zh-lx/pinyin-pro): MIT.

Details are in [data/LICENSES.md](data/LICENSES.md).
