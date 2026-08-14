# FastTrack v3 — design brief

Personal single-user web app. Hebrew, RTL, phone-first. Currently at v2.8.0,
deployed and in daily use. This brief covers **v3.0.0**: a retro restyle across
both themes, a home hub, and two new planning screens.

---

## 1 · What exists today

A fasting timer, weight and body-measurement tracking against dated goals, and
intake tracking for coffee / alcohol / meat / gluten with a live body-status
readout. One neutral dark theme, being retired. One long scroll, two columns on
desktop, no navigation.

## 2 · What v3 adds

**Navigation.** The app gains a home hub with an icon grid and hash routing.
Seven destinations: home, day, week, fasting, tracking, intake, settings.

**A full retro restyle, in both themes.** The reference is "retro sports morning
show": confident and graphic rather than soft. Light is light purple, white and
light turquoise. **Dark is restyled to match** — today's neutral dark palette is
retired and replaced by a retro night version of the same language.

The two palettes are hue-mirrors: light is saturated ink on pastel ground, dark
is pastel ink on deep saturated ground. Same hues in both, so a component's
meaning survives the switch. Both are pre-verified below.

**A day screen.** Date-addressable, defaults to today.
- Weight entry at the top
- Six meal slots: `בוקר · ביניים · צהריים · ביניים · ערב · לילה`
- Each slot: a free-text line plus optional tags
- Tags: `פחמימה` (max 1/day, guideline 250 kcal), `רגע אושר` (max 1/day,
  100–150 kcal), `ארוחת חופש` (no limit)
- A training checkbox for the day
- A visible flag when a second `פחמימה` or `רגע אושר` is tagged

**A week screen.** Today plus six days ahead, same data, for planning. Compact
per-day summaries; tapping a day opens it.

**Requested feel:** *"like writing notes, not too complicated."* This is the
governing constraint for the two new screens. Anything that looks like a form
is wrong.

---

## 3 · Stack

| Layer | Choice |
|---|---|
| Markup/logic | Plain HTML + **vanilla JS**, ES5-style, `"use strict"` |
| Styling | **Plain CSS with custom properties.** No Tailwind, no CSS-in-JS |
| Framework | **None.** No React, no Vue, no build-time templating |
| Dependencies | **Zero runtime dependencies.** No npm package ships |
| Routing | **Hash-based** (`#/day`). Must work from `file://` |
| Data | **`localStorage` only.** No backend, no network calls |
| Build | `build.mjs`, Node stdlib only, inlines sources into one file |
| Hosting | Vercel static |
| Shell | PWA, installed to an Android home screen |

Source files: `fast-tracker.html` (shell + all CSS), `app.js` (data + pure
logic), `ui.js` (render), `selftest.js`.

---

## 4 · Hard restrictions

Each of these exists because something broke. None is negotiable.

### Language and direction
- All copy Hebrew, `<html lang="he" dir="rtl">`.
- **Every element containing a number needs `direction:ltr; unicode-bidi:isolate`.**
  Without it RTL moves a leading minus to the trailing side and `-0.9` renders
  as `0.9-`. This shipped as a bug.
- **Never put two numbers around a separator.** `99.0/57.4` reorders to
  `57.4/99.0` and silently swaps the values. Label each number. This also shipped.
- **Never put Hebrew text inside an SVG.** Legends and labels are HTML
  positioned over the SVG.

### Fonts — the biggest risk in this brief
- **Rubik only.** It has full Hebrew coverage and reads as period-appropriate.
- **Retro display faces almost never carry Hebrew.** A Latin display font
  causes every Hebrew string to silently fall back to a system font — invisible
  in a mockup, obvious on the phone. If a display face is proposed, it must be
  verified for Hebrew glyph coverage first.
- The retro character must come from **weight, letterspacing, borders, colour
  and layout**, not a second family.

### Colour — both palettes are already computed

**Light: every naive 80s pastel fails as text.** Measured against white:

| Colour | Ratio | |
|---|---|---|
| light turquoise `#7FD8CE` | 1.66:1 | FAIL |
| light purple `#A78BFA` | 2.72:1 | FAIL |
| pink `#F0ABFC` | 1.76:1 | FAIL |
| yellow `#FDE047` | 1.32:1 | FAIL |

