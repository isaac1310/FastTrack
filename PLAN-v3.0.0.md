# FastTrack v3.0.0 — plan

Major version: first navigation, first theme system, first meal planning,
and a full retro restyle of both palettes.

## Why this is 3.0.0

Four shifts at once: the app stops being one scroll and gains routing; both
palettes are replaced with a single retro design language; the theme becomes a
stored preference; and the data model gains a per-day document that nothing
before it had.

---

## 1 · Navigation — the structural change

Today everything is one column (two on desktop). v3 introduces hash routing and
a home hub.

| Route | Screen | Contents |
|---|---|---|
| `#/` | **בית** | Icon grid + at-a-glance tiles |
| `#/day` | **היום** *(new)* | Weight, 6 meal slots, training, tags, flags |
| `#/week` | **השבוע** *(new)* | 7 days ahead, same data, planning |
| `#/fast` | **צום** | Timer, body status, phase guide *(existing)* |
| `#/track` | **מעקב** | Weight chart, goals, measurements, pace *(existing)* |
| `#/intake` | **צריכה** | Steppers, weekly table *(existing)* |
| `#/settings` | **הגדרות** | Reminders, backup *(existing)* |

Hash routing, not History API — the app is served as a static file and must
keep working from `file://` for the standalone build. `render()` dispatches on
`location.hash`; `hashchange` re-renders. The `render()`/`tick()` split is
unchanged and still mandatory.

**Home tiles** (read-only, tap navigates): current fast state, weight + 7-day
trend arrow, today's flags if any.

---

## 2 · The day screen (`#/day`)

Date-addressable (`#/day/2026-08-13`), defaults to today.

Navigation is the design's **7-day pill strip**, not arrows — but extended
**backwards as well as forwards**. The design ran today + 6 ahead, which made
yesterday unreachable and would have removed the past-day logging added in
v2.5/v2.6. Forgetting to log until the next morning is the normal case.

**Weight** at the top — one field, same `upsertWeight()` as today, so the
trend, pace and chart all pick it up with no new logic.

The design specified `days[date].weight`. **Not adopted** — weight already
lives in `doc.weights[]` and drives the trend, pace and chart. Two stores for
one number is a divergence waiting to happen. The field renders on the day
screen; the write goes through the existing path.

**Six slots**, in order: `בוקר · ביניים · צהריים · ביניים · ערב · לילה`

Each slot is a free-text line plus optional tags. The text is the note; the
tags are the only thing the app counts. Without tags there is nothing to flag,
and the app will not parse Hebrew free text to guess.

**Three tags only.** The design listed four; `ארוחת חופש` and `מה שבא לי` were
the same idea named twice. Confirmed: drop `ארוחת חופש`.

| Tag | Rule | Shown as |
|---|---|---|
| `פחמימה` | max 1/day | עד 250 קל׳ |
| `רגע של אושר` | max 1/day | 100–150 קל׳ |
| `ארוחת מה שבא לי` | no limit | — |

**Stand-down rule** (adopted from the design): when a `מה שבא לי` meal is set,
the carb flag stands down for that day. No point nagging about a second carb on
a day you already decided to eat freely.

### Assignment — uniform across all three tags

The design defined the picker for `מה שבא לי` and `רגע של אושר` but **never
said how `פחמימה` is set** — it simply appears pre-tagged in the sample data.
That gap is closed by making all three identical.

**Tags are buttons, not checkboxes.** A checkbox is binary, and a binary
control cannot represent two carbs — which would mean the limit is enforced
structurally and the "second carb" flag could never fire. That contradicts the
original requirement, which asked for a flag, not a block. The day screen is a
record of what happened, not a plan that forbids.

Flow, identical for `פחמימה` · `רגע של אושר` · `ארוחת מה שבא לי`:

1. Tap the tag button. A prompt bar appears (`flagBg`) — "באיזו ארוחה?"
2. Every meal row tints and its meal name becomes tappable.
3. Tap a meal → the tag attaches to that slot, the prompt closes.
4. Tap the same tag button again to assign a **second** one. The count rises,
   and for `פחמימה` / `רגע של אושר` the flag fires.
5. Tapping an assigned tag pill removes it.

Only one picker is open at a time. `אימון` stays a plain day-level checkbox —
it belongs to no meal and has no limit.

Because a slot can now hold more than one tag across the day's total, `tag`
becomes `tags: []` per slot after all. `cravingSlot` / `happySlot` from the
design are dropped: with multiple assignments possible, a single pointer per
tag cannot represent the state. The slot's own `tags` array is the truth.

**Training** — one checkbox for the day.

