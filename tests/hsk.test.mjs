// tests/hsk.test.mjs — HSK lists, grammar and dialogues copied from the 学中文 app
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
require('../data/hsk-content.js');
require('../js/lesson-core.js');
const H = globalThis.HF_HSK, C = globalThis.HFLesson;
const counts = (o) => Object.values(o).map((v) => v.length);

test('HSK 2.0 levels have the expected word counts', () => {
  assert.deepEqual(Object.keys(H.lists['HSK 2.0']), ['HSK 1', 'HSK 2', 'HSK 3', 'HSK 4', 'HSK 5']);
  assert.deepEqual(counts(H.lists['HSK 2.0']), [150, 147, 298, 598, 1298]);
});
test('HSK 3.0 bands have the expected word counts', () => {
  assert.deepEqual(counts(H.lists['HSK 3.0']), [506, 750, 953, 972, 1059, 1123]);
});
test('grammar points and dialogues are all there', () => {
  assert.equal(H.grammar.length, 12);
  assert.equal(H.dialogs.length, 16);
  assert.ok(H.grammar.every((g) => g.pattern && g.examples.length));
  assert.ok(H.dialogs.every((d) => d.title && d.lines.length));
});
test('every word entry is [hanzi, pinyin, meaning]', () => {
  for (const std of Object.values(H.lists)) for (const list of Object.values(std))
    for (const e of list) assert.ok(Array.isArray(e) && e.length === 3 && e[0]);
});
test('hskDeckPlan skips words already in HanziFlow and duplicates', () => {
  const list = [['爱', 'ài', 'love'], ['八', 'bā', 'eight'], ['爱', 'ài', 'dup'], ['爸爸', 'bàba', 'dad']];
  const plan = C.hskDeckPlan(list, new Set(['八']));
  assert.deepEqual(plan.add.map((x) => x.w), ['爱', '爸爸']);
  assert.deepEqual(plan.add[0], { w: '爱', p: 'ài', m: 'love' });
  assert.equal(plan.skipped, 2);
});
test('hskDeckPlan counts known words and in-list repeats separately', () => {
  const plan = C.hskDeckPlan([['爱', 'ài', 'love'], ['爱', 'ài', 'dup'], ['八', 'bā', 'eight']], new Set(['八']));
  assert.equal(plan.known, 1);
  assert.equal(plan.repeats, 1);
});
test('hskDeckName puts the level first so the deck badge shows its number', () => {
  assert.equal(C.hskDeckName('HSK 2.0', 'HSK 1'), 'HSK 1 · 2.0');
  assert.equal(C.hskDeckName('HSK 3.0', 'Band 4'), 'Band 4 · HSK 3.0');
});
