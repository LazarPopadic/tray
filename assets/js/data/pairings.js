/* Tray prediction model.

   Two layers, and they are different kinds of knowledge — keep them apart.

   OBSERVED_FREQ is real data: how often each garniture actually appeared on a CROUS
   menu, counted across 114 restaurants in 13 academies from the CROUStillant open-data
   API (api.croustillant.menu) on 2026-09-15. It is the prior for "what is usually on
   the counter". Mined once at build time; the app never calls that API.

   AFFINITY is not mined. Per-dish pairings in the menu feeds are far too sparse to
   learn from — only a handful of dishes name their own side — so this is an editorial
   table of standard French institutional pairings, keyed on the cuisine of the main.
   It is a judgement, and it is labelled as one.

   A third layer lives in the user's own history: once a main has been logged with a
   garniture a few times, that outweighs both of these. See lib/predict.js. */

export const OBSERVED_FREQ = {
 "boulgour_pilaf": 28,
 "brocolis_sautes": 8,
 "carottes_vichy_persillees": 33,
 "chips": 30,
 "chou_fleur_persille": 5,
 "courgettes_au_basilic": 17,
 "duo_de_cereales": 6,
 "duo_de_haricots": 29,
 "green_veg": 13,
 "mash": 22,
 "pasta": 24,
 "poelee_de_ratatouille": 20,
 "polenta_au_parmesan": 1,
 "pommes_de_terre_au_four": 9,
 "pommes_de_terre_vapeur": 4,
 "rice": 63,
 "semolina": 48
};

/* Keyword -> cuisine tag, matched against the French dish name. */
const TAG_RULES = [
 [
  "curry",
  [
   "madras",
   "cari",
   "curry",
   "colombo",
   "tikka",
   "dahl",
   "tandoori"
  ]
 ],
 [
  "maghreb",
  [
   "tajine",
   "tagine",
   "merguez",
   "couscous",
   "chermoula",
   "orientale",
   "tunisien",
   "marocain",
   "boulettes d agneau"
  ]
 ],
 [
  "grill",
  [
   "steak",
   "grille",
   "saucisse",
   "chipolata",
   "toulouse",
   "roti",
   "cuisse",
   "pave",
   "wings",
   "fricadelle",
   "brochette"
  ]
 ],
 [
  "breaded",
  [
   "pane",
   "cordon bleu",
   "nuggets",
   "beignets",
   "viennoise",
   "croustillant",
   "samoussa",
   "nems",
   "calmars",
   "fish n chips",
   "chausson",
   "bouchees"
  ]
 ],
 [
  "fish",
  [
   "colin",
   "merlu",
   "poisson",
   "saumon",
   "thon",
   "cabillaud",
   "lieu",
   "crevettes",
   "moules",
   "sardine"
  ]
 ],
 [
  "tomato",
  [
   "provencale",
   "sicilienne",
   "basquaise",
   "nicoise",
   "bolognaise",
   "sauce tomate",
   "napolitaine",
   "moussaka",
   "chili"
  ]
 ],
 [
  "creamy",
  [
   "blanquette",
   "creme",
   "cremeux",
   "champignons",
   "forestiere",
   "madere",
   "normande",
   "oseille",
   "fromager"
  ]
 ],
 [
  "asian",
  [
   "asiatique",
   "aigre douce",
   "wok",
   "soja",
   "coco",
   "reunionais"
  ]
 ],
 [
  "veg",
  [
   "seitan",
   "tofu",
   "lentilles",
   "pois chiches",
   "legumes",
   "butternut",
   "potiron",
   "courgette",
   "aubergine",
   "epinards",
   "galette",
   "clafouti"
  ]
 ],
 [
  "selfmade",
  [
   "pizza",
   "pates",
   "lasagnes",
   "tortellini",
   "raviolis",
   "gnocchis",
   "paella",
   "risotto",
   "blesotto",
   "burritos",
   "mac cheese"
  ]
 ]
];

export const AFFINITY = {
 "asian": {
  "boulgour_pilaf": 0,
  "chips": -1,
  "pasta": 0,
  "rice": 2,
  "semolina": 0
 },
 "breaded": {
  "chips": 2,
  "mash": 1,
  "poelee_de_ratatouille": 1,
  "pommes_de_terre_au_four": 1,
  "rice": 0
 },
 "creamy": {
  "chips": -1,
  "duo_de_cereales": 1,
  "mash": 1,
  "pasta": 2,
  "rice": 2
 },
 "curry": {
  "boulgour_pilaf": 1,
  "chips": -1,
  "pasta": -1,
  "rice": 2,
  "semolina": 2
 },
 "fish": {
  "chips": 1,
  "green_veg": 1,
  "mash": 1,
  "pommes_de_terre_vapeur": 2,
  "rice": 2,
  "semolina": 0
 },
 "grill": {
  "chips": 2,
  "green_veg": 1,
  "mash": 2,
  "pasta": 0,
  "poelee_de_ratatouille": 1,
  "pommes_de_terre_au_four": 2,
  "rice": 0
 },
 "maghreb": {
  "boulgour_pilaf": 2,
  "chips": 0,
  "pasta": -1,
  "rice": 1,
  "semolina": 2
 },
 "tomato": {
  "pasta": 2,
  "polenta_au_parmesan": 2,
  "pommes_de_terre_au_four": 1,
  "rice": 1,
  "semolina": 0
 },
 "veg": {
  "boulgour_pilaf": 2,
  "duo_de_cereales": 2,
  "polenta_au_parmesan": 1,
  "rice": 1,
  "semolina": 1
 }
};

const strip = s => s.normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
  .toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();

/* A dish can carry more than one tag: "tajine de volaille" is maghreb, "poisson pane"
   is both breaded and fish. */
export function tagsFor(item) {
  const n = strip(item.fr + ' ' + item.en);
  const out = TAG_RULES.filter(([, keys]) => keys.some(k => n.includes(k))).map(([t]) => t);
  if (item.family === 'fish' && !out.includes('fish')) out.push('fish');
  if (item.selfContained && !out.includes('selfmade')) out.push('selfmade');
  return out.length ? out : ['grill'];
}

/* -1..2, the best score any of the dish's tags gives this garniture. */
export function affinity(tags, garnitureId) {
  let best = null;
  for (const t of tags) {
    const row = AFFINITY[t];
    if (row && garnitureId in row) best = best === null ? row[garnitureId] : Math.max(best, row[garnitureId]);
  }
  return best === null ? 0 : best;
}
