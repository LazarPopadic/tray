/* The canteen tray.

   Two steps, not three. Pick the main; the app predicts the rest of the tray and
   shows it assembled, each line swappable in one tap. From the Today screen that is
   four taps to a logged meal — add, tray, main, confirm — and correcting a wrong
   prediction costs one more, never a restart. */

import * as S from '../lib/store.js';
import * as M from '../lib/macros.js';
import * as R from '../lib/recommend.js';
import * as P from '../lib/predict.js';
import { FOODS, PLATS, GARNITURES, PERIPH, STAPLES, FAMILIES, BREAD, food } from '../data/foods.js';
import { SLOT_ORDER, SLOT_LABEL, SLOT_SHORT, PORTION_SCALES } from '../config.js';
import { esc, n0, macroLine, tile, tiles, trayRow, chipRow, steps,
         openSheet, closeSheet, delta, estTag } from './common.js';
import { nearestSlot } from '../lib/dates.js';

let B = null;

export function start(slot) {
  const key = S.today();
  const logged = S.loggedSlots(key);
  const open = ['lunch', 'dinner'].filter(s => !logged.includes(s));
  B = {
    slot: slot || nearestSlot(open.length ? open : ['lunch', 'dinner']) || 'lunch',
    step: 1, platId: null, garnitureId: null, periphIds: [],
    bread: true, scale: 'normal', family: 'recent', query: '',
    custom: null, prediction: null
  };
}

export function stop() { B = null; }
export function active() { return !!B; }
export function currentSlot() { return B ? B.slot : null; }
export function step() { return B ? B.step : 0; }
export function back() {
  if (!B) return false;
  if (B.step > 1) { B.step = 1; return true; }
  return false;
}

/* ---------- pools ------------------------------------------------------------------ */

function periphPool() {
  const st = S.settings();
  const base = st.fullCatalogue ? PERIPH : STAPLES;
  const av = st.availability && st.availability.periph ? new Set(st.availability.periph) : null;
  const pool = av ? base.filter(f => av.has(f.id)) : base;
  return pool.length >= 4 ? pool : base;
}

function garniturePool() {
  const st = S.settings();
  const av = st.availability && st.availability.garniture
    ? new Set(st.availability.garniture) : null;
  const pool = av ? GARNITURES.filter(f => av.has(f.id)) : GARNITURES;
  return pool.length ? pool : GARNITURES;
}

/* What this meal still owes the day (§7.3). */
function need() {
  const key = S.today();
  const logged = S.loggedSlots(key);
  const unlogged = SLOT_ORDER.filter(s => !logged.includes(s) || s === B.slot);
  return R.slotNeed(B.slot, S.dayTotals(key), unlogged, S.settings().targets, S.settings().slotPlan);
}

function items() {
  const list = [B.platId, B.garnitureId, ...B.periphIds].filter(Boolean).map(food).filter(Boolean);
  if (B.bread && BREAD) list.push(BREAD);
  return list;
}

function macros() {
  const base = M.sum(items().map(i => i.macros));
  const withCustom = B.custom ? M.add(base, B.custom.macros) : base;
  const f = (PORTION_SCALES.find(p => p.id === B.scale) || { factor: 1 }).factor;
  return M.scale(withCustom, f);
}

function floors() {
  return M.floorsFor(S.settings().slotPlan[B.slot]);
}

function predict() {
  const plat = food(B.platId);
  B.prediction = P.predictTray(plat, {
    floors: floors(),
    garniturePool: garniturePool(),
    periphPool: periphPool(),
    need: need(),
    bread: B.bread ? BREAD : null,
    history: S.pairHistory(B.platId),
    periphHistory: S.anyPairHistory()
  });
  B.garnitureId = B.prediction.garniture ? B.prediction.garniture.id : null;
  B.periphIds = B.prediction.periph.map(i => i.id);
}

/* ---------- step 1: the main ---------------------------------------------------------- */

function platList() {
  const q = B.query.trim().toLowerCase();
  if (q) return PLATS.filter(f => f.en.toLowerCase().includes(q) || f.fr.toLowerCase().includes(q));
  if (B.family === 'recent') {
    const seen = S.recent('plat').map(food).filter(f => f && f.category === 'plat');
    return seen.length ? seen.slice(0, 10) : PLATS.slice(0, 10);
  }
  if (B.family === 'all') return PLATS;
  return PLATS.filter(f => f.family === B.family);
}

