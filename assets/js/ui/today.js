/* The home screen. Everything you need to decide what to do next, nothing else. */

import * as S from '../lib/store.js';
import * as M from '../lib/macros.js';
import * as R from '../lib/recommend.js';
import * as ST from '../lib/streak.js';
import { food } from '../data/foods.js';
import { ALL_HOME, homeItem } from '../data/home.js';
import { SLOT_ORDER, SLOT_LABEL } from '../config.js';
import { dayLabel } from '../lib/dates.js';
import { esc, n0, macroLine, meters, openSheet, closeSheet, entryLabel as label } from './common.js';

const CLOCK = { breakfast: '08:00', lunch: '12:00', dinner: '19:00', shake: '22:30' };

const lookup = id => food(id) || homeItem(id, S.settings().wheyOverride);
const entryLabel = e => label(e, lookup);

function slotCard(key, slot) {
  const entries = S.entriesFor(key, slot);
  const plan = S.settings().slotPlan[slot];
  if (!entries.length) {
    return `<button class="slot empty" data-act="open" data-slot="${slot}">
      <span class="when num">${CLOCK[slot]}</span>
      <span class="grow">
        <div class="title">${esc(SLOT_LABEL[slot])}</div>
        <div class="detail">Planned ${n0(plan.kcal)} kcal · ${n0(plan.protein)} g P</div>
      </span>
      <span class="figs"><span class="k">+</span></span>
    </button>`;
  }
  const m = M.sum(entries.map(e => e.macros));
  return `<button class="slot" data-act="view" data-slot="${slot}">
    <span class="when num">${CLOCK[slot]}</span>
    <span class="grow">
      <div class="title">${esc(SLOT_LABEL[slot])}</div>
      <div class="detail">${esc(entries.map(entryLabel).join(' · '))}</div>
    </span>
    <span class="figs">
      <span class="k num">${n0(m.kcal)}</span><br>
      <span class="p num">${n0(m.protein)} g P</span>
    </span>
  </button>`;
}

export function render() {
  const key = S.today();
  const st = S.settings();
  const totals = S.dayTotals(key);
  const t = st.targets;
  const streak = ST.currentStreak(k => S.dayTotals(k), st, key);
  const status = ST.todayStatus(totals, st);
  const frozen = ST.isFrozen(key, st);
  const extras = S.entriesFor(key, 'extra');

  const logged = S.loggedSlots(key);
  const unlogged = SLOT_ORDER.filter(s => !logged.includes(s));
  const gap = M.sub(t, totals);
  const advice = R.gapAdvice(gap, ALL_HOME);

  let left = '';
  if (frozen) {
    left = `<div class="note">${esc(ST.freezeLabel(key, st))} — today is frozen. Log if you like; it will not
      count for or against the streak.</div>`;
  } else if (status.counts) {
    left = `<div class="note"><b>Today counts.</b> ${unlogged.length
      ? 'Anything else is a bonus.' : 'Everything logged.'}</div>`;
  } else if (totals.kcal > 0 || logged.length) {
    const plan = unlogged.map(s => st.slotPlan[s]);
    const oneTray = unlogged.includes('lunch') || unlogged.includes('dinner');
    left = `<div class="note">
      Still need <b class="num">${n0(status.kcal)} kcal</b> and
      <b class="num">${n0(status.protein)} g protein</b> to make today count.
      ${oneTray && unlogged.length === 1 ? 'That is one tray.' : ''}
      ${advice && !unlogged.length ? `<br>That is about ${esc(advice)}.` : ''}
    </div>`;
  }

  return `
    ${meters(totals, t)}

    <div class="row" style="margin-top:14px">
      <button class="streakchip" data-act="streak">
        <span aria-hidden="true">&#9650;</span>
        <span class="num">${streak}</span>
        <span class="muted" style="font-weight:400">day${streak === 1 ? '' : 's'}</span>
      </button>
      <span class="grow"></span>
      <span class="small muted">${esc(dayLabel(key))}${frozen ? ' · frozen' : ''}</span>
    </div>

    <div class="section-title">Today</div>
    ${SLOT_ORDER.map(s => slotCard(key, s)).join('')}
    ${extras.length ? `<div class="section-title">Extra</div>${
      extras.map(e => `<button class="slot" data-act="view" data-slot="extra">
        <span class="when num">+</span>
        <span class="grow"><div class="title">${esc(entryLabel(e))}</div></span>
        <span class="figs"><span class="k num">${n0(e.macros.kcal)}</span><br>
          <span class="p num">${n0(e.macros.protein)} g P</span></span>
      </button>`).join('')}` : ''}

    <div style="height:10px"></div>
    <button class="btn wide ghost" data-act="extra">+ Something else</button>

    <div style="height:14px"></div>
    ${left}`;
}

/* ---------- sheets ------------------------------------------------------------- */

