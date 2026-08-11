/* FastTrack — fasting timer, weight & body-measurement tracking, goal pacing.
 * Single-user, localStorage only, no backend. Hebrew RTL.
 * Source file; build.mjs inlines this into deploy/index.html.
 */
"use strict";

var APP_VERSION = "2.1.0";
var LS_KEY = "fasttrack.doc";
var SCHEMA_VERSION = 2;

/* ============================================================ *
 *  Fasting phases
 *  Boundaries are TYPICAL, not personal — stated in the UI.
 *  Deliberately does not print an autophagy threshold as fact:
 *  most cited hour-figures come from rodent studies.
 * ============================================================ */
var PHASES = [
  {
    from: 0, to: 4, label: "עיכול וספיגה",
    now: "הגוף עדיין מעכל את הארוחה האחרונה. הסוכר בדם עלה, האינסולין גבוה, והאנרגיה מגיעה ישירות מהמזון.",
    hormones: "אינסולין גבוה — הגוף במצב אגירה, לא בשריפה.",
    fuel: "גלוקוז מהארוחה עצמה.",
    feel: "בדרך כלל שובע, לפעמים כבדות או נמנום קל אחרי ארוחה גדולה.",
    helps: "מים. אין צורך בכלום מעבר לזה.",
    caution: null
  },
  {
    from: 4, to: 12, label: "שריפת גליקוגן",
    now: "הסוכר מהארוחה נגמר. הכבד מתחיל לפרק את מאגרי הגליקוגן שלו כדי לשמור על רמת סוכר יציבה בדם.",
    hormones: "אינסולין יורד בהדרגה, גלוקגון עולה.",
    fuel: "גליקוגן מהכבד. מספיק בערך ל-12 עד 24 שעות, תלוי בפעילות ובארוחה האחרונה.",
    feel: "רעב שמגיע בגלים ונרגע. לפעמים ירידה קלה באנרגיה או בריכוז.",
    helps: "מים, קפה או תה שחור בלי סוכר וחלב. גלי הרעב חולפים תוך כ-20 דקות.",
    caution: null
  },
  {
    from: 12, to: 16, label: "המעבר לשריפת שומן",
    now: "מאגרי הגליקוגן מתרוקנים והגוף עובר להסתמך על שומן. זה השלב שבו המתג המטבולי מתהפך.",
    hormones: "אינסולין נמוך, נוראדרנלין עולה — לכן דווקא עכשיו לפעמים יש יותר ערנות ולא פחות.",
    fuel: "חומצות שומן חופשיות שמשתחררות מרקמת השומן.",
    feel: "הרעב הכי בולט בשלב הזה. ייתכן כאב ראש קל, עצבנות או קושי בריכוז.",
    helps: "כאן חשוב מלח. גליקוגן קושר מים, וכשהוא מתרוקן הגוף מפריש נתרן — רוב מה שנקרא \"כאב ראש של צום\" הוא בעצם חוסר נתרן. קורט מלח במים עוזר.",
    caution: null
  },
  {
    from: 16, to: 24, label: "קטוזיס מוקדם",
    now: "הכבד מייצר גופי קטון מהשומן — דלק חלופי שהמוח יכול להשתמש בו במקום גלוקוז.",
    hormones: "אינסולין נמוך ויציב. רגישות לאינסולין משתפרת.",
    fuel: "שומן וקטונים, לצד ייצור גלוקוז מוגבל בכבד.",
    feel: "אצל חלק הרעב דווקא נחלש והריכוז משתפר. אצל אחרים עייפות, ריח פה או סחרחורת קלה.",
    helps: "מים, נתרן, ואם הצום נמשך — גם מגנזיום ואשלגן. אימון קל בסדר, אימון כבד פחות.",
    caution: null
  },
  {
    from: 24, to: 36, label: "קטוזיס עמוק",
    now: "הקטונים הופכים לדלק העיקרי. תהליכי תחזוקה ופינוי תאי פעילים יותר, אם כי העיתוי המדויק אצל בני אדם עדיין לא ידוע במדויק — רוב המספרים שמצוטטים ברשת מגיעים ממחקרים בחולדות.",
    hormones: "הורמון גדילה עולה משמעותית — אחד המנגנונים ששומרים על מסת שריר בצום.",
    fuel: "שומן וקטונים כמעט בלעדית.",
    feel: "עייפות, רגישות לקור, לחץ דם נמוך יותר. חלק מדווחים על צלילות מחשבתית.",
    helps: "אלקטרוליטים הם לא המלצה אלא הכרח בשלב הזה: נתרן, אשלגן, מגנזיום. להימנע ממאמץ ומנהיגה אם יש סחרחורת.",
    caution: "מעבר ל-24 שעות מומלץ להתייעץ עם רופא — במיוחד עם מחלות רקע, סוכרת, לחץ דם, הריון או תרופות קבועות. אם יש סחרחורת חזקה, דפיקות לב או בלבול — להפסיק את הצום."
  },
  {
    from: 36, to: 72, label: "צום ממושך",
    now: "הגוף פועל כמעט לגמרי על שומן. תהליכי מיחזור תאי (אוטופגיה) מתוארים היטב במחקר, אבל מתי בדיוק הם מגיעים לשיא אצל בני אדם — זה עדיין לא נקבע.",
    hormones: "הורמון גדילה גבוה, נוראדרנלין גבוה, T3 יורד.",
    fuel: "שומן וקטונים.",
    feel: "עייפות ניכרת, קור, חולשה. הרעב לרוב כבר לא הבעיה העיקרית.",
    helps: "אלקטרוליטים באופן קבוע. מנוחה. לתכנן מראש איך שוברים את הצום.",
    caution: "צום מעל 36 שעות אינו דבר שכדאי לעשות באופן ספונטני. יש להתייעץ עם רופא לפני, ולא לשבור אותו בארוחה גדולה — זו הטעות הנפוצה והמסוכנת ביותר."
  },
  {
    from: 72, to: Infinity, label: "צום מורחב מאוד",
    now: "מעבר ל-72 שעות זה כבר לא תחום של אפליקציה.",
    hormones: "שינויים הורמונליים ומטבוליים משמעותיים.",
    fuel: "שומן, ובהדרגה גם חלבון.",
    feel: "משתנה מאוד בין אנשים ולא צפוי.",
    helps: "פיקוח רפואי.",
    caution: "צום בטווח הזה דורש ליווי רפואי צמוד. סיכון לתסמונת האכלה־מחדש (refeeding syndrome) בשבירת הצום. האפליקציה הזו לא מיועדת לתמוך בזה."
  }
];

