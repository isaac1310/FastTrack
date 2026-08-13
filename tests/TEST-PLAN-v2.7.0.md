# FastTrack — human test plan v2.7.0

Five minutes. Judgement only — everything a machine can assert lives in
`selftest.js`. **Check the version footer first:** the bottom of the app must
read `v2.7.0`. If it doesn't, you're on a cached page and every result below is
about the wrong build.

Run the machine suite first. Red means stop:

```bash
node build.mjs
```

Then open the app and run `__selftest()` in the console **at both widths**
(412px and desktop). Expect `153 passed, 0 failed, 1 skipped` at each — the one
skip is the opposite width's layout check and must say so. A skip with no
reason is a failure.

---

## 1 · Fasting hero ⚠️ *new layout*

1. Start a 16:8 fast.
   **Expect:** ring appears at 124px with the elapsed time centred *inside* it,
   phase name in gold to the side, and the phase strip below.
2. Look at the elapsed time for five seconds.
   **Expect:** it ticks every second, digits don't jump around (tabular figures),
   and the text stays fully inside the ring — never touching or crossing the gold
   stroke. ⚠️ This is the constraint the design flagged; 18px is the ceiling.
3. Look at the phase strip.
   **Expect:** 7 segments of *unequal* width — the early short phases are
   visible, not hairlines. Completed ones deep gold, the current one partially
   filled and growing.
4. Tap "עריכת התחלה", then set a time.
   **Expect:** ⚠️ the picker stays open while you use it. If it snaps shut
   mid-interaction, the `render()`/`tick()` split has regressed — that exact bug
   shipped in v1.

## 2 · Reading it mid-fast

5. Read the "מה קורה עכשיו בגוף" card as if you were hungry and looking for a
   reason to stop.
   **Expect:** it's readable at a glance, the five labels are scannable, and it
   tells you something useful rather than generic encouragement.
6. Open "מדריך השלבים".
   **Expect:** current phase highlighted with "· עכשיו", hour ranges legible.

## 3 · Numbers and direction ⚠️ *previously broken twice*

7. Find any negative delta (weight tile, log row).
   **Expect:** the minus is on the **left** of the digits — `-1.7`, never `1.7-`.
8. Look at a measurement row.
   **Expect:** it reads `מותן 96.2 · ירך 57.5` with each value labelled.
   ⚠️ If waist and thigh look swapped, the bidi isolation regressed.
9. Look at the phase-strip axis and `72h+`.
   **Expect:** the `+` is after the `72h`, not before.

## 4 · Goals

10. Add a goal dated before today.
    **Expect:** it saves, appears with a hit/missed badge, and does **not**
    become the "next goal".
11. Delete a goal, then hit "ביטול" in the toast.
    **Expect:** the goal comes back identical, and the pace card recalculates.
12. Delete every goal.
    **Expect:** ⚠️ the next-goal card shows a real empty state with an "add"
    button — not a blank card, not `NaN`. This is literally the app's state on
    19 Sep if you haven't added the next milestone.

## 5 · Chart

13. Look at the chart with Paris as the only upcoming goal.
    **Expect:** three weeks of data occupy most of the width, not a corner. The
    gold trend line runs **through** the dots, not above them.
14. Tap "כל היעדים".
    **Expect:** the x-axis extends to December and the December goal marker
    appears. Tap again to return.
15. Look at the goal label over the chart.
    **Expect:** Hebrew renders normally — not stretched or squashed.
    ⚠️ Labels must be HTML over the SVG, never `<text>` inside it.

## 6 · Measurements

16. Open "+ מדידה".
    **Expect:** the full four-line protocol is shown *here*, at the point of
    entry — not buried in settings.
17. Enter a waist 4cm off your last on-protocol reading.
    **Expect:** a confirm dialog asks whether it was measured the same way, and
    **lets you save anyway** if you confirm. It must not block.
18. Save a measurement with the protocol box **unchecked**.
    **Expect:** it's stored, listed with a "מחוץ לפרוטוקול" badge, and the
    composition verdict does **not** move.

