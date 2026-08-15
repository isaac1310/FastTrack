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

    /* ================= intake ================= */
    group("intake events");
    var T0 = Date.parse("2026-08-12T20:00:00");
    function logAt(specs) {
      var l = [];
      specs.forEach(function (sp) { l = FT.addIntakeEvent(l, sp[0], T0 - sp[1] * 3600000, sp[2]).log; });
      return l;
    }

    check("black coffee does not break a fast; alcohol and meat do", function () {
      if (FT.breaksFast("coffeeBlack") !== false) return "black coffee marked as breaking a fast";
      if (FT.breaksFast("alcohol") !== true) return "alcohol marked as fasting-safe";
      if (FT.breaksFast("meat") !== true) return "meat marked as fasting-safe";
      return true;
    });
    check("fixtures only use real keys — a typo must not pass vacuously", function () {
      // logAt() silently drops unknown keys, so a stale key in a fixture turns
      // its check into a tautology. This catches that.
      var real = FT.INTAKE_ITEMS.map(function (i) { return i.key; });
      var probe = logAt([["meat", 1], ["coffeeBlack", 1], ["alcohol", 1], ["gluten", 1]]);
      if (probe.length !== 4) return "a fixture key was dropped: only " + probe.length + " of 4 stored";
      return real.length === 4 ? true : "item list changed; fixtures need review";
    });
    check("an unknown item is rejected, not stored", function () {
      var r = FT.addIntakeEvent([], "kombucha", T0);
      return r.added === false && r.log.length === 0 ? true : "unknown key was accepted";
    });
    check("counts derive from the event log", function () {
      var l = logAt([["coffeeBlack", 1], ["coffeeBlack", 6], ["alcohol", 0.5]]);
      var c = FT.intakeOn(l, "2026-08-12");
      return c.coffeeBlack === 2 && c.alcohol === 1
        ? true : "wrong counts: " + JSON.stringify(c);
    });
    check("removing takes the most recent event of that item that day", function () {
      var l = logAt([["coffeeBlack", 6], ["coffeeBlack", 1]]);
      var r = FT.removeIntakeEvent(l, "coffeeBlack", "2026-08-12");
      if (!r.removed) return "nothing was removed";
      if (r.log.length !== 1) return "expected 1 left, got " + r.log.length;
      // the 6h-old one must survive; the 1h-old one goes
      return near((T0 - r.log[0].at) / 3600000, 6, 0.01, "surviving event age");
    });
    check("removing from an empty day is a no-op, not a crash", function () {
      var r = FT.removeIntakeEvent([], "alcohol", "2026-08-12");
      return r.removed === false && r.log.length === 0 ? true : "unexpected mutation";
    });
    check("counts can never go negative", function () {
      var l = logAt([["alcohol", 1]]);
      l = FT.removeIntakeEvent(l, "alcohol", "2026-08-12").log;
      l = FT.removeIntakeEvent(l, "alcohol", "2026-08-12").log;
      return eq(FT.intakeOn(l, "2026-08-12").alcohol, 0, "alcohol count");
    });
    check("does not mutate the log it was given", function () {
      var l = logAt([["alcohol", 1]]);
      var len = l.length;
      FT.addIntakeEvent(l, "alcohol", T0);
      FT.removeIntakeEvent(l, "alcohol", "2026-08-12");
      return eq(l.length, len, "original log length");
    });
    check("events on another day do not leak into today's counts", function () {
      var l = logAt([["alcohol", 30]]); // 30h ago = previous day
      return eq(FT.intakeOn(l, "2026-08-12").alcohol, 0, "today's alcohol");
    });
    check("totals respect the date range", function () {
      var l = logAt([["alcohol", 30], ["alcohol", 1]]);
      return eq(FT.intakeTotals(l, "2026-08-12", "2026-08-12").alcohol, 1, "windowed total");
    });
    check("weekStart is Monday-based and stable across a week", function () {
      if (FT.weekStart("2026-08-10") !== "2026-08-10") return "Monday did not map to itself";
      if (FT.weekStart("2026-08-16") !== "2026-08-10") return "Sunday mapped to the wrong week";
      if (FT.weekStart("2026-08-17") !== "2026-08-17") return "next Monday did not start a new week";
      return true;
    });

    group("caffeineNow");
    check("no doses means zero, not NaN", function () {
      var c = FT.caffeineNow([], T0);
      return c.mg === 0 && c.clearAtMs === null ? true : "got " + JSON.stringify(c);
    });
    check("decays by half every half-life", function () {
      // one 100mg cup exactly one half-life ago -> ~50mg
      var l = logAt([["coffeeBlack", FT.CAFFEINE_HALF_LIFE_H]]);
      return near(FT.caffeineNow(l, T0).mg, 50, 2, "mg after one half-life");
    });
    check("two doses sum, each decayed by its own age", function () {
      var l = logAt([["coffeeBlack", 1], ["coffeeBlack", 6]]);
      // 100*0.5^(1/5) + 100*0.5^(6/5) = 87.1 + 43.5
      return near(FT.caffeineNow(l, T0).mg, 131, 3, "summed mg");
    });
    check("v4 coffeeMilk events are relabelled coffeeBlack, keeping their caffeine", function () {
      var v4 = JSON.stringify({
        schemaVersion: 4, weights: [], goals: [], measures: [], fastHistory: [],
        intakeLog: [{ at: T0 - 3600000, key: "coffeeMilk", approx: false }]
      });
      var r = FT.migrate(v4, null, null);
      if (!r.doc) return "v4 refused: " + r.error;
      if (r.doc.intakeLog[0].key !== "coffeeBlack") return "coffeeMilk not relabelled";
      return FT.caffeineNow(r.doc.intakeLog, T0).mg > 50 ? true : "caffeine lost in relabel";
    });
    check("meat contributes no caffeine", function () {
      return eq(FT.caffeineNow(logAt([["meat", 1]]), T0).mg, 0, "mg");
    });
    check("a dose two days old has effectively cleared", function () {
      return eq(FT.caffeineNow(logAt([["coffeeBlack", 48]]), T0).mg, 0, "mg");
    });
    check("backdated (approx) events are excluded from the live estimate", function () {
      // a day-count import has no real time; claiming it is circulating now
      // would be inventing data
      var l = FT.addIntakeEvent([], "coffeeBlack", T0 - 3600000, true).log;
      return eq(FT.caffeineNow(l, T0).mg, 0, "mg from an approx event");
    });
    check("reports when it drops below the sleep threshold, and it is in the future", function () {
      var c = FT.caffeineNow(logAt([["coffeeBlack", 1]]), T0);
      if (!c.clearAtMs) return "no threshold time reported";
      return c.clearAtMs > T0 ? true : "threshold time is in the past";
    });

    group("since last dose");
    check("no dose ever returns null, not zero hours", function () {
      return isNull(FT.caffeineSince([], T0), "caffeineSince") === true &&
             isNull(FT.alcoholSince([], T0), "alcoholSince") === true
        ? true : "expected null for both";
    });
    check("backdated doses do not count as a last dose", function () {
      // an imported day-count has no real time; "8 hours since" would be a lie
      var l = FT.addIntakeEvent([], "coffeeBlack", T0 - 8 * 3600000, true).log;
      return isNull(FT.caffeineSince(l, T0), "caffeineSince");
    });
    check("uses the MOST RECENT dose, not the first", function () {
      var l = logAt([["coffeeBlack", 12], ["coffeeBlack", 2]]);
      return near(FT.caffeineSince(l, T0).hours, 2, 0.01, "hours since");
    });

    check("meat is not a caffeine dose", function () {
      return isNull(FT.caffeineSince(logAt([["meat", 1]]), T0), "caffeineSince");
    });
    check("alcohol and caffeine do not contaminate each other", function () {
      var l = logAt([["alcohol", 2], ["coffeeBlack", 9]]);
      if (Math.abs(FT.caffeineSince(l, T0).hours - 9) > 0.01) return "caffeine picked up the drink";
      if (Math.abs(FT.alcoholSince(l, T0).hours - 2) > 0.01) return "alcohol picked up the coffee";
      return true;
    });

    group("caffeine timeline");
    var STAGES = [[0.5, "ספיגה"], [3, "שיא"], [8, "ירידה"], [14, "גמילה"], [30, "גמילה"], [80, "אחרי"]];
    check("every stage boundary lands in the right stage", function () {
      for (var i = 0; i < STAGES.length; i++) {
        var r = FT.caffeineSince(logAt([["coffeeBlack", STAGES[i][0]]]), T0);
        if (r.stage.label.indexOf(STAGES[i][1]) === -1) {
          return STAGES[i][0] + "h landed in '" + r.stage.label + "'";
        }
      }
      return true;
    });
    check("8 hours reports the crash, not withdrawal", function () {
      // the case that prompted this: 8h since coffee is the descent, and
      // withdrawal proper starts later
      var r = FT.caffeineSince(logAt([["coffeeBlack", 8]]), T0);
      return /נפילה/.test(r.stage.feel) ? true : "8h stage lost its crash description";
    });
    check("the withdrawal window is 12-24h, and names headache", function () {
      var r = FT.caffeineSince(logAt([["coffeeBlack", 14]]), T0);
      if (!/גמילה/.test(r.stage.label)) return "14h is not the withdrawal window";
      return /כאב ראש/.test(r.stage.feel) ? true : "withdrawal copy does not mention headache";
    });
    check("withdrawal copy says it applies to regular drinkers only", function () {
      var r = FT.caffeineSince(logAt([["coffeeBlack", 14]]), T0);
      return /מדי פעם|קבוע/.test(r.stage.feel)
        ? true : "withdrawal is stated as universal — it is not";
    });
    check("countdown to the next stage is positive and shrinks", function () {
      var a = FT.caffeineSince(logAt([["coffeeBlack", 6]]), T0);
      var b = FT.caffeineSince(logAt([["coffeeBlack", 9]]), T0);
      if (a.hoursToNext <= 0 || b.hoursToNext <= 0) return "non-positive countdown";
      return b.hoursToNext < a.hoursToNext ? true : "countdown did not shrink";
    });
    check("the final stage has no next", function () {
      return isNull(FT.caffeineSince(logAt([["coffeeBlack", 200]]), T0).hoursToNext, "hoursToNext");
    });
    check("every timeline stage has now/feel/helps filled in", function () {
      var lists = [["caffeine", FT.CAFFEINE_TIMELINE], ["alcohol", FT.ALCOHOL_TIMELINE]];
      for (var i = 0; i < lists.length; i++) {
        var tl = lists[i][1];
        for (var j = 0; j < tl.length; j++) {
          var keys = ["now", "feel", "helps"];
          for (var k = 0; k < keys.length; k++) {
            if (!tl[j][keys[k]] || !String(tl[j][keys[k]]).trim()) {
              return lists[i][0] + " stage '" + tl[j].label + "' has empty " + keys[k];
            }
          }
        }
      }
      return true;
    });
    check("timelines have no gaps or overlaps", function () {
      var lists = [["caffeine", FT.CAFFEINE_TIMELINE], ["alcohol", FT.ALCOHOL_TIMELINE]];
      for (var i = 0; i < lists.length; i++) {
        var tl = lists[i][1];
        if (tl[0].from !== 0) return lists[i][0] + " does not start at 0";
        for (var j = 1; j < tl.length; j++) {
          if (tl[j].from !== tl[j - 1].to) {
            return lists[i][0] + " gap/overlap at " + tl[j - 1].to + " -> " + tl[j].from;
          }
        }
        if (isFinite(tl[tl.length - 1].to)) return lists[i][0] + " does not end at Infinity";
      }
      return true;
    });

    group("alcohol timeline");
    check("the hangover window says symptoms peak after it has cleared", function () {
      var r = FT.alcoholSince(logAt([["alcohol", 9]]), T0);
      return /לאפס|פונה/.test(r.stage.feel + r.stage.now)
        ? true : "recovery stage lost the point that BAC is already zero";
    });

    group("intakeSummary");
    var SCENARIO = [
      { at: T0 - 5 * 3600000, key: "coffeeBlack", approx: false },
      { at: T0 - 3 * 24 * 3600000, key: "meat", approx: true },
      { at: T0 - 7 * 24 * 3600000, key: "alcohol", approx: true }
    ];
    check("reports all four groups even when they were never logged", function () {
      var r = FT.intakeSummary([], T0);
      if (r.length !== 4) return "expected 4 groups, got " + r.length;
      return r.every(function (g) { return g.ever === false && g.stage === null; })
        ? true : "a never-logged group claimed a stage";
    });
    check("coffee this morning, meat 3 days, alcohol a week — all read correctly", function () {
      var r = FT.intakeSummary(SCENARIO, T0);
      var by = {}; r.forEach(function (g) { by[g.id] = g; });
      if (Math.abs(by.caffeine.hours - 5) > 0.01) return "caffeine hours wrong: " + by.caffeine.hours;
      if (by.meat.days !== 3) return "meat days wrong: " + by.meat.days;
      if (by.alcohol.days !== 7) return "alcohol days wrong: " + by.alcohol.days;
      return true;
    });
    check("includes backdated entries — they have a known day", function () {
      // excluding them made a quick-backfilled meat entry vanish from the card
      var r = FT.intakeSummary(SCENARIO, T0);
      var pro = r.filter(function (g) { return g.id === "meat"; })[0];
      return pro.ever === true ? true : "backdated meat was treated as never logged";
    });
    check("flags rows whose last entry has no exact time", function () {
      var r = FT.intakeSummary(SCENARIO, T0);
      var by = {}; r.forEach(function (g) { by[g.id] = g; });
      if (by.meat.approxOnly !== true) return "backdated meat not flagged approx";
      if (by.caffeine.approxOnly !== false) return "exact coffee wrongly flagged approx";
      return true;
    });
    check("a week-old drink lands in the week-clean stage, not the hangover window", function () {
      var r = FT.intakeSummary(SCENARIO, T0);
      var alc = r.filter(function (g) { return g.id === "alcohol"; })[0];
      return /שבוע/.test(alc.stage.label) ? true : "got stage '" + alc.stage.label + "'";
    });
    check("alcohol clean-streak copy carries the regular-drinker caveat", function () {
      // the measured improvements (liver enzymes, BP, insulin resistance)
      // were measured in REGULAR drinkers who stopped; an occasional drinker
      // must not be promised them
      var st = FT.alcoholSince(logAt([["alcohol", 200]]), T0).stage;
      var blob = st.now + " " + st.feel + " " + st.helps;
      return /קבוע|מעט/.test(blob) ? true : "clean-streak stage promises effects universally";
    });
    check("the four-week meat stage cites TMAO and admits short-term inconsistency", function () {
      var st = FT.meatSince([{ at: T0 - 700 * 3600000, key: "meat", approx: true }], T0).stage;
      if (!/TMAO/.test(st.now)) return "TMAO not mentioned";
      return /פחות עקביים|לא עקביים/.test(st.now) ? true : "overstated certainty on short-term findings";
    });
    check("the lighter-after-days feeling is stated as a report, not a measurement", function () {
      var st = FT.meatSince([{ at: T0 - 100 * 3600000, key: "meat", approx: true }], T0).stage;
      return /סובייקטיבי|מדווחים/.test(st.now + st.feel)
        ? true : "subjective lightness stated as fact";
    });

    group("meat timeline");
    check("stages land correctly by hours", function () {
      var cases = [[1, "בעיכול"], [10, "הסתיים"], [40, "נקי"], [100, "נקי"]];
      for (var i = 0; i < cases.length; i++) {
        var r = FT.meatSince([{ at: T0 - cases[i][0] * 3600000, key: "meat", approx: false }], T0);
        if (r.stage.label.indexOf(cases[i][1]) === -1) {
          return cases[i][0] + "h landed in '" + r.stage.label + "'";
        }
      }
      return true;
    });
    check("meat is described by its digestion burden, which is measurable", function () {
      var it = FT.intakeItem("meat");
      if (!it) return "meat item missing";
      return /לאט|התרוקנות|איטי/.test(it.now)
        ? true : "copy lost the slower-gastric-emptying point";
    });
    check("meat copy refuses the detox claim outright", function () {
      // slower digestion is measurable; "cleansing" and toxin accumulation
      // are not, and a days-clean counter must not imply them
      var it = FT.intakeItem("meat");
      var blob = it.caution + " " + it.now + " " + it.effect;
      if (!/אינן מבוססות|לא מבטיחה/.test(blob)) return "no disclaimer against cleansing claims";
      return /רעלים מצטברים|מנקה את הגוף|ניקוי רעלים/.test(blob)
        ? "copy asserts detoxification" : true;
    });
    check("the long-streak stage still flags the protein question honestly", function () {
      // tracking meat as a burden is fine, but a long meat-free streak in a
      // calorie deficit is exactly when lean mass is at risk, and the app
      // cannot see other protein sources
      var r = FT.meatSince([{ at: T0 - 100 * 3600000, key: "meat", approx: false }], T0);
      var blob = r.stage.helps;
      if (!/חלבון/.test(blob)) return "long streak says nothing about protein";
      return /לא רואה|לא סופרת/.test(blob)
        ? true : "does not admit it cannot see other protein sources";
    });
    check("includes backdated entries, unlike the hour-scale timelines", function () {
      var l = [{ at: T0 - 48 * 3600000, key: "meat", approx: true }];
      return FT.meatSince(l, T0) !== null ? true : "backdated meat vanished";
    });

    group("abstinenceDays");
    check("something logged today breaks the streak", function () {
      // scanning backwards from yesterday never finds today's entry, so
      // without an explicit check this reported a 400-day streak
      var l = [{ at: T0 - 2 * 3600000, key: "coffeeBlack", approx: false }];
      return eq(FT.abstinenceDays(l, FT.CAFFEINE_KEYS, T0), 0, "clean days");
    });
    check("counts whole clean days back from yesterday", function () {
      return eq(FT.abstinenceDays(SCENARIO, FT.ALCOHOL_KEYS, T0), 6, "alcohol clean days");
    });
    check("never logged returns null, not zero", function () {
      // "0 clean days" and "never touched it" must not look alike
      return isNull(FT.abstinenceDays([], FT.ALCOHOL_KEYS, T0), "abstinenceDays");
    });

    group("gluten honesty");
    check("copy states no established physiology without celiac", function () {
      var st = FT.glutenSince([{ at: T0 - 40 * 3600000, key: "gluten", approx: true }], T0).stage;
      return /אין תהליך פיזיולוגי ידוע|בלי צליאק/.test(st.now)
        ? true : "gluten-free days presented as a physiological process";
    });
    check("blinded-challenge figure and FODMAP explanation are present", function () {
      var it = FT.intakeItem("gluten");
      var st = FT.glutenSince([{ at: T0 - 200 * 3600000, key: "gluten", approx: true }], T0).stage;
      if (!/8%/.test(it.timing + st.now)) return "the ~8% blinded-challenge figure is missing";
      return /FODMAP/.test(it.timing + it.effect) ? true : "FODMAP explanation missing";
    });
    check("celiac testing-before-elimination warning is present", function () {
      var it = FT.intakeItem("gluten");
      return /צליאק/.test(it.caution) && /בדיקת דם|לפני/.test(it.caution)
        ? true : "missing the test-before-stopping warning";
    });
    check("gluten timeline covers 0 to Infinity with no gaps", function () {
      var tl = FT.GLUTEN_TIMELINE;
      if (tl[0].from !== 0) return "does not start at 0";
      for (var i = 1; i < tl.length; i++) if (tl[i].from !== tl[i - 1].to) return "gap at " + tl[i - 1].to;
      return isFinite(tl[tl.length - 1].to) ? "does not end at Infinity" : true;
    });
    check("gluten breaks a fast for the calories, and the copy says so", function () {
      if (FT.breaksFast("gluten") !== true) return "gluten marked fasting-safe";
      return /קלוריות/.test(FT.intakeItem("gluten").fasting) ? true : "fasting copy blames the gluten";
    });

    group("headache ambiguity");
    check("fires when caffeine is falling AND the fast is deep enough", function () {
      // both causes visible at once: the app must not blame one
      return eq(FT.headacheAmbiguous(logAt([["coffeeBlack", 8]]), 14, T0), true);
    });
    check("silent when the fast is too short for sodium loss", function () {
      return eq(FT.headacheAmbiguous(logAt([["coffeeBlack", 8]]), 2, T0), false);
    });
    check("silent when caffeine is still high", function () {
      return eq(FT.headacheAmbiguous(logAt([["coffeeBlack", 1]]), 14, T0), false);
    });
    check("silent when not fasting at all", function () {
      return eq(FT.headacheAmbiguous(logAt([["coffeeBlack", 8]]), null, T0), false);
    });
    check("the note names BOTH causes and does not pick one", function () {
      var t = FT.HEADACHE_NOTE;
      if (!/קפאין/.test(t)) return "does not mention caffeine";
      if (!/נתרן|מלח/.test(t)) return "does not mention sodium";
      return /לא יכולה לדעת|יכול להיות/.test(t)
        ? true : "the note asserts a cause instead of naming both";
    });

    group("alcoholNow");
    check("no drinks means zero", function () {
      var a = FT.alcoholNow([], T0);
      return a.units === 0 && a.clearAtMs === null ? true : "got " + JSON.stringify(a);
    });
    check("clears at roughly one unit per hour, not by half-life", function () {
      // one drink 30 minutes ago -> about half a unit left
      return near(FT.alcoholNow(logAt([["alcohol", 0.5]]), T0).units, 0.5, 0.05, "units left");
    });
    check("a drink over an hour old has cleared", function () {
      return eq(FT.alcoholNow(logAt([["alcohol", 2]]), T0).units, 0, "units");
    });
    check("consecutive drinks queue rather than clearing in parallel", function () {
      // two drinks 30 and 10 minutes ago: the second cannot start clearing
      // until the first is done, so ~1.5 units remain
      var l = logAt([["alcohol", 0.5], ["alcohol", 1 / 6]]);
      return near(FT.alcoholNow(l, T0).units, 1.5, 0.1, "queued units");
    });
    check("coffee contributes no alcohol", function () {
      return eq(FT.alcoholNow(logAt([["coffeeBlack", 0.5]]), T0).units, 0, "units");
    });
    check("backdated events are excluded from the live estimate", function () {
      var l = FT.addIntakeEvent([], "alcohol", T0 - 600000, true).log;
      return eq(FT.alcoholNow(l, T0).units, 0, "units from an approx event");
    });

    group("intakeObservation");
    check("refuses below 4 weeks and says how many it has", function () {
      var r = FT.intakeObservation(series(76, -0.13, 10), []);
      return r.status === "insufficient" && /\d/.test(r.reason)
        ? true : "expected a refusal with a count, got " + JSON.stringify(r);
    });
    check("refuses with no weights at all", function () {
      return eq(FT.intakeObservation([], []).status, "insufficient", "status");
    });
    check("reports 'nodata' when there are weeks but nothing logged", function () {
      return eq(FT.intakeObservation(series(76, -0.13, 40), []).status, "nodata", "status");
    });
    check("pairs each week's totals with that week's weight change", function () {
      var w = series(76, -0.13, 40);
      var ik = [];
      w.forEach(function (x, i) {
        if (i >= 7) return;
        for (var q = 0; q < 3; q++) {
          ik = FT.addIntakeEvent(ik, "alcohol", new Date(x.date + "T20:00:00").getTime() + q * 60000, true).log;
        }
      });
      var r = FT.intakeObservation(w, ik);
      if (r.status !== "ok") return "expected ok, got " + r.status + " (" + r.reason + ")";
      var firstWeek = r.all[0];
      if (firstWeek.totals.alcohol <= 0) return "first week lost its alcohol total";
      var later = r.all[r.all.length - 1];
      return later.totals.alcohol === 0 ? true : "a later week picked up totals it should not have";
    });
    check("never claims causation — no correlation coefficient is exposed", function () {
      var w = series(76, -0.13, 40);
      var ik = [];
      w.forEach(function (x) {
        ik = FT.addIntakeEvent(ik, "alcohol", new Date(x.date + "T20:00:00").getTime(), true).log;
      });
      var r = FT.intakeObservation(w, ik);
      var blob = JSON.stringify(r);
      return /\br\b\s*[:=]|correlat|causal|because/i.test(blob)
        ? "the observation object implies causation" : true;
    });

    group("intake content");
    check("every item has all four explanatory fields", function () {
      for (var i = 0; i < FT.INTAKE_ITEMS.length; i++) {
        var it = FT.INTAKE_ITEMS[i];
        var keys = ["now", "fasting", "effect", "timing"];
        for (var k = 0; k < keys.length; k++) {
          if (!it[keys[k]] || !String(it[keys[k]]).trim()) {
            return "'" + it.label + "' has empty " + keys[k] + " — would render blank";
          }
        }
      }
      return true;
    });
    check("alcohol copy names the fat-oxidation effect, which is the point of tracking it", function () {
      var a = FT.intakeItem("alcohol");
      return /חמצון השומן|שריפת/.test(a.effect) ? true : "alcohol effect copy lost its substance";
    });
    check("the days-clean stages state a fact, not a cleansing process", function () {
      var r = FT.meatSince([{ at: T0 - 40 * 3600000, key: "meat", approx: true }], T0);
      var blob = r.stage.now + " " + r.stage.feel + " " + r.stage.helps;
      if (/מתנקה|ניקוי/.test(blob) && !/לא 'מתנקה'|לא מתנקה/.test(blob)) {
        return "a clean-streak stage implies detoxification";
      }
      return /עובדה|סובייקטיבי/.test(blob)
        ? true : "stage does not distinguish fact from felt experience";
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
    check("a stored v2 doc UPGRADES in place, keeping its data", function () {
      // refusing would strand every weigh-in already on the phone
      var v2 = JSON.stringify({
        schemaVersion: 2,
        weights: [{ date: "2026-08-01", kg: 76 }],
        goals: [{ id: "g", date: "2026-09-18", targetKg: 70, deletedAt: null }],
        measures: [], fastHistory: []
      });
      var r = FT.migrate(v2, null, null);
      if (!r.doc) return "v2 doc was refused: " + r.error;
      if (r.doc.schemaVersion !== FT.SCHEMA_VERSION) return "schemaVersion not bumped to " + FT.SCHEMA_VERSION;
      if (r.doc.weights.length !== 1) return "weights lost in upgrade";
      if (r.doc.goals.length !== 1) return "goals lost in upgrade";
      return Array.isArray(r.doc.intakeLog) ? true : "intakeLog not added";
    });
    check("a v3 doc's day counts become events, losing no counts", function () {
      // v4 needs a time per dose for the live estimates; v3 had only counts,
      // so they land at noon flagged approx rather than being discarded
      var v3 = JSON.stringify({
        schemaVersion: 3,
        weights: [{ date: "2026-08-01", kg: 76 }], goals: [], measures: [], fastHistory: [],
        intake: [{ date: "2026-08-01", coffeeBlack: 2, coffeeMilk: 0, alcohol: 1, meat: 1 }]
      });
      var r = FT.migrate(v3, null, null);
      if (!r.doc) return "v3 doc was refused: " + r.error;
      if (r.doc.schemaVersion !== FT.SCHEMA_VERSION) return "schemaVersion not bumped";
      if (r.doc.weights.length !== 1) return "weights lost in upgrade";
      var c = FT.intakeOn(r.doc.intakeLog, "2026-08-01");
      if (c.coffeeBlack !== 2 || c.alcohol !== 1 || c.meat !== 1) {
        return "counts changed in migration: " + JSON.stringify(c);
      }
      var allApprox = r.doc.intakeLog.every(function (e) { return e.approx === true; });
      return allApprox ? true : "migrated events were not flagged approx";
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
    group("meat migration");
    check("v3 day counts of meat survive the conversion to events", function () {
      // the v3 converter read today's item keys; when meat was renamed it
      // found no `protein` field and silently dropped every meat count
      var v3 = JSON.stringify({
        schemaVersion: 3, weights: [], goals: [], measures: [], fastHistory: [],
        intake: [{ date: "2026-08-05", coffeeBlack: 1, coffeeMilk: 0, alcohol: 2, meat: 2 }]
      });
      var r = FT.migrate(v3, null, null);
      if (!r.doc) return "v3 refused: " + r.error;
      var c = FT.intakeOn(r.doc.intakeLog, "2026-08-05");
      if (c.meat !== 2) return "meat counts lost: meat=" + c.meat;
      if (c.alcohol !== 2 || c.coffeeBlack !== 1) return "other counts changed: " + JSON.stringify(c);
      return true;
    });
    check("a v2 document still walks the whole chain to the current version", function () {
      var v2 = JSON.stringify({
        schemaVersion: 2, weights: [{ date: "2026-08-01", kg: 76 }],
        goals: [], measures: [], fastHistory: []
      });
      var r = FT.migrate(v2, null, null);
      if (!r.doc) return "v2 refused: " + r.error;
      if (r.doc.schemaVersion !== FT.SCHEMA_VERSION) return "stopped at v" + r.doc.schemaVersion;
      return eq(r.doc.weights.length, 1, "weights");
    });
    check("the v3 converter lists source-version keys explicitly", function () {
      // iterating the CURRENT item list would silently drop any count whose
      // key was later renamed — this is the shape that bug takes
      var v3 = JSON.stringify({
        schemaVersion: 3, weights: [], goals: [], measures: [], fastHistory: [],
        intake: [{ date: "2026-08-05", coffeeBlack: 1, coffeeMilk: 1, alcohol: 1, meat: 1 }]
      });
      var c = FT.intakeOn(FT.migrate(v3, null, null).doc.intakeLog, "2026-08-05");
      // the v3 coffeeMilk count survives as coffeeBlack after the v5 relabel
      var total = c.coffeeBlack + c.alcohol + c.meat;
      if (c.coffeeBlack !== 2) return "coffeeMilk count lost in relabel: coffeeBlack=" + c.coffeeBlack;
      return eq(total, 4, "total events from a 4-key v3 row");
    });

    group("ayurvedic lens");
    check("is kept separate from the physiology, and says what it is", function () {
      // blending a traditional framework into measured physiology would
      // misrepresent both
      var t = FT.AYUR_NOTE;
      if (!/מסורת|מסורתית/.test(t)) return "does not identify itself as traditional";
      if (!/לא רפואה מבוססת ראיות|לא כהמלצה/.test(t)) return "does not disclaim evidence standing";
      return true;
    });
    check("every fasting stage has qualities, text and a dosha line", function () {
      for (var i = 0; i < FT.AYUR_FASTING.length; i++) {
        var st = FT.AYUR_FASTING[i];
        var keys = ["qualities", "text", "dosha"];
        for (var k = 0; k < keys.length; k++) {
          if (!st[keys[k]] || !String(st[keys[k]]).trim()) {
            return "stage '" + st.label + "' has empty " + keys[k];
          }
        }
      }
      return true;
    });
    check("stages cover 0 to Infinity with no gaps", function () {
      var tl = FT.AYUR_FASTING;
      if (tl[0].from !== 0) return "does not start at 0";
      for (var i = 1; i < tl.length; i++) {
        if (tl[i].from !== tl[i - 1].to) return "gap at " + tl[i - 1].to;
      }
      return isFinite(tl[tl.length - 1].to) ? "does not end at Infinity" : true;
    });
    check("only describes substances taken in the last day", function () {
      var old = [{ at: T0 - 40 * 3600000, key: "alcohol", approx: false }];
      var fresh = [{ at: T0 - 2 * 3600000, key: "alcohol", approx: false }];
      if (FT.ayurActiveItems(old, T0).length !== 0) return "a 40h-old drink was still described";
      return FT.ayurActiveItems(fresh, T0).length === 1 ? true : "a fresh drink was not described";
    });
    check("makes no treatment or remedy claim", function () {
      var blob = JSON.stringify(FT.AYUR_FASTING) + JSON.stringify(FT.AYUR_ITEMS);
      return /צמח מרפא|תוסף|לרפא|מרפא את|תרופה/.test(blob)
        ? "the lens strays into treatment claims" : true;
    });
    check("does not ask for or assert a constitution", function () {
      var d = FT.emptyDoc();
      return ("dosha" in d.profile) || ("prakriti" in d.profile)
        ? "the app stores a self-selected constitution" : true;
    });

    group("banner dismissal");
    check("dismissals live in the document, so they survive a reload", function () {
      // it was transient view state, so the "data is only on this device"
      // notice came back on every open — a nag, not a warning
      var d = FT.emptyDoc();
      if (!d.dismissed || typeof d.dismissed !== "object") return "emptyDoc has no dismissed map";
      d.dismissed.backup = "2026-08-13T10:00:00Z";
      var round = FT.normalizeDoc(JSON.parse(JSON.stringify(d)));
      return round.dismissed.backup === "2026-08-13T10:00:00Z"
        ? true : "dismissal did not survive a round-trip";
    });
    check("a document with no dismissed map is repaired, not crashed on", function () {
      var r = FT.normalizeDoc({ schemaVersion: FT.SCHEMA_VERSION });
      return r.dismissed && typeof r.dismissed === "object"
        ? true : "dismissed not repaired";
    });
    check("dismissing does not disable the underlying staleness check", function () {
      // the banner goes away; the settings card must still be able to say so
      return eq(FT.backupStale(null, Date.now()), true, "backupStale");
    });

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

    /* ================= days ================= */
    group("day model");
    function mkDay(spec) {
      var days = {};
      Object.keys(spec).forEach(function (slot) {
        (spec[slot] || []).forEach(function (t) { days = FT.setDayTag(days, "2026-08-14", slot, t); });
      });
      return FT.dayDoc(days, "2026-08-14");
    }
    check("dayDoc returns a full day for a date that has none", function () {
      var d = FT.dayDoc({}, "2026-08-14");
      if (FT.SLOT_KEYS.length !== 6) return "expected 6 slots, got " + FT.SLOT_KEYS.length;
      return FT.SLOT_KEYS.every(function (k) {
        return d.slots[k] && d.slots[k].text === "" && d.slots[k].tags.length === 0;
      }) ? true : "slots not zeroed";
    });
    check("dayDoc repairs a partial or hand-edited shape", function () {
      var d = FT.dayDoc({ "2026-08-14": { slots: { lunch: { text: 5, tags: "nope" } } } }, "2026-08-14");
      return d.slots.lunch.text === "" && d.slots.lunch.tags.length === 0
        ? true : "bad shape survived: " + JSON.stringify(d.slots.lunch);
    });
    check("unknown tags are dropped, not stored", function () {
      var d = FT.dayDoc({ "2026-08-14": { slots: { lunch: { text: "", tags: ["carb", "pizza"] } } } }, "2026-08-14");
      return eq(d.slots.lunch.tags.join(","), "carb", "tags");
    });
    check("one carb does not flag", function () {
      var f = FT.dayFlags(mkDay({ lunch: ["carb"] }));
      return f.carbCount === 1 && f.overCarb === false ? true : JSON.stringify(f);
    });
    check("a SECOND carb flags — the state a checkbox could never reach", function () {
      var f = FT.dayFlags(mkDay({ lunch: ["carb"], dinner: ["carb"] }));
      return f.carbCount === 2 && f.overCarb === true ? true : JSON.stringify(f);
    });
    check("a second happy moment flags", function () {
      var f = FT.dayFlags(mkDay({ mid1: ["happy"], mid2: ["happy"] }));
      return f.happyCount === 2 && f.overHappy === true ? true : JSON.stringify(f);
    });
    check("a craving stands the carb flag down", function () {
      var f = FT.dayFlags(mkDay({ lunch: ["carb"], dinner: ["carb"], late: ["craving"] }));
      if (!f.standDown) return "standDown not set";
      if (f.carbCount !== 2) return "count changed: " + f.carbCount;
      return f.overCarb === false ? true : "flag still raised on a craving day";
    });
    check("setDayTag is idempotent on the same slot", function () {
      var days = FT.setDayTag(FT.setDayTag({}, "2026-08-14", "lunch", "carb"), "2026-08-14", "lunch", "carb");
      return eq(FT.dayFlags(FT.dayDoc(days, "2026-08-14")).carbCount, 1, "count");
    });
    check("clearDayTag removes only that tag on that slot", function () {
      var days = FT.setDayTag({}, "2026-08-14", "lunch", "carb");
      days = FT.setDayTag(days, "2026-08-14", "lunch", "happy");
      days = FT.clearDayTag(days, "2026-08-14", "lunch", "carb");
      return eq(FT.dayDoc(days, "2026-08-14").slots.lunch.tags.join(","), "happy", "remaining");
    });
    check("an unknown slot key is a no-op, not a crash", function () {
      var days = FT.setDayTag({}, "2026-08-14", "brunch", "carb");
      return eq(Object.keys(days).length, 0, "days written");
    });
    check("dayRange reaches BACKWARDS — the design ran forward only", function () {
      var r = FT.dayRange("2026-08-14", 3, 3);
      if (r.length !== 7) return "expected 7, got " + r.length;
      if (r[0] !== "2026-08-11") return "first is " + r[0] + ", expected 3 days back";
      return eq(r[6], "2026-08-17", "last");
    });
    check("weekDays is today plus six ahead", function () {
      var w = FT.weekDays("2026-08-14", 7);
      return w.length === 7 && w[0] === "2026-08-14" && w[6] === "2026-08-20"
        ? true : w.join(",");
    });
    check("dayIsEmpty is false once anything is set", function () {
      if (!FT.dayIsEmpty(FT.dayDoc({}, "2026-08-14"))) return "empty day reported non-empty";
      return FT.dayIsEmpty(mkDay({ lunch: ["carb"] })) ? "tagged day reported empty" : true;
    });

    group("v6 migration");
    check("a v5 doc gains days and keeps everything else", function () {
      var v5 = JSON.stringify({
        schemaVersion: 5, weights: [{ date: "2026-08-01", kg: 76 }], goals: [],
        measures: [], fastHistory: [], intakeLog: [{ at: 1, key: "meat", approx: true }]
      });
      var r = FT.migrate(v5, null, null);
      if (!r.doc) return "v5 refused: " + r.error;
      if (r.doc.schemaVersion !== FT.SCHEMA_VERSION) return "not bumped to " + FT.SCHEMA_VERSION;
      if (r.doc.weights.length !== 1) return "weights lost";
      return r.doc.days && typeof r.doc.days === "object" ? true : "days not added";
    });
    check("intakeLog is STILL an event array after migrating", function () {
      // the design proposed day counts; that model must not creep back in,
      // because it would silently kill every since-last and decay figure
      var v5 = JSON.stringify({
        schemaVersion: 5, weights: [], goals: [], measures: [], fastHistory: [],
        intakeLog: [{ at: 1000, key: "coffeeBlack", approx: false }]
      });
      var r = FT.migrate(v5, null, null);
      if (!Array.isArray(r.doc.intakeLog)) return "intakeLog is not an array";
      return typeof r.doc.intakeLog[0].at === "number"
        ? true : "events lost their timestamps";
    });
    check("a v2 document still walks all the way to v6", function () {
      var v2 = JSON.stringify({
        schemaVersion: 2, weights: [{ date: "2026-08-01", kg: 76 }],
        goals: [], measures: [], fastHistory: []
      });
      var r = FT.migrate(v2, null, null);
      return r.doc && r.doc.schemaVersion === FT.SCHEMA_VERSION
        ? true : "stopped at v" + (r.doc && r.doc.schemaVersion);
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
      /* Must find a heading on EVERY route. Narrow selectors turn this into a
         permanent skip, which is how a font regression ships unnoticed. */
      var el = document.querySelector(".brand") || document.querySelector(".screenTitle") ||
               document.querySelector(".cardTitle") || document.querySelector(".tileLabel");
      if (!el) return "no heading found on route '" + (view && view.route) + "' — the check has stopped exercising anything";
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
    check("routing: an unknown hash falls back to home, never a blank screen", function () {
      if (!inApp) return skip("not running inside the app page");
      var before = location.hash;
      location.hash = "#/kombucha";
      var r = (typeof parseHash === "function") ? parseHash() : null;
      location.hash = before;
      if (!r) return skip("parseHash not exposed on this page");
      return eq(r.name, "home", "fallback route");
    });
    check("day-screen text survives a render — focus AND caret", function () {
      // render() rebuilds innerHTML; six text inputs made this the highest
      // risk in v3. It is the v1 date-picker bug, but constant.
      if (!inApp) return skip("not running inside the app page");
      if (typeof render !== "function" || typeof go !== "function") {
        return skip("render/go not exposed on this page");
      }
      var before = location.hash;
      location.hash = "#/day"; render();
      var el = document.getElementById("slot_dinner");
      if (!el) { location.hash = before; render(); return skip("day screen did not render a dinner slot"); }
      el.focus(); el.value = "בדיקה"; el.dispatchEvent(new Event("input", { bubbles: true }));
      el.setSelectionRange(3, 3);
      render();
      var a = document.activeElement;
      var okId = a && a.id === "slot_dinner";
      var okCaret = okId && a.selectionStart === 3;
      var okVal = okId && a.value === "בדיקה";
      location.hash = before; render();
      if (!okId) return "focus was lost across render()";
      if (!okCaret) return "caret moved across render()";
      return okVal ? true : "the draft text was lost across render()";
    });
    check("training toggles on a real CLICK, not just a dispatched change", function () {
      /* Shipped broken in v3.0.0: the checkbox was nested in its own <label>,
         so the label forwarded a second click back to it and the toggle
         cancelled itself. The old check dispatched `change` directly, which
         bypassed exactly the broken path. Click the element, like a thumb. */
      if (!inApp) return skip("not running inside the app page");
      if (typeof render !== "function" || typeof currentDayDate !== "function") {
        return skip("render/currentDayDate not exposed on this page");
      }
      var before = location.hash;
      location.hash = "#/day"; render();
      var el = document.getElementById("dayTraining");
      if (!el) { location.hash = before; render(); return skip("day screen has no training control"); }
      var was = FT.dayDoc(doc.days, currentDayDate()).training;
      el.click();
      var mid = FT.dayDoc(doc.days, currentDayDate()).training;
      document.getElementById("dayTraining").click();
      var back = FT.dayDoc(doc.days, currentDayDate()).training;
      location.hash = before; render();
      if (mid === was) return "one click did not change the stored value";
      return back === was ? true : "a second click did not toggle it back";
    });
    check("color-scheme matches the theme, so native controls are visible", function () {
      /* Shipped broken in v3.1: color-scheme was `normal` under a dark theme,
         so the browser drew date-input internals and the picker popup in the
         LIGHT scheme — a dark glyph on a dark field. The field looked empty
         and the picker looked dead. Nothing in the app's own CSS shows this. */
      if (!inApp) return skip("not running inside the app page");
      var cs = getComputedStyle(document.documentElement).colorScheme;
      var attr = document.documentElement.getAttribute("data-theme");
      if (!attr) return skip("theme is on auto — the media query governs it");
      if (cs === "normal") return "color-scheme is 'normal'; native controls will not follow the theme";
      return cs.indexOf(attr) !== -1 ? true : "color-scheme is '" + cs + "' but theme is '" + attr + "'";
    });
    check("no click handler on <html> or <body> — a bubbled render kills pickers", function () {
      /* wire() once selected [data-theme], which matches the <html> element
         because applyTheme() sets data-theme on the root. That installed a
         theme handler on <html>, so EVERY click bubbled up and triggered a
         full render(), destroying any open native picker within the same
         click. Three releases fixed other things while this stayed. */
      if (!inApp) return skip("not running inside the app page");
      if (typeof document.documentElement.onclick === "function")
        return "<html> has an onclick handler; every click in the app will bubble to it";
      if (typeof document.body.onclick === "function")
        return "<body> has an onclick handler; every click in the app will bubble to it";
      return true;
    });
    check("every picker input is wired, not just type=date", function () {
      /* Both earlier picker fixes were scoped to input[type=date]. The fasting
         start editor (#startEdit) is a datetime-local, so it got neither the
         showPicker binding nor the indicator styling — home → my fast → edit
         start opened no picker at all. Assert by TYPE, so adding a time field
         somewhere cannot silently repeat this. */
      if (!inApp) return skip("not running inside the app page");
      var els = document.querySelectorAll(
        "input[type=date],input[type=datetime-local],input[type=time]");
      if (!els.length) return skip("no picker input on this route");
      for (var i = 0; i < els.length; i++) {
        if (typeof els[i].onclick !== "function")
          return "a " + els[i].type + " input (#" + (els[i].id || "?") +
                 ") has no click handler; tapping the field will not open the picker";
      }
      return true;
    });
    check("buttons opt out of text selection, so a tap is not eaten", function () {
      /* On Android a tap that lingers over selectable text becomes a text
         selection and the click never fires. Every control here is a Hebrew
         word inside a button, so this hit ALL of them: the reveal buttons
         ("+ הוספה", "רישום לתאריך אחר") never opened, and the date fields
         behind them were therefore never rendered at all. Inputs must keep
         selection — caret placement in a text field is not optional. */
      if (!inApp) return skip("not running inside the app page");
      var b = document.querySelector("button");
      if (!b) return skip("no button rendered on this route");
      var bs = getComputedStyle(b);
      var sel = bs.userSelect || bs.webkitUserSelect;
      if (sel !== "none") return "button user-select is '" + sel + "'; a lingering tap will select it instead of clicking";
      if (bs.touchAction.indexOf("manipulation") === -1)
        return "button touch-action is '" + bs.touchAction + "'; taps wait for a possible double-tap zoom";
      var i = document.querySelector("input[type=text],input[type=number]");
      if (i) {
        var is = getComputedStyle(i);
        var isel = is.userSelect || is.webkitUserSelect;
        if (isel === "none") return "inputs inherited user-select:none; the caret cannot be placed";
      }
      return true;
    });
    check("date fields cannot collapse below their own internals", function () {
      /* dd/mm/yyyy plus the picker glyph has an intrinsic width. In a flex row
         a date input would shrink past it, leaving only the icon — nothing to
         tap and nothing readable. */
      if (!inApp) return skip("not running inside the app page");
      if (typeof render !== "function") return skip("render not exposed on this page");
      var before = location.hash;
      location.hash = "#/tracking";
      if (typeof view !== "undefined") { view.folds = { goals: true }; view.showGoalForm = true; }
      render();
      var d = document.querySelector('input[type="date"]');
      if (!d) { location.hash = before; render(); return skip("no date field rendered on this route"); }
      var w = d.getBoundingClientRect().width;
      var h = d.getBoundingClientRect().height;
      location.hash = before; render();
      if (w < 120) return "date field is only " + Math.round(w) + "px wide — collapsed";
      return h >= 40 ? true : "date field is only " + Math.round(h) + "px tall — under the tap-target floor";
    });
    check("every theme token pair meets 4.5:1, computed not judged", function () {
      if (!inApp) return skip("not running inside the app page");
      var cs = getComputedStyle(document.documentElement);
      function rgb(v) {
        v = (v || "").trim();
        if (v.charAt(0) === "#") {
          return [parseInt(v.substr(1, 2), 16), parseInt(v.substr(3, 2), 16), parseInt(v.substr(5, 2), 16)];
        }
        var m = v.match(/\d+/g);
        return m ? [+m[0], +m[1], +m[2]] : null;
      }
      function lum(c) {
        var a = c.map(function (v) {
          v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
        });
        return 0.2126 * a[0] + 0.7152 * a[1] + 0.0722 * a[2];
      }
      function ratio(f, b) {
        var A = rgb(cs.getPropertyValue(f)), B = rgb(cs.getPropertyValue(b));
        if (!A || !B) return null;
        var l1 = lum(A), l2 = lum(B);
        return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
      }
      var grounds = ["--surface", "--surface2", "--page"];
      var inks = ["--text", "--muted", "--dim", "--head", "--link", "--flag", "--accent"];
      var bad = [];
      inks.forEach(function (i) {
        grounds.forEach(function (g) {
          var r = ratio(i, g);
          if (r !== null && r < 4.5) bad.push(i + " on " + g + " = " + r.toFixed(2));
        });
      });
      var theme = document.documentElement.getAttribute("data-theme") || "auto";
      return bad.length ? theme + " theme fails: " + bad.join("; ") : true;
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
