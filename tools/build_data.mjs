#!/usr/bin/env node
/**
 * tools/build_data.mjs — HanziFlow dictionary build (Node >= 18, ESM)
 *
 * Generates:
 *   data/dictionary.js        window.HF_DATA (classic script, no fetch, no ESM)
 *   data/dictionary-extra.js  window.HF_DATA_EXTRA (lazy-loaded tail, only if needed)
 *   data/LICENSES.md          attribution (CC BY-SA 4.0 / CC BY 2.0 FR / MIT)
 *
 * Build-time inputs (never fetched by the browser):
 *   1. CC-CEDICT  https://www.mdbg.net/chinese/export?format=cedict  (zip, cedict_ts.u8)
 *      mirror:    https://raw.githubusercontent.com/edvardsr/cc-cedict/main/data/all.js
 *   2. Tatoeba    https://downloads.tatoeba.org/exports/per_language/cmn/cmn_sentences.tsv.bz2
 *                 https://downloads.tatoeba.org/exports/per_language/cmn/cmn-eng_links.tsv.bz2
 *                 https://downloads.tatoeba.org/exports/per_language/eng/eng_sentences.tsv.bz2
 *   3. Curated HSK_DICT from legacy/index.before-redesign.html
 *   4. pinyin-pro from vendor/pinyin-pro.min.js (build-time require)
 *
 * Raw downloads are cached in tools/ and reused on re-runs (idempotent).
 */

import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import https from 'node:https';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const TOOLS = __dirname;
const require = createRequire(path.join(ROOT, 'tools', 'build_data.mjs'));

const MAIN_BUDGET = 2.9 * 1024 * 1024;   // dictionary.js hard cap (spec: <= 3 MB)
const EXTRA_BUDGET = 12 * 1024 * 1024;   // dictionary-extra.js cap (lazy-loaded, compact rows)
const MAX_SENSES = 3;
const MAX_EXAMPLES = 2;
const EX_MIN_HANZI = 6, EX_MAX_HANZI = 28;

const SOURCES = {
  cedictPrimary: 'https://www.mdbg.net/chinese/export?format=cedict',
  cedictMirror: 'https://raw.githubusercontent.com/edvardsr/cc-cedict/main/data/all.js',
  tatoebaCmn: 'https://downloads.tatoeba.org/exports/per_language/cmn/cmn_sentences.tsv.bz2',
  tatoebaLinks: 'https://downloads.tatoeba.org/exports/per_language/cmn/cmn-eng_links.tsv.bz2',
  tatoebaEng: 'https://downloads.tatoeba.org/exports/per_language/eng/eng_sentences.tsv.bz2',
};

const STOPWORDS = ['的','了','和','在','是','我','你','他','她','它','一','不','也','都','就','很','还',
  '或','而','被','把','对','向','从','到','着','过','地','得','吗','呢','吧','啊','这','那','个','有',
  '没','说','去','来','上','下','里','多','少','大','小','好','要','会','能','们','与','及','于','之','其'];

/* ---------------- download helpers ---------------- */

function download(url, dest, redirects = 5) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest);
    https.get(url, { headers: { 'User-Agent': 'Mozilla/5.0 (HanziFlow build)' } }, res => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        file.close(); fs.unlinkSync(dest);
        if (!redirects) return reject(new Error('too many redirects: ' + url));
        const next = new URL(res.headers.location, url).href;
        return download(next, dest, redirects - 1).then(resolve, reject);
      }
      if (res.statusCode !== 200) {
        file.close(); fs.unlinkSync(dest);
        return reject(new Error(`HTTP ${res.statusCode} for ${url}`));
      }
      res.pipe(file);
      file.on('finish', () => file.close(resolve));
      res.on('error', reject);
    }).on('error', reject);
  });
}

