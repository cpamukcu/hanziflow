# HanziFlow redesign — progress & handoff

Read `HanziFlow_Project_Analysis.md` first, then `HanziFlow_Kimi_Code_Step_By_Step_Guide.md`.
Continue with **Step 4** (Liquid Glass theme). Paste one step prompt at a time.

## Done (branch `redesign`)
- step-0: file split (`assets/theme.css`, `js/app.js`), legacy snapshot, tag `pre-redesign`
- step-1: vendored `vendor/pinyin-pro.min.js` + `vendor/chart.umd.min.js`, `HF_MISSING_DEPS`, `hfPinyin()`
- step-2: `tools/build_data.mjs` → `data/dictionary.js` + `data/dictionary-extra.js` + `data/LICENSES.md`
- step-3: `js/lookup.js` (window.HF engine) + `tests/lookup.test.mjs` (41 assertions pass)

## Verify commands
- `node tests/lookup.test.mjs` → 41 passed, 0 failed
- `node tools/build_data.mjs` → rebuilds data (idempotent; raw sources cached in tools/, gitignored)
- `python3 -m http.server 8080` → preview; `HF_DATA` and `HF` must exist in console

## Remaining
Steps 4 (theme), 5 (import UX), 6 (schema v2/security), 7 (tests/QA), 8 (SW/deploy).
User data lives in localStorage only; backup exists at ~/Downloads/hanziflow-backup-2026-11-07.json.
