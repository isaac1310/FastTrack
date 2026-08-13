/* FastTrack — fasting timer, weight & body-measurement tracking, goal pacing.
 * Single-user, localStorage only, no backend. Hebrew RTL.
 * Source file; build.mjs inlines this into deploy/index.html.
 */
"use strict";

var APP_VERSION = "2.4.0";
var LS_KEY = "fasttrack.doc";
var SCHEMA_VERSION = 4;

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


/* ============================================================ *
 *  Intake — coffee, alcohol, meat
 *
 *  Only three items, deliberately. This is not calorie tracking; it is
 *  three flags that can explain a stalled week, which weight and fasting
 *  hours alone cannot.
 *
 *  Content rule, same as PHASES: state what is established, and say so when
 *  it is not. Caffeine and alcohol have specific, well-replicated physiology.
 *  Meat beyond protein satiety and thermic effect is contested — so it is
 *  not padded out, and it is not moralised.
 * ============================================================ */
var INTAKE_ITEMS = [
  {
    key: "coffeeBlack", label: "קפה שחור", unit: "כוסות", breaksFast: false, caffeineMg: 100,
    now: "קפאין חוסם קולטני אדנוזין — לא מוסיף אנרגיה, רק מסתיר את תחושת העייפות עד שהוא מתפוגג.",
    fasting: "כוס קפה שחור היא בערך 2 קלוריות. היא לא שוברת צום, וגם תה ירוק או שחור בלי סוכר וחלב לא.",
    effect: "מעלה קלות את קצב חילוף החומרים וחמצון השומן לטווח קצר. ההשפעה אמיתית אבל צנועה, ונחלשת עם סבילות.",
    timing: "זמן מחצית החיים של קפאין הוא כ-5 שעות, ומשתנה מאוד בין אנשים (בערך 3–7). קפה של אחר הצהריים עדיין פעיל בגוף בלילה ופוגע בשינה העמוקה — גם אצל מי שנרדם בלי בעיה.",
    caution: null
  },
  {
    key: "coffeeMilk", label: "קפה עם חלב/סוכר", unit: "כוסות", breaksFast: true, caffeineMg: 100,
    now: "מה שמוסיפים לקפה הוא מה שקובע. חלב וסוכר מכניסים קלוריות ומעלים אינסולין.",
    fasting: "שובר את הצום. הקפה עצמו לא הבעיה — התוספת כן.",
    effect: "קפה הפוך גדול יכול להיות ארוחה קטנה מבחינת קלוריות, בלי תחושת השובע של ארוחה.",
    timing: "אותה השפעה של קפאין על השינה כמו קפה שחור.",
    caution: null
  },
  {
    key: "alcohol", label: "אלכוהול", unit: "מנות", breaksFast: true, alcoholUnits: 1,
    now: "הגוף מתייחס לאלכוהול כאל רעל ונותן לפינוי שלו עדיפות על כל דלק אחר.",
    fasting: "שובר את הצום.",
    effect: "כל עוד יש אלכוהול בדם, חמצון השומן מדוכא — הגוף שורף את האלכוהול במקום את השומן. זו ההשפעה הישירה ביותר מבין השלושה על ירידה במשקל. בנוסף: 7 קלוריות לגרם, כמעט בלי ערך תזונתי, והוא מגביר תיאבון ומחליש שליטה על אכילה.",
    timing: "מנה סטנדרטית היא כ-14 גרם אלכוהול — בערך פחית בירה, כוס יין קטנה או שוט. הגוף מפנה בערך מנה אחת בשעה. אלכוהול בערב פוגע במבנה השינה ומדכא שנת REM, גם כשהוא עוזר להירדם.",
    caution: "המספרים כאן הם על ההשפעה המטבולית בלבד. שאלות של כמות בטוחה או תלות הן עניין לרופא, לא לאפליקציה."
  },
  {
    key: "meat", label: "בשר", unit: "מנות", breaksFast: true,
    now: "חלבון הוא המקרו־נוטריינט המשביע ביותר, ובעל האפקט התרמי הגבוה ביותר.",
    fasting: "שובר את הצום.",
    effect: "בערך 20–30% מהקלוריות שבחלבון נשרפות רק כדי לעכל אותו, לעומת 5–10% בפחמימות ו-0–3% בשומן. בגירעון קלורי חלבון מספיק הוא מה ששומר על מסת שריר — כלומר הוא בדיוק מה שגורם לירידה להיות בשומן ולא בשריר.",
    timing: "אין תזמון מיוחד שחשוב למעקב הזה.",
    caution: "מעבר לשובע ולאפקט התרמי, רוב הטענות הבריאותיות על בשר שנויות במחלוקת. העדויות על בשר מעובד חזקות יותר מאלה על בשר אדום לא מעובד. האפליקציה לא נוקטת עמדה מעבר לזה."
  }
];

