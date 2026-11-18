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
t('new lesson on PC reaches the phone', () => {
  const pc = device(state()), phone = device(state());
  pc.edit(S => { S.lessons = [{ id: 'l1', title: '第十五课', words: [] }]; }, 1000);
  const m = Y.merge(phone.S, clone(pc.S), 2000);
  assert.deepEqual(m.lessons.map(l => l.title), ['第十五课']);
});
t('deleted lesson stays deleted', () => {
  const base = state(); base.lessons = [{ id: 'l1', title: 'x', words: [], u: 1 }];
  const pc = device(clone(base)), phone = device(clone(base));
  pc.edit(S => { S.lessons = []; }, 1000);
  assert.equal(Y.merge(phone.S, clone(pc.S), 2000).lessons.length, 0);
  assert.equal(Y.merge(clone(pc.S), clone(phone.S), 2000).lessons.length, 0);
});
t('state without lessons merges fine', () => {
  const a = state(), b = state(); b.lessons = [{ id: 'l1', title: 'x', words: [], u: 5 }];
  assert.deepEqual(Y.merge(a, clone(b), 10).lessons.map(l => l.id), ['l1']);
  assert.deepEqual(Y.merge(state(), state(), 10).lessons, []);
});
t('pairing token is read from a link, a bare token, or surrounding text', () => {
  const tok = 'ghp_abcDEF123456';
  assert.equal(Y.tokenFromPaste('https://cpamukcu.github.io/hanziflow/#hfsync=' + encodeURIComponent(tok)), tok);
  assert.equal(Y.tokenFromPaste('  ' + tok + '\n'), tok);
  assert.equal(Y.tokenFromPaste('My link: https://x.io/h/#hfsync=' + tok + ' thanks'), tok);
  assert.equal(Y.tokenFromPaste('github_pat_11ABC_def'), 'github_pat_11ABC_def');
  assert.equal(Y.tokenFromPaste('hello there'), null);
  assert.equal(Y.tokenFromPaste(''), null);
});
t('AI key set on the PC reaches the phone', () => {
  const pc = device(state()), phone = device(state());
  pc.edit(S => { S.ai = { presetId: 'openrouter', model: 'm', apiKey: 'sk-or-1' }; }, 1000);
  assert.ok(pc.S.aiU === 1000);
  const m = Y.merge(phone.S, clone(pc.S), 2000);
  assert.equal(m.ai.apiKey, 'sk-or-1');
});
t('newer AI settings win, older ones do not overwrite', () => {
  const pc = device(state()), phone = device(state());
  pc.edit(S => { S.ai = { apiKey: 'old' }; }, 1000);
  phone.edit(S => { S.ai = { apiKey: 'new' }; }, 2000);
  assert.equal(Y.merge(pc.S, clone(phone.S), 3000).ai.apiKey, 'new');
  assert.equal(Y.merge(phone.S, clone(pc.S), 3000).ai.apiKey, 'new');
});
t('a device without AI settings keeps its own when the other has none', () => {
  const a = state(); a.ai = { apiKey: 'k' }; a.aiU = 5;
  assert.equal(Y.merge(a, state(), 10).ai.apiKey, 'k');
});
// async: AI key encrypted for the gist
const at = async (name, fn) => { await fn(); n++; console.log('ok  ' + name); };
await at('AI settings are sealed for the gist and open only with the same sync key', async () => {
  const ai = { presetId: 'openrouter', model: 'm', apiKey: 'sk-or-v1-SECRET' };
  const sealed = await Y.sealAi(ai, 'ghp_token1');
  assert.ok(!JSON.stringify(sealed).includes('SECRET'));
  assert.deepEqual(await Y.openAi(sealed, 'ghp_token1'), ai);
  assert.equal(await Y.openAi(sealed, 'ghp_other'), null);
  assert.equal(await Y.openAi({ junk: 1 }, 'ghp_token1'), null);
});
console.log(`\n${n} passed, 0 failed`);