var REFEED_NOTE = "אחרי צום ארוך: לשבור בקטן. משהו קל וקטן, לחכות 20–30 דקות, ורק אז ארוחה רגילה. ארוחה גדולה מיד בסוף צום ארוך היא החלק שהכי מרבים לטעות בו.";

var MEASURE_PROTOCOL = [
  "בבוקר, בצום, אחרי השירותים, לפני שתייה.",
  "מותן בגובה הטבור, עמידה רגועה, נשיפה רגילה — בלי לשאוב פנימה.",
  "ירך באמצע הדרך בין הירך לברך, תמיד באותה רגל.",
  "סרט צמוד לעור אבל לא לוחץ."
];

/* ============================================================ *
 *  Storage — never throws; a failure sets a visible flag.
 * ============================================================ */
var storageOK = true;
var storageNote = "";

function lsGet(k) {
  try { return localStorage.getItem(k); }
  catch (e) { storageOK = false; storageNote = String((e && e.message) || e); return null; }
}
function lsSet(k, v) {
  try { localStorage.setItem(k, v); return true; }
  catch (e) { storageOK = false; storageNote = String((e && e.message) || e); return false; }
}

/* ============================================================ *
 *  Document + migration
 * ============================================================ */
function todayISO(d) {
  var x = d ? new Date(d) : new Date();
  x.setHours(12, 0, 0, 0); // midday avoids DST/UTC date-shifting
  return x.getFullYear() + "-" + pad2(x.getMonth() + 1) + "-" + pad2(x.getDate());
}
function pad2(n) { return String(n).padStart(2, "0"); }

