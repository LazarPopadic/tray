/* The tray builder: three steps, then a confirm sheet.
   Fast path from the Today screen is 5 taps — slot, plat, garniture, pair, confirm. */

import * as S from '../lib/store.js';
import * as M from '../lib/macros.js';
import * as R from '../lib/recommend.js';
import { FOODS, BY_ID, PLATS, GARNITURES, PERIPH, STAPLES, FAMILIES, BREAD, food } from '../data/foods.js';
import { SLOT_ORDER, SLOT_LABEL, PORTION_SCALES, rankOf } from '../config.js';
import { esc, n0, macroLine, dishCard, pairCard, chipRow, openSheet, closeSheet,
         meter, estTag, sign } from './common.js';

let B = null;
let lastPairs = [];

export function start(slot) {
  B = { slot, step: 1, platId: null, garnitureIds: [], periphIds: [],
        bread: true, scale: 'normal', family: 'recent', query: '',
        multiGarniture: false, custom: null, showShelf: false };
}

export function stop() { B = null; }
export function active() { return !!B; }
export function currentSlot() { return B ? B.slot : null; }
export function step() { return B ? B.step : 0; }

export function back() {
  if (!B) return false;
  if (B.step > 1) { B.step--; return true; }
  return false;
}

/* ---------- pools ------------------------------------------------------------ */

function availability() {
  const a = S.settings().availability;
  return a && a.periph ? new Set(a.periph) : null;
}

function periphPool() {
  const base = S.settings().fullCatalogue ? PERIPH : STAPLES;
  const av = availability();
  return av ? base.filter(f => av.has(f.id)) : base;
}

function trayItems() {
  const ids = [B.platId, ...B.garnitureIds, ...B.periphIds].filter(Boolean);
  const items = ids.map(food).filter(Boolean);
  if (B.bread && BREAD) items.push(BREAD);
  return items;
}

function trayMacros() {
  const base = M.sum(trayItems().map(i => i.macros));
  const withCustom = B.custom ? M.add(base, B.custom.macros) : base;
  const f = (PORTION_SCALES.find(p => p.id === B.scale) || { factor: 1 }).factor;
  return M.scale(withCustom, f);
}

/* What this meal still owes the day, minus what is already on the tray. */
function need() {
  const key = S.today();
  const logged = S.loggedSlots(key);
  const unlogged = SLOT_ORDER.filter(s => !logged.includes(s) || s === B.slot);
  const raw = R.slotNeed(B.slot, S.dayTotals(key), unlogged, S.settings().targets, S.settings().slotPlan);
  const onTray = M.sum([
    B.platId ? food(B.platId).macros : M.ZERO,
    ...B.garnitureIds.map(id => food(id).macros),
    B.bread && BREAD ? BREAD.macros : M.ZERO
  ]);
  return M.clampPositive(M.sub(raw, onTray), 2);
}

/* ---------- step 1: the meat -------------------------------------------------- */

function platList() {
  const q = B.query.trim().toLowerCase();
  if (q) {
    return FOODS.filter(f => f.category === 'plat' &&
      (f.en.toLowerCase().includes(q) || f.fr.toLowerCase().includes(q)));
  }
  if (B.family === 'recent') {
    const ids = S.recent('plat');
    const seen = ids.map(food).filter(f => f && f.category === 'plat');
    return seen.length ? seen : PLATS.slice(0, 12);
  }
  if (B.family === 'all') return PLATS;
  return PLATS.filter(f => f.family === B.family);
}

function renderStep1() {
  const list = platList();
  const chips = [['recent', 'Recent'], ...FAMILIES, ['all', `All ${PLATS.length}`]];
  const empty = B.family === 'recent' && !S.recent('plat').length
    ? '<div class="note">Nothing logged yet, so these are the best options by protein. Once you have logged a few, what you actually eat comes first.</div>'
    : '';
  return `
    <h2>What is the meat?</h2>
    <p class="small muted" style="margin:4px 0 10px">Pick what you can see on the counter.</p>
    ${chipRow(chips, B.query ? null : B.family, 'fam')}
    <input class="search" type="search" placeholder="Search ${PLATS.length} dishes…"
           value="${esc(B.query)}" data-act="q" autocomplete="off" autocorrect="off">
    <div style="height:10px"></div>
    ${empty}
    <div class="dishes">
      ${list.map(f => dishCard(f, { act: 'plat' })).join('')}
      ${list.length ? '' : '<div class="note">Nothing matches. Try the French name.</div>'}
    </div>
    <div style="height:10px"></div>
    <button class="btn wide ghost" data-act="freeplat">Something else — enter it by hand</button>`;
}

