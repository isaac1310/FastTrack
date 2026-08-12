/* FastTrack selftest — no framework, on purpose.
 *
 * Run: __selftest()  in the console, or open with ?dev=1
 * Results land on window.__selftest = {pass, skipped, fail, version, results}
 * so an agent reads the same run a human sees in the panel.
 *
 * READ-ONLY BY CONSTRUCTION. Every check runs against fixture arrays passed
 * into the pure functions. Nothing here writes to localStorage or touches the
 * live document — there is only one database and it holds data that exists
 * nowhere else.
 *
 * Helpers RETURN a description string instead of throwing, so one bad check
 * cannot abort the run.
 *
 * Assertions here are written for bugs that ACTUALLY SHIPPED. A suite that
 * only tests what was never broken is decoration.
 */
"use strict";

(function () {
  var results = [], currentGroup = "";

  function group(name) { currentGroup = name; }
  function check(name, fn) {
    var r;
    try { r = fn(); }
    catch (e) { r = "threw: " + ((e && e.message) || e); }
    if (r === true || r === undefined) results.push({ g: currentGroup, n: name, s: "pass" });
    else if (r && r.__skip) results.push({ g: currentGroup, n: name, s: "skip", why: r.__skip });
    else results.push({ g: currentGroup, n: name, s: "fail", why: String(r) });
  }
  function skip(why) { return { __skip: why }; }
  function eq(a, b, label) {
    if (a === b) return true;
    return (label || "") + " expected " + JSON.stringify(b) + ", got " + JSON.stringify(a);
  }
  function near(a, b, tol, label) {
    if (a === null || a === undefined || !isFinite(a)) return (label || "") + " not a number: " + a;
    if (Math.abs(a - b) <= tol) return true;
    return (label || "") + " expected ~" + b + " (±" + tol + "), got " + a;
  }
  function truthy(v, label) { return v ? true : (label || "value") + " was falsy: " + JSON.stringify(v); }
  function isNull(v, label) { return v === null ? true : (label || "value") + " expected null, got " + JSON.stringify(v); }

  /* ---------- fixtures ---------- */
  function series(startKg, slopePerDay, days, startDate) {
    var out = [], d0 = new Date((startDate || "2026-07-21") + "T12:00:00");
    var noise = [0.4, -0.3, 0.15, 0.6, -0.5, 0.2, -0.1, 0.45, -0.35, 0.05,
                 0.3, -0.6, 0.25, 0.1, -0.2, 0.5, -0.45, 0.15, 0.35, -0.25, 0.1, 0.4];
    for (var i = 0; i < days; i++) {
      var d = new Date(d0); d.setDate(d.getDate() + i);
      out.push({ date: FT.todayISO(d), kg: +(startKg + slopePerDay * i + noise[i % noise.length]).toFixed(1) });
    }
    return out;
  }
  var GOAL = { id: "g1", label: "פריז", date: "2026-09-18", targetKg: 70, deletedAt: null };

  function run() {
    results = [];

    /* ================= smoothing ================= */
    group("smoothWeights");
    check("empty input returns empty array", function () {
      return eq(JSON.stringify(FT.smoothWeights([])), "[]");
    });
    check("null input does not throw", function () {
      return eq(JSON.stringify(FT.smoothWeights(null)), "[]");
    });
    check("single point returns that point as its own trend", function () {
      var r = FT.smoothWeights([{ date: "2026-08-01", kg: 75 }]);
      return eq(r.length, 1, "length") === true ? eq(r[0].trend, 75, "trend") : eq(r.length, 1, "length");
    });
    check("drops malformed rows instead of producing NaN", function () {
      var r = FT.smoothWeights([{ date: "2026-08-01", kg: 75 }, { date: null, kg: 74 }, { kg: NaN, date: "2026-08-02" }]);
      return eq(r.length, 1, "length");
    });
    check("zero-phase: trend tracks the data, does not lag above it", function () {
      // A single forward EMA lags a falling series and draws the line ABOVE the
      // dots. That is what the forward+backward pass exists to prevent.
      var w = series(76, -0.13, 22);
      var sm = FT.smoothWeights(w);
      var err = 0;
      sm.forEach(function (p, i) { err += Math.abs(p.trend - (76 - 0.13 * i)); });
      return near(err / sm.length, 0, 0.25, "mean absolute lag");
    });
    check("gap-tolerant: a 7-day hole does not yank the line", function () {
      var w = [{ date: "2026-08-01", kg: 76 }, { date: "2026-08-08", kg: 75.8 }, { date: "2026-08-09", kg: 75.7 }];
      var sm = FT.smoothWeights(w);
      return sm.length === 3 && isFinite(sm[2].trend) ? true : "gap produced " + JSON.stringify(sm);
    });

    /* ================= trend fit / pace ================= */
    group("paceToGoal");
    check("slope is UNBIASED — recovers a known rate", function () {
      // Fitting the EMA instead of the raw points reported -0.46 on this exact
      // series when the truth is -0.91, i.e. "behind pace" while on pace.
      var w = series(76, -0.13, 22);
      var p = FT.paceToGoal(GOAL, w, "2026-08-11");
      return near(p.actualKgPerWeek, -0.91, 0.08, "actualKgPerWeek");
    });
    check("null goal returns null — no NaN with zero goals", function () {
      return isNull(FT.paceToGoal(null, series(76, -0.13, 10)));
    });
    check("no weights returns null", function () {
      return isNull(FT.paceToGoal(GOAL, []));
    });
    check("single weight: no slope, verdict unknown, no NaN", function () {
      var p = FT.paceToGoal(GOAL, [{ date: "2026-08-11", kg: 75 }], "2026-08-11");
      if (!p) return "expected a result object";
      if (p.actualKgPerWeek !== null) return "expected null rate, got " + p.actualKgPerWeek;
      if (p.verdict !== "unknown") return "expected unknown, got " + p.verdict;
      return isFinite(p.requiredKgPerWeek) ? true : "requiredKgPerWeek was " + p.requiredKgPerWeek;
    });
    check("daysLeft on the goal date itself is 0, not -1", function () {
      var p = FT.paceToGoal(GOAL, series(76, -0.13, 22), "2026-09-18");
      return eq(p.daysLeft, 0, "daysLeft");
    });
    check("verdict is 'behind' when the rate is too slow", function () {
      var p = FT.paceToGoal(GOAL, series(76, -0.02, 22), "2026-08-11");
      return eq(p.verdict, "behind", "verdict");
    });
    check("verdict is 'ahead' when the rate beats the goal", function () {
      var p = FT.paceToGoal(GOAL, series(76, -0.25, 22), "2026-08-11");
      return eq(p.verdict, "ahead", "verdict");
    });
    check("aggressive flag fires above 1.0 kg/week required", function () {
      var soon = { id: "g", date: "2026-08-25", targetKg: 70, deletedAt: null };
      var p = FT.paceToGoal(soon, series(76, -0.05, 22), "2026-08-11");
      return truthy(p.aggressive, "aggressive");
    });

    /* ================= goals ================= */
    group("nextGoal");
    var G_PAST = { id: "p", date: "2026-01-01", targetKg: 74, deletedAt: null };
    var G_DEL = { id: "d", date: "2026-08-20", targetKg: 72, deletedAt: "2026-08-01T00:00:00Z" };
    var G_LATE = { id: "l", date: "2026-12-31", targetKg: 66, deletedAt: null };

    check("empty list returns null", function () { return isNull(FT.nextGoal([], "2026-08-11")); });
    check("null list returns null", function () { return isNull(FT.nextGoal(null, "2026-08-11")); });
    check("skips past-dated goals", function () {
      return eq(FT.nextGoal([G_PAST, GOAL], "2026-08-11").id, "g1");
    });
    check("skips soft-deleted goals", function () {
      return eq(FT.nextGoal([G_DEL, GOAL], "2026-08-11").id, "g1");
    });
    check("returns the earliest of several", function () {
      return eq(FT.nextGoal([G_LATE, GOAL], "2026-08-11").id, "g1");
    });
    check("all goals in the past returns null (the state on 19 Sep)", function () {
      return isNull(FT.nextGoal([G_PAST], "2026-08-11"));
    });

    group("goalOutcome");
    check("reports a miss on a past goal", function () {
      var w = series(76, -0.05, 22);
      var g = { id: "x", date: "2026-08-01", targetKg: 70, deletedAt: null };
      var oc = FT.goalOutcome(g, w);
      return oc && oc.hit === false ? true : "expected a miss, got " + JSON.stringify(oc);
    });
    check("reports a hit on a past goal", function () {
      var w = series(76, -0.30, 22);
      var g = { id: "x", date: "2026-08-05", targetKg: 74, deletedAt: null };
      var oc = FT.goalOutcome(g, w);
      return oc && oc.hit === true ? true : "expected a hit, got " + JSON.stringify(oc);
    });
    check("future goal has no outcome yet", function () {
      return isNull(FT.goalOutcome(GOAL, series(76, -0.13, 22)));
    });
    check("later weight loss cannot retro-fix a missed goal", function () {
      var w = series(76, -0.02, 10, "2026-07-01").concat(series(70, -0.5, 12, "2026-07-20"));
      var g = { id: "x", date: "2026-07-10", targetKg: 70, deletedAt: null };
      var oc = FT.goalOutcome(g, w);
      return oc && oc.hit === false ? true : "a later drop leaked backwards: " + JSON.stringify(oc);
    });

    group("goal validation");
    check("rejects out-of-band target rather than clamping", function () {
      return FT.validGoalWeight(500) === false && FT.validGoalWeight(10) === false &&
        FT.validGoalWeight(70) === true ? true : "band check wrong";
    });

    /* ================= weight entry / edit ================= */
    group("upsertWeight");
    var W_BASE = [
      { date: "2026-08-01", kg: 76 },
      { date: "2026-08-03", kg: 75.5 }
    ];
    check("adds a new date and keeps the list sorted", function () {
      var r = FT.upsertWeight(W_BASE, "2026-08-02", 75.8);
      if (r.weights.length !== 3) return "expected 3, got " + r.weights.length;
      var dates = r.weights.map(function (w) { return w.date; });
      return eq(dates.join(","), "2026-08-01,2026-08-02,2026-08-03", "order");
    });
    check("same date REPLACES, never duplicates", function () {
      var r = FT.upsertWeight(W_BASE, "2026-08-01", 74.2);
      if (r.weights.length !== 2) return "duplicated: got " + r.weights.length + " rows";
      var hit = r.weights.filter(function (w) { return w.date === "2026-08-01"; });
      return eq(hit[0].kg, 74.2, "value");
    });
    check("returns what it displaced, so undo has something to restore", function () {
      var r = FT.upsertWeight(W_BASE, "2026-08-01", 74.2);
      return r.replaced && r.replaced.kg === 76 ? true : "replaced was " + JSON.stringify(r.replaced);
    });
    check("returns null replaced on a fresh date", function () {
      return isNull(FT.upsertWeight(W_BASE, "2026-08-09", 75).replaced, "replaced");
    });
    check("does not mutate the array it was given", function () {
      var orig = W_BASE.slice(), len = W_BASE.length;
      FT.upsertWeight(W_BASE, "2026-08-05", 75);
      return W_BASE.length === len && W_BASE[0].kg === orig[0].kg
        ? true : "input array was mutated";
    });
    check("never produces two rows on one date", function () {
      var w = W_BASE;
      ["2026-08-01", "2026-08-01", "2026-08-03", "2026-08-01"].forEach(function (d, i) {
        w = FT.upsertWeight(w, d, 70 + i).weights;
      });
      var seen = {}, dup = null;
      w.forEach(function (x) { if (seen[x.date]) dup = x.date; seen[x.date] = 1; });
      return dup ? "duplicate date survived: " + dup : true;
    });

    group("moveWeight");
    check("moves an entry to a free date", function () {
      var r = FT.moveWeight(W_BASE, "2026-08-01", "2026-07-30", 76);
      if (r.merged) return "reported a merge when the target was free";
      var dates = r.weights.map(function (w) { return w.date; }).join(",");
      return eq(dates, "2026-07-30,2026-08-03", "dates");
    });
    check("moving onto an occupied date merges, leaving one row", function () {
      var r = FT.moveWeight(W_BASE, "2026-08-01", "2026-08-03", 74);
      if (!r.merged) return "merge not reported";
      if (r.weights.length !== 1) return "expected 1 row, got " + r.weights.length;
      return eq(r.weights[0].kg, 74, "surviving value");
    });
    check("editing value only, same date, keeps one row", function () {
      var r = FT.moveWeight(W_BASE, "2026-08-01", "2026-08-01", 75.1);
      if (r.weights.length !== 2) return "expected 2 rows, got " + r.weights.length;
      return eq(r.weights[0].kg, 75.1, "value");
    });

    group("date guards");
    check("future dates are rejected", function () {
      if (FT.isFutureDate("2026-08-12", "2026-08-11") !== true) return "tomorrow was allowed";
      if (FT.isFutureDate("2026-08-11", "2026-08-11") !== false) return "today was rejected";
      if (FT.isFutureDate("2026-08-10", "2026-08-11") !== false) return "yesterday was rejected";
      return true;
    });
    check("a backfilled past weigh-in reaches the trend fit", function () {
      var w = FT.upsertWeight(series(76, -0.13, 5), "2026-07-15", 77).weights;
      var sm = FT.smoothWeights(w);
      return eq(sm[0].date, "2026-07-15", "earliest point after backfill");
    });

    /* ================= composition ================= */
    group("compositionSignal");
    var W3 = series(76, -0.13, 22);
    check("refuses below 3 on-protocol points, and says why", function () {
      var r = FT.compositionSignal(W3, [
        { date: "2026-07-21", waistCm: 98, thighCm: 58, onProtocol: true },
        { date: "2026-08-04", waistCm: 96, thighCm: 57, onProtocol: true }
      ]);
      return r.status === "insufficient" && r.reason ? true : "expected refusal, got " + JSON.stringify(r);
    });
    check("refuses under a 2-week span", function () {
      var r = FT.compositionSignal(W3, [
        { date: "2026-08-01", waistCm: 98, thighCm: 58, onProtocol: true },
        { date: "2026-08-04", waistCm: 97, thighCm: 58, onProtocol: true },
        { date: "2026-08-07", waistCm: 96, thighCm: 57, onProtocol: true }
      ]);
      return r.status === "insufficient" ? true : "expected refusal, got " + r.status;
    });
    check("off-protocol measurements are excluded from the verdict", function () {
      var m = [
        { date: "2026-07-21", waistCm: 98, thighCm: 58, onProtocol: true },
        { date: "2026-07-28", waistCm: 97, thighCm: 58, onProtocol: true },
        { date: "2026-08-04", waistCm: 96, thighCm: 57, onProtocol: true },
        { date: "2026-08-05", waistCm: 120, thighCm: 70, onProtocol: false } // absurd, must not count
      ];
      var r = FT.compositionSignal(W3, m);
      return near(r.waistDelta, -2, 0.01, "waistDelta (off-protocol leaked in?)");
    });
    check("flags weight falling while waist stays flat", function () {
      var m = [
        { date: "2026-07-21", waistCm: 98, thighCm: 58, onProtocol: true },
        { date: "2026-07-28", waistCm: 98, thighCm: 58, onProtocol: true },
        { date: "2026-08-04", waistCm: 97.9, thighCm: 58, onProtocol: true }
      ];
      return eq(FT.compositionSignal(W3, m).status, "flag", "status");
    });
    check("reports fat loss when both fall together", function () {
      var m = [
        { date: "2026-07-21", waistCm: 98, thighCm: 58, onProtocol: true },
        { date: "2026-07-28", waistCm: 97, thighCm: 57.6, onProtocol: true },
        { date: "2026-08-04", waistCm: 96, thighCm: 57.5, onProtocol: true }
      ];
      return eq(FT.compositionSignal(W3, m).status, "fat", "status");
    });

    group("implausibleWaistDelta");
    check("fires at 3.5cm, silent at 2cm", function () {
      if (FT.implausibleWaistDelta(96, 99.5) !== true) return "3.5cm did not fire";
      if (FT.implausibleWaistDelta(96, 98) !== false) return "2cm fired when it should not";
      return true;
    });

    /* ================= phases ================= */
    group("phases");
    var BOUNDS = [0, 4, 12, 16, 24, 36, 72];
    check("every boundary hour lands in the phase that STARTS there", function () {
      for (var i = 0; i < BOUNDS.length; i++) {
        var p = FT.getPhase(BOUNDS[i]);
        if (p.from !== BOUNDS[i]) return "hour " + BOUNDS[i] + " landed in phase starting at " + p.from;
      }
      return true;
    });
    check("just below a boundary stays in the previous phase", function () {
      return eq(FT.getPhase(15.99).from, 12, "15.99h");
    });
    check("negative and non-finite hours do not throw", function () {
      return FT.getPhase(-5) && FT.getPhase(NaN) ? true : "returned nothing";
    });
    check("timeToNextPhase counts down correctly", function () {
      return near(FT.timeToNextPhase(15.5), 0.5, 0.001, "at 15.5h");
    });
    check("timeToNextPhase returns null in the final phase", function () {
      return isNull(FT.timeToNextPhase(100), "at 100h");
    });
    check("every phase has non-empty now/fuel/hormones/feel/helps", function () {
      for (var i = 0; i < FT.PHASES.length; i++) {
        var p = FT.PHASES[i];
        var keys = ["now", "fuel", "hormones", "feel", "helps"];
        for (var k = 0; k < keys.length; k++) {
          if (!p[keys[k]] || !String(p[keys[k]]).trim()) {
            return "phase '" + p.label + "' has empty " + keys[k] + " — would render blank";
          }
        }
      }
      return true;
    });
    check("24h+ phases carry a non-null caution", function () {
      for (var i = 0; i < FT.PHASES.length; i++) {
        if (FT.PHASES[i].from >= 24 && !FT.PHASES[i].caution) {
          return "phase '" + FT.PHASES[i].label + "' (" + FT.PHASES[i].from + "h+) has no caution";
        }
      }
      return true;
    });
    check("no phase states an autophagy hour as established fact", function () {
      // Human autophagy timing is not established; most cited hour-figures
      // come from rodent studies. Claiming one is the standard fasting-app error.
      var bad = [];
      FT.PHASES.forEach(function (p) {
        var blob = [p.now, p.fuel, p.hormones, p.feel, p.helps].join(" ");
        if (/אוטופגיה|אוטופאגיה/.test(blob)) {
          if (!/לא ידוע|לא נקבע|עדיין|משתנה|חולדות/.test(blob)) {
            bad.push(p.label);
          }
        }
      });
      return bad.length ? "unqualified autophagy claim in: " + bad.join(", ") : true;
    });

    /* ================= fast history ================= */
    group("fastStats");
    check("zero fasts returns zeros, not NaN", function () {
      var s = FT.fastStats([]);
      return s.count === 0 && s.longestHours === 0 && s.avg7Hours === null && s.streakDays === 0
        ? true : "got " + JSON.stringify(s);
    });
    check("malformed rows are ignored", function () {
      var s = FT.fastStats([{ start: 1, end: null }, { start: NaN, end: 5 }]);
      return eq(s.count, 0, "count");
    });
    check("end-before-start is ignored", function () {
      var s = FT.fastStats([{ start: 1000, end: 500 }]);
      return eq(s.count, 0, "count");
    });
    check("one fast reports its own length as longest", function () {
      var now = Date.parse("2026-08-11T12:00:00Z");
      var s = FT.fastStats([{ start: now - 16 * 3600000, end: now }], now);
      return near(s.longestHours, 16, 0.01, "longestHours");
    });
    check("a fast spanning midnight is counted once", function () {
      var now = Date.parse("2026-08-11T12:00:00Z");
      var s = FT.fastStats([{ start: Date.parse("2026-08-10T20:00:00Z"), end: Date.parse("2026-08-11T10:00:00Z") }], now);
      return eq(s.count, 1, "count");
    });

    /* ================= migration ================= */
    group("migration");
    check("v1 entries become v2 weights, losing nothing", function () {
      var v1 = [{ date: "2026-08-01", weight: 76 }, { date: "2026-08-08", weight: 75.2 }];
      var r = FT.migrate(null, v1, null);
      if (!r.doc) return "no doc: " + r.error;
      if (r.doc.weights.length !== 2) return "expected 2 weights, got " + r.doc.weights.length;
      if (r.doc.weights[0].kg !== 76) return "kg not carried over";
      return truthy(r.migrated, "migrated flag");
    });
    check("v1 hardcoded goal constants become editable goal rows", function () {
      var r = FT.migrate(null, [{ date: "2026-08-01", weight: 76 }], null);
      return r.doc && r.doc.goals.length >= 2 ? true : "goals not seeded: " + JSON.stringify(r.doc && r.doc.goals);
    });
    check("v1 session is carried over", function () {
      var r = FT.migrate(null, null, { start: 1760000000000, protocolHours: 16 });
      return r.doc && r.doc.session && r.doc.session.start === 1760000000000
        ? true : "session lost: " + JSON.stringify(r.doc && r.doc.session);
    });
    check("a NEWER schemaVersion refuses and preserves the raw blob", function () {
      var raw = JSON.stringify({ schemaVersion: 99, weights: [{ date: "2026-08-01", kg: 70 }] });
      var r = FT.migrate(raw, null, null);
      if (r.doc) return "it imported instead of refusing";
      if (!r.error) return "refused without saying why";
      return truthy(r.rawPreserved, "rawPreserved");
    });
    check("unparseable JSON refuses rather than wiping", function () {
      var r = FT.migrate("{not json", null, null);
      return r.doc === null && r.error ? true : "expected a refusal";
    });
    check("a current-version doc round-trips unchanged", function () {
      var d = FT.emptyDoc();
      d.weights = [{ date: "2026-08-01", kg: 75 }];
      var r = FT.migrate(JSON.stringify(d), null, null);
      return r.doc && r.doc.weights.length === 1 ? true : "round-trip lost data";
    });
    check("normalizeDoc repairs missing arrays instead of throwing later", function () {
      var r = FT.normalizeDoc({ schemaVersion: 2 });
      return Array.isArray(r.goals) && Array.isArray(r.weights) && Array.isArray(r.measures) &&
        Array.isArray(r.fastHistory) ? true : "arrays not repaired";
    });
    check("a session with a non-finite start is discarded", function () {
      var r = FT.normalizeDoc({ schemaVersion: 2, session: { start: "banana" } });
      return isNull(r.session, "session");
    });

    /* ================= backup ================= */
    group("backup nudge");
    check("fires above 10 days, silent at 9", function () {
      var now = Date.parse("2026-08-11T12:00:00Z");
      var d9 = new Date(now - 9 * 86400000).toISOString();
      var d11 = new Date(now - 11 * 86400000).toISOString();
      if (FT.backupStale(d11, now) !== true) return "11 days did not fire";
      if (FT.backupStale(d9, now) !== false) return "9 days fired early";
      return true;
    });
    check("never exported counts as stale", function () {
      return eq(FT.backupStale(null, Date.now()), true);
    });

    /* ================= storage ================= */
    group("storage");
    check("lsSet reports failure instead of throwing", function () {
      // Not writable in this environment? Then this check must SAY so, not pass silently.
      var real = window.localStorage;
      var threw = false, returned;
      try {
        Object.defineProperty(window, "localStorage", {
          configurable: true,
          get: function () { return { setItem: function () { throw new Error("QuotaExceeded"); } }; }
        });
        returned = FT.lsSet("__ft_probe", "x");
      } catch (e) { threw = true; }
      finally {
        Object.defineProperty(window, "localStorage", { configurable: true, get: function () { return real; } });
      }
      if (threw) return "lsSet threw instead of returning false";
      return eq(returned, false, "return value");
    });

    /* ================= DOM guards ================= */
    group("DOM");
    var inApp = !!document.getElementById("app") && !!document.querySelector(".wrap");
    check("RTL is scoped to the document, content is Hebrew", function () {
      if (!inApp) return skip("not running inside the app page");
      var h = document.documentElement;
      if (h.getAttribute("dir") !== "rtl") return "html dir is not rtl";
      if (h.getAttribute("lang") !== "he") return "html lang is not he";
      return true;
    });
    check("heading font resolves to Rubik, not a Times fallback", function () {
      if (!inApp) return skip("not running inside the app page");
      var el = document.querySelector(".cardTitle") || document.querySelector(".name");
      if (!el) return skip("no heading rendered yet");
      var ff = getComputedStyle(el).fontFamily;
      if (!/Rubik/i.test(ff)) return "font-family is '" + ff + "' — the stack collapsed";
      if (!document.fonts.check("16px Rubik", "מדריך")) return "Rubik is loaded but has no Hebrew coverage";
      return true;
    });
    check("every rendered number is bidi-isolated", function () {
      if (!inApp) return skip("not running inside the app page");
      var els = document.querySelectorAll(".n");
      if (!els.length) return skip("nothing numeric rendered yet");
      for (var i = 0; i < els.length; i++) {
        var cs = getComputedStyle(els[i]);
        if (cs.direction !== "ltr") return "a .n element is not direction:ltr — a leading minus will flip";
        if (cs.unicodeBidi.indexOf("isolate") === -1) return "a .n element is not unicode-bidi:isolate";
      }
      return true;
    });
    check("no Hebrew text inside any SVG", function () {
      if (!inApp) return skip("not running inside the app page");
      var texts = document.querySelectorAll("svg text");
      for (var i = 0; i < texts.length; i++) {
        if (/[֐-׿]/.test(texts[i].textContent)) {
          return "Hebrew found in <svg><text> — it stretches under preserveAspectRatio";
        }
      }
      return true;
    });
    check("phone-width layout is single column", function () {
      if (!inApp) return skip("not running inside the app page");
      if (window.innerWidth >= 768) return skip("viewport is " + window.innerWidth + "px — run again at 412px");
      var cols = getComputedStyle(document.getElementById("app")).gridTemplateColumns;
      return cols === "none" ? true : "expected no grid at phone width, got " + cols;
    });
    check("desktop layout is two columns", function () {
      if (!inApp) return skip("not running inside the app page");
      if (window.innerWidth < 768) return skip("viewport is " + window.innerWidth + "px — run again at 1280px");
      var cols = getComputedStyle(document.getElementById("app")).gridTemplateColumns;
      return /\s/.test(cols) ? true : "expected two columns, got " + cols;
    });

    /* ---------- tally ---------- */
    var pass = results.filter(function (r) { return r.s === "pass"; }).length;
    var fail = results.filter(function (r) { return r.s === "fail"; }).length;
    var skipped = results.filter(function (r) { return r.s === "skip"; }).length;

    /* window.__selftest is the runner AND carries the last run's results,
       so both `__selftest()` and `window.__selftest.fail` work. Assigning a
       plain object here would clobber the function after the first run. */
    window.__selftest.version = FT.APP_VERSION;
    window.__selftest.pass = pass;
    window.__selftest.fail = fail;
    window.__selftest.skipped = skipped;
    window.__selftest.results = results;
    window.__selftest.summary = pass + " passed, " + fail + " failed, " + skipped + " skipped";

    panel();
    /* Never call a run green when checks skipped. */
    console.log("%cFastTrack selftest v" + FT.APP_VERSION + " — " + window.__selftest.summary,
      "font-weight:bold;color:" + (fail ? "#F08B70" : skipped ? "#E0B75C" : "#7FC79B"));
    results.forEach(function (r) {
      if (r.s === "fail") console.error("FAIL [" + r.g + "] " + r.n + " — " + r.why);
      else if (r.s === "skip") console.warn("SKIP [" + r.g + "] " + r.n + " — " + r.why);
    });
    return window.__selftest;
  }

  function panel() {
    var old = document.getElementById("selftestPanel");
    if (old) old.remove();
    var st = window.__selftest;
    var color = st.fail ? "#F08B70" : (st.skipped ? "#E0B75C" : "#7FC79B");
    var rows = "";
    var lastG = "";
    st.results.forEach(function (r) {
      if (r.g !== lastG) {
        lastG = r.g;
        rows += '<div style="color:#A8B0B6;font-size:11px;letter-spacing:.08em;text-transform:uppercase;margin:10px 0 4px">' + r.g + '</div>';
      }
      var c = r.s === "pass" ? "#7FC79B" : (r.s === "skip" ? "#E0B75C" : "#F08B70");
      var mark = r.s === "pass" ? "✓" : (r.s === "skip" ? "–" : "✕");
      rows += '<div style="display:flex;gap:8px;padding:2px 0;font-size:12px;line-height:1.45">' +
        '<span style="color:' + c + ';flex:0 0 12px">' + mark + '</span>' +
        '<span style="color:#EDEAE0">' + r.n +
        (r.why ? '<span style="color:' + c + ';display:block">' + r.why + '</span>' : '') +
        '</span></div>';
    });

    var d = document.createElement("div");
    d.id = "selftestPanel";
    d.setAttribute("dir", "ltr");
    d.style.cssText = "position:fixed;inset-block:0;inset-inline-end:0;width:min(420px,92vw);z-index:9999;" +
      "background:#12161A;border-inline-start:1px solid #2E353B;overflow:auto;padding:16px;" +
      "font-family:ui-monospace,Menlo,monospace;box-shadow:-8px 0 30px rgba(0,0,0,.6);";
    d.innerHTML =
      '<div style="display:flex;justify-content:space-between;align-items:center;gap:8px">' +
      '<b style="color:' + color + ';font-size:14px">selftest v' + st.version + '</b>' +
      '<button id="selftestClose" style="background:#252B30;border:1px solid #2E353B;color:#EDEAE0;' +
      'border-radius:8px;padding:4px 10px;cursor:pointer;font-family:inherit">close</button></div>' +
      '<div style="color:' + color + ';font-size:13px;margin-top:6px">' + st.summary + '</div>' +
      (st.skipped ? '<div style="color:#E0B75C;font-size:11px;margin-top:4px">' +
        'skipped checks are not passes — see the reasons below</div>' : '') +
      '<div style="margin-top:8px">' + rows + '</div>';
    document.body.appendChild(d);
    document.getElementById("selftestClose").onclick = function () { d.remove(); };
  }

  window.__selftest = run;
  window.__selftest_run = run;

  if (new URLSearchParams(location.search).get("dev") === "1" || window.__DEV) {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", function () { setTimeout(run, 300); });
    } else { setTimeout(run, 300); }
  }
})();