function viewSlot(key, slot) {
  const entries = S.entriesFor(key, slot);
  return openSheet(`
    <h2>${esc(SLOT_LABEL[slot])}</h2>
    ${entries.map(e => `
      <div style="margin-top:12px">
        <div class="row between">
          <b>${esc(entryLabel(e))}</b>
          <button class="btn ghost danger" data-act="del" data-id="${esc(e.id)}"
                  style="min-height:36px;padding:0 12px">Delete</button>
        </div>
        <div class="small muted num" style="margin-top:4px">${macroLine(e.macros)}</div>
        ${e.scale && e.scale !== 'normal'
          ? `<div class="tiny muted">logged as a ${esc(e.scale)} portion</div>` : ''}
      </div>`).join('<hr class="rule">')}
    <div style="height:16px"></div>
    <button class="btn wide" data-act="add" data-slot="${slot}">Log another ${esc(SLOT_LABEL[slot].toLowerCase())}</button>
    <div style="height:8px"></div>
    <button class="btn wide ghost" data-act="cancel">Close</button>
  `);
}

function extraSheet() {
  const home = ALL_HOME;
  const groups = [['protein', 'Protein'], ['carb', 'Carbs'], ['fat', 'Fat'],
                  ['fruit', 'Fruit & veg'], ['real', 'Real life'], ['blend', 'Blender shelf']];
  return openSheet(`
    <h2>Something else</h2>
    <p class="small muted">One tap each. Tap again to add another portion.</p>
    <div id="extratally" class="note num" style="margin:10px 0">Nothing yet</div>
    ${groups.map(([g, label]) => {
      const list = home.filter(i => i.group === g);
      if (!list.length) return '';
      return `<div class="section-title">${esc(label)}</div>
        <div class="wrap-row">${list.map(i =>
          `<button class="chip" data-act="hadd" data-id="${esc(i.id)}">${esc(i.en)}
            <span class="tiny muted">${n0(i.macros.kcal)}</span></button>`).join('')}</div>`;
    }).join('')}
    <div class="section-title">Or type the macros</div>
    <div class="field"><label for="x_name">What was it</label><input id="x_name" type="text" placeholder="e.g. kebab"></div>
    <div class="field"><label for="x_k">kcal</label><input id="x_k" type="number" inputmode="numeric" value="0"></div>
    <div class="field"><label for="x_p">Protein (g)</label><input id="x_p" type="number" inputmode="decimal" value="0"></div>
    <div class="field"><label for="x_f">Fat (g)</label><input id="x_f" type="number" inputmode="decimal" value="0"></div>
    <div class="field"><label for="x_c">Carbs (g)</label><input id="x_c" type="number" inputmode="decimal" value="0"></div>
    <div style="height:14px"></div>
    <button class="btn primary wide" data-act="xsave">Log it</button>
  `);
}

let tally = [];

function paintTally() {
  const el = document.getElementById('extratally');
  if (!el) return;
  if (!tally.length) { el.textContent = 'Nothing yet'; return; }
  const m = M.sum(tally.map(t => M.scale(t.item.macros, t.qty)));
  el.innerHTML = `<b>${esc(tally.map(t => `${t.item.en}${t.qty > 1 ? ` x${t.qty}` : ''}`).join(', '))}</b>
    <br>${macroLine(m)}`;
}

export function onAct(act, ds, e, rerender, go) {
  const key = S.today();
  switch (act) {
    case 'open': {
      const slot = ds.slot;
      if (slot === 'breakfast') return go('#/breakfast');
      if (slot === 'shake') return go('#/shake');
      return go('#/tray/' + slot);
    }
    case 'view': return viewSlot(key, ds.slot);
    case 'add': {
      closeSheet();
      const slot = ds.slot;
      if (slot === 'breakfast') return go('#/breakfast');
      if (slot === 'shake') return go('#/shake');
      if (slot === 'extra') return extraSheet();
      return go('#/tray/' + slot);
    }
    case 'del': S.removeEntry(key, ds.id); closeSheet(); return rerender();
    case 'streak': return go('#/streak');
    case 'extra': tally = []; return extraSheet();
    case 'hadd': {
      const it = homeItem(ds.id, S.settings().wheyOverride);
      const found = tally.find(t => t.item.id === it.id);
      if (found) found.qty++; else tally.push({ item: it, qty: 1 });
      return paintTally();
    }
    case 'xsave': {
      const v = id => Number(document.getElementById(id).value) || 0;
      const name = document.getElementById('x_name').value.trim();
      const typed = { kcal: v('x_k'), protein: v('x_p'), fat: v('x_f'), carbs: v('x_c') };
      const fromTally = M.sum(tally.map(t => M.scale(t.item.macros, t.qty)));
      const total = M.add(typed, fromTally);
      if (M.isZero(total)) return closeSheet();
      const made = tally.map(t => (t.qty > 1 ? `${t.item.en} x${t.qty}` : t.item.en)).join(', ');
      const label = [name, made].filter(Boolean).join(' + ');
      S.addEntry(key, {
        slot: 'extra',
        itemIds: tally.flatMap(t => Array(t.qty).fill(t.item.id)),
        customMacros: M.isZero(typed) ? undefined : typed,
        customName: label || 'Something else',
        macros: M.round(total)
      });
      tally = [];
      closeSheet();
      return rerender();
    }
    case 'cancel': return closeSheet();
  }
}