function emptyDoc() {
  return {
    schemaVersion: SCHEMA_VERSION,
    profile: { heightCm: 169, startWeight: 76, startDate: todayISO(), thighSide: "right" },
    goals: [],
    weights: [],
    measures: [],
    reminders: { weighIn: "08:00", measureWeekday: 0, enabled: false, permission: "default" },
    session: null,
    fastHistory: [],
    lastExportAt: null,
    updatedAt: new Date().toISOString()
  };
}

function seedGoals() {
  return [
    { id: "g_paris", label: "פריז", date: "2026-09-18", targetKg: 70, deletedAt: null },
    { id: "g_long", label: "יעד ארוך טווח", date: "2026-12-31", targetKg: 66, deletedAt: null }
  ];
}

/* Migrates the v1 localStorage keys. Never drops a record.
 * Returns {doc, migrated, error}. An unknown schemaVersion REFUSES. */
function migrate(raw, v1entries, v1session) {
  if (raw) {
    var parsed;
    try { parsed = JSON.parse(raw); }
    catch (e) { return { doc: null, error: "המסמך השמור אינו JSON תקין" }; }

    if (parsed && parsed.schemaVersion === SCHEMA_VERSION) {
      return { doc: normalizeDoc(parsed), migrated: false };
    }
    if (parsed && typeof parsed.schemaVersion === "number" && parsed.schemaVersion > SCHEMA_VERSION) {
      // Refuse rather than guess. Preserve the raw blob.
      return {
        doc: null,
        error: "הנתונים נשמרו בגרסה חדשה יותר (" + parsed.schemaVersion + ") מזו שרצה כאן (" + SCHEMA_VERSION + "). לא נגענו בהם.",
        rawPreserved: raw
      };
    }
    if (parsed && parsed.schemaVersion === undefined && !Array.isArray(parsed.entries)) {
      return { doc: null, error: "מבנה נתונים לא מוכר — לא נגענו בהם.", rawPreserved: raw };
    }
  }

  // v1 → v2
  var doc = emptyDoc();
  var hadV1 = false;

  if (Array.isArray(v1entries) && v1entries.length) {
    hadV1 = true;
    doc.weights = v1entries
      .filter(function (e) { return e && e.date && isFinite(e.weight); })
      .map(function (e) { return { date: e.date, kg: Number(e.weight) }; });
    doc.weights.sort(function (a, b) { return a.date < b.date ? -1 : 1; });
    if (doc.weights.length) {
      doc.profile.startWeight = doc.weights[0].kg;
      doc.profile.startDate = doc.weights[0].date;
    }
  }
  if (v1session && isFinite(v1session.start)) {
    hadV1 = true;
    doc.session = { start: Number(v1session.start), protocolHours: v1session.protocolHours || null };
  }

  // The four v1 constants become real goal rows.
  var sw = doc.profile.startWeight;
  doc.goals = hadV1
    ? [
        { id: "g_paris", label: "פריז", date: "2026-09-18", targetKg: +(sw - 6).toFixed(1), deletedAt: null },
        { id: "g_long", label: "יעד ארוך טווח", date: "2026-12-31", targetKg: +(sw - 10).toFixed(1), deletedAt: null }
      ]
    : seedGoals();

  return { doc: doc, migrated: hadV1 };
}

