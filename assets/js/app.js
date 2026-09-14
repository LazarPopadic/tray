/* Router, shell and event plumbing. Hash routes so GitHub Pages never 404s. */

import * as S from './lib/store.js';
import * as Today from './ui/today.js';
import * as Tray from './ui/tray.js';
import * as Recipes from './ui/recipes.js';
import * as Calendar from './ui/calendar.js';
import * as Streak from './ui/streakview.js';
import * as Settings from './ui/settings.js';
import { closeSheet, sheetOpen, esc } from './ui/common.js';
import { dayLabel } from './lib/dates.js';

const ICONS = {
  today: '<path d="M4 7h16M4 12h16M4 17h10"/>',
  calendar: '<rect x="3" y="4.5" width="18" height="16" rx="2.5"/><path d="M8 2.5v4M16 2.5v4M3 9.5h18"/>',
  streak: '<path d="M12 3c1.5 4 5 5 5 9a5 5 0 0 1-10 0c0-1.5.6-2.6 1.5-3.5C9 10.5 10 8 9.5 6c2 .5 2.5 1.5 2.5-3z"/>',
  settings: '<circle cx="12" cy="12" r="3.2"/><path d="M12 2.5v2.4M12 19.1v2.4M4.2 7.2l2 1.2M17.8 15.6l2 1.2M4.2 16.8l2-1.2M17.8 8.4l2-1.2"/>'
};

const TABS = [
  ['#/today', 'Today', 'today'],
  ['#/calendar', 'Calendar', 'calendar'],
  ['#/streak', 'Streak', 'streak'],
  ['#/settings', 'Settings', 'settings']
];

let view = null;
let route = '';

function parse() {
  const h = (location.hash || '#/today').replace(/^#\/?/, '');
  return h.split('/').filter(Boolean);
}

function pick() {
  const p = parse();
  switch (p[0]) {
    case 'tray':
      return { mod: Tray, kind: 'tray', arg: p[1] || 'lunch' };
    case 'breakfast': return { mod: Recipes, kind: 'breakfast' };
    case 'shake':     return { mod: Recipes, kind: 'shake' };
    case 'calendar':  return { mod: Calendar, kind: 'calendar' };
    case 'streak':    return { mod: Streak, kind: 'streak' };
    case 'settings':  return { mod: Settings, kind: 'settings' };
    default:          return { mod: Today, kind: 'today' };
  }
}

function heading(v) {
  switch (v.kind) {
    case 'tray': return { title: Tray.title(), sub: '', back: true };
    case 'breakfast':
    case 'shake': return { title: Recipes.title(), sub: '', back: true };
    case 'calendar': return { title: 'Calendar', sub: '' };
    case 'streak': return { title: 'Streak', sub: '' };
    case 'settings': return { title: 'Settings', sub: '' };
    default: return { title: 'Tray', sub: dayLabel(S.today()) };
  }
}

function shell(v) {
  const h = heading(v);
  const tab = '#/' + (['today', 'calendar', 'streak', 'settings'].includes(v.kind) ? v.kind : 'today');
  return `
    <div class="topbar">
      ${h.back ? '<button class="back" data-act="goback" aria-label="Back">&larr;</button>' : ''}
      <h1>${esc(h.title)}</h1>
      ${h.sub ? `<span class="sub">${esc(h.sub)}</span>` : ''}
    </div>
    <main id="main">${v.mod.render()}</main>
    <nav class="nav" aria-label="Sections">
      ${TABS.map(([href, label, icon]) => `<a href="${href}"
        ${href === tab ? 'aria-current="page"' : ''}>
        <svg viewBox="0 0 24 24" aria-hidden="true">${ICONS[icon]}</svg>${label}</a>`).join('')}
    </nav>`;
}

function render(opts = {}) {
  const v = view;
  if (!v) return;
  const focus = document.activeElement;
  const keep = opts.keepFocus && focus && focus.dataset && focus.dataset.act === opts.keepFocus;
  const caret = keep ? focus.selectionStart : null;

  document.getElementById('app').innerHTML = shell(v);

  if (keep) {
    const again = document.querySelector(`[data-act="${opts.keepFocus}"]`);
    if (again) { again.focus(); try { again.setSelectionRange(caret, caret); } catch (e) {} }
  }
  if (opts.toast) toast(opts.toast);
}

let toastTimer = null;
function toast(msg) {
  let el = document.getElementById('toast');
  if (!el) {
    el = document.createElement('div');
    el.id = 'toast';
    el.style.cssText = 'position:fixed;left:50%;transform:translateX(-50%);bottom:calc(var(--bar-h) + env(safe-area-inset-bottom) + 16px);z-index:50;background:var(--ink);color:var(--ground);padding:10px 16px;border-radius:999px;font-size:13.5px;box-shadow:var(--shadow)';
    document.body.appendChild(el);
  }
  el.textContent = msg;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.remove(), 1900);
}

function go(hash) {
  if (location.hash === hash) navigate();
  else location.hash = hash;
}

function navigate() {
  const v = pick();
  if (v.kind === 'tray') {
    if (!Tray.active() || Tray.currentSlot() !== v.arg) Tray.start(v.arg);
  } else if (Tray.active()) {
    Tray.stop();
  }
  if (v.kind === 'breakfast' || v.kind === 'shake') Recipes.start(v.kind);
  closeSheet();
  view = v;
  render();
  window.scrollTo(0, 0);
}

/* ---------- event delegation ------------------------------------------------- */

function dispatch(act, ds, e) {
  const rerender = o => render(o);
  /* Freeze sheets are opened from two different screens; one owner handles them. */
  if (act === 'fzsave' || act === 'fzdel' || act === 'addfreeze') {
    Streak.onAct(act, ds, e, rerender, go);
    return;
  }
  if (act === 'goback') {
    if (view.kind === 'tray' && Tray.back()) return render();
    return go('#/today');
  }
  const mod = view.mod;
  if (mod && mod.onAct) mod.onAct(act, ds, e, rerender, go);
}

document.addEventListener('click', e => {
  const el = e.target.closest('[data-act]');
  if (!el || el.tagName === 'INPUT') return;
  e.preventDefault();
  dispatch(el.dataset.act, el.dataset, e);
});

document.addEventListener('input', e => {
  const el = e.target.closest('[data-act]');
  if (!el || el.tagName !== 'INPUT') return;
  if (el.type === 'search' || el.type === 'text') dispatch(el.dataset.act, el.dataset, e);
});

document.addEventListener('change', e => {
  const el = e.target.closest('[data-act]');
  if (!el || el.tagName !== 'INPUT') return;
  if (el.type === 'number' || el.type === 'date') dispatch(el.dataset.act, el.dataset, e);
});

window.addEventListener('hashchange', navigate);

document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && sheetOpen()) closeSheet();
});

/* ---------- boot -------------------------------------------------------------- */

S.load();
S.subscribe(() => { /* store saves itself; views re-render explicitly */ });
navigate();

/* sw.js sits next to index.html, two levels up from this file, so its scope is the app root.
   Registration failing is not fatal — it only means no offline cache this visit. */
if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register(new URL('../../sw.js', import.meta.url))
      .catch(() => {});
  });
}
