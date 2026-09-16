/* Router, shell and event plumbing. Hash routes so GitHub Pages never 404s. */

import * as S from './lib/store.js';
import * as Today from './ui/today.js';
import * as Tray from './ui/tray.js';
import * as Quick from './ui/quick.js';
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

const VIEWS = {
  tray:      { mod: Tray,     back: true },
  quick:     { mod: Quick,    back: true },
  breakfast: { mod: Recipes,  back: true },
  shake:     { mod: Recipes,  back: true },
  calendar:  { mod: Calendar },
  streak:    { mod: Streak },
  settings:  { mod: Settings },
  today:     { mod: Today }
};

let view = null;

function parse() {
  return (location.hash || '#/today').replace(/^#\/?/, '').split('/').filter(Boolean);
}

function pick() {
  const p = parse();
  const kind = VIEWS[p[0]] ? p[0] : 'today';
  return { ...VIEWS[kind], kind, arg: p[1] || null };
}

function heading(v) {
  const mod = v.mod;
  if (v.kind === 'today') return { title: 'Tray', sub: dayLabel(S.today()) };
  if (mod.title) return { title: mod.title(), sub: mod.sub ? mod.sub() : '' };
  return { title: v.kind.replace(/^./, c => c.toUpperCase()), sub: '' };
}

function shell(v) {
  const h = heading(v);
  const tab = '#/' + (['today', 'calendar', 'streak', 'settings'].includes(v.kind) ? v.kind : 'today');
  const dock = v.mod.hasDock && v.mod.dock ? v.mod.dock() : '';
  return `
    <div class="topbar">
      ${v.back ? '<button class="back" data-act="goback" aria-label="Back">&larr;</button>' : ''}
      <h1>${esc(h.title)}</h1>
      ${h.sub ? `<span class="sub">${h.sub}</span>` : ''}
    </div>
    <main id="main" class="${dock ? 'with-dock' : ''}">${v.mod.render()}</main>
    ${dock ? `<div class="dock">${dock}</div>` : ''}
    <nav class="nav" aria-label="Sections">
      ${TABS.map(([href, label, icon]) => `<a href="${href}"
        ${href === tab ? 'aria-current="page"' : ''}>
        <svg viewBox="0 0 24 24" aria-hidden="true">${ICONS[icon]}</svg>${label}</a>`).join('')}
    </nav>`;
}

function render(opts = {}) {
  if (!view) return;
  const focus = document.activeElement;
  const keep = opts.keepFocus && focus && focus.dataset && focus.dataset.act === opts.keepFocus;
  const caret = keep ? focus.selectionStart : null;

  document.getElementById('app').innerHTML = shell(view);

  if (keep) {
    const again = document.querySelector(`[data-act="${opts.keepFocus}"]`);
    if (again) { again.focus(); try { again.setSelectionRange(caret, caret); } catch (e) {} }
  }
  if (opts.toast) {
    const t = opts.toast;
    toast(typeof t === 'string' ? t : t.msg, typeof t === 'string' ? null : t.action);
  }
}

let toastTimer = null;

/* A toast can carry one action — used for Undo, which needs longer on screen than a
   plain confirmation because the whole point is catching a misclick. */
function toast(msg, action) {
  const old = document.getElementById('toast');
  if (old) old.remove();
  const el = document.createElement('div');
  el.id = 'toast';
  el.className = 'toast';
  el.setAttribute('role', 'status');
  el.appendChild(Object.assign(document.createElement('span'), { textContent: msg }));
  if (action) {
    const b = document.createElement('button');
    b.className = 'toast-action';
    b.textContent = action.label;
    b.addEventListener('click', () => { el.remove(); action.fn(); });
    el.appendChild(b);
  }
  document.body.appendChild(el);
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.remove(), action ? 6000 : 1900);
}

function go(hash) {
  if (location.hash === hash) navigate();
  else location.hash = hash;
}

function navigate() {
  const v = pick();

  if (v.kind === 'tray') {
    if (!Tray.active() || (v.arg && Tray.currentSlot() !== v.arg)) Tray.start(v.arg);
  } else if (Tray.active()) Tray.stop();

  if (v.kind === 'quick') { if (!Quick.active()) Quick.start(); }
  else if (Quick.active()) Quick.stop();

  if (v.kind === 'breakfast' || v.kind === 'shake') Recipes.start(v.kind);

  closeSheet();
  view = v;
  render();
  window.scrollTo(0, 0);
}

/* ---------- event delegation -------------------------------------------------- */

function dispatch(act, ds, e) {
  const rerender = o => render(o);
  /* Freeze sheets open from two screens; one module owns them. */
  if (act === 'fzsave' || act === 'fzdel' || act === 'addfreeze') {
    return Streak.onAct(act, ds, e, rerender, go);
  }
  if (act === 'goback') {
    if (view.kind === 'tray' && Tray.back()) return render();
    return go('#/today');
  }
  if (view.mod && view.mod.onAct) view.mod.onAct(act, ds, e, rerender, go);
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

/* ---------- boot ---------------------------------------------------------------- */

S.load();
navigate();

/* sw.js sits next to index.html, two levels up from this file, so its scope is the app
   root. Registration failing only means no offline cache this visit. */
if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register(new URL('../../sw.js', import.meta.url)).catch(() => {});
  });
}
