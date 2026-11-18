/* js/lesson-core.js — lesson logic with no DOM (window.HFLesson; also loaded by Node tests).
 * Parses the AI's reading of textbook photos, turns built-in grammar points and dialogues into
 * lessons, and generates the exercises locally. Storage lives in app.js (S.lessons). */
(function (g) {
  "use strict";

  const CJK = /[㐀-鿿豈-﫿]/;

  const EXTRACTION_PROMPT = [
    "You read photos of one lesson from a Chinese textbook and return its content as JSON.",
    "Copy ONLY content that is printed on the pages: do not invent words, sentences, dialogues or grammar points.",
    "You may add pinyin (with tone marks) or an English meaning/translation when the book does not print one.",
    "Return ONLY one JSON object, no markdown, no other text, with this shape:",
    '{"title": string, "lessonNumber": string|null,',
    ' "words": [{"hanzi": string, "pinyin": string, "meaning": string}],',
    ' "texts": [{"title": string|null, "lines": [{"speaker": string|null, "hanzi": string, "pinyin": string, "english": string}]}],',
    ' "grammar": [{"point": string, "explanation": string, "examples": [{"hanzi": string, "pinyin": string, "english": string}]}]}',
    '"words" is the lesson\'s new-word list. "texts" are the dialogues or reading passages. "grammar" are the grammar/language points with their example sentences.',
    "Use simplified or traditional characters exactly as printed. Use empty arrays for sections the pages don't have.",
  ].join("\n");

  const str = (v) => (typeof v === "string" ? v.trim() : "");
  const isObj = (v) => typeof v === "object" && v !== null && !Array.isArray(v);
  const arr = (v) => (Array.isArray(v) ? v : []);

  function newId() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }

  function cleanLine(raw, withSpeaker) {
    if (!isObj(raw)) return null;
    const hanzi = str(raw.hanzi);
    if (!CJK.test(hanzi)) return null;
    const line = { hanzi, pinyin: str(raw.pinyin), english: str(raw.english) };
    return withSpeaker ? { speaker: str(raw.speaker) || null, ...line } : line;
  }

  function validateLesson(raw) {
    if (!isObj(raw)) return null;
    const seen = new Set();
    const words = [];
    for (const w of arr(raw.words)) {
      if (!isObj(w)) continue;
      const hanzi = str(w.hanzi);
      if (!CJK.test(hanzi) || seen.has(hanzi)) continue;
      seen.add(hanzi);
      words.push({ hanzi, pinyin: str(w.pinyin), meaning: str(w.meaning) });
    }
    if (!words.length) return null;

    const texts = [];
    for (const t of arr(raw.texts)) {
      if (!isObj(t)) continue;
      const lines = arr(t.lines).map((l) => cleanLine(l, true)).filter(Boolean);
      if (lines.length) texts.push({ title: str(t.title) || null, lines });
    }

    const grammar = [];
    for (const g of arr(raw.grammar)) {
      if (!isObj(g)) continue;
      const examples = arr(g.examples).map((e) => cleanLine(e, false)).filter(Boolean);
      const point = str(g.point);
      if (point && examples.length) grammar.push({ point, explanation: str(g.explanation), examples });
    }

    return {
      id: newId(),
      title: str(raw.title) || "Untitled lesson",
      lessonNumber: str(raw.lessonNumber) || null,
      createdAt: Date.now(),
      words,
      texts,
      grammar,
    };
  }

  // Models often wrap JSON in prose or ``` fences; take the first balanced {...}.
  function extractJson(text) {
    const s = String(text || "").replace(/```(?:json)?/gi, "");
    const start = s.indexOf("{");
    if (start < 0) return null;
    let depth = 0;
    let inStr = false;
    let esc = false;
    for (let i = start; i < s.length; i++) {
      const ch = s[i];
      if (inStr) {
        if (esc) esc = false;
        else if (ch === "\\") esc = true;
        else if (ch === '"') inStr = false;
      } else if (ch === '"') inStr = true;
      else if (ch === "{") depth++;
      else if (ch === "}" && --depth === 0) {
        try {
          return JSON.parse(s.slice(start, i + 1));
        } catch {
          return null;
        }
      }
    }
    return null;
  }

  function parseModelReply(text) {
    const raw = extractJson(text);
    if (!raw) return { ok: false, error: "no_json" };
    const lesson = validateLesson(raw);
    if (!lesson) return { ok: false, error: "no_words" };
    return { ok: true, lesson };
  }


  // ---------- Exercises (generated locally, never by the AI) ----------

  const PUNCT = /^[\s\p{P}\p{S}]+$/u;

  function shuffle(list, rng) {
    const a = list.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  // Pinyin without tones or spaces, so 他/她 (tā) count as sounding the same.
  function toneless(pinyin) {
    return String(pinyin || "").normalize("NFD").replace(/[\u0300-\u036f\s\d]/g, "").replace(/ü/g, "v").toLowerCase();
  }

  // Greedy longest match against the lesson's words; anything else is one char.
  function segment(hanzi, words) {
    const dict = new Set(words.map((w) => w.hanzi));
    const maxLen = Math.max(1, ...words.map((w) => w.hanzi.length));
    const chars = Array.from(hanzi);
    const out = [];
    let i = 0;
    while (i < chars.length) {
      let len = Math.min(maxLen, chars.length - i);
      while (len > 1 && !dict.has(chars.slice(i, i + len).join(""))) len--;
      const tok = chars.slice(i, i + len).join("");
      if (tok.trim()) out.push(tok);
      i += len;
    }
    return out;
  }

  function makeListenPick(lesson, rng) {
    const words = lesson.words;
    if (words.length < 2) return [];
    return shuffle(words, rng).flatMap((answer) => {
      const sound = toneless(answer.pinyin);
      const others = shuffle(words.filter((w) => w.hanzi !== answer.hanzi && (!sound || toneless(w.pinyin) !== sound)), rng).slice(0, 3);
      if (!others.length) return [];
      return [{ id: "pick:" + answer.hanzi, answer, options: shuffle([answer, ...others], rng).map((w) => w.hanzi) }];
    });
  }

  // Blank the grammar point's own characters if they appear, else a lesson word.
  function makeGrammarBlanks(lesson, rng) {
    const items = [];
    const wordList = lesson.words.map((w) => w.hanzi).sort((a, b) => b.length - a.length);
    const allTargets = lesson.grammar.flatMap((g) => g.point.match(/[\u3400-\u9fff\uf900-\ufaff]+/g) || []);
    for (const g of lesson.grammar) {
      const pointRuns = (g.point.match(/[㐀-鿿豈-﫿]+/g) || []);
      for (const ex of g.examples) {
        const target = pointRuns.find((r) => ex.hanzi.includes(r)) || wordList.find((w) => ex.hanzi.includes(w));
        if (!target) continue;
        const others = [...new Set([...allTargets, ...wordList])].filter((t) => t !== target && !ex.hanzi.includes(t));
        items.push({
          id: "blank:" + ex.hanzi,
          options: shuffle([target, ...shuffle(others, rng).slice(0, 3)], rng),
          prompt: ex.hanzi.replace(target, "＿＿"),
          answer: target,
          english: ex.english,
          pinyin: ex.pinyin,
          point: g.point,
        });
      }
    }
    return shuffle(items, rng);
  }

  function makeBuild(lesson, rng) {
    const lines = [
      ...lesson.grammar.flatMap((g) => g.examples),
      ...lesson.texts.flatMap((t) => t.lines),
    ];
    const seen = new Set();
    const items = [];
    for (const line of lines) {
      const answer = segment(line.hanzi, lesson.words).filter((t) => !PUNCT.test(t));
      const len = answer.join("").length;
      if (len < 4 || len > 12 || answer.length < 2) continue;
      const key = answer.join("");
      if (seen.has(key)) continue;
      seen.add(key);
      let tokens = shuffle(answer, rng);
      if (tokens.join("|") === answer.join("|")) tokens = [...answer.slice(1), answer[0]];
      items.push({ id: "build:" + key, tokens, answer, english: line.english, pinyin: line.pinyin });
    }
    return shuffle(items, rng);
  }

  const CHECKUP_SIZE = 10;

  function makeCheckup(lesson, missedIds, rng) {
    const pool = [
      ...makeListenPick(lesson, rng).map((d) => ({ id: d.id, kind: "pick", data: d })),
      ...makeGrammarBlanks(lesson, rng).map((d) => ({ id: d.id, kind: "blank", data: d })),
      ...makeBuild(lesson, rng).map((d) => ({ id: d.id, kind: "build", data: d })),
    ];
    const missed = new Set(missedIds || []);
    const first = pool.filter((it) => missed.has(it.id));
    const rest = shuffle(pool.filter((it) => !missed.has(it.id)), rng);
    return [...first, ...rest].slice(0, CHECKUP_SIZE);
  }

  function buildSteps(lesson) {
    const once = () => 0.5;
    const steps = lesson.words.length ? ["words"] : [];
    if (makeListenPick(lesson, once).length) steps.push("listen");
    if (lesson.texts.length) steps.push("read");
    if (lesson.grammar.length) steps.push("grammar");
    if (makeBuild(lesson, once).length) steps.push("build");
    if (makeCheckup(lesson, [], once).length) steps.push("checkup");
    return steps;
  }


  // ---------- Settings, saving, provider calls ----------

  const PRESETS = [
    {
      id: "openrouter",
      label: "OpenRouter (free models)",
      baseUrl: "https://openrouter.ai/api/v1",
      model: "google/gemma-4-31b-it:free",
      editableModel: true,
      signupUrl: "https://openrouter.ai/keys",
      note: "Free account, no card. The model must accept images: if this one stops working, pick another ending in :free that lists \"image\" input at openrouter.ai/models.",
    },
    {
      id: "custom",
      label: "Other (OpenAI-compatible)",
      baseUrl: "",
      model: "",
      editableModel: true,
      signupUrl: "",
      note: "Any OpenAI-compatible API whose model accepts images.",
    },
  ];

  function buildExtractionRequest(settings, imageDataUrls) {
    const baseUrl = String(settings.baseUrl || "").replace(/\/+$/, "");
    const content = [
      { type: "text", text: "Extract this lesson. The photos are its pages in order." },
      ...imageDataUrls.map((url) => ({ type: "image_url", image_url: { url } })),
    ];
    return {
      url: baseUrl + "/chat/completions",
      init: {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: "Bearer " + settings.apiKey },
        body: JSON.stringify({
          model: settings.model,
          temperature: 0.2,
          max_tokens: 8000,
          stream: false,
          messages: [
            { role: "system", content: EXTRACTION_PROMPT },
            { role: "user", content },
          ],
        }),
      },
    };
  }

  // Pulls the text out of a chat-completions reply, spotting cut-off or empty answers.
  function readReply(data) {
    const choice = isObj(data) && Array.isArray(data.choices) ? data.choices[0] : null;
    const content = isObj(choice) && isObj(choice.message) ? choice.message.content : null;
    if (isObj(choice) && choice.finish_reason === "length") return { ok: false, error: "too_long" };
    if (typeof content !== "string" || !content.trim()) return { ok: false, error: "empty" };
    return { ok: true, text: content };
  }

  function errorMessage(status, body) {
    const b = String(body || "");
    if (status == null) return "Couldn't reach the AI service. Check your internet connection (or VPN) and try again.";
    if (status === 401 || status === 403) return "The AI service rejected your API key. Check it in Settings.";
    if (status >= 400 && status < 500 && /image|vision|modalit|multimodal/i.test(b))
      return "This model can't read photos. In Settings, pick a model that accepts images.";
    if (status === 402 || /insufficient|balance|quota|arrear|credit/i.test(b))
      return "Your AI account is out of credit or quota. Check the provider's billing page.";
    if (status === 429 && /per-day|daily|per day/i.test(b))
      return "You've used today's free limit for this model. Try again tomorrow, or pick another model.";
    if (status === 429) return "The AI service is busy. Wait a moment and try again.";
    return "The AI service had a problem (error " + status + "). Please try again.";
  }

  // Grammar points and dialogues from the built-in content, as lessons.
  // lookup(word) -> {p, m} | null; split(text) -> word tokens.
  function builtinLesson(kind, item, index, lookup, split) {
    const line = (l, withSpeaker) => {
      const out = { hanzi: str(l.hz), pinyin: str(l.py), english: str(l.en) };
      return withSpeaker ? { speaker: str(l.s) || null, ...out } : out;
    };
    const isGrammar = kind === "grammar";
    const examples = isGrammar ? arr(item.examples).map((e) => line(e, false)) : [];
    const lines = isGrammar ? [] : arr(item.lines).map((l) => line(l, true));
    const words = [];
    const seen = new Set();
    for (const sentence of [...examples, ...lines]) {
      for (const tok of split(sentence.hanzi)) {
        if (!CJK.test(tok) || seen.has(tok)) continue;
        const hit = lookup(tok);
        if (!hit || !hit.m) continue;
        seen.add(tok);
        words.push({ hanzi: tok, pinyin: str(hit.p), meaning: str(hit.m) });
      }
    }
    return {
      id: "builtin:" + kind + ":" + index,
      title: (isGrammar ? str(item.cn) : str(item.title)) + " · " + str(item.en),
      lessonNumber: null,
      createdAt: 0,
      words,
      texts: lines.length ? [{ title: null, lines }] : [],
      grammar: isGrammar ? [{ point: str(item.pattern), explanation: str(item.explain), examples }] : [],
    };
  }

  const api = {
    EXTRACTION_PROMPT, validateLesson, parseModelReply,
    segment, makeListenPick, makeGrammarBlanks, makeBuild, makeCheckup, buildSteps,
    PRESETS, buildExtractionRequest, errorMessage, readReply, builtinLesson,
  };

  g.HFLesson = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
