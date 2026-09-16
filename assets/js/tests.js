/* Self-check. Walks the acceptance criteria in §11 of the handover that logic can
   decide, plus a sanity pass over the scraped data.

   It borrows your real storage, then puts it back exactly as it was. */

import * as M from './lib/macros.js';
import * as D from './lib/dates.js';
import * as R from './lib/recommend.js';
import * as ST from './lib/streak.js';
import * as S from './lib/store.js';
import { FOODS, BY_ID, PLATS, STAPLES, PERIPH, GARNITURES, BREAD, food } from './data/foods.js';
import { INGREDIENTS, ALL_HOME, homeItem } from './data/home.js';
import { TARGETS, SLOT_PLAN, SLOT_ORDER, BREAKFAST_DEFAULT, SHAKE_DEFAULT, rankOf } from './config.js';
import * as Tray from './ui/tray.js';
import * as P from './lib/predict.js';
import { tagsFor, affinity, OBSERVED_FREQ } from './data/pairings.js';
import { tile } from './ui/common.js';

/* Before anything else: the store must not write. The tests build a fixture day and
   reset the state, and a debounced save landing after the run would overwrite real data. */
S.setPersist(false);

const results = [];
let group = '';

function g(name) { group = name; }
function t(name, fn) {
  try {
    const detail = fn();
    results.push({ group, name, ok: true, detail: detail || '' });
  } catch (e) {
    results.push({ group, name, ok: false, detail: e.message });
  }
}
function assert(cond, msg) { if (!cond) throw new Error(msg || 'failed'); }
function near(a, b, tol, msg) {
  if (Math.abs(a - b) > tol) throw new Error(`${msg || ''} ${a} vs ${b} (tol ${tol})`);
}

/* ---------- helpers ------------------------------------------------------------ */

function recipeMacros(rows) {
  return M.sum(rows.map(r => M.scale(homeItem(r.id, null).macros, r.qty)));
}

/* Build a tray the way the app would: top plat, top garniture, bread, best pair. */
function autoTray(slot, consumed, platId) {
  const logged = SLOT_ORDER.filter(s => consumed.slots.includes(s));
  const unlogged = SLOT_ORDER.filter(s => !logged.includes(s));
  const plat = food(platId);
  const garn = R.rankGarnitures(FOODS.filter(f => f.category === 'garniture'))[0];
  const base = M.sum([plat.macros, garn.macros, BREAD.macros]);
  const raw = R.slotNeed(slot, consumed.macros, unlogged, TARGETS, SLOT_PLAN);
  const need = M.clampPositive(M.sub(raw, base), 2);
  const pairs = R.recommendPairs(STAPLES, need, { platFat: plat.macros.fat }, 3);
  assert(pairs.length === 3, 'expected 3 pairs');
  return { macros: M.add(base, pairs[0].macros), pair: pairs[0], need };
}

/* ---------- macros and dates ---------------------------------------------------- */

g('Arithmetic');

t('add, scale and subtract compose', () => {
  const a = { kcal: 100, protein: 10, fat: 5, carbs: 20 };
  const s = M.scale(a, 2);
  assert(s.kcal === 200 && s.protein === 20);
  assert(M.isZero(M.sub(M.add(a, a), s)), 'a+a should equal 2a');
});

t('displayed macros are whole numbers', () => {
  const r = M.round({ kcal: 100.6, protein: 10.4, fat: 5.5, carbs: 20.49 });
  assert(r.kcal === 101 && r.protein === 10 && r.fat === 6 && r.carbs === 20);
});

g('Local dates (§5)');

t('a 22:30 shake lands on today', () => {
  const k = D.dayKey(new Date(2026, 8, 15, 22, 30), 4);
  assert(k === '2026-09-15', k);
});

t('a 00:40 snack lands on the day before', () => {
  const k = D.dayKey(new Date(2026, 8, 16, 0, 40), 4);
  assert(k === '2026-09-15', k);
});

