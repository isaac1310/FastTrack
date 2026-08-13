# FastTrack

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
- **Intake** — coffee, alcohol and meat, one tap each. Shown week-by-week
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
- **Pace** — required vs. actual kg/week and a projection to the next goal.

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
| `tests/TEST-PLAN-v2.4.0.md` | Human pass |
