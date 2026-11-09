/* js/lookup.js — HanziFlow smart lookup engine (classic script, no modules)
 * Exposes window.HF. Works in the browser and under Node (tests) via globalThis.
 * Data: window.HF_DATA (data/dictionary.js); merges window.HF_DATA_EXTRA when present.
 */
(function (g) {
  "use strict";

  var HANZI = /[㐀-鿿豈-﫿]/;
  var MAX_WORD_LEN = 8;
  var NORMALIZE_CAP = 200;

  function data() { return g.HF_DATA || { entries: {}, sentences: {}, trad2simp: {}, stopwords: [] }; }
  function extra() { return g.HF_DATA_EXTRA || null; }

  function getEntry(word) {
    var D = data();
    if (D.entries && D.entries[word]) return D.entries[word];
    var X = extra();
    if (X && X.entries && X.entries[word]) return expandRow(word, X.entries[word]);
    return null;
  }
  /* dictionary-extra.js stores compact rows: [p, m, traditional, [z,y,e,source]|0, heteronym] */
  function expandRow(word, row) {
    if (!Array.isArray(row)) return row;
    var e = { w: word, p: row[0], m: row[1], src: "cedict",
      senses: row[1] ? row[1].split("; ") : [] };
    if (row[2]) e.t = row[2];
    if (row[3]) e.ex = [{ z: row[3][0], y: row[3][1], e: row[3][2], source: row[3][3] || "tatoeba" }];
    if (row[4]) e.heteronym = true;
    return e;
  }
  /* Loads the full-dictionary tail once; resolves true/false and never rejects. */
  var extraPromise = null;
  function ensureExtra() {
    if (extra()) return Promise.resolve(true);
    if (typeof document === "undefined") return Promise.resolve(false);
    if (extraPromise) return extraPromise;
    extraPromise = new Promise(function (resolve) {
      var el = document.createElement("script");
      el.src = "data/dictionary-extra.js?v=" + HF.version;
      el.onload = function () { resolve(!!extra()); };
      el.onerror = function () {
        console.warn("[HF] data/dictionary-extra.js failed to load");
        extraPromise = null;
        resolve(false);
      };
      document.head.appendChild(el);
    });
    return extraPromise;
  }
  function getSentences(word) {
    var D = data();
    if (D.sentences && D.sentences[word]) return D.sentences[word];
    var X = extra();
    if (X && X.sentences && X.sentences[word]) return X.sentences[word];
    return null;
  }
  function tradLookup(key) {
    var main = data().trad2simp || {};
    if (main[key]) return main[key];
    var X = extra();
    return X && X.trad2simp ? X.trad2simp[key] : undefined;
  }

  function isHanzi(ch) { return HANZI.test(ch); }

  /* ---------- pinyin helper (runtime; never throws) ---------- */
  function py(text, opts) {
    var f = null;
    if (typeof g.hfPinyin === "function") f = g.hfPinyin;
    else if (g.pinyinPro && typeof g.pinyinPro.pinyin === "function") {
      f = function (t, o) { return g.pinyinPro.pinyin(t, o || { toneType: "symbol" }); };
    }
    if (!f) return "";
    try { return f(text, opts); } catch (e) { return ""; }
  }
  function pyArray(text) {
    if (g.pinyinPro && typeof g.pinyinPro.pinyin === "function") {
      try { return g.pinyinPro.pinyin(text, { toneType: "symbol", type: "array" }); } catch (e) { /* fall through */ }
    }
    var p = py(text);
    return p ? p.split(" ") : [];
  }

  /* ---------- simplify: traditional -> simplified ---------- */
  function simplify(text) {
    var chars = Array.from(text);
    var out = "";
    for (var i = 0; i < chars.length; i++) {
      var matched = false;
      for (var len = Math.min(MAX_WORD_LEN, chars.length - i); len >= 2; len--) {
        var seg = chars.slice(i, i + len).join("");
        var hit = tradLookup(seg);
        if (hit) { out += hit; i += len - 1; matched = true; break; }
      }
      if (!matched) out += (tradLookup(chars[i]) || chars[i]);
    }
    return out;
  }

  /* ---------- normalizeList ---------- */
  var RE_SPLIT = /[\n\r,，、;；|／\/\t　]| {2,}|[•·・◦▪∙]/;
  var RE_ENUM = /^\s*(?:[-*+>]|\d{1,3}\s*[.)、．:：]|[（(]?\d{1,3}\)|[①-⑳])\s*/;
  var RE_BRACKETS = /[（(【\[][^（()）【\]\[]*[）)】\]]/g;

  function cjkRuns(token) {
    var runs = [], cur = "";
    for (var ch of token) {
      if (isHanzi(ch)) cur += ch;
      else { if (cur) runs.push(cur); cur = ""; }
    }
    if (cur) runs.push(cur);
    return runs;
  }
  /* A long unbroken run that is not itself a word ("苹果环境保护经济") is segmented. */
  function splitRun(run) {
    if (run.length < 5 || getEntry(run)) return [run];
    var parts = [], i = 0;
    while (i < run.length) {
      var hit = entryAt(run, i);
      if (hit) { parts.push(hit.word); i += hit.len; }
      else { parts.push(run[i]); i++; }
    }
    return parts.every(function (p) { return p.length === 1; }) ? [run] : parts;
  }

  function normalizeList(raw) {
    var tokens = String(raw == null ? "" : raw).split(RE_SPLIT);
    var out = [], seen = {};
    for (var i = 0; i < tokens.length; i++) {
      var t = tokens[i].replace(RE_ENUM, "").replace(RE_BRACKETS, " ").trim();
      if (!t) continue;
      var runs = cjkRuns(t);
      for (var r = 0; r < runs.length; r++) {
        var words = splitRun(simplify(runs[r]));
        for (var k = 0; k < words.length; k++) {
          var w = words[k];
          if (!w || seen[w]) continue;
          seen[w] = true;
          out.push(w);
          if (out.length >= NORMALIZE_CAP) {
            var msg = "Only the first " + NORMALIZE_CAP + " words were kept";
            console.warn("[HF] normalizeList: " + msg);
            HF.lastWarning = msg;
            return out;
          }
        }
      }
    }
    return out;
  }

  /* ---------- extractFromText (longest-match segmentation) ---------- */
  function entryAt(text, i) {
    var maxLen = Math.min(MAX_WORD_LEN, text.length - i);
    for (var len = maxLen; len >= 2; len--) {
      var seg = text.substr(i, len);
      var e = getEntry(seg);
      if (e) return { word: seg, len: len, entry: e };
    }
    return null;
  }

  function extractFromText(raw, opts) {
    opts = opts || {};
    var maxWords = opts.maxWords || 40;
    var includeSingle = !!opts.includeSingle;
    var text = String(raw == null ? "" : raw);
    var stops = {};
    (data().stopwords || []).forEach(function (w) { stops[w] = true; });

    var out = [], seen = {};
    var i = 0;
    var pushCand = function (word, start, end, hsk, matched) {
      if (seen[word] || out.length >= maxWords) return;
      if (stops[word]) return;
      if (word.length < (opts.minLen || 1)) return;
      if (word.length === 1 && !(includeSingle || hsk === 1)) return;
      seen[word] = true;
      out.push({ word: word, start: start, end: end, hsk: (hsk == null ? null : hsk), matched: !!matched });
    };

    while (i < text.length) {
      var ch = text[i];
      if (!isHanzi(ch)) { i++; continue; }
      var hit = entryAt(text, i);
      if (hit) {
        pushCand(hit.word, i, i + hit.len, hit.entry.h, true);
        i += hit.len;
        continue;
      }
      // unknown span: collect consecutive hanzi with no dictionary start
      var j = i;
      while (j < text.length && isHanzi(text[j]) && !entryAt(text, j)) j++;
      var span = text.slice(i, j);
      if (span.length === 1) {
        var e1 = getEntry(span);
        pushCand(span, i, j, e1 ? e1.h : null, !!e1);
      } else if (span.length > 1 && typeof Intl !== "undefined" && Intl.Segmenter) {
        var seg = new Intl.Segmenter("zh", { granularity: "word" });
        var segs = seg.segment(span);
        for (var s of segs) {
          if (!s.isWordLike) continue;
          var w = s.segment;
          var we = getEntry(w);
          pushCand(w, i + s.index, i + s.index + w.length, we ? we.h : null, !!we);
        }
      } else if (span.length > 1) {
        // no Intl.Segmenter: emit the span only if it is itself an entry
        var e2 = getEntry(span);
        if (e2) pushCand(span, i, j, e2.h, true);
      }
      i = j;
    }
    return out;
  }

  /* ---------- lookup ---------- */
  /* Always grammatical, clearly labelled as generic in the UI. */
  function genericExample(word, p) {
    return [{
      z: "「" + word + "」是什么意思？",
      y: "「" + p + "」 shì shénme yìsi?",
      e: "What does “" + word + "” mean?",
      source: "generic"
    }];
  }

  /* Unknown compound: gloss it from the words it is made of (still flagged for review). */
  function piecedMeaning(w) {
    var parts = [], i = 0;
    while (i < w.length) {
      var hit = entryAt(w, i);
      if (hit) { parts.push(hit.entry); i += hit.len; continue; }
      var one = getEntry(w[i]);
      if (!one) return "";
      parts.push(one); i++;
    }
    if (parts.length < 2) return "";
    return parts.map(function (e) { return String(e.m || "").split(/[;,]/)[0].trim(); }).join(" + ");
  }

  /* Prefix suggestions for the single-card form: curated first, then shortest. */
  function suggest(prefix, limit) {
    var w = simplify(String(prefix || "").trim());
    if (!w) return [];
    limit = limit || 6;
    var hits = [], add = function (bag) {
      if (!bag) return;
      for (var k in bag) { if (k !== w && k.lastIndexOf(w, 0) === 0) hits.push(k); }
    };
    add(data().entries);
    var mainCount = hits.length;
    if (mainCount < limit && extra()) add(extra().entries);
    hits.sort(function (a, b) {
      var ca = (data().entries[a] || {}).src === "curated" ? 0 : 1;
      var cb = (data().entries[b] || {}).src === "curated" ? 0 : 1;
      return ca - cb || a.length - b.length || a.localeCompare(b, "zh");
    });
    return hits.slice(0, limit).map(function (k) {
      var e = getEntry(k);
      return { word: k, p: e.p, m: e.m };
    });
  }

  /* ---------- search by pinyin or English ---------- */
  function pinyinKey(text) {
    return String(text || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "")
      .toLowerCase().replace(/v/g, "u").replace(/[^a-z]/g, "");
  }
  var pinyinIndex = null, pinyinIndexSize = -1;
  function getPinyinIndex() {
    var X = extra();
    var size = X ? 1 : 0;
    if (pinyinIndex && pinyinIndexSize === size) return pinyinIndex;
    var idx = new Map();
    var add = function (w, p) {
      var k = pinyinKey(p);
      if (!k) return;
      if (!idx.has(k)) idx.set(k, []);
      idx.get(k).push(w);
    };
    var main = data().entries || {};
    for (var w in main) add(w, main[w].p);
    if (X) for (var w2 in X.entries) add(w2, X.entries[w2][0]);
    pinyinIndex = idx; pinyinIndexSize = size;
    return idx;
  }
  /* Most common first: curated, then core dictionary order, then the rest; names last. */
  function searchRank(words) {
    return words.map(function (w, i) {
      var e = getEntry(w);
      var cur = (data().entries[w] || {}).src === "curated" ? 0 : 1;
      var name = /^[A-ZĀÁǍÀĒÉĚÈŌÓǑÒ]/.test(e.p || "") ? 1 : 0;
      return { w: w, e: e, r: name * 2 + cur, i: i };
    }).sort(function (a, b) { return a.r - b.r || a.i - b.i; });
  }
  function search(query, limit) {
    limit = limit || 8;
    var q = String(query || "").trim();
    if (!q) return [];
    var hits = [];
    var key = pinyinKey(q);
    if (key) hits = (getPinyinIndex().get(key) || []).slice();
    var out = searchRank(hits).slice(0, limit);
    if (out.length < limit && /^[a-zA-Z][a-zA-Z' -]*$/.test(q) && q.length >= 2) {
      // English meaning, whole-word match, core dictionary only (keeps results sensible).
      var re = new RegExp("\\b" + q.replace(/[^a-zA-Z' -]/g, "") + "\\b", "i");
      var main = data().entries || {}, more = [];
      for (var w in main) if (re.test(main[w].m || "") && hits.indexOf(w) < 0) more.push(w);
      // Exact gloss beats a word that merely mentions it.
      var exact = function (w) { return String(main[w].m).toLowerCase().split(/[;,]/)[0].replace(/^to /, "").trim() === q.toLowerCase() ? 0 : 1; };
      more.sort(function (a, b) { return exact(a) - exact(b); });
      out = out.concat(searchRank(more).sort(function (a, b) { return exact(a.w) - exact(b.w) || a.r - b.r || a.i - b.i; }).slice(0, limit - out.length));
    }
    return out.map(function (h) { return { word: h.w, p: h.e.p, m: h.e.m }; });
  }
  /* Lines with no Chinese at all are search terms, e.g. "shui guo" or "shuǐguǒ, fruit". */
  function latinQueries(raw) {
    var out = [];
    String(raw == null ? "" : raw).split(/\r?\n/).forEach(function (line) {
      if (Array.from(line).some(isHanzi)) return;
      line.split(/[,，、;；|／\/\t　]| {2,}|[•·・◦▪∙]/).forEach(function (t) {
        var q = t.replace(RE_ENUM, "").trim();
        if (/[a-zA-Z\u00c0-\u024f]/.test(q) && out.indexOf(q) < 0) out.push(q);
      });
    });
    return out;
  }

  /* curated | dictionary | pinyin | missing — drives the status chip. */
  function statusOf(row) {
    if (row.m && (row.sources || []).indexOf("curated") >= 0) return "curated";
    if (row.m && !row.pieced) return "dictionary";
    if (row.m || row.p) return "pinyin";
    return "missing";
  }

  function entryToRow(word, entry, opts) {
    opts = opts || {};
    var notes = opts.notes || [];
    var sources = opts.sources || [];
    var isCurated = entry.src === "curated";
    var p = entry.p || "";
    var pa = entry.pa && entry.pa.length ? entry.pa : (p ? p.split(" ") : []);
    if (!p) { p = py(word); pa = p ? p.split(" ") : []; }
    var senses = entry.senses && entry.senses.length ? entry.senses : (entry.m ? [entry.m] : []);
    var m = entry.m || senses.slice(0, 2).join("; ");
    var ex = entry.ex && entry.ex.length ? entry.ex.slice() : null;
    if (!ex) {
      var sent = getSentences(word);
      if (sent && sent.length) ex = sent.slice(0, 1);
    }
    if (!ex || !ex[0] || !ex[0].z) ex = genericExample(word, p);
    var heteronym = !!entry.heteronym;
    var confidence = opts.confidence || (isCurated ? "high" : (m && ex ? "high" : "medium"));
    var needsReview = false;
    if (!m) { needsReview = true; notes.push("no meaning found"); }
    if (!ex || !ex[0] || !ex[0].z) { needsReview = true; notes.push("no example sentence found"); ex = ex || []; }
    if (heteronym && confidence === "high") confidence = "medium";
    if (heteronym) notes.push("heteronym: multiple readings");
    if (ex[0] && ex[0].source === "generic") {
      notes.push("no real sentence found; generic example used");
      if (confidence === "high") confidence = "medium";
    }
    if (entry.src && sources.indexOf(entry.src) < 0) sources.push(entry.src);
    return {
      word: word,
      traditional: opts.traditional || entry.t || null,
      p: p, pa: pa, m: m, senses: senses,
      h: (entry.h == null ? null : entry.h),
      ex: ex,
      confidence: confidence,
      sources: sources,
      needsReview: needsReview,
      notes: notes,
      heteronym: heteronym
    };
  }

  function lookup(word, opts) {
    opts = opts || {};
    var allowFuzzy = opts.allowFuzzy !== false;
    var notes = [], sources = [];
    var w = String(word == null ? "" : word).trim();
    if (!w) return emptyRow(word, notes, sources);

    // 1. exact entry (curated entries are marked src:"curated" in HF_DATA)
    var e = getEntry(w);
    if (e) return entryToRow(w, e, { notes: notes, sources: sources });

    // 2. traditional -> simplified
    var simp = simplify(w);
    if (simp !== w) {
      var e2 = getEntry(simp);
      if (e2) {
        notes.push("converted from traditional");
        return entryToRow(simp, e2, { notes: notes, sources: sources, traditional: w });
      }
    }

    // 3. fuzzy: strip trailing 们/了/的/儿, collapse repeated char
    if (allowFuzzy) {
      var cand = w;
      var trail = cand.match(/[们了的儿]$/);
      if (trail) cand = cand.slice(0, -1);
      if (cand.length >= 2 && cand[cand.length - 1] === cand[cand.length - 2]) cand = cand.slice(0, -1);
      if (cand !== w) {
        var e3 = getEntry(cand) || (simplify(cand) !== cand ? getEntry(simplify(cand)) : null);
        if (e3) {
          notes.push("fuzzy match on " + cand);
          return entryToRow(cand, e3, { notes: notes, sources: sources, confidence: "medium" });
        }
      }
    }

    // 4. pinyin only
    var p = py(w);
    var pieced = piecedMeaning(w);
    notes.push(pieced ? "not in dictionary; meaning pieced together from its parts"
                      : "no dictionary entry; pinyin generated locally");
    return {
      word: w, traditional: null,
      p: p, pa: p ? p.split(" ") : [],
      m: pieced, senses: pieced ? [pieced] : [], h: null,
      ex: p && pieced ? genericExample(w, p) : [],
      confidence: "low", sources: sources, pieced: !!pieced,
      needsReview: true, notes: notes, heteronym: false
    };
  }

  function emptyRow(word, notes, sources) {
    notes.push("empty input");
    return {
      word: String(word || ""), traditional: null, p: "", pa: [], m: "", senses: [],
      h: null, ex: [], confidence: "low", sources: sources,
      needsReview: true, notes: notes, heteronym: false
    };
  }

  /* ---------- enrichBatch ---------- */
  function enrichBatch(words, opts) {
    opts = opts || {};
    var signal = opts.signal;
    var concurrency = opts.concurrency || 6;
    var onProgress = opts.onProgress;
    var list = Array.isArray(words) ? words.slice() : [];
    var rows = new Array(list.length);
    var idx = 0, done = 0;
    return new Promise(function (resolve, reject) {
      function worker() {
        while (idx < list.length) {
          if (signal && signal.aborted) {
            var err = new Error("aborted"); err.name = "AbortError";
            return reject(err);
          }
          var i = idx++;
          var row;
          try { row = lookup(list[i], opts); }
          catch (e) { row = emptyRow(list[i], ["lookup error: " + e.message], []); }
          if (!row.m && !row.needsReview) { row.needsReview = true; row.notes.push("empty meaning"); }
          rows[i] = row;
          done++;
          if (onProgress) { try { onProgress(done, list.length); } catch (e) { /* ignore */ } }
        }
        if (done >= list.length) resolve(rows);
      }
      for (var k = 0; k < Math.min(concurrency, list.length); k++) worker();
      if (!list.length) resolve([]);
    });
  }

  /* ---------- dedupe ---------- */
  function dedupe(rows) {
    var seen = {}, out = [];
    (rows || []).forEach(function (r) {
      if (!r || !r.word || seen[r.word]) return;
      seen[r.word] = true;
      out.push(r);
    });
    return out;
  }

  /* ---------- public API ---------- */
  var HF = {
    version: "2.0.0",
    normalizeList: normalizeList,
    extractFromText: extractFromText,
    lookup: lookup,
    enrichBatch: enrichBatch,
    simplify: simplify,
    isHanzi: isHanzi,
    dedupe: dedupe,
    ensureExtra: ensureExtra,
    suggest: suggest,
    search: search,
    latinQueries: latinQueries,
    statusOf: statusOf,
    debug: function (raw) {
      var words = Array.isArray(raw) ? raw : normalizeList(raw);
      return enrichBatch(words).then(function (rows) {
        console.log("HF.debug — " + rows.length + " rows");
        rows.forEach(function (r) {
          console.log([
            r.word, r.p, r.m, "h=" + (r.h == null ? "—" : r.h),
            r.confidence, r.needsReview ? "REVIEW" : "ok",
            r.ex[0] ? r.ex[0].z : "(no example)",
            r.ex[0] ? r.ex[0].y : "",
            r.ex[0] ? r.ex[0].e : "",
            r.notes.length ? "notes: " + r.notes.join("; ") : ""
          ].join(" | "));
        });
        return rows;
      });
    }
  };

  g.HF = HF;
})(typeof window !== "undefined" ? window : globalThis);
