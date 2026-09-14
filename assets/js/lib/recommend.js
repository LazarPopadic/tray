/* The recommendation engine. Pure functions only — no DOM, no storage.
   tests.html exercises every rule in here against the acceptance criteria. */

import { WEIGHTS, SLOT_PLAN, TARGETS } from '../config.js';
import * as M from './macros.js';

/* ---------- what this meal still owes the day ---------------------------- */

/* `unlogged` includes the slot being built. drift spreads the day's surplus or
   shortfall evenly across every slot that has not happened yet, so one heavy lunch
   quietly shrinks dinner instead of blowing the day. */
export function slotNeed(slot, consumed, unlogged, targets = TARGETS, plan = SLOT_PLAN) {
  const planned = plan[slot] || M.ZERO;
  const list = unlogged.length ? unlogged : [slot];
  const plannedRest = M.sum(list.map(s => plan[s] || M.ZERO));
  const drift = M.sub(M.sub(targets, consumed), plannedRest);
  return M.add(planned, M.scale(drift, 1 / list.length));
}

/* ---------- garnitures ---------------------------------------------------- */

/* Rank by kcal descending, with one override: anything that is not starchy sorts to
   the bottom whatever its kcal. The top one is the pick. */
export function rankGarnitures(pool) {
  return pool.slice().sort((a, b) => {
    if (!!a.starchy !== !!b.starchy) return a.starchy ? -1 : 1;
    return b.macros.kcal - a.macros.kcal;
  });
}

export function garnitureReason(item, isTop, best) {
  if (isTop) return 'Heaviest carb on the counter.';
  if (!item.starchy) return null;   /* the vegetables are dealt with once, as a group */
  const gap = Math.round(best.macros.kcal - item.macros.kcal);
  return gap > 0 ? `${gap} kcal behind the top pick.` : null;
}

/* One line for the whole vegetable section, instead of the same scolding on every row. */
export function vegetableWarning(pool) {
  const starchy = pool.filter(g => g.starchy);
  const green = pool.filter(g => !g.starchy);
  if (!starchy.length || !green.length) return null;
  const best = starchy.reduce((a, b) => (a.macros.kcal >= b.macros.kcal ? a : b));
  const top = green.reduce((a, b) => (a.macros.kcal >= b.macros.kcal ? a : b));
  return `Even the heaviest of these costs you about ${
    Math.round(best.macros.kcal - top.macros.kcal)} kcal against the ${
    best.en.toLowerCase()}. Not a garniture — a decoration.`;
}

/* ---------- périphérique pairs -------------------------------------------- */

/* The handover's formula, with one correction.

   §7.3 says to clamp a negative `need` to a small positive so the scorer stays stable.
   That stops the division blowing up, but it does something worse: once a macro is
   already satisfied, dividing by 2 makes every fill ratio enormous, and that one
   already-met macro then swamps the three that still matter. So the reward terms are
   capped — meeting a macro earns full marks, exceeding it earns nothing extra.
   The fat penalty is deliberately left uncapped: going over on fat should keep hurting. */
export const FILL_CAP = 1.5;

export function scoreMacros(s, need) {
  const fill = (got, want) => Math.min(got / Math.max(want, 1), FILL_CAP);
  const fatFill = s.fat / Math.max(need.fat, 1);
  const kcalFill = s.kcal / Math.max(need.kcal, 1);
  return WEIGHTS.protein * fill(s.protein, need.protein)
       + WEIGHTS.carbs   * fill(s.carbs,   need.carbs)
       + WEIGHTS.kcal    * fill(s.kcal,    need.kcal)
       - WEIGHTS.fatPenalty * Math.max(0, fatFill - WEIGHTS.fatHeadroom)
       - (WEIGHTS.kcalShort || 0) * Math.max(0, 1 - kcalFill);
}

export function scorePair(a, b, need) {
  return scoreMacros(M.add(a.macros, b.macros), need);
}

/* One item against what is left — used when swapping a single slot. */
export function scoreSingle(item, need) {
  return scoreMacros(item.macros, need);
}

/* §7.4: once the plat has spent the fat budget, fatty périphériques are off the table
   entirely — that rules out the egg mayonnaise and both chocolate desserts without
   naming any of them. Below 8 g the day is open. */
export const FAT_SPENT = 18;
export const FAT_OPEN = 8;
export const RICH_PERIPH = 12;

export function filterPool(pool, platFat) {
  if (platFat >= FAT_SPENT) return pool.filter(i => i.macros.fat < RICH_PERIPH);
  return pool.slice();
}

/* Every unordered pair, scored. Returns the best `count`, each with a reason. */
export function recommendPairs(pool, need, ctx = {}, count = 3) {
  const items = filterPool(pool, ctx.platFat || 0);
  const boost = ctx.boost || (() => 0);
  const out = [];
  for (let i = 0; i < items.length; i++) {
    for (let j = i + 1; j < items.length; j++) {
      out.push({ a: items[i], b: items[j],
                 score: scorePair(items[i], items[j], need)
                        + boost(items[i].id) + boost(items[j].id) });
    }
  }
  out.sort((x, y) => y.score - x.score);

  /* Don't offer three near-identical pairs. Once an item has appeared twice, drop it. */
  const seen = {};
  const picked = [];
  for (const p of out) {
    const na = seen[p.a.id] || 0, nb = seen[p.b.id] || 0;
    if (na >= 2 || nb >= 2) continue;
    seen[p.a.id] = na + 1; seen[p.b.id] = nb + 1;
    picked.push(p);
    if (picked.length >= count) break;
  }
  return picked.map(p => ({ ...p, macros: M.add(p.a.macros, p.b.macros),
                            reason: pairReason(p.a, p.b, need, ctx) }));
}

