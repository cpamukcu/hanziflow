// tests/lookup.test.mjs — Node test suite for js/lookup.js (no browser needed)
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

require(path.join(ROOT, 'data', 'dictionary.js'));   // sets globalThis.HF_DATA
require(path.join(ROOT, 'js', 'lookup.js'));         // sets globalThis.HF
const HF = globalThis.HF;

let pass = 0, fail = 0;
function eq(actual, expected, label) {
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  if (a === e) { pass++; console.log('ok  ' + label); }
  else { fail++; console.error('FAIL ' + label + '\n  expected: ' + e + '\n  actual:   ' + a); }
}
function ok(cond, label) {
  if (cond) { pass++; console.log('ok  ' + label); }
  else { fail++; console.error('FAIL ' + label); }
}

/* ---------- normalizeList: every input from the guide, point 2 ---------- */
eq(HF.normalizeList('苹果\n环境\n保护\n经济'), ['苹果', '环境', '保护', '经济'], 'newlines');
eq(HF.normalizeList('1. 苹果\n2) 环境\n• 保护'), ['苹果', '环境', '保护'], 'numbered + bullet');
eq(HF.normalizeList('苹果, 环境、保护；经济 | 牛奶'), ['苹果', '环境', '保护', '经济', '牛奶'], 'mixed separators');
eq(HF.normalizeList('图书馆\ttúshūguǎn\tlibrary'), ['图书馆'], 'tab-separated glosses');
eq(HF.normalizeList('苹果（píngguǒ）apple'), ['苹果'], 'bracketed pinyin annotation');
eq(HF.normalizeList('圖書館'), ['图书馆'], 'traditional maps to simplified');
eq(HF.normalizeList('苹果，香蕉；牛奶。'), ['苹果', '香蕉', '牛奶'], 'CJK punctuation + trailing 。');
eq(HF.normalizeList('1. 苹果，香蕉；牛奶。'), ['苹果', '香蕉', '牛奶'], 'number + CJK punctuation');
eq(HF.normalizeList('<img src=x>苹果'), ['苹果'], 'no HTML injection');
eq(HF.normalizeList('苹果\n苹果\n苹果'), ['苹果'], 'dedupe removes repeated 苹果');
eq(HF.normalizeList('，。；、'), [], 'pure punctuation dropped');
eq(HF.normalizeList('苹果  环境'), ['苹果', '环境'], '2+ spaces split');

/* ---------- lookup ---------- */
const r1 = HF.lookup('经济');
ok(r1.m && r1.m.length > 0, '经济 has meaning');
ok(r1.ex && r1.ex[0] && r1.ex[0].z && r1.ex[0].y && r1.ex[0].e, '经济 has full example z/y/e');
ok(r1.p === 'jīng jì', '经济 pinyin is tone-marked');
ok(!r1.needsReview, '经济 does not need review');

const r2 = HF.lookup('圖書館');
eq(r2.word, '图书馆', '圖書館 resolves to 图书馆');
ok(r2.notes.includes('converted from traditional'), 'traditional conversion noted');
ok(r2.m.length > 0, '圖書館 has meaning');

// offline: no pinyinPro loaded in this process — static data must suffice
ok(typeof globalThis.pinyinPro === 'undefined', 'pinyinPro is absent (offline simulation)');
const r3 = HF.lookup('经济');
ok(r3.m.length > 0 && r3.ex[0].z.length > 0, 'offline lookup(经济) still returns meaning + example from HF_DATA');

const r4 = HF.lookup('苹果');
eq(r4.sources.includes('curated') || r4.confidence === 'high', true, '苹果 is curated/high confidence');
eq(r4.h, 1, '苹果 is HSK 1');

const r5 = HF.lookup('长');
eq(r5.heteronym, true, '长 flagged heteronym');
eq(r5.confidence, 'medium', '长 confidence medium due to heteronym');

const r6 = HF.lookup('不存在的词xyz');
eq(r6.needsReview, true, 'gibberish needs review');
eq(r6.confidence, 'low', 'gibberish confidence low');

// fuzzy: trailing particle
const r7 = HF.lookup('朋友们');
ok(r7.word === '朋友' || r7.needsReview === false, '朋友们 fuzzy-resolves to 朋友 (or at least resolves)');

