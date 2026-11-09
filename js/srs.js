/* js/srs.js — pure scheduling logic (classic script; also loaded by Node tests). */
(function (g) {
  "use strict";
  var DAY = 86400000;
  function dayStart(d) { d = d || new Date(); return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime(); }
  function todayStr(d) {
    d = d || new Date();
    return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
  }
  function newSRS() { return { e: 2.5, ivl: 0, due: dayStart(), reps: 0, lapses: 0 }; }
  function isFresh(c) { return !c.srs || (c.srs.reps === 0 && c.srs.ivl === 0 && c.srs.lapses === 0); }
  function stageOf(c) {
    var s = c.srs;
    if (!s || (s.reps === 0 && s.ivl === 0)) return "New";
    if (s.ivl < 3) return "Learning";
    if (s.ivl < 21) return "Reviewing";
    return "Mastered";
  }
  function nextInterval(s, q) { // q: 1 hard, 2 good, 3 easy
    if (q === 1) return s.ivl < 1 ? 1 : Math.round(s.ivl * 1.2);
    if (q === 2) return s.ivl < 1 ? 1 : s.ivl < 3 ? 3 : Math.round(s.ivl * s.e);
    return s.ivl < 1 ? 2 : Math.max(2, Math.round(s.ivl * s.e * 1.3));
  }
  function schedule(c, q, now) { // q: 0 again, 1 hard, 2 good, 3 easy
    now = now == null ? Date.now() : now;
    var s = c.srs || (c.srs = newSRS());
    if (q === 0) {
      s.lapses++; s.e = Math.max(1.3, s.e - 0.2); s.ivl = 0; s.due = now + 10 * 60000;
      return s;
    }
    s.reps++;
    if (q === 1) s.e = Math.max(1.3, s.e - 0.15);
    if (q === 3) s.e += 0.15;
    // Easy applies the raised ease to this interval too.
    s.ivl = nextInterval(s, q);
    s.due = dayStart(new Date(now)) + s.ivl * DAY;
    return s;
  }
  function nextIvlLabel(c, q) {
    if (q === 0) return "10m";
    var s = c.srs || { e: 2.5, ivl: 0 };
    return nextInterval(s, q) + "d";
  }
  function buildQueue(pool, newCap, now) {
    now = now == null ? Date.now() : now;
    var due = pool.filter(function (c) { return !isFresh(c) && c.srs.due <= now; });
    return due.concat(pool.filter(isFresh).slice(0, newCap));
  }
  function bumpStreak(streak, today, yesterday) {
    if (streak.last === today) return streak;
    streak.count = streak.last === yesterday ? streak.count + 1 : 1;
    streak.last = today;
    return streak;
  }
  function shuffle(list, rnd) {
    var a = list.slice(); rnd = rnd || Math.random;
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(rnd() * (i + 1));
      var t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }
  g.HFSRS = { DAY: DAY, dayStart: dayStart, todayStr: todayStr, newSRS: newSRS, isFresh: isFresh, stageOf: stageOf,
    schedule: schedule, nextIvlLabel: nextIvlLabel, buildQueue: buildQueue, bumpStreak: bumpStreak, shuffle: shuffle };
})(typeof window !== "undefined" ? window : globalThis);
