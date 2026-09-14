/* Macro arithmetic. Pure, no state. */

export const ZERO = { kcal: 0, protein: 0, fat: 0, carbs: 0 };
export const KEYS = ['kcal', 'protein', 'fat', 'carbs'];

export function add(a, b) {
  return { kcal: a.kcal + b.kcal, protein: a.protein + b.protein,
           fat: a.fat + b.fat, carbs: a.carbs + b.carbs };
}

export function sum(list) {
  return list.reduce((acc, m) => add(acc, m), ZERO);
}

export function scale(m, f) {
  return { kcal: m.kcal * f, protein: m.protein * f, fat: m.fat * f, carbs: m.carbs * f };
}

export function sub(a, b) {
  return { kcal: a.kcal - b.kcal, protein: a.protein - b.protein,
           fat: a.fat - b.fat, carbs: a.carbs - b.carbs };
}

/* Displayed macros are always whole numbers. The data does not deserve decimals. */
export function round(m) {
  return { kcal: Math.round(m.kcal), protein: Math.round(m.protein),
           fat: Math.round(m.fat), carbs: Math.round(m.carbs) };
}

/* Keep every macro at or above a floor so the pair scorer stays stable when a slot has
   already been overshot. The floor can be per-macro: flooring protein at 2 g is what
   makes an already-satisfied slot stop caring about protein at all, which is how you
   end up recommending two puddings. Floor it at a fraction of what the slot was meant
   to deliver instead, and protein keeps its say. */
export function clampPositive(m, floor = 1) {
  const f = typeof floor === 'number'
    ? { kcal: floor, protein: floor, fat: floor, carbs: floor }
    : floor;
  return { kcal: Math.max(m.kcal, f.kcal), protein: Math.max(m.protein, f.protein),
           fat: Math.max(m.fat, f.fat), carbs: Math.max(m.carbs, f.carbs) };
}

/* A sensible per-macro floor for one slot: a quarter of what it was planned to bring. */
export function floorsFor(plan) {
  return { kcal: Math.max(40, plan.kcal * 0.15), protein: Math.max(6, plan.protein * 0.25),
           fat: Math.max(4, plan.fat * 0.15), carbs: Math.max(10, plan.carbs * 0.15) };
}

export function isZero(m) {
  return KEYS.every(k => Math.abs(m[k]) < 0.0001);
}
