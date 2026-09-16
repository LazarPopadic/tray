/* Today. Three things in order: what the day looks like, how to add to it, and what
   is already in it. Everything else is on another screen. */

import * as S from '../lib/store.js';
import * as M from '../lib/macros.js';
import * as R from '../lib/recommend.js';
import * as ST from '../lib/streak.js';
import { food } from '../data/foods.js';
import { ALL_HOME, homeItem } from '../data/home.js';
import { SLOT_ORDER, SLOT_LABEL, RECIPE_NAME, BREAKFAST_DEFAULT, SHAKE_DEFAULT } from '../config.js';
import { dayLabel } from '../lib/dates.js';
import { esc, n0, macroLine, hero, openSheet, closeSheet,
         entryLabel as makeLabel } from './common.js';

const CLOCK = { breakfast: '08:00', lunch: '12:00', dinner: '19:00', shake: '22:30' };

const lookup = id => food(id) || homeItem(id, S.settings().wheyOverride);
const entryLabel = e => makeLabel(e, lookup);

function recipeMacros(rows) {
  const w = S.settings().wheyOverride;
  return M.sum(rows.map(r => M.scale(homeItem(r.id, w).macros, r.qty)));
}

function savedRecipe(kind) {
  const saved = S.settings().recipes[kind];
  return saved && saved.length ? saved : (kind === 'breakfast' ? BREAKFAST_DEFAULT : SHAKE_DEFAULT);
}

/* ---------- slot strip ---------------------------------------------------------- */

/* The two fixed recipes are one thing you eat, not a form to fill in. Tapping shows
   what you are about to add; tapping again adds it. No detour through the editor. */
const FIXED = { breakfast: 'breakfast', shake: 'shake' };
let armed = null;

function fixedRow(slot) {
  const m = recipeMacros(savedRecipe(FIXED[slot]));
  if (armed !== slot) {
    return `<button class="slot empty" data-act="open" data-slot="${slot}">
      <span class="when">${CLOCK[slot]}</span>
      <span class="body"><span class="title">${esc(SLOT_LABEL[slot])}</span></span>
      <span class="add" aria-hidden="true">+</span>
    </button>`;
  }
  return `<div class="slot armed">
    <span class="when">${CLOCK[slot]}</span>
    <button class="body" data-act="open" data-slot="${slot}">
      <span class="title">${esc(SLOT_LABEL[slot])} — tap again to add</span>
      <span class="detail num">${macroLine(m)}</span>
    </button>
    <button class="btn sm ghost" data-act="editrecipe" data-kind="${FIXED[slot]}">Edit</button>
  </div>`;
}

function slotRow(key, slot) {
  const entries = S.entriesFor(key, slot);
  if (!entries.length) {
    if (FIXED[slot]) return fixedRow(slot);
    return `<button class="slot empty" data-act="open" data-slot="${slot}">
      <span class="when">${CLOCK[slot]}</span>
      <span class="body"><span class="title">${esc(SLOT_LABEL[slot])}</span></span>
      <span class="add" aria-hidden="true">+</span>
    </button>`;
  }
  const m = M.sum(entries.map(e => e.macros));
  /* The night shake's recipe is called the same as its slot, so showing both reads
     as "Night shake Night shake". */
  const detail = entries.map(entryLabel).join(' · ');
  return `<button class="slot" data-act="view" data-slot="${slot}">
    <span class="when">${CLOCK[slot]}</span>
    <span class="body">
      <span class="title">${esc(SLOT_LABEL[slot])}</span>
      ${detail && detail !== SLOT_LABEL[slot]
        ? `<span class="detail">${esc(detail)}</span>` : ''}
    </span>
    <span class="figs"><span class="k">${n0(m.kcal)}</span><br><span class="p">${n0(m.protein)} P</span></span>
  </button>`;
}

/* ---------- screen ---------------------------------------------------------------- */

export const hasDock = true;

export function dock() {
  return `<button class="btn primary big wide" data-act="addmeal">Add a meal</button>`;
}