t('04:01 starts the new day', () => {
  assert(D.dayKey(new Date(2026, 8, 16, 4, 1), 4) === '2026-09-16');
});

t('date keys are local, not UTC', () => {
  /* 23:30 local on the 31st is already the 1st in UTC for a positive offset. */
  const d = new Date(2026, 11, 31, 23, 30);
  assert(D.dayKey(d, 4) === '2026-12-31', D.dayKey(d, 4));
});

t('the slot guess wraps around midnight', () => {
  const all = ['breakfast', 'lunch', 'dinner', 'shake'];
  const at = (h, m) => D.nearestSlot(all, new Date(2026, 8, 15, h, m));
  assert(at(0, 30) === 'shake', `00:30 should guess the shake, got ${at(0, 30)}`);
  assert(at(7, 45) === 'breakfast', `07:45 got ${at(7, 45)}`);
  assert(at(12, 20) === 'lunch', `12:20 got ${at(12, 20)}`);
  assert(at(19, 10) === 'dinner', `19:10 got ${at(19, 10)}`);
  assert(at(23, 0) === 'shake', `23:00 got ${at(23, 0)}`);
  return 'midnight, morning, noon, evening, late';
});

t('month grid starts on Monday and has the right length', () => {
  const cells = D.monthGrid('2026-09');
  assert(cells.filter(Boolean).length === 30, 'September has 30 days');
  assert(cells[0] === null, '1 Sep 2026 is a Tuesday, so one leading blank');
  assert(cells[1] === '2026-09-01');
});

/* ---------- streak and freeze --------------------------------------------------- */

g('Streak and freeze (§9)');

const streakSettings = {
  targets: TARGETS, streak: { kcalFactor: 0.9, proteinFactor: 0.9 },
  rolloverHour: 4, freezes: [], freezeWeekends: false
};

t('overlapping ranges merge', () => {
  const m = ST.mergeRanges([
    { start: '2026-12-20', end: '2026-12-26', label: 'A' },
    { start: '2026-12-24', end: '2027-01-03', label: 'B' }
  ]);
  assert(m.length === 1, `expected 1 range, got ${m.length}`);
  assert(m[0].start === '2026-12-20' && m[0].end === '2027-01-03', JSON.stringify(m[0]));
});

t('a freeze spanning a month boundary freezes every day in it', () => {
  const st = { ...streakSettings, freezes: [{ start: '2026-12-28', end: '2027-01-04', label: 'Home' }] };
  for (const k of ['2026-12-28', '2026-12-31', '2027-01-01', '2027-01-04']) {
    assert(ST.isFrozen(k, st), `${k} should be frozen`);
  }
  assert(!ST.isFrozen('2026-12-27', st) && !ST.isFrozen('2027-01-05', st), 'edges');
});

t('10 days, 5 frozen, then 1 more gives a streak of 11', () => {
  const hit = { kcal: 3550, protein: 180, fat: 100, carbs: 460 };
  const zero = M.ZERO;
  /* counting: 1-10 Jan. frozen: 11-15 Jan. counting: 16 Jan. today: 17 Jan. */
  const st = { ...streakSettings, freezes: [{ start: '2027-01-11', end: '2027-01-15', label: 'Trip' }] };
  const totals = k => {
    const d = Number(k.slice(8));
    if (k < '2027-01-01' || k > '2027-01-16') return zero;
    return (d <= 10 || d === 16) ? hit : zero;
  };
  const n = ST.currentStreak(totals, st, '2027-01-17');
  assert(n === 11, `expected 11, got ${n}`);
});

t('an unlogged, unfrozen day breaks the streak', () => {
  const hit = { kcal: 3550, protein: 180, fat: 100, carbs: 460 };
  const totals = k => (k === '2027-02-02' ? M.ZERO : hit);
  const n = ST.currentStreak(totals, streakSettings, '2027-02-05');
  assert(n === 2, `expected 2 (3rd and 4th), got ${n}`);
});

