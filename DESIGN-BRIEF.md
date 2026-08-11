# FastTrack — design brief

A personal, single-user web app for tracking intermittent fasting, weight, and
body measurements against dated goals. One user (the owner), Hebrew, RTL,
phone-first. Currently at v2.0.0, functional and deployed from a private repo.

---

## 1 · What the app does

Four jobs, in priority order:

1. **Run a fast and explain it.** A timer with a target protocol (16:8, 18:6,
   20:4, custom, or open-ended). While it runs, the app says what phase the body
   is in, how long until the next phase, what's happening physiologically, what
   you may feel, and what helps. Seven phases from 0h to 72h+.
2. **Track weight against dated goals.** Daily-optional weigh-ins. Goals are
   user-managed rows (label + date + target kg) — add, edit, soft-delete with
   undo. First milestone: Paris, 18 Sep 2026, 76 → 70 kg.
3. **Answer "is the loss real?"** Weekly waist + thigh measurements under a
   fixed protocol. Compares waist trend against weight trend to distinguish fat
   loss from water/lean-mass loss. Refuses to render a verdict below 3
   on-protocol points or a 2-week span.
4. **Show pace honestly.** Least-squares fit over the last 21 days → required
   kg/week, actual kg/week, projected weight on the goal date, and an
   ahead/on-pace/behind verdict.

**Explicitly out of scope:** food and calorie logging. The app therefore knows
*that* progress stalled but never *why* — the UI must report, never prescribe.

---

## 2 · Stack

| Layer | Choice |
|---|---|
| Markup/logic | Plain HTML + **vanilla JS**, ES5-style, `"use strict"` |
| Styling | **Plain CSS with custom properties.** No Tailwind, no CSS-in-JS |
| Framework | **None.** No React, no Vue, no build-time templating |
| Dependencies | **Zero runtime dependencies.** No npm packages ship |
| Data | **`localStorage` only.** No backend, no database, no auth, no network calls |
| Build | `build.mjs`, Node stdlib only — inlines sources into a single file |
| Hosting | Vercel static (personal Hobby scope) |
| Shell | PWA — `manifest.webmanifest`, service worker, installed to Android home screen |
| Tests | In-app `__selftest()`, no framework, no Playwright |

Source files: `fast-tracker.html` (shell + all CSS), `app.js` (data model + pure
logic), `ui.js` (render layer). The build inlines all three.

---

## 3 · Hard restrictions

These are not preferences. Each one exists because something broke.

### Language and direction
- **All copy is Hebrew, RTL.** `<html lang="he" dir="rtl">`.
- **Numbers must be bidi-isolated.** Any element containing a number needs
  `direction:ltr; unicode-bidi:isolate`. Without it RTL moves a leading minus to
  the trailing side and `-0.9` renders as `0.9-` — a wrong sign, silently.
- **Never put two numbers around a separator in RTL.** `99.0/57.4` reorders to
  `57.4/99.0` and swaps the two values. Label each number instead.
- **Never put Hebrew text inside an SVG.** Legends and axis labels are HTML
  positioned around the SVG, not `<text>` inside it.

### Fonts
- **Frank Ruhl Libre** (serif, headings) + **Heebo** (sans, body), in that order
  in a single `font-family` stack so per-character fallback resolves in one rule.
- Latin display faces (Cormorant, Jost, Georgia) contain **no Hebrew glyphs** —
  Hebrew silently falls back to a system font. Do not introduce one.

### Colour
- Dark theme only. Existing tokens: `--bg #14171A`, `--surface #1D2226`,
  `--surface2 #252B30`, `--surface3 #2E353B`, `--text #EDEAE0`,
  `--muted #A8B0B6`, `--dim #78828A`, `--gold #E0B75C`, `--sage #7FC79B`,
  `--rust #F08B70`, `--sky #7FB6E0`.
- **Every text colour must measure ≥4.5:1 against its background**, computed
  numerically, not judged by eye. 4.37:1 is a fail. Small letterspaced labels get
  no large-text allowance.
- `--gold-deep #C9A24B` is **decorative only** — strokes and fills, never text.

### Layout
- **Two primary widths, both real:** 412×915 (Samsung Ultra) and desktop
  1024–1440. Fluid across 360–480. Breakpoint at 768 → two-column grid.
- A phone-width column centred on a 1440px screen is a failure, not a default.

### Rendering
- **`render()` / `tick()` split is mandatory.** `render()` rebuilds the DOM on
  real state changes only. `tick()` runs every second and patches *only* text and
  geometry by `id`. `tick()` must never touch `innerHTML` on a container holding
  an input — that closed the `datetime-local` picker mid-use in v1.

### Data
- Explicit save, never autosave — autosave races on a phone and produces a
  "saved ✓" that can lie.
- Soft delete + 10-second undo toast for anything destructive.
- All storage access via wrappers that set a visible flag on failure rather than
  throwing.
- Unknown schema version **refuses and preserves the raw blob** rather than
  guessing.

### Network
- **No external requests at runtime** beyond the Google Fonts stylesheet. No
  CDN scripts, no analytics, no icon libraries, no remote images. Anything added
  must be inlined or self-hosted.

### Content accuracy
- Fasting phase boundaries are **typical, not personal** — stated visibly.
- **Never print an autophagy threshold hour as fact.** Most cited figures come
  from rodent studies; human timing is unestablished.
- Medical caution text attaches to the 24h+ phases specifically, not only to
  footer small print.

---

## 4 · Current UI inventory

| Component | Notes |
|---|---|
| Next-goal countdown card | Days left, pace verdict chip, 3 stat tiles, required vs actual kg/week |
| Fasting card | 220px SVG progress ring, elapsed time centred, 7-segment phase strip |
| Live status card | Phase name + countdown to next phase, five labelled blocks (now / fuel / hormones / feel / helps), conditional caution |
| Phase guide | Collapsible, all 7 phases, current one highlighted |
| Stat tiles | Weight / waist / thigh with deltas, plus composition signal |
| Log card | Weight entry + recent list; measurement entry with protocol shown at every entry |
| Goals card | Add / inline edit / soft delete, hit/missed badges on past goals |
| Chart | Raw dots, zero-phase smoothed trend, goal markers, required-pace line, projection line |
| Fast history | Streak, longest, 7-day average, recent fasts |
| Settings | Notification permission, weigh-in time, JSON export/import |
| Banners | Storage failure, migration notice, no-weigh-in gap, stale backup |
| Toast | Bottom-anchored, undo action |

---

## 5 · What design input is wanted

Open for redesign:

- The fasting ring and phase strip — proportion, colour, legibility of the timer
  at a glance and mid-fast
- Card order and density; what deserves to be first on a 412px screen
- Type scale and Hebrew rendering quality
- Chart readability at 412px with multiple goal markers
- Empty and first-run states
- The dark palette in daylight

Not open:

- Light theme, colour-scheme switching
- Any framework, component library, icon font, or CSS utility framework
- Anything requiring a network request or a backend
- Removing the medical caution or the "typical, not personal" disclaimer