function renderStep1() {
  const list = platList();
  const chips = [['recent', 'Recent'], ...FAMILIES, ['all', `All ${PLATS.length}`]];
  const fresh = B.family === 'recent' && !S.recent('plat').length;
  return `
    <h2>What is the main?</h2>
    <p class="small muted">Pick what you can see on the counter. Everything else follows from it.</p>
    ${chipRow(chips, B.query ? null : B.family, 'fam')}
    <input class="search" type="search" placeholder="Search ${PLATS.length} dishes"
      value="${esc(B.query)}" data-act="q" autocomplete="off" autocorrect="off"
      aria-label="Search main dishes">
    <div style="height:var(--s3)"></div>
    ${fresh ? '<div class="note" style="margin-bottom:var(--s3)">Best options by protein for now. Once you have logged a few trays, what you actually eat comes first.</div>' : ''}
    ${tiles(list, { act: 'plat', empty: 'Nothing matches. Try the French name.' })}
    <div style="height:var(--s3)"></div>
    <button class="btn wide ghost" data-act="freeplat">Not on the list — enter it by hand</button>`;
}

/* ---------- step 2: the predicted tray -------------------------------------------------- */

function renderStep2() {
  const plat = food(B.platId);
  const pr = B.prediction || {};
  const g = B.garnitureId ? food(B.garnitureId) : null;
  const per = B.periphIds.map(food).filter(Boolean);
  const before = S.dayTotals(S.today());
  const add = macros();
  const after = M.add(before, add);
  const t = S.settings().targets;
  const learned = B.platId && S.pairCount(B.platId, B.garnitureId) > 0;

  /* Every advisory line is derived from what is on the tray right now, not from the
     original prediction — otherwise swapping to the semolina leaves the app still
     arguing for the semolina. */
  const advice = P.garnitureAdvice(g, garniturePool());
  const remaining = M.clampPositive(M.sub(need(), M.sum(
    [plat ? plat.macros : M.ZERO, g ? g.macros : M.ZERO,
     B.bread ? BREAD.macros : M.ZERO])), floors());
  const reason = per.length === 2
    ? R.pairReason(per[0], per[1], remaining,
        { platFat: plat ? plat.macros.fat : 0, platName: plat ? plat.en : '' })
    : null;
  const indulgence = per.some(i => i.macros.fat >= 8)
    ? null
    : R.indulgenceNote(plat ? plat.macros.fat : 0, periphPool(), remaining);

  return `
    <h2>Probably on your tray</h2>
    <p class="small muted">Change any line, or confirm the lot.</p>

    ${pr.warning ? `<div class="note warn">${esc(pr.warning)}</div><div style="height:var(--s3)"></div>` : ''}

    <div class="tray">
      ${trayRow('Main', plat, { swap: 'plat' })}
      ${plat && plat.selfContained && !g
        ? trayRow('Side', null, { swap: 'garniture', emptyText: 'Served as a full plate' })
        : trayRow('Side', g, {
            swap: 'garniture',
            why: learned ? 'What you usually take with this.' : (advice || null),
            emptyText: 'No garniture' })}
      ${trayRow('Shelf', per[0], { swap: 'periph', index: 0, emptyText: 'Nothing chosen' })}
      ${trayRow('Shelf', per[1], { swap: 'periph', index: 1, emptyText: 'Nothing chosen' })}
      <div class="trayrow${B.bread ? '' : ' none'}">
        <span class="slotname label">Bread</span>
        <span class="what">
          <span class="n">${B.bread ? `Bread roll${estTag(BREAD)}` : 'Left behind'}</span>
          <span class="m">${B.bread ? `${n0(BREAD.macros.kcal)} kcal · ${n0(BREAD.macros.protein)} P`
            : 'in the formula whether you take it or not'}</span>
        </span>
        <button class="btn sm ghost" data-act="bread">${B.bread ? 'Remove' : 'Take it'}</button>
      </div>
      ${B.custom ? `<div class="trayrow">
        <span class="slotname label">Added</span>
        <span class="what"><span class="n">${esc(B.custom.name)}</span>
          <span class="m">${macroLine(B.custom.macros)}</span></span>
        <button class="btn sm ghost" data-act="dropcustom">Remove</button>
      </div>` : ''}
      <div class="traytotal">
        <span class="label">Whole tray</span>
        <span class="v">${n0(add.kcal)} kcal</span>
      </div>
      <div class="small muted num" style="margin-top:var(--s1)">${
        n0(add.protein)} g protein &middot; ${n0(add.fat)} g fat &middot; ${n0(add.carbs)} g carbs</div>
    </div>

    ${reason ? `<div style="height:var(--s3)"></div>
      <div class="note"><b>The two from the shelf.</b> ${esc(reason)}</div>` : ''}

    ${indulgence ? `<div style="height:var(--s3)"></div><div class="note">${esc(indulgence)}</div>` : ''}

    <div class="section">
      <span class="label">How big was it</span>
      <div class="wrap-row">
        ${PORTION_SCALES.map(p => `<button class="chip${B.scale === p.id ? ' on' : ''}"
          data-act="scale" data-v="${p.id}" aria-pressed="${B.scale === p.id}">${p.label}</button>`).join('')}
      </div>
      <p class="tiny muted" style="margin-top:var(--s2)">
        CROUS portions swing about ±15% depending on who is serving. Normal is the published figure.
      </p>
    </div>

    <div class="section">
      <span class="label">Log it as</span>
      <div class="wrap-row">
        ${['lunch', 'dinner'].map(s => `<button class="chip${B.slot === s ? ' on' : ''}"
          data-act="slot" data-v="${s}" aria-pressed="${B.slot === s}">${SLOT_LABEL[s]}</button>`).join('')}
      </div>
    </div>

    <div class="section">
      <span class="label">Day after this</span>
      ${delta(before.kcal, after.kcal, t.kcal, ' kcal')}
      <div style="height:var(--s1)"></div>
      ${delta(before.protein, after.protein, t.protein, ' g protein')}
    </div>

    <div style="height:var(--s3)"></div>
    <button class="btn wide ghost" data-act="addmore">Add something else to the tray</button>`;
}

