# Tray

A canteen tray builder and macro tracker for one person, one phone. Pick the main dish;
the app works out the rest of the tray and you confirm it.

No accounts, no server, no network at runtime. Everything you log lives in your phone's
browser storage and goes nowhere else.

**Live:** https://lazarpopadic.github.io/tray/
**Self-check:** https://lazarpopadic.github.io/tray/tests.html

---

## Installing it on the iPhone

Open the link in **Safari** (not Chrome — only Safari can install a web app on iOS), tap the
share button, then **Add to Home Screen**. It opens full screen with no browser bar, and works
in airplane mode from then on.

---

## Logging a tray is four taps

**Add a meal → Canteen tray → the main dish → confirm.**

There is no step where you assemble the tray by hand. Choosing the main is enough for the app
to fill in the garniture, the two items from the cold shelf and the bread roll, and show you
the whole thing with its macros and what it does to the day. If a line is wrong, **Swap**
replaces just that line and leaves the rest alone — correcting a prediction is never slower
than making one.

Everything else goes through **Anything else**, which leads with meals you have logged before
(one tap to repeat) and then a small tiled catalogue. Breakfast and the night shake are fixed
recipes, so they sit in the add sheet with a **Log** button: one tap each.

### How the prediction works

Three layers, and they are deliberately different kinds of knowledge:

| Layer | What it is | Weight |
|---|---|---|
| **Your history** | which sides you have actually confirmed with this main | highest |
| **Observed menus** | how often each garniture really appears on a CROUS menu | middle |
| **Pairing table** | standard French catering pairings, keyed on the dish's cuisine | lowest |

