/* Anything that is not a canteen tray.

   The fastest path is not picking food at all — it is repeating something you have
   eaten before, which for a student is most of what happens. So that comes first, and
   the catalogue is underneath it. */

import * as S from '../lib/store.js';
import * as M from '../lib/macros.js';
import { HOME_GROUPS, ALL_HOME, homeItem } from '../data/home.js';
import { SLOT_ORDER, SLOT_LABEL } from '../config.js';
import { nearestSlot } from '../lib/dates.js';
import { esc, n0, macroLine, tiles, trayRow, chipRow, stepper,
         openSheet, closeSheet, delta, entryLabel as makeLabel } from './common.js';
import { food } from '../data/foods.js';

let Q = null;

const lookup = id => food(id) || homeItem(id, S.settings().wheyOverride);

export function start() {
  const key = S.today();
  const logged = S.loggedSlots(key);
  const open = SLOT_ORDER.filter(s => !logged.includes(s));
  Q = {
    picked: [],                       /* [{ id, qty }] */
    custom: null,
    group: 'protein',
    slot: nearestSlot(open.length ? open : SLOT_ORDER) || 'extra'
  };
}

export function stop() { Q = null; }
export function active() { return !!Q; }

function items() {
  const w = S.settings().wheyOverride;
  return Q.picked.map(p => ({ row: p, item: homeItem(p.id, w) })).filter(x => x.item);
}

function macros() {
  const base = M.sum(items().map(x => M.scale(x.item.macros, x.row.qty)));
  return Q.custom ? M.add(base, Q.custom.macros) : base;
}

/* ---------- things you have eaten before ---------------------------------------------- */

function recentMeals(limit) {
  const days = S.get().days;
  const keys = Object.keys(days).sort().reverse();
  const seen = new Map();
  for (const k of keys) {
    for (const e of [...days[k].entries].reverse()) {
      if (e.slot === 'lunch' || e.slot === 'dinner') continue;   /* trays have their own flow */
      const sig = (e.customName || '') + '|' + (e.itemIds || []).join(',');
      if (!sig.trim() || sig === '|') continue;
      if (!seen.has(sig)) {
        seen.set(sig, { label: makeLabel(e, lookup), macros: e.macros,
                        itemIds: e.itemIds || [], customName: e.customName });
      }
      if (seen.size >= limit) return [...seen.values()];
    }
  }
  return [...seen.values()];
}

/* ---------- screen ----------------------------------------------------------------------- */

export const hasDock = true;

export function dock() {
  const m = macros();
  if (M.isZero(m)) return '';
  return `<button class="btn primary big wide" data-act="save">
    Log ${n0(m.kcal)} kcal to ${esc(SLOT_LABEL[Q.slot].toLowerCase())}</button>`;
}

export function title() { return 'Anything else'; }

export function render() {
  if (!Q) return '';
  const chosen = items();
  const recent = recentMeals(4);
  const w = S.settings().wheyOverride;
  const list = ALL_HOME.filter(i => i.group === Q.group);
  const before = S.dayTotals(S.today());
  const add = macros();
  const t = S.settings().targets;

  return `
    ${recent.length && !chosen.length && !Q.custom ? `
      <div class="section">
        <span class="label">Had it before</span>
        <div class="tiles one">
          ${recent.map((r, i) => `<button class="tile wide" data-act="repeat" data-i="${i}">
            <span class="en">${esc(r.label)}</span>
            <span class="figs"><b>${n0(r.macros.kcal)}</b> kcal · ${n0(r.macros.protein)} P</span>
          </button>`).join('')}
        </div>
      </div>` : ''}

    ${chosen.length || Q.custom ? `
      <div class="section">
        <span class="label">This meal</span>
        <div class="tray">
          ${chosen.map(x => `<div class="trayrow">
            <span class="what">
              <span class="n">${esc(x.item.en)}${x.row.qty > 1 ? ` &times;${x.row.qty}` : ''}</span>
              <span class="m">${macroLine(M.scale(x.item.macros, x.row.qty))}</span>
            </span>
            <span class="step">
              <button data-act="qty" data-id="${esc(x.item.id)}" data-d="-1"
                aria-label="Less ${esc(x.item.en)}">&minus;</button>
              <button data-act="qty" data-id="${esc(x.item.id)}" data-d="1"
                aria-label="More ${esc(x.item.en)}">+</button>
            </span>
          </div>`).join('')}
          ${Q.custom ? `<div class="trayrow">
            <span class="what"><span class="n">${esc(Q.custom.name)}</span>
              <span class="m">${macroLine(Q.custom.macros)}</span></span>
            <button class="btn sm ghost" data-act="dropcustom">Remove</button>
          </div>` : ''}
          <div class="traytotal">
            <span class="label">Total</span>
            <span class="v">${n0(add.kcal)} kcal</span>
          </div>
          <div class="small muted num" style="margin-top:var(--s1)">${macroLine(add)}</div>
        </div>
      </div>` : ''}

    <div class="section">
      <span class="label">${chosen.length ? 'Add more' : 'Or pick it'}</span>
      ${chipRow(HOME_GROUPS.concat([['blend', 'Blender shelf']]), Q.group, 'grp')}
      ${tiles(list.map(i => homeItem(i.id, w)), {
        act: 'add',
        empty: 'Nothing in this group.'
      })}
    </div>

    ${add.kcal > 0 ? `
      <div class="section">
        <span class="label">Log it as</span>
        <div class="wrap-row">
          ${SLOT_ORDER.concat(['extra']).map(s => `<button class="chip${Q.slot === s ? ' on' : ''}"
            data-act="slot" data-v="${s}" aria-pressed="${Q.slot === s}">${esc(SLOT_LABEL[s])}</button>`).join('')}
        </div>
      </div>
      <div class="section">
        <span class="label">Day after this</span>
        ${delta(before.kcal, add.kcal + before.kcal, t.kcal, ' kcal')}
        <div style="height:var(--s1)"></div>
        ${delta(before.protein, add.protein + before.protein, t.protein, ' g protein')}
      </div>` : ''}

    <div style="height:var(--s3)"></div>
    <button class="btn wide ghost" data-act="typemacros">Type the macros instead</button>
    <p class="tiny muted" style="margin-top:var(--s3)">
      Everything here is a standard label value, not a measured one.
    </p>`;
}

