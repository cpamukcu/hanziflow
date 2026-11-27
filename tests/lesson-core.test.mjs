// tests/lesson-core.test.mjs — photo/built-in lesson logic (port of the study page's core tests)
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
require('../js/lesson-core.js');
const C = globalThis.HFLesson;

const sample = {
  title: "第十五课 在饭馆",
  lessonNumber: "15",
  words: [
    { hanzi: "想", pinyin: "xiǎng", meaning: "want to" },
    { hanzi: "咖啡", pinyin: "kāfēi", meaning: "coffee" },
    { hanzi: "菜单", pinyin: "càidān", meaning: "menu" },
  ],
  texts: [
    {
      title: "课文一",
      lines: [
        { speaker: "A", hanzi: "你想喝什么？", pinyin: "Nǐ xiǎng hē shénme?", english: "What do you want to drink?" },
      ],
    },
  ],
  grammar: [
    {
      point: "想 + verb",
      explanation: "想 before a verb means 'want to'.",
      examples: [{ hanzi: "我想喝咖啡。", pinyin: "Wǒ xiǎng hē kāfēi.", english: "I want to drink coffee." }],
    },
  ],
};

// ---------- Task 1: parsing and validation ----------

test("parses plain JSON", () => {
  const r = C.parseModelReply(JSON.stringify(sample));
  assert.equal(r.ok, true);
  assert.equal(r.lesson.words.length, 3);
});

test("parses fenced JSON with prose around it", () => {
  const text = "Here is the lesson:\n```json\n" + JSON.stringify(sample) + "\n```\nHope it helps!";
  const r = C.parseModelReply(text);
  assert.equal(r.ok, true);
  assert.equal(r.lesson.title, "第十五课 在饭馆");
});

test("truncated JSON returns no_json", () => {
  const r = C.parseModelReply(JSON.stringify(sample).slice(0, 60));
  assert.deepEqual(r, { ok: false, error: "no_json" });
});

test("empty words returns no_words", () => {
  const r = C.parseModelReply(JSON.stringify({ ...sample, words: [] }));
  assert.deepEqual(r, { ok: false, error: "no_words" });
});

test("validateLesson drops malformed entries", () => {
  const raw = {
    ...sample,
    words: [
      ...sample.words,
      { pinyin: "x", meaning: "no hanzi" },
      { hanzi: "abc", pinyin: "abc", meaning: "latin" },
      { hanzi: "咖啡", pinyin: "kāfēi", meaning: "dup" },
      "junk",
    ],
    texts: [{ title: null, lines: [{ hanzi: "", pinyin: "", english: "" }, sample.texts[0].lines[0]] }, { lines: [] }],
    grammar: [...sample.grammar, { point: "empty", explanation: "x", examples: [] }],
  };
  const l = C.validateLesson(raw);
  assert.deepEqual(l.words.map((w) => w.hanzi), ["想", "咖啡", "菜单"]);
  assert.equal(l.texts.length, 1);
  assert.equal(l.texts[0].lines.length, 1);
  assert.equal(l.grammar.length, 1);
});

test('validateLesson trims strings and defaults title to "Untitled lesson"', () => {
  const l = C.validateLesson({ words: [{ hanzi: " 想 ", pinyin: " xiǎng ", meaning: " want " }] });
  assert.equal(l.title, "Untitled lesson");
  assert.deepEqual(l.words[0], { hanzi: "想", pinyin: "xiǎng", meaning: "want" });
  assert.equal(typeof l.id, "string");
  assert.ok(l.id.length > 0);
  assert.equal(typeof l.createdAt, "number");
  assert.deepEqual(l.texts, []);
  assert.deepEqual(l.grammar, []);
});

test("validateLesson returns null for non-objects", () => {
  assert.equal(C.validateLesson(null), null);
  assert.equal(C.validateLesson("x"), null);
});

test("EXTRACTION_PROMPT forbids inventing content", () => {
  assert.match(C.EXTRACTION_PROMPT, /only/i);
  assert.match(C.EXTRACTION_PROMPT, /"words"/);
});

// ---------- Task 2: segmentation and exercises ----------

function seeded(seed) {
  let x = seed;
  return () => ((x = (x * 9301 + 49297) % 233280) / 233280);
}
const W = (h) => ({ hanzi: h, pinyin: "", meaning: "" });
const lessonWith = (o) => ({ id: "l1", title: "t", lessonNumber: null, createdAt: 0, words: [], texts: [], grammar: [], ...o });