async function ensureInputs() {
  const jobs = [
    { url: SOURCES.tatoebaCmn, file: 'cmn_sentences.tsv.bz2', out: 'cmn_sentences.tsv' },
    { url: SOURCES.tatoebaLinks, file: 'cmn-eng_links.tsv.bz2', out: 'cmn-eng_links.tsv' },
    { url: SOURCES.tatoebaEng, file: 'eng_sentences.tsv.bz2', out: 'eng_sentences.tsv' },
  ];
  for (const j of jobs) {
    const outPath = path.join(TOOLS, j.out);
    if (fs.existsSync(outPath)) continue;
    const bz = path.join(TOOLS, j.file);
    if (!fs.existsSync(bz)) {
      console.log(`download ${j.url}`);
      try { await download(j.url, bz); }
      catch (e) { fail(j.url, e); }
    }
    execFileSync('bunzip2', ['-kf', bz], { cwd: TOOLS });
  }

  // CEDICT: prefer the official zip; fall back to the GitHub mirror.
  const u8 = path.join(TOOLS, 'cedict_ts.u8');
  const mirror = path.join(TOOLS, 'cedict_all.js');
  if (!fs.existsSync(u8) && !fs.existsSync(mirror)) {
    try {
      console.log(`download ${SOURCES.cedictPrimary}`);
      await download(SOURCES.cedictPrimary, path.join(TOOLS, 'cedict.zip'));
      execFileSync('unzip', ['-o', 'cedict.zip'], { cwd: TOOLS });
    } catch (e) {
      console.warn(`primary CEDICT source failed (${e.message}); using mirror ${SOURCES.cedictMirror}`);
      try { await download(SOURCES.cedictMirror, mirror); }
      catch (e2) { fail(SOURCES.cedictMirror, e2); }
    }
  }
  if (!fs.existsSync(u8) && !fs.existsSync(mirror)) {
    console.error('FATAL: no CEDICT data. Drop cedict_ts.u8 into tools/ and re-run.');
    process.exit(1);
  }
}

function fail(url, e) {
  console.error(`FATAL: download blocked: ${url}`);
  console.error(`  reason: ${e.message}`);
  console.error('  Fix the network or drop the file into tools/ manually, then re-run.');
  process.exit(1);
}

/* ---------------- CEDICT parsing ---------------- */

const fixU = s => s.replace(/u:/g, 'ü');

function parseCedict() {
  // returns Map simp -> { t:Set, readings:[], senses:[] }
  const map = new Map();
  const addRow = (trad, simp, reading, senses) => {
    if (!simp || !reading) return;
    let e = map.get(simp);
    if (!e) { e = { t: new Set(), readings: [], senses: [] }; map.set(simp, e); }
    if (trad && trad !== simp) e.t.add(trad);
    if (!e.readings.some(r => r.toLowerCase() === reading.toLowerCase())) e.readings.push(reading);
    for (const s of senses) {
      const clean = s.trim();
      if (clean && !e.senses.includes(clean)) e.senses.push(clean);
    }
  };

  const u8 = path.join(TOOLS, 'cedict_ts.u8');
  if (fs.existsSync(u8)) {
    // canonical format: 傳統 传统 [chuan2 tong3] /tradition/ traditional/
    const re = /^(\S+)\s+(\S+)\s+\[([^\]]+)\]\s+\/(.*)\/\s*$/;
    for (const line of fs.readFileSync(u8, 'utf8').split('\n')) {
      if (!line || line[0] === '#') continue;
      const m = line.match(re);
      if (!m) continue;
      addRow(m[1], m[2], fixU(m[3]), m[4].split('/').filter(Boolean));
    }
    return { map, flavor: 'cedict_ts.u8 (official export)' };
  }

  // GitHub mirror: export default {"all":[[trad,simp,"reading","sense; sense"|["sense",...],[],[]],...]}
  const raw = fs.readFileSync(path.join(TOOLS, 'cedict_all.js'), 'utf8')
    .replace(/^export default /, '').replace(/;?\s*$/, '');
  const data = JSON.parse(raw);
  for (const row of data.all) {
    const [trad, simp, reading, sensesRaw] = row;
    const senses = Array.isArray(sensesRaw) ? sensesRaw : String(sensesRaw).split('; ');
    addRow(trad, simp, fixU(reading), senses);
  }
  return { map, flavor: 'edvardsr/cc-cedict mirror (data/all.js)' };
}

/* ---------------- curated HSK_DICT ---------------- */