function normalizeDoc(d) {
  var base = emptyDoc();
  d.profile = Object.assign({}, base.profile, d.profile || {});
  d.reminders = Object.assign({}, base.reminders, d.reminders || {});
  d.goals = Array.isArray(d.goals) ? d.goals : [];
  d.weights = Array.isArray(d.weights) ? d.weights : [];
  d.measures = Array.isArray(d.measures) ? d.measures : [];
  d.fastHistory = Array.isArray(d.fastHistory) ? d.fastHistory : [];
  if (d.session && !isFinite(d.session.start)) d.session = null;
  return d;
}

function loadDoc() {
  var raw = lsGet(LS_KEY);
  var v1e = null, v1s = null;
  try { v1e = JSON.parse(lsGet("trail-weight-entries") || "null"); } catch (e) {}
  try { v1s = JSON.parse(lsGet("trail-fasting-session") || "null"); } catch (e) {}
  return migrate(raw, v1e, v1s);
}

function saveDoc(d) {
  d.updatedAt = new Date().toISOString();
  return lsSet(LS_KEY, JSON.stringify(d));
}

/* ============================================================ *
 *  Pure logic — exercised directly by the selftest.
 * ============================================================ */

function daysBetween(aISO, bISO) {
  var a = new Date(aISO + "T12:00:00"), b = new Date(bISO + "T12:00:00");
  return Math.round((b - a) / 86400000);
}

/* Zero-phase exponential smoothing for the chart line.
 *
 * A single forward EMA lags the data by roughly (1-alpha)/alpha days, which
 * on screen draws the trend line visibly ABOVE a falling series — it looks
 * like the line disagrees with the dots. Running the EMA forward and then
 * backward and averaging the two cancels the lag exactly (the standard
 * zero-phase / filtfilt trick), so the line sits through the points.
 *
 * Gap-tolerant: smoothing advances per elapsed DAY, not per data point, so a
 * week-long gap doesn't let one reading yank the line.
 *
 * This is presentation only. Pace numbers come from trendFit() — see there
 * for why a smoothed series must not be used to estimate a rate.
 */
function smoothWeights(weights, alpha) {
  var a = isFinite(alpha) ? alpha : 0.25;
  if (!Array.isArray(weights)) return [];
  var pts = weights.filter(function (w) { return w && w.date && isFinite(w.kg); })
    .sort(function (x, y) { return x.date < y.date ? -1 : 1; });
  if (!pts.length) return [];
  if (pts.length === 1) return [{ date: pts[0].date, kg: pts[0].kg, trend: pts[0].kg }];

  function pass(series) {
    var out = [series[0].kg], t = series[0].kg;
    for (var i = 1; i < series.length; i++) {
      var gap = Math.max(1, Math.abs(daysBetween(series[i - 1].date, series[i].date)));
      var eff = 1 - Math.pow(1 - a, gap);
      t = t + eff * (series[i].kg - t);
      out.push(t);
    }
    return out;
  }

  var fwd = pass(pts);
  var bwd = pass(pts.slice().reverse()).reverse();

  return pts.map(function (p, i) {
    return { date: p.date, kg: p.kg, trend: +((fwd[i] + bwd[i]) / 2).toFixed(3) };
  });
}

function nextGoal(goals, todayStr) {
  var t = todayStr || todayISO();
  var live = (goals || []).filter(function (g) {
    return g && !g.deletedAt && g.date && isFinite(g.targetKg) && g.date >= t;
  });
  if (!live.length) return null;
  live.sort(function (a, b) { return a.date < b.date ? -1 : (a.date > b.date ? 1 : 0); });
  return live[0];
}

/* Least-squares fit over the RAW daily points, in kg/day.
 *
 * Deliberately NOT fitted to the EMA. An exponential average lags by
 * roughly (1-alpha)/alpha days, which biases its slope toward zero: on a
 * true -0.91 kg/week loss the EMA slope reads -0.46 at alpha=0.10 and only
 * -0.81 at alpha=0.40, so a pace card built on it reports "behind" while
 * you are exactly on pace. Regression on the raw points is unbiased and is
 * already noise-robust — it recovers -0.907 on that same series.
 *
 * Returns {slopePerDay, levelAt(dateISO)} or null.
 */