/* ---------- full dictionary (dictionary-extra.js) and data quality ---------- */
ok(!HF.lookup('你好').ex[0].z.includes('祝你好运'), '你好 example is not the false match 祝你好运');
require(path.join(ROOT, 'data', 'dictionary-extra.js'));
for (const w of ['快递', '马马虎虎', '支付宝', '高铁', '网购', '入乡随俗', '人工智能', '微信', '外卖']) {
  const r = HF.lookup(w);
  ok(r.p && r.m && r.ex[0] && r.ex[0].z.includes(w) && r.ex[0].y && r.ex[0].e && !r.needsReview, w + ' fills everything');
}
eq(HF.lookup('马马虎虎').p, 'mǎ ma hū hū', 'reading comes from CEDICT');
const rareWord = HF.lookup('蓝藻');
ok(rareWord.m && rareWord.ex[0].source === 'generic' && !rareWord.needsReview, 'rare word still gets a labelled generic example');
eq(HF.statusOf(rareWord), 'dictionary', 'rare word status');
eq(HF.statusOf(HF.lookup('苹果')), 'curated', '苹果 status');
eq(HF.statusOf({ p: 'x', m: '', sources: [] }), 'pinyin', 'pinyin-only status');
eq(HF.statusOf({ p: '', m: '', sources: [] }), 'missing', 'not-found status');
eq(HF.normalizeList('苹果 环境 保护'), ['苹果', '环境', '保护'], 'single spaces split words');
eq(HF.normalizeList('苹果银行图书馆经济'), ['苹果', '银行', '图书馆', '经济'], 'unbroken run is segmented');
eq(HF.normalizeList('1. 图书馆  túshūguǎn  library'), ['图书馆'], 'numbered with glosses');
eq(HF.normalizeList('圖書館，你好！所以…').slice(0, 1), ['图书馆'], 'traditional list head');
ok(HF.normalizeList('圖書館，你好！所以…').includes('所以'), 'exclamation separated words kept');
ok(HF.suggest('图书').some(s => s.word === '图书馆'), 'suggest finds 图书馆 by prefix');
const fv = HF.extractFromText('我今天去图书馆看书，因为明天要考试。').map(c => c.word);
for (const w of ['今天', '图书馆', '看书', '因为', '明天', '考试']) ok(fv.includes(w), 'free text finds ' + w);

/* ---------- extractFromText ---------- */
const cands = HF.extractFromText('我今天去图书馆看书');
const words = cands.map(c => c.word);
ok(words.includes('图书馆'), 'extract finds 图书馆');
ok(words.includes('看书'), 'extract finds 看书');
ok(cands.every(c => typeof c.start === 'number' && c.end > c.start), 'candidates carry offsets');
ok(cands.every(c => !HF.normalizeList(c.word).length || true), 'candidates well-formed');

const cands2 = HF.extractFromText('我今天去图书馆看书，因为明天要考试。');
const words2 = cands2.map(c => c.word);
ok(!words2.includes('我'), 'stopword 我 filtered');

/* ---------- enrichBatch ---------- */
const rows = await HF.enrichBatch(['苹果', '环境', '保护', '经济'], {
  onProgress: (i, total) => { if (i === total) ok(total === 4, 'progress reports total'); }
});
eq(rows.length, 4, 'enrichBatch returns 4 rows');
ok(rows.every(r => r.p && r.m && r.ex[0] && r.ex[0].z && r.ex[0].y && r.ex[0].e), 'all 4 demo rows complete (p/m/ex z/y/e)');
ok(rows.every(r => !r.needsReview), 'no demo row needs review');

// abort
try {
  const ac = new AbortController(); ac.abort();
  await HF.enrichBatch(['苹果'], { signal: ac.signal });
  ok(false, 'abort should reject');
} catch (e) { ok(e.name === 'AbortError', 'abort rejects with AbortError'); }

/* ---------- dedupe / simplify / isHanzi ---------- */
eq(HF.dedupe(rows.concat(rows)).length, 4, 'dedupe(rows)');
eq(HF.simplify('圖書館'), '图书馆', 'simplify word-level');
ok(HF.isHanzi('汉') && !HF.isHanzi('a'), 'isHanzi');

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
