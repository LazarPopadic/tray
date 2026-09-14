# Tray

A canteen tray builder and macro tracker for one person, one phone. Open it, tap what is on
the counter, and it tells you which sides to take and what the meal costs you.

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

## Using it

**Logging a tray is five taps.** Lunch tray → the meat → the garniture → one of the three
suggested pairs → confirm. The bread roll is already on.

- **Today** — four bars, the four slots, and one line telling you what is left.
- **Calendar** — a month at a glance, this week's average, the last 30 days as one line.
- **Streak** — the rules in plain words, and where to declare a trip.
- **Settings** — every number the app reasons with, plus export and import.

Weekends are frozen by default, because CROUS is shut. Frozen days are stepped over by the
streak rather than breaking it.

**Back up now and then.** iOS can clear a web app's storage when the phone runs low on space.
Settings → Export everything opens the share sheet; mail it to yourself. The app nags you at
30 days.

---

## Editing it

No build step, no Node, no npm. Edit a file, push, done.

```
index.html               the shell
sw.js                    offline cache — see the warning below
manifest.webmanifest     home-screen icon and name
assets/css/styles.css    everything visual
assets/js/config.js      targets, the planned day, scoring weights, thresholds
assets/js/data/foods.js  the CROUS catalogue (generated — see below)
assets/js/data/home.js   food from outside the canteen
assets/js/lib/           pure logic: macros, dates, storage, recommender, streak
assets/js/ui/            one file per screen
assets/js/tests.js       the self-check
```

Most things you would want to change are in `config.js`: the targets, what each slot is meant
to deliver, how the pair scorer is weighted, and the streak thresholds.

### The one thing to remember when you push

**Bump `VERSION` in `sw.js`** every time you change any file:

```js
var VERSION = "tray-v2";   // was tray-v1
```

The service worker serves from cache first so the app opens instantly and works offline. If
you do not bump the version, the phone can keep showing the old app. Bumping it throws the old
cache away on the next launch.

### Changing the food

`assets/js/data/foods.js` is generated from the CROUS database, so hand-edits get lost if it is
ever regenerated. To add one or two items, add them to `assets/js/data/home.js` instead — that
file is written by hand and is loaded everywhere the catalogue is.

---

## Where the numbers come from

Every canteen item is a **published CROUS figure, per portion as served**, scraped from the
CROUS Montpellier-Occitanie nutrition database (`infos-nutrition.crous-montpellier.fr`),
restaurant universitaire, on 15 September 2026. 213 items: 104 main dishes, 24 garnitures,
42 starters, 42 dairy and desserts, one bread roll.

Grenoble and Toulouse publish databases too, but per 100 g with no portion weights, so they
cannot be used here. Versailles, which covers the campus, publishes nothing at all. Portions
are standardised across the network by GEM-RCN grammages, so Montpellier's figures transfer.

Real serving variance is roughly **±15%** depending on who is holding the ladle. The confirm
sheet lets you say whether a tray was small, normal or generous.

### Items marked `est.`

Four, and the marker shows everywhere they appear:

| Item | Why |
|---|---|
| `bread_roll` | CROUS does not publish it; standard baguette values |
| `choc_tart`, `choc_cake` | not in the Montpellier catalogue; standard reference values |
| `green_salad` | CROUS publishes 93 kcal/100 g for an item whose own macros total about 8 |

Everything in `home.js` is marked `est.` too — those are label values, not measured ones.

---

## Where this differs from the handover

Four deliberate departures, all of them visible in the app:

1. **Plain HTML, CSS and JavaScript instead of Vite + React + TypeScript.** There is no Node on
   the machine this was built on, every other repo here is hand-written static files, and a build
   step would mean you could no longer open a file and change a number.

2. **The pair scorer caps its reward terms.** §7.3 says to clamp a negative `need` to a small
   positive. That stops the division exploding, but it means an already-satisfied macro divides
   by 2 and then swamps the three that still matter. Meeting a macro now earns full marks and
   exceeding it earns nothing extra. The fat penalty is still uncapped — going over on fat should
   keep hurting. See `FILL_CAP` in `lib/recommend.js`.

3. **The garniture vegetables are scolded once, as a group,** rather than eleven times over.

4. **`slotNeed` counts the slot being built** inside the unlogged set, so drift spreads across
   every meal that has not happened yet, including this one.

Two additions, both chosen deliberately:

- **A home-food library and automatic weekend freezing**, because the canteen is shut at
  weekends and the handover had nothing to log on those days.
- **A 04:00 day boundary**, so a late-night snack lands on the night it belonged to instead of
  quietly costing you yesterday's streak.

---

## The self-check

`tests.html` runs 35 checks against the acceptance criteria in §11 — the recommender, the streak
and freeze rules, local dates, the export round trip, and the database. It works offline, and it
turns off storage before it runs, so it can never touch your logbook.

Three criteria it cannot decide are for you to confirm on the phone: that it installs to the home
screen, that a cold start works in airplane mode, and that no request leaves the device once the
service worker has cached everything.