export function render() {
  const key = S.today();
  const st = S.settings();
  const totals = S.dayTotals(key);
  const streak = ST.currentStreak(k => S.dayTotals(k), st, key);
  const status = ST.todayStatus(totals, st);
  const frozen = ST.isFrozen(key, st);
  const extras = S.entriesFor(key, 'extra');
  const logged = S.loggedSlots(key);
  const unlogged = SLOT_ORDER.filter(s => !logged.includes(s));
  const advice = R.gapAdvice(M.sub(st.targets, totals), ALL_HOME);

  let note = '';
  if (!totals.kcal && !frozen) {
    const plan = st.slotPlan;
    note = `<div class="note">Nothing logged yet. The plan is
      ${n0(plan.breakfast.kcal)} at breakfast, two trays of about
      ${n0(Math.round((plan.lunch.kcal + plan.dinner.kcal) / 2))}, and
      ${n0(plan.shake.kcal)} in the shake.</div>`;
  } else if (frozen) {
    note = `<div class="note">${esc(ST.freezeLabel(key, st))} — today is frozen. Log if you like;
      it will not count for or against the streak.</div>`;
  } else if (status.counts) {
    note = `<div class="note good"><b>Today counts.</b> Anything else is a bonus.</div>`;
  } else if (totals.kcal > 0) {
    const oneTray = unlogged.length === 1 && (unlogged[0] === 'lunch' || unlogged[0] === 'dinner');
    note = `<div class="note">Still <b>${n0(status.kcal)} kcal</b> and
      <b>${n0(status.protein)} g protein</b> short of a day that counts.${
      oneTray ? ' That is one tray.' : ''}${
      advice && !unlogged.length ? ` About ${esc(advice)}.` : ''}</div>`;
  }

  return `
    ${hero(totals, st.targets, st.streak)}

    <div class="row between" style="margin-bottom:var(--s4)">
      <button class="streakchip" data-act="streak">
        <span aria-hidden="true">▲</span>
        <span class="num">${streak}</span>
        <span class="muted" style="font-weight:400">day${streak === 1 ? '' : 's'}</span>
      </button>
      <span class="small muted">${frozen ? 'frozen · not judged'
        : status.counts ? 'today counts'
        : `${n0(status.kcal)} kcal to count`}</span>
    </div>

    ${note}

    <div class="section">
      <span class="label">Today</span>
      <div class="slots">
        ${SLOT_ORDER.map(s => slotRow(key, s)).join('')}
        ${extras.map(e => `<button class="slot" data-act="view" data-slot="extra">
            <span class="when">+</span>
            <span class="body"><span class="title">${esc(entryLabel(e))}</span></span>
            <span class="figs"><span class="k">${n0(e.macros.kcal)}</span><br>
              <span class="p">${n0(e.macros.protein)} P</span></span>
          </button>`).join('')}
      </div>
    </div>`;
}

/* ---------- add a meal --------------------------------------------------------------
   The one decision worth asking up front: is this a canteen tray, which the app can
   predict, or anything else, which it cannot. The two fixed recipes sit alongside
   because they are one tap each and he eats them daily. */

function addSheet() {
  const bf = recipeMacros(savedRecipe('breakfast'));
  const sh = recipeMacros(savedRecipe('shake'));
  const logged = S.loggedSlots(S.today());

  /* The macros are already on screen here, so one tap on Log is enough — the second
     tap on the Today row exists only because that row has no room to show them. */
  const recipe = (kind, name, m, slot) => `
    <div class="trayrow">
      <span class="what">
        <span class="n">${esc(name)}${logged.includes(slot) ? ' · already logged' : ''}</span>
        <span class="m">${n0(m.kcal)} kcal · ${n0(m.protein)} P · ${n0(m.fat)} F · ${n0(m.carbs)} C</span>
      </span>
      <button class="btn sm ghost" data-act="editrecipe" data-kind="${kind}">Edit</button>
      <button class="btn sm" data-act="logrecipe" data-kind="${kind}">Add</button>
    </div>`;

  return openSheet(`
    <h2>What are you adding?</h2>
    <div class="tiles one" style="margin-bottom:var(--s4)">
      <button class="tile wide" data-act="go" data-to="#/tray">
        <span class="en">Canteen tray</span>
        <span class="fr">One plat, a garniture, two from the shelf, bread</span>
        <span class="figs">the app predicts the tray from the main dish</span>
      </button>
      <button class="tile wide" data-act="go" data-to="#/quick">
        <span class="en">Anything else</span>
        <span class="fr">Home food, a kebab, whatever you actually ate</span>
        <span class="figs">repeat something recent, or pick and log</span>
      </button>
    </div>
    <span class="label">Your two fixed ones</span>
    <div class="tray" style="margin-top:var(--s2)">
      ${recipe('breakfast', 'Morning blend', bf, 'breakfast')}
      ${recipe('shake', 'Night shake', sh, 'shake')}
    </div>
    <p class="tiny muted" style="margin-top:var(--s3)">Add puts it straight on today's total. Edit changes the recipe first.</p>
  `, { label: 'Add a meal' });
}