So pastels are **grounds**, and text is a saturated same-hue ink — which is what
80s print actually did. This set is verified at ≥4.5:1 on all three grounds:

| Role | Hex | white | lilac | mint |
|---|---|---|---|---|
| body ink | `#3F3D56` | 10.43 | 9.10 | 9.39 |
| headings | `#5B21B6` | 8.98 | 7.84 | 8.09 |
| accent | `#0F766E` | 5.47 | 4.77 | 4.93 |
| flags/alerts | `#9D174D` | 7.88 | 6.88 | 7.10 |
| links | `#6D28D9` | 7.10 | 6.20 | 6.40 |

Grounds: white `#FFFFFF`, lilac `#F3EDFB`, mint `#E4F7F4`.
Decorative fills, never text: `#C4B5FD`, `#99F6E4`, `#FBCFE8`.

**Dark: inverting is not enough** — the light-mode inks fail on a dark ground
(deep teal 3.23:1, deep violet 1.97:1). Same hues, lightened, all ≥4.5:1:

| Role | Hex | page | surface | surface2 |
|---|---|---|---|---|
| body text | `#F2ECFF` | 16.72 | 15.32 | 13.59 |
| muted | `#B9AEDA` | 9.30 | 8.52 | 7.56 |
| dim (floor) | `#948AB8` | 6.05 | 5.54 | 4.91 |
| accent | `#5EEAD4` | 13.03 | 11.94 | 10.59 |
| headings | `#C7B3FF` | 10.39 | 9.52 | 8.44 |
| flags/alerts | `#FF8FC3` | 9.15 | 8.38 | 7.44 |
| links | `#8FD6FF` | 12.14 | 11.12 | 9.87 |

Dark grounds: page `#100C1A`, surface `#1B1430`, surface2 `#271D42` —
purple-tinted, not neutral. Ink `#100C1A` on any filled accent passes.

**A component must keep its meaning across themes.** Turquoise is the accent in
both; magenta is the flag in both. Do not reassign roles between palettes.

**Verify numerically, never by eye.** 4.37:1 is a fail. Small letterspaced
labels get no large-text allowance. If the design changes a colour, supply the
computed ratio.

### Layout
- **Two primary widths, both real:** 412×915 (Samsung Ultra) and desktop
  1024–1440. Fluid 360–480. Breakpoint at 768.
- A phone-width column centred on a 1440px screen is a failure, not a default.

### Rendering
- **`render()` / `tick()` split is mandatory.** `tick()` runs every second and
  patches only text and geometry by `id`. It must never touch `innerHTML` on a
  container holding an input — that closed an open date picker mid-use in v1.
- The day screen has text inputs. Any live element near them must follow this.

### Data
- Explicit save, never autosave. A "saved ✓" that can lie is worse than none.
- Soft delete with a 10-second undo for anything destructive.
- Unknown schema version refuses and preserves the raw blob.

### Network
- **No external requests at runtime** beyond the Google Fonts stylesheet. No
  CDN scripts, no icon libraries, no remote images. Icons must be inline SVG or
  CSS. Anything added must be inlined or self-hosted.

---

## 5 · What design input is wanted

- The **home hub**: icon grid at 412px — how many across, what an icon looks
  like without an icon font, how the at-a-glance tiles sit with it.
- The **day screen**: making six slots feel like a notepad rather than a form.
  This is the hardest and most important call in the brief.
- The **week screen**: seven days on a 412px phone.
- The 80s retro register within the verified palette — how far the borders,
  shadows, letterspacing and geometry can push before it stops being legible at
  6am on a phone.
- Theme toggle placement, and how the retro register differs between day and
  night without becoming two languages.

## 6 · Not open

- Any framework, component library, icon font, or CSS utility framework.
- A second font family, unless it is verified to carry Hebrew.
- Anything requiring a network request or a backend.
- Calorie entry per meal. The kcal figures are guidelines printed on tags;
  flags fire on count. Per-item calorie entry is the thing that gets abandoned.
- Removing the medical caution or the "typical, not personal" disclaimers in
  the fasting section.
