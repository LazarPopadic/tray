/* Predicting the tray.

   The handover's recommender (lib/recommend.js) answers "what should I take to hit my
   targets". That is a different question from "what is probably already on the tray",
   and conflating them produces advice that is both wrong about reality and quietly
   bossy about diet.

   So the two are kept apart. This file predicts. recommend.js advises. When they
   disagree, the app shows the prediction and states the advice next to it, and the
   user decides. */

import { OBSERVED_FREQ, tagsFor, affinity } from '../data/pairings.js';
import * as R from './recommend.js';
import * as M from './macros.js';

const MAX_FREQ = Math.max(...Object.values(OBSERVED_FREQ), 1);

/* Three sources of belief, weighted by how much they deserve to be believed.
   History wins once it exists: what this person actually took beats both the national
   menu prior and any editorial pairing table. */
const W = { affinity: 1.0, observed: 0.7, history: 2.2 };

export function garnitureScore(plat, g, history) {
  const tags = tagsFor(plat);
  const aff = (affinity(tags, g.id) + 1) / 3;                    /* -1..2 -> 0..1 */
  const freq = Math.log(1 + (OBSERVED_FREQ[g.id] || 0)) / Math.log(1 + MAX_FREQ);
  const seen = history ? history(g.id) : 0;
  const hist = seen / (seen + 2);                                 /* saturating */
  return W.affinity * aff + W.observed * freq + W.history * hist;
}

/* Ranked garnitures for this main, most likely first. */
export function rankGarnituresFor(plat, pool, history) {
  return pool
    .map(g => ({ item: g, score: garnitureScore(plat, g, history) }))
    .sort((a, b) => b.score - a.score);
}

/* The one line of advice §7.2 exists to give, said only when it is worth saying:
   the prediction is probably right, but a heavier starch is sitting right there. */
export function garnitureAdvice(predicted, pool) {
  if (!predicted) return null;
  const best = R.rankGarnitures(pool)[0];
  if (!best || best.id === predicted.id) return null;
  const gap = Math.round(best.macros.kcal - predicted.macros.kcal);
  if (gap < 60) return null;
  if (!predicted.starchy) {
    return `That is a vegetable, not a garniture. The ${best.en.toLowerCase()} is ${gap} kcal more.`;
  }
  return `The ${best.en.toLowerCase()} is ${gap} kcal heavier if both are going.`;
}

/* A whole tray, predicted in one go: the main you picked, the garniture most likely to
   be beside it, the two périphériques that best fill what the day still needs, and the
   bread that comes with the formula whether you take it or not. */
export function predictTray(plat, opts) {
  const { garniturePool, periphPool, need, history, periphHistory } = opts;
  const floors = opts.floors || 2;

  const ranked = plat && plat.selfContained ? [] : rankGarnituresFor(plat, garniturePool, history);
  const garniture = ranked.length ? ranked[0].item : null;

  const onTray = M.sum([
    plat ? plat.macros : M.ZERO,
    garniture ? garniture.macros : M.ZERO,
    opts.bread ? opts.bread.macros : M.ZERO
  ]);
  const remaining = M.clampPositive(M.sub(need, onTray), floors);

  /* Don't hand back a second helping of the same starch that is already on the plate. */
  const starchOnPlate = garniture && garniture.starchy;
  const pool = periphPool.filter(p => !(starchOnPlate && p.starchy && p.macros.carbs > 20));
  const usable = pool.length >= 4 ? pool : periphPool;

  const pairs = R.recommendPairs(usable, remaining, {
    platFat: plat ? plat.macros.fat : 0,
    platName: plat ? plat.en : '',
    boost: id => (periphHistory ? Math.min(periphHistory(id), 4) * 0.25 : 0)
  }, 3);

  return {
    plat,
    garniture,
    garnitureAlternatives: ranked.slice(1, 9).map(r => r.item),
    periph: pairs.length ? [pairs[0].a, pairs[0].b] : [],
    alternativePairs: pairs.slice(1),
    reason: pairs.length ? pairs[0].reason : null,
    advice: garnitureAdvice(garniture, garniturePool),
    warning: R.platWarning(plat),
    /* Don't offer a pudding when the prediction has already put two on the tray. */
    indulgence: (pairs.length && pairs[0].macros.fat >= 8)
      ? null
      : R.indulgenceNote(plat ? plat.macros.fat : 0, usable, remaining),
    need: remaining
  };
}

/* Candidates for replacing one slot, best first — used by the swap sheet so that
   correcting a prediction is never slower than making it. */
export function swapCandidates(slot, ctx) {
  if (slot === 'garniture') {
    return rankGarnituresFor(ctx.plat, ctx.garniturePool, ctx.history).map(r => r.item);
  }
  const chosen = new Set(ctx.keep.map(i => i.id));
  const need = M.clampPositive(M.sub(ctx.need, M.sum(ctx.keep.map(i => i.macros))), ctx.floors || 2);
  return R.filterPool(ctx.periphPool, ctx.plat ? ctx.plat.macros.fat : 0)
    .filter(i => !chosen.has(i.id))
    .map(i => ({ item: i, s: R.scoreSingle(i, need) + (ctx.periphHistory ? Math.min(ctx.periphHistory(i.id), 4) * 0.25 : 0) }))
    .sort((a, b) => b.s - a.s)
    .map(x => x.item);
}