test("segment uses longest lesson words, else single chars", () => {
  assert.deepEqual(C.segment("我想喝咖啡。", [W("想"), W("咖啡")]), ["我", "想", "喝", "咖啡", "。"]);
});

test("makeListenPick gives 4 unique options including the answer", () => {
  const l = lessonWith({ words: ["一", "二", "三", "四", "五", "六"].map(W) });
  const items = C.makeListenPick(l, seeded(1));
  assert.equal(items.length, 6);
  for (const it of items) {
    assert.equal(it.options.length, 4);
    assert.equal(new Set(it.options).size, 4);
    assert.ok(it.options.includes(it.answer.hanzi));
  }
});

test("makeListenPick with 3 words gives 3 options; with 1 word none", () => {
  const three = C.makeListenPick(lessonWith({ words: ["一", "二", "三"].map(W) }), seeded(2));
  assert.ok(three.every((it) => it.options.length === 3));
  assert.deepEqual(C.makeListenPick(lessonWith({ words: [W("一")] }), seeded(3)), []);
});

test("makeGrammarBlanks blanks a word that restores the sentence", () => {
  const items = C.makeGrammarBlanks(C.validateLesson(sample), seeded(4));
  assert.ok(items.length >= 1);
  for (const it of items) {
    assert.ok(it.prompt.includes("＿＿"));
    assert.ok(it.point);
    const original = sample.grammar[0].examples[0].hanzi;
    assert.equal(it.prompt.replace("＿＿", it.answer), original);
  }
});

test("makeBuild shuffles tokens and keeps 4-12 char sentences only", () => {
  const l = lessonWith({
    words: [W("咖啡")],
    texts: [{ title: null, lines: [
      { speaker: null, hanzi: "我喝咖啡。", pinyin: "", english: "I drink coffee." },
      { speaker: null, hanzi: "好的。", pinyin: "", english: "" },
      { speaker: null, hanzi: "一二三四五六七八九十一二三", pinyin: "", english: "" },
    ] }],
  });
  const items = C.makeBuild(l, seeded(5));
  assert.equal(items.length, 1);
  const it = items[0];
  assert.deepEqual([...it.tokens].sort(), [...it.answer].sort());
  assert.notDeepEqual(it.tokens, it.answer);
  assert.equal(it.english, "I drink coffee.");
});

test("makeCheckup puts missed items first and caps at 10", () => {
  const l = C.validateLesson({ ...sample, words: ["一", "二", "三", "四", "五", "六", "七", "八", "九", "十", "百", "千"].map(W) });
  const first = C.makeCheckup(l, [], seeded(6));
  assert.ok(first.length <= 10 && first.length > 0);
  const target = first[first.length - 1].id;
  const again = C.makeCheckup(l, [target], seeded(7));
  assert.equal(again[0].id, target);
});

test("buildSteps skips steps with no content", () => {
  const l = lessonWith({ words: ["一", "二", "三"].map(W) });
  assert.deepEqual(C.buildSteps(l), ["words", "listen", "checkup"]);
  assert.deepEqual(C.buildSteps(C.validateLesson(sample)), ["words", "listen", "read", "grammar", "build", "checkup"]);
  // One word: nothing to quiz on, so no check-up either.
  assert.deepEqual(C.buildSteps(lessonWith({ words: [W("一")] })), ["words"]);
});


// ---------- Task 3: settings, storage, request, errors ----------


test("PRESETS are openrouter then custom (zhipu blocks browser calls)", () => {
  assert.deepEqual(C.PRESETS.map((p) => p.id), ["openrouter", "custom"]);
  assert.equal(C.PRESETS[0].baseUrl, "https://openrouter.ai/api/v1");
  assert.equal(C.PRESETS[0].editableModel, true);
});





test("buildExtractionRequest sends one image part per photo and no response_format", () => {
  const settings = { presetId: "openrouter", baseUrl: "https://openrouter.ai/api/v1/", model: "m", apiKey: "k" };
  const { url, init } = C.buildExtractionRequest(settings, ["data:image/jpeg;base64,AA", "data:image/jpeg;base64,BB"]);
  assert.equal(url, "https://openrouter.ai/api/v1/chat/completions");
  assert.equal(init.method, "POST");
  assert.equal(init.headers.Authorization, "Bearer k");
  const body = JSON.parse(init.body);
  assert.equal(body.model, "m");
  assert.equal("response_format" in body, false);
  assert.equal(body.messages[0].role, "system");
  const parts = body.messages[1].content;
  assert.equal(parts.filter((p) => p.type === "image_url").length, 2);
  assert.equal(parts[1].image_url.url, "data:image/jpeg;base64,AA");
});

