// tests/srs.test.mjs — scheduling, queue, streak and shuffle
import { createRequire } from 'node:module';
import assert from 'node:assert/strict';
const require = createRequire(import.meta.url);
require('../js/srs.js');
const R = globalThis.HFSRS;
let n = 0; const t = (name, fn) => { fn(); n++; console.log('ok  ' + name); };
const NOW = new Date(2026, 10, 9, 12).getTime();
const card = srs => ({ srs: { ...R.newSRS(), ...srs } });

t('new card is New and fresh', () => { const c = card(); assert.equal(R.stageOf(c), 'New'); assert.ok(R.isFresh(c)); });
t('Again: +10 min, lapse, ease drops, floor 1.3', () => {
  const c = card({ e: 1.35 }); R.schedule(c, 0, NOW);
  assert.equal(c.srs.due, NOW + 600000); assert.equal(c.srs.lapses, 1); assert.equal(c.srs.e, 1.3); assert.equal(c.srs.ivl, 0);
});
t('first Hard/Good/Easy intervals', () => {
  for (const [q, ivl] of [[1, 1], [2, 1], [3, 2]]) { const c = card(); R.schedule(c, q, NOW); assert.equal(c.srs.ivl, ivl); assert.equal(c.srs.reps, 1); }
});
t('Good ladder 1 → 3 → 3×e', () => {
  const c = card(); R.schedule(c, 2, NOW); R.schedule(c, 2, NOW); assert.equal(c.srs.ivl, 3);
  R.schedule(c, 2, NOW); assert.equal(c.srs.ivl, 8);
});
t('due is day start + interval', () => {
  const c = card(); R.schedule(c, 2, NOW); assert.equal(c.srs.due, R.dayStart(new Date(NOW)) + R.DAY);
});
t('stage transitions', () => {
  assert.equal(R.stageOf(card({ reps: 1, ivl: 1 })), 'Learning');
  assert.equal(R.stageOf(card({ reps: 2, ivl: 3 })), 'Reviewing');
  assert.equal(R.stageOf(card({ reps: 5, ivl: 21 })), 'Mastered');
});
t('labels match what schedule does', () => {
  for (const q of [1, 2, 3]) { const c = card({ reps: 3, ivl: 8 }); const l = R.nextIvlLabel(c, q); R.schedule(c, q, NOW); if (q !== 3 && q !== 1) assert.equal(l, c.srs.ivl + 'd'); }
  assert.equal(R.nextIvlLabel(card(), 0), '10m');
});
t('queue: due first, future excluded, new capped', () => {
  const due = card({ reps: 1, ivl: 1, due: NOW - 1 }), later = card({ reps: 1, ivl: 1, due: NOW + R.DAY });
  const q = R.buildQueue([card(), later, due, card(), card()], 2, NOW);
  assert.equal(q[0], due); assert.equal(q.length, 3); assert.ok(!q.includes(later));
});
t('lapsed card comes back after 10 minutes', () => {
  const c = card(); R.schedule(c, 0, NOW);
  assert.equal(R.buildQueue([c], 5, NOW).length, 0); assert.equal(R.buildQueue([c], 5, NOW + 600001).length, 1);
});
t('streak: same day, next day, gap', () => {
  const s = { count: 0, last: null };
  R.bumpStreak(s, 'd2', 'd1'); assert.equal(s.count, 1);
  R.bumpStreak(s, 'd2', 'd1'); assert.equal(s.count, 1);
  R.bumpStreak(s, 'd3', 'd2'); assert.equal(s.count, 2);
  R.bumpStreak(s, 'd9', 'd8'); assert.equal(s.count, 1);
});
t('shuffle keeps elements and does not mutate', () => {
  const a = [1, 2, 3, 4, 5]; const b = R.shuffle(a);
  assert.deepEqual(a, [1, 2, 3, 4, 5]); assert.deepEqual([...b].sort(), a);
});
t('shuffle is unbiased enough', () => {
  const first = [0, 0, 0, 0];
  for (let i = 0; i < 8000; i++) first[R.shuffle([0, 1, 2, 3])[0]]++;
  first.forEach(v => assert.ok(v > 1750 && v < 2250, 'bucket ' + v));
});
console.log(`\n${n} passed, 0 failed`);