t('fat and carbs never break a day', () => {
  const st = streakSettings;
  assert(ST.dayCounts({ kcal: 3200, protein: 160, fat: 250, carbs: 0 }, st), 'should count');
  assert(!ST.dayCounts({ kcal: 3200, protein: 100, fat: 100, carbs: 400 }, st), 'protein short');
  assert(!ST.dayCounts({ kcal: 2000, protein: 160, fat: 100, carbs: 400 }, st), 'kcal short');
});

t('today is never judged, only reported', () => {
  const s = ST.todayStatus({ kcal: 1000, protein: 50, fat: 20, carbs: 100 }, streakSettings);
  assert(!s.counts);
  near(s.kcal, 3550 * 0.9 - 1000, 1, 'kcal remaining');
  near(s.protein, 175 * 0.9 - 50, 1, 'protein remaining');
});

/* ---------- the recommender ------------------------------------------------------ */

g('Recommender (§7)');

t('garnitures rank by kcal, with greens forced to the bottom', () => {
  const ranked = R.rankGarnitures(FOODS.filter(f => f.category === 'garniture'));
  assert(ranked[0].id === 'semolina', `top is ${ranked[0].id}`);
  assert(!ranked[ranked.length - 1].starchy, 'last should not be starchy');
  const firstNonStarchy = ranked.findIndex(r => !r.starchy);
  assert(ranked.slice(firstNonStarchy).every(r => !r.starchy), 'no starchy item after the first green');
});

t('merguez raises the warning and still returns three pairs', () => {
  const warn = R.platWarning(BY_ID.merguez);
  assert(warn && /286/.test(warn) && /12 g protein/.test(warn), warn || 'no warning');
  const need = { kcal: 400, protein: 20, fat: 15, carbs: 60 };
  const pairs = R.recommendPairs(STAPLES, need, { platFat: BY_ID.merguez.macros.fat }, 3);
  assert(pairs.length === 3, `got ${pairs.length} pairs`);
  return warn;
});

t('a fatty plat rules the chocolate and the egg mayonnaise out', () => {
  const pool = R.filterPool(STAPLES, BY_ID.toulouse.macros.fat);
  const ids = pool.map(f => f.id);
  assert(!ids.includes('choc_tart'), 'chocolate tart should be excluded');
  assert(!ids.includes('choc_cake'), 'chocolate cake should be excluded');
  assert(!ids.includes('egg_mayo'), 'egg mayonnaise should be excluded');
  assert(ids.includes('fromage_blanc'), 'fromage blanc should survive');
  return `${BY_ID.toulouse.macros.fat} g fat leaves ${pool.length} of ${STAPLES.length} items`;
});

t('a lean plat lets the chocolate tart back in, and says so', () => {
  const fat = BY_ID.fish_fillet.macros.fat;
  const pool = R.filterPool(STAPLES, fat);
  assert(pool.map(f => f.id).includes('choc_tart'), 'tart should be allowed');
  const need = { kcal: 330, protein: 12, fat: 21, carbs: 40 };
  const note = R.indulgenceNote(fat, pool, need);
  assert(note, 'expected an indulgence note');
  assert(/chocolate tart/i.test(note), note);
  return note;
});

t('the fatty plat gets no indulgence note', () => {
  assert(R.indulgenceNote(BY_ID.toulouse.macros.fat, STAPLES, null) === null);
});

t('a satisfied macro cannot swamp the score', () => {
  /* protein already met (clamped need), so the pair with better carbs should win. */
  const need = { kcal: 300, protein: 2, fat: 20, carbs: 40 };
  const hiP = BY_ID.fromage_blanc, hiC = BY_ID.rice_tuna, low = BY_ID.plain_yogurt;
  const a = R.scorePair(hiP, low, need);
  const b = R.scorePair(hiC, low, need);
  assert(b > a, `carb pair ${b.toFixed(2)} should beat protein pair ${a.toFixed(2)}`);
  return `carbs ${b.toFixed(2)} > protein ${a.toFixed(2)}`;
});

