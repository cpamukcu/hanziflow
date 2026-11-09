# Data licenses — HanziFlow

Generated: 2026-11-09 by `tools/build_data.mjs`.

## CC-CEDICT

- License: **Creative Commons Attribution-ShareAlike 4.0** (CC BY-SA 4.0)
- Source: CC-CEDICT, https://cc-cedict.org/wiki/ (downloaded via edvardsr/cc-cedict mirror (data/all.js), transformation date 2026-11-09)
- The derived dictionary files `data/dictionary.js` and `data/dictionary-extra.js`
  are shared under the **same license, CC BY-SA 4.0**, as required by ShareAlike.
- Transformation: parsed headwords (traditional/simplified), converted `u:` to `ü`,
  kept the original numbered readings as `cedictPinyin`, split definitions into
  senses (max 3), and ranked entries by Tatoeba sentence frequency.

## Tatoeba

- License: **CC BY 2.0 FR** — https://creativecommons.org/licenses/by/2.0/fr/
- Source: Tatoeba weekly exports, https://tatoeba.org/eng/downloads
  (`cmn_sentences.tsv`, `cmn-eng_links.tsv`, `eng_sentences.tsv`, transformation date 2026-11-09)
- Attribution: the example sentences are contributed by the **Tatoeba Project and its
  contributors** (https://tatoeba.org). Sentence ids can be resolved on tatoeba.org.

## pinyin-pro

- License: **MIT** — https://github.com/zh-lx/pinyin-pro
- Used at build time to generate tone-marked pinyin for headwords and example
  sentences, and at runtime from `vendor/pinyin-pro.min.js`.

## Curated HSK examples

- The curated HSK 1–4 entries (`src: "curated"`, examples marked `source: "curated"`)
  are **original to this project** and may be used under the project's own license.
