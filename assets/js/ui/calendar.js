/* Month grid, week averages, one 30-day line. Not a dashboard. */

import * as S from '../lib/store.js';
import * as M from '../lib/macros.js';
import * as ST from '../lib/streak.js';
import { food } from '../data/foods.js';
import { homeItem } from '../data/home.js';
import { monthGrid, monthLabel, shiftMonth, monthKey, addDays, dayLabel, weekday, ymd } from '../lib/dates.js';
import { SLOT_LABEL } from '../config.js';
import { esc, n0, macroLine, sparkline, openSheet, closeSheet, entryLabel as label } from './common.js';

let month = null;

export function start() {
  month = month || monthKey(S.today());
}

/* The month is named by its own control further down the screen, so the bar just
   names the section. title() is called before render(), so it initialises state. */
export function title() { start(); return 'Calendar'; }

function cell(key, today, st) {
  if (!key) return '<div class="cell blank"></div>';
  const totals = S.dayTotals(key);
  const t = st.targets;
  const frozen = ST.isFrozen(key, st);
  const has = totals.kcal > 0;
  const hit = ST.dayCounts(totals, st);
  const pHit = totals.protein >= t.protein * st.streak.proteinFactor;
  const h = Math.min(100, (totals.kcal / t.kcal) * 100);
  const cls = ['cell'];
  if (frozen) cls.push('frozen');
  if (hit) cls.push('hit');
  if (key === today) cls.push('today');
  if (!has && !frozen && key < today) cls.push('empty-past');
  return `<button class="${cls.join(' ')}" data-act="day" data-k="${key}">
    <span class="d">${Number(key.slice(8))}</span>
    ${has ? `<span class="lv" style="height:${h.toFixed(0)}%"></span>` : ''}
    ${pHit ? '<span class="pdot"></span>' : ''}
  </button>`;
}

function weekStrip(st) {
  const today = S.today();
  const start = addDays(today, -weekday(today));
  const days = Array.from({ length: 7 }, (_, i) => addDays(start, i))
    .filter(k => k <= today);
  const counted = days.filter(k => st.includeFrozenInAverages || !ST.isFrozen(k, st));
  const withData = counted.filter(k => S.dayTotals(k).kcal > 0);
  const avg = withData.length
    ? M.scale(M.sum(withData.map(k => S.dayTotals(k))), 1 / withData.length)
    : M.ZERO;
  return `<div class="card">
    <div class="row between">
      <span class="small muted">This week, daily average</span>
      <span class="tiny muted">${withData.length} day${withData.length === 1 ? '' : 's'}</span>
    </div>
    <div class="num" style="margin-top:4px;font-weight:640">${n0(avg.kcal)} kcal</div>
    <div class="small muted num">${n0(avg.protein)} g P · ${n0(avg.fat)} g F · ${n0(avg.carbs)} g C</div>
  </div>`;
}

function summary(st) {
  const cells = monthGrid(month).filter(Boolean);
  const today = S.today();
  const past = cells.filter(k => k <= today);
  const counted = past.filter(k => st.includeFrozenInAverages || !ST.isFrozen(k, st));
  const withData = counted.filter(k => S.dayTotals(k).kcal > 0);
  const avg = withData.length
    ? M.scale(M.sum(withData.map(k => S.dayTotals(k))), 1 / withData.length)
    : M.ZERO;
  const onTarget = counted.filter(k => ST.dayCounts(S.dayTotals(k), st)).length;
  const longest = ST.longestStreak(cells, k => S.dayTotals(k), st, addDays(today, 1));
  return `<div class="card">
    <div class="kv"><span class="k">Average kcal</span><span class="v">${n0(avg.kcal)}</span></div>
    <div class="kv"><span class="k">Average protein</span><span class="v">${n0(avg.protein)} g</span></div>
    <div class="kv"><span class="k">Days logged</span><span class="v">${withData.length}</span></div>
    <div class="kv"><span class="k">Days on target</span><span class="v">${onTarget}</span></div>
    <div class="kv"><span class="k">Longest streak this month</span><span class="v">${longest}</span></div>
  </div>`;
}

