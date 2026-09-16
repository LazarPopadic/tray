/* Tray — configuration.
   Every number the app reasons with lives here. Nothing is scattered through the code.
   Anything the user can change in Settings is merged over these at boot (see lib/store.js). */

export const TARGETS = { kcal: 3550, protein: 175, fat: 105, carbs: 470 };

/* What each slot is supposed to deliver. The recommender uses these to work out what a
   given meal still owes the day. */
export const SLOT_PLAN = {
  breakfast: { kcal: 1127, protein: 59, fat: 17, carbs: 192 },
  lunch:     { kcal: 1010, protein: 45, fat: 35, carbs: 125 },
  dinner:    { kcal: 1080, protein: 45, fat: 48, carbs: 113 },
  shake:     { kcal:  352, protein: 42, fat: 12, carbs:  18 }
};

export const SLOT_ORDER = ['breakfast', 'lunch', 'dinner', 'shake'];
export const SLOT_LABEL = {
  breakfast: 'Breakfast', lunch: 'Lunch tray', dinner: 'Dinner tray',
  shake: 'Night shake', extra: 'Something else'
};
/* Short forms, for buttons where 'Add to lunch tray' reads worse than 'Add to lunch'. */
export const SLOT_SHORT = {
  breakfast: 'breakfast', lunch: 'lunch', dinner: 'dinner',
  shake: 'the shake', extra: 'extras'
};

export const SLOT_TIME = { breakfast: 8, lunch: 12, dinner: 19, shake: 22.5 };

/* Périphérique pair scoring. */
/* Périphérique pair scoring. kcalShort is not in the handover: without it the scorer
   happily returns a 150 kcal pair that leaves the meal 200 short, because protein is
   weighted 2.0 and two lentil salads max it out cheaply. Undershooting calories is the
   characteristic way a lean bulk fails, so it costs something — symmetric to the fat
   penalty, which punishes overshooting the other direction. */
export const WEIGHTS = {
  protein: 2.0, carbs: 1.0, kcal: 0.8,
  fatPenalty: 2.5, fatHeadroom: 0.45,
  kcalShort: 1.6
};

/* A day counts toward the streak if it reaches this fraction of kcal AND protein. */
export const STREAK = { kcalFactor: 0.90, proteinFactor: 0.90 };

/* Anything logged before 04:00 belongs to the previous day. A late night is still last night. */
export const DAY_ROLLOVER_HOUR = 4;

/* Whole-tray portion honesty. CROUS serving variance is roughly +/-15%. */
export const PORTION_SCALES = [
  { id: 'small',    label: 'Small',    factor: 0.85 },
  { id: 'normal',   label: 'Normal',   factor: 1.00 },
  { id: 'generous', label: 'Generous', factor: 1.15 }
];

/* Protein per kcal decides the take / ok / skip colour on every dish.
   Turkey madras lands at 0.150 and merguez at 0.042, which is the ranking the
   handover argues for in prose. */
export const RANK_CUTOFFS = { take: 0.10, ok: 0.06 };

export function rankOf(m) {
  const d = m.kcal > 0 ? m.protein / m.kcal : 0;
  return d >= RANK_CUTOFFS.take ? 'take' : d >= RANK_CUTOFFS.ok ? 'ok' : 'skip';
}

/* Default home recipes. Quantities are in each ingredient's own unit (see data/home.js).
   Whey is in 5 g units, so 6 = one 30 g MyProtein scoop and 9 = a scoop and a half.
   These land breakfast on ~57 g protein and the shake on ~43 g, against a plan of
   59 and 42 — the real powder is 73% protein, not the 80% the app first assumed. */
export const BREAKFAST_DEFAULT = [
  { id: 'milk_semi', qty: 5 },   /* 500 ml */
  { id: 'oats',      qty: 12 },  /* 120 g  */
  { id: 'whey',      qty: 6 },   /*  30 g — one level scoop */
  { id: 'banana',    qty: 1 },
  { id: 'honey',     qty: 3 },   /*  30 g  */
  { id: 'raisins',   qty: 4 }    /*  40 g  */
];

export const SHAKE_DEFAULT = [
  { id: 'whey',       qty: 9 },  /*  45 g — a scoop and a half */
  { id: 'milk_whole', qty: 3 }   /* 300 ml */
];

/* Shown, collapsed, in Settings. This is where 3550 came from. */
export const MAINTENANCE = {
  rows: [
    ['BMR',                 '2080',    'Mifflin–St Jeor, 93 kg / 200 cm / 21 M'],
    ['Walking',             '353',     '7.6 km at 3.5 METs, net of resting'],
    ['Stairs',              '33',      '11 floors x 3 m, 22% mechanical efficiency'],
    ['Other NEAT',          '180',     'standing, campus, cooking'],
    ['Exercise (averaged)', '252–328', '1 x 6 MET session + 2–3 x 4.5 MET sessions, plus EPOC'],
    ['TEF',                 '~325',    '10% of intake']
  ],
  total: '3220–3305',
  note: 'Eating 3550 puts you 245–330 kcal over maintenance, which is 0.22–0.30 kg a week. ' +
        'Protein is 1.9 g/kg. Fat and carbs are soft guides — kcal and protein are the two that drive the streak.'
};

export const ABOUT =
  'Macros come from the CROUS Montpellier-Occitanie published nutrition database, per portion as ' +
  'served. Grenoble and Toulouse publish databases too, but per 100 g with no portion weights, so ' +
  'they cannot be used here; Versailles, which covers your campus, publishes no nutrition data at all. Portions are ' +
  'standardised network-wide by GEM-RCN grammages, so Montpellier’s figures transfer. ' +
  'Real serving variance is around ±15% depending on who is holding the ladle. ' +
  'Items marked est. are either standard reference values rather than CROUS figures, or CROUS rows ' +
  'whose stated energy does not match their own macros. ' +
  'Which garniture the app expects beside a given main comes from two places: how often each ' +
  'one actually appeared on a CROUS menu, counted across 114 restaurants in 13 academies from ' +
  'the CROUStillant open-data API, and a table of standard pairings that is an editorial ' +
  'judgement rather than measured. Once you have logged the same main a few times, what you ' +
  'actually took beats both. ' +
  'None of this is medical advice and it is not as precise as it looks.';
