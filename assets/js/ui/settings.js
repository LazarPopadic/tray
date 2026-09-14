/* Settings. Everything the app reasons with is editable here, and everything you
   have logged can leave the phone as one file. */

import * as S from '../lib/store.js';
import * as ST from '../lib/streak.js';
import { MAINTENANCE, ABOUT, SLOT_ORDER, SLOT_LABEL, TARGETS, SLOT_PLAN } from '../config.js';
import { FOODS } from '../data/foods.js';
import { esc, n0, switchRow, openSheet, closeSheet } from './common.js';
import { freezeSheet } from './streakview.js';

export function title() { return 'Settings'; }

function num(label, value, act, step) {
  return `<div class="field">
    <label for="s_${act}">${esc(label)}</label>
    <input id="s_${act}" type="number" inputmode="decimal" step="${step || 1}"
           value="${esc(value)}" data-act="set" data-k="${act}">
  </div>`;
}

export function render() {
  const st = S.settings();
  const unexported = S.daysSinceExport();
  const est = FOODS.filter(f => f.estimated).length;

  return `
    ${unexported >= 30 ? `<div class="note warn" style="margin-bottom:var(--s4)">
      <b>${unexported} days since your last backup.</b> iOS can clear this app's storage when the
      phone runs low on space. Export now and mail it to yourself.</div>` : ''}

    <div class="section-title">Targets</div>
    <div class="card">
      ${num('kcal', st.targets.kcal, 'targets.kcal', 10)}
      ${num('Protein (g)', st.targets.protein, 'targets.protein', 5)}
      ${num('Fat (g)', st.targets.fat, 'targets.fat', 5)}
      ${num('Carbs (g)', st.targets.carbs, 'targets.carbs', 10)}
      <details style="margin-top:6px">
        <summary>Where 3550 came from</summary>
        ${MAINTENANCE.rows.map(([k, v, why]) => `<div class="kv">
          <span class="k">${esc(k)}<div class="tiny muted">${esc(why)}</div></span>
          <span class="v">${esc(v)}</span></div>`).join('')}
        <div class="kv"><span class="k"><b>Maintenance</b></span>
          <span class="v"><b>${esc(MAINTENANCE.total)}</b></span></div>
        <p class="tiny muted" style="margin-top:8px">${esc(MAINTENANCE.note)}</p>
      </details>
      <div style="height:8px"></div>
      <button class="btn wide ghost" data-act="resetTargets">Back to the handover numbers</button>
    </div>

    <div class="section-title">The planned day</div>
    <div class="card">
      <p class="tiny muted">What each slot is meant to deliver. The recommender works out what a
        meal still owes the day from these.</p>
      ${SLOT_ORDER.map(s => `
        <div class="kv"><span class="k">${esc(SLOT_LABEL[s])}</span>
          <span class="v">${n0(st.slotPlan[s].kcal)} kcal · ${n0(st.slotPlan[s].protein)} g P</span></div>
        <div class="field" style="padding-top:0">
          <label class="tiny muted">kcal</label>
          <input type="number" step="10" value="${st.slotPlan[s].kcal}" data-act="plan" data-s="${s}" data-k="kcal">
          <label class="tiny muted" style="flex:0 0 auto">P</label>
          <input type="number" step="1" value="${st.slotPlan[s].protein}" data-act="plan" data-s="${s}" data-k="protein"
                 style="width:78px">
        </div>`).join('')}
    </div>

    <div class="section-title">Streak</div>
    <div class="card">
      ${num('kcal threshold (fraction)', st.streak.kcalFactor, 'streak.kcalFactor', 0.01)}
      ${num('Protein threshold (fraction)', st.streak.proteinFactor, 'streak.proteinFactor', 0.01)}
      ${num('Day ends at (hour)', st.rolloverHour, 'rolloverHour', 1)}
      <p class="tiny muted">Anything logged before this hour counts toward the previous day.</p>
      ${switchRow('Freeze weekends automatically', st.freezeWeekends, 'toggleWeekend',
        'CROUS is shut, so Saturday and Sunday are skipped rather than broken.')}
      ${switchRow('Count frozen days in averages', st.includeFrozenInAverages, 'toggleAvg')}
    </div>

    <div class="section-title">Trips</div>
    <div class="card">
      ${(ST.upcomingFreezes(st, S.today())).map(f => `
        <div class="row between" style="padding:6px 0">
          <span class="grow"><b>${esc(f.label)}</b>
            <div class="tiny muted num">${f.start} to ${f.end}</div></span>
          <button class="btn ghost" data-act="editfz" data-s="${esc(f.start)}"
                  style="min-height:36px;padding:0 12px">Edit</button>
        </div>`).join('') || '<p class="tiny muted">None declared.</p>'}
      <div style="height:8px"></div>
      <button class="btn wide" data-act="addfreeze">Add a trip</button>
    </div>

    <div class="section-title">Whey</div>
    <div class="card">
      <p class="tiny muted">The app ships with a generic concentrate. Put your own tub's label
        values in, per 10 g of powder.</p>
      ${num('kcal per 10 g', (st.wheyOverride || {}).kcal ?? 40, 'whey.kcal', 1)}
      ${num('Protein per 10 g', (st.wheyOverride || {}).protein ?? 8, 'whey.protein', 0.1)}
      ${num('Fat per 10 g', (st.wheyOverride || {}).fat ?? 0.37, 'whey.fat', 0.01)}
      ${num('Carbs per 10 g', (st.wheyOverride || {}).carbs ?? 1, 'whey.carbs', 0.1)}
      ${st.wheyOverride ? `<button class="btn wide ghost" data-act="clearWhey">Back to generic</button>` : ''}
    </div>

    <div class="section-title">Catalogue</div>
    <div class="card">
      ${switchRow('Recommend from the whole catalogue', st.fullCatalogue,
        'toggleFull',
        'Off, it only suggests the shelf staples. On, it can suggest anything CROUS publishes, ' +
        'including things your restaurant may never serve.')}
      ${st.availability && st.availability.periph ? `
        <div style="height:8px"></div>
        <button class="btn wide ghost" data-act="clearAvail">Reset "what is on the shelf"</button>` : ''}
    </div>

    <div class="section-title">Your data</div>
    <div class="card">
      <p class="tiny muted">${S.daysSinceExport()} day${S.daysSinceExport() === 1 ? '' : 's'} logged since
        your last backup. Nothing in this app ever leaves your phone unless you send it yourself.</p>
      <div style="height:8px"></div>
      <button class="btn wide primary" data-act="export">Export everything</button>
      <div style="height:8px"></div>
      <button class="btn wide" data-act="import">Import a backup</button>
      <input type="file" id="importfile" accept="application/json,.json" hidden>
      <div style="height:8px"></div>
      <button class="btn wide danger" data-act="reset">Erase everything</button>
    </div>

    <div class="section-title">About</div>
    <div class="note">
      ${esc(ABOUT)}
      <br><br>
      ${FOODS.length} items, ${est} of them marked est.
      Built from the CROUS Montpellier-Occitanie database.
    </div>
    <p class="tiny muted center" style="margin-top:14px">Tray · works offline · no account, no server</p>`;
}

