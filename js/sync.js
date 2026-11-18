/* js/sync.js — device sync: change tracking and merging (pure; also loaded by Node tests).
 * Every deck/card/lesson carries u = last-modified ms. Deletions leave tombstones in state.deleted.
 * Merge rule: newest version of each record wins; a tombstone newer than the record removes it.
 */
(function (g) {
  "use strict";
  var TOMBSTONE_DAYS = 120;
  function body(r) { var c = Object.assign({}, r); delete c.u; return JSON.stringify(c); }
  function settingsBody(s) { var c = Object.assign({}, s); delete c.theme; return JSON.stringify(c); } // theme stays per device
  function each(S, fn) {
    ["decks", "cards", "lessons"].forEach(function (kind) {
      (S[kind] || []).forEach(function (r) { fn(kind[0] + ":" + r.id, r); });
    });
  }
  /* Remember the current state without marking anything as changed. */
  function baseline(S, hashes) {
    Object.keys(hashes).forEach(function (k) { delete hashes[k]; });
    each(S, function (k, r) { hashes[k] = body(r); });
    hashes.settings = settingsBody(S.settings || {});
    hashes.ai = JSON.stringify(S.ai || null);
  }
  /* Called on every save: stamp what changed since last time, tombstone what disappeared. */
  function stamp(S, hashes, now) {
    now = now || Date.now();
    S.deleted = S.deleted || {};
    var seen = {};
    each(S, function (k, r) {
      seen[k] = true;
      var b = body(r);
      if (hashes[k] !== b) { r.u = now; hashes[k] = b; delete S.deleted[k]; }
    });
    Object.keys(hashes).forEach(function (k) {
      if (k === "settings" || k === "ai" || seen[k]) return;
      S.deleted[k] = now; delete hashes[k];
    });
    var sb = settingsBody(S.settings || {});
    if (hashes.settings !== sb) { S.settingsU = now; hashes.settings = sb; }
    var ab = JSON.stringify(S.ai || null); // AI settings for photo lessons (provider, model, key)
    if (hashes.ai !== ab) { S.aiU = now; hashes.ai = ab; }
  }
  function cardScore(c) { return [(c.srs && c.srs.reps) || 0, c.u || 0]; }
  function merge(local, remote, now) {
    now = now || Date.now();
    var out = Object.assign({}, local);
    var del = Object.assign({}, remote.deleted || {});
    Object.keys(local.deleted || {}).forEach(function (k) {
      if (!(del[k] >= local.deleted[k])) del[k] = local.deleted[k];
    });
    var cutoff = now - TOMBSTONE_DAYS * 86400000;
    Object.keys(del).forEach(function (k) { if (del[k] < cutoff) delete del[k]; });
    ["decks", "cards", "lessons"].forEach(function (kind) {
      var byId = new Map();
      (local[kind] || []).concat(remote[kind] || []).forEach(function (r) {
        var cur = byId.get(r.id);
        if (!cur || (r.u || 0) > (cur.u || 0)) byId.set(r.id, r);
      });
      out[kind] = Array.from(byId.values()).filter(function (r) {
        var t = del[kind[0] + ":" + r.id];
        return !(t && t >= (r.u || 0));
      });
    });
    // Same word added to the same deck on two devices: keep the one with more practice.
    var byWord = new Map();
    out.cards.forEach(function (c) {
      var k = c.deckId + "|" + c.w, cur = byWord.get(k);
      if (!cur) { byWord.set(k, c); return; }
      var a = cardScore(c), b = cardScore(cur);
      var keep = a[0] > b[0] || (a[0] === b[0] && a[1] > b[1]) ? c : cur;
      var drop = keep === c ? cur : c;
      del["c:" + drop.id] = Math.max(drop.u || 0, 1);
      byWord.set(k, keep);
    });
    var keepIds = new Set(Array.from(byWord.values()).map(function (c) { return c.id; }));
    var deckIds = new Set(out.decks.map(function (d) { return d.id; }));
    out.cards = out.cards.filter(function (c) { return keepIds.has(c.id) && deckIds.has(c.deckId); });
    // Reviews are counted per device per day; the larger count is the safe choice.
    out.reviews = Object.assign({}, remote.reviews || {});
    Object.keys(local.reviews || {}).forEach(function (d) {
      var l = local.reviews[d], r = out.reviews[d];
      if (!r || (l.n || 0) > (r.n || 0)) out.reviews[d] = l;
    });
    var ls = local.streak || {}, rs = remote.streak || {};
    out.streak = String(rs.last || "") > String(ls.last || "") ||
      (rs.last === ls.last && (rs.count || 0) > (ls.count || 0)) ? rs : ls;
    if ((remote.settingsU || 0) > (local.settingsU || 0)) {
      out.settings = Object.assign({}, remote.settings, { theme: (local.settings || {}).theme });
      out.settingsU = remote.settingsU;
    }
    if ((remote.aiU || 0) > (local.aiU || 0) && remote.ai) { out.ai = remote.ai; out.aiU = remote.aiU; }
    out.deleted = del;
    return out;
  }
  /* The sync key from whatever was pasted: a pairing link (#hfsync=…), a bare token, or either inside other text. */
  function tokenFromPaste(text) {
    var t = String(text || "");
    var link = t.match(/#hfsync=([^\s#]+)/);
    if (link) { try { return decodeURIComponent(link[1]).trim() || null; } catch (e) { return null; } }
    var bare = t.match(/\b(ghp_[A-Za-z0-9]+|github_pat_[A-Za-z0-9_]+)\b/);
    return bare ? bare[1] : null;
  }
  /* The AI key is encrypted (AES-GCM, key derived from the sync token) before it goes into the gist:
   * a secret gist is readable by anyone with its link, and GitHub's secret scanning could get a
   * plain key revoked. Only devices holding the sync token can open it. */
  var b64 = function (buf) { return btoa(String.fromCharCode.apply(null, new Uint8Array(buf))); };
  var unb64 = function (s) { return Uint8Array.from(atob(s), function (c) { return c.charCodeAt(0); }); };
  function aiCryptoKey(token) {
    return g.crypto.subtle.digest("SHA-256", new TextEncoder().encode("hanziflow-ai:" + token))
      .then(function (h) { return g.crypto.subtle.importKey("raw", h, "AES-GCM", false, ["encrypt", "decrypt"]); });
  }
  function sealAi(ai, token) {
    var iv = g.crypto.getRandomValues(new Uint8Array(12));
    return aiCryptoKey(token).then(function (k) {
      return g.crypto.subtle.encrypt({ name: "AES-GCM", iv: iv }, k, new TextEncoder().encode(JSON.stringify(ai)));
    }).then(function (ct) { return { v: 1, iv: b64(iv), ct: b64(ct) }; });
  }
  function openAi(sealed, token) {
    if (!sealed || sealed.v !== 1 || !sealed.iv || !sealed.ct) return Promise.resolve(null);
    return aiCryptoKey(token).then(function (k) {
      return g.crypto.subtle.decrypt({ name: "AES-GCM", iv: unb64(sealed.iv) }, k, unb64(sealed.ct));
    }).then(function (pt) { return JSON.parse(new TextDecoder().decode(pt)); }, function () { return null; });
  }
  g.HFSync = { baseline: baseline, stamp: stamp, merge: merge, tokenFromPaste: tokenFromPaste, sealAi: sealAi, openAi: openAi };
})(typeof window !== "undefined" ? window : globalThis);