## 7 · Phone reality

19. On the phone at 412px, scroll the whole app once.
    **Expect:** nothing scrolls sideways, no text is clipped, tap targets are
    comfortable.
20. Read the app in **daylight**, outdoors.
    **Expect:** the 10–11px grey labels are readable. ⚠️ `--dim` was measurably
    below AA before this version; this is the check that it's actually fixed in
    practice, not just numerically.

## 8 · Install and notifications ⚠️ *cannot be machine-tested*

21. Install to the home screen from Chrome on Android.
    **Expect:** the gold ring icon appears; launching it opens without browser
    chrome.
22. In settings, tap "הפעלת תזכורות" and allow.
    **Expect:** status flips to "פעילות".
23. Set the weigh-in time to two minutes from now, lock the phone, wait.
    **Expect:** ⚠️ a notification actually arrives. This is the single most
    likely thing to be broken while looking perfectly fine in code.
24. Deny the permission instead (or block it in browser settings).
    **Expect:** the app states plainly that notifications are off and falls back
    to in-app banners. It must never look armed when it isn't.

## 9 · Data safety

25. Export a backup, then import it back.
    **Expect:** nothing changes, and an undo toast appears.
26. Open the exported JSON.
    **Expect:** your weights, measurements, goals and fast history are all in it,
    including soft-deleted goals.

---

✅ / ❌ per numbered step. Anything ❌ that carries a ⚠️ is a regression of a bug
that already shipped once — treat it as blocking.

Version footer checked: ☐ `v2.7.0`

---

## 10 · Intake ⚠️ *new in v2.7.0*

27. Open the צריכה card and tap `+` on **קפה שחור** while a fast is running.
    **Expect:** the count goes up and **nothing else happens** — no prompt.
    Black coffee doesn't break a fast, and being nagged every morning would
    train you to ignore the prompt that matters.
28. Now tap `+` on **אלכוהול** or **בשר** during the same fast.
    **Expect:** ⚠️ a toast appears saying it breaks the fast, with a
    "סיים צום" button. The timer must **still be running** — it does not end
    on its own.
29. Tap "סיים צום" on that toast.
    **Expect:** the fast ends and is added to the history, and the item stays
    logged.
30. Repeat step 28 but ignore the toast for ten seconds.
    **Expect:** it disappears, the item stays logged, and the fast is still
    running. Both outcomes are valid — you may be logging something from
    before the fast began.
31. Change the date at the top of the צריכה card to a past day.
    **Expect:** counts switch to that day's values, and a "היום" link appears
    to get back. Future dates are not selectable.
32. Tap `−` repeatedly on any item at zero.
    **Expect:** it stays at zero. No negative counts.
33. Look at the צריכה מול מגמה table.
    **Expect:** one row per week, weight change beside the counts. Any week
    marked `*` has fewer than 4 weigh-ins, with the footnote explaining it.
    ⚠️ Nothing anywhere should claim a cause.
34. Open "מה זה עושה לגוף".
    **Expect:** four items, each with what happens / fasting / weight-loss
    effect / timing, and a "שובר צום" or "לא שובר צום" badge that matches the
    behaviour you just saw in steps 27–28.

## 11 · Upgrade from v2.1.0 ⚠️ *data safety*

35. If you already had data on the phone before this version, open the app and
    check your weigh-ins, goals and measurements are all still there.
    **Expect:** ⚠️ everything intact. v3 added intake purely additively and
    upgrades a v2 document in place — but this is the check that matters most,
    because the failure mode is silent data loss.

## 12 · Live body status ⚠️ *new in v2.7.0*

36. With no coffee or alcohol logged today and no fast running, look for the
    "מה קורה עכשיו בגוף" card.
    **Expect:** it isn't there. Nothing is circulating and no fast is running,
    so it has nothing to say.
37. Log one black coffee. Do not start a fast.
    **Expect:** ⚠️ the card appears with a "קפאין בגוף" block showing roughly
    100 mg and a time when it drops below 30 mg. This is the thing that was
    missing before this version — the card used to be hidden unless a fast
    was running.
