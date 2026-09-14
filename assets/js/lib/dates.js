/* Local dates only. Never UTC — a 22:30 shake in Paris must land on today,
   and a 00:40 one must land on yesterday. */

import { DAY_ROLLOVER_HOUR } from '../config.js';

/* The date a moment belongs to, honouring the rollover hour. */
export function dayKey(d = new Date(), rollover = DAY_ROLLOVER_HOUR) {
  const x = new Date(d.getTime());
  if (x.getHours() < rollover) x.setDate(x.getDate() - 1);
  return ymd(x);
}

/* Plain local YYYY-MM-DD of a Date, no rollover applied. */
export function ymd(d) {
  const p = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/* Parse YYYY-MM-DD into a local Date at noon, which is immune to DST edges. */
export function parseKey(key) {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d, 12, 0, 0, 0);
}

export function addDays(key, n) {
  const d = parseKey(key);
  d.setDate(d.getDate() + n);
  return ymd(d);
}

export function diffDays(a, b) {
  return Math.round((parseKey(b) - parseKey(a)) / 86400000);
}

/* 0 = Monday. French week. */
export function weekday(key) {
  return (parseKey(key).getDay() + 6) % 7;
}

export function isWeekend(key) {
  return weekday(key) >= 5;
}

export function monthKey(key) {
  return key.slice(0, 7);
}

/* Every day key in a month, plus the leading blanks needed to start the grid on Monday. */
export function monthGrid(mKey) {
  const [y, m] = mKey.split('-').map(Number);
  const first = new Date(y, m - 1, 1);
  const lead = (first.getDay() + 6) % 7;
  const days = new Date(y, m, 0).getDate();
  const cells = [];
  for (let i = 0; i < lead; i++) cells.push(null);
  for (let d = 1; d <= days; d++) cells.push(ymd(new Date(y, m - 1, d)));
  return cells;
}

export function shiftMonth(mKey, n) {
  const [y, m] = mKey.split('-').map(Number);
  const d = new Date(y, m - 1 + n, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

const MONTHS = ['January','February','March','April','May','June',
                'July','August','September','October','November','December'];

export function monthLabel(mKey) {
  const [y, m] = mKey.split('-').map(Number);
  return `${MONTHS[m - 1]} ${y}`;
}

export function dayLabel(key) {
  const d = parseKey(key);
  const wd = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'][weekday(key)];
  return `${wd} ${d.getDate()} ${MONTHS[d.getMonth()].slice(0, 3)}`;
}

/* Which slot the user most likely wants right now: the closest unlogged one by clock time. */
export function nearestSlot(unlogged, now = new Date()) {
  if (!unlogged.length) return null;
  const h = now.getHours() + now.getMinutes() / 60;
  const time = { breakfast: 8, lunch: 12, dinner: 19, shake: 22.5 };
  return unlogged.slice().sort((a, b) =>
    Math.abs(time[a] - h) - Math.abs(time[b] - h))[0];
}