**Flags** fire on *count*, not on calories: a second `פחמימה` or a second
`רגע אושר` in one day raises a visible flag. The app does not ask you to enter
calories per item — the kcal figures are the guideline printed on the tag, not
a field. Entering numbers per meal is the thing that gets abandoned.

---

## 3 · The week screen (`#/week`)

Seven columns (or seven stacked cards at 412px), today plus six ahead. Same
`days` store as the day screen — plan Tuesday here, open Tuesday's day screen,
it is already there.

Compact: slot text truncated, tags as dots, training as an icon, flags visible.
Tapping a day opens `#/day/<date>`.

---

## 4 · Data model — schema 6

```js
days: {
  "2026-08-13": {
    slots: {
      morning: { text: "", tags: [] },
      mid1:    { text: "", tags: [] },
      lunch:   { text: "", tags: [] },
      mid2:    { text: "", tags: [] },
      dinner:  { text: "", tags: [] },
      late:    { text: "", tags: [] }
    },
    training: false
  }
}
// NOT here: weight (lives in doc.weights[]), intake (lives in doc.intakeLog[])
// NOT here: cravingSlot/happySlot — a single pointer per tag cannot represent
//           two assignments; the slot's own tags array is the only truth
```

Additive: v5 documents gain an empty `days` object and nothing else changes.
`normalizeDoc()` repairs a missing `days`. The v3 converter's explicit key list
stays untouched — see `CLAUDE.md` §8 for why that matters.

Slot keys are `mid1`/`mid2`, not `between`/`between2`, because two identical
labels in the UI must still be distinct keys in the store.

**Explicit save** on the day screen, per the project rule — text inputs that
autosave on a phone race with themselves. Editing a *past* day already stages
and saves; the day screen follows the same pattern.

New pure functions, all testable without the DOM:
- `dayDoc(days, dateISO)` — returns the day or a zeroed one
- `dayFlags(day)` — `{carbCount, happyCount, overCarb, overHappy, standDown}`,
  counting across all six slots; `standDown` true when a `מה שבא לי` is set
- `weekDays(startISO, n)` — the date list for the week view

---

## 4a · Where the build departs from the design

The handoff is strong and its constraints are carried faithfully. Four
deviations, each with a reason:

1. **Intake stays a timestamped event log.** The design specified
   `intake[date] = {coffee, alcohol, meat, gluten}` — day counts. The counters
   look identical on screen either way, but day counts would silently kill
   caffeine mg decay, alcohol clearance, the since-last stages, the
   crash/withdrawal timeline and the headache-ambiguity note. That is v2.3
   through v2.8. Timestamps stay.
2. **The day strip goes backwards too.** See above.
3. **Weight has one store.** See above.
4. **`ארוחת חופש` is dropped.** Three tags, not four.
5. **Tags are buttons and repeatable, not checkboxes.** The design left
   `פחמימה` with no assignment mechanism at all, and a checkbox model would
   have made the "second carb" flag unreachable. See §2.

**Nothing in the design is dropped from the app.** Features absent from the
handoff — goals add/edit/delete, fast history, reminders, backup/export, the
Ayurvedic lines, the weekly intake-vs-trend table, the since-last summary rows,
the headache note, and the measurement protocol with off-protocol flagging —
were not drawn, not cancelled. They are placed into the new screens in the
design's language.

## 4b · The hardest technical problem: six text inputs

`render()` rebuilds `innerHTML`. The day screen has six free-text inputs plus
checkboxes, tag pickers and a live timer. Any state change while typing
destroys the focused input and loses the cursor — the v1 date-picker bug, but
constant instead of occasional.

The fix, and it must be in place before the day screen is usable:

- Slot text writes to a **draft in view state on `input`**, never straight to
  the doc.
- `render()` records `document.activeElement.id` plus `selectionStart/End`, and
  restores both afterwards.
- `tick()` continues to touch **only** the timer ids. It must not go near the
  day screen. The fasting pill in the top bar is patched by id, not re-rendered.
- Explicit save writes the drafts to the doc.

A selftest check asserts focus and caret survive a `render()` mid-typing.

---

## 5 · Themes — one retro language, two palettes

**Both themes get the retro treatment.** Today's neutral dark is replaced by a
retro night palette. One design language, two lightness inversions — a theme
switch changes the lighting, not the app.

The two palettes are hue-mirrors:

- **Light:** saturated ink on pastel ground
- **Dark:** pastel ink on deep saturated ground

Same hues throughout — violet, turquoise, magenta — so a component's meaning
survives the switch. Turquoise is the accent in both; it is `#0F766E` on white
and `#5EEAD4` on near-black.

Theme stored in the doc (`profile.theme: "dark" | "light" | "auto"`), applied as
`data-theme` on `<html>`, with `auto` following `prefers-color-scheme`.

