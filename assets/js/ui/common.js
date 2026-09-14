/* Shared rendering. Views return HTML strings; clicks are handled by delegation on
   [data-act], so nothing holds references to DOM nodes. */

import * as M from '../lib/macros.js';
import { rankOf } from '../config.js';

export const esc = s => String(s == null ? '' : s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

export const n0 = v => Math.round(v || 0).toLocaleString('en-GB');

export function macroLine(m) {
  const r = M.round(m);
  return `${n0(r.kcal)} kcal · ${n0(r.protein)} P · ${n0(r.fat)} F · ${n0(r.carbs)} C`;
}

export function estTag(item) {
  return item && item.estimated ? '<span class="est">est.</span>' : '';
}

export function entryLabel(e, lookup) {
  if (e.customName) return e.customName;
  const counts = new Map();
  for (const id of e.itemIds || []) counts.set(id, (counts.get(id) || 0) + 1);
  const names = [...counts].map(([id, n]) => {
    const f = lookup(id);
    return f ? (n > 1 ? `${f.en} x${n}` : f.en) : null;
  }).filter(Boolean);
  return names.join(', ') || 'Logged';
}

/* ---------- family glyphs -------------------------------------------------------
   Six marks, one per meat family. They exist for one reason: you are holding a tray
   and need to find "the fish one" without reading. Nothing else in the app gets an
   icon — a glyph beside a settings row would just be decoration. */

const GLYPHS = {
  poultry: '<circle cx="9.2" cy="9.2" r="5.4"/><path d="M12.9 13l4.3 4.3"/><circle cx="18.9" cy="19" r="2.3"/>',
  pork:    '<path d="M3.5 8.6h11.2a3.4 3.4 0 0 1 0 6.8H3.5z"/><circle cx="18.6" cy="12" r="2.2"/>',
  beef:    '<rect x="3" y="8.5" width="18" height="7" rx="3.5"/><path d="M7.5 12h9"/>',
  fish:    '<path d="M5.5 12c3-3.6 6.6-5.2 9.8-5.2 3 0 5.2 2 6.2 5.2-1 3.2-3.2 5.2-6.2 5.2-3.2 0-6.8-1.6-9.8-5.2z"/><path d="M5.5 12 2 8.8v6.4z"/><circle cx="16.4" cy="10.6" r=".9"/>',
  pasta_pizza: '<path d="M12 3.2 20.6 19a21 21 0 0 1-17.2 0z"/><circle cx="10" cy="12.4" r="1.1"/><circle cx="14.2" cy="14.6" r="1.1"/>',
  veg:     '<path d="M12 21v-7.4"/><path d="M12 13.6c0-3.2 2.6-5.8 5.8-5.8 0 3.2-2.6 5.8-5.8 5.8z"/><path d="M12 15.2c0-2.7-2.2-4.9-4.9-4.9 0 2.7 2.2 4.9 4.9 4.9z"/>'
};

export function glyph(family) {
  const g = GLYPHS[family];
  if (!g) return '';
  return `<span class="glyph" aria-hidden="true"><svg viewBox="0 0 24 24">${g}</svg></span>`;
}

/* ---------- bars ------------------------------------------------------------------ */

function fillClass(pct) {
  if (pct >= 100 && pct <= 110) return 'hit';
  if (pct > 110 && pct <= 125) return 'over';
  if (pct > 125) return 'way-over';
  return '';
}

/* `tick` marks the fraction where the day starts counting toward the streak. */
export function bar(got, target, tick) {
  const pct = target > 0 ? (got / target) * 100 : 0;
  const w = Math.min(100, Math.max(0, pct));
  return `<div class="bar">
    <div class="fill ${fillClass(pct)}" style="width:${w.toFixed(1)}%"></div>
    ${tick ? `<div class="tick" style="left:${(tick * 100).toFixed(1)}%"></div>` : ''}
  </div>`;
}

/* Level 1 of the Today screen: the day, as one number and three supporting ones. */
export function hero(totals, targets, streak) {
  const left = targets.kcal - totals.kcal;
  const cell = (name, got, tgt, tick) => `
    <div class="cell">
      <span class="k label">${esc(name)}</span>
      <span class="v">${n0(got)}<small> / ${n0(tgt)} g</small></span>
      ${bar(got, tgt, tick)}
    </div>`;
  return `<div class="hero">
    <div class="kcal">
      <b>${n0(totals.kcal)}</b>
      <span class="of">/ ${n0(targets.kcal)}</span>
      <span class="unit">kcal</span>
    </div>
    ${bar(totals.kcal, targets.kcal, streak ? streak.kcalFactor : null)}
    <div class="tiny muted num" style="margin-top:var(--s2)">
      ${left > 0 ? `${n0(left)} kcal left today` : `${n0(-left)} kcal over`}
    </div>
    <div class="rest">
      ${cell('protein', totals.protein, targets.protein, streak ? streak.proteinFactor : null)}
      ${cell('fat', totals.fat, targets.fat, null)}
      ${cell('carbs', totals.carbs, targets.carbs, null)}
    </div>
  </div>`;
}

/* ---------- food tiles -------------------------------------------------------------- */

export function tile(item, opts = {}) {
  const m = M.round(item.macros);
  const rank = rankOf(item.macros);
  const act = opts.act || 'pick';
  const extra = [opts.wide ? 'wide' : '', opts.className || ''].filter(Boolean).join(' ');
  const data = Object.entries(opts.data || {})
    .map(([k, v]) => ` data-${k}="${esc(v)}"`).join('');
  /* aria-pressed only where the tile really is a toggle. On the main-dish grid a tile
     is navigation, and announcing "not pressed" there is just wrong. */
  const pressed = opts.selectable || opts.selected
    ? ` aria-pressed="${opts.selected ? 'true' : 'false'}"` : '';
  return `<button class="tile ${extra}" data-act="${act}" data-id="${esc(item.id)}"${data}${pressed}>
    <span class="dot ${rank}" aria-hidden="true" title="${
      rank === 'take' ? 'good protein for the calories'
      : rank === 'ok' ? 'middling protein for the calories'
      : 'poor protein for the calories'}"></span>
    ${opts.wide ? '' : glyph(item.family)}
    <span class="en">${esc(item.en)}${estTag(item)}</span>
    <span class="fr">${esc(item.fr || item.unit || '')}</span>
    <span class="figs"><b>${n0(m.kcal)}</b> kcal · ${n0(m.protein)} P</span>
  </button>`;
}

export function tiles(list, opts = {}) {
  if (!list.length) return `<div class="note">${esc(opts.empty || 'Nothing here.')}</div>`;
  return `<div class="tiles${opts.one ? ' one' : ''}">${list.map(i => tile(i, opts)).join('')}</div>`;
}

/* ---------- tray rows ---------------------------------------------------------------- */

export function trayRow(slotName, item, opts = {}) {
  const swap = opts.swap
    ? `<button class="btn sm ghost" data-act="swap" data-slot="${esc(opts.swap)}"
         ${opts.index != null ? `data-i="${opts.index}"` : ''}>${item ? 'Swap' : 'Choose'}</button>`
    : '';
  if (!item) {
    return `<div class="trayrow none">
      <span class="slotname label">${esc(slotName)}</span>
      <span class="what"><span class="n">${esc(opts.emptyText || 'None')}</span></span>
      ${swap}
    </div>`;
  }
  const m = M.round(item.macros);
  return `<div class="trayrow">
    <span class="slotname label">${esc(slotName)}</span>
    <span class="what">
      <span class="n">${esc(item.en)}${estTag(item)}</span>
      <span class="m">${n0(m.kcal)} kcal · ${n0(m.protein)} P · ${n0(m.fat)} F · ${n0(m.carbs)} C</span>
      ${opts.why ? `<span class="why">${esc(opts.why)}</span>` : ''}
    </span>
    ${swap}
  </div>`;
}

/* ---------- misc ------------------------------------------------------------------------ */

export function steps(n, total) {
  return `<span class="steps" role="img" aria-label="Step ${n} of ${total}">${
    Array.from({ length: total }, (_, i) => `<i class="${i < n ? 'on' : ''}"></i>`).join('')
  }</span>`;
}

export function chipRow(items, activeId, act) {
  return `<div class="chiprow" role="tablist">${items.map(([id, label]) =>
    `<button class="chip${id === activeId ? ' on' : ''}" role="tab"
       aria-selected="${id === activeId}" data-act="${act}" data-v="${esc(id)}">${esc(label)}</button>`
  ).join('')}</div>`;
}

export function stepper(item, qty, act) {
  const m = M.round(M.scale(item.macros, qty));
  return `<div class="ing">
    <div class="lab">
      <div class="n">${esc(item.en)}</div>
      <div class="u">${esc(item.unit)} · ${n0(m.kcal)} kcal · ${n0(m.protein)} g P</div>
    </div>
    <div class="step">
      <button data-act="${act}" data-id="${esc(item.id)}" data-d="-1"
        aria-label="Less ${esc(item.en)}">&minus;</button>
      <span class="q" aria-live="polite">${qty}</span>
      <button data-act="${act}" data-id="${esc(item.id)}" data-d="1"
        aria-label="More ${esc(item.en)}">+</button>
    </div>
  </div>`;
}

export function switchRow(label, on, act, hint) {
  return `<div class="field">
    <label id="lb_${act}">${esc(label)}${hint ? `<div class="tiny muted">${esc(hint)}</div>` : ''}</label>
    <button class="switch" role="switch" aria-labelledby="lb_${act}"
      aria-checked="${on ? 'true' : 'false'}" data-act="${act}"></button>
  </div>`;
}

/* before -> after, shown wherever an action changes the day's numbers */
export function delta(before, after, target, unit) {
  return `<div class="delta">
    <span>${n0(before)}</span>
    <span class="arrow" aria-hidden="true">&rarr;</span>
    <b>${n0(after)}</b>
    <span>of ${n0(target)}${unit || ''}</span>
  </div>`;
}

/* ---------- sheet ------------------------------------------------------------------------ */

let sheetEl = null;
let lastFocus = null;

export function openSheet(html, opts = {}) {
  closeSheet();
  lastFocus = document.activeElement;
  sheetEl = document.createElement('div');
  sheetEl.className = 'scrim';
  sheetEl.innerHTML = `<div class="sheet" role="dialog" aria-modal="true"
    ${opts.label ? `aria-label="${esc(opts.label)}"` : ''}>
    <div class="handle"></div>${html}</div>`;
  sheetEl.addEventListener('click', e => { if (e.target === sheetEl) closeSheet(); });
  document.body.appendChild(sheetEl);
  const first = sheetEl.querySelector('button, input, [tabindex]');
  if (first && opts.focus !== false) first.focus({ preventScroll: true });
  return sheetEl;
}

export function closeSheet() {
  if (!sheetEl) return;
  sheetEl.remove();
  sheetEl = null;
  if (lastFocus && document.contains(lastFocus)) lastFocus.focus({ preventScroll: true });
  lastFocus = null;
}

export function sheetOpen() { return !!sheetEl; }

/* ---------- sparkline --------------------------------------------------------------------- */

export function sparkline(series, target) {
  if (!series.length) return '';
  const w = 320, h = 92, pad = 4;
  const max = Math.max(target * 1.25, ...series.map(s => s.kcal), 1);
  const x = i => pad + (i * (w - pad * 2)) / Math.max(series.length - 1, 1);
  const y = v => h - pad - (v / max) * (h - pad * 2);
  /* A day with nothing logged is not a day you ate nothing, so the line breaks
     rather than dropping to the floor. */
  const runs = [];
  let run = [];
  series.forEach((s, i) => {
    if (s.kcal > 0) run.push(`${x(i).toFixed(1)},${y(s.kcal).toFixed(1)}`);
    else { if (run.length) runs.push(run); run = []; }
  });
  if (run.length) runs.push(run);
  const ty = y(target).toFixed(1);
  return `<svg class="spark" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" role="img"
      aria-label="Daily calories over the last ${series.length} days against the ${n0(target)} target">
    <line x1="${pad}" y1="${ty}" x2="${w - pad}" y2="${ty}"
          stroke="var(--rule-firm)" stroke-width="1" stroke-dasharray="3 3"/>
    ${runs.map(r => `<polyline points="${r.join(' ')}" fill="none" stroke="var(--accent)"
       stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>`).join('')}
    ${series.map((s, i) => s.kcal > 0
      ? `<circle cx="${x(i).toFixed(1)}" cy="${y(s.kcal).toFixed(1)}" r="1.8"
           fill="${s.hit ? 'var(--take)' : 'var(--accent)'}"/>` : '').join('')}
  </svg>`;
}
