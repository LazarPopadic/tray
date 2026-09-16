/* Breakfast and the night shake: the same screen with different defaults. */

import * as S from '../lib/store.js';
import * as M from '../lib/macros.js';
import { INGREDIENTS, homeItem } from '../data/home.js';
import { BREAKFAST_DEFAULT, SHAKE_DEFAULT, SLOT_LABEL, RECIPE_NAME } from '../config.js';
import { esc, n0, macroLine, stepper, bar, delta } from './common.js';

const SPEC = {
  breakfast: {
    slot: 'breakfast',
    heading: 'Morning blend',
    fallback: BREAKFAST_DEFAULT,
    explainer:
      'Semi-skimmed, not whole — the canteen already loads you with fat, and whole milk puts you ' +
      '17 g over for nothing you need. If you have no blender, mix it in a jar the night before and ' +
      'eat it cold.'
  },
  shake: {
    slot: 'shake',
    heading: 'Night shake',
    fallback: SHAKE_DEFAULT,
    explainer:
      'Whole milk here, not semi — this is the one place the extra fat is doing something, because ' +
      'it slows the protein down overnight.'
  }
};

let draft = null;
let which = null;

export function start(kind) {
  which = kind;
  const saved = S.settings().recipes[kind];
  draft = (saved && saved.length ? saved : SPEC[kind].fallback).map(r => ({ ...r }));
}

function items() {
  const w = S.settings().wheyOverride;
  return draft.map(r => ({ row: r, item: homeItem(r.id, w) })).filter(x => x.item);
}

function total() {
  return M.sum(items().map(x => M.scale(x.item.macros, x.row.qty)));
}

export function title() { return SPEC[which].heading; }

export const hasDock = true;

export function dock() {
  const t = total();
  if (M.isZero(t)) return '';
  return `<button class="btn primary big wide" data-act="log">Log ${n0(t.kcal)} kcal</button>`;
}

export function render() {
  const spec = SPEC[which];
  const t = total();
  const plan = S.settings().slotPlan[spec.slot];
  const pool = INGREDIENTS.filter(i => !draft.some(d => d.id === i.id));

  return `
    <div class="panel">
      <div class="row between">
        <h2>${esc(spec.heading)}</h2>
        <span class="num" style="font-weight:640">${n0(t.kcal)} kcal</span>
      </div>
      <div class="small muted num" style="margin-top:2px">${macroLine(t)}</div>
      <div style="margin-top:var(--s3)">
        <div class="row between tiny muted" style="margin-bottom:var(--s1)">
          <span class="label">protein</span>
          <span class="num">${n0(t.protein)} / ${n0(plan.protein)} g planned</span>
        </div>
        ${bar(t.protein, plan.protein)}
      </div>
    </div>

    <div class="panel">
      ${items().map(x => stepper(x.item, x.row.qty, 'q')).join('')}
    </div>

    ${pool.length ? `<span class="label" style="display:block;margin:var(--s5) 0 var(--s2)">Add something</span>
      <div class="wrap-row">${pool.map(i =>
        `<button class="chip" data-act="adding" data-id="${esc(i.id)}">+ ${esc(i.en)}</button>`
      ).join('')}</div>` : ''}

    <div class="note" style="margin-top:16px">${esc(spec.explainer)}</div>
    <p class="tiny muted" style="margin-top:8px">
      These are standard label values, not measured ones. Put your own tub's numbers into the
      whey in Settings and this screen gets a lot more accurate.
    </p>

    <div style="height:var(--s4)"></div>
    <button class="btn wide ghost" data-act="savedefault">Save this as my default</button>
    <div style="height:var(--s2)"></div>
    <button class="btn wide quiet" data-act="reset">Back to the standard blend</button>`;
}

export function onAct(act, ds, e, rerender, go) {
  switch (act) {
    case 'q': {
      const row = draft.find(r => r.id === ds.id);
      if (!row) return;
      row.qty = Math.max(0, row.qty + Number(ds.d));
      if (row.qty === 0) draft = draft.filter(r => r.id !== ds.id);
      return rerender();
    }
    case 'adding':
      if (!draft.some(r => r.id === ds.id)) draft.push({ id: ds.id, qty: 1 });
      return rerender();
    case 'savedefault': {
      const recipes = { ...S.settings().recipes, [which]: draft.map(r => ({ ...r })) };
      S.setSettings({ recipes });
      return rerender({ toast: 'Saved as your default.' });
    }
    case 'reset':
      draft = SPEC[which].fallback.map(r => ({ ...r }));
      return rerender();
    case 'log': {
      const t = total();
      if (M.isZero(t)) return;
      S.addEntry(S.today(), {
        slot: SPEC[which].slot,
        itemIds: draft.flatMap(r => Array(r.qty).fill(r.id)),
        customName: RECIPE_NAME[SPEC[which].slot],
        macros: M.round(t)
      });
      return go('#/today');
    }
  }
}