**Cost, stated once:** today's dark palette is retired. Every dark ratio
currently annotated in the stylesheet is recomputed and re-annotated. That is
more work than leaving dark alone, and it is the right call — two visual
languages in one app would have been the more expensive mistake.

### The light palette, already solved

Every naive 80s pastel **fails** as text on white:

| Colour | On white | Verdict |
|---|---|---|
| light turquoise `#7FD8CE` | 1.66:1 | FAIL |
| light purple `#A78BFA` | 2.72:1 | FAIL |
| pink `#F0ABFC` | 1.76:1 | FAIL |
| yellow `#FDE047` | 1.32:1 | FAIL |

So the pastels become **grounds**, and text uses saturated same-hue inks — which
is what 80s print actually looked like. Verified set:

| Token | Hex | vs white | vs lilac | vs mint |
|---|---|---|---|---|
| ink (body) | `#3F3D56` | 10.43 | 9.10 | 9.39 |
| violet (headings) | `#5B21B6` | 8.98 | 7.84 | 8.09 |
| teal (accent) | `#0F766E` | 5.47 | 4.77 | 4.93 |
| magenta (flags) | `#9D174D` | 7.88 | 6.88 | 7.10 |
| violet link | `#6D28D9` | 7.10 | 6.20 | 6.40 |

Grounds: white `#FFFFFF`, lilac `#F3EDFB`, mint `#E4F7F4`.
Decorative fills only, never text: `#C4B5FD`, `#99F6E4`, `#FBCFE8`.

### The dark palette, also solved

Inverting is not enough: the light-mode inks **fail** on a dark ground —
deep teal `#0F766E` is 3.23:1, deep violet `#5B21B6` is 1.97:1. Same hues,
lightened:

| Token | Hex | vs page | vs surface | vs surface2 |
|---|---|---|---|---|
| text | `#F2ECFF` | 16.72 | 15.32 | 13.59 |
| muted | `#B9AEDA` | 9.30 | 8.52 | 7.56 |
| dim (smallest usable) | `#948AB8` | 6.05 | 5.54 | 4.91 |
| turquoise (accent) | `#5EEAD4` | 13.03 | 11.94 | 10.59 |
| lavender (headings) | `#C7B3FF` | 10.39 | 9.52 | 8.44 |
| magenta (flags) | `#FF8FC3` | 9.15 | 8.38 | 7.44 |
| sky (links) | `#8FD6FF` | 12.14 | 11.12 | 9.87 |

Grounds: page `#100C1A`, surface `#1B1430`, surface2 `#271D42` — purple-tinted,
not neutral. Ink `#100C1A` on any filled accent passes (9.15–13.03).

### The font trap

Retro display faces almost never carry Hebrew. **Rubik stays** — it has full
Hebrew coverage and the geometric shapes read as period-appropriate. The retro
character comes from weight, letterspacing, borders and colour, not from a
second face. If a design proposes a display font, it must be verified for
Hebrew glyphs before anything is built.

---

## 6 · Design review

A brief goes to Claude Design covering stack, hard restrictions, the verified
palette and the new screen inventory: `DESIGN-BRIEF-v3.md`.

The brief must carry the limitations, not just the wish list — the last review
came back clean precisely because it had them.

---

## 7 · Verification

- Selftest grows: `dayDoc`, `dayFlags` (including stand-down), `weekDays`,
  schema 5→6 migration, routing (unknown hash falls back to home, not a blank
  screen), and **focus/caret survival across `render()`** per §4b.
- A check that `intakeLog` is still an event array — the design's day-count
  model must not creep back in.
- **Contrast check for every pair in BOTH palettes**, computed, in the suite —
  not judged by eye. Every ratio re-annotated in the stylesheet, including the
  dark ones, which are all new.
- Both widths, both themes — four combinations. Each theme check must *see*
  itself run, and a run in one theme is never evidence about the other.
- Real browser pass before claiming anything works.

## 8 · Delivery and risk

**One release, everything together** — your call, made with the risk stated:
every screen changes at once, ~35 days before Paris, and §4b is the hardest
thing built in this project. Backup confirmed to exist.

Mitigation, since staging was declined: the day screen's input handling is
built and verified **first**, before any restyling. If it cannot be made solid,
that is the moment to reconsider scope — not after both palettes are rewritten.

## 9 · Settled: no calorie totals

Confirmed — tracking only. The kcal figures (250 / 100–150) are guidelines
printed on the tags, never fields. Flags fire on **count**: a second `פחמימה`
or a second `רגע אושר` in one day.

The app therefore never sums calories and never shows a daily total, because a
total it cannot compute honestly is worse than no total. This is the same
reasoning that kept food logging out in v2.2.0, and it is what keeps the two
new screens feeling like notes rather than a form.
