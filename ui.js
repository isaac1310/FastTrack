/* FastTrack — UI layer (v2.1.0, post design review).
 *
 * render() rebuilds the DOM on real state changes only.
 * tick() runs every second and patches ONLY text/geometry by id —
 * it must never touch innerHTML on a container holding an input, or an
 * open date picker closes mid-use. That bug shipped in v1; this split is the fix.
 */
"use strict";

var doc = null;
var loadError = null;
var migrated = false;

/* transient view state (not persisted) */
var view = {
  protocol: 16,
  customHours: 16,
  showStartEdit: false,
  startEditValue: "",
  showPhaseGuide: false,
  showGoalForm: false,
  editingGoalId: null,
  showMeasureForm: false,
  chartAllGoals: false,
  editingWeightDate: null,
  showAllWeights: false,
  showBackdate: false,
  backdateValue: null,
  bannerDismissed: {},
  undo: null,
  undoTimer: null,
  toastMsg: null
};

var WEEKDAYS = ["יום ראשון", "יום שני", "יום שלישי", "יום רביעי", "יום חמישי", "יום שישי", "שבת"];

/* ---------- demo seeding, for design review ---------- */
function seedDemo(kind) {
  var d = FT.emptyDoc();
  d.profile = { heightCm: 169, startWeight: 76, startDate: "2026-07-21", thighSide: "right" };
  d.goals = [
    { id: "g_paris", label: "פריז", date: "2026-09-18", targetKg: 70, deletedAt: null },
    { id: "g_long", label: "יעד ארוך טווח", date: "2026-12-31", targetKg: 66, deletedAt: null }
  ];
  if (kind === "empty") { d.goals = []; d.weights = []; return d; }

  var base = 76, slope = kind === "behind" ? -0.035 : -0.13;
  var noise = [0.4, -0.3, 0.15, 0.6, -0.5, 0.2, -0.1, 0.45, -0.35, 0.05,
               0.3, -0.6, 0.25, 0.1, -0.2, 0.5, -0.45, 0.15, 0.35, -0.25, 0.1, 0.4];
  var start = new Date("2026-07-21T12:00:00");
  for (var i = 0; i < 22; i++) {
    var dt = new Date(start); dt.setDate(dt.getDate() + i);
    if (i === 9 || i === 15) continue;
    d.weights.push({ date: FT.todayISO(dt), kg: +(base + slope * i + noise[i]).toFixed(1) });
  }
  d.measures = [
    { date: "2026-07-21", waistCm: 98.5, thighCm: 58.0, onProtocol: true },
    { date: "2026-07-28", waistCm: 97.4, thighCm: 57.6, onProtocol: true },
    { date: "2026-08-04", waistCm: 96.2, thighCm: 57.5, onProtocol: true },
    { date: "2026-08-09", waistCm: 99.0, thighCm: 57.4, onProtocol: false }
  ];
  var now = Date.now();
  d.fastHistory = [
    { start: now - 4 * 86400000 - 17 * 3600000, end: now - 4 * 86400000, protocolHours: 16 },
    { start: now - 3 * 86400000 - 16.5 * 3600000, end: now - 3 * 86400000, protocolHours: 16 },
    { start: now - 2 * 86400000 - 18.2 * 3600000, end: now - 2 * 86400000, protocolHours: 18 },
    { start: now - 1 * 86400000 - 15.8 * 3600000, end: now - 1 * 86400000, protocolHours: 16 }
  ];
  if (kind !== "idle" && kind !== "behind") {
    d.session = { start: now - 14.4 * 3600000, protocolHours: 18 };
  }
  d.lastExportAt = kind === "behind" ? null : new Date(now - 2 * 86400000).toISOString();
  return d;
}

