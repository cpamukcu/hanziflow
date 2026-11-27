"use strict";
/* js/dictionary.js — the Dictionary tab and the word card used everywhere a word is tapped.
 * Loaded after app.js and uses its globals (S, save, uid, esc, speak, colorHanzi, colorPinyin,
 * toast, openWriter, newSRS, rowFromLookup, norm, deckWordSet, latestDeck, ICON, $). */
(function () {
  const LAST_DECK = "hanziflow.dictDeck"; // per device: the deck words were last added to
  const NEW_DECK = "__new__";
  let query = "", timer = null, fullDict = null;

  const hasHanzi = (s) => /[㐀-鿿豈-﫿]/.test(s);
  const firstMeaning = (m) => String(m || "").split(/[;·]/)[0].trim();

  /* ---------- search ---------- */
  // Chinese input: the whole text as one word when the dictionary has it, words starting
  // with it, and every word in it (for a pasted sentence). Latin input: pinyin or English.
  function results(q) {
    q = q.trim();
    if (!q || !window.HF) return { groups: [] };
    if (!hasHanzi(q)) {
      const hits = HF.search(q, 40).map((h) => h.word);
      return { groups: hits.length ? [{ title: null, words: hits }] : [] };
    }
    const text = HF.simplify(q);
    const groups = [];
    const inText = HF.extractFromText(text, { includeSingle: true, keepStopwords: true, maxWords: 120 }).map((c) => c.word);
    const plain = Array.from(text).filter(hasHanzi).join("");
    const isWord = plain === text && plain.length <= 8 && !!HF.lookup(plain, { allowFuzzy: false }).m;
    if (isWord) {
      groups.push({ title: null, words: [plain] });
      const more = HF.suggest(plain, 12).map((h) => h.word).filter((w) => w !== plain);
      if (more.length) groups.push({ title: `Words starting with ${plain}`, words: more });
      if (plain.length > 1) {
        const chars = [...new Set(Array.from(plain))];
        groups.push({ title: "Characters", words: chars });
      }
    } else if (inText.length) {
      groups.push({ title: `Words in this text (${inText.length})`, words: inText });
    }
    return { groups };
  }

  function rowHTML(w) {
    const r = HF.lookup(w);
    return `<div class="card-row" data-dict="${esc(w)}">
      <div class="hw zh">${colorHanzi(w, r.p)}</div>
      <div class="det"><div>${colorPinyin(r.p)}</div><div class="muted">${esc(firstMeaning(r.m) || "Not in the dictionary")}</div></div>
      <button class="audio-btn small" data-say="${esc(w)}" aria-label="Listen">${ICON.say}</button></div>`;
  }

  function renderResults() {
    const box = $("#dict-results");
    if (!box) return;
    const q = query.trim();
    if (!q) {
      box.innerHTML = `<div class="card"><p class="muted" style="margin:0">Type 汉字, pinyin (nihao or nǐhǎo) or English. Paste a whole sentence to see every word in it. Tap a word to see its meanings and add it to a deck.</p></div>`;
      return;
    }
    const { groups } = results(q);
    box.innerHTML = groups.length ? groups.map((g) => `${g.title ? `<h2 class="sec">${esc(g.title)}</h2>` : ""}
      <div class="card" style="padding:4px 14px">${g.words.map(rowHTML).join("")}</div>`).join("")
      : `<div class="card"><p class="muted" style="margin:0">No words found for “${esc(q)}”.${fullDict === false ? " The full dictionary couldn't load; only common words were searched." : ""}</p></div>`;
    box.querySelectorAll("[data-say]").forEach((b) => b.onclick = (e) => { e.stopPropagation(); speak(b.dataset.say); });
    box.querySelectorAll("[data-dict]").forEach((r) => r.onclick = () => openDictCard(r.dataset.dict));
  }

  function renderDictionary() {
    const scr = $("#scr-dict");
    if (!$("#dict-q")) {
      scr.innerHTML = `<h2 class="sec">Dictionary</h2>
        <input type="text" enterkeyhint="search" id="dict-q" aria-label="Search the dictionary" placeholder="Search 汉字, pinyin or English, or paste a sentence…" autocomplete="off" spellcheck="false">
        <div id="dict-results" style="margin-top:10px"></div>`;
      $("#dict-q").addEventListener("input", (e) => {
        query = e.target.value;
        clearTimeout(timer);
        timer = setTimeout(renderResults, 200);
      });
    }
    $("#dict-q").value = query;
    renderResults();
    // The full dictionary (about 119,000 words) loads on first use; search again once it's in.
    if (fullDict === null && window.HF) HF.ensureExtra().then((ok) => { fullDict = ok; if (curScreen === "dict") renderResults(); });
  }

  /* ---------- word card ---------- */
  function lastDeckId() {
    let id = null;
    try { id = localStorage.getItem(LAST_DECK); } catch (e) { /* private mode */ }
    return S.decks.some((d) => d.id === id) ? id : (S.decks.length ? S.decks[S.decks.length - 1].id : NEW_DECK);
  }
  function rememberDeck(id) { try { localStorage.setItem(LAST_DECK, id); } catch (e) { /* private mode */ } }

  function addToDeck(word, deckId, newName) {
    if (deckId === NEW_DECK) {
      const name = String(newName || "").trim();
      if (!name) { toast("Give the new deck a name"); return null; }
      const d = { id: uid(), name, created: todayStr() };
      S.decks.push(d);
      deckId = d.id;
    }
    const deck = S.decks.find((d) => d.id === deckId);
    if (!deck) return null;
    const w = norm(word);
    if (deckWordSet(deckId).has(w)) { toast(`${w} is already in ${deck.name}`); return deck; }
    const r = rowFromLookup(HF.lookup(w));
    S.cards.push({ id: uid(), deckId, w: r.w, p: r.p.trim(), m: r.m.trim(), h: r.h, s: r.s,
      source: r.sources[0] || "user", confidence: r.confidence, needsReview: !r.m.trim(),
      dictionaryVersion: window.HF_DATA ? HF_DATA.version : "", exampleSource: r.exampleSource, srs: newSRS() });
    save();
    rememberDeck(deckId);
    toast(`Added ${w} to ${deck.name}`);
    return deck;
  }

  function openDictCard(word) {
    if (!window.HF) return toast("The dictionary didn't load. Reload the page.");
    const w = String(word || "").trim();
    if (!w) return;
    const root = $("#dialog-root"), prev = document.activeElement;
    const draw = () => {
      const r = HF.lookup(w);
      const senses = String(r.m || "").split(/;\s*/).filter(Boolean).slice(0, 10);
      const ex = (r.ex || []).find((x) => x && x.z && x.source !== "generic");
      const chars = Array.from(w).filter(hasHanzi);
      const decks = S.decks.filter((d) => d.id).map((d) => `<option value="${esc(d.id)}">${esc(d.name)}</option>`).join("");
      const inDecks = S.decks.filter((d) => deckWordSet(d.id).has(norm(w))).map((d) => d.name);
      root.innerHTML = `<div class="overlay"><div class="dialog dict-card" role="dialog" aria-modal="true" aria-labelledby="dc-w">
        <div class="row" style="gap:10px;align-items:flex-start">
          <div style="flex:1;min-width:0"><div class="zh" id="dc-w" style="font-size:40px;line-height:1.15">${colorHanzi(w, r.p)}</div>
            <div style="font-size:18px">${colorPinyin(r.p)}</div>
            ${r.h ? `<span class="chip dictionary" style="margin-top:6px;display:inline-block">HSK ${esc(r.h)}</span>` : ""}</div>
          <button class="audio-btn" data-say="${esc(w)}" aria-label="Listen">${ICON.say}</button>
          ${chars.length ? `<button class="audio-btn" id="dc-write" aria-label="Stroke order" title="Stroke order">${ICON.write}</button>` : ""}
        </div>
        ${senses.length ? `<ol class="dict-senses">${senses.map((s) => `<li>${esc(s)}</li>`).join("")}</ol>` : `<p class="muted">Not in the dictionary.</p>`}
        ${ex ? `<div class="dict-ex"><div class="zh">${esc(ex.z)}</div><div>${colorPinyin(ex.y || "")}</div><div class="muted">${esc(ex.e || "")}</div></div>` : ""}
        ${chars.length > 1 ? `<div class="muted" style="margin-top:10px">Characters</div><div>${chars.map((c) => `<button class="pill zh" data-char="${esc(c)}">${esc(c)} <span class="muted">${esc(firstMeaning(HF.lookup(c).m))}</span></button>`).join("")}</div>` : ""}
        ${inDecks.length ? `<p class="muted" style="margin:12px 0 0">Already in: ${esc(inDecks.join(", "))}</p>` : ""}
        <div style="margin-top:14px"><label class="muted" for="dc-deck">Add to deck</label>
          <select id="dc-deck">${decks}<option value="${NEW_DECK}">＋ New deck…</option></select>
          <input type="text" id="dc-new" placeholder="New deck name" aria-label="New deck name" hidden style="margin-top:8px"></div>
        <div class="acts"><button class="btn coral" id="dc-add">Add to deck</button><button class="btn ghost" id="dc-close">Close</button></div>
      </div></div>`;
      const sel = $("#dc-deck"), nn = $("#dc-new");
      sel.value = lastDeckId();
      const toggleNew = () => { nn.hidden = sel.value !== NEW_DECK; if (!nn.hidden) nn.focus(); };
      toggleNew();
      sel.onchange = toggleNew;
      root.querySelectorAll("[data-say]").forEach((b) => b.onclick = () => speak(b.dataset.say));
      const wr = $("#dc-write"); if (wr) wr.onclick = () => { close(); openWriter(w, r.p); };
      root.querySelectorAll("[data-char]").forEach((b) => b.onclick = () => { close(); openDictCard(b.dataset.char); });
      $("#dc-add").onclick = () => { if (addToDeck(w, sel.value, nn.value)) close(); };
      $("#dc-close").onclick = close;
      root.querySelector(".overlay").onclick = (e) => { if (e.target.classList.contains("overlay")) close(); };
      $("#dc-add").focus();
    };
    const onKey = (e) => { if (e.key === "Escape") close(); };
    function close() { root.innerHTML = ""; document.removeEventListener("keydown", onKey); if (prev && prev.focus && prev.isConnected) prev.focus(); }
    document.addEventListener("keydown", onKey);
    draw();
    // A rare word may only be in the full dictionary: redraw once it has loaded.
    if (!HF.lookup(w).m && fullDict === null) HF.ensureExtra().then((ok) => { fullDict = ok; if (ok && $("#dc-w")) draw(); });
  }

  window.renderDictionary = renderDictionary;
  window.openDictCard = openDictCard;
  window.HFDict = { results };
})();
