/* Streak detail. The rules are written out so there is never a mystery about
   why a day did or did not count. */

import * as S from '../lib/store.js';
import * as ST from '../lib/streak.js';
import { addDays, dayLabel, ymd } from '../lib/dates.js';
import { esc, n0, openSheet, closeSheet } from './common.js';

export function title() { return 'Streak'; }

export function render() {
  const st = S.settings();
  const today = S.today();
  const keys = Object.keys(S.get().days);
  const totalsFor = k => S.dayTotals(k);
  const current = ST.currentStreak(totalsFor, st, today);
  const longest = ST.longestStreak(keys, totalsFor, st, today);
  const total = ST.totalDaysOnTarget(keys, totalsFor, st, today);
  const status = ST.todayStatus(S.dayTotals(today), st);
  const freezes = ST.upcomingFreezes(st, today);

  const kPct = Math.round(st.streak.kcalFactor * 100);
  const pPct = Math.round(st.streak.proteinFactor * 100);

  return `
    <div class="card center">
      <div class="num" style="font-size:52px;font-weight:680;line-height:1">${current}</div>
      <div class="small muted">day${current === 1 ? '' : 's'} running</div>
    </div>

    <div class="card">
      <div class="kv"><span class="k">Longest ever</span><span class="v">${longest}</span></div>
      <div class="kv"><span class="k">Total days on target</span><span class="v">${total}</span></div>
      <div class="kv"><span class="k">Today</span><span class="v">${
        ST.isFrozen(today, st) ? 'frozen'
        : status.counts ? 'counts'
        : `${n0(status.kcal)} kcal, ${n0(status.protein)} g P to go`}</span></div>
    </div>

    <div class="section-title">What counts</div>
    <div class="note">
      A day counts when you reach <b>${kPct}% of ${n0(st.targets.kcal)} kcal</b>
      (${n0(st.targets.kcal * st.streak.kcalFactor)}) <b>and</b>
      ${pPct}% of ${n0(st.targets.protein)} g protein
      (${n0(st.targets.protein * st.streak.proteinFactor)} g).
      Fat and carbs never break a streak.<br><br>
      Today is not judged until the day ends at
      ${String(st.rolloverHour).padStart(2, '0')}:00 tomorrow. A day with nothing logged, and not
      frozen, breaks the run.<br><br>
      <b>Frozen days are stepped over.</b> Ten days, then five frozen, then a day that counts,
      and you are on eleven.
    </div>

    <div class="section-title">Freezes</div>
    ${st.freezeWeekends
      ? '<div class="note" style="margin-bottom:8px">Weekends are frozen automatically. Turn that off in Settings.</div>'
      : ''}
    ${freezes.length ? freezes.map(f => `
      <div class="row between card" style="margin-bottom:8px">
        <span class="grow">
          <b>${esc(f.label)}</b>
          <div class="tiny muted num">${f.start} to ${f.end} · ${f.days} day${f.days === 1 ? '' : 's'}</div>
        </span>
        <span class="chip">${f.when}</span>
      </div>`).join('')
      : '<div class="note">No trips declared. Add one before you go, or afterwards — both work.</div>'}

    <div style="height:10px"></div>
    <button class="btn wide" data-act="addfreeze">Declare a trip</button>`;
}

export function freezeSheet(existing) {
  const today = S.today();
  return openSheet(`
    <h2>${existing ? 'Edit trip' : 'Declare a trip'}</h2>
    <p class="small muted">Both dates count as part of the trip. These days are skipped by the streak.</p>
    <div class="field"><label for="fz_l">Name it</label>
      <input id="fz_l" type="text" placeholder="e.g. home for Christmas"
             value="${esc(existing ? existing.label : '')}"></div>
    <div class="field"><label for="fz_s">From</label>
      <input id="fz_s" type="date" value="${esc(existing ? existing.start : today)}"></div>
    <div class="field"><label for="fz_e">To</label>
      <input id="fz_e" type="date" value="${esc(existing ? existing.end : today)}"></div>
    <div style="height:14px"></div>
    <button class="btn primary wide" data-act="fzsave">Save</button>
    ${existing ? `<div style="height:8px"></div>
      <button class="btn wide danger" data-act="fzdel" data-s="${esc(existing.start)}">Delete this trip</button>` : ''}
    <div style="height:8px"></div>
    <button class="btn wide ghost" data-act="cancel">Cancel</button>
  `);
}

export function onAct(act, ds, e, rerender, go) {
  switch (act) {
    case 'addfreeze': return freezeSheet(null);
    case 'fzsave': {
      const label = document.getElementById('fz_l').value.trim() || 'Trip';
      const start = document.getElementById('fz_s').value;
      const end = document.getElementById('fz_e').value;
      if (!start || !end) return;
      const freezes = (S.settings().freezes || []).concat([{ start, end, label }]);
      S.setSettings({ freezes: ST.mergeRanges(freezes) });
      closeSheet();
      return rerender();
    }
    case 'fzdel': {
      const freezes = (S.settings().freezes || []).filter(f => f.start !== ds.s);
      S.setSettings({ freezes });
      closeSheet();
      return rerender();
    }
    case 'cancel': return closeSheet();
  }
}
