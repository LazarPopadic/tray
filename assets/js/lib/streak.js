/* Streak and freeze rules (§9). Pure — give it days, settings and a "today", get answers. */

import { addDays, diffDays, isWeekend } from './dates.js';

/* Overlapping or touching ranges merge into one. */
export function mergeRanges(ranges) {
  const rs = ranges.filter(r => r && r.start && r.end)
    .map(r => ({ ...r, start: r.start <= r.end ? r.start : r.end,
                        end:   r.start <= r.end ? r.end : r.start }))
    .sort((a, b) => a.start.localeCompare(b.start));
  const out = [];
  for (const r of rs) {
    const last = out[out.length - 1];
    if (last && r.start <= addDays(last.end, 1)) {
      if (r.end > last.end) last.end = r.end;
      if (r.label && !last.label.includes(r.label)) last.label += ` + ${r.label}`;
    } else {
      out.push({ ...r, label: r.label || 'Trip' });
    }
  }
  return out;
}

export function isFrozen(key, settings) {
  if (settings.freezeWeekends && isWeekend(key)) return true;
  return mergeRanges(settings.freezes || []).some(r => key >= r.start && key <= r.end);
}

export function freezeLabel(key, settings) {
  const r = mergeRanges(settings.freezes || []).find(x => key >= x.start && key <= x.end);
  if (r) return r.label;
  if (settings.freezeWeekends && isWeekend(key)) return 'Weekend';
  return null;
}

/* A day counts if it clears both thresholds. Fat and carbs never break a streak. */
export function dayCounts(totals, settings) {
  if (!totals || totals.kcal <= 0) return false;
  const t = settings.targets, s = settings.streak;
  return totals.kcal >= t.kcal * s.kcalFactor && totals.protein >= t.protein * s.proteinFactor;
}

/* Walk backwards from yesterday. Frozen days are stepped over, neither breaking
   the streak nor adding to it. Today is never judged. */
export function currentStreak(totalsFor, settings, today) {
  let n = 0;
  let key = addDays(today, -1);
  let guard = 0;
  while (guard++ < 3000) {
    if (isFrozen(key, settings)) { key = addDays(key, -1); continue; }
    if (dayCounts(totalsFor(key), settings)) { n++; key = addDays(key, -1); continue; }
    break;
  }
  return n;
}

/* Longest run anywhere in the logged history, using the same skip rule. */
export function longestStreak(keys, totalsFor, settings, today) {
  const all = keys.filter(k => k < today).sort();
  if (!all.length) return 0;
  let best = 0, run = 0;
  let key = all[0];
  const last = addDays(today, -1);
  let guard = 0;
  while (key <= last && guard++ < 5000) {
    if (isFrozen(key, settings)) { key = addDays(key, 1); continue; }
    if (dayCounts(totalsFor(key), settings)) { run++; if (run > best) best = run; }
    else run = 0;
    key = addDays(key, 1);
  }
  return best;
}

export function totalDaysOnTarget(keys, totalsFor, settings, today) {
  return keys.filter(k => k < today && !isFrozen(k, settings) && dayCounts(totalsFor(k), settings)).length;
}

/* What today still needs to count, and whether it already does. */
export function todayStatus(totals, settings) {
  const t = settings.targets, s = settings.streak;
  const needK = Math.max(0, t.kcal * s.kcalFactor - (totals.kcal || 0));
  const needP = Math.max(0, t.protein * s.proteinFactor - (totals.protein || 0));
  return { counts: needK <= 0 && needP <= 0, kcal: needK, protein: needP };
}

export function upcomingFreezes(settings, today) {
  return mergeRanges(settings.freezes || [])
    .map(r => ({ ...r, days: diffDays(r.start, r.end) + 1,
                 when: r.end < today ? 'past' : r.start > today ? 'upcoming' : 'active' }))
    .sort((a, b) => b.start.localeCompare(a.start));
}