/* ---------- boot ---------- */
function demoParam() {
  if (window.__DEMO) return window.__DEMO;
  var q = new URLSearchParams(location.search).get("demo");
  if (q) return q;
  return new URLSearchParams(location.hash.replace(/^#/, "")).get("demo") || null;
}

function boot() {
  var demo = demoParam();
  if (demo) {
    doc = seedDemo(demo);
  } else {
    var r = loadDoc();
    if (r.error) { loadError = r.error; doc = null; }
    else { doc = r.doc; migrated = !!r.migrated; if (migrated) saveDoc(doc); }
  }
  render();
  setInterval(tick, 1000);
  registerSW();
}

/* ---------- PWA + reminders ---------- */
function registerSW() {
  if (!("serviceWorker" in navigator) || location.protocol === "file:") return;
  navigator.serviceWorker.register("sw.js").then(function () {
    scheduleReminders();
  }).catch(function () { /* offline shell simply unavailable; app still works */ });
}

/* A service worker can be killed at any time, so the schedule is re-posted on
   every load rather than assumed to survive. Notifications are best-effort;
   the in-app banner is the floor that does not depend on them. */
function scheduleReminders() {
  if (!navigator.serviceWorker || !navigator.serviceWorker.ready) return;
  if (typeof Notification === "undefined" || Notification.permission !== "granted") return;
  navigator.serviceWorker.ready.then(function (reg) {
    if (!reg.active) return;
    var fastTargetInMs = null;
    if (doc.session && doc.session.protocolHours) {
      var end = doc.session.start + doc.session.protocolHours * 3600000;
      if (end > Date.now()) fastTargetInMs = end - Date.now();
    }
    reg.active.postMessage({
      type: "schedule",
      enabled: !!doc.reminders.enabled,
      weighIn: doc.reminders.weighIn,
      fastTargetInMs: fastTargetInMs
    });
  });
}
function persist() { if (doc && !demoParam()) return saveDoc(doc); return true; }

/* ---------- helpers ---------- */
function esc(s) {
  return String(s === null || s === undefined ? "" : s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
/* every number goes through this — see the .n rule in the stylesheet */
function n(v) { return '<span class="n">' + esc(v) + '</span>'; }

function fmtDate(iso) {
  if (!iso) return "";
  var p = iso.split("-");
  return p[2] + "." + p[1] + "." + p[0].slice(2);
}
function fmtDateLong(iso) {
  if (!iso) return "";
  var p = iso.split("-");
  return Number(p[2]) + "." + Number(p[1]) + "." + p[0];
}
function fmtClock(ts) {
  var d = new Date(ts);
  return String(d.getHours()).padStart(2, "0") + ":" + String(d.getMinutes()).padStart(2, "0");
}
function latestWeight() {
  if (!doc.weights.length) return null;
  return doc.weights.slice().sort(function (a, b) { return a.date < b.date ? -1 : 1; }).pop();
}
function activeHours() { return doc.session ? (Date.now() - doc.session.start) / 3600000 : 0; }
function toLocalInput(ts) {
  var d = new Date(ts); d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 16);
}
function protocolName(h) { return h ? h + ":" + (24 - h) : "ללא יעד"; }

function showToast(msg, undoFn) {
  view.toastMsg = msg; view.undo = undoFn || null;
  clearTimeout(view.undoTimer);
  view.undoTimer = setTimeout(function () { view.toastMsg = null; view.undo = null; renderToast(); }, 10000);
  renderToast();
}
function renderToast() {
  var el = document.getElementById("toast");
  if (!view.toastMsg) { el.innerHTML = ""; return; }
  el.innerHTML = '<div class="toastBox"><div class="toast"><span>' + esc(view.toastMsg) + '</span>' +
    (view.undo ? '<button class="btn" style="padding:7px 12px" id="undoBtn">ביטול</button>' : '') +
    '</div></div>';
  var b = document.getElementById("undoBtn");
  if (b) b.onclick = function () {
    if (view.undo) view.undo();
    view.toastMsg = null; view.undo = null; clearTimeout(view.undoTimer);
    persist(); render();
  };
}

/* ============================================================ *
 *  Header
 * ============================================================ */
function header() {
  var now = new Date();
  var dateTxt = WEEKDAYS[now.getDay()] + " · " + n(now.getDate() + "." + (now.getMonth() + 1));
  var on = !!doc.session;
  return '<div class="hdr full">' +
    '<div class="brand"><div class="name">FastTrack</div><div class="date">' + dateTxt + '</div></div>' +
    '<div class="statusChip ' + (on ? "on" : "off") + '" id="statusChip">' +
    '<span class="dot"></span><span id="statusChipTxt">' + (on ? "בצום" : "לא בצום") + '</span></div>' +
    '</div>';
}

/* ============================================================ *
 *  Fasting hero
 * ============================================================ */
var RING_R = 52, RING_C = 2 * Math.PI * RING_R;

function ringDash(pct) {
  var p = Math.max(0, Math.min(1, pct || 0));
  return (RING_C * p).toFixed(1) + " " + RING_C.toFixed(1);
}

/* Ring reads against the protocol target; with no target it reads against
   the next phase boundary rather than sitting permanently empty. */
function ringPct(h, phase, target) {
  if (target) return Math.min(1, h / target);
  if (isFinite(phase.to)) return (h - phase.from) / (phase.to - phase.from);
  return 1;
}

/* Segment widths are sqrt(hours-in-phase): linear widths would give the
   36h phase nine times the width of the four short early phases combined. */
function stripHtml(h) {
  var idx = FT.phaseIndex(h);
  var segs = "";
  for (var i = 0; i < FT.PHASES.length; i++) {
    var p = FT.PHASES[i];
    var span = isFinite(p.to) ? (p.to - p.from) : 24;
    var flex = Math.sqrt(span).toFixed(3);
    var cls = i < idx ? "seg done" : "seg";
    var fill = "";
    if (i === idx && isFinite(p.to)) {
      var pct = Math.max(0, Math.min(1, (h - p.from) / (p.to - p.from)));
      fill = '<div class="fill" id="segFill" style="width:' + (pct * 100).toFixed(1) + '%"></div>';
    } else if (i === idx) {
      fill = '<div class="fill" id="segFill" style="width:100%"></div>';
    }
    segs += '<div class="' + cls + '" style="flex:' + flex + '" data-seg="' + i + '">' + fill + '</div>';
  }
  return '<div class="stripWrap"><div class="strip" id="phaseStrip">' + segs + '</div>' +
    '<div class="axis"><span>0h</span><span>4</span><span>12</span><span>16</span>' +
    '<span>24</span><span>36</span><span class="n">72h+</span></div></div>';
}

function fastingCard() {
  var h = activeHours();
  var phase = FT.getPhase(h);
  var idx = FT.phaseIndex(h);
  var target = doc.session ? doc.session.protocolHours : null;
  var toNext = FT.timeToNextPhase(h);

  if (!doc.session) {
    var html = '<div class="card hero"><div class="cardTitle">התחלת צום</div>';
    html += '<div style="display:flex;gap:8px;flex-wrap:wrap">';
    [16, 18, 20, "custom"].forEach(function (p) {
      var lab = p === "custom" ? "מותאם" : p + ":" + (24 - p);
      html += '<button class="chip ' + (view.protocol === p ? "active" : "") + '" data-proto="' + p + '">' + lab + '</button>';
    });
    html += '</div>';
    if (view.protocol === "custom") {
      html += '<div style="display:flex;gap:8px;align-items:center">' +
        '<input type="number" id="customHours" value="' + view.customHours + '" min="1" max="72" style="width:110px"/>' +
        '<span class="note">שעות</span></div>';
    }
    html += '<button class="linkBtn muted" id="toggleStartEdit" style="text-align:start">כבר בצום? קביעת שעת התחלה</button>';
    if (view.showStartEdit) {
      html += '<input type="datetime-local" id="startEdit" value="' + esc(view.startEditValue) + '"/>';
    }
    html += '<div class="btnRow"><button class="btn gold grow" id="startBtn">התחלת צום</button>' +
      '<button class="btn quiet" id="startFreeBtn">ללא יעד</button></div></div>';
    return html;
  }

  var nextLabel = toNext === null ? "" : FT.PHASES[idx + 1].label;
  var startTxt = "התחלה ";
  var startDay = new Date(doc.session.start).toDateString();
  startTxt += (startDay === new Date().toDateString() ? "היום" : "אתמול") + " ב־";

  var html2 = '<div class="card hero">';
  html2 += '<div class="heroRow">';
  html2 += '<div class="ringBox"><svg width="124" height="124" viewBox="0 0 124 124">' +
    '<circle cx="62" cy="62" r="' + RING_R + '" fill="none" stroke="var(--surface3)" stroke-width="9"></circle>' +
    '<circle id="ringArc" cx="62" cy="62" r="' + RING_R + '" fill="none" stroke="var(--gold)" stroke-width="9" ' +
    'stroke-linecap="round" stroke-dasharray="' + ringDash(ringPct(h, phase, target)) + '" ' +
    'transform="rotate(-90 62 62)" style="transition:stroke-dasharray .6s ease"></circle></svg>' +
    '<div class="ringCenter">' +
    '<div class="ringTime n" id="ringTime">' + fmtHMS(Date.now() - doc.session.start) + '</div>' +
    '<div class="ringSub">' + (target ? "מתוך " + n(target) + " שע׳" : "ללא יעד") + '</div>' +
    '</div></div>';

  html2 += '<div class="heroInfo">' +
    '<div class="eyebrow">שלב נוכחי</div>' +
    '<div class="phase" id="phaseLabel">' + esc(phase.label) + '</div>' +
    '<div class="next" id="nextIn">' + (toNext === null
      ? "השלב האחרון"
      // H:MM, not "1ש 36ד" — a duration string containing Hebrew letters
      // inside an LTR-isolated span reorders and breaks onto two lines
      : "לשלב הבא (" + esc(nextLabel) + ") בעוד <b class=\"n\">" + fmtHM(toNext) + "</b>") + '</div>' +
    '<div class="start">' + startTxt + n(fmtClock(doc.session.start)) +
    ' · פרוטוקול ' + n(protocolName(target)) + '</div>' +
    '</div></div>';

  html2 += stripHtml(h);
  html2 += '<div class="btnRow"><button class="btn grow" id="stopBtn">סיום צום</button>' +
    '<button class="btn quiet" id="toggleStartEdit">עריכת התחלה</button></div>';
  if (view.showStartEdit) {
    html2 += '<input type="datetime-local" id="startEdit" value="' + toLocalInput(doc.session.start) + '"/>';
  }
  if (h >= 24) html2 += '<div class="note">' + esc(REFEED_NOTE) + '</div>';
  html2 += '</div>';
  return html2;
}

/* ============================================================ *
 *  Live status
 * ============================================================ */
function statusCard() {
  if (!doc.session) return "";
  var p = FT.getPhase(activeHours());
  var blocks = [
    ["מה קורה", p.now, "phNow"], ["דלק", p.fuel, "phFuel"],
    ["הורמונים", p.hormones, "phHorm"], ["תחושה", p.feel, "phFeel"],
    ["מה עוזר", p.helps, "phHelps"]
  ];
  var html = '<div class="card"><div class="cardHead">' +
    '<div class="cardTitle">מה קורה עכשיו בגוף</div>' +
    '<div class="hint">גבולות טיפוסיים, לא אישיים</div></div><div class="blocks">';
  blocks.forEach(function (b) {
    html += '<div class="blk"><div class="k">' + b[0] + '</div><div class="v" id="' + b[2] + '">' + esc(b[1]) + '</div></div>';
  });
  html += '</div><div id="phCaution">' + cautionHtml(p) + '</div></div>';
  return html;
}
function cautionHtml(p) {
  return p.caution ? '<div class="blk warn"><div class="k">זהירות</div><div class="v">' + esc(p.caution) + '</div></div>' : "";
}

function phaseGuideCard() {
  var idx = doc.session ? FT.phaseIndex(activeHours()) : -1;
  var html = '<div class="card" style="gap:10px">' +
    '<button class="toggleBtn" id="guideToggle"><span>מדריך השלבים</span>' +
    '<span class="hint" style="font-weight:400">' + (view.showPhaseGuide ? "סגירה ▲" : "כל 7 השלבים ▼") + '</span></button>';
  if (view.showPhaseGuide) {
    html += '<div class="guideRows">';
    FT.PHASES.forEach(function (p, i) {
      var range = isFinite(p.to) ? (p.from + "–" + p.to + "h") : (p.from + "h+");
      html += '<div class="gRow' + (i === idx ? " now" : "") + '">' +
        '<span class="range n">' + range + '</span>' +
        '<span class="label">' + esc(p.label) + (i === idx ? " · עכשיו" : "") + '</span></div>';
    });
    html += '</div>';
  }
  html += '</div>';
  return html;
}

/* ============================================================ *
 *  Next goal
 * ============================================================ */
function paceCard() {
  var g = FT.nextGoal(doc.goals);
  var pace = FT.paceToGoal(g, doc.weights);

  if (!g) {
    return '<div class="card"><div class="cardTitle">היעד הבא</div>' +
      '<div class="empty"><b>אין יעד פעיל</b>יעד הוא תאריך ומשקל. בלעדיו אין קצב ואין תחזית.' +
      '<div style="margin-top:12px"><button class="btn gold" id="addGoalFromEmpty">הוספת יעד</button></div></div></div>';
  }

  var html = '<div class="card"><div class="cardHead" style="align-items:center">' +
    '<div style="display:flex;flex-direction:column;gap:2px;min-width:0">' +
    '<div class="cardTitle">' + esc(g.label || "יעד") + ' · ' + n(fmtDateLong(g.date)) + '</div>';

  if (!pace) {
    html += '<div style="font-size:12px;color:var(--muted)">יעד ' + n(g.targetKg.toFixed(1)) + ' ק״ג</div>' +
      '</div></div><div class="note">עדיין אין שקילות. רשום משקל אחד כדי להתחיל למדוד קצב.</div></div>';
    return html;
  }

  var vTxt = { ahead: "לפני הקצב", onpace: "בקצב", behind: "מאחורי הקצב", unknown: "אין מספיק נתונים" }[pace.verdict];
  var vCls = pace.verdict === "unknown" ? "none" : pace.verdict;

  html += '<div style="font-size:12px;color:var(--muted)">יעד ' + n(g.targetKg.toFixed(1)) +
    ' ק״ג · עוד <b style="font-weight:500;color:var(--text)" class="n">' + Math.max(0, pace.daysLeft) + '</b> ימים</div>' +
    '</div><div class="verdict ' + vCls + '">' + vTxt + '</div></div>';

  var actual = pace.actualKgPerWeek === null ? null : Math.abs(pace.actualKgPerWeek);
  var actualOk = pace.actualKgPerWeek !== null && pace.requiredKgPerWeek !== null &&
    (-pace.actualKgPerWeek) >= pace.requiredKgPerWeek;

  html += '<div class="tiles3">' +
    '<div class="tile"><div class="l">נדרש</div><div class="v n">' +
      (pace.requiredKgPerWeek === null ? "—" : pace.requiredKgPerWeek.toFixed(2)) +
      '</div><div class="u">ק״ג/שבוע</div></div>' +
    '<div class="tile"><div class="l">בפועל</div><div class="v n"' +
      (actualOk ? ' style="color:var(--sage)"' : (pace.verdict === "behind" ? ' style="color:var(--rust)"' : '')) + '>' +
      (actual === null ? "—" : actual.toFixed(2)) + '</div><div class="u">ק״ג/שבוע · ' + n("21") + ' יום</div></div>' +
    '<div class="tile"><div class="l">צפי ליעד</div><div class="v n">' +
      (pace.projectedWeightAtGoal === null ? "—" : pace.projectedWeightAtGoal.toFixed(1)) +
      '</div><div class="u">ק״ג</div></div></div>';

  if (pace.aggressive) {
    html += '<div class="blk warn"><div class="k">קצב תובעני</div><div class="v">הקצב הנדרש הוא ' +
      n(pace.requiredKgPerWeek.toFixed(2)) + ' ק״ג לשבוע, מעל הטווח של ' + n("0.5–1") +
      ' ק״ג לשבוע שנחשב בר-קיימא לרוב האנשים. אפשר להזיז את התאריך או את היעד.</div></div>';
  }
  html += '<div class="note">מבוסס על קו מגמה של ' + n("21") + ' הימים האחרונים, לא על השקילה האחרונה. ' +
    'האפליקציה עוקבת אחרי משקל וצום בלבד — היא לא יודעת מה אכלת, ולכן לא יכולה להסביר למה הקצב השתנה.</div>';
  html += '</div>';
  return html;
}

/* ============================================================ *
 *  Stat tiles + composition signal
 * ============================================================ */
function tilesCard() {
  var sm = FT.smoothWeights(doc.weights);
  var onP = doc.measures.filter(function (m) { return m.onProtocol; })
    .sort(function (a, b) { return a.date < b.date ? -1 : 1; });

  function tile(label, cur, prev) {
    var v = cur === null ? "—" : cur.toFixed(1);
    var d = "", cls = "flat";
    if (cur !== null && prev !== null && isFinite(prev)) {
      var delta = cur - prev;
      cls = delta < -0.05 ? "down" : (delta > 0.05 ? "up" : "flat");
      d = (delta > 0 ? "+" : "") + delta.toFixed(1);
    } else { d = "—"; }
    return '<div class="statTile"><div class="l">' + label + '</div>' +
      '<div class="v n">' + v + '</div><div class="d n ' + cls + '">' + d + '</div></div>';
  }

  var wNow = sm.length ? sm[sm.length - 1].trend : null;
  var wPrev = sm.length > 7 ? sm[sm.length - 8].trend : null;
  var waistNow = onP.length ? onP[onP.length - 1].waistCm : null;
  var waistPrev = onP.length > 1 ? onP[onP.length - 2].waistCm : null;
  var thighNow = onP.length ? onP[onP.length - 1].thighCm : null;
  var thighPrev = onP.length > 1 ? onP[onP.length - 2].thighCm : null;

  var html = '<div class="tiles3">' + tile("משקל", wNow, wPrev) +
    tile("מותן", waistNow, waistPrev) + tile("ירך", thighNow, thighPrev) + '</div>';

  var cs = FT.compositionSignal(doc.weights, doc.measures);
  var col, txt;
  if (cs.status === "insufficient") {
    col = "var(--dim)";
    txt = "אין עדיין מספיק נתונים כדי להפריד שומן משריר. " + esc(cs.reason);
  } else {
    col = cs.status === "flag" ? "var(--rust)" : (cs.status === "flat" ? "var(--muted)" : "var(--sage)");
    txt = esc(cs.headline) + " — " + esc(cs.detail) + " מבוסס על " + n(cs.points) + " מדידות לפי פרוטוקול, על פני " + n(cs.spanDays) + " ימים.";
  }
  html += '<div class="signal"><span class="dot" style="background:' + col + '"></span>' +
    '<div class="txt">' + txt + '</div></div>';
  return html;
}

/* ============================================================ *
 *  Chart
 * ============================================================ */
function chartCard() {
  var VW = 380, VH = 150, padL = 8, padR = 8, padT = 18, padB = 26;
  var sm = FT.smoothWeights(doc.weights);
  var live = doc.goals.filter(function (g) { return !g.deletedAt && g.date && isFinite(g.targetKg); })
    .sort(function (a, b) { return a.date < b.date ? -1 : 1; });
  var today = FT.todayISO();

  var html = '<div class="card"><div class="cardHead"><div class="cardTitle">מגמת משקל</div>' +
    (live.length > 1
      ? '<button class="linkBtn" id="chartRangeToggle">' + (view.chartAllGoals ? "עד היעד הבא" : "כל היעדים") + '</button>'
      : '<div class="hint">' + n("21") + ' ימים אחרונים</div>') + '</div>';

  if (sm.length < 2) {
    html += '<div class="empty">צריך לפחות שתי שקילות כדי לצייר מגמה.</div></div>';
    return html;
  }

  var firstDate = sm[0].date, lastDate = sm[sm.length - 1].date;
  var ng = FT.nextGoal(doc.goals);

  /* Range ends at the NEXT goal, not the furthest. Ending at the furthest
     squeezed three weeks of data into 15% of the width. */
  var endDate = lastDate;
  if (view.chartAllGoals) live.forEach(function (g) { if (g.date > endDate) endDate = g.date; });
  else if (ng && ng.date > endDate) endDate = ng.date;

  var shown = live.filter(function (g) { return g.date >= firstDate && g.date <= endDate; });
  var totalDays = Math.max(1, FT.daysBetween(firstDate, endDate));
  var pace = ng ? FT.paceToGoal(ng, doc.weights) : null;

  var vals = sm.map(function (p) { return p.kg; }).concat(sm.map(function (p) { return p.trend; }));
  shown.forEach(function (g) { vals.push(g.targetKg); });
  if (pace && pace.projectedWeightAtGoal !== null) vals.push(pace.projectedWeightAtGoal);
  var minV = Math.min.apply(null, vals) - 0.5, maxV = Math.max.apply(null, vals) + 0.5;

  var X = function (iso) { return padL + (FT.daysBetween(firstDate, iso) / totalDays) * (VW - padL - padR); };
  var Y = function (v) { return padT + (1 - (v - minV) / (maxV - minV)) * (VH - padT - padB); };

  var svg = '<svg viewBox="0 0 ' + VW + ' ' + VH + '" preserveAspectRatio="none" role="img" aria-label="מגמת משקל">';

  shown.forEach(function (g) {
    var gy = Y(g.targetKg), past = g.date < today;
    var oc = past ? FT.goalOutcome(g, doc.weights) : null;
    var col = past ? (oc && oc.hit ? "var(--sage)" : "var(--rust)") : "var(--gold-deep)";
    svg += '<line x1="' + padL + '" y1="' + gy.toFixed(1) + '" x2="' + (VW - padR) + '" y2="' + gy.toFixed(1) +
      '" stroke="' + col + '" stroke-width="1" stroke-dasharray="4 4"></line>';
    svg += '<circle cx="' + X(g.date).toFixed(1) + '" cy="' + gy.toFixed(1) + '" r="3.5" fill="' + col + '"></circle>';
  });

  if (ng && pace) {
    var x0 = X(today > lastDate ? today : lastDate), y0 = Y(pace.currentTrend);
    svg += '<line x1="' + x0.toFixed(1) + '" y1="' + y0.toFixed(1) + '" x2="' + X(ng.date).toFixed(1) +
      '" y2="' + Y(ng.targetKg).toFixed(1) + '" stroke="var(--dim)" stroke-width="1.2" stroke-dasharray="2 4"></line>';
    if (pace.projectedWeightAtGoal !== null) {
      svg += '<line x1="' + x0.toFixed(1) + '" y1="' + y0.toFixed(1) + '" x2="' + X(ng.date).toFixed(1) +
        '" y2="' + Y(pace.projectedWeightAtGoal).toFixed(1) + '" stroke="' +
        (pace.verdict === "behind" ? "var(--rust)" : "var(--sage)") + '" stroke-width="1.5" stroke-dasharray="3 3"></line>';
    }
  }

  var path = sm.map(function (p, i) {
    return (i === 0 ? "M" : "L") + X(p.date).toFixed(1) + "," + Y(p.trend).toFixed(1);
  }).join(" ");
  svg += '<path d="' + path + '" stroke="var(--gold)" stroke-width="2" fill="none" stroke-linejoin="round"></path>';
  sm.forEach(function (p) {
    svg += '<circle cx="' + X(p.date).toFixed(1) + '" cy="' + Y(p.kg).toFixed(1) + '" r="3" fill="var(--text)"></circle>';
  });
  svg += '</svg>';

  /* Labels are HTML over the SVG, never <text> — Hebrew inside a
     preserveAspectRatio="none" SVG gets stretched and mis-shaped. */
  var labels = "";
  shown.forEach(function (g, i) {
    var pctY = ((Y(g.targetKg) - 6) / VH) * 100;
    var past = g.date < today;
    var oc = past ? FT.goalOutcome(g, doc.weights) : null;
    var col = past ? (oc && oc.hit ? "var(--sage)" : "var(--rust)") : "var(--gold-deep)";
    labels += '<div class="plotLabel" style="inset-inline-start:4px;top:' + pctY.toFixed(1) + '%;color:' + col + '">' +
      esc(g.label || fmtDate(g.date)) + ' · ' + n(g.targetKg.toFixed(1)) + '</div>';
  });
  labels += '<div class="plotLabel" style="inset-inline-end:4px;top:2px;color:var(--muted)">' +
    n(sm[0].kg.toFixed(1)) + '</div>';

  html += '<div class="plot">' + svg + labels + '</div>';
  html += '<div class="legend">' +
    '<span class="i"><span class="swDot"></span>שקילות</span>' +
    '<span class="i"><span class="swLine"></span>מגמה</span>' +
    '<span class="i"><span class="swDash"></span>קצב נדרש</span>' +
    (pace && pace.projectedWeightAtGoal !== null
      ? '<span class="i"><span class="swDash" style="border-color:' +
        (pace.verdict === "behind" ? "var(--rust)" : "var(--sage)") + '"></span>תחזית</span>' : '') +
    '</div>';
  html += '<div class="row" style="border:none;padding:0"><span class="d n">' + fmtDate(firstDate) +
    '</span><span class="d n">' + fmtDate(endDate) + '</span></div>';
  html += '</div>';
  return html;
}

/* ============================================================ *
 *  Log
 * ============================================================ */
var WEIGHT_ROWS = 5;

function logCard() {
  var html = '<div class="card"><div class="cardTitle">רישום</div>';
  html += '<div style="display:flex;gap:8px">' +
    '<input type="number" step="0.1" id="weightInput" placeholder="משקל, ק״ג" style="flex:1"/>' +
    '<button class="btn gold" id="logWeightBtn">שמירה</button></div>';

  /* Quick-add writes to today, which is the common case. Backfilling a
     forgotten day needs an explicit date, but putting a date field in the
     default path adds a tap to every single weigh-in — so it's revealed. */
  if (view.showBackdate) {
    html += '<div style="display:flex;gap:8px;align-items:center">' +
      '<input type="date" id="backdateInput" value="' + esc(view.backdateValue || FT.todayISO()) +
      '" max="' + FT.todayISO() + '"/>' +
      '<button class="linkBtn muted" id="cancelBackdate">ביטול</button></div>';
  } else {
    html += '<button class="linkBtn muted" id="toggleBackdate" style="text-align:start">רישום לתאריך אחר</button>';
  }

  var sorted = doc.weights.slice().sort(function (a, b) { return a.date < b.date ? 1 : -1; });
  if (sorted.length) {
    var shown = view.showAllWeights ? sorted : sorted.slice(0, WEIGHT_ROWS);
    html += '<div class="rows">';
    shown.forEach(function (w, i) {
      if (view.editingWeightDate === w.date) {
        html += '<div style="background:var(--surface2);border-radius:var(--r-tile);padding:12px;' +
          'display:flex;flex-direction:column;gap:8px">' +
          '<div style="display:flex;gap:8px">' +
          '<input type="date" id="editWeightDate" value="' + esc(w.date) + '" max="' + FT.todayISO() + '"/>' +
          '<input type="number" step="0.1" id="editWeightKg" value="' + w.kg.toFixed(1) + '"/></div>' +
          '<div class="btnRow"><button class="btn gold grow" data-saveweight="' + w.date + '">שמירה</button>' +
          '<button class="btn quiet" id="cancelWeightEdit">ביטול</button></div></div>';
        return;
      }
      // delta is against the next row down, which is the previous weigh-in
      var prev = sorted[sorted.indexOf(w) + 1];
      var d = prev ? w.kg - prev.kg : null;
      var cls = d === null ? "flat" : (d < -0.05 ? "down" : (d > 0.05 ? "up" : "flat"));
      html += '<div class="row"><span class="d n">' + fmtDate(w.date) + '</span>' +
        '<span class="rowVals"><span class="n" style="font-weight:500">' + w.kg.toFixed(1) + '</span>' +
        '<span class="n ' + cls + '">' + (d === null ? "—" : (d > 0 ? "+" : "") + d.toFixed(1)) + '</span>' +
        '<button class="linkBtn" data-editweight="' + w.date + '">עריכה</button>' +
        '<button class="x" data-delweight="' + w.date + '">✕</button></span></div>';
    });
    html += '</div>';
    if (sorted.length > WEIGHT_ROWS) {
      html += '<button class="linkBtn" id="toggleAllWeights">' +
        (view.showAllWeights ? "הצג פחות" : "הצג את כל " + n(sorted.length) + " השקילות") + '</button>';
    }
  }

  html += '<div style="border-top:1px solid var(--border);padding-top:12px;display:flex;flex-direction:column;gap:12px">';
  html += '<div class="cardHead"><div class="cardTitle" style="font-size:14px">מדידות היקפים</div>' +
    '<button class="linkBtn" id="toggleMeasure">' + (view.showMeasureForm ? "סגירה" : "+ מדידה") + '</button></div>';

  if (view.showMeasureForm) {
    html += '<div style="background:var(--surface2);border-radius:var(--r-tile);padding:12px;display:flex;flex-direction:column;gap:10px">';
    html += '<div class="blk"><div class="k">הפרוטוקול</div></div>' +
      '<ul style="margin:0;padding-inline-start:1.1em;color:var(--muted);font-size:12.5px;line-height:1.7">';
    MEASURE_PROTOCOL.forEach(function (p) { html += '<li>' + esc(p) + '</li>'; });
    html += '</ul>';
    html += '<div style="display:flex;gap:8px">' +
      '<input type="number" step="0.1" id="waistInput" placeholder="מותן, ס״מ"/>' +
      '<input type="number" step="0.1" id="thighInput" placeholder="ירך, ס״מ"/></div>';
    html += '<label class="check"><input type="checkbox" id="onProtocol"/>' +
      '<span>נמדד לפי הפרוטוקול. מדידה בלי סימון תישמר ותוצג, אבל לא תיכנס לחישוב המגמה.</span></label>';
    html += '<button class="btn gold" id="saveMeasure">שמירת מדידה</button></div>';
  }

  var ms = doc.measures.slice().sort(function (a, b) { return a.date < b.date ? 1 : -1; }).slice(0, 4);
  if (ms.length) {
    html += '<div class="rows">';
    ms.forEach(function (m) {
      html += '<div class="row"><span class="d n">' + fmtDate(m.date) + '</span>' +
        '<span class="rowVals">' +
        (m.onProtocol ? '' : '<span class="badge" style="color:var(--rust)">מחוץ לפרוטוקול</span>') +
        // labelled, never "a/b" — a bare separator between two isolated
        // numbers gets reordered by RTL and swaps waist with thigh
        '<span style="color:var(--muted);font-size:12px">מותן</span><span class="n" style="font-weight:500">' + m.waistCm.toFixed(1) + '</span>' +
        '<span style="color:var(--muted);font-size:12px">ירך</span><span class="n" style="font-weight:500">' + m.thighCm.toFixed(1) + '</span>' +
        '<button class="x" data-delmeasure="' + m.date + '">✕</button></span></div>';
    });
    html += '</div>';
  }
  html += '<div class="note">מדידת היקפים שבועית — בבוקר, בצום, לפני שתייה. הפרוטוקול המלא מוצג בכל רישום.</div>';
  html += '</div></div>';
  return html;
}

/* ============================================================ *
 *  Goals
 * ============================================================ */
function goalsCard() {
  var live = doc.goals.filter(function (g) { return !g.deletedAt; })
    .sort(function (a, b) { return a.date < b.date ? -1 : 1; });
  var today = FT.todayISO();
  var ng = FT.nextGoal(doc.goals);

  var html = '<div class="card" style="gap:10px"><div class="cardHead" style="align-items:center">' +
    '<div class="cardTitle">יעדים</div>' +
    '<button class="linkBtn" id="toggleGoalForm">' + (view.showGoalForm ? "סגירה" : "+ הוספה") + '</button></div>';

  if (view.showGoalForm) {
    html += '<div style="background:var(--surface2);border-radius:var(--r-tile);padding:12px;display:flex;flex-direction:column;gap:8px">' +
      '<input type="text" id="goalLabel" placeholder="שם (אופציונלי)"/>' +
      '<div style="display:flex;gap:8px"><input type="date" id="goalDate"/><input type="number" step="0.1" id="goalKg" placeholder="ק״ג"/></div>' +
      '<button class="btn gold" id="saveGoal">שמירת יעד</button></div>';
  }

  if (!live.length) {
    html += '<div class="empty"><b>אין יעדים</b>יעד הוא תאריך ומשקל. אפשר להוסיף כמה שרוצים לאורך הזמן.</div>';
  } else {
    live.forEach(function (g) {
      if (view.editingGoalId === g.id) {
        html += '<div style="background:var(--surface2);border-radius:var(--r-tile);padding:12px;display:flex;flex-direction:column;gap:8px">' +
          '<input type="text" id="editLabel" value="' + esc(g.label || "") + '"/>' +
          '<div style="display:flex;gap:8px"><input type="date" id="editDate" value="' + esc(g.date) + '"/>' +
          '<input type="number" step="0.1" id="editKg" value="' + g.targetKg + '"/></div>' +
          '<div class="btnRow"><button class="btn gold grow" data-savegoal="' + g.id + '">שמירה</button>' +
          '<button class="btn quiet" id="cancelEdit">ביטול</button></div></div>';
        return;
      }
      var past = g.date < today;
      var badge, col;
      if (past) {
        var oc = FT.goalOutcome(g, doc.weights);
        if (oc) { badge = oc.hit ? "הושג" : "+" + oc.delta.toFixed(1); col = oc.hit ? "var(--sage)" : "var(--rust)"; }
        else { badge = "עבר"; col = "var(--dim)"; }
      } else if (ng && ng.id === g.id) { badge = "פעיל"; col = "var(--gold)"; }
      else { badge = "עתידי"; col = "var(--dim)"; }

      html += '<div class="row">' +
        '<div style="display:flex;flex-direction:column;gap:1px;min-width:0">' +
        '<span style="font-size:14px;font-weight:500">' + esc(g.label || fmtDate(g.date)) + '</span>' +
        '<span class="n" style="font-size:11.5px;color:var(--dim)">' + fmtDate(g.date) + '</span></div>' +
        '<span class="rowVals">' +
        '<span class="n" style="font-size:14px;font-weight:500">' + g.targetKg.toFixed(1) + '</span>' +
        '<span class="badge" style="color:' + col + '">' + badge + '</span>' +
        '<button class="linkBtn" data-editgoal="' + g.id + '">עריכה</button>' +
        '<button class="x" data-delgoal="' + g.id + '">✕</button></span></div>';
    });
  }
  html += '</div>';
  return html;
}

/* ============================================================ *
 *  History + settings
 * ============================================================ */
function fmtHM(hours) {
  if (hours === null || !isFinite(hours)) return "—";
  var h = Math.floor(hours), m = Math.round((hours - h) * 60);
  if (m === 60) { h++; m = 0; }
  return h + ":" + String(m).padStart(2, "0");
}

function historyCard() {
  var st = FT.fastStats(doc.fastHistory);
  var html = '<div class="card" style="gap:10px"><div class="cardTitle">היסטוריית צומות</div>';
  if (!st.count) {
    html += '<div class="empty">עדיין לא סיימת צום דרך האפליקציה.</div></div>';
    return html;
  }
  html += '<div class="tiles3">' +
    '<div class="tile"><div class="v n">' + st.streakDays + '</div><div class="l">רצף ימים</div></div>' +
    '<div class="tile"><div class="v n">' + fmtHM(st.longestHours) + '</div><div class="l">הכי ארוך</div></div>' +
    '<div class="tile"><div class="v n">' + fmtHM(st.avg7Hours) + '</div><div class="l">ממוצע שבועי</div></div>' +
    '</div></div>';
  return html;
}

function settingsCard() {
  var perm = (typeof Notification !== "undefined") ? Notification.permission : "unsupported";
  var html = '<div class="card" style="gap:10px"><div class="cardTitle">תזכורות וגיבוי</div>';
  html += '<div class="row" style="border:none;padding:0"><span class="d">תזכורות</span>' +
    '<span class="d" style="color:' + (perm === "granted" ? "var(--sage)" : "var(--dim)") + '">' +
    (perm === "granted" ? "פעילות" : perm === "denied" ? "חסומות בדפדפן" : perm === "unsupported" ? "לא נתמך" : "כבויות") + '</span></div>';

  if (perm !== "granted") {
    html += '<button class="btn" id="askNotif">הפעלת תזכורות</button>';
    html += '<div class="note">' + (perm === "denied"
      ? "התזכורות חסומות בהגדרות הדפדפן. עד שזה משתנה, האפליקציה תציג התראה בתוך המסך במקום — היא לא תשלח כלום."
      : "תזכורות עובדות רק כשהאפליקציה מותקנת למסך הבית. עד אז ההתראות מוצגות בתוך המסך בלבד.") + '</div>';
  } else {
    html += '<div class="row" style="border:none;padding:0"><span class="d">שקילה יומית</span>' +
      '<input type="time" id="weighTime" value="' + esc(doc.reminders.weighIn) + '" style="width:130px"/></div>';
  }

  html += '<div class="btnRow"><button class="btn grow" id="exportBtn">ייצוא גיבוי</button>' +
    '<button class="btn grow" id="importBtn">ייבוא</button></div>' +
    '<input type="file" id="importFile" accept="application/json" style="display:none"/>';
  html += '<div class="note">' + (doc.lastExportAt ? "גיבוי אחרון: " + n(fmtDate(doc.lastExportAt.slice(0, 10))) : "עדיין לא גיבית") + '</div>';
  html += '</div>';
  return html;
}

function banners() {
  var html = "";
  if (loadError) html += '<div class="banner warn full"><span>' + esc(loadError) + '</span></div>';
  if (!FT.storageState().ok) {
    html += '<div class="banner warn full"><span>לא ניתן לשמור במכשיר הזה. שינויים לא יישמרו. (' +
      esc(FT.storageState().note) + ')</span></div>';
  }
  if (migrated && !view.bannerDismissed.migrated) {
    html += '<div class="banner info full"><span>הנתונים מהגרסה הקודמת הועברו. היעדים הישנים הפכו לשורות שאפשר לערוך.</span>' +
      '<button class="linkBtn muted" data-dismiss="migrated">סגירה</button></div>';
  }
  var lw = latestWeight();
  if (lw) {
    var gap = FT.daysBetween(lw.date, FT.todayISO());
    if (gap >= 3 && !view.bannerDismissed.weigh) {
      html += '<div class="banner info full"><span>לא נרשמה שקילה כבר ' + n(gap) +
        ' ימים. פערים בנתונים מרעישים את קו המגמה.</span>' +
        '<button class="linkBtn muted" data-dismiss="weigh">סגירה</button></div>';
    }
  }
  var hasData = doc.weights.length + doc.measures.length + doc.fastHistory.length > 0;
  if (hasData && FT.backupStale(doc.lastExportAt) && !view.bannerDismissed.backup) {
    html += '<div class="banner warn full"><span>הנתונים שמורים רק במכשיר הזה ולא גובו לאחרונה. אובדן הטלפון = אובדן הכל.</span>' +
      '<button class="linkBtn muted" data-dismiss="backup">סגירה</button></div>';
  }
  return html;
}

/* ============================================================ *
 *  render / tick
 * ============================================================ */
function render() {
  var app = document.getElementById("app");
  if (!doc) {
    app.innerHTML = '<div class="card full"><div class="cardTitle">לא ניתן לטעון את הנתונים</div>' +
      '<div class="note">' + esc(loadError || "שגיאה לא ידועה") + '</div>' +
      '<div class="note">הנתונים המקוריים לא נמחקו ולא שונו.</div></div>';
    return;
  }

  var colA = fastingCard() + statusCard() + phaseGuideCard();
  var colB = paceCard() + tilesCard() + chartCard() + logCard() + goalsCard() + historyCard() + settingsCard();

  app.innerHTML = header() + banners() +
    '<div class="col">' + colA + '</div>' +
    '<div class="col">' + colB + '</div>' +
    '<div class="foot full">גבולות השלבים הם ערכים טיפוסיים ואינם אישיים. אינו ייעוץ רפואי. ' +
    'קצב של ' + n("0.5–1") + ' ק״ג בשבוע נחשב בטוח ובר-קיימא לרוב האנשים. ' +
    'הנתונים נשמרים במכשיר הזה בלבד. ' + n("v" + FT.APP_VERSION) + '</div>';

  wire();
  renderToast();
}

/* Patches text and geometry only, by id. */
function tick() {
  if (!doc || !doc.session) return;
  var h = activeHours();
  var phase = FT.getPhase(h);
  var idx = FT.phaseIndex(h);
  var target = doc.session.protocolHours;

  var t = document.getElementById("ringTime");
  if (t) t.textContent = fmtHMS(Date.now() - doc.session.start);

  var arc = document.getElementById("ringArc");
  if (arc) arc.setAttribute("stroke-dasharray", ringDash(ringPct(h, phase, target)));

  var fill = document.getElementById("segFill");
  if (fill && isFinite(phase.to)) {
    var pct = Math.max(0, Math.min(1, (h - phase.from) / (phase.to - phase.from)));
    fill.style.width = (pct * 100).toFixed(1) + "%";
  }

  var nx = document.getElementById("nextIn");
  if (nx) {
    var toNext = FT.timeToNextPhase(h);
    nx.innerHTML = toNext === null ? "השלב האחרון"
      : "לשלב הבא (" + esc(FT.PHASES[idx + 1].label) + ") בעוד <b class=\"n\">" + fmtHM(toNext) + "</b>";
  }

  var lbl = document.getElementById("phaseLabel");
  if (lbl && lbl.textContent !== phase.label) {
    // phase boundary crossed — refresh the status text in place, and mark
    // the newly-completed segment without rebuilding the strip
    lbl.textContent = phase.label;
    setText("phNow", phase.now); setText("phFuel", phase.fuel);
    setText("phHorm", phase.hormones); setText("phFeel", phase.feel);
    setText("phHelps", phase.helps);
    var cau = document.getElementById("phCaution");
    if (cau) cau.innerHTML = cautionHtml(phase);
    var strip = document.getElementById("phaseStrip");
    if (strip) {
      for (var i = 0; i < strip.children.length; i++) {
        var seg = strip.children[i];
        seg.className = i < idx ? "seg done" : "seg";
        if (i === idx && !seg.querySelector(".fill")) {
          seg.innerHTML = '<div class="fill" id="segFill" style="width:0%"></div>';
        } else if (i !== idx) {
          seg.innerHTML = "";
        }
      }
    }
  }
}
function setText(id, txt) { var e = document.getElementById(id); if (e) e.textContent = txt; }

/* ============================================================ *
 *  Events
 * ============================================================ */
function on(id, fn, ev) { var e = document.getElementById(id); if (e) e.addEventListener(ev || "click", fn); }
function each(sel, fn) { Array.prototype.forEach.call(document.querySelectorAll(sel), fn); }

function wire() {
  each("[data-proto]", function (b) {
    b.onclick = function () {
      var v = b.getAttribute("data-proto");
      view.protocol = v === "custom" ? "custom" : Number(v);
      render();
    };
  });
  on("customHours", function (e) { view.customHours = e.target.value; }, "change");

  on("toggleStartEdit", function () {
    view.showStartEdit = !view.showStartEdit;
    if (view.showStartEdit && !doc.session && !view.startEditValue) view.startEditValue = toLocalInput(Date.now());
    render();
  });
  on("startEdit", function (e) {
    if (doc.session) {
      if (e.target.value) { doc.session.start = new Date(e.target.value).getTime(); persist(); render(); }
    } else { view.startEditValue = e.target.value; }
  }, "change");

  on("startBtn", function () {
    startFast(view.protocol === "custom" ? (Number(view.customHours) || 16) : view.protocol);
  });
  on("startFreeBtn", function () { startFast(null); });
  on("stopBtn", stopFast);
  on("guideToggle", function () { view.showPhaseGuide = !view.showPhaseGuide; render(); });
  on("chartRangeToggle", function () { view.chartAllGoals = !view.chartAllGoals; render(); });

  on("logWeightBtn", logWeight);
  on("weightInput", function (e) { if (e.key === "Enter") logWeight(); }, "keydown");
  on("toggleBackdate", function () {
    view.showBackdate = true; view.backdateValue = FT.todayISO(); render();
    var el = document.getElementById("weightInput"); if (el) el.focus();
  });
  on("cancelBackdate", function () { view.showBackdate = false; view.backdateValue = null; render(); });
  on("backdateInput", function (e) { view.backdateValue = e.target.value; }, "change");
  on("toggleAllWeights", function () { view.showAllWeights = !view.showAllWeights; render(); });
  each("[data-editweight]", function (b) {
    b.onclick = function () { view.editingWeightDate = b.getAttribute("data-editweight"); render(); };
  });
  on("cancelWeightEdit", function () { view.editingWeightDate = null; render(); });
  each("[data-saveweight]", function (b) {
    b.onclick = function () { saveEditedWeight(b.getAttribute("data-saveweight")); };
  });
  each("[data-delweight]", function (b) {
    b.onclick = function () {
      var date = b.getAttribute("data-delweight");
      var removed = doc.weights.filter(function (w) { return w.date === date; });
      doc.weights = doc.weights.filter(function (w) { return w.date !== date; });
      persist(); render();
      showToast("שקילה נמחקה", function () { doc.weights = doc.weights.concat(removed); });
    };
  });

  on("toggleMeasure", function () { view.showMeasureForm = !view.showMeasureForm; render(); });
  on("saveMeasure", saveMeasure);
  each("[data-delmeasure]", function (b) {
    b.onclick = function () {
      var date = b.getAttribute("data-delmeasure");
      var removed = doc.measures.filter(function (m) { return m.date === date; });
      doc.measures = doc.measures.filter(function (m) { return m.date !== date; });
      persist(); render();
      showToast("מדידה נמחקה", function () { doc.measures = doc.measures.concat(removed); });
    };
  });

  on("toggleGoalForm", function () { view.showGoalForm = !view.showGoalForm; view.editingGoalId = null; render(); });
  on("addGoalFromEmpty", function () { view.showGoalForm = true; render(); });
  on("saveGoal", saveNewGoal);
  on("cancelEdit", function () { view.editingGoalId = null; render(); });
  each("[data-editgoal]", function (b) {
    b.onclick = function () { view.editingGoalId = b.getAttribute("data-editgoal"); view.showGoalForm = false; render(); };
  });
  each("[data-savegoal]", function (b) {
    b.onclick = function () { saveEditedGoal(b.getAttribute("data-savegoal")); };
  });
  each("[data-delgoal]", function (b) {
    b.onclick = function () {
      var id = b.getAttribute("data-delgoal");
      var g = doc.goals.filter(function (x) { return x.id === id; })[0];
      if (!g) return;
      g.deletedAt = new Date().toISOString();
      persist(); render();
      showToast("היעד \"" + (g.label || fmtDate(g.date)) + "\" נמחק", function () { g.deletedAt = null; });
    };
  });

  each("[data-dismiss]", function (b) {
    b.onclick = function () { view.bannerDismissed[b.getAttribute("data-dismiss")] = true; render(); };
  });

  on("askNotif", requestNotifications);
  on("weighTime", function (e) { doc.reminders.weighIn = e.target.value; persist(); scheduleReminders(); }, "change");
  on("exportBtn", exportData);
  on("importBtn", function () { document.getElementById("importFile").click(); });
  on("importFile", function (e) { if (e.target.files[0]) importData(e.target.files[0]); }, "change");
}

/* ---------- actions ---------- */
function startFast(hours) {
  var start = view.startEditValue ? new Date(view.startEditValue).getTime() : Date.now();
  if (!isFinite(start)) start = Date.now();
  doc.session = { start: start, protocolHours: hours };
  view.startEditValue = ""; view.showStartEdit = false;
  persist(); render(); scheduleReminders();
}
function stopFast() {
  if (!doc.session) return;
  var s = doc.session, end = Date.now();
  if (end > s.start) doc.fastHistory.push({ start: s.start, end: end, protocolHours: s.protocolHours });
  doc.session = null; view.showStartEdit = false;
  persist(); render();
  showToast("צום של " + ((end - s.start) / 3600000).toFixed(1) + " שעות נשמר", function () {
    doc.fastHistory.pop(); doc.session = s;
  });
}

function validWeight(kg) { return isFinite(kg) && kg > 20 && kg <= 300; }

function logWeight() {
  var el = document.getElementById("weightInput");
  var kg = parseFloat(String(el.value).replace(",", "."));
  if (!validWeight(kg)) { showToast("משקל לא תקין"); return; }

  var d = (view.showBackdate && view.backdateValue) ? view.backdateValue : FT.todayISO();
  if (FT.isFutureDate(d)) { showToast("אי אפשר לרשום שקילה בעתיד"); return; }

  var before = doc.weights.slice();
  var r = FT.upsertWeight(doc.weights, d, kg);
  doc.weights = r.weights;
  var replaced = r.replaced;
  view.showBackdate = false; view.backdateValue = null;
  // confirm only after the write actually succeeded — a "saved ✓" that
  // can lie is worse than no confirmation at all
  var ok = persist();
  render();
  if (!ok) { showToast("לא ניתן לשמור במכשיר הזה"); return; }
  if (replaced) {
    showToast("הוחלפה השקילה של " + fmtDate(d) + " (" + replaced.kg.toFixed(1) + ")", function () {
      doc.weights = before;
    });
  } else {
    showToast(d === FT.todayISO() ? "נשמר" : "נשמר לתאריך " + fmtDate(d));
  }
}

function saveEditedWeight(origDate) {
  var orig = doc.weights.filter(function (w) { return w.date === origDate; })[0];
  if (!orig) return;
  var newDate = document.getElementById("editWeightDate").value;
  var kg = parseFloat(String(document.getElementById("editWeightKg").value).replace(",", "."));
  if (!newDate) { showToast("צריך תאריך"); return; }
  if (FT.isFutureDate(newDate)) { showToast("אי אפשר לרשום שקילה בעתיד"); return; }
  if (!validWeight(kg)) { showToast("משקל לא תקין"); return; }

  var before = doc.weights.slice();
  var r = FT.moveWeight(doc.weights, origDate, newDate, kg);
  doc.weights = r.weights;

  view.editingWeightDate = null;
  var ok = persist();
  render();
  if (!ok) { showToast("לא ניתן לשמור במכשיר הזה"); return; }
  showToast(r.merged ? "מוזג לשקילה הקיימת של " + fmtDate(newDate) : "עודכן",
    function () { doc.weights = before; });
}

function saveMeasure() {
  var waist = parseFloat(document.getElementById("waistInput").value);
  var thigh = parseFloat(document.getElementById("thighInput").value);
  var onProt = document.getElementById("onProtocol").checked;
  if (!isFinite(waist) || !isFinite(thigh)) { showToast("צריך גם מותן וגם ירך"); return; }

  var prev = doc.measures.filter(function (m) { return m.onProtocol; })
    .sort(function (a, b) { return a.date < b.date ? -1 : 1; }).pop();
  if (prev && FT.implausibleWaistDelta(prev.waistCm, waist)) {
    // warn, never block — bodies do change, but a 4cm jump is usually the tape
    if (!confirm("שינוי של " + Math.abs(waist - prev.waistCm).toFixed(1) +
      " ס״מ במותן מאז המדידה הקודמת. נמדד באותו מקום ובאותם תנאים?\n\nאפשר לשמור בכל מקרה.")) return;
  }

  var d = FT.todayISO();
  doc.measures = doc.measures.filter(function (m) { return m.date !== d; });
  doc.measures.push({ date: d, waistCm: +waist.toFixed(1), thighCm: +thigh.toFixed(1), onProtocol: onProt });
  doc.measures.sort(function (a, b) { return a.date < b.date ? -1 : 1; });
  view.showMeasureForm = false;
  var ok = persist();
  render();
  showToast(ok ? "נשמר" : "לא ניתן לשמור במכשיר הזה");
}

function saveNewGoal() {
  var label = document.getElementById("goalLabel").value.trim();
  var date = document.getElementById("goalDate").value;
  var kg = parseFloat(document.getElementById("goalKg").value);
  if (!date) { showToast("צריך תאריך"); return; }
  if (!FT.validGoalWeight(kg)) { showToast("משקל יעד צריך להיות בין 30 ל-250 ק״ג"); return; }
  var dupe = doc.goals.filter(function (g) { return !g.deletedAt && g.date === date; }).length;
  doc.goals.push({ id: "g_" + Date.now(), label: label, date: date, targetKg: +kg.toFixed(1), deletedAt: null });
  view.showGoalForm = false;
  persist(); render();
  if (dupe) showToast("יש כבר יעד בתאריך הזה — שניהם יוצגו");
}

function saveEditedGoal(id) {
  var g = doc.goals.filter(function (x) { return x.id === id; })[0];
  if (!g) return;
  var date = document.getElementById("editDate").value;
  var kg = parseFloat(document.getElementById("editKg").value);
  if (!date) { showToast("צריך תאריך"); return; }
  if (!FT.validGoalWeight(kg)) { showToast("משקל יעד צריך להיות בין 30 ל-250 ק״ג"); return; }
  g.label = document.getElementById("editLabel").value.trim();
  g.date = date; g.targetKg = +kg.toFixed(1);
  view.editingGoalId = null;
  persist(); render();
}

function exportData() {
  doc.lastExportAt = new Date().toISOString();
  var blob = new Blob([JSON.stringify(doc, null, 2)], { type: "application/json" });
  var a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "fasttrack-" + FT.todayISO() + ".json";
  a.click();
  URL.revokeObjectURL(a.href);
  persist(); render();
}

function importData(file) {
  var reader = new FileReader();
  reader.onload = function () {
    var parsed;
    try { parsed = JSON.parse(reader.result); }
    catch (e) { showToast("הקובץ אינו JSON תקין"); return; }
    if (parsed.schemaVersion > FT.SCHEMA_VERSION) { showToast("הקובץ נשמר בגרסה חדשה יותר — לא ייובא"); return; }
    var r = FT.migrate(JSON.stringify(parsed), null, null);
    if (r.error) { showToast(r.error); return; }
    var before = doc;
    doc = r.doc;
    persist(); render();
    showToast("הנתונים יובאו", function () { doc = before; });
  };
  reader.readAsText(file);
}

function requestNotifications() {
  if (typeof Notification === "undefined") { showToast("הדפדפן הזה לא תומך בתזכורות"); return; }
  Notification.requestPermission().then(function (p) {
    doc.reminders.permission = p;
    doc.reminders.enabled = (p === "granted");
    persist(); render(); scheduleReminders();
    showToast(p === "granted" ? "תזכורות הופעלו" : "התזכורות לא הופעלו — ההתראות יוצגו בתוך המסך בלבד");
  });
}

document.addEventListener("DOMContentLoaded", boot);