/* ---------- reason lines --------------------------------------------------- */

function biggest(item, other, key) {
  return item.macros[key] >= other.macros[key] ? item : other;
}

/* A reason has to be about this pair, not about the day — otherwise all three cards
   say the same thing and the user learns to ignore them. */
export function pairReason(a, b, need, ctx = {}) {
  const s = M.add(a.macros, b.macros);
  const pWin = biggest(a, b, 'protein'), cWin = biggest(a, b, 'carbs');
  const r = Math.round;

  /* A need of 2 g is the clamp, not a real target: the main has already covered the
     protein, and saying so is more use than naming the biggest of two small numbers. */
  const proteinDone = need.protein <= 3;
  let line = proteinDone
    ? `The main already covers the protein, so these fill the remaining ${r(need.kcal)} kcal`
    : `${r(s.kcal)} kcal and ${r(s.protein)} g protein against a ${r(need.kcal)} kcal gap`;
  if (!proteinDone && s.protein >= 5) line += `, most of it from the ${pWin.en.toLowerCase()}`;
  else if (s.carbs >= 25) line += `, mostly carbs from the ${cWin.en.toLowerCase()}`;

  if (ctx.platFat >= FAT_SPENT && s.fat < RICH_PERIPH) {
    line += `, and almost no extra fat — the ${(ctx.platName || 'main').toLowerCase()
      } already brought ${Math.round(ctx.platFat)} g.`;
  } else if (ctx.platFat <= FAT_OPEN && s.fat >= RICH_PERIPH) {
    line += ', and the main was lean enough to carry it today.';
  } else {
    line += '.';
  }
  return line;
}

/* Day-level context, said once above the cards rather than on every one of them.
   "Behind" means behind what the slots you have already logged were meant to deliver. */
export function proteinNote(consumed, loggedSlots, plan) {
  const planned = loggedSlots.reduce((acc, s) => acc + ((plan[s] && plan[s].protein) || 0), 0);
  const behind = planned - consumed.protein;
  if (behind < 15) return null;
  return `You are ${Math.round(behind)} g of protein behind what today should have delivered ` +
         'by now. These picks lean that way.';
}

/* ---------- standing warnings --------------------------------------------- */

/* Generalised from the merguez rule: a lot of kcal, mostly fat, very little protein. */
export function platWarning(plat) {
  if (!plat) return null;
  const m = plat.macros;
  const density = m.kcal > 0 ? m.protein / m.kcal : 0;
  if (density < 0.05 && m.fat >= 20) {
    return `${Math.round(m.kcal)} kcal for ${Math.round(m.protein)} g protein. ` +
           'If there is a second meat today, take that instead.';
  }
  /* Only worth saying when the protein is genuinely small. A 500 kcal tagine with
     26 g of protein is a fine trade and should not be scolded. */
  if (density < 0.055 && m.protein < 20) {
    return `Mostly crumb and fat: ${Math.round(m.kcal)} kcal for only ${Math.round(m.protein)} g protein.`;
  }
  return null;
}

/* §7.4's open-budget case, stated plainly rather than smuggled into the scorer.
   Names the rich item that actually fits what the meal still owes, not simply the
   biggest one on the shelf. */
export function indulgenceNote(platFat, pool, need) {
  if (platFat > FAT_OPEN) return null;
  /* Only an actual pudding counts as an indulgence. A fatty potato salad is not a treat. */
  const rich = pool.filter(i => i.macros.fat >= RICH_PERIPH && i.category === 'dessert');
  if (!rich.length) return null;
  const best = need
    ? rich.slice().sort((a, b) =>
        Math.abs(a.macros.kcal - need.kcal) - Math.abs(b.macros.kcal - need.kcal))[0]
    : rich.slice().sort((a, b) => b.macros.kcal - a.macros.kcal)[0];
  return `The main is lean today, so the fat budget is open — this is the day for the ${
    best.en.toLowerCase()} if you want it.`;
}

/* ---------- filling the gap at the end of the day -------------------------- */

/* Translate a shortfall into something he can actually go and eat. */
export function gapAdvice(gap, homeItems) {
  if (gap.kcal <= 50 && gap.protein <= 5) return null;
  const parts = [];
  if (gap.protein > 8) {
    const whey = homeItems.find(i => i.id === 'whey');
    const milk = homeItems.find(i => i.id === 'milk_whole');
    if (whey) {
      const scoops = Math.max(1, Math.round(gap.protein / whey.macros.protein));
      const g = scoops * 10;
      const withMilk = gap.kcal - scoops * whey.macros.kcal > 150 && milk;
      parts.push(withMilk ? `${g} g of whey in 300 ml of whole milk` : `${g} g of whey`);
    }
  }
  if (gap.carbs > 40) {
    const oats = homeItems.find(i => i.id === 'oats');
    if (oats) parts.push(`${Math.round(gap.carbs / oats.macros.carbs) * 10} g of oats`);
  }
  if (!parts.length && gap.kcal > 200) {
    const pb = homeItems.find(i => i.id === 'peanut_butter');
    if (pb) parts.push(`${Math.round(gap.kcal / pb.macros.kcal) * 10} g of peanut butter`);
  }
  return parts.length ? parts.join(' and ') : null;
}
