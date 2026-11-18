"use strict";
/* js/lessons.js — the Lessons tab: textbook photos → interactive lessons, built-in grammar
 * points and dialogues, and HSK decks. Loaded after app.js and uses its globals
 * (S, save, uid, esc, speak, colorHanzi, colorPinyin, hfDialog, toast, openWriter, go, newSRS,
 * todayStr, rowFromLookup, rowStatus, ICON, $). Logic lives in js/lesson-core.js (HFLesson). */
(function () {
  const L = window.HFLesson;
  const AI_KEY = "hanziflow.ai", PROG_KEY = "hanziflow.lessonProgress";
  const MAX_PHOTOS = 8, MAX_SIDE = 1600;
  const STEP_NAMES = { words: "New words", listen: "Listen & pick", read: "Read the text", grammar: "Grammar", build: "Build it", checkup: "Check-up" };
  const flow = () => $("#lessons-flow");
  const rng = Math.random;

  /* ---------- per-device storage (never synced) ---------- */
  function readJSON(key, fallback) {
    try { const v = JSON.parse(localStorage.getItem(key)); return v && typeof v === "object" ? v : fallback; } catch (e) { return fallback; }
  }
  function writeJSON(key, v) { try { localStorage.setItem(key, JSON.stringify(v)); return true; } catch (e) { return false; } }
  let aiSession = null; // used when storage is blocked
  function loadAi() {
    const d = aiSession || readJSON(AI_KEY, {});
    const p = L.PRESETS[0];
    return { presetId: d.presetId || p.id, baseUrl: d.baseUrl || p.baseUrl, model: d.model || p.model, apiKey: d.apiKey || "" };
  }
  function saveAi(s) { aiSession = writeJSON(AI_KEY, s) ? null : s; }
  const aiReady = (s) => !!(s.apiKey && s.model && /^https?:\/\//.test(s.baseUrl));
  function getProg(id) {
    const p = readJSON(PROG_KEY, {})[id] || {};
    return { step: Number.isInteger(p.step) && p.step >= 0 ? p.step : 0, missed: Array.isArray(p.missed) ? p.missed : [] };
  }
  function setProg(id, p) { const all = readJSON(PROG_KEY, {}); all[id] = p; writeJSON(PROG_KEY, all); }
  function clearProg(id) { const all = readJSON(PROG_KEY, {}); delete all[id]; writeJSON(PROG_KEY, all); }

  /* ---------- dictionary helpers ---------- */
  const goodRow = (w) => {
    if (!window.HF) return null;
    const row = rowFromLookup(HF.lookup(w, { allowFuzzy: false }));
    const st = rowStatus(row);
    return st === "curated" || st === "dictionary" ? row : null;
  };
  let segmenter = null;
  try { segmenter = new Intl.Segmenter("zh", { granularity: "word" }); } catch (e) { segmenter = null; }
  // Word tokens for built-in sentences; pieces the dictionary doesn't know ("吃了") fall back to characters.
  const splitWords = (text) => {
    const segs = segmenter ? [...segmenter.segment(text)].filter((s) => s.isWordLike).map((s) => s.segment) : Array.from(text);
    return segs.flatMap((s) => (s.length > 1 && !goodRow(s) ? Array.from(s) : [s]));
  };
  const builtinCache = {};
  function builtin(kind, i) {
    const key = kind + i;
    if (!builtinCache[key]) {
      const src = kind === "grammar" ? HF_HSK.grammar[i] : HF_HSK.dialogs[i];
      builtinCache[key] = L.builtinLesson(kind, src, i, (w) => { const r = goodRow(w); return r ? { p: r.p, m: shortMeaning(r.m) } : null; }, splitWords);
    }
    return builtinCache[key];
  }
  const shortMeaning = (m) => String(m || "").split(/[;·]/)[0].trim();
  function findLesson(id) {
    const m = /^builtin:(grammar|dialog):(\d+)$/.exec(id);
    if (m) return builtin(m[1], +m[2]);
    return (S.lessons || []).find((l) => l.id === id) || null;
  }
  const say = (text, cls) => `<button class="audio-btn ${cls || "small"}" data-say="${esc(text)}" aria-label="Listen">${ICON.say}</button>`;
  const write = (w, p) => `<button class="audio-btn small" data-write="${esc(w)}" data-write-py="${esc(p || "")}" aria-label="Stroke order for ${esc(w)}" title="Stroke order">${ICON.write}</button>`;
  function bindAudio(root) {
    root.querySelectorAll("[data-say]").forEach((b) => b.onclick = (e) => { e.stopPropagation(); speak(b.dataset.say); });
    root.querySelectorAll("[data-write]").forEach((b) => b.onclick = (e) => { e.stopPropagation(); openWriter(b.dataset.write, b.dataset.writePy); });
  }

  /* ---------- Lessons home ---------- */
  function renderLessons() {
    const mine = (S.lessons || []).slice().sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
    const progLabel = (l) => {
      const steps = L.buildSteps(l), p = getProg(l.id);
      return p.step >= steps.length - 1 && p.step > 0 ? "Check-up" : `Step ${Math.min(p.step + 1, steps.length)} of ${steps.length}`;
    };
    const groups = {};
    HF_HSK.grammar.forEach((g, i) => (groups[g.lv] = groups[g.lv] || []).push(i));
    flow().innerHTML = `
      <div class="row between" style="margin-top:8px">
        <h2 class="sec" style="margin:0">Lessons</h2>
        <button class="btn small coral" id="ls-new">＋ From photos</button>
      </div>
      <h2 class="sec">Your textbook</h2>
      ${mine.length ? `<div class="card" style="padding:4px 14px">${mine.map((l) => `
        <div class="card-row" role="button" tabindex="0" data-open="${esc(l.id)}">
          <div class="det"><div class="zh" style="font-weight:700">${esc(l.title)}</div>
          <div class="m">${l.words.length} words · ${l.texts.length} text${l.texts.length === 1 ? "" : "s"} · ${l.grammar.length} grammar · ${progLabel(l)}</div></div>
          <button class="icon-btn" data-del="${esc(l.id)}" aria-label="Delete lesson" title="Delete lesson">${ICON.trash}</button>
        </div>`).join("")}</div>`
        : `<div class="card empty" style="padding:24px 18px"><div class="big zh">课</div>Take photos of a lesson in your textbook and HanziFlow turns it into an interactive lesson — and its words into flashcards.</div>`}
      <h2 class="sec">Grammar</h2>
      ${Object.entries(groups).map(([lv, idx]) => `
        <div class="muted" style="margin:4px 4px 0;font-weight:650">${esc(lv)}</div>
        <div class="card" style="padding:4px 14px">${idx.map((i) => { const g = HF_HSK.grammar[i]; return `
          <div class="card-row" role="button" tabindex="0" data-open="builtin:grammar:${i}">
            <div class="hw zh" style="min-width:92px">${esc(g.cn)}</div>
            <div class="det"><div class="m" style="white-space:normal">${esc(g.en)}</div><div class="p muted">${esc(g.pattern)}</div></div>
          </div>`; }).join("")}</div>`).join("")}
      <h2 class="sec">Dialogues</h2>
      <div class="card" style="padding:4px 14px">${HF_HSK.dialogs.map((d, i) => `
        <div class="card-row" role="button" tabindex="0" data-open="builtin:dialog:${i}">
          <div style="font-size:24px;width:34px;text-align:center">${esc(d.emoji)}</div>
          <div class="det"><div class="zh" style="font-weight:700">${esc(d.title)}</div><div class="m">${esc(d.en)} · ${esc(d.lv)}</div></div>
        </div>`).join("")}</div>`;
    $("#ls-new").onclick = () => renderPhotos();
    flow().querySelectorAll("[data-open]").forEach((el) => {
      const open = () => startLesson(el.dataset.open);
      el.onclick = open;
      el.onkeydown = (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); open(); } };
    });
    flow().querySelectorAll("[data-del]").forEach((b) => b.onclick = async (e) => {
      e.stopPropagation();
      const l = findLesson(b.dataset.del);
      const ok = await hfDialog({ title: "Delete lesson?", body: `“${l.title}” will be removed from all your devices. Its flashcard deck stays.`,
        actions: [{ label: "Delete", kind: "danger", value: true }, { label: "Cancel", kind: "ghost", value: null }] });
      if (!ok) return;
      S.lessons = S.lessons.filter((x) => x.id !== l.id); clearProg(l.id); save(); renderLessons();
    });
  }

  /* ---------- photo lesson ---------- */
  let photos = [];
  function clearPhotos() { photos.forEach((p) => URL.revokeObjectURL(p.url)); photos = []; }
  function renderPhotos(error) {
    const ai = loadAi();
    flow().innerHTML = `
      <div class="row between" style="margin-top:8px"><button class="btn ghost small" id="ph-back">← Lessons</button></div>
      <div class="card">
        <h2 style="margin-top:0">New lesson from photos</h2>
        <p class="muted">Add the lesson's pages in order: new words, the text and the grammar notes. Flat, bright and in focus works best.</p>
        ${photos.length < MAX_PHOTOS ? `<label class="btn holo" style="cursor:pointer;margin:10px 0">📷 ${photos.length ? "Add more pages" : "Take or choose photos"}
          <input type="file" id="ph-file" accept="image/*" multiple style="display:none"></label>` : ""}
        <div class="muted" style="text-align:center">${photos.length} / ${MAX_PHOTOS} photos</div>
        ${photos.length ? `<div class="ls-thumbs">${photos.map((p, i) => `<div class="ls-thumb"><img src="${p.url}" alt="Page ${i + 1}"><span>${i + 1}</span>
          <button class="icon-btn" data-rm="${i}" aria-label="Remove photo">✕</button></div>`).join("")}</div>` : ""}
        ${error ? `<div class="notice ls-err">${esc(error)}</div>` : ""}
        ${aiReady(ai) ? "" : `<div class="notice">To read photos you need a free AI key. <a href="#" id="ph-ai">Set it up in Settings</a>.</div>`}
        <button class="btn coral" id="ph-make" style="margin-top:12px" ${photos.length ? "" : "disabled"}>Make lesson</button>
      </div>`;
    $("#ph-back").onclick = () => { clearPhotos(); renderLessons(); };
    const f = $("#ph-file");
    if (f) f.onchange = (e) => {
      const files = [...(e.target.files || [])].filter((x) => x.type.startsWith("image/"));
      let over = false;
      for (const x of files) { if (photos.length < MAX_PHOTOS) photos.push({ file: x, url: URL.createObjectURL(x) }); else over = true; }
      renderPhotos(over ? `Up to ${MAX_PHOTOS} photos per lesson.` : null);
    };
    flow().querySelectorAll("[data-rm]").forEach((b) => b.onclick = () => { const p = photos.splice(+b.dataset.rm, 1)[0]; URL.revokeObjectURL(p.url); renderPhotos(); });
    const link = $("#ph-ai"); if (link) link.onclick = (e) => { e.preventDefault(); go("settings"); };
    $("#ph-make").onclick = makeLesson;
  }
  async function resizeImage(file) {
    let src;
    try { src = await createImageBitmap(file); }
    catch (e) {
      src = await new Promise((res, rej) => { const img = new Image(); img.onload = () => res(img); img.onerror = () => rej(new Error("bad image")); img.src = URL.createObjectURL(file); });
    }
    const scale = Math.min(1, MAX_SIDE / Math.max(src.width, src.height));
    const c = document.createElement("canvas");
    c.width = Math.round(src.width * scale); c.height = Math.round(src.height * scale);
    const ctx = c.getContext("2d"); ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, c.width, c.height); ctx.drawImage(src, 0, 0, c.width, c.height);
    if (src.close) src.close();
    return c.toDataURL("image/jpeg", 0.8);
  }
  async function makeLesson() {
    const ai = loadAi();
    if (!aiReady(ai)) return renderPhotos("Add your AI key in Settings first.");
    flow().innerHTML = `<div class="card summary"><div class="emoji">📖</div><h3>Reading ${photos.length} photo${photos.length === 1 ? "" : "s"}…</h3><p class="muted">This can take up to a minute.</p></div>`;
    let images;
    try { images = await Promise.all(photos.map((p) => resizeImage(p.file))); }
    catch (e) { return renderPhotos("One of the photos couldn't be opened. Remove it and try again."); }
    const { url, init } = L.buildExtractionRequest(ai, images);
    if (typeof AbortSignal !== "undefined" && AbortSignal.timeout) init.signal = AbortSignal.timeout(120000);
    let res;
    try { res = await fetch(url, init); }
    catch (e) { return renderPhotos(e && e.name === "TimeoutError" ? "The AI took too long to answer. Try again, or with fewer photos." : L.errorMessage(null, "")); }
    if (!res.ok) return renderPhotos(L.errorMessage(res.status, await res.text().catch(() => "")));
    const reply = L.readReply(await res.json().catch(() => null));
    if (!reply.ok) return renderPhotos(reply.error === "too_long"
      ? "This lesson was too long for the AI to answer in one go. Try fewer pages at a time (for example the word list and the text first)."
      : "The AI sent back an empty answer. Try again, or pick a different model in Settings.");
    const parsed = L.parseModelReply(reply.text);
    if (!parsed.ok) return renderPhotos(parsed.error === "no_words"
      ? "No lesson words were found in these photos. Make sure the new-words page is included and readable."
      : "Couldn't read the AI's reply. Please try again.");
    clearPhotos();
    // The AI may leave pinyin or meanings empty; the dictionary fills the gaps.
    parsed.lesson.words.forEach((w) => {
      if (w.pinyin && w.meaning) return;
      const r = goodRow(w.hanzi);
      if (r) { w.pinyin = w.pinyin || r.p; w.meaning = w.meaning || shortMeaning(r.m); }
    });
    renderReview(parsed.lesson, true);
  }

  function renderReview(lesson, addCards) {
    const words = lesson.words;
    flow().innerHTML = `
      <div class="card">
        <h2 class="zh" style="margin-top:0">${esc(lesson.title)}</h2>
        <div class="stats-grid" style="margin:10px 0">
          <div class="stat tile-mint"><div class="v">${words.length}</div><div class="k">Words</div></div>
          <div class="stat tile-lilac"><div class="v">${lesson.texts.length}</div><div class="k">Texts</div></div>
          <div class="stat tile-mint"><div class="v">${lesson.grammar.length}</div><div class="k">Grammar</div></div>
          <div class="stat tile-lilac"><div class="v">${L.buildSteps(lesson).length}</div><div class="k">Steps</div></div>
        </div>
        <b>Check the words</b>
        <p class="muted" style="margin:4px 0 8px">Remove anything the AI misread, so you don't practise it.</p>
        <div>${words.map((w, i) => `<span class="pill ls-word"><span class="zh">${colorHanzi(w.hanzi, w.pinyin)}</span> <span class="muted">${esc(w.meaning)}</span>
          ${words.length > 1 ? `<button class="ls-x" data-rmw="${i}" aria-label="Remove ${esc(w.hanzi)}">✕</button>` : ""}</span>`).join("")}</div>
        <div class="row between" style="margin-top:16px"><b>Add ${words.length} words to flashcards</b>
          <label class="switch"><input type="checkbox" id="rv-cards" ${addCards ? "checked" : ""} aria-label="Add words to flashcards"><span class="sl"></span></label></div>
        <p class="muted" style="margin:4px 0 0">Creates a deck “${esc(lesson.title)}” so these words come back in Study Now.</p>
        <button class="btn coral" id="rv-start" style="margin-top:14px">Start studying →</button>
      </div>`;
    flow().querySelectorAll("[data-rmw]").forEach((b) => b.onclick = () => { words.splice(+b.dataset.rmw, 1); renderReview(lesson, $("#rv-cards").checked); });
    $("#rv-start").onclick = async () => {
      const wantCards = $("#rv-cards").checked;
      $("#rv-start").disabled = true;
      if (wantCards) $("#rv-start").textContent = "Preparing flashcards…";
      S.lessons = S.lessons || [];
      if (!S.lessons.some((l) => l.id === lesson.id)) S.lessons.push(lesson);
      if (wantCards) await addLessonDeck(lesson);
      save();
      startLesson(lesson.id);
    };
  }

  async function addLessonDeck(lesson) {
    try { if (HF.ensureExtra) await HF.ensureExtra(); } catch (e) { console.warn("[HanziFlow] full dictionary unavailable", e); }
    let deck = S.decks.find((d) => d.lessonId === lesson.id);
    if (!deck) { deck = { id: uid(), name: lesson.title, created: todayStr(), lessonId: lesson.id }; S.decks.push(deck); }
    const have = new Set(S.cards.filter((c) => c.deckId === deck.id).map((c) => c.w));
    let added = 0;
    for (const w of lesson.words) {
      if (have.has(w.hanzi)) continue;
      have.add(w.hanzi);
      S.cards.push(cardFor(deck.id, w.hanzi, { p: w.pinyin, m: w.meaning, source: "lesson" }));
      added++;
    }
    toast(`Added ${added} card${added === 1 ? "" : "s"} to “${deck.name}”`);
  }
  // A HanziFlow card. Lesson words keep the book's pinyin/meaning (the dictionary fills gaps and
  // the example); HSK words prefer the dictionary and fall back to the list.
  function cardFor(deckId, w, o) {
    const r = rowFromLookup(HF.lookup(w));
    const pin = (o.p || r.p || o.fallbackP || "").trim(), mean = (o.m || r.m || o.fallbackM || "").trim();
    const source = o.source;
    return { id: uid(), deckId, w, p: pin, m: mean, h: r.h, s: r.s, source, confidence: r.confidence,
      needsReview: !mean, dictionaryVersion: window.HF_DATA ? HF_DATA.version : "", exampleSource: r.exampleSource, srs: newSRS() };
  }

  /* ---------- lesson runner ---------- */
  let run = null; // { lesson, steps, idx, missed:Set }
  function startLesson(id) {
    const lesson = findLesson(id);
    if (!lesson) return renderLessons();
    const steps = L.buildSteps(lesson);
    if (!steps.length) { toast("This lesson has nothing to practise yet"); return renderLessons(); }
    const p = getProg(id);
    run = { lesson, steps, idx: Math.min(p.step, steps.length - 1), missed: new Set(p.missed) };
    if (curScreen !== "lessons") go("lessons");
    renderStep();
  }
  function saveRun() { setProg(run.lesson.id, { step: run.idx, missed: [...run.missed] }); }
  function move(d) {
    const n = run.idx + d;
    if (n < 0 || n >= run.steps.length) { run = null; return renderLessons(); }
    run.idx = n; saveRun(); renderStep();
  }
  const mark = (id, ok) => { if (ok) run.missed.delete(id); else run.missed.add(id); saveRun(); };

  function renderStep() {
    const key = run.steps[run.idx], last = run.idx === run.steps.length - 1;
    flow().innerHTML = `
      <div class="row between" style="margin-top:8px">
        <button class="btn ghost small" id="st-exit">✕ Lessons</button>
        <span class="muted">Step ${run.idx + 1} of ${run.steps.length}</span>
      </div>
      <h2 class="sec zh" style="margin-bottom:2px">${esc(run.lesson.title)}</h2>
      <div class="muted" style="margin:0 4px 6px;font-weight:650">${STEP_NAMES[key]}</div>
      <div class="ls-dots">${run.steps.map((_, i) => `<i class="${i < run.idx ? "done" : i === run.idx ? "cur" : ""}"></i>`).join("")}</div>
      <div id="st-body"></div>
      <div class="row" style="margin-top:14px;gap:10px">
        <button class="btn ghost" id="st-prev" style="flex:1">${run.idx ? "← Back" : "Lessons"}</button>
        ${key === "checkup" ? "" : `<button class="btn coral" id="st-next" style="flex:1">${last ? "Finish" : "Next →"}</button>`}
      </div>`;
    $("#st-exit").onclick = () => { run = null; renderLessons(); };
    $("#st-prev").onclick = () => move(-1);
    const nx = $("#st-next"); if (nx) nx.onclick = () => move(1);
    STEPS[key]($("#st-body"));
    window.scrollTo(0, 0);
  }

  function sequence(box, items, widget, onEnd) {
    let i = 0, right = 0;
    const next = () => {
      if (i >= items.length) return onEnd(right, items.length);
      box.innerHTML = `<div class="card"><div class="muted" style="margin-bottom:6px">${i + 1} / ${items.length}</div><div class="ls-ex"></div></div>`;
      widget(box.querySelector(".ls-ex"), items[i], (ok) => { if (ok) right++; i++; next(); });
    };
    next();
  }
  function doneCard(box, title, again) {
    box.innerHTML = `<div class="card summary"><div class="emoji">✅</div><h3>${esc(title)}</h3>${again ? `<button class="btn ghost small" id="ls-again">Again</button>` : ""}</div>`;
    if (again) $("#ls-again").onclick = again;
  }
  const continueBtn = (el, done, ok) => {
    const b = document.createElement("button"); b.className = "btn coral"; b.style.marginTop = "12px"; b.textContent = "Continue";
    b.onclick = () => done(ok); el.append(b); b.focus();
  };
  function choose(el, options, answer, onPick) {
    const wrap = el.querySelector(".ls-opts");
    wrap.innerHTML = options.map((o, i) => `<button class="quiz-opt zh ls-opt" data-i="${i}">${esc(o)}</button>`).join("");
    const btns = [...wrap.querySelectorAll("button")];
    btns.forEach((b) => b.onclick = () => {
      const ok = options[+b.dataset.i] === answer;
      btns.forEach((x) => { x.disabled = true; if (options[+x.dataset.i] === answer) x.classList.add("correct"); });
      if (!ok) b.classList.add("wrong"); else b.classList.add("pop");
      onPick(ok);
    });
  }

  /* widgets: (el, item, done(ok)) */
  function pickWidget(el, d, done) {
    el.innerHTML = `<p class="muted" style="text-align:center">Listen, then pick the word you hear.</p>
      <div style="text-align:center">${say(d.answer.hanzi, "ls-big-say")}</div><div class="ls-opts ls-grid"></div><div class="ls-fb"></div>`;
    bindAudio(el);
    choose(el, d.options, d.answer.hanzi, (ok) => {
      mark(d.id, ok); speak(d.answer.hanzi);
      el.querySelector(".ls-fb").innerHTML = `<span class="zh">${colorHanzi(d.answer.hanzi, d.answer.pinyin)}</span> ${colorPinyin(d.answer.pinyin)} — ${esc(d.answer.meaning)}`;
      continueBtn(el, done, ok);
    });
    setTimeout(() => speak(d.answer.hanzi), 250);
  }
  function blankWidget(el, d, done) {
    const full = d.prompt.replace("＿＿", d.answer);
    el.innerHTML = `<span class="chip dictionary zh">${esc(d.point)}</span>
      <div class="zh ls-prompt">${esc(d.prompt)}</div>${d.english ? `<div class="muted">${esc(d.english)}</div>` : ""}
      <div class="ls-opts ls-grid"></div><div class="ls-fb"></div>`;
    const finish = (ok) => {
      mark(d.id, ok); speak(full);
      el.querySelector(".ls-fb").innerHTML = `${ok ? "Correct! " : "Answer: "}<span class="zh">${esc(full)}</span>`;
      continueBtn(el, done, ok);
    };
    if (d.options && d.options.length >= 2) return choose(el, d.options, d.answer, finish);
    el.querySelector(".ls-opts").innerHTML = `<input type="text" class="zh" id="bl-in" placeholder="Type the missing word" lang="zh-CN">
      <div class="row" style="margin-top:8px"><button class="btn small" id="bl-check">Check</button><button class="btn small ghost" id="bl-show">Show answer</button></div>`;
    const norm = (s) => s.replace(/[\s\p{P}]/gu, "");
    $("#bl-check").onclick = () => { const v = $("#bl-in").value; if (v.trim()) { $("#bl-check").disabled = $("#bl-show").disabled = true; finish(norm(v) === norm(d.answer)); } };
    $("#bl-show").onclick = () => { $("#bl-check").disabled = $("#bl-show").disabled = true; finish(false); };
  }
  function buildWidget(el, d, done) {
    let placed = [], pool = d.tokens.map((t, i) => ({ t, i })), answered = false;
    el.innerHTML = `<p class="muted">${d.english ? `Put the words in order: “${esc(d.english)}”` : "Put the words in the right order."}</p>
      <div class="ls-slots"></div><div class="ls-pool"></div><button class="btn small" id="bd-check">Check</button><div class="ls-fb"></div>`;
    const draw = () => {
      el.querySelector(".ls-slots").innerHTML = placed.map((x, k) => `<button class="pill zh ls-tok" data-s="${k}">${esc(x.t)}</button>`).join("");
      el.querySelector(".ls-pool").innerHTML = pool.map((x, k) => `<button class="pill zh ls-tok" data-p="${k}">${esc(x.t)}</button>`).join("");
      el.querySelectorAll("[data-s]").forEach((b) => b.onclick = () => { if (answered) return; pool.push(placed.splice(+b.dataset.s, 1)[0]); draw(); });
      el.querySelectorAll("[data-p]").forEach((b) => b.onclick = () => { if (answered) return; placed.push(pool.splice(+b.dataset.p, 1)[0]); draw(); });
      $("#bd-check").disabled = pool.length > 0 || answered;
    };
    $("#bd-check").onclick = () => {
      answered = true;
      const ok = placed.map((x) => x.t).join("") === d.answer.join("");
      el.querySelector(".ls-slots").classList.add(ok ? "ok" : "bad");
      el.querySelector(".ls-fb").innerHTML = `${ok ? "Correct! " : "Correct order: "}<span class="zh">${esc(d.answer.join(" "))}</span>`;
      mark(d.id, ok); speak(d.answer.join("")); draw();
      continueBtn(el, done, ok);
    };
    draw();
  }
  const WIDGETS = { pick: pickWidget, blank: blankWidget, build: buildWidget };

  /* steps */
  const STEPS = {
    words(box) {
      box.innerHTML = `<p class="muted" style="margin:0 4px 8px">Tap a word to hear it, then say it out loud. 写 shows the stroke order.</p>
        <div class="card" style="padding:4px 14px">${run.lesson.words.map((w) => `
          <div class="card-row" data-say-row="${esc(w.hanzi)}">
            <div class="hw zh">${colorHanzi(w.hanzi, w.pinyin)}</div>
            <div class="det"><div class="p">${colorPinyin(w.pinyin)}</div><div class="m" style="white-space:normal">${esc(w.meaning)}</div></div>
            ${write(w.hanzi, w.pinyin)}${say(w.hanzi)}
          </div>`).join("")}</div>`;
      box.querySelectorAll("[data-say-row]").forEach((r) => r.onclick = () => speak(r.dataset.sayRow));
      bindAudio(box);
    },
    listen(box) {
      sequence(box, L.makeListenPick(run.lesson, rng), pickWidget, (r, n) => doneCard(box, `You got ${r} of ${n}`, () => STEPS.listen(box)));
    },
    read(box) {
      const words = run.lesson.words;
      const known = new Map(words.map((w) => [w.hanzi, w]));
      box.innerHTML = `<div class="card ls-info" id="rd-info" hidden></div>
        <div class="row between" style="margin:0 4px 8px"><span class="muted">Tap a word for its meaning.</span>
        <button class="btn small ghost" id="rd-py">Show pinyin & English</button></div>
        ${run.lesson.texts.map((t) => `<div class="card">
          ${t.title ? `<b class="zh">${esc(t.title)}</b>` : ""}
          <button class="btn small ghost" data-say="${esc(t.lines.map((l) => l.hanzi).join(""))}" style="margin:6px 0">▶ Play all</button>
          ${t.lines.map((line) => `<div class="ls-line">
            ${line.speaker ? `<div class="ls-spk zh">${esc(line.speaker)}</div>` : ""}
            <div class="ls-ltext"><div class="zh ls-hz">${L.segment(line.hanzi, words).map((tok) => /^[\s\p{P}]+$/u.test(tok) ? esc(tok)
              : `<span class="${known.has(tok) ? "kw" : ""}" data-tok="${esc(tok)}">${esc(tok)}</span>`).join("")}</div>
              <div class="ls-py" hidden>${colorPinyin(line.pinyin)}</div><div class="muted ls-en" hidden>${esc(line.english)}</div></div>
            ${say(line.hanzi)}</div>`).join("")}
        </div>`).join("")}`;
      bindAudio(box);
      let shown = false;
      $("#rd-py").onclick = () => {
        shown = !shown; $("#rd-py").textContent = shown ? "Hide pinyin & English" : "Show pinyin & English";
        box.querySelectorAll(".ls-py,.ls-en").forEach((e) => e.hidden = !shown);
      };
      box.querySelectorAll("[data-tok]").forEach((s) => s.onclick = () => {
        box.querySelectorAll(".ls-hz span.sel").forEach((x) => x.classList.remove("sel"));
        s.classList.add("sel");
        const tok = s.dataset.tok;
        let w = known.get(tok);
        if (!w) { const r = goodRow(tok); if (r) w = { hanzi: tok, pinyin: r.p, meaning: shortMeaning(r.m) }; }
        const info = $("#rd-info");
        info.hidden = false;
        info.innerHTML = `<div class="row" style="gap:12px"><div class="zh" style="font-size:30px">${colorHanzi(tok, w && w.pinyin)}</div>
          <div style="flex:1;min-width:0">${w ? `<div>${colorPinyin(w.pinyin)}</div><div class="muted">${esc(w.meaning)}</div>` : `<div class="muted">Not in the dictionary</div>`}</div>
          ${write(tok, w && w.pinyin)}${say(tok)}</div>`;
        bindAudio(info);
        speak(tok);
      });
    },
    grammar(box) {
      const items = L.makeGrammarBlanks(run.lesson, rng);
      box.innerHTML = run.lesson.grammar.map((g) => `<div class="card">
          <div class="zh ls-point">${esc(g.point)}</div>
          ${g.explanation ? `<p style="margin:6px 0">${esc(g.explanation)}</p>` : ""}
          ${g.examples.map((ex) => `<div class="ls-line"><div class="ls-ltext"><div class="zh ls-hz">${esc(ex.hanzi)}</div>
            <div>${colorPinyin(ex.pinyin)}</div><div class="muted">${esc(ex.english)}</div></div>${say(ex.hanzi)}</div>`).join("")}
        </div>`).join("") + (items.length ? `<h2 class="sec">Practice</h2><div id="gr-practice"><button class="btn coral" id="gr-go">Fill in the blanks (${items.length})</button></div>` : "");
      bindAudio(box);
      const go2 = $("#gr-go");
      if (go2) {
        const start = () => sequence($("#gr-practice"), L.makeGrammarBlanks(run.lesson, rng), blankWidget, (r, n) => doneCard($("#gr-practice"), `You got ${r} of ${n}`, start));
        go2.onclick = start;
      }
    },
    build(box) {
      sequence(box, L.makeBuild(run.lesson, rng), buildWidget, (r, n) => doneCard(box, `You got ${r} of ${n}`, () => STEPS.build(box)));
    },
    checkup(box) {
      const items = L.makeCheckup(run.lesson, [...run.missed], rng);
      const before = items.filter((it) => run.missed.has(it.id)).length;
      box.innerHTML = `${before ? `<p class="muted" style="margin:0 4px 8px">${before === 1 ? "1 item you missed before comes first." : before + " items you missed before come first."}</p>` : ""}<div id="ck-area"></div>`;
      const area = $("#ck-area");
      sequence(area, items, (el, it, done) => WIDGETS[it.kind](el, it.data, done), (r, n) => {
        area.innerHTML = `<div class="card summary"><div class="emoji">${r === n ? "🎉" : "💪"}</div>
          <div class="big" style="font-size:44px;font-weight:800">${r}/${n}</div>
          <p class="muted">${r === n ? "Perfect! This lesson is in good shape." : `${run.missed.size} item${run.missed.size === 1 ? "" : "s"} to review — they come first next time.`}</p>
          <div class="row" style="justify-content:center;gap:8px;flex-wrap:wrap;margin-top:12px">
            <button class="btn small ghost" id="ck-redo">Redo lesson</button>
            <button class="btn small ghost" id="ck-again">Check-up again</button>
            <button class="btn small" id="ck-done">Lessons</button></div></div>`;
        $("#ck-redo").onclick = () => { run.idx = 0; saveRun(); renderStep(); };
        $("#ck-again").onclick = () => renderStep();
        $("#ck-done").onclick = () => { run = null; renderLessons(); };
      });
    },
  };

  /* ---------- AI settings card (Settings screen) ---------- */
  function renderAiCard(el) {
    if (!el) return;
    let draft = loadAi();
    const draw = () => {
      const p = L.PRESETS.find((x) => x.id === draft.presetId) || L.PRESETS[L.PRESETS.length - 1];
      el.innerHTML = `<b>AI for photo lessons</b>
        <p class="muted" style="margin:4px 0 8px">Reads textbook photos. Your key stays on this device: it is not synced or included in backups.</p>
        <label class="lbl" for="ai-preset">Provider</label>
        <select id="ai-preset">${L.PRESETS.map((x) => `<option value="${esc(x.id)}" ${x.id === p.id ? "selected" : ""}>${esc(x.label)}</option>`).join("")}</select>
        <p class="muted" style="margin:6px 0">${esc(p.note)}</p>
        ${p.id === "custom" ? `<label class="lbl" for="ai-base">API address</label><input type="text" id="ai-base" value="${esc(draft.baseUrl)}" placeholder="https://…/v1" autocomplete="off">` : ""}
        ${p.editableModel ? `<label class="lbl" for="ai-model">Model (must accept images)</label><input type="text" id="ai-model" value="${esc(draft.model)}" autocomplete="off" spellcheck="false">` : ""}
        <label class="lbl" for="ai-key">API key</label>
        <div class="row" style="gap:8px"><input type="password" id="ai-key" value="${esc(draft.apiKey)}" autocomplete="off" spellcheck="false" style="flex:1">
          <button class="btn small ghost" id="ai-show" type="button">Show</button></div>
        <div class="row between" style="margin-top:10px">${p.signupUrl ? `<a href="${esc(p.signupUrl)}" target="_blank" rel="noopener">Get a free key</a>` : "<span></span>"}
          <button class="btn small" id="ai-save">Save</button></div>`;
      $("#ai-preset").onchange = (e) => {
        const np = L.PRESETS.find((x) => x.id === e.target.value);
        draft = { ...draft, presetId: np.id, baseUrl: np.id === "custom" ? "" : np.baseUrl, model: np.id === "custom" ? "" : np.model };
        draw();
      };
      $("#ai-show").onclick = () => { const k = $("#ai-key"); const hid = k.type === "password"; k.type = hid ? "text" : "password"; $("#ai-show").textContent = hid ? "Hide" : "Show"; };
      $("#ai-save").onclick = () => {
        const v = (id) => { const x = $(id); return x ? x.value.trim() : null; };
        draft = { ...draft, baseUrl: v("#ai-base") ?? draft.baseUrl, model: v("#ai-model") ?? draft.model, apiKey: v("#ai-key") || "" };
        saveAi(draft);
        toast(aiReady(draft) ? "AI settings saved" : "Saved — add a key to read photos");
      };
    };
    draw();
  }

  /* ---------- HSK decks ---------- */
  async function openHskPicker() {
    let std = "HSK 2.0";
    const existing = () => new Set(S.cards.map((c) => c.w));
    const root = $("#dialog-root"), prev = document.activeElement;
    const close = () => { root.innerHTML = ""; document.removeEventListener("keydown", onKey); if (prev && prev.focus) prev.focus(); };
    const onKey = (e) => { if (e.key === "Escape") close(); };
    document.addEventListener("keydown", onKey);
    const draw = () => {
      const have = existing();
      const levels = Object.entries(HF_HSK.lists[std]);
      root.innerHTML = `<div class="overlay"><div class="dialog" role="dialog" aria-modal="true" aria-labelledby="hsk-t">
        <h3 id="hsk-t">Add an HSK deck</h3>
        <div class="seg">${Object.keys(HF_HSK.lists).map((s) => `<button data-std="${esc(s)}" class="${s === std ? "on" : ""}">${esc(s)}</button>`).join("")}</div>
        ${levels.map(([lv, list]) => { const plan = L.hskDeckPlan(list, have); const exists = S.decks.some((d) => d.name === std + " · " + lv); return `
          <button class="quiz-opt ls-hsk" data-lv="${esc(lv)}" ${plan.add.length ? "" : "disabled"}>
            <b>${esc(lv)}</b> <span class="muted">· ${list.length} words${plan.skipped ? ` · ${plan.skipped} already in HanziFlow` : ""}${exists ? " · deck exists" : ""}</span>
          </button>`; }).join("")}
        <p class="muted" style="margin-top:8px">New cards arrive ${esc(S.settings.newCap)} per session (change it in Settings), so a big list won't flood your reviews.</p>
        <div class="acts"><button class="btn ghost" id="hsk-x">Close</button></div></div></div>`;
      root.querySelector(".overlay").onclick = (e) => { if (e.target.classList.contains("overlay")) close(); };
      $("#hsk-x").onclick = close;
      root.querySelectorAll("[data-std]").forEach((b) => b.onclick = () => { std = b.dataset.std; draw(); });
      root.querySelectorAll("[data-lv]").forEach((b) => b.onclick = async () => {
        const lv = b.dataset.lv;
        b.disabled = true;
        try { if (HF.ensureExtra) await HF.ensureExtra(); } catch (e) { console.warn("[HanziFlow] full dictionary unavailable", e); }
        const plan = L.hskDeckPlan(HF_HSK.lists[std][lv], existing());
        const name = std + " · " + lv;
        let deck = S.decks.find((d) => d.name === name);
        if (!deck) { deck = { id: uid(), name, created: todayStr() }; S.decks.push(deck); }
        plan.add.forEach((x) => S.cards.push(cardFor(deck.id, x.w, { fallbackP: x.p.replace(/\s+/g, ""), fallbackM: x.m.replace(/…$/, ""), source: "hsk" })));
        save();
        close();
        toast(`Added ${plan.add.length} card${plan.add.length === 1 ? "" : "s"} to “${name}”${plan.skipped ? ` · ${plan.skipped} you already had` : ""}`);
        if (typeof renderWeeks === "function" && curScreen === "weeks") renderWeeks();
      });
    };
    draw();
  }

  window.renderLessons = () => { if (run) renderStep(); else renderLessons(); };
  window.renderAiCard = renderAiCard;
  window.startLessonById = startLesson;
  window.openHskPicker = openHskPicker;
})();
