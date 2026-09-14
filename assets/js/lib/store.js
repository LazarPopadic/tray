/* All state, and the only thing that touches localStorage.
   Nothing here talks to the network. Ever. */

import { TARGETS, SLOT_PLAN, STREAK, DAY_ROLLOVER_HOUR, BREAKFAST_DEFAULT, SHAKE_DEFAULT } from '../config.js';
import { dayKey } from './dates.js';
import * as M from './macros.js';

const KEY = 'tray.v1';
const SCHEMA = 1;

function defaults() {
  return {
    schema: SCHEMA,
    settings: {
      targets: { ...TARGETS },
      slotPlan: JSON.parse(JSON.stringify(SLOT_PLAN)),
      streak: { ...STREAK },
      rolloverHour: DAY_ROLLOVER_HOUR,
      freezes: [],
      freezeWeekends: true,
      includeFrozenInAverages: false,
      wheyOverride: null,          /* { kcal, protein, fat, carbs } per 10 g */
      recipes: { breakfast: BREAKFAST_DEFAULT.slice(), shake: SHAKE_DEFAULT.slice() },
      availability: null,          /* { plat:[ids], periph:[ids] } or null for "everything" */
      fullCatalogue: false,
      lastExportAt: null
    },
    days: {},
    recent: { plat: [], garniture: [], periph: [] },
    /* How often each main has actually been confirmed with each side. This is the
       layer that makes predictions personal, and it beats the national menu prior. */
    pairs: {}
  };
}

let state = defaults();
const listeners = new Set();

/* ---------- persistence ---------------------------------------------------- */

export function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) state = migrate(JSON.parse(raw));
  } catch (e) {
    console.warn('Could not read saved data, starting fresh.', e);
  }
  return state;
}

function migrate(d) {
  const base = defaults();
  if (!d || typeof d !== 'object') return base;
  return {
    schema: SCHEMA,
    settings: { ...base.settings, ...(d.settings || {}),
                targets:  { ...base.settings.targets,  ...((d.settings || {}).targets  || {}) },
                streak:   { ...base.settings.streak,   ...((d.settings || {}).streak   || {}) },
                slotPlan: { ...base.settings.slotPlan, ...((d.settings || {}).slotPlan || {}) },
                recipes:  { ...base.settings.recipes,  ...((d.settings || {}).recipes  || {}) } },
    days: d.days || {},
    recent: { ...base.recent, ...(d.recent || {}) },
    pairs: d.pairs || {}
  };
}

/* tests.html turns this off so a self-check can never touch real data. */
let persist = true;
export function setPersist(on) {
  persist = on;
  if (!on) clearTimeout(saveTimer);
}

let saveTimer = null;
export function save() {
  if (!persist) return;
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify(state));
    } catch (e) {
      alert('Could not save — your phone may be low on storage. Export your data from Settings now.');
    }
  }, 120);
}

export function subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); }
function emit() { save(); listeners.forEach(f => f(state)); }

export function get() { return state; }
export function settings() { return state.settings; }

export function today() { return dayKey(new Date(), state.settings.rolloverHour); }

/* ---------- days and entries ------------------------------------------------ */

export function day(key) {
  return state.days[key] || { date: key, entries: [] };
}

export function dayTotals(key) {
  return M.sum(day(key).entries.map(e => e.macros));
}

export function loggedSlots(key) {
  return [...new Set(day(key).entries.map(e => e.slot))];
}

export function entriesFor(key, slot) {
  return day(key).entries.filter(e => e.slot === slot);
}

export function addEntry(key, entry) {
  const d = state.days[key] || (state.days[key] = { date: key, entries: [] });
  const e = { id: uid(), loggedAt: new Date().toISOString(), ...entry };
  d.entries.push(e);
  rememberRecent(e);
  emit();
  return e;
}

export function updateEntry(key, id, patch) {
  const d = state.days[key];
  if (!d) return;
  const i = d.entries.findIndex(e => e.id === id);
  if (i >= 0) { d.entries[i] = { ...d.entries[i], ...patch }; emit(); }
}

export function removeEntry(key, id) {
  const d = state.days[key];
  if (!d) return;
  d.entries = d.entries.filter(e => e.id !== id);
  if (!d.entries.length) delete state.days[key];
  emit();
}

export function setSettings(patch) {
  state.settings = { ...state.settings, ...patch };
  emit();
}

/* Most recently used dishes float to the front of every picker. After a fortnight
   the dish he is looking at is nearly always in the first row. */
function rememberRecent(entry) {
  const buckets = entry.recentBuckets;
  if (!buckets) return;
  for (const [bucket, ids] of Object.entries(buckets)) {
    const list = state.recent[bucket] || (state.recent[bucket] = []);
    for (const id of ids) {
      const at = list.indexOf(id);
      if (at >= 0) list.splice(at, 1);
      list.unshift(id);
    }
    state.recent[bucket] = list.slice(0, 40);
  }
  delete entry.recentBuckets;
}

export function recent(bucket) { return state.recent[bucket] || []; }

/* ---------- what actually goes with what ------------------------------------- */

export function rememberPairing(platId, sideIds) {
  if (!platId || !sideIds || !sideIds.length) return;
  const row = state.pairs[platId] || (state.pairs[platId] = {});
  for (const id of sideIds) row[id] = (row[id] || 0) + 1;
}

export function pairCount(platId, sideId) {
  const row = platId && state.pairs[platId];
  return (row && row[sideId]) || 0;
}

/* A counter for one main, ready to hand to the predictor. */
export function pairHistory(platId) {
  return id => pairCount(platId, id);
}

/* Across every main, so a périphérique you always take gets credit even with a new main. */
export function anyPairHistory() {
  const totals = {};
  for (const row of Object.values(state.pairs)) {
    for (const [id, n] of Object.entries(row)) totals[id] = (totals[id] || 0) + n;
  }
  return id => totals[id] || 0;
}

export function uid() {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
}

/* ---------- export and import ------------------------------------------------ */

export function exportBlob() {
  const payload = { app: 'tray', schema: SCHEMA, exportedAt: new Date().toISOString(), data: state };
  return new Blob([JSON.stringify(payload, null, 1)], { type: 'application/json' });
}

export function exportFilename() {
  return `tray-backup-${today()}.json`;
}

export function markExported() {
  state.settings.lastExportAt = new Date().toISOString();
  emit();
}

export function importJSON(text) {
  const parsed = JSON.parse(text);
  const d = parsed && parsed.data ? parsed.data : parsed;
  if (!d || typeof d !== 'object' || !d.days) throw new Error('That file is not a Tray backup.');
  state = migrate(d);
  emit();
  return Object.keys(state.days).length;
}

export function resetAll() {
  state = defaults();
  emit();
}

/* Days logged since the last export. Prompts a backup at 30. */
export function daysSinceExport() {
  const last = state.settings.lastExportAt;
  const keys = Object.keys(state.days);
  if (!last) return keys.length;
  const lastKey = dayKey(new Date(last), state.settings.rolloverHour);
  return keys.filter(k => k > lastKey).length;
}