t('a protein gap changes what dinner suggests', () => {
  const plat = BY_ID.turkey_madras;
  const base = M.sum([plat.macros, BY_ID.semolina.macros, BREAD.macros]);
  const mk = consumed => {
    const raw = R.slotNeed('dinner', consumed, ['dinner', 'shake'], TARGETS, SLOT_PLAN);
    const need = M.clampPositive(M.sub(raw, base), 2);
    return R.recommendPairs(STAPLES, need, { platFat: plat.macros.fat }, 3)[0];
  };
  const onTrack = mk({ kcal: 2140, protein: 105, fat: 52, carbs: 295 });
  const shortOnProtein = mk({ kcal: 2140, protein: 62, fat: 52, carbs: 295 });
  const key = p => [p.a.id, p.b.id].sort().join('+');
  assert(key(onTrack) !== key(shortOnProtein),
    `both gave ${key(onTrack)}`);
  assert(shortOnProtein.macros.protein > onTrack.macros.protein,
    'the short day should be offered more protein');
  return `${key(onTrack)} vs ${key(shortOnProtein)}`;
});

t('the gap advice turns a shortfall into food', () => {
  const a = R.gapAdvice({ kcal: 400, protein: 30, fat: 5, carbs: 20 }, ALL_HOME);
  assert(a && /whey/.test(a), a || 'nothing suggested');
  assert(R.gapAdvice({ kcal: 20, protein: 2, fat: 0, carbs: 5 }, ALL_HOME) === null, 'tiny gap is silent');
  return a;
});

/* ---------- the planned day adds up ------------------------------------------------ */

g('The day lands on target (§11)');

t('breakfast lands on its slot plan with one scoop of whey', () => {
  const m = recipeMacros(BREAKFAST_DEFAULT);
  /* Real powder is 73% protein, so this comes in a shade under the 1127/59 plan
     rather than exactly on it. Within a couple of grams is the point. */
  near(m.kcal, 1119, 5, 'kcal'); near(m.protein, 57.4, 1.5, 'protein');
  near(m.carbs, 191, 2, 'carbs');
  const whey = BREAKFAST_DEFAULT.find(r => r.id === 'whey');
  assert(whey.qty === 6, 'breakfast should be one 30 g scoop');
  return `${Math.round(m.kcal)} kcal · ${m.protein.toFixed(1)} P from 30 g of whey`;
});

t('the night shake lands on its slot plan with a scoop and a half', () => {
  const m = recipeMacros(SHAKE_DEFAULT);
  near(m.kcal, 361, 4, 'kcal'); near(m.protein, 42.8, 1, 'protein');
  const whey = SHAKE_DEFAULT.find(r => r.id === 'whey');
  assert(whey.qty === 9, 'the shake should be 45 g, a scoop and a half');
  return `${Math.round(m.kcal)} kcal · ${m.protein.toFixed(1)} P from 45 g of whey`;
});

t('the two fixed recipes together cover their share of the day', () => {
  const m = M.add(recipeMacros(BREAKFAST_DEFAULT), recipeMacros(SHAKE_DEFAULT));
  const plan = M.add(SLOT_PLAN.breakfast, SLOT_PLAN.shake);
  near(m.kcal, plan.kcal, 40, 'kcal against plan');
  near(m.protein, plan.protein, 3, 'protein against plan');
  return `${Math.round(m.kcal)} kcal vs ${plan.kcal} planned, ${
    Math.round(m.protein)} g P vs ${plan.protein}`;
});

t('the whey override reads per 100 g, the way a tub is labelled', () => {
  const base = homeItem('whey', null);
  assert(base.unitGrams === 5, 'whey is counted in 5 g units');
  /* A 100 g label of 400 kcal / 80 g protein must become 20 / 4 per 5 g unit. */
  const over = homeItem('whey', { kcal: 400, protein: 80, fat: 8, carbs: 4 });
  near(over.macros.kcal, 20, 0.01, 'kcal per 5 g');
  near(over.macros.protein, 4, 0.01, 'protein per 5 g');
  assert(!over.estimated, 'a tub you typed in is not an estimate');
  return '400 kcal/100 g -> 20 kcal per 5 g unit';
});