function trendFit(weights, windowDays, todayStr) {
  var pts = (weights || []).filter(function (w) { return w && w.date && isFinite(w.kg); })
    .sort(function (a, b) { return a.date < b.date ? -1 : 1; });
  if (pts.length < 2) return null;
  var last = todayStr && todayStr > pts[pts.length - 1].date ? todayStr : pts[pts.length - 1].date;
  if (isFinite(windowDays)) {
    var win = pts.filter(function (p) { return daysBetween(p.date, last) <= windowDays; });
    if (win.length >= 2) pts = win;
  }
  var x0 = pts[0].date;
  var n = pts.length, sx = 0, sy = 0, sxx = 0, sxy = 0;
  for (var i = 0; i < n; i++) {
    var x = daysBetween(x0, pts[i].date), y = pts[i].kg;
    sx += x; sy += y; sxx += x * x; sxy += x * y;
  }
  var denom = n * sxx - sx * sx;
  if (denom === 0) return null;
  var slope = (n * sxy - sx * sy) / denom;
  var intercept = (sy - slope * sx) / n;
  return {
    slopePerDay: slope,
    levelAt: function (iso) { return slope * daysBetween(x0, iso) + intercept; }
  };
}

/* kept for the chart's visual line */
function trendSlopePerDay(weights, windowDays) {
  var f = trendFit(weights, windowDays);
  return f ? f.slopePerDay : null;
}

var PACE_WINDOW_DAYS = 21;

function paceToGoal(goal, weights, todayStr) {
  if (!goal) return null;
  var t = todayStr || todayISO();
  var sorted = (weights || []).filter(function (w) { return w && w.date && isFinite(w.kg); });
  if (!sorted.length) return null;

  var fit = trendFit(weights, PACE_WINDOW_DAYS, t);
  var lastPt = sorted.slice().sort(function (a, b) { return a.date < b.date ? -1 : 1; }).pop();

  // With a single reading there is no line to fit; fall back to the reading.
  var current = fit ? fit.levelAt(t) : lastPt.kg;
  var daysLeft = daysBetween(t, goal.date);
  var toLose = current - goal.targetKg;
  var requiredKgPerWeek = daysLeft > 0 ? (toLose / daysLeft) * 7 : null;

  var slope = fit ? fit.slopePerDay : null; // kg/day, negative = losing
  var actualKgPerWeek = slope === null ? null : slope * 7;
  var projectedWeightAtGoal = slope === null ? null : +(current + slope * Math.max(0, daysLeft)).toFixed(1);

  var verdict = "unknown";
  if (projectedWeightAtGoal !== null) {
    var miss = projectedWeightAtGoal - goal.targetKg;
    verdict = miss <= -0.3 ? "ahead" : (miss <= 0.3 ? "onpace" : "behind");
  }

  return {
    currentTrend: +current.toFixed(1),
    daysLeft: daysLeft,
    toLose: +toLose.toFixed(1),
    requiredKgPerWeek: requiredKgPerWeek === null ? null : +requiredKgPerWeek.toFixed(2),
    actualKgPerWeek: actualKgPerWeek === null ? null : +actualKgPerWeek.toFixed(2),
    projectedWeightAtGoal: projectedWeightAtGoal,
    verdict: verdict,
    aggressive: requiredKgPerWeek !== null && requiredKgPerWeek > 1.0
  };
}