function parseCurated() {
  const html = fs.readFileSync(path.join(ROOT, 'legacy', 'index.before-redesign.html'), 'utf8');
  const m = html.match(/const HSK_DICT=(\[[\s\S]*?\n\]);/);
  if (!m) { console.error('FATAL: HSK_DICT not found in legacy/index.before-redesign.html'); process.exit(1); }
  const dict = Function('"use strict";return(' + m[1] + ')')();
  return dict; // [{w,p,m,h,s:{z,y,e}}]
}

/* ---------------- Tatoeba ---------------- */

const HANZI = /[㐀-鿿豈-﫿]/;
function hanziCount(s) {
  let n = 0;
  for (const ch of s) if (HANZI.test(ch)) n++;
  return n;
}

function parseTatoeba() {
  // links: cmnId -> [engId]
  const links = new Map();
  for (const line of fs.readFileSync(path.join(TOOLS, 'cmn-eng_links.tsv'), 'utf8').split('\n')) {
    if (!line) continue;
    const [a, b] = line.split('\t');
    if (!a || !b) continue;
    const arr = links.get(+a);
    if (arr) arr.push(+b); else links.set(+a, [+b]);
  }

  // english sentences, only referenced ids
  const wanted = new Set();
  for (const ids of links.values()) for (const id of ids) wanted.add(id);
  const eng = new Map();
  for (const line of fs.readFileSync(path.join(TOOLS, 'eng_sentences.tsv'), 'utf8').split('\n')) {
    if (!line) continue;
    const tab1 = line.indexOf('\t');
    const id = +line.slice(0, tab1);
    if (!wanted.has(id)) continue;
    eng.set(id, line.slice(line.indexOf('\t', tab1 + 1) + 1));
  }

  // chinese sentences: keep 6-28 hanzi with an english link
  const sentences = [];
  for (const line of fs.readFileSync(path.join(TOOLS, 'cmn_sentences.tsv'), 'utf8').split('\n')) {
    if (!line) continue;
    const tab1 = line.indexOf('\t');
    const id = +line.slice(0, tab1);
    if (!links.has(id)) continue;
    const text = line.slice(line.indexOf('\t', tab1 + 1) + 1);
    const h = hanziCount(text);
    if (h < EX_MIN_HANZI || h > EX_MAX_HANZI) continue;
    // english translation: shortest, preferring <= 160 chars
    let best = null;
    const score = t => (t.length > 160 ? t.length + 10000 : t.length);
    for (const eid of links.get(id)) {
      const t = eng.get(eid);
      if (!t) continue;
      if (best === null || score(t) < score(best)) best = t;
    }
    if (!best) continue;
    sentences.push({ z: text, e: best, h });
  }
  return sentences;
}

/* ---------------- word matching (trie scan) ---------------- */

function buildTrie(forms) {
  // forms: Map form -> word (canonical simplified headword)
  const root = new Map();
  for (const [form, word] of forms) {
    let node = root;
    for (const ch of form) {
      let next = node.get(ch);
      if (!next) { next = new Map(); node.set(ch, next); }
      node = next;
    }
    let w = node.get('');
    if (!w) { w = new Set(); node.set('', w); }
    w.add(word);
  }
  return root;
}

function scanSentence(root, text, out) {
  // out: Set of canonical words found in text
  const chars = [...text];
  for (let i = 0; i < chars.length; i++) {
    let node = root;
    for (let j = i; j < chars.length; j++) {
      node = node.get(chars[j]);
      if (!node) break;
      const hit = node.get('');
      if (hit) for (const w of hit) out.add(w);
    }
  }
}

/* ---------------- main build ---------------- */

