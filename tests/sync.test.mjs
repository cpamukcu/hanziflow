// tests/sync.test.mjs — two simulated devices merging through the same file
import { createRequire } from 'node:module';
import assert from 'node:assert/strict';
const require = createRequire(import.meta.url);
require('../js/sync.js');
const Y = globalThis.HFSync;
let n = 0; const t = (name, fn) => { fn(); n++; console.log('ok  ' + name); };
const clone = x => JSON.parse(JSON.stringify(x));
const state = () => ({ decks: [{ id: 'd1', name: 'Week 1' }], cards: [], settings: { target: 20, theme: 'light' }, streak: { count: 0, last: null }, reviews: {} });
const card = (id, w, extra = {}) => ({ id, deckId: 'd1', w, m: w, srs: { reps: 0 }, ...extra });
function device(S) { const h = {}; Y.baseline(S, h); return { S, h, edit(fn, now) { fn(this.S); Y.stamp(this.S, this.h, now); } }; }

t('new card on PC reaches the phone', () => {
  const pc = device(state()), phone = device(state());
  pc.edit(S => S.cards.push(card('a', '苹果')), 1000);
  const merged = Y.merge(phone.S, clone(pc.S), 2000);
  assert.deepEqual(merged.cards.map(c => c.w), ['苹果']);
});
t('newer edit wins in both directions', () => {
  const base = state(); base.cards.push(card('a', '苹果', { u: 1 }));
  const pc = device(clone(base)), phone = device(clone(base));
  pc.edit(S => { S.cards[0].m = 'apple (pc)'; }, 1000);
  phone.edit(S => { S.cards[0].m = 'apple (phone)'; }, 2000);
  assert.equal(Y.merge(pc.S, clone(phone.S), 3000).cards[0].m, 'apple (phone)');
  assert.equal(Y.merge(phone.S, clone(pc.S), 3000).cards[0].m, 'apple (phone)');
});
t('study progress on the phone is kept', () => {
  const base = state(); base.cards.push(card('a', '苹果', { u: 1 }));
  const pc = device(clone(base)), phone = device(clone(base));
  phone.edit(S => { S.cards[0].srs = { reps: 3 }; }, 5000);
  assert.equal(Y.merge(pc.S, clone(phone.S), 6000).cards[0].srs.reps, 3);
});
t('deletion propagates and does not come back', () => {
  const base = state(); base.cards.push(card('a', '苹果', { u: 1 }), card('b', '环境', { u: 1 }));
  const pc = device(clone(base)), phone = device(clone(base));
  pc.edit(S => { S.cards = S.cards.filter(c => c.id !== 'a'); }, 1000);
  const onPhone = Y.merge(phone.S, clone(pc.S), 2000);
  assert.deepEqual(onPhone.cards.map(c => c.id), ['b']);
  assert.deepEqual(Y.merge(pc.S, clone(phone.S), 2000).cards.map(c => c.id), ['b']);
});
t('editing after a deletion elsewhere keeps the card', () => {
  const base = state(); base.cards.push(card('a', '苹果', { u: 1 }));
  const pc = device(clone(base)), phone = device(clone(base));
  pc.edit(S => { S.cards = []; }, 1000);
  phone.edit(S => { S.cards[0].m = 'kept'; }, 2000);
  assert.equal(Y.merge(pc.S, clone(phone.S), 3000).cards[0].m, 'kept');
});
t('same word added on both devices is not duplicated', () => {
  const pc = device(state()), phone = device(state());
  pc.edit(S => S.cards.push(card('a', '苹果')), 1000);
  phone.edit(S => S.cards.push(card('b', '苹果', { srs: { reps: 2 } })), 1100);
  const m = Y.merge(pc.S, clone(phone.S), 2000);
  assert.deepEqual(m.cards.map(c => c.id), ['b']);
  assert.ok(m.deleted['c:a']);
});
t('merged state does not get re-stamped', () => {
  const pc = device(state()); pc.edit(S => S.cards.push(card('a', '苹果')), 1000);
  const phone = device(state()); const m = Y.merge(phone.S, clone(pc.S), 2000);
  Y.baseline(m, phone.h); Y.stamp(m, phone.h, 9999);
  assert.equal(m.cards[0].u, 1000);
});
t('theme stays per device, other settings sync', () => {
  const pc = device(state()), phone = device(state());
  phone.edit(S => { S.settings.theme = 'dark'; }, 500);
  pc.edit(S => { S.settings.target = 40; }, 1000);
  const m = Y.merge(phone.S, clone(pc.S), 2000);
  assert.equal(m.settings.target, 40); assert.equal(m.settings.theme, 'dark');
});
t('reviews and streak keep the larger value', () => {
  const a = state(), b = state();
  a.reviews = { d1: { n: 5, ok: 4 } }; b.reviews = { d1: { n: 3, ok: 3 }, d2: { n: 1, ok: 1 } };
  a.streak = { count: 2, last: '2026-11-14' }; b.streak = { count: 3, last: '2026-11-15' };
  const m = Y.merge(a, b, 1);
  assert.deepEqual(m.reviews, { d1: { n: 5, ok: 4 }, d2: { n: 1, ok: 1 } });
  assert.equal(m.streak.count, 3);
});
t('cards of a deleted deck disappear', () => {
  const base = state(); base.cards.push(card('a', '苹果', { u: 1 })); base.decks[0].u = 1;
  const pc = device(clone(base)), phone = device(clone(base));
  pc.edit(S => { S.decks = []; S.cards = []; }, 1000);
  assert.equal(Y.merge(phone.S, clone(pc.S), 2000).cards.length, 0);
});
console.log(`\n${n} passed, 0 failed`);