function goalOutcome(goal, weights) {
  if (!goal || !goal.date) return null;
  var t = todayISO();
  if (goal.date >= t) return null;
  // only readings up to the goal date — a later loss must not retro-fix a miss
  var upTo = (weights || []).filter(function (w) { return w && w.date && isFinite(w.kg) && w.date <= goal.date; });
  if (!upTo.length) return null;
  var fit = trendFit(upTo, PACE_WINDOW_DAYS, goal.date);
  var level = fit ? fit.levelAt(goal.date)
    : upTo.sort(function (a, b) { return a.date < b.date ? -1 : 1; }).pop().kg;
  var delta = +(level - goal.targetKg).toFixed(1);
  return { hit: delta <= 0, delta: delta, weightThen: +level.toFixed(1) };
}

var COMP_MIN_POINTS = 3;
var COMP_MIN_SPAN_DAYS = 14;

/* Waist trend vs weight trend. Refuses rather than guessing. */
function compositionSignal(weights, measures) {
  var on = (measures || []).filter(function (m) {
    return m && m.onProtocol && m.date && isFinite(m.waistCm);
  }).sort(function (a, b) { return a.date < b.date ? -1 : 1; });

  if (on.length < COMP_MIN_POINTS) {
    return { status: "insufficient", reason: "צריך לפחות " + COMP_MIN_POINTS + " מדידות לפי הפרוטוקול (יש " + on.length + ")." };
  }
  var span = daysBetween(on[0].date, on[on.length - 1].date);
  if (span < COMP_MIN_SPAN_DAYS) {
    return { status: "insufficient", reason: "צריך לפחות שבועיים בין המדידה הראשונה לאחרונה (יש " + span + " ימים)." };
  }

  var waistDelta = on[on.length - 1].waistCm - on[0].waistCm;
  var ws = (weights || []).filter(function (w) { return w && w.date && isFinite(w.kg); });
  if (ws.length < 2) return { status: "insufficient", reason: "אין מספיק שקילות." };

  // Fit across the measurement window, so the weight delta is compared
  // over exactly the same span as the waist delta.
  var fit = trendFit(ws, span + 1, on[on.length - 1].date);
  if (!fit) return { status: "insufficient", reason: "אין מספיק שקילות בטווח המדידות." };
  var weightDelta = fit.levelAt(on[on.length - 1].date) - fit.levelAt(on[0].date);

  var status, headline, detail;
  if (weightDelta < -0.5 && waistDelta < -1.0) {
    status = "fat";
    headline = "המשקל יורד והמותן יורדת איתו";
    detail = "זה הדפוס שמתאים לירידה בשומן.";
  } else if (weightDelta < -0.5 && waistDelta > -0.5) {
    status = "flag";
    headline = "המשקל יורד אבל המותן כמעט לא";
    detail = "יכול להיות מים, יכול להיות איבוד מסה רזה, ויכול להיות שהסרט לא נמדד באותו מקום. שווה לבדוק את שלושתם.";
  } else if (weightDelta > -0.5 && waistDelta < -1.0) {
    status = "recomp";
    headline = "המותן יורדת אבל המשקל עומד";
    detail = "לרוב סימן טוב — שינוי בהרכב הגוף שהמשקל לבדו לא מראה.";
  } else {
    status = "flat";
    headline = "אין תנועה משמעותית";
    detail = "לא במשקל ולא במותן, בטווח שנמדד.";
  }

  return {
    status: status, headline: headline, detail: detail,
    waistDelta: +waistDelta.toFixed(1),
    weightDelta: +weightDelta.toFixed(1),
    spanDays: span, points: on.length
  };
}

var WAIST_JUMP_CM = 3;
function implausibleWaistDelta(prevWaist, nextWaist) {
  if (!isFinite(prevWaist) || !isFinite(nextWaist)) return false;
  return Math.abs(nextWaist - prevWaist) > WAIST_JUMP_CM;
}