function typeSheet() {
  return openSheet(`
    <h2>Type the macros</h2>
    <p class="small muted">For anything with a label on it, or a decent guess.</p>
    <div class="field"><label for="x_name">What was it</label>
      <input id="x_name" type="text" placeholder="kebab"></div>
    ${[['x_k', 'kcal'], ['x_p', 'Protein (g)'], ['x_f', 'Fat (g)'], ['x_c', 'Carbs (g)']]
      .map(([id, lab]) => `<div class="field"><label for="${id}">${lab}</label>
        <input id="${id}" type="number" inputmode="decimal" value="0"></div>`).join('')}
    <div style="height:var(--s3)"></div>
    <button class="btn primary wide" data-act="typesave">Add it</button>
  `, { label: 'Type the macros' });
}

export function onAct(act, ds, e, rerender, go) {
  switch (act) {
    case 'grp': Q.group = ds.v; return rerender();
    case 'add': {
      const row = Q.picked.find(p => p.id === ds.id);
      if (row) row.qty++; else Q.picked.push({ id: ds.id, qty: 1 });
      return rerender();
    }
    case 'qty': {
      const row = Q.picked.find(p => p.id === ds.id);
      if (!row) return;
      row.qty += Number(ds.d);
      if (row.qty <= 0) Q.picked = Q.picked.filter(p => p.id !== ds.id);
      return rerender();
    }
    case 'slot': Q.slot = ds.v; return rerender();
    case 'dropcustom': Q.custom = null; return rerender();
    case 'typemacros': return typeSheet();
    case 'typesave': {
      const v = id => Number(document.getElementById(id).value) || 0;
      const name = document.getElementById('x_name').value.trim() || 'Something else';
      const m = { kcal: v('x_k'), protein: v('x_p'), fat: v('x_f'), carbs: v('x_c') };
      if (!M.isZero(m)) Q.custom = { name, macros: m };
      closeSheet();
      return rerender();
    }
    case 'repeat': {
      const r = recentMeals(4)[Number(ds.i)];
      if (!r) return;
      S.addEntry(S.today(), {
        slot: Q.slot, itemIds: r.itemIds, customName: r.customName, macros: r.macros
      });
      Q = null;
      return go('#/today');
    }
    case 'cancel': return closeSheet();
    case 'save': {
      const m = macros();
      if (M.isZero(m)) return;
      const chosen = items();
      const made = chosen.map(x => x.row.qty > 1 ? `${x.item.en} x${x.row.qty}` : x.item.en).join(', ');
      const label = [Q.custom ? Q.custom.name : '', made].filter(Boolean).join(' + ');
      S.addEntry(S.today(), {
        slot: Q.slot,
        itemIds: chosen.flatMap(x => Array(x.row.qty).fill(x.item.id)),
        customMacros: Q.custom ? Q.custom.macros : undefined,
        customName: label || 'Something else',
        macros: M.round(m)
      });
      Q = null;
      return go('#/today');
    }
  }
}