function viewSlot(key, slot) {
  const entries = S.entriesFor(key, slot);
  return openSheet(`
    <h2>${esc(SLOT_LABEL[slot])}</h2>
    <div class="tray">
      ${entries.map(e => `<div class="trayrow">
        <span class="what">
          <span class="n">${esc(entryLabel(e))}</span>
          <span class="m">${macroLine(e.macros)}</span>
          ${e.scale && e.scale !== 'normal'
            ? `<span class="why">logged as a ${esc(e.scale)} portion</span>` : ''}
        </span>
        <button class="btn sm danger" data-act="del" data-id="${esc(e.id)}">Delete</button>
      </div>`).join('')}
    </div>
    <div style="height:var(--s4)"></div>
    <button class="btn wide" data-act="add" data-slot="${slot}">Add another</button>
    <div style="height:var(--s2)"></div>
    <button class="btn wide quiet" data-act="cancel">Close</button>
  `, { label: SLOT_LABEL[slot] });
}

function logRecipe(kind) {
  const rows = savedRecipe(kind);
  const m = recipeMacros(rows);
  if (M.isZero(m)) return null;
  return S.addEntry(S.today(), {
    slot: kind,
    itemIds: rows.flatMap(r => Array(r.qty).fill(r.id)),
    customName: RECIPE_NAME[kind],
    macros: M.round(m)
  });
}

/* Logged, with a way back out — a misclick should cost one tap, not a trip through
   the slot sheet to find Delete. */
function logWithUndo(kind, rerender) {
  const key = S.today();
  const e = logRecipe(kind);
  if (!e) return;
  armed = null;
  rerender({ toast: {
    msg: `${RECIPE_NAME[kind]} added · ${n0(e.macros.kcal)} kcal`,
    action: { label: 'Undo', fn: () => { S.removeEntry(key, e.id); rerender(); } }
  } });
}

export function onAct(act, ds, e, rerender, go) {
  const key = S.today();
  /* Any action other than arming one of the fixed rows cancels a pending one. */
  if (!(act === 'open' && FIXED[ds.slot])) armed = null;

  switch (act) {
    case 'addmeal': return addSheet();
    case 'go': closeSheet(); return go(ds.to);
    case 'editrecipe': closeSheet(); return go('#/' + ds.kind);
    case 'logrecipe': {
      closeSheet();
      return logWithUndo(ds.kind, rerender);
    }
    case 'open': {
      const slot = ds.slot;
      if (FIXED[slot]) {
        /* First tap arms and shows the macros; second tap commits. */
        if (armed === slot) return logWithUndo(slot, rerender);
        armed = slot;
        return rerender();
      }
      if (slot === 'lunch' || slot === 'dinner') return go('#/tray/' + slot);
      return addSheet();
    }
    case 'view': return viewSlot(key, ds.slot);
    case 'add': {
      closeSheet();
      const slot = ds.slot;
      if (slot === 'breakfast' || slot === 'shake') return go('#/' + slot);
      if (slot === 'extra') return go('#/quick');
      return go('#/tray/' + slot);
    }
    case 'del': S.removeEntry(key, ds.id); closeSheet(); return rerender();
    case 'streak': return go('#/streak');
    case 'cancel': return closeSheet();
  }
}