/* ---------- step 2: the garniture --------------------------------------------- */

function renderStep2() {
  const plat = food(B.platId);
  const warn = R.platWarning(plat);
  const ranked = R.rankGarnitures(GARNITURES);
  const best = ranked[0];
  const veg = R.vegetableWarning(GARNITURES);
  const solo = plat && plat.selfContained;

  return `
    <div class="note" style="margin-bottom:12px">
      <b>${esc(plat.en)}</b> · ${macroLine(plat.macros)}
    </div>
    ${warn ? `<div class="warn" style="margin-bottom:12px">${esc(warn)}</div>` : ''}
    <h2>And the garniture?</h2>
    <p class="small muted" style="margin:4px 0 10px">
      It comes with the plat. It is not one of your two — this is the part most people get wrong.
    </p>
    ${solo ? `<div class="note" style="margin-bottom:10px">${esc(plat.en)} is served as a full plate, so there is
      probably no separate garniture. Skip unless you see one.</div>` : ''}
    <div class="row between" style="margin-bottom:8px">
      <button class="chip${B.multiGarniture ? ' on' : ''}" data-act="multi"
              aria-pressed="${B.multiGarniture}">Take more than one</button>
      ${B.multiGarniture || solo ? '<button class="btn" data-act="gnext">Next</button>' : ''}
    </div>
    <div class="dishes">
      ${ranked.filter(g => g.starchy).map((g, i) => dishCard(g, {
        act: 'garn',
        selected: B.garnitureIds.includes(g.id),
        className: i === 0 ? 'pick' : '',
        flag: i === 0 ? 'Take this' : null,
        reason: R.garnitureReason(g, i === 0, best),
        showLook: i === 0
      })).join('')}
    </div>
    ${veg ? `<div class="section-title">Vegetables</div>
      <div class="note" style="margin-bottom:8px">${esc(veg)}</div>` : ''}
    <div class="dishes">
      ${ranked.filter(g => !g.starchy).map(g => dishCard(g, {
        act: 'garn',
        selected: B.garnitureIds.includes(g.id),
        showLook: false
      })).join('')}
    </div>
    <div style="height:10px"></div>
    <button class="btn wide ghost" data-act="nogarn">No garniture today</button>`;
}

/* ---------- step 3: the two --------------------------------------------------- */

function renderStep3() {
  const plat = food(B.platId);
  const platFat = plat ? plat.macros.fat : 0;
  const nd = need();
  const pool = periphPool();
  const key = S.today();
  const pairs = R.recommendPairs(pool, nd, {
    platFat, platName: plat ? plat.en : ''
  }, 3);
  lastPairs = pairs;
  const note = R.indulgenceNote(platFat, pool, nd);
  const pNote = R.proteinNote(S.dayTotals(key), S.loggedSlots(key), S.settings().slotPlan);
  const chosen = B.periphIds;
  const rest = (S.settings().fullCatalogue ? PERIPH : pool)
    .filter(f => !chosen.includes(f.id))
    .sort((a, b) => rankOf(b.macros).localeCompare(rankOf(a.macros)) || b.macros.protein - a.macros.protein);

  return `
    <h2>Pick your two</h2>
    <p class="small muted" style="margin:4px 0 10px">
      Any mix from the cold shelf, the dairy and the desserts.
    </p>
    ${pNote ? `<div class="note" style="margin-bottom:10px">${esc(pNote)}</div>` : ''}
    ${note ? `<div class="note" style="margin-bottom:10px">${esc(note)}</div>` : ''}
    ${chosen.length ? '' : `<div class="dishes">${pairs.map(pairCard).join('')}</div>`}

    <div class="section-title">${chosen.length ? `Chosen (${chosen.length} of 2)` : 'Or pick them yourself'}</div>
    ${chosen.length ? `<div class="dishes">${chosen.map(id =>
        dishCard(food(id), { act: 'unpick', selected: true })).join('')}</div><div style="height:8px"></div>` : ''}
    ${chosen.length < 2 ? `<div class="dishes">${rest.slice(0, 40).map(f =>
        dishCard(f, { act: 'periph' })).join('')}</div>` : ''}

    <div class="section-title">Bread</div>
    <button class="dish${B.bread ? ' pick' : ''}" data-act="bread" aria-pressed="${B.bread}">
      <div class="en">${B.bread ? '&#10003; ' : ''}Bread roll${estTag(BREAD)}</div>
      <div class="fr">Petit pain · 60 g · in the formula whether you take it or not</div>
      <div class="figs"><div class="k">${n0(BREAD.macros.kcal)}</div><div class="p">${n0(BREAD.macros.protein)} g P</div></div>
    </button>

    <details style="margin-top:14px" ${B.showShelf ? 'open' : ''}>
      <summary>What is actually on the shelf today?</summary>
      <p class="tiny muted">Deselect anything missing. Remembered for next time. Skip it and everything counts.</p>
      <div class="wrap-row">${pool.concat(STAPLES.filter(s => !pool.includes(s))).map(f => {
        const on = pool.includes(f);
        return `<button class="chip ${on ? '' : 'off'}" data-act="avail" data-id="${esc(f.id)}">${esc(f.en)}</button>`;
      }).join('')}</div>
    </details>`;
}