t('breakfast + two recommended trays + shake lands within 5% of 3550 and over 175 g protein', () => {
  const bf = recipeMacros(BREAKFAST_DEFAULT);
  const sh = recipeMacros(SHAKE_DEFAULT);
  let consumed = { macros: bf, slots: ['breakfast'] };

  const lunch = autoTray('lunch', consumed, 'turkey_madras');
  consumed = { macros: M.add(consumed.macros, lunch.macros), slots: ['breakfast', 'lunch'] };

  const dinner = autoTray('dinner', consumed, 'roast_pork');
  const total = M.add(M.add(consumed.macros, dinner.macros), sh);

  const drift = Math.abs(total.kcal - TARGETS.kcal) / TARGETS.kcal;
  assert(drift <= 0.05, `${Math.round(total.kcal)} kcal is ${(drift * 100).toFixed(1)}% off 3550`);
  assert(total.protein >= TARGETS.protein,
    `${Math.round(total.protein)} g protein is under ${TARGETS.protein}`);
  return `${Math.round(total.kcal)} kcal (${(drift * 100).toFixed(1)}% off) · ${Math.round(total.protein)} g P`;
});

/* ---------- the tray builder ---------------------------------------------------- */

g('Tray builder (§8.2)');

t('picking the main fills in the whole tray', () => {
  Tray.start('lunch');
  Tray.onAct('plat', { id: 'turkey_madras' }, null, () => {}, () => {});
  assert(Tray.step() === 2, 'picking the main should go straight to the assembled tray');
  const html = Tray.render();
  assert(/Main/.test(html) && /Side/.test(html) && /Shelf/.test(html), 'all slots should show');
  assert((html.match(/data-act="swap"/g) || []).length >= 3, 'every predicted line must be swappable');
  Tray.stop();
  return 'main, side, two from the shelf, bread';
});

t('the bread roll is on by default and comes off in one tap', () => {
  Tray.start('lunch');
  Tray.onAct('plat', { id: 'turkey_madras' }, null, () => {}, () => {});
  assert(/Bread roll/.test(Tray.render()), 'bread should start on the tray');
  Tray.onAct('bread', {}, null, () => {}, () => {});
  assert(/Left behind/.test(Tray.render()), 'and come off when removed');
  Tray.stop();
  return 'on by default';
});

t('a tray is four taps from the Today screen', () => {
  /* add a meal -> canteen tray -> the main -> confirm. Nothing in between. */
  Tray.start('lunch');                                                    /* taps 1 and 2 */
  Tray.onAct('plat', { id: 'turkey_madras' }, null, () => {}, () => {});  /* tap 3 */
  assert(Tray.step() === 2, 'there should be no intermediate step');
  assert(/data-act="save"/.test(Tray.dock()), 'tap 4 is the confirm button in the dock');
  Tray.stop();
  return '4';
});

/* ---------- data integrity -------------------------------------------------------- */

g('Tray prediction');

const GARN = () => FOODS.filter(f => f.category === 'garniture');
const lunchNeed = () => R.slotNeed('lunch', M.ZERO, SLOT_ORDER, TARGETS, SLOT_PLAN);
const lunchFloors = () => M.floorsFor(SLOT_PLAN.lunch);

function predictFor(id, history) {
  return P.predictTray(BY_ID[id], {
    garniturePool: GARN(), periphPool: STAPLES,
    need: lunchNeed(), floors: lunchFloors(), bread: BREAD, history
  });
}

t('the observed prior matches what CROUS actually serves most', () => {
  const top = Object.entries(OBSERVED_FREQ).sort((a, b) => b[1] - a[1]).slice(0, 3).map(e => e[0]);
  assert(top.includes('rice') && top.includes('semolina'),
    'rice and semolina should lead, got ' + top.join(', '));
  return top.join(' > ');
});