/* ---------- export / import --------------------------------------------------- */

async function doExport() {
  const blob = S.exportBlob();
  const name = S.exportFilename();
  const file = new File([blob], name, { type: 'application/json' });

  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: 'Tray backup' });
      S.markExported();
      return;
    } catch (e) {
      if (e && e.name === 'AbortError') return;
    }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
  S.markExported();
}

export function onAct(act, ds, e, rerender, go) {
  const st = S.settings();
  switch (act) {
    case 'set': {
      const v = Number(e.target.value);
      if (Number.isNaN(v)) return;
      const [group, key] = ds.k.split('.');
      if (!key) return S.setSettings({ [group]: v });
      if (group === 'whey') {
        const base = st.wheyOverride || { kcal: 40, protein: 8, fat: 0.37, carbs: 1 };
        return S.setSettings({ wheyOverride: { ...base, [key]: v } });
      }
      return S.setSettings({ [group]: { ...st[group], [key]: v } });
    }
    case 'plan': {
      const v = Number(e.target.value);
      if (Number.isNaN(v)) return;
      const plan = { ...st.slotPlan, [ds.s]: { ...st.slotPlan[ds.s], [ds.k]: v } };
      return S.setSettings({ slotPlan: plan });
    }
    case 'resetTargets':
      S.setSettings({ targets: { ...TARGETS }, slotPlan: JSON.parse(JSON.stringify(SLOT_PLAN)) });
      return rerender();
    case 'toggleWeekend': S.setSettings({ freezeWeekends: !st.freezeWeekends }); return rerender();
    case 'toggleAvg': S.setSettings({ includeFrozenInAverages: !st.includeFrozenInAverages }); return rerender();
    case 'toggleFull': S.setSettings({ fullCatalogue: !st.fullCatalogue }); return rerender();
    case 'clearWhey': S.setSettings({ wheyOverride: null }); return rerender();
    case 'clearAvail': S.setSettings({ availability: null }); return rerender();
    case 'addfreeze': return freezeSheet(null);
    case 'editfz': {
      const f = (st.freezes || []).find(x => x.start === ds.s);
      return freezeSheet(f);
    }
    case 'export': return doExport();
    case 'import': {
      const input = document.getElementById('importfile');
      input.onchange = async () => {
        const f = input.files && input.files[0];
        if (!f) return;
        try {
          const n = S.importJSON(await f.text());
          alert(`Imported ${n} day${n === 1 ? '' : 's'}.`);
          rerender();
        } catch (err) {
          alert('Could not read that file: ' + err.message);
        }
        input.value = '';
      };
      return input.click();
    }
    case 'reset': {
      if (!confirm('Erase every day, entry and setting on this phone? This cannot be undone.')) return;
      if (!confirm('Really erase everything? Export first if you are not sure.')) return;
      S.resetAll();
      return rerender();
    }
    case 'cancel': return closeSheet();
  }
}