/* ---------- confirm ------------------------------------------------------------ */

function confirmSheet() {
  const key = S.today();
  const before = S.dayTotals(key);
  const add = trayMacros();
  const after = M.add(before, add);
  const t = S.settings().targets;
  const items = trayItems();
  const logged = S.loggedSlots(key);
  const target = B.slot;

  return openSheet(`
    <h2>Your tray</h2>
    <div style="margin-top:10px">
      ${items.map(i => `<div class="tray-line">
          <span class="n">${esc(i.en)}${estTag(i)}</span>
          <span class="num muted">${n0(i.macros.kcal)} kcal</span>
        </div>`).join('')}
      ${B.custom ? `<div class="tray-line"><span class="n">${esc(B.custom.name)}</span>
          <span class="num muted">${n0(B.custom.macros.kcal)} kcal</span></div>` : ''}
      <div class="tray-total"><span>Tray</span><span class="num">${macroLine(add)}</span></div>
    </div>

    <div class="section-title">How big was it, really?</div>
    <div class="wrap-row">
      ${PORTION_SCALES.map(p => `<button class="chip${B.scale === p.id ? ' on' : ''}"
        data-act="scale" data-v="${p.id}">${p.label}</button>`).join('')}
    </div>
    <p class="tiny muted" style="margin-top:6px">CROUS portions swing about ±15% depending on who is serving.</p>

    <div class="section-title">Day total</div>
    <div class="beforeafter">
      <span class="num">${n0(before.kcal)} kcal</span> &rarr;
      <b class="num">${n0(after.kcal)} kcal</b>
      <span class="muted">of ${n0(t.kcal)}</span>
    </div>
    <div class="beforeafter" style="margin-top:4px">
      <span class="num">${n0(before.protein)} g P</span> &rarr;
      <b class="num">${n0(after.protein)} g P</b>
      <span class="muted">of ${n0(t.protein)}</span>
    </div>

    <div style="height:16px"></div>
    <button class="btn primary wide" data-act="save" data-slot="${target}">
      Add to ${SLOT_LABEL[target].toLowerCase()}
    </button>
    <div style="height:8px"></div>
    <div class="row">
      ${['lunch', 'dinner'].filter(s => s !== target).map(s =>
        `<button class="btn grow" data-act="save" data-slot="${s}">Add to ${s} instead</button>`).join('')}
      <button class="btn grow ghost" data-act="cancel">Cancel</button>
    </div>
    ${logged.includes(target) ? `<p class="tiny muted center" style="margin-top:8px">
      You have already logged ${esc(SLOT_LABEL[target].toLowerCase())} today — this will be added on top.</p>` : ''}
  `);
}

/* ---------- free entry ---------------------------------------------------------- */