export function render() {
  start();
  const st = S.settings();
  const today = S.today();
  const cells = monthGrid(month);
  const series = Array.from({ length: 30 }, (_, i) => {
    const k = addDays(today, i - 29);
    const tot = S.dayTotals(k);
    return { kcal: tot.kcal, hit: ST.dayCounts(tot, st) };
  });

  return `
    ${weekStrip(st)}

    <div class="row between" style="margin:16px 0 8px">
      <button class="btn ghost" data-act="prev" style="min-height:38px;padding:0 12px">&larr;</button>
      <b>${esc(monthLabel(month))}</b>
      <button class="btn ghost" data-act="next" style="min-height:38px;padding:0 12px"
        ${monthKey(today) === month ? 'disabled' : ''}>&rarr;</button>
    </div>

    <div class="cal">
      ${['M', 'T', 'W', 'T', 'F', 'S', 'S'].map(d => `<div class="wd">${d}</div>`).join('')}
      ${cells.map(k => cell(k, today, st)).join('')}
    </div>
    <p class="tiny muted" style="margin-top:8px">
      Fill height is kcal against target. A dot means you hit protein. Hatched days are frozen.
      Dashed days are days you did not log.
    </p>

    <div class="section-title">Last 30 days</div>
    <div class="card">${sparkline(series, st.targets.kcal)}
      <div class="tiny muted center" style="margin-top:4px">dashed line is the ${n0(st.targets.kcal)} kcal target</div>
    </div>

    <div class="section-title">${esc(monthLabel(month))}</div>
    ${summary(st)}`;
}

const lookup = id => food(id) || homeItem(id, S.settings().wheyOverride);
const entryLabel = e => label(e, lookup);

function daySheet(key) {
  const st = S.settings();
  const d = S.day(key);
  const totals = S.dayTotals(key);
  const frozen = ST.isFrozen(key, st);
  const counts = ST.dayCounts(totals, st);
  const slots = ['breakfast', 'lunch', 'dinner', 'shake', 'extra'];
  return openSheet(`
    <h2>${esc(dayLabel(key))}</h2>
    <div class="small muted num" style="margin-top:2px">${macroLine(totals)}</div>
    <div style="margin-top:6px">
      ${frozen ? `<span class="chip">Frozen · ${esc(ST.freezeLabel(key, st) || '')}</span>`
               : `<span class="chip">${counts ? 'Counted' : 'Did not count'}</span>`}
    </div>
    ${d.entries.length ? slots.map(s => {
      const es = d.entries.filter(e => e.slot === s);
      if (!es.length) return '';
      return `<div class="section-title">${esc(SLOT_LABEL[s])}</div>
        ${es.map(e => `<div class="row between" style="padding:6px 0">
          <span class="grow">${esc(entryLabel(e))}
            <div class="tiny muted num">${macroLine(e.macros)}</div></span>
          <button class="btn ghost danger" data-act="del" data-k="${key}" data-id="${esc(e.id)}"
                  style="min-height:36px;padding:0 12px">Delete</button>
        </div>`).join('')}`;
    }).join('') : '<div class="note" style="margin-top:12px">Nothing logged on this day.</div>'}
    <div style="height:16px"></div>
    <button class="btn wide ghost" data-act="cancel">Close</button>
  `);
}

export function onAct(act, ds, e, rerender, go) {
  switch (act) {
    case 'prev': month = shiftMonth(month, -1); return rerender();
    case 'next': month = shiftMonth(month, 1); return rerender();
    case 'day': return daySheet(ds.k);
    case 'del': S.removeEntry(ds.k, ds.id); closeSheet(); return rerender();
    case 'cancel': return closeSheet();
  }
}