test("buildExtractionRequest adds free backup models on OpenRouter only", () => {
  const body = (settings) => JSON.parse(C.buildExtractionRequest(settings, ["data:image/jpeg;base64,AA"]).init.body);
  const or = body({ baseUrl: "https://openrouter.ai/api/v1", model: "google/gemma-4-31b-it:free", apiKey: "k" });
  assert.equal(or.model, "google/gemma-4-31b-it:free");
  assert.equal(or.models[0], "google/gemma-4-31b-it:free");
  assert.equal(or.models.length, 3);
  assert.equal(new Set(or.models).size, 3);
  assert.ok(or.models.includes("nvidia/nemotron-3.5-super-vl:free"));
  const own = body({ baseUrl: "https://openrouter.ai/api/v1", model: "my/model", apiKey: "k" });
  assert.deepEqual(own.models, ["my/model", ...C.FREE_IMAGE_MODELS.slice(0, 2)]);
  const other = body({ baseUrl: "https://api.example.com/v1", model: "m", apiKey: "k" });
  assert.equal("models" in other, false);
});

test("OpenRouter preset defaults to the first free image model", () => {
  assert.equal(C.PRESETS[0].model, C.FREE_IMAGE_MODELS[0]);
});

test("errorMessage maps provider failures", () => {
  assert.match(C.errorMessage(null, ""), /internet|reach/i);
  assert.match(C.errorMessage(401, ""), /key/i);
  assert.match(C.errorMessage(402, ""), /credit|quota/i);
  assert.match(C.errorMessage(429, "free-models-per-day"), /today/i);
  assert.match(C.errorMessage(429, ""), /busy/i);
  assert.match(C.errorMessage(404, "No endpoints found that support image input"), /accepts images/i);
  assert.match(C.errorMessage(500, "boom"), /error|problem/i);
});

// ---------- Final review fixes ----------

test("readReply flags cut-off and empty replies", () => {
  assert.deepEqual(C.readReply({ choices: [{ finish_reason: "length", message: { content: '{"words":[' } }] }), { ok: false, error: "too_long" });
  assert.deepEqual(C.readReply({ choices: [{ finish_reason: "stop", message: { content: null } }] }), { ok: false, error: "empty" });
  assert.deepEqual(C.readReply(null), { ok: false, error: "empty" });
  assert.deepEqual(C.readReply({ choices: [{ finish_reason: "stop", message: { content: "{}" } }] }), { ok: true, text: "{}" });
});

test("extraction request leaves room for long lessons", () => {
  const { init } = C.buildExtractionRequest({ baseUrl: "https://x/v1", model: "m", apiKey: "k" }, ["data:image/jpeg;base64,AA"]);
  assert.ok(JSON.parse(init.body).max_tokens >= 8000);
});

test("makeGrammarBlanks offers choices so no Chinese keyboard is needed", () => {
  const l = C.validateLesson(sample);
  for (const it of C.makeGrammarBlanks(l, seeded(8))) {
    assert.ok(it.options.includes(it.answer));
    assert.equal(new Set(it.options).size, it.options.length);
    assert.ok(it.options.length >= 2 && it.options.length <= 4);
  }
});

test("makeListenPick never offers a same-sounding distractor", () => {
  const l = lessonWith({ words: [
    { hanzi: "他", pinyin: "tā", meaning: "he" },
    { hanzi: "她", pinyin: "tā", meaning: "she" },
    { hanzi: "你", pinyin: "nǐ", meaning: "you" },
    { hanzi: "我", pinyin: "wǒ", meaning: "I" },
  ] });
  for (let s = 1; s < 20; s++) {
    for (const it of C.makeListenPick(l, seeded(s))) {
      if (it.answer.hanzi === "他") assert.ok(!it.options.includes("她"));
      if (it.answer.hanzi === "她") assert.ok(!it.options.includes("他"));
    }
  }
});

// ---------- built-in lessons (grammar points and dialogues from 学中文) ----------

const grammarItem = { cn: "了 (le)", en: "Completed actions", lv: "HSK 2", pattern: "Verb + 了", explain: "Shows completion.",
  examples: [{ hz: "我吃了早饭。", py: "Wǒ chī le zǎofàn.", en: "I ate breakfast." }, { hz: "他买了三本书。", py: "Tā mǎi le sān běn shū.", en: "He bought three books." }] };