/* ---------- swapping ---------------------------------------------------------------------- */

function swapSheet(slot, index) {
  const plat = food(B.platId);
  if (slot === 'plat') {
    B.step = 1;
    closeSheet();
    return true;
  }
  const keep = slot === 'periph'
    ? B.periphIds.filter((_, i) => i !== Number(index)).map(food)
    : [];
  const list = P.swapCandidates(slot, {
    plat,
    garniturePool: garniturePool(),
    periphPool: periphPool(),
    need: M.clampPositive(M.sub(need(), M.sum(
      [plat ? plat.macros : M.ZERO, B.bread ? BREAD.macros : M.ZERO,
       slot === 'periph' && B.garnitureId ? food(B.garnitureId).macros : M.ZERO])), floors()),
    floors: floors(),
    keep,
    history: S.pairHistory(B.platId),
    periphHistory: S.anyPairHistory()
  });
  const current = slot === 'garniture' ? B.garnitureId : B.periphIds[Number(index)];

  openSheet(`
    <h2>${slot === 'garniture' ? 'What came with it?' : 'From the shelf'}</h2>
    <p class="small muted">${slot === 'garniture'
      ? 'Best guesses first, based on what usually goes with this dish and what you have taken before.'
      : 'Ordered by what this meal still needs.'}</p>
    <div class="tiles">${list.slice(0, 24).map(it => tile(it, {
      act: 'choose',
      data: { slot, i: index == null ? '' : index },
      selectable: true,
      selected: it.id === current
    })).join('')}</div>
    <div style="height:var(--s3)"></div>
    ${slot === 'garniture'
      ? '<button class="btn wide ghost" data-act="nogarn">No garniture today</button>'
      : '<button class="btn wide ghost" data-act="noperiph" data-i="' + index + '">Leave this one empty</button>'}
  `, { label: 'Choose' });
  return false;
}