38. Watch the mg figure across a few minutes.
    **Expect:** it drifts downward on its own, without the page reloading.
39. Log a second coffee.
    **Expect:** the figure jumps by about 100 and the clear-time moves later.
40. Log one alcohol.
    **Expect:** a rust-coloured "אלכוהול בדם" block saying roughly 1 unit is
    still to clear, with a time, and that fat oxidation is suppressed until
    then. About an hour later it should be gone.
41. Read the grey note at the bottom of the card.
    **Expect:** ⚠️ it states plainly that these are estimates from typical
    values, not measurements. If that line is missing, the card is
    overclaiming.
42. Switch the צריכה date to a past day and log a coffee there.
    **Expect:** the daily and weekly counts include it, but the live caffeine
    figure does **not** move. A dose with no real time can't be circulating now.

## 13 · Since-last-dose ⚠️ *new in v2.7.0*

43. Log a coffee, then look at "מה קורה עכשיו בגוף".
    **Expect:** a heading like `קפאין · לפני 3 דק׳ · ספיגה`, with what's
    happening, what it feels like, and what helps.
44. Watch the "לפני X" figure for a minute.
    **Expect:** it counts up on its own, no reload.
45. ⚠️ **The case this version exists for.** Using a past-dated entry or by
    waiting, get to roughly 8 hours since your last coffee.
    **Expect:** the stage reads `ירידה`, and "מה זה מרגיש" describes the crash
    — sudden fatigue, sometimes a mild headache. Not withdrawal; that's later.
46. At roughly 14 hours since the last coffee.
    **Expect:** the stage reads `חלון תחילת גמילה`, headache is named as the
    most common symptom, and the text says explicitly that this applies to
    regular coffee drinkers — not to someone who has one occasionally.
47. With a fast running past 10 hours AND more than 5 hours since coffee.
    **Expect:** ⚠️ an "אם יש כאב ראש" block naming **both** possible causes and
    saying the app can't tell which. If it confidently blames one, that's a
    failure — this is the whole point of the block.
48. Break the fast (or log with a short fast) and re-check.
    **Expect:** the two-causes block disappears. It only appears when both are
    genuinely plausible.
49. Log a drink, then check the card 9 hours later.
    **Expect:** stage `השפעת לילה והתאוששות`, explaining that hangover symptoms
    peak *after* the alcohol has already cleared.
50. With no coffee or alcohol in the last 3 days and no fast running.
    **Expect:** the card is absent entirely. Nothing to say.

## 14 · All three at a glance ⚠️ *new in v2.7.0*

51. Open the app with coffee logged today, meat a few days back and alcohol
    over a week back.
    **Expect:** a summary box at the top of "מה קורה עכשיו בגוף" with one row
    per substance — label, how long ago, stage, and either today's count or a
    clean-day streak.
52. Check the alcohol row.
    **Expect:** `לפני 7 ימים · חזרה לקו הבסיס · 6 ימים נקיים`. ⚠️ Days, not
    hours — before this version anything past 16 hours vanished entirely.
53. Check the coffee row on a day you've had one.
    **Expect:** it shows today's count, not a clean-day streak. ⚠️ A streak
    alongside a coffee you drank this morning is the bug this was written for.
54. Look for the `*` marks and the note under the box.
    **Expect:** rows whose last entry was backfilled carry `*`, and the note
    says the day is known but not the hour.
55. Scroll to the meat block.
    **Expect:** ⚠️ it states the app tracks meat and not protein, and that if
    protein is coming from eggs, fish or dairy the number means nothing. If it
    implies you're short on protein, that's a failure — it cannot know that.

## 15 · Logging to a past day

56. In the צריכה card, change the date at the top to a few days back.
    **Expect:** ⚠️ the card gets a gold border and a banner saying which date
    you are logging to, with a "חזרה להיום" link. If that is not obvious, the
    failure mode is tapping + while the date is still on last Tuesday.