t('cuisine tags come out of the dish name', () => {
  assert(tagsFor(BY_ID.turkey_madras).includes('curry'), 'madras is a curry');
  assert(tagsFor(BY_ID.merguez).includes('maghreb'), 'merguez is maghreb');
  assert(tagsFor(BY_ID.fish_fillet).includes('fish'), 'colin is fish');
  assert(affinity(['curry'], 'rice') === 2, 'curry and rice are classic');
  assert(affinity(['curry'], 'chips') === -1, 'curry and chips are not');
});

t('a curry is given rice or semolina, never chips', () => {
  const p = predictFor('turkey_madras');
  assert(['rice', 'semolina', 'boulgour_pilaf'].includes(p.garniture.id), 'got ' + p.garniture.id);
  return p.garniture.en;
});

t('a grilled or breaded main is given chips or potato', () => {
  const ok = ['chips', 'mash', 'pommes_de_terre_au_four', 'pommes_de_terre_vapeur'];
  for (const id of ['toulouse', 'beef_patty', 'roast_pork', 'cordon_bleu']) {
    const p = predictFor(id);
    assert(ok.includes(p.garniture.id), `${id} got ${p.garniture.id}`);
  }
  return 'chips';
});

t('merguez is given semolina, and still carries its warning', () => {
  const p = predictFor('merguez');
  assert(p.garniture.id === 'semolina', 'got ' + p.garniture.id);
  assert(p.warning && /286/.test(p.warning), 'the warning should survive the prediction');
  return p.garniture.en;
});

t('a full plate is not given a garniture', () => {
  const pizza = FOODS.find(f => f.selfContained && f.family === 'pasta_pizza');
  assert(predictFor(pizza.id).garniture === null, `${pizza.en} should get none`);
  return pizza.en;
});

t('what you actually took beats the pairing table', () => {
  /* Mash is a poor match for a curry, so only history can put it there. */
  const cold = predictFor('turkey_madras').garniture.id;
  assert(cold !== 'mash', 'mash should not be the cold-start answer');
  const warm = predictFor('turkey_madras', id => (id === 'mash' ? 4 : 0)).garniture.id;
  assert(warm === 'mash', 'four confirmations should win, got ' + warm);
  return `${cold} until four confirmations, then mash`;
});

t('a predicted tray lands near what the slot was planned to deliver', () => {
  const out = [];
  for (const id of ['turkey_madras', 'toulouse', 'roast_pork', 'beef_patty', 'merguez', 'fish_fillet']) {
    const p = predictFor(id);
    assert(p.periph.length === 2, `${id} should get two shelf items`);
    const tot = M.sum([BY_ID[id].macros, p.garniture ? p.garniture.macros : M.ZERO,
                       BREAD.macros, ...p.periph.map(i => i.macros)]);
    assert(tot.kcal >= 700 && tot.kcal <= 1250,
      `${id} predicted ${Math.round(tot.kcal)} against a ${SLOT_PLAN.lunch.kcal} plan`);
    out.push(Math.round(tot.kcal));
  }
  return `${Math.min(...out)}–${Math.max(...out)} kcal`;
});

t('the prediction is not the same two shelf items for every main', () => {
  const sets = ['turkey_madras', 'toulouse', 'fish_fillet', 'cordon_bleu']
    .map(id => predictFor(id).periph.map(i => i.id).sort().join(' + '));
  assert(new Set(sets).size > 1, 'every main gave ' + sets[0]);
  return `${new Set(sets).size} distinct answers from 4 mains`;
});

t('a fatty main still keeps the chocolate off the shelf', () => {
  const p = predictFor('toulouse');
  assert(!p.periph.some(i => i.id.startsWith('choc')), 'chocolate got through');
  assert(p.indulgence === null, 'and no note inviting it');
});

