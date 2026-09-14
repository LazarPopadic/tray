/* Shared rendering helpers. Views return HTML strings; clicks are handled by
   delegation on [data-act], so nothing has to keep references to DOM nodes. */

import * as M from '../lib/macros.js';
import { rankOf } from '../config.js';

export const esc = s => String(s == null ? '' : s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

export const n0 = v => Math.round(v || 0).toLocaleString('en-GB');
export const sign = v => (v > 0 ? '+' : '') + n0(v);

export function macroLine(m) {
  const r = M.round(m);
  return `${n0(r.kcal)} kcal · ${n0(r.protein)} P · ${n0(r.fat)} F · ${n0(r.carbs)} C`;
}

export function estTag(item) {
  return item && item.estimated ? '<span class="est">est.</span>' : '';
}

/* One name for a logged entry. A free-text name wins outright; otherwise the item
   names, collapsed so three eggs read as "Egg x3" rather than three times over. */
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

/* ---------- meters ---------------------------------------------------------- */

export function meter(name, got, target, size) {
  const pct = target > 0 ? (got / target) * 100 : 0;
  const w = Math.min(100, Math.max(0, pct));
  const left = target - got;
  let cls = '';
  if (pct >= 100 && pct <= 110) cls = 'good';
  else if (pct > 110 && pct <= 125) cls = 'over';
  else if (pct > 125) cls = 'way-over';
  const unit = name === 'kcal' ? '' : ' g';
  return `<div class="meter ${size}">
    <div class="top">
      <span class="name">${esc(name)}</span>
      <span class="grow"></span>
      <span class="val num">${n0(got)}<span class="muted" style="font-weight:400"> / ${n0(target)}${unit}</span></span>
    </div>
    <div class="track"><div class="fill ${cls}" style="width:${w.toFixed(1)}%"></div></div>
    <div class="left num">${
      Math.abs(left) < 0.5 ? 'on target'
      : left > 0 ? `${n0(left)}${unit} left`
      : `${n0(-left)}${unit} over`}</div>
  </div>`;
}

export function meters(totals, targets) {
  return `<div class="meters">
    ${meter('kcal', totals.kcal, targets.kcal, 'major')}
    ${meter('protein', totals.protein, targets.protein, 'major')}
    ${meter('fat', totals.fat, targets.fat, 'minor')}
    ${meter('carbs', totals.carbs, targets.carbs, 'minor')}
  </div>`;
}

/* ---------- dish cards ------------------------------------------------------ */

export function dishCard(item, opts = {}) {
  const m = M.round(item.macros);
  const rank = rankOf(item.macros);
  const pressed = opts.selected ? ' aria-pressed="true"' : '';
  const extra = opts.className ? ' ' + opts.className : '';
  const act = opts.act || 'pick';
  const flag = opts.flag ? `<span class="flag">${esc(opts.flag)}</span><br>` : '';
  const look = opts.showLook !== false && item.look
    ? `<div class="look">${esc(item.look)}</div>` : '';
  const reason = opts.reason ? `<div class="look">${esc(opts.reason)}</div>` : '';
  return `<button class="dish${extra}" data-act="${act}" data-id="${esc(item.id)}"${pressed}>
    ${flag}
    <div class="en"><span class="dot ${rank}"></span>${esc(item.en)}${estTag(item)}</div>
    <div class="fr">${esc(item.fr)}${item.grams ? ` · ${n0(item.grams)} ${item.unit || 'g'}` : ''}</div>
    <div class="figs"><div class="k">${n0(m.kcal)}</div><div class="p">${n0(m.protein)} g P</div></div>
    ${look}${reason}
  </button>`;
}

export function pairCard(pair, index) {
  const m = M.round(pair.macros);
  return `<button class="dish pick" data-act="pair" data-i="${index}">
    <span class="flag">${index === 0 ? 'Best pick' : 'Also good'}</span>
    <div class="en">${esc(pair.a.en)}${estTag(pair.a)} + ${esc(pair.b.en)}${estTag(pair.b)}</div>
    <div class="figs"><div class="k">${n0(m.kcal)}</div><div class="p">${n0(m.protein)} g P</div></div>
    <div class="look">${esc(pair.reason)}</div>
  </button>`;
}

/* ---------- chips ------------------------------------------------------------ */

export function chipRow(items, activeId, act) {
  return `<div class="chiprow">${items.map(([id, label]) =>
    `<button class="chip${id === activeId ? ' on' : ''}" data-act="${act}" data-v="${esc(id)}">${esc(label)}</button>`
  ).join('')}</div>`;
}

/* ---------- sheet ------------------------------------------------------------ */

let sheetEl = null;

export function openSheet(html) {
  closeSheet();
  sheetEl = document.createElement('div');
  sheetEl.className = 'scrim';
  sheetEl.innerHTML = `<div class="sheet" role="dialog" aria-modal="true">
    <div class="handle"></div>${html}</div>`;
  sheetEl.addEventListener('click', e => { if (e.target === sheetEl) closeSheet(); });
  document.body.appendChild(sheetEl);
  return sheetEl;
}

export function closeSheet() {
  if (sheetEl) { sheetEl.remove(); sheetEl = null; }
}

export function sheetOpen() { return !!sheetEl; }

/* ---------- steppers ---------------------------------------------------------- */

/* No est. tag here: every ingredient on this screen is a label value, and the screen
   says so once at the bottom. A marker on all six rows is noise, not honesty. */
export function stepper(item, qty, act) {
  const m = M.round(M.scale(item.macros, qty));
  return `<div class="ing">
    <div class="lab">
      <div class="n">${esc(item.en)}</div>
      <div class="u num">${esc(item.unit)} · ${n0(m.kcal)} kcal · ${n0(m.protein)} g P</div>
    </div>
    <div class="step">
      <button data-act="${act}" data-id="${esc(item.id)}" data-d="-1" aria-label="Less">&minus;</button>
      <span class="q">${qty}</span>
      <button data-act="${act}" data-id="${esc(item.id)}" data-d="1" aria-label="More">+</button>
    </div>
  </div>`;
}

/* ---------- misc --------------------------------------------------------------- */

export function switchRow(label, on, act, hint) {
  return `<div class="field">
    <label>${esc(label)}${hint ? `<div class="tiny muted">${esc(hint)}</div>` : ''}</label>
    <button class="switch" role="switch" aria-checked="${on ? 'true' : 'false'}" data-act="${act}"></button>
  </div>`;
}

export function numberRow(label, value, act, step) {
  return `<div class="field">
    <label for="f_${act}">${esc(label)}</label>
    <input id="f_${act}" type="number" inputmode="decimal" step="${step || 1}"
           value="${esc(value)}" data-act="${act}">
  </div>`;
}

/* A one-line sparkline of daily kcal against the target. */
export function sparkline(series, target) {
  if (!series.length) return '';
  const w = 320, h = 96, pad = 4;
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
          stroke="var(--muted)" stroke-width="1" stroke-dasharray="3 3"/>
    ${runs.map(r => `<polyline points="${r.join(' ')}" fill="none" stroke="var(--accent)"
       stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>`).join('')}
    ${series.map((s, i) => s.kcal > 0
      ? `<circle cx="${x(i).toFixed(1)}" cy="${y(s.kcal).toFixed(1)}" r="1.8"
           fill="${s.hit ? 'var(--take)' : 'var(--accent)'}"/>` : '').join('')}
  </svg>`;
}