function freeSheet(target) {
  return openSheet(`
    <h2>Enter it by hand</h2>
    <p class="small muted">For whatever the counter served that is not in the catalogue.</p>
    <div class="field"><label for="c_name">What was it</label>
      <input id="c_name" type="text" placeholder="lamb tagine"></div>
    ${[['c_k', 'kcal'], ['c_p', 'Protein (g)'], ['c_f', 'Fat (g)'], ['c_c', 'Carbs (g)']]
      .map(([id, lab]) => `<div class="field"><label for="${id}">${lab}</label>
        <input id="${id}" type="number" inputmode="decimal" value="0"></div>`).join('')}
    <div style="height:var(--s3)"></div>
    <button class="btn primary wide" data-act="freesave" data-target="${target}">Add it</button>
  `, { label: 'Enter macros by hand' });
}

/* ---------- shell ------------------------------------------------------------------------- */

export const hasDock = true;

export function dock() {
  if (!B || B.step === 1) return '';
  const add = macros();
  return `<button class="btn primary big wide" data-act="save">
    Add to ${esc(SLOT_SHORT[B.slot])} &middot; ${n0(add.kcal)} kcal</button>`;
}

export function render() {
  if (!B) return '';
  return B.step === 1 ? renderStep1() : renderStep2();
}

export function title() { return B ? SLOT_LABEL[B.slot] : 'Tray'; }
export function sub() { return B ? steps(B.step, 2) : ''; }

export function onAct(act, ds, e, rerender, go) {
  switch (act) {
    case 'fam': B.family = ds.v; B.query = ''; return rerender();
    case 'q': B.query = e.target.value; return rerender({ keepFocus: 'q' });

    case 'plat':
      B.platId = ds.id;
      predict();
      B.step = 2;
      return rerender();

    case 'swap': {
      if (swapSheet(ds.slot, ds.i)) return rerender();
      return;
    }
    case 'choose': {
      if (ds.slot === 'garniture') B.garnitureId = ds.id;
      else B.periphIds[Number(ds.i)] = ds.id;
      closeSheet();
      return rerender();
    }
    case 'nogarn': B.garnitureId = null; closeSheet(); return rerender();
    case 'noperiph': B.periphIds.splice(Number(ds.i), 1); closeSheet(); return rerender();

    case 'bread': B.bread = !B.bread; return rerender();
    case 'scale': B.scale = ds.v; return rerender();
    case 'slot': B.slot = ds.v; return rerender();
    case 'addmore': return freeSheet('extra');
    case 'freeplat': return freeSheet('plat');
    case 'dropcustom': B.custom = null; return rerender();

    case 'freesave': {
      const v = id => Number(document.getElementById(id).value) || 0;
      const name = document.getElementById('c_name').value.trim() || 'Something else';
      B.custom = { name, macros: { kcal: v('c_k'), protein: v('c_p'), fat: v('c_f'), carbs: v('c_c') } };
      closeSheet();
      if (ds.target === 'plat' && !B.platId) {
        B.prediction = P.predictTray(null, {
          floors: floors(),
          garniturePool: garniturePool(), periphPool: periphPool(), need: need(),
          bread: B.bread ? BREAD : null, periphHistory: S.anyPairHistory()
        });
        B.garnitureId = B.prediction.garniture ? B.prediction.garniture.id : null;
        B.periphIds = B.prediction.periph.map(i => i.id);
        B.step = 2;
      }
      return rerender();
    }

    case 'cancel': return closeSheet();

    case 'save': {
      const list = items();
      const sides = [B.garnitureId, ...B.periphIds].filter(Boolean);
      S.addEntry(S.today(), {
        slot: B.slot,
        itemIds: list.map(i => i.id),
        customMacros: B.custom ? B.custom.macros : undefined,
        customName: B.custom ? B.custom.name : undefined,
        scale: B.scale,
        macros: M.round(macros()),
        recentBuckets: {
          plat: B.platId ? [B.platId] : [],
          garniture: B.garnitureId ? [B.garnitureId] : [],
          periph: B.periphIds
        }
      });
      /* Remember what actually went with this main, so the next prediction is better. */
      if (B.platId) S.rememberPairing(B.platId, sides);
      closeSheet();
      B = null;
      return go('#/today');
    }
  }
}