function intakeItem(key) {
  for (var i = 0; i < INTAKE_ITEMS.length; i++) if (INTAKE_ITEMS[i].key === key) return INTAKE_ITEMS[i];
  return null;
}
function breaksFast(key) { var it = intakeItem(key); return !!(it && it.breaksFast); }

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
    intakeLog: [],
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
    /* v2 → v3 → v4, upgraded in place. Refusing would strand every weigh-in
       already on the phone, and each step is information-preserving. */
    if (parsed && (parsed.schemaVersion === 2 || parsed.schemaVersion === 3)) {
      if (parsed.schemaVersion === 2) {
        parsed.intake = Array.isArray(parsed.intake) ? parsed.intake : [];
        parsed.schemaVersion = 3;
      }
      if (parsed.schemaVersion === 3) {
        /* v3 stored day counts; v4 stores timestamped events so the live body
           status can decay a dose. Old counts have no time, so they land at
           noon flagged approx: they still count toward daily and weekly
           totals but are excluded from "how much is in you now", which is
           meaningless for a past day anyway. Nothing is dropped. */
        var log = Array.isArray(parsed.intakeLog) ? parsed.intakeLog : [];
        (Array.isArray(parsed.intake) ? parsed.intake : []).forEach(function (row) {
          if (!row || !row.date) return;
          var noon = new Date(row.date + "T12:00:00").getTime();
          INTAKE_ITEMS.forEach(function (it) {
            var c = Math.max(0, Math.round(Number(row[it.key]) || 0));
            for (var i = 0; i < c; i++) {
              log.push({ at: noon + i * 60000, key: it.key, approx: true });
            }
          });
        });
        log.sort(function (a, b) { return a.at - b.at; });
        parsed.intakeLog = log;
        delete parsed.intake;
        parsed.schemaVersion = 4;
      }
      return { doc: normalizeDoc(parsed), migrated: true };
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
  d.intakeLog = Array.isArray(d.intakeLog) ? d.intakeLog : [];
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

/* One weigh-in per day, always. Returns a NEW sorted array plus whatever it
 * displaced, so the caller can offer an undo. Two rows on one date would be
 * double-counted by the trend fit, so this invariant is enforced in one place
 * rather than at each call site. */
function upsertWeight(weights, date, kg) {
  var list = (weights || []).filter(function (w) { return w && w.date && isFinite(w.kg); });
  var replaced = list.filter(function (w) { return w.date === date; })[0] || null;
  var next = list.filter(function (w) { return w.date !== date; });
  next.push({ date: date, kg: +Number(kg).toFixed(1) });
  next.sort(function (a, b) { return a.date < b.date ? -1 : 1; });
  return { weights: next, replaced: replaced ? { date: replaced.date, kg: replaced.kg } : null };
}

/* Move an entry to a different date and/or value. Landing on an occupied date
 * merges into it — the model has no representation for two entries on one day. */
function moveWeight(weights, fromDate, toDate, kg) {
  var without = (weights || []).filter(function (w) { return w && w.date !== fromDate; });
  var r = upsertWeight(without, toDate, kg);
  return { weights: r.weights, merged: !!r.replaced };
}

function isFutureDate(dateStr, todayStr) { return dateStr > (todayStr || todayISO()); }

/* ============================================================ *
 *  Intake events + live body estimates
 *
 *  Intake is stored as a timestamped EVENT LOG, not day counts. Counts are
 *  derived. The reason is the live status card: without a time per cup there
 *  is no way to say how much caffeine is still circulating, and a status card
 *  that ignores the coffee you drank an hour ago is not a status card.
 *
 *  Tapping + records the time automatically, so this costs no extra taps.
 *  Backdated entries get noon and are marked approx — they still count toward
 *  daily and weekly totals, but they are excluded from the live estimates,
 *  because "how much is in you now" is meaningless for a past day.
 * ============================================================ */

/* ---- timelines: what to expect at N hours since the last dose ----
 *
 * Distinct from caffeineNow()/alcoholNow(), which say how much is still in
 * you. This says what stage you are in and what people typically feel there —
 * the thing that explains "last coffee 8 hours ago and I have a headache".
 *
 * Withdrawal figures are the well-replicated ones (onset 12-24h, peak 20-51h,
 * duration 2-9 days). They apply to REGULAR users; an occasional drinker does
 * not get withdrawal, and the copy says so rather than implying everyone does.
 */
var CAFFEINE_TIMELINE = [
  {
    from: 0, to: 1, label: "ספיגה",
    now: "הקפאין נספג. רמת השיא בדם מגיעה בערך 30–60 דקות אחרי השתייה.",
    feel: "ההשפעה מתחילה להיות מורגשת.",
    helps: "אם המטרה היא ערנות לפעילות — זה הזמן."
  },
  {
    from: 1, to: 5, label: "שיא ההשפעה",
    now: "רוב הקפאין עדיין בגוף וחוסם קולטני אדנוזין.",
    feel: "ערנות, לפעמים גם דופק מהיר יותר או חוסר שקט.",
    helps: "לשתות מים. קפאין נוסף עכשיו בעיקר יידחה את הירידה, לא יגביר אותה."
  },
  {
    from: 5, to: 10, label: "ירידה",
    now: "בערך חצי מהקפאין כבר פונה. האדנוזין שהצטבר בינתיים נקשר לקולטנים שהתפנו.",
    feel: "כאן מגיעה \"הנפילה\" שהרבה מדווחים עליה: עייפות פתאומית, ולפעמים כאב ראש קל.",
    helps: "מים. אם זה שעה מוקדמת — כוס נוספת אפשרית; אם זה אחר הצהריים, היא תיפגע בשינה."
  },
  {
    from: 10, to: 24, label: "חלון תחילת גמילה",
    now: "כמעט כל הקפאין פונה. אצל מי ששותה קפה באופן קבוע, זה החלון שבו תסמיני גמילה מתחילים — בדרך כלל 12 עד 24 שעות אחרי המנה האחרונה.",
    feel: "כאב ראש הוא התסמין הנפוץ ביותר, ומופיע אצל כמחצית ממי שנגמל. לצידו עייפות, קושי בריכוז, עצבנות ומצב רוח ירוד. מי ששותה קפה רק מדי פעם לא אמור להרגיש את זה.",
    helps: "מים, ואם אתה בצום — גם מלח: חוסר נתרן גורם לכאב ראש דומה, וקל לבלבל בין השניים. כוס קפה תפסיק את זה תוך כחצי שעה, אבל גם תאפס את השעון."
  },
  {
    from: 24, to: 51, label: "שיא הגמילה",
    now: "אין קפאין בגוף. אם יש גמילה, זה בדרך כלל השלב החזק שלה.",
    feel: "כאב ראש, עייפות ותחושה דמוית שפעת קלה. חולף מעצמו.",
    helps: "מים, מנוחה, ומשככי כאבים רגילים אם צריך."
  },
  {
    from: 51, to: Infinity, label: "אחרי הגמילה",
    now: "תסמיני גמילה נמשכים בדרך כלל בין יומיים לתשעה ימים ואז נעלמים. הסבילות לקפאין יורדת חזרה.",
    feel: "בדרך כלל שום דבר מיוחד.",
    helps: "אם תחזור לקפה, המנה הראשונה תרגיש חזקה יותר מכפי שהיא."
  }
];

var ALCOHOL_TIMELINE = [
  {
    from: 0, to: 1.5, label: "ספיגה ושיא",
    now: "רמת האלכוהול בדם מגיעה לשיא בערך 30–90 דקות אחרי השתייה.",
    feel: "ההשפעה הכי חזקה.",
    helps: "מים לצד כל מנה. לא לנהוג."
  },
  {
    from: 1.5, to: 6, label: "פינוי",
    now: "הכבד מפנה בערך מנה אחת בשעה. כל עוד יש אלכוהול בדם, חמצון השומן מדוכא.",
    feel: "ההשפעה נחלשת בהדרגה. תיאבון מוגבר זה חלק מזה.",
    helps: "מים. אם זה לפני השינה — כדאי לדעת שהשינה תיפגע גם אם תירדם מהר."
  },
  {
    from: 6, to: 16, label: "השפעת לילה והתאוששות",
    now: "האלכוהול כבר פונה, אבל ההשפעה על השינה נמשכת: הוא מדכא שנת REM בחצי הראשון של הלילה וגורם לשינה מקוטעת בחצי השני.",
    feel: "עייפות למרות שעות שינה מלאות, יובש, כאב ראש. תסמיני ההנגאובר מגיעים לשיא דווקא כשהאלכוהול כבר ירד לאפס.",
    helps: "מים ומלח. אוכל. אם אתה בצום — לשקול לדחות אותו, גוף מיובש וצום לא הולכים טוב יחד."
  },
  {
    from: 16, to: Infinity, label: "חזרה לקו הבסיס",
    now: "ההשפעות המטבוליות והשינתיות חלפו.",
    feel: "בדרך כלל שום דבר.",
    helps: "—"
  }
];

/* Common non-obvious confusions worth surfacing rather than letting the user
 * misattribute. Keyed to the state the app can actually observe. */
var HEADACHE_NOTE = "כאב ראש עכשיו יכול להיות משתי סיבות שונות, והאפליקציה לא יכולה לדעת איזו: ירידה ברמת הקפאין, או חוסר נתרן מהצום. קורט מלח במים בודק את השנייה תוך כ-20 דקות.";

var CAFFEINE_HALF_LIFE_H = 5;   // typical; real range ~3-7h between people
var CAFFEINE_SLEEP_MG = 30;     // rough threshold where a dose stops mattering for sleep
var ALCOHOL_CLEAR_PER_H = 1;    // standard drinks cleared per hour, approx

function intakeEvents(log, fromMs, toMs) {
  return (log || []).filter(function (e) {
    if (!e || !isFinite(e.at) || !intakeItem(e.key)) return false;
    if (isFinite(fromMs) && e.at < fromMs) return false;
    if (isFinite(toMs) && e.at > toMs) return false;
    return true;
  });
}

function dayBounds(dateISO) {
  var a = new Date(dateISO + "T00:00:00");
  var b = new Date(dateISO + "T00:00:00");
  b.setDate(b.getDate() + 1);
  return { from: a.getTime(), to: b.getTime() - 1 };
}

function addIntakeEvent(log, key, atMs, approx) {
  if (!intakeItem(key)) return { log: (log || []).slice(), added: false };
  var next = (log || []).slice();
  next.push({ at: atMs, key: key, approx: !!approx });
  next.sort(function (a, b) { return a.at - b.at; });
  return { log: next, added: true };
}

/* Removes the most recent event of that item on that day — the natural
 * inverse of tapping +. */
function removeIntakeEvent(log, key, dateISO) {
  var b = dayBounds(dateISO);
  var idx = -1;
  (log || []).forEach(function (e, i) {
    if (e && e.key === key && e.at >= b.from && e.at <= b.to) {
      if (idx === -1 || e.at > log[idx].at) idx = i;
    }
  });
  if (idx === -1) return { log: (log || []).slice(), removed: false };
  var next = (log || []).slice();
  next.splice(idx, 1);
  return { log: next, removed: true };
}

function intakeCountsOn(log, dateISO) {
  var b = dayBounds(dateISO);
  var out = {};
  INTAKE_ITEMS.forEach(function (it) { out[it.key] = 0; });
  intakeEvents(log, b.from, b.to).forEach(function (e) { out[e.key] = (out[e.key] || 0) + 1; });
  return out;
}

function intakeCountsBetween(log, fromISO, toISO) {
  var from = dayBounds(fromISO).from, to = dayBounds(toISO).to;
  var out = {};
  INTAKE_ITEMS.forEach(function (it) { out[it.key] = 0; });
  intakeEvents(log, from, to).forEach(function (e) { out[e.key] = (out[e.key] || 0) + 1; });
  return out;
}

/* Caffeine still in the body, by first-order decay from each dose.
 *
 * This is an ESTIMATE built from typical values, not a measurement: a cup is
 * assumed to be ~100mg (real cups range roughly 60-200mg) and the half-life
 * ~5h (real range ~3-7h, and longer on some medications, shorter in smokers).
 * The UI must present it as an estimate. */
function caffeineNow(log, nowMs) {
  var now = isFinite(nowMs) ? nowMs : Date.now();
  var mg = 0, lastDose = null;
  intakeEvents(log, now - 48 * 3600000, now).forEach(function (e) {
    if (e.approx) return;
    var it = intakeItem(e.key);
    if (!it || !it.caffeineMg) return;
    var hours = (now - e.at) / 3600000;
    if (hours < 0) return;
    mg += it.caffeineMg * Math.pow(0.5, hours / CAFFEINE_HALF_LIFE_H);
    if (lastDose === null || e.at > lastDose) lastDose = e.at;
  });
  if (mg < 1) return { mg: 0, lastDoseAt: lastDose, clearAtMs: null };

  // when the current amount decays below the sleep-relevant threshold
  var hoursToThreshold = mg > CAFFEINE_SLEEP_MG
    ? Math.log(mg / CAFFEINE_SLEEP_MG) / Math.log(2) * CAFFEINE_HALF_LIFE_H
    : 0;
  return {
    mg: Math.round(mg),
    lastDoseAt: lastDose,
    clearAtMs: now + hoursToThreshold * 3600000,
    hoursToThreshold: +hoursToThreshold.toFixed(2)
  };
}

/* Hours since the last real (non-backdated) dose of a group of items.
 * Returns null when there has never been one. */
function hoursSinceLast(log, keys, nowMs) {
  var now = isFinite(nowMs) ? nowMs : Date.now();
  var last = null;
  (log || []).forEach(function (e) {
    if (!e || !isFinite(e.at) || e.approx) return;
    if (keys.indexOf(e.key) === -1) return;
    if (e.at > now) return;
    if (last === null || e.at > last) last = e.at;
  });
  if (last === null) return null;
  return { at: last, hours: (now - last) / 3600000 };
}

function timelineStage(timeline, hours) {
  if (hours === null || !isFinite(hours)) return null;
  for (var i = 0; i < timeline.length; i++) {
    if (hours >= timeline[i].from && hours < timeline[i].to) return timeline[i];
  }
  return timeline[timeline.length - 1];
}

var CAFFEINE_KEYS = ["coffeeBlack", "coffeeMilk"];
var ALCOHOL_KEYS = ["alcohol"];

/* "Last coffee 8 hours ago" + what stage that is + what people feel there. */
function caffeineSince(log, nowMs) {
  var s = hoursSinceLast(log, CAFFEINE_KEYS, nowMs);
  if (!s) return null;
  var stage = timelineStage(CAFFEINE_TIMELINE, s.hours);
  var next = CAFFEINE_TIMELINE[CAFFEINE_TIMELINE.indexOf(stage) + 1] || null;
  return {
    at: s.at, hours: +s.hours.toFixed(2), stage: stage,
    nextLabel: next ? next.label : null,
    hoursToNext: next && isFinite(stage.to) ? +(stage.to - s.hours).toFixed(2) : null
  };
}

function alcoholSince(log, nowMs) {
  var s = hoursSinceLast(log, ALCOHOL_KEYS, nowMs);
  if (!s) return null;
  var stage = timelineStage(ALCOHOL_TIMELINE, s.hours);
  var next = ALCOHOL_TIMELINE[ALCOHOL_TIMELINE.indexOf(stage) + 1] || null;
  return {
    at: s.at, hours: +s.hours.toFixed(2), stage: stage,
    nextLabel: next ? next.label : null,
    hoursToNext: next && isFinite(stage.to) ? +(stage.to - s.hours).toFixed(2) : null
  };
}

/* True when a headache now has two plausible causes the app can see at once:
 * caffeine falling AND a fast deep enough to be flushing sodium. Surfaced so
 * the user doesn't confidently blame the wrong one. */
function headacheAmbiguous(log, fastingHours, nowMs) {
  var c = caffeineSince(log, nowMs);
  var caffeineFalling = !!c && c.hours >= 5;
  var sodiumWindow = isFinite(fastingHours) && fastingHours >= 10;
  return caffeineFalling && sodiumWindow;
}

/* Standard drinks still to clear, at roughly one per hour.
 * Zero-order elimination, which is how ethanol actually clears — unlike
 * caffeine it is not a half-life curve. */
function alcoholNow(log, nowMs) {
  var now = isFinite(nowMs) ? nowMs : Date.now();
  var events = intakeEvents(log, now - 24 * 3600000, now).filter(function (e) {
    return !e.approx && intakeItem(e.key) && intakeItem(e.key).alcoholUnits;
  }).sort(function (a, b) { return a.at - b.at; });
  if (!events.length) return { units: 0, clearAtMs: null };

  // drinks queue: each is cleared in turn at ALCOHOL_CLEAR_PER_H
  var clearedUntil = events[0].at;
  events.forEach(function (e) {
    var start = Math.max(clearedUntil, e.at);
    clearedUntil = start + (intakeItem(e.key).alcoholUnits / ALCOHOL_CLEAR_PER_H) * 3600000;
  });
  if (clearedUntil <= now) return { units: 0, clearAtMs: null };
  var units = (clearedUntil - now) / 3600000 * ALCOHOL_CLEAR_PER_H;
  return { units: +units.toFixed(2), clearAtMs: clearedUntil };
}

/* Counts for one day, derived from the event log. */
function intakeOn(log, dateISO) { return intakeCountsOn(log, dateISO); }

/* Counts across an inclusive date range, derived from the event log. */
function intakeTotals(log, fromISO, toISO) {
  var today = todayISO();
  return intakeCountsBetween(log, fromISO || "1970-01-01", toISO || today);
}

/* Monday-based week key, so a week is a week regardless of locale. */
function weekStart(dateISO) {
  var d = new Date(dateISO + "T12:00:00");
  var dow = (d.getDay() + 6) % 7; // Mon=0
  d.setDate(d.getDate() - dow);
  return todayISO(d);
}

/* Weekly intake totals paired with the weight change over that same week.
 *
 * This deliberately does NOT compute a correlation coefficient or claim
 * causation. With five weeks of data before Paris, n is far too small for
 * either to mean anything, and a confident-looking number would be worse
 * than no number. It lays the columns side by side and lets you look. */
function intakeByWeek(weights, intake, maxWeeks) {
  var ws = (weights || []).filter(function (w) { return w && w.date && isFinite(w.kg); });
  if (!ws.length) return [];
  var fit = trendFit(ws, null);
  if (!fit) return [];

  var weeks = {};
  ws.forEach(function (w) {
    var k = weekStart(w.date);
    if (!weeks[k]) weeks[k] = { week: k, from: w.date, to: w.date };
    if (w.date < weeks[k].from) weeks[k].from = w.date;
    if (w.date > weeks[k].to) weeks[k].to = w.date;
  });

  var out = Object.keys(weeks).sort().map(function (k) {
    var wk = weeks[k];
    var end = todayISO(new Date(new Date(k + "T12:00:00").getTime() + 6 * 86400000));
    // weekly weight change from a fit local to that week, so a single noisy
    // weigh-in at a week boundary doesn't dominate the number
    var inWeek = ws.filter(function (w) { return w.date >= k && w.date <= end; });
    var f = inWeek.length >= 2 ? trendFit(inWeek, null) : null;
    var delta = f ? +(f.slopePerDay * 7).toFixed(2) : null;
    return {
      week: k, weekEnd: end, points: inWeek.length,
      deltaKg: delta,
      totals: intakeTotals(intake, k, end)
    };
  });

  if (isFinite(maxWeeks) && out.length > maxWeeks) out = out.slice(out.length - maxWeeks);
  return out;
}

var INTAKE_MIN_WEEKS = 4;

/* Refuses a read below INTAKE_MIN_WEEKS, same discipline as compositionSignal. */
function intakeObservation(weights, intake) {
  var weeks = intakeByWeek(weights, intake).filter(function (w) { return w.deltaKg !== null; });
  if (weeks.length < INTAKE_MIN_WEEKS) {
    return {
      status: "insufficient",
      weeks: weeks.length,
      reason: "צריך לפחות " + INTAKE_MIN_WEEKS + " שבועות עם שקילות כדי להשוות בכלל (יש " + weeks.length + ")."
    };
  }
  var any = weeks.some(function (w) {
    return INTAKE_ITEMS.some(function (it) { return w.totals[it.key] > 0; });
  });
  if (!any) return { status: "nodata", weeks: weeks.length, reason: "עדיין לא רשמת צריכה." };

  // best and worst week by weight change, for side-by-side display only
  var sorted = weeks.slice().sort(function (a, b) { return a.deltaKg - b.deltaKg; });
  return {
    status: "ok", weeks: weeks.length,
    best: sorted[0], worst: sorted[sorted.length - 1],
    all: weeks
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
  upsertWeight: upsertWeight, moveWeight: moveWeight, isFutureDate: isFutureDate,
  INTAKE_ITEMS: INTAKE_ITEMS, intakeItem: intakeItem, breaksFast: breaksFast,
  addIntakeEvent: addIntakeEvent, removeIntakeEvent: removeIntakeEvent,
  intakeEvents: intakeEvents, dayBounds: dayBounds,
  caffeineNow: caffeineNow, alcoholNow: alcoholNow,
  caffeineSince: caffeineSince, alcoholSince: alcoholSince,
  hoursSinceLast: hoursSinceLast, timelineStage: timelineStage,
  headacheAmbiguous: headacheAmbiguous, HEADACHE_NOTE: HEADACHE_NOTE,
  CAFFEINE_TIMELINE: CAFFEINE_TIMELINE, ALCOHOL_TIMELINE: ALCOHOL_TIMELINE,
  CAFFEINE_HALF_LIFE_H: CAFFEINE_HALF_LIFE_H, CAFFEINE_SLEEP_MG: CAFFEINE_SLEEP_MG,
  intakeOn: intakeOn, intakeTotals: intakeTotals,
  intakeByWeek: intakeByWeek, intakeObservation: intakeObservation,
  weekStart: weekStart,
  getPhase: getPhase, phaseIndex: phaseIndex, timeToNextPhase: timeToNextPhase,
  fastStats: fastStats, migrate: migrate, emptyDoc: emptyDoc, normalizeDoc: normalizeDoc,
  daysBetween: daysBetween, todayISO: todayISO, bmi: bmi, fmtDur: fmtDur,
  backupStale: backupStale, validGoalWeight: validGoalWeight,
  lsSet: lsSet, lsGet: lsGet,
  storageState: function () { return { ok: storageOK, note: storageNote }; }
};