57. Tap + on any item.
    **Expect:** it records against the chosen date, not today. Check the
    summary row at the top of the body card updates.
58. Tap "חזרה להיום".
    **Expect:** the picker resets, the border and banner go away.
59. Check the live caffeine figure after logging a coffee to a past day.
    **Expect:** ⚠️ it does **not** move. A past-day entry has no real time, so
    it cannot be circulating now.

## 16 · The backup notice ⚠️ *changed in v2.7.0*

60. With data logged and no recent export, look for the "data is only on this
    device" banner and tap "הבנתי".
61. Close the app and reopen it.
    **Expect:** ⚠️ the banner does **not** come back. Before this it returned
    on every load, which is a nag rather than a warning.
62. Open the settings card.
    **Expect:** the backup status is still there and still says plainly that
    you haven't exported. Dismissing the banner must not hide the fact.

## 17 · Save button for past days ⚠️ *new in v2.7.0*

63. Set the intake date to a past day and tap + on any item.
    **Expect:** the count changes on screen, the stepper gets a gold ring, and
    a "שמירה ל…" button appears. ⚠️ Nothing is written yet.
64. Reload before saving.
    **Expect:** the change is gone. It was staged, not saved.
65. Repeat and press save.
    **Expect:** a toast naming the date and the items changed, the ring clears,
    the button returns to "אין שינוי לשמור" disabled.
66. Do the same on **today**.
    **Expect:** no save button at all — today writes on each tap, because the
    live status reacts immediately and proves it.

## 18 · Meat as a streak ⚠️ *reframed in v2.7.0*

67. With meat logged several days ago, check the summary row.
    **Expect:** "בשר · לפני 6 ימים · רצף ארוך נקי · 5 ימים נקיים".
68. Read the meat block.
    **Expect:** ⚠️ it says slower gastric emptying (measurable), and says
    plainly that a clean streak is a fact about what you ate and **not** the
    body cleansing itself. If it claims detoxification or toxin build-up,
    that's a failure.
69. On a long meat-free streak, read "מה זה אומר".
    **Expect:** it raises protein for lean mass in a deficit and admits the app
    can't see fish, eggs, dairy or legumes.

## 19 · Ayurvedic lens ⚠️ *new in v2.7.0*

70. Look for "מבט איורוודי" and open it.
    **Expect:** its own card, visually distinct (blue-tinted), collapsed by
    default, labelled "מסורת · לא רפואה".
71. Read the note at the top.
    **Expect:** ⚠️ it states plainly this is a traditional system and not
    evidence-based medicine in the sense the rest of the app uses. If that
    line is gone, the card is overclaiming.
72. Mid-fast, check the dosha line.
    **Expect:** it describes the *state* — vata rising with a long fast, etc.
    ⚠️ It must never claim to know your constitution, and there should be no
    quiz anywhere.
73. Look for remedies.
    **Expect:** none. Descriptive only — no herbs, no supplements, no
    treatment advice.

## 20 · One body section ⚠️ *v2.7.0*

74. There is exactly one body card: "מה קורה עכשיו בגוף". The "מבט איורוודי"
    and "מה זה עושה לגוף" cards are gone.
75. With a week-old drink logged, the alcohol block appears with a clean-streak
    stage. ⚠️ Before this it vanished after 16 hours.
76. The alcohol clean-streak text names its population — regular drinkers who
    stopped — and does not promise those numbers to an occasional drinker.
77. The 4-week meat stage cites TMAO and admits short-term findings are
    inconsistent; "lighter after a few days" reads as a common report, not a
    measurement.
78. The Ayurvedic lines appear inline under "במסורת האיורוודית" with the
    not-evidence-based note attached. No remedies anywhere.
79. Coffee with milk is gone from the steppers; old entries still count as
    coffee (check a historical day).

## 21 · Cancel for today ⚠️ *v2.7.0*

80. Tap + on any item today. **Expect:** a "ביטול השינויים של היום" button
    appears.
81. Tap it. **Expect:** today's counts return to what they were when the app
    was opened, and the button disappears.