t('swapping never offers what is already on the tray', () => {
  const p = predictFor('turkey_madras');
  const keep = [p.periph[0]];
  const list = P.swapCandidates('periph', {
    plat: BY_ID.turkey_madras, periphPool: STAPLES, garniturePool: GARN(),
    need: lunchNeed(), floors: lunchFloors(), keep
  });
  assert(!list.some(i => i.id === keep[0].id), 'the kept item came back as a candidate');
  assert(list.length > 5, 'there should be plenty to choose from');
  return `${list.length} alternatives`;
});

t('swapping the garniture offers the likely ones first', () => {
  const list = P.swapCandidates('garniture', { plat: BY_ID.merguez, garniturePool: GARN() });
  assert(list[0].id === 'semolina', 'got ' + list[0].id);
  return list.slice(0, 3).map(i => i.en).join(', ');
});

g('Data (§13)');

t('every estimated item is marked in the UI, and no other item is', () => {
  const est = FOODS.filter(f => f.estimated);
  assert(est.length >= 3, `expected at least 3 estimated items, got ${est.length}`);
  for (const f of est) {
    assert(/class="est"/.test(tile(f)), `${f.id} does not show its marker`);
  }
  const notEst = FOODS.filter(f => !f.estimated).slice(0, 25);
  for (const f of notEst) {
    assert(!/class="est"/.test(tile(f)), `${f.id} wrongly shows an est. marker`);
  }
  return est.map(f => f.id).join(', ');
});

t('every home item is marked estimated', () => {
  const bad = ALL_HOME.filter(i => !i.estimated).map(i => i.id);
  assert(!bad.length, `not marked: ${bad.join(', ')}`);
  return `${ALL_HOME.length} items`;
});

t('every catalogue item has a portion, a name and four macros', () => {
  const bad = FOODS.filter(f =>
    !f.en || !f.fr || !(f.grams > 0) ||
    ['kcal', 'protein', 'fat', 'carbs'].some(k => typeof f.macros[k] !== 'number' || f.macros[k] < 0));
  assert(!bad.length, `broken: ${bad.slice(0, 5).map(f => f.id).join(', ')}`);
  return `${FOODS.length} items`;
});

t('stated kcal agree with the macros they are made of', () => {
  /* Atwater: 4/9/4. Fibre and rounding move things a little, so this is a loose net.
     CROUS publishes a few rows whose energy does not match their own macros; those are
     flagged estimated at build time, so any unflagged item that fails here is new. */
  const off = FOODS.filter(f => {
    const m = f.macros;
    if (f.estimated || m.kcal < 40) return false;
    const atwater = 4 * m.protein + 9 * m.fat + 4 * m.carbs;
    return Math.abs(atwater - m.kcal) / m.kcal > 0.30;
  });
  assert(!off.length, `${off.length} unflagged items disagree: ${off.slice(0, 6).map(f => f.id).join(', ')}`);
  return `${FOODS.filter(f => !f.estimated).length} unflagged items all within 30%`;
});

t('ids are unique', () => {
  const seen = new Set();
  for (const f of FOODS) {
    assert(!seen.has(f.id), `duplicate id ${f.id}`);
    seen.add(f.id);
  }
  return `${seen.size} unique`;
});

t('the handover ten are all present with their published values', () => {
  const expect = {
    turkey_madras: [203, 30.4, 5.9, 5.9], roast_pork: [222, 25.5, 12.2, 1.2],
    beef_patty: [258, 24, 18, 0], pork_escalope: [256, 22.1, 18.2, 0.8],
    toulouse: [255, 20.8, 19.5, 0.5], chicken_sausage: [218, 19.2, 14.4, 2.5],
    fish_fillet: [151, 18.7, 5.4, 5.4], chicken_leg: [197, 16.1, 14.4, 0],
    cordon_bleu: [301, 15, 18.8, 16.3], merguez: [286, 12, 26, 1]
  };
  for (const [id, [k, p, f, c]] of Object.entries(expect)) {
    const it = BY_ID[id];
    assert(it, `${id} is missing`);
    near(it.macros.kcal, k, 0.5, id + ' kcal');
    near(it.macros.protein, p, 0.05, id + ' protein');
    near(it.macros.fat, f, 0.05, id + ' fat');
    near(it.macros.carbs, c, 0.05, id + ' carbs');
  }
  return '10 of 10';
});

