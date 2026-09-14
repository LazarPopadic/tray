/* Food from outside the canteen.
   None of this comes from CROUS, so every item here carries the est. marker.
   Macros are per one `unit`; quantities are whole multiples of that unit. */

const mk = (id, en, unit, kcal, protein, fat, carbs, group) =>
  ({ id, en, unit, group, category: 'home', estimated: true,
     macros: { kcal, protein, fat, carbs } });

/* The eight the breakfast blend and the night shake are built from. */
export const INGREDIENTS = [
  mk('oats',          'Oats',                'per 10 g',   38, 1.33, 0.65, 6.75, 'blend'),
  mk('milk_semi',     'Semi-skimmed milk',   'per 100 ml', 47, 3.4,  1.6,  4.8,  'blend'),
  mk('milk_whole',    'Whole milk',          'per 100 ml', 64, 3.3,  3.6,  4.8,  'blend'),
  mk('whey',          'Whey protein',        'per 10 g',   40, 8.0,  0.37, 1.0,  'blend'),
  mk('banana',        'Banana',              '1 medium',  105, 1.3,  0.3,  27.0, 'blend'),
  mk('honey',         'Honey',               'per 10 g',   30, 0.0,  0.0,  8.2,  'blend'),
  mk('raisins',       'Raisins',             'per 10 g',   30, 0.3,  0.05, 8.0,  'blend'),
  mk('peanut_butter', 'Peanut butter',       'per 10 g',   63, 2.5,  5.2,  2.0,  'blend')
];

/* One-tap food for the days the restaurant is shut. */
export const HOME_FOODS = [
  mk('egg',            'Egg',                 '1 large',        78,  6.3,  5.3,  0.6,  'protein'),
  mk('chicken_breast', 'Chicken breast',      'per 100 g',     165, 31.0,  3.6,  0.0,  'protein'),
  mk('tuna_tin',       'Tinned tuna',         '1 tin drained', 128, 28.0,  1.3,  0.0,  'protein'),
  mk('sardines_tin',   'Tinned sardines',     '1 tin drained', 190, 22.0, 11.0,  0.0,  'protein'),
  mk('mince_beef',     'Minced beef, 5%',     'per 100 g',     137, 21.0,  5.0,  0.0,  'protein'),
  mk('ham_slice',      'Ham',                 '1 slice',        45,  7.0,  1.8,  0.5,  'protein'),
  mk('skyr',           'Skyr / fromage blanc 0%', '1 pot 150 g', 97, 17.0, 0.3,  6.0,  'protein'),

  mk('rice_cooked',    'Rice, cooked',        'per 100 g',     130,  2.7,  0.3, 28.0,  'carb'),
  mk('pasta_cooked',   'Pasta, cooked',       'per 100 g',     158,  5.8,  0.9, 31.0,  'carb'),
  mk('potato_boiled',  'Potato, boiled',      'per 100 g',      87,  2.0,  0.1, 20.0,  'carb'),
  mk('couscous_cooked','Couscous, cooked',    'per 100 g',     112,  3.8,  0.2, 23.0,  'carb'),
  mk('baguette_q',     'Baguette, quarter',   '65 g',          175,  5.9,  0.7, 35.0,  'carb'),
  mk('bread_slice',    'Sliced bread',        '1 slice',        93,  3.0,  1.0, 17.0,  'carb'),

  mk('olive_oil',      'Olive oil',           '1 tbsp',        106,  0.0, 12.0,  0.0,  'fat'),
  mk('butter',         'Butter',              'per 10 g',       74,  0.1,  8.2,  0.1,  'fat'),
  mk('emmental',       'Emmental',            'per 30 g',      115,  8.4,  9.0,  0.3,  'fat'),

  mk('apple',          'Apple',               '1 medium',       95,  0.5,  0.3, 25.0,  'fruit'),
  mk('orange_home',    'Orange',              '1 medium',       62,  1.2,  0.2, 15.0,  'fruit'),
  mk('frozen_veg',     'Frozen veg mix',      'per 150 g',      60,  3.0,  0.5,  9.0,  'fruit'),

  mk('kebab',          'Kebab',               '1 sandwich',    750, 40.0, 35.0, 65.0,  'real'),
  mk('pizza_half',     'Pizza, half',         '250 g',         620, 26.0, 24.0, 75.0,  'real'),
  mk('burger',         'Burger',              '1',             500, 25.0, 25.0, 42.0,  'real'),
  mk('croissant',      'Croissant',           '1',             270,  5.5, 15.0, 28.0,  'real'),
  mk('pain_choc',      'Pain au chocolat',    '1',             300,  6.0, 17.0, 32.0,  'real'),
  mk('noodles',        'Instant noodles',     '1 pack',        380,  8.0, 14.0, 54.0,  'real'),
  mk('lasagne_frozen', 'Frozen lasagne',      '400 g tray',    480, 24.0, 20.0, 50.0,  'real'),
  mk('beer',           'Beer',                '33 cl, 5%',     140,  1.5,  0.0, 11.0,  'real'),
  mk('coke',           'Coke',                '33 cl',         139,  0.0,  0.0, 35.0,  'real')
];

export const HOME_GROUPS = [
  ['protein', 'Protein'], ['carb', 'Carbs'], ['fat', 'Fat'],
  ['fruit', 'Fruit & veg'], ['real', 'Real life']
];

export const ALL_HOME = INGREDIENTS.concat(HOME_FOODS);

export function homeItem(id, wheyOverride) {
  const it = ALL_HOME.find(i => i.id === id);
  if (!it) return null;
  if (it.id === 'whey' && wheyOverride) return { ...it, macros: wheyOverride, estimated: false };
  return it;
}