The middle layer is real data, counted from 114 restaurants across 13 academies via the
[CROUStillant](https://api.croustillant.menu) open-data API. Rice and semolina lead by a wide
margin, which is why a curry gets rice and a sausage gets chips. The pairing table is an
editorial judgement and is labelled as one in `assets/js/data/pairings.js` — per-dish pairings
in the menu feeds are far too sparse to learn from, and pretending otherwise would be dishonest.

Your own history overrides both. Take mash with the turkey curry four times and the app stops
arguing.

**Predicting and advising are kept apart.** `lib/predict.js` guesses what is on the tray.
`lib/recommend.js` says what would serve the targets. When they disagree — you took the rice,
the semolina is 106 kcal heavier — the app shows the prediction and states the difference on
the line beneath. It never silently swaps your food for food it prefers.

---

## Editing it

No build step, no Node, no npm. Edit a file, push, done.

```
index.html                   the shell
sw.js                        offline cache — see the warning below
manifest.webmanifest         home-screen icon and name
tools/serve.py               local dev server (no-cache; not used in production)
assets/css/styles.css        design tokens and every component
assets/js/config.js          targets, the planned day, scoring weights, thresholds
assets/js/data/foods.js      the CROUS catalogue (generated — see below)
assets/js/data/pairings.js   the tray prediction model (generated)
assets/js/data/home.js       food from outside the canteen (hand-written)
assets/js/lib/               pure logic: macros, dates, storage, predict, recommend, streak
assets/js/ui/                one file per screen
assets/js/tests.js           the self-check
```

Most things you would want to change are in `config.js`: the targets, what each slot is meant
to deliver, how the scorer is weighted, and the streak thresholds.

To run it locally: `python tools/serve.py` then open http://localhost:5190.

### The one thing to remember when you push

**Bump `VERSION` in `sw.js`** every time you change any file:

```js
var VERSION = "tray-v4";   // was tray-v3
```

The service worker serves from cache first so the app opens instantly and works offline. If you
do not bump the version, the phone can keep showing the old app.

### Changing the food

`foods.js` and `pairings.js` are generated, so hand-edits are lost if they are ever regenerated.
To add one or two items, put them in `home.js` instead — that file is written by hand.

---

## The design

One idea: **the numbers are the interface.** This is an app for reading figures while standing
in a queue, so the figures are the largest thing on every screen, set in tabular mono on a sage
ground taken from the icon. Everything else is hairlines and space.

- **Two geometric registers, never mixed.** Squares (10px) for anything you pick — tiles,
  buttons, panels. Circles for anything that filters or toggles — chips, switches, status dots.
- **Not everything is a card.** The day's macros sit directly in the layout, because they are
  the page rather than an item on it. The meal periods are a table on hairlines. Food tiles get
  a border because you tap them. Advisory text gets a left rule, not a filled box.
- **Colour is semantic only.** `--accent` means progress. Green/amber/red mean good, middling
  and poor protein for the calories, and appear as one dot per dish — never as decoration.
- **Six glyphs, and no other icons.** One per meat family, so you can find "the fish one"
  without reading. A glyph next to a settings row would be decoration, so there isn't one.
- **The primary action is docked** above the tab bar, so it is under your thumb at any scroll
  position and its label carries the number: *Add to lunch · 1,093 kcal*.

Tokens live at the top of `styles.css`: one type scale, one spacing scale (4/8/12/16/24/32/48),
four radii, one shadow, one border colour.

---

## Where the numbers come from

Every canteen item is a **published CROUS figure, per portion as served**, scraped from the
CROUS Montpellier-Occitanie nutrition database (`infos-nutrition.crous-montpellier.fr`),
restaurant universitaire, on 15 September 2026. 213 items: 104 main dishes, 24 garnitures,
42 starters, 42 dairy and desserts, one bread roll.

Grenoble and Toulouse publish databases too, but per 100 g with no portion weights, so they
cannot be used here. Versailles, which covers the campus, publishes no nutrition data at all.
Portions are standardised across the network by GEM-RCN grammages, so Montpellier's figures
transfer.

Real serving variance is roughly **±15%**. The tray screen lets you say whether it was small,
normal or generous; normal is the published figure.

### Items marked `est.`

Four, and the marker shows everywhere they appear:

| Item | Why |
|---|---|
| `bread_roll` | CROUS does not publish it; standard baguette values |
| `choc_tart`, `choc_cake` | not in the Montpellier catalogue; standard reference values |
| `green_salad` | CROUS publishes 93 kcal/100 g for an item whose own macros total about 8 |

Anything else whose stated energy disagrees with its own macros by more than 30% is flagged the
same way at build time. Everything in `home.js` is marked `est.` too — those are label values.

---

## Where this differs from the original handover

1. **Plain HTML, CSS and JavaScript instead of Vite + React + TypeScript.** There is no Node on
   the machine this was built on, and a build step would mean you could no longer open a file
   and change a number.

2. **Two steps in the tray builder, not three.** The handover had you pick the plat, then the
   garniture, then a pair. Predicting all three and letting you correct any of them is fewer
   taps for the common case and no more for the uncommon one.

3. **The pair scorer caps its reward terms** (`FILL_CAP`). §7.3 says to clamp a negative need to
   a small positive; that stops the division exploding but lets one already-satisfied macro
   swamp the three that still matter.

4. **The need floor is per-slot, not 2 g** (`floorsFor`). Flooring protein at 2 g is what makes
   an already-satisfied meal stop caring about protein, which is how you end up recommending two
   puddings. It is floored at a quarter of what the slot was planned to deliver instead.

5. **Undershooting calories is penalised** (`kcalShort`). Without it the scorer returns a 150 kcal
   pair that leaves the meal 200 short, because two lentil salads max out the protein term
   cheaply. Predicted trays now land 1009–1093 kcal against a 1010 kcal plan.

6. **A 04:00 day boundary**, so a late-night snack lands on the night it belonged to.

7. **A home-food library and automatic weekend freezing**, because the canteen is shut at
   weekends and the handover had nothing to log on those days.

---

## The self-check

`tests.html` runs 49 checks: the prediction model, the recommender, the streak and freeze rules,
local dates, the export round trip, and the database. It works offline, and it turns off storage
before it runs, so it can never touch your logbook.

Three things it cannot decide are for you to confirm on the phone: that it installs to the home
screen, that a cold start works in airplane mode, and that no request leaves the device once the
service worker has cached everything.