t('the take / ok / skip ranking puts the turkey top and the merguez bottom', () => {
  assert(rankOf(BY_ID.turkey_madras.macros) === 'take', 'turkey should be take');
  assert(rankOf(BY_ID.fish_fillet.macros) === 'take', 'fish should be take');
  assert(rankOf(BY_ID.merguez.macros) === 'skip', 'merguez should be skip');
  assert(rankOf(BY_ID.cordon_bleu.macros) === 'skip', 'cordon bleu should be skip');
});

/* ---------- storage round trip ------------------------------------------------------ */

g('Export and import (§8.7)');

t('export, wipe, import restores every day, entry and setting', () => {
  const key = '2026-09-14';
  S.setSettings({ targets: { kcal: 3333, protein: 171, fat: 99, carbs: 401 } });
  S.addEntry(key, { slot: 'lunch', itemIds: ['turkey_madras', 'semolina', 'bread_roll'],
                    macros: { kcal: 741, protein: 46, fat: 15, carbs: 103 } });
  S.addEntry(key, { slot: 'shake', itemIds: ['whey', 'milk_whole'],
                    macros: { kcal: 352, protein: 42, fat: 12, carbs: 18 } });

  const before = JSON.stringify(S.get());
  const blob = S.exportBlob();

  return blob.text().then(text => {
    S.resetAll();
    assert(Object.keys(S.get().days).length === 0, 'reset should empty the store');
    const n = S.importJSON(text);
    assert(n === Object.keys(JSON.parse(before).days).length, 'day count should match');
    assert(JSON.stringify(S.get()) === before, 'state should be byte-identical after a round trip');
    return `${n} day restored, ${S.entriesFor(key, 'lunch').length + S.entriesFor(key, 'shake').length} entries`;
  });
});

/* ---------- render ------------------------------------------------------------------ */

function paint() {
  const pass = results.filter(r => r.ok).length;
  const fail = results.length - pass;
  const groups = [...new Set(results.map(r => r.group))];
  document.getElementById('summary').innerHTML =
    `<div class="card"><div class="row between">
      <b>${fail ? 'Something is wrong' : 'All good'}</b>
      <span class="num">${pass} passed${fail ? `, <b class="fail">${fail} failed</b>` : ''}</span>
    </div></div>`;
  document.getElementById('out').innerHTML = groups.map(gr => `
    <div class="section-title">${gr}</div>
    ${results.filter(r => r.group === gr).map(r => `
      <div class="row between" style="padding:7px 0;border-bottom:1px solid var(--rule);gap:10px">
        <span class="grow" style="font-size:14px">
          ${r.ok ? '<span class="pass">&#10003;</span>' : '<span class="fail">&#10007;</span>'}
          ${r.name}
          ${r.detail ? `<div class="tiny muted num">${String(r.detail)}</div>` : ''}
        </span>
      </div>`).join('')}`).join('');
}

/* Nothing above wrote to storage (persistence is off), but check it anyway — a test
   page that quietly eats your logbook would be worse than no test page. */
const SNAPSHOT = localStorage.getItem('tray.v1');

Promise.all(results.map(r =>
  r.detail && typeof r.detail.then === 'function'
    ? r.detail.then(d => { r.detail = d; }).catch(e => { r.ok = false; r.detail = e.message; })
    : Promise.resolve()
)).finally(() => {
  g('Safety');
  t('the self-check left your real data alone', () => {
    const now = localStorage.getItem('tray.v1');
    assert(now === SNAPSHOT, 'storage changed while the tests ran');
    return SNAPSHOT === null ? 'nothing stored yet' : `${SNAPSHOT.length} bytes untouched`;
  });
  paint();
});
