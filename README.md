# Aviente Health Track

Personal intermittent-fasting and weight tracker. Hebrew, RTL, phone-first.
Single user, no accounts, no backend — everything lives in `localStorage` on the
device and leaves it only through a JSON export you trigger yourself.

## What it does

- **Fasting timer** with 16:8 / 18:6 / 20:4 / custom / open-ended protocols, and
  a live readout of what the body is doing: seven phases from the fed state to
  72h+, each with what's happening, the fuel source, the hormonal picture, what
  you may feel, and what helps.
- **Weight tracking** with daily-optional weigh-ins and a smoothed trend line.
- **Body measurements** (waist + thigh) under a fixed protocol, used to separate
  fat loss from water and lean mass.
- **Goals** — any number of dated weight milestones you can add, edit and delete.
- **Intake** — coffee, alcohol, meat and gluten, one tap each. Shown week-by-week
  alongside that week's weight change, plus a reference on what each does to
  the body and whether it breaks a fast.
- **Live body status** — how long since your last coffee or drink, what stage
  that puts you in, and what people typically feel there. "8 hours since
  coffee" is the crash; 12–24 hours is the withdrawal window where headache is
  the most common symptom. Alongside it, how much is still circulating and
  when it clears. Timestamps are recorded automatically when you tap, so this
  costs no extra input.

  When a headache has two plausible causes the app can see at once — falling
  caffeine and sodium loss from fasting — it names both rather than guessing.

  A summary line covers all three at once — "coffee 5 hours ago, meat 6 days,
  alcohol a week" — with clean-day counts. Meat is tracked as a digestive
  burden rather than a nutrient: slower gastric emptying is stated because it
  is measurable, "clean of meat" is stated as a fact about what you ate, and
  detox claims are refused outright.

  Today's intake is one tap from home (quick log) or from the day screen. To
  log a past day, open that day — the day screen carries meals, weight,
  training and intake for whichever date it shows, with week arrows to reach
  earlier weeks. A past day is visibly marked, and its intake changes are
  staged with the typed fields until you press save.
- **An Ayurvedic lens**, in its own clearly-labelled card. Doshas, agni, and
  the tradition's view of fasting, coffee, alcohol and meat. Kept separate from
  the physiology on purpose: caffeine's half-life is a measurement, dosha
  balance is a framework, and one voice for both would misrepresent each. It
  describes state rather than prescribing, and does not ask your constitution. Note the app tracks *meat*, not protein: it can't see eggs, fish
  or dairy, and says so instead of implying a shortfall it can't observe.
- **Pace** — required vs. actual kg/week and a projection to the next goal.

## Screens

Home hub with hash routing, then: **היום** (six meal slots as a ruled notepad,
weight, training, intake steppers, repeatable tags with daily-limit flags),
**השבוע** (Sunday..Saturday, with week arrows, same store), plus fasting,
tracking and settings. Unsaved typed input is kept per date in its own
localStorage key, so switching day or closing the app never loses it — the
doc itself still only changes on an explicit save.

Two themes in one retro language — light is saturated ink on pastel ground,
dark is pastel ink on deep ground, same hues in both.

## What it deliberately does not do

Count calories. Intake tracking is three items, not a food diary — enough to
notice that a stalled week had nine drinks in it, without the daily logging
burden that gets abandoned by week two. The pace card reports; it doesn't
prescribe, and the weekly table shows numbers side by side without claiming
causation from a five-week sample.

It also won't state an autophagy threshold hour as fact — human timing for that
isn't established, and most numbers quoted online come from rodent studies. Phase
boundaries are typical, not personal. None of it is medical advice.

## Running it

Open `fast-tracker.html` directly, or build:

```bash
node build.mjs
```

`deploy/index.html` is the hosted build; `deploy/fasttrack.html` is a single
self-contained file you can open from anywhere.

No dependencies. Node stdlib only, and only for the build.

## Tests

```bash
node build.mjs
```

Then `__selftest()` in the console, or open with `?dev=1`. Run at both 412px and
desktop. See `CLAUDE.md` for what counts as a pass.

## Layout

| File | Role |
|---|---|
| `fast-tracker.html` | Shell and all CSS |
| `app.js` | Data model, migration, pure logic (`window.FT`) |
| `ui.js` | Render layer |
| `selftest.js` | Test suite |
| `sw.js` | Service worker: offline shell + reminders |
| `build.mjs` | Build |
| `DESIGN-BRIEF.md` | Design contract and hard constraints |
| `tests/TEST-PLAN-v3.1.0.md` | Human pass |