/* ---- fasting ---- */
function getPhase(hours) {
  var h = isFinite(hours) ? Math.max(0, hours) : 0;
  for (var i = 0; i < PHASES.length; i++) {
    if (h >= PHASES[i].from && h < PHASES[i].to) return PHASES[i];
  }
  return PHASES[PHASES.length - 1];
}
function phaseIndex(hours) {
  var p = getPhase(hours);
  return PHASES.indexOf(p);
}
/* Hours until the next phase, or null in the final phase. */
function timeToNextPhase(hours) {
  var p = getPhase(hours);
  if (!isFinite(p.to)) return null;
  return p.to - Math.max(0, hours);
}

function fastStats(history, nowMs) {
  var h = (history || []).filter(function (f) { return f && isFinite(f.start) && isFinite(f.end) && f.end > f.start; });
  if (!h.length) return { count: 0, longestHours: 0, avg7Hours: null, streakDays: 0 };
  var now = isFinite(nowMs) ? nowMs : Date.now();

  var longest = 0;
  h.forEach(function (f) { longest = Math.max(longest, (f.end - f.start) / 3600000); });

  var cutoff = now - 7 * 86400000;
  var recent = h.filter(function (f) { return f.end >= cutoff; });
  var avg7 = recent.length
    ? recent.reduce(function (s, f) { return s + (f.end - f.start) / 3600000; }, 0) / recent.length
    : null;

  // streak: consecutive days (walking back from today) with a fast ENDING that day
  var days = {};
  h.forEach(function (f) { days[todayISO(new Date(f.end))] = true; });
  var streak = 0;
  var cur = new Date(now);
  for (var i = 0; i < 400; i++) {
    var key = todayISO(cur);
    if (days[key]) { streak++; }
    else if (i > 0) { break; }
    cur.setDate(cur.getDate() - 1);
  }

  return {
    count: h.length,
    longestHours: +longest.toFixed(1),
    avg7Hours: avg7 === null ? null : +avg7.toFixed(1),
    streakDays: streak
  };
}

/* ---- misc ---- */
function bmi(kg, heightCm) {
  var m = heightCm / 100;
  return kg / (m * m);
}
function fmtHMS(ms) {
  var s = Math.max(0, Math.floor(ms / 1000));
  return pad2(Math.floor(s / 3600)) + ":" + pad2(Math.floor((s % 3600) / 60)) + ":" + pad2(s % 60);
}
function fmtDur(hours) {
  if (hours === null || !isFinite(hours)) return "—";
  var h = Math.floor(hours), m = Math.round((hours - h) * 60);
  if (m === 60) { h++; m = 0; }
  return h > 0 ? (h + "ש " + m + "ד") : (m + "ד");
}
function backupStale(lastExportAt, nowMs) {
  if (!lastExportAt) return true;
  var now = isFinite(nowMs) ? nowMs : Date.now();
  return (now - new Date(lastExportAt).getTime()) > 10 * 86400000;
}
function validGoalWeight(kg) { return isFinite(kg) && kg >= 30 && kg <= 250; }

/* expose for the selftest — it must exercise the real implementation */
window.FT = {
  APP_VERSION: APP_VERSION, SCHEMA_VERSION: SCHEMA_VERSION, PHASES: PHASES,
  smoothWeights: smoothWeights, nextGoal: nextGoal, paceToGoal: paceToGoal,
  goalOutcome: goalOutcome, compositionSignal: compositionSignal,
  implausibleWaistDelta: implausibleWaistDelta, trendSlopePerDay: trendSlopePerDay,
  trendFit: trendFit, loadDoc: loadDoc, saveDoc: saveDoc,
  getPhase: getPhase, phaseIndex: phaseIndex, timeToNextPhase: timeToNextPhase,
  fastStats: fastStats, migrate: migrate, emptyDoc: emptyDoc, normalizeDoc: normalizeDoc,
  daysBetween: daysBetween, todayISO: todayISO, bmi: bmi, fmtDur: fmtDur,
  backupStale: backupStale, validGoalWeight: validGoalWeight,
  lsSet: lsSet, lsGet: lsGet,
  storageState: function () { return { ok: storageOK, note: storageNote }; }
};