const dialogItem = { emoji: "👋", title: "见面问候", en: "Meeting someone", lv: "Beginner",
  lines: [{ s: "A", hz: "你好！", py: "Nǐ hǎo!", en: "Hello!" }, { s: "B", hz: "你叫什么名字？", py: "Nǐ jiào shénme míngzi?", en: "What's your name?" }] };
const dict = { 早饭: { p: "zǎofàn", m: "breakfast" }, 吃: { p: "chī", m: "to eat" }, 买: { p: "mǎi", m: "to buy" }, 书: { p: "shū", m: "book" },
  你好: { p: "nǐ hǎo", m: "hello" }, 名字: { p: "míngzi", m: "name" }, 什么: { p: "shénme", m: "what" }, 叫: { p: "jiào", m: "to be called" } };
const lookup = (w) => dict[w] || null;
const split = (text) => { const out = []; const ch = Array.from(text); for (let i = 0; i < ch.length;) { const two = ch.slice(i, i + 2).join(""); if (dict[two]) { out.push(two); i += 2; } else { out.push(ch[i]); i++; } } return out; };

test("builtinLesson grammar shape", () => {
  const l = C.builtinLesson("grammar", grammarItem, 0, lookup, split);
  assert.equal(l.id, "builtin:grammar:0");
  assert.equal(l.title, "了 (le) · Completed actions");
  assert.deepEqual(l.texts, []);
  assert.equal(l.grammar[0].point, "Verb + 了");
  assert.equal(l.grammar[0].explanation, "Shows completion.");
  assert.deepEqual(l.grammar[0].examples[0], { hanzi: "我吃了早饭。", pinyin: "Wǒ chī le zǎofàn.", english: "I ate breakfast." });
  assert.ok(l.words.some((w) => w.hanzi === "早饭" && w.meaning === "breakfast"));
  assert.ok(l.words.every((w) => w.meaning));
});

test("builtinLesson dialog shape", () => {
  const l = C.builtinLesson("dialog", dialogItem, 3, lookup, split);
  assert.equal(l.id, "builtin:dialog:3");
  assert.equal(l.title, "见面问候 · Meeting someone");
  assert.deepEqual(l.grammar, []);
  assert.equal(l.texts[0].lines[1].speaker, "B");
  assert.equal(l.texts[0].lines[1].hanzi, "你叫什么名字？");
  assert.deepEqual(l.words.map((w) => w.hanzi).sort(), ["什么", "你好", "名字", "叫"].sort());
  assert.ok(C.buildSteps(l).includes("read"));
});

test("builtinLesson with empty lookup still has steps", () => {
  const g = C.builtinLesson("grammar", grammarItem, 1, () => null, (t) => Array.from(t));
  assert.ok(C.buildSteps(g).includes("grammar"));
  const d = C.builtinLesson("dialog", dialogItem, 1, () => null, (t) => Array.from(t));
  assert.ok(C.buildSteps(d).includes("read"));
});

// ---------- polish: small review findings ----------

test("parseModelReply skips a brace in prose and a broken first object", () => {
  const good = JSON.stringify({ title: "t", words: [{ hanzi: "茶", pinyin: "chá", meaning: "tea" }] });
  assert.equal(C.parseModelReply("Use {curly} braces? Here: " + good).ok, true);
  assert.equal(C.parseModelReply('{"a":1,} then ' + good).ok, true);
});

test("errorMessage: big uploads and unknown models get their own advice", () => {
  assert.match(C.errorMessage(413, "image too large"), /fewer|smaller/i);
  assert.doesNotMatch(C.errorMessage(413, "image too large"), /can't read photos/i);
  assert.match(C.errorMessage(400, "google/xyz is not a valid model ID"), /model/i);
  assert.match(C.errorMessage(400, "google/xyz is not a valid model ID"), /settings/i);
});

test("makeGrammarBlanks never leaves the answer visible elsewhere in the sentence", () => {
  const l = lessonWith({
    words: [W("看"), W("书")],
    grammar: [{ point: "看看", explanation: "", examples: [{ hanzi: "我看看书，你也看看。", pinyin: "", english: "" }] }],
  });
  for (const it of C.makeGrammarBlanks(l, seeded(3))) assert.ok(!it.prompt.includes(it.answer), it.prompt);
});