async function main() {
  console.log('== HanziFlow build_data ==');
  await ensureInputs();

  const pinyinPro = require(path.join(ROOT, 'vendor', 'pinyin-pro.min.js'));
  const toPinyin = text => {
    try {
      return pinyinPro.pinyin(text, { toneType: 'symbol', type: 'array' }).join(' ')
        .replace(/ ([，。！？；：、”’）》,.!?;:)])/g, '$1').replace(/([“‘（《(]) /g, '$1');
    } catch { return ''; }
  };
  if (!toPinyin('苹果')) throw new Error('pinyin-pro failed to load; refusing to write data without pinyin');
  const multiReading = word => {
    try {
      return pinyinPro.polyphonic(word).some(t => t.trim().includes(' '));
    } catch { return false; }
  };

  console.log('parse CEDICT …');
  const { map: cedict, flavor: cedictFlavor } = parseCedict();
  console.log(`  ${cedict.size} headwords (${cedictFlavor})`);

  console.log('parse curated HSK_DICT …');
  const curated = parseCurated();
  const curatedMap = new Map(curated.map(c => [c.w, c]));
  console.log(`  ${curated.length} curated entries`);

  console.log('parse Tatoeba …');
  const sentences = parseTatoeba();
  console.log(`  ${sentences.length} usable cmn→eng pairs`);

  // ---- candidate words and frequency ranking
  // frequency proxy: how many usable Tatoeba sentences contain the word
  const forms = new Map(); // surface form -> canonical simplified word
  for (const [simp, e] of cedict) {
    forms.set(simp, simp);
    for (const t of e.t) forms.set(t, simp);
  }
  console.log('index sentences by word …');
  const trie = buildTrie(forms);
  const freq = new Map();               // word -> #sentences containing it
  const byWord = new Map();             // word -> [{z,e,h,simpHit}]
  // Traditional-only characters: such sentences are unsuitable for simplified cards.
  const tradOnly = new Set();
  for (const [simp, e] of cedict) {
    if (simp.length === 1) for (const t of e.t) if (t.length === 1 && t !== simp) tradOnly.add(t);
  }
  for (const ch of cedict.keys()) if (ch.length === 1) tradOnly.delete(ch);
  // A sentence only illustrates a word when the word sits on segment boundaries:
  // 祝|你|好运 must not count as an example of 你好.
  const segmenter = new Intl.Segmenter('zh', { granularity: 'word' });
  const onBoundaries = (z, bounds, w) => {
    for (let i = z.indexOf(w); i >= 0; i = z.indexOf(w, i + 1)) {
      if (bounds.has(i) && bounds.has(i + w.length)) return true;
    }
    return false;
  };
  for (const s of sentences) {
    const found = new Set();
    scanSentence(trie, s.z, found);
    if ([...s.z].some(ch => tradOnly.has(ch))) continue;
    const bounds = new Set([s.z.length]);
    for (const seg of segmenter.segment(s.z)) bounds.add(seg.index);
    for (const w of found) {
      if (!onBoundaries(s.z, bounds, w)) continue;
      freq.set(w, (freq.get(w) || 0) + 1);
      let arr = byWord.get(w);
      if (!arr) { arr = []; byWord.set(w, arr); }
      if (arr.length < 40) arr.push({ z: s.z, e: s.e, h: s.h, simpHit: s.z.includes(w) });
    }
  }
  // rank candidates: curated first, then by frequency, then shorter words
  const cedictWords = [...cedict.keys()].filter(w => !curatedMap.has(w));
  cedictWords.sort((a, b) =>
    (freq.get(b) || 0) - (freq.get(a) || 0) || a.length - b.length || a.localeCompare(b, 'zh'));
  const ranked = [...curated.map(c => c.w), ...cedictWords.filter(w => /^[\u3400-\u9fff\uf900-\ufaff]+$/.test(w))];
  console.log(`  ranked ${ranked.length} headwords (${curated.length} curated + ${ranked.length - curated.length} CEDICT)`);

  const modernPack = JSON.parse(fs.readFileSync(path.join(TOOLS, 'modern_examples.json'), 'utf8'));
  // CEDICT's own reading is more reliable than guessing when a word has just one.
  const TONES = { a: 'āáǎà', e: 'ēéěè', i: 'īíǐì', o: 'ōóǒò', u: 'ūúǔù', 'ü': 'ǖǘǚǜ' };
  const markSyllable = syl => {
    const m = syl.match(/^(.*?)([1-5])$/);
    if (!m) return syl;
    let [, base, t] = m; t = +t;
    base = base.replace(/u:/gi, c => (c[0] === 'U' ? 'Ü' : 'ü')).replace(/v/g, 'ü');
    if (t === 5) return base;
    const low = base.toLowerCase();
    let i = low.search(/[ae]/);
    if (i < 0) i = low.indexOf('ou');
    if (i < 0) { for (let k = low.length - 1; k >= 0; k--) if (TONES[low[k]]) { i = k; break; } }
    if (i < 0) return base;
    const mark = TONES[low[i]][t - 1];
    return base.slice(0, i) + (base[i] === low[i] ? mark : mark.toUpperCase()) + base.slice(i + 1);
  };
  const cedictToMarks = r => r.split(' ').map(markSyllable).join(' ').replace(/ ?· ?/g, ' ');
  const cleanSense = s => s.replace(/([^\s|\[]+)\|[^\s\[]+/g, '$1').replace(/\[([a-zA-Z0-9: ]+)\]/g, '').trim();
  const usableSenses = list => {
    const good = list.filter(x => !/^(CL:|variant of|old variant|Taiwan pr\.|also pr\.|also written)/i.test(x));
    return (good.length ? good : list).map(cleanSense);
  };

  // ---- pick example sentences (shortest, simple grammar, prefer simplified)
  const pickExamples = w => {
    const cands = byWord.get(w);
    if (!cands) return [];
    const clause = s => (s.match(/[，、；：…—「」『』《》（）()!?！？]/g) || []).length;
    const sorted = cands.slice().sort((a, b) =>
      (b.simpHit - a.simpHit) || (a.h - b.h) || (clause(a.z) - clause(b.z)) ||
      (a.e.length - b.e.length) || a.z.localeCompare(b.z, 'zh'));
    const seen = new Set(); const out = [];
    for (const c of sorted) {
      if (seen.has(c.z)) continue;
      seen.add(c.z);
      out.push({ z: c.z, e: c.e });
      if (out.length >= MAX_EXAMPLES) break;
    }
    return out;
  };

  // ---- assemble entries (everything, trim later)
  // entries are lean; examples live in exMap and are attached per file to fit budget.
  // Layout: dictionary.js  = curated + top CEDICT (1 example each) + Tatoeba extras for curated words
  //         dictionary-extra.js = lean CEDICT tail (+ as many examples as the budget allows)
  console.log('assemble entries + pinyin …');
  const entries = {};      // word -> entry (no ex)
  const exMap = {};        // word -> [{z,y,e,source}] (1 per word)
  const curatedEx = {};    // curated word -> [{z,y,e,source:"curated"}] (preserved exactly)
  const sentencesOut = {}; // curated word -> 1 extra Tatoeba pair
  const trad2simp = {};

  for (const w of ranked) {
    const isCurated = curatedMap.has(w);
    const ced = cedict.get(w);
    const examples = pickExamples(w);
    const entry = { w };
    if (ced) {
      const trads = [...ced.t];
      if (trads.length) entry.t = trads[0];
      entry.cedictPinyin = ced.readings.join(' / ');
    }
    if (isCurated) {
      const c = curatedMap.get(w);
      entry.p = c.p;
      entry.pa = c.p.split(' ');
      entry.m = c.m;
      entry.senses = [c.m];
      entry.h = c.h;
      entry.src = 'curated';
      curatedEx[w] = [{ z: c.s.z, y: c.s.y, e: c.s.e, source: 'curated' }];
      if (examples.length) {
        const x = examples[0];
        sentencesOut[w] = [{ z: x.z, y: toPinyin(x.z), e: x.e, source: 'tatoeba' }];
      }
    } else {
      const readings = ced ? [...new Set(ced.readings.map(r => r.toLowerCase()))] : [];
      entry.p = readings.length === 1 ? cedictToMarks(ced.readings[0]) : toPinyin(w);
      entry.pa = entry.p ? entry.p.split(' ') : [];
      const senses = ced ? usableSenses(ced.senses).slice(0, MAX_SENSES) : [];
      entry.m = senses.slice(0, 2).join('; ');
      entry.senses = senses;
      entry.src = 'cedict';
      if (modernPack[w]) {
        const x = modernPack[w];
        exMap[w] = [{ z: x.z, y: toPinyin(x.z), e: x.e, source: 'curated' }];
        entry.src = 'cedict';
      } else if (examples.length) {
        const x = examples[0];
        exMap[w] = [{ z: x.z, y: toPinyin(x.z), e: x.e, source: 'tatoeba' }];
      }
    }
    const distinctReadings = ced && ced.readings.filter((r, i, a) =>
      a.findIndex(x => x.toLowerCase().replace(/\d/g, '') === r.toLowerCase().replace(/\d/g, '')) === i);
    entry.heteronym = distinctReadings ? distinctReadings.length > 1 : multiReading(w);
    if (!entry.heteronym) delete entry.heteronym;
    entries[w] = entry;
  }

  // ---- trad2simp: kept words + single-char map over full CEDICT
  for (const w of ranked) {
    const ced = cedict.get(w);
    if (ced) for (const t of ced.t) if (!(t in trad2simp)) trad2simp[t] = w;
  }
  for (const [simp, e] of cedict) {
    if (simp.length === 1) for (const t of e.t) if (t.length === 1 && !(t in trad2simp)) trad2simp[t] = simp;
  }

  const meta = {
    sources: [
      `CC-CEDICT — ${cedictFlavor} — CC BY-SA 4.0 — https://cc-cedict.org/wiki/`,
      'Tatoeba cmn→eng sentence pairs — CC BY 2.0 FR — https://tatoeba.org/eng/downloads',
      'pinyin-pro (build-time pinyin generation) — MIT — https://github.com/zh-lx/pinyin-pro',
      'Curated HSK 1–4 examples — original to this project',
    ],
    licenses: 'see data/LICENSES.md',
    notes: [
      'dictionary.js: curated HSK entries + most common CEDICT entries, each with 1 example',
      'dictionary-extra.js: remaining CEDICT entries (lean; examples attached while budget allows), lazy-loaded',
      'entries.ex: curated example (curated entries) or 1 Tatoeba example (cedict entries)',
      'sentences: 1 extra Tatoeba pair per curated word (non-curated pairs live in entries.ex)',
      'heteronym: multiple distinct CEDICT readings, else pinyin-pro polyphonic fallback',
      'frequency rank: occurrences in usable Tatoeba cmn sentences',
    ],
  };
  const generatedAt = new Date().toISOString().slice(0, 10);

  // ---- trim to budget: main = curated + top CEDICT with examples,
  //      extra = lean tail + examples while the budget allows
  const buildMain = keep => {
    const data = {
      version: '2.0.0', generatedAt, meta,
      entries: {}, sentences: {}, trad2simp: {}, stopwords: STOPWORDS,
    };
    for (const w of ranked.slice(0, keep)) {
      const e = { ...entries[w] };
      const ex = curatedEx[w] || exMap[w];
      if (ex) e.ex = ex;
      data.entries[w] = e;
      if (sentencesOut[w]) data.sentences[w] = sentencesOut[w];
    }
    for (const [t, s] of Object.entries(trad2simp)) {
      if (data.entries[s] || s.length === 1) data.trad2simp[t] = s;
    }
    return data;
  };
  // Compact rows keep ~120k entries practical: word -> [p, m, traditional, example, heteronym]
  const buildExtra = () => {
    const d = {
      version: '2.0.0', generatedAt,
      meta: { licenses: 'see data/LICENSES.md', note: 'lazy-loaded CEDICT tail; rows are [p,m,t,[z,y,e]|0,heteronym]; expanded by js/lookup.js' },
      entries: {}, trad2simp: {},
    };
    for (const w of ranked.slice(keep)) {
      const e = entries[w];
      const x = exMap[w] && exMap[w][0];
      const row = [e.p, e.m, e.t || 0, x ? [x.z, x.y, x.e, x.source] : 0];
      if (e.heteronym) row.push(1);
      d.entries[w] = row;
    }
    for (const [t, s] of Object.entries(trad2simp)) {
      if (d.entries[s]) d.trad2simp[t] = s;
    }
    return d;
  };
  const wrap = (name, data) =>
    `(function(g){g.${name}=${JSON.stringify(data)}})(typeof window!=="undefined"?window:globalThis);\n`;

  let keep = ranked.length;
  let mainData = buildMain(keep);
  let mainJs = wrap('HF_DATA', mainData);
  let extraData = null;
  if (Buffer.byteLength(mainJs) > MAIN_BUDGET) {
    let lo = curated.length, hi = ranked.length;
    while (lo < hi) {
      const mid = Math.ceil((lo + hi) / 2);
      if (Buffer.byteLength(wrap('HF_DATA', buildMain(mid))) <= MAIN_BUDGET) lo = mid; else hi = mid - 1;
    }
    keep = lo;
    mainData = buildMain(keep);
    mainJs = wrap('HF_DATA', mainData);
    extraData = buildExtra();
    const extraSize = Buffer.byteLength(wrap('HF_DATA_EXTRA', extraData));
    if (extraSize > EXTRA_BUDGET) throw new Error(`dictionary-extra.js is ${extraSize} bytes, over budget`);
  }

  fs.mkdirSync(path.join(ROOT, 'data'), { recursive: true });
  fs.writeFileSync(path.join(ROOT, 'data', 'dictionary.js'), mainJs);
  let extraJs = null;
  if (extraData) {
    extraJs = wrap('HF_DATA_EXTRA', extraData);
    fs.writeFileSync(path.join(ROOT, 'data', 'dictionary-extra.js'), extraJs);
  } else {
    fs.rmSync(path.join(ROOT, 'data', 'dictionary-extra.js'), { force: true });
  }

  // ---- LICENSES.md
  const today = mainData.generatedAt;
  fs.writeFileSync(path.join(ROOT, 'data', 'LICENSES.md'), `# Data licenses — HanziFlow

Generated: ${today} by \`tools/build_data.mjs\`.

## CC-CEDICT

- License: **Creative Commons Attribution-ShareAlike 4.0** (CC BY-SA 4.0)
- Source: CC-CEDICT, https://cc-cedict.org/wiki/ (downloaded via ${cedictFlavor}, transformation date ${today})
- The derived dictionary files \`data/dictionary.js\` and \`data/dictionary-extra.js\`
  are shared under the **same license, CC BY-SA 4.0**, as required by ShareAlike.
- Transformation: parsed headwords (traditional/simplified), converted \`u:\` to \`ü\`,
  kept the original numbered readings as \`cedictPinyin\`, split definitions into
  senses (max 3), and ranked entries by Tatoeba sentence frequency.

## Tatoeba

- License: **CC BY 2.0 FR** — https://creativecommons.org/licenses/by/2.0/fr/
- Source: Tatoeba weekly exports, https://tatoeba.org/eng/downloads
  (\`cmn_sentences.tsv\`, \`cmn-eng_links.tsv\`, \`eng_sentences.tsv\`, transformation date ${today})
- Attribution: the example sentences are contributed by the **Tatoeba Project and its
  contributors** (https://tatoeba.org). Sentence ids can be resolved on tatoeba.org.

## pinyin-pro

- License: **MIT** — https://github.com/zh-lx/pinyin-pro
- Used at build time to generate tone-marked pinyin for headwords and example
  sentences, and at runtime from \`vendor/pinyin-pro.min.js\`.

## Curated HSK examples

- The curated HSK 1–4 entries (\`src: "curated"\`, examples marked \`source: "curated"\`)
  and the modern-word examples in \`tools/modern_examples.json\` are **original to this
  project** and may be used under the project's own license.
`);

  // ---- report
  const size = f => (fs.statSync(path.join(ROOT, 'data', f)).size / 1024 / 1024).toFixed(2) + ' MB';
  const sentenceCount = Object.keys(mainData.sentences).length +
    (extraData ? 0 : 0);
  const withExamples = Object.values(mainData.entries).filter(e => e.ex).length +
    (extraData ? Object.values(extraData.entries).filter(e => e[3]).length : 0);
  console.log('== build complete ==');
  console.log(`entries:      ${Object.keys(mainData.entries).length} (main) + ${extraData ? Object.keys(extraData.entries).length : 0} (extra)`);
  console.log(`with examples: ${withExamples}; sentences map keys: ${sentenceCount}`);
  console.log(`trad2simp:    ${Object.keys(mainData.trad2simp).length} (main) + ${extraData ? Object.keys(extraData.trad2simp).length : 0} (extra)`);
  console.log(`sizes:        dictionary.js ${size('dictionary.js')}` + (extraData ? `, dictionary-extra.js ${size('dictionary-extra.js')}` : ''));
}

main().catch(e => { console.error('FATAL:', e); process.exit(1); });