function freeSheet(kind) {
  return openSheet(`
    <h2>Enter it by hand</h2>
    <p class="small muted">For anything the counter served that is not in the catalogue.</p>
    <div class="field"><label for="c_name">What was it</label>
      <input id="c_name" type="text" placeholder="e.g. lamb tagine"></div>
    <div class="field"><label for="c_k">kcal</label>
      <input id="c_k" type="number" inputmode="numeric" value="0"></div>
    <div class="field"><label for="c_p">Protein (g)</label>
      <input id="c_p" type="number" inputmode="decimal" value="0"></div>
    <div class="field"><label for="c_f">Fat (g)</label>
      <input id="c_f" type="number" inputmode="decimal" value="0"></div>
    <div class="field"><label for="c_c">Carbs (g)</label>
      <input id="c_c" type="number" inputmode="decimal" value="0"></div>
    <div style="height:12px"></div>
    <button class="btn primary wide" data-act="freesave" data-kind="${kind}">Add it</button>
  `);
}

/* ---------- render + actions ------------------------------------------------------ */

export function render() {
  if (!B) return '';
  if (B.step === 1) return renderStep1();
  if (B.step === 2) return renderStep2();
  return renderStep3();
}

export function title() {
  return B ? `${SLOT_LABEL[B.slot]} · step ${B.step} of 3` : '';
}

export function onAct(act, ds, e, rerender, go) {
  switch (act) {
    case 'fam':   B.family = ds.v; B.query = ''; return rerender();
    case 'q':     B.query = e.target.value; return rerender({ keepFocus: 'q' });
    case 'plat':  B.platId = ds.id; B.step = 2; return rerender();
    case 'multi': B.multiGarniture = !B.multiGarniture; return rerender();
    case 'garn': {
      if (B.multiGarniture) {
        const i = B.garnitureIds.indexOf(ds.id);
        if (i >= 0) B.garnitureIds.splice(i, 1); else B.garnitureIds.push(ds.id);
        return rerender();
      }
      B.garnitureIds = [ds.id]; B.step = 3; return rerender();
    }
    case 'gnext': B.step = 3; return rerender();
    case 'nogarn': B.garnitureIds = []; B.step = 3; return rerender();
    case 'pair': {
      const p = lastPairs[Number(ds.i)];
      B.periphIds = [p.a.id, p.b.id];
      return confirmSheet();
    }
    case 'periph': {
      if (B.periphIds.length >= 2) return;
      B.periphIds.push(ds.id);
      if (B.periphIds.length === 2) { rerender(); return confirmSheet(); }
      return rerender();
    }
    case 'unpick':
      B.periphIds = B.periphIds.filter(x => x !== ds.id);
      return rerender();
    case 'bread': B.bread = !B.bread; return rerender();
    case 'avail': {
      const s = S.settings();
      const cur = new Set((s.availability && s.availability.periph) || STAPLES.map(f => f.id));
      if (cur.has(ds.id)) cur.delete(ds.id); else cur.add(ds.id);
      S.setSettings({ availability: { ...(s.availability || {}), periph: [...cur] } });
      B.showShelf = true;
      return rerender();
    }
    case 'scale': B.scale = ds.v; closeSheet(); return confirmSheet();
    case 'cancel': return closeSheet();
    case 'freeplat': return freeSheet('plat');
    case 'freesave': {
      const v = id => Number(document.getElementById(id).value) || 0;
      const name = document.getElementById('c_name').value.trim() || 'Something else';
      B.custom = { name, macros: { kcal: v('c_k'), protein: v('c_p'), fat: v('c_f'), carbs: v('c_c') } };
      closeSheet();
      B.step = 2;
      B.platId = B.platId || null;
      return rerender();
    }
    case 'save': {
      const slot = ds.slot;
      const items = trayItems();
      S.addEntry(S.today(), {
        slot,
        itemIds: items.map(i => i.id),
        customMacros: B.custom ? B.custom.macros : undefined,
        customName: B.custom ? B.custom.name : undefined,
        scale: B.scale,
        macros: M.round(trayMacros()),
        recentBuckets: {
          plat: B.platId ? [B.platId] : [],
          garniture: B.garnitureIds,
          periph: B.periphIds
        }
      });
      closeSheet();
      B = null;
      return go('#/today');
    }
  }
}
