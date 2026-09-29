// slayerKinds.ts — WHICH MOBS A SLAYER ACHIEVEMENT COUNTS. The one hand-authored table.
//
// A Slayer achievement's requirement line is a list of the game's own words for kinds of
// creature: `Gargoyles`, `Bats and Werebats.`, `Kirins, Nightmares, Pegasus, and Unicorns.` The
// mob catalog knows none of those words. What it can be joined to is the wiki mob page's `|race`
// field (`data/eqlegends/mobRaces.json`), which is a THIRD vocabulary again: `Giant Rats`,
// `Skeleton New`, `Old Froglok Ghoul`, `Qeynos Citizen`. There is no string rule between the two
// (`Sporalis` is the wiki's `Fungusman`, `Holgresh` its `Flying Monkey`), so the join is written
// down, one term at a time (world-model law 12: a rename is knowledge, never a matcher).
//
// EACH TERM CARRIES UP TO THREE THINGS:
//   races  the wiki race values it counts, in `raceKey` form;
//   names  words a mob's NAME states the kind with, used only for a mob the index has no usable
//          race for. A match read off a name is an estimate and every consumer labels it so;
//   of     other terms this one is the sum of (`Mystical Horses` is the four horses).
// A term with none of them is a creature this table makes no claim about, which is most of what
// came with later expansions (Shissar, Hynids, Riftseekers). It is listed anyway: a term that is
// MISSING from the table is a word the game printed that nobody has looked at, and
// `tests/slayerKinds.test.mts` fails on one.
//
// WHAT IS MEASURED, against the owner's log (2026-08-12 to 2026-09-28, 16,670 kills) and the
// counters of the dump written the same evening:
//   - THE GAME COUNTS BY MODEL, AND A GHOST IS ITS RACE. `Dwarves 26/100`: the log holds 25 kills
//     of the wiki's `Ghost Dwarf` and one of `Dwarf`. `Erudites` completed at 100 with eight
//     living Erudites in the log and 285 of `Erudite Ghost`.
//   - `Clockwork ... 4/5000` is exactly the four kills whose NAME says clockwork (two rebel, one
//     rogue, one runaway), whatever race their pages state (`Giant Spider`, `Clockwork Gnome`).
//     So that one term reads the name first (`always`).
//   - `Pesticide` less `Rats!` is 99, and `Bats and Werebats.` stands at 99/100.
//   - Gargoyles, golems and scarecrows: 1,138 kills in the log against `It's Alive!` at 1,147.
// WHAT IS ASSUMED, on the plain reading and nothing more: that a city's citizens and guards
// (`Qeynos Citizen`, `Freeport Guards`, `Felguard`, `Fayguard`) count as the race they are drawn
// as, and that the ghosts above also count as `Ghosts`.

/** One term of a requirement line. See the header for what each field claims. */
export interface SlayerTerm {
  races?: readonly string[]
  names?: readonly string[]
  of?: readonly string[]
  /** the name is read even when the page states a race (the clockworks, measured above) */
  always?: true
}

/** A wiki race value or a term, folded for comparison: case, hyphens and runs of space. */
export function raceKey(raw: string): string {
  return raw.toLowerCase().replace(/[\s-]+/g, ' ').trim()
}

const PLAYABLE = [
  'humans',
  'barbarians',
  'erudites',
  'wood elves',
  'high elves',
  'dark elves',
  'half elves',
  'dwarves',
  'halflings',
  'gnomes',
  'trolls',
  'ogres',
  'iksars',
  'kerrans',
  'frogloks',
  'vah shir',
  'drakkin'
] as const

/** Terms this table has looked at and makes no claim about. */
const NO_CLAIM = [
  'banshees',
  'barrels',
  'birds',
  'blood ravens',
  'bones',
  'boxes',
  'brellian constructs',
  'bubonians',
  'butterflies',
  'clocks',
  'coffins',
  'corathus beasts',
  'crystal creatures',
  'drakkin',
  'elddar elves',
  'fiends',
  'fire elves',
  'flies',
  'gingerbread men',
  'grekens',
  'guardians',
  'guktans',
  'hraquis',
  'hynids',
  'insects',
  'kirins',
  'krakens',
  'kylong iksars of veksar',
  'lesser dragons',
  'lightcrawlers',
  'luggalds',
  'malarians',
  'marionettes',
  'mephits',
  'molerats',
  'muddites',
  'nagas',
  'nightmare goblins',
  'nilborien',
  'nymphs',
  'planar manifestations',
  'riftseekers',
  'rotdogs',
  'sand elves',
  'scaled wolves',
  'scarlet cheetahs',
  'scrykin',
  "shik'nars",
  'shiliskins',
  'shissar',
  'sokokar',
  'sonic wolves',
  'spirits',
  'stonegrabbers',
  'stormriders',
  'swinetors',
  'tables',
  'ticks',
  'topiary lions',
  'tormentors',
  'traps',
  'tsetsians',
  'underbulks',
  'ursarachnids',
  'vacuum worms',
  'vah shir',
  'vases',
  'vegerogs',
  'webs',
  'wereorcs',
  'wetfang minnows',
  'witherans',
  'worgs',
  'wrulons',
  'xulous'
] as const

const CLAIMS: Record<string, SlayerTerm> = {
  // ---- the playable races, with the citizens and guards drawn as them
  humans: {
    races: ['human', 'qeynos citizen', 'freeport guards', 'highpass citizen', 'human beggar', 'hman']
  },
  barbarians: { races: ['barbarian', 'halas citizen'], names: ['barbarian'] },
  erudites: {
    races: ['erudite', 'erudin citizen', 'paineel citizen', 'erudite ghost'],
    names: ['erudite']
  },
  'wood elves': { races: ['wood elf', 'fayguard'], names: ['wood elf'] },
  'high elves': {
    races: ['high elf', 'felguard', 'female high elf', 'high elf male', 'male high elf'],
    names: ['high elf']
  },
  'dark elves': {
    races: ['dark elf', 'neriak citizen', 'dark elf guard'],
    names: ['dark elf', "teir'dal"]
  },
  'half elves': { races: ['half elf'], names: ['half elf'] },
  dwarves: { races: ['dwarf', 'kaladim citizen', 'ghost dwarf', 'female dwarf'], names: ['dwarf'] },
  halflings: { races: ['halfling', 'rivervale citizen'], names: ['halfling'] },
  gnomes: { races: ['gnome'], names: ['gnome'] },
  trolls: { races: ['troll', 'grobb citizen'], names: ['troll'] },
  ogres: { races: ['ogre', 'oggok citizen'], names: ['ogre'] },
  iksars: { races: ['iksar', 'iksar citizen'], names: ['iksar'] },
  kerrans: { races: ['kerra', 'kerran'], names: ['kerran', 'kerra'] },
  kerran: { of: ['kerrans'] },
  frogloks: {
    races: ['froglok', 'old froglok', 'kunark froglok', 'froglock'],
    names: ['froglok']
  },
  tadpoles: { races: ['old froglok tadpole'], names: ['tadpole', 'froglok tad'] },
  frogs: { names: ['frog'] },
  coldain: { races: ['coldain'], names: ['coldain'] },
  'the playable races': { of: PLAYABLE },

  // ---- the dead
  skeletons: {
    races: [
      'skeleton',
      'skeleton new',
      'skeleton classic',
      'iksar skeleton',
      'sarnak skeleton',
      'skeleton guard'
    ],
    names: ['skeleton', 'skeletal']
  },
  zombies: { races: ['zombie'], names: ['zombie'] },
  ghouls: { races: ['ghoul', 'old froglok ghoul', 'froglok ghoul'], names: ['ghoul'] },
  mummies: { races: ['mummy'], names: ['mummy'] },
  ghosts: {
    races: [
      'erudite ghost',
      'ghost dwarf',
      'spectral iksar',
      'spectral sarnak',
      'ghost',
      'iksar ghost',
      'sarnak ghost'
    ],
    names: ['ghost']
  },
  spectres: {
    races: ['spectre', 'cold spectre', 'spectre (undead)'],
    names: ['spectre', 'specter']
  },
  vampires: { races: ['vampire', 'elf vampire'], names: ['vampire'] },
  shades: { names: ['shade'] },
  wisps: { races: ["will o' wisp"], names: ['wisp', 'willowisp'] },
  hags: { races: ['hag'], names: ['hag'] },
  'animated armors': { races: ['enchanted armor'] },
  'animated hands': {
    races: ['reanimated hand', 'hand', 'iksar hand'],
    names: ['reanimated hand']
  },

  // ---- vermin and bugs
  rats: { races: ['giant rats', 'giant rat', 'rat'], names: ['rat'] },
  rabbits: { races: ['snow bunny'], names: ['rabbit', 'bunny'] },
  bats: { races: ['giant bat', 'bat'], names: ['bat'] },
  werebats: { races: ['werebat'], names: ['werebat'] },
  armadillos: { races: ['armadillo'], names: ['armadillo'] },
  skunks: { races: ['skunk'], names: ['skunk'] },
  burynai: { races: ['burynai', 'burnyai'], names: ['burynai'] },
  ratmen: { races: ['ratman'], names: ['ratman'] },
  beetles: { races: ['beetle', 'fire beetle'], names: ['beetle', 'scarab'] },
  cliknars: { names: ['cliknar'] },
  drachnids: { races: ['dracnid', 'drachnid'], names: ['drachnid'] },
  leeches: { races: ['leech'], names: ['leech'] },
  mosquitoes: { races: ['mosquito'], names: ['mosquito'] },
  wasps: { races: ['wasp'], names: ['wasp'] },
  spiders: { races: ['giant spider', 'spider'], names: ['spider', 'tarantula'] },
  scorpions: { races: ['scorpion', 'iksar scorpion'], names: ['scorpion'] },

  // ---- reptiles
  alligators: { races: ['alligator'], names: ['alligator', 'caiman'] },
  crocodiles: { names: ['crocodile', 'croc'] },
  basilisks: { races: ['basilisk'], names: ['basilisk'] },
  'lizard men': { races: ['lizard man', 'lizardman', 'lizard'], names: ['lizardman', 'lizard'] },
  sarnaks: { races: ['sarnak'], names: ['sarnak'] },
  snakes: {
    races: ['giant snake', 'snake'],
    names: ['snake', 'cobra', 'asp', 'rattlesnake', 'moccasin', 'viper']
  },
  turtles: { races: ['sea turtle'], names: ['turtle'] },

  // ---- dogs and cats
  wolves: { races: ['wolf', 'dire wolf'], names: ['wolf'] },
  werewolves: { races: ['werewolf', 'were wolf'], names: ['werewolf'] },
  drolvargs: { names: ['drolvarg'], always: true },
  chokidais: { races: ['chokidai'], names: ['chokidai'], always: true },
  lions: { races: ['lion'], names: ['lion', 'lioness'] },
  pumas: { races: ['puma', 'leopard'], names: ['puma', 'panther'] },
  tigers: { races: ['tiger'], names: ['tiger'] },
  sabertooths: { races: ['sabertooth cat'], names: ['sabertooth'] },
  cats: { names: ['cat'] },

  // ---- beasts
  gorillas: { races: ['gorilla'], names: ['gorilla', 'ape'] },
  apes: { of: ['gorillas'] },
  holgresh: { races: ['flying monkey'], names: ['holgresh'] },
  yetis: { races: ['yeti'], names: ['yeti'] },
  bears: { races: ['bear', 'polar bear'], names: ['bear', 'grizzly'] },
  kodiaks: { races: ['tundra kodiak'], names: ['kodiak'], always: true },
  owlbears: { names: ['owlbear'] },
  pandas: { races: ['giant panda'], names: ['panda'], always: true },
  aviaks: { races: ['aviak'], names: ['aviak'] },
  cockatrices: { races: ['cockatrice'], names: ['cockatrice'] },
  hawks: { names: ['hawk'] },
  parrots: { names: ['parrot'] },
  boars: { names: ['boar'] },
  mammoths: { races: ['mammoth', 'mammoth (monster race)'], names: ['mammoth'] },
  elephants: { races: ['elephant'], names: ['elephant'] },
  rhinos: { races: ['rhino'], names: ['rhino'] },
  othmirs: { races: ['ottermen'], names: ['othmir'] },
  'sea mammals': { races: ['walrus'], names: ['walrus', 'manatee'] },
  nightmares: { names: ['nightmare'] },
  pegasus: { races: ['pegasus'], names: ['pegasus'] },
  unicorns: { races: ['unicorn'], names: ['unicorn'] },
  'mystical horses': { of: ['kirins', 'nightmares', 'pegasus', 'unicorns'] },

  // ---- water
  crabs: { names: ['crab'] },
  fishes: { races: ['fish', 'kunark fish', 'animal (fish)'], names: ['fish', 'barracuda'] },
  kedge: { races: ['kedge'] },
  mermaids: { races: ['mermaid'], names: ['mermaid'] },
  piranhas: { races: ['piranha'], names: ['piranha'] },
  seahorses: { races: ['sea horse', 'seahorse'], names: ['seahorse'] },
  sharks: { races: ['shark'], names: ['shark'] },
  sirens: { races: ['siren'], names: ['siren'] },
  swordfishes: { races: ['swordfish'], names: ['swordfish'] },

  // ---- the tribes
  orcs: { races: ['orc'], names: ['orc'] },
  goblins: {
    races: ['goblin', 'kunark goblin', 'fire goblin', 'ice goblin', 'bloodgills'],
    names: ['goblin']
  },
  gnolls: { races: ['gnoll'], names: ['gnoll'] },
  kobolds: { races: ['kobold'], names: ['kobold'] },
  giants: {
    races: [
      'giant',
      'storm giant',
      'frost giant',
      'forest giant',
      'giant/cyclops',
      'cyclops',
      'kromrif'
    ],
    names: ['(?:hill|ice|fire|frost|storm|forest|sand|sea) giant', 'cyclops']
  },
  minotaurs: { races: ['minotaur'], names: ['minotaur'] },
  tizmak: { names: ['tizmak'], always: true },
  centaurs: { races: ['centaur'], names: ['centaur'] },
  satyr: { races: ['faun'], names: ['satyr', 'faun'] },

  // ---- the fey
  bixies: { races: ['bixie'], names: ['bixie'] },
  brownies: { races: ['brownie'], names: ['brownie'] },
  fairies: { races: ['fairy'], names: ['fairy', 'faerie'] },
  pixies: { races: ['pixie'], names: ['pixie'] },
  dryads: { names: ['dryad'] },
  griffins: { races: ['griffin'], names: ['griffin', 'griffon', 'griffenne'] },
  griffons: { of: ['griffins'] },
  griffennes: { of: ['griffins'] },
  manticores: { races: ['manticore'], names: ['manticore'] },
  sphinxes: { races: ['sphinx'], names: ['sphinx'] },

  // ---- made things
  gargoyles: { races: ['gargoyle'], names: ['gargoyle'] },
  golems: {
    races: ['golem', 'iksar golem', 'sarnak golem', 'rock golem', 'velium golem', 'steel golem'],
    names: ['golem']
  },
  scarecrows: { races: ['scarecrow'], names: ['scarecrow'] },
  totems: { races: ['totem'], names: ['totem'] },
  statues: { names: ['statue'] },
  mimics: { races: ['mimic'], names: ['mimic'] },
  chests: { names: ['chest'] },
  clockwork: {
    races: ['clockwork gnome', 'clockwork rat', 'clockwork', 'clockwork spider'],
    names: ['clockwork'],
    always: true
  },

  // ---- growing things
  'living plants': { races: ['man eating plant', 'succulent', 'mantrap'] },
  treants: { races: ['treant'], names: ['treant'] },
  sporalis: { races: ['fungusman'], names: ['fungus', 'sporali', 'mushroom'] },
  shriekers: { races: ['shrieker'], names: ['shrieker'] },

  // ---- dragonkind
  'true dragons': {
    races: ['dragon', 'velious dragons', 'ice dragon', 'lava dragon', 'black and white dragons']
  },
  dragons: { of: ['true dragons', 'lesser dragons'] },
  dracoliches: { races: ['dragon skeleton'], names: ['dracoliche'] },
  'water dragons': { races: ['water dragon', 'sea dragon'] },
  drakes: { races: ['drake'], names: ['drake'] },
  drixies: { races: ['drixie'], names: ['drixie'] },
  'fay drakes': { races: ['fay drake'] },
  wurms: { races: ['wurm'], names: ['wurm'] },
  wyverns: { races: ['wyvern'], names: ['wyvern'] },
  raptors: { races: ['raptor'], names: ['raptor'] },
  dinosaurs: { races: ['brontotherium'] },

  // ---- the elements and the planes
  dervishes: { races: ['dervish', 'snow dervish'], names: ['(?:sand|dust|snow) dervish'] },
  efreetis: { races: ['efreeti'], names: ['efreeti'] },
  djinns: { races: ['djinn'], names: ['djinn', 'djinni'] },
  elementals: {
    races: ['elemental', 'water elemental', 'earth elemental', 'fire elemental', 'air elemental'],
    names: ['elemental']
  },
  imps: { races: ['imp', 'fire imp'], names: ['imp'] },
  wraiths: { names: ['wraith'] },
  amygdalans: { races: ['denizen'], names: ['amygdalan'], always: true },
  'gelatinous cubes': { races: ['gelatinous cube'], names: ['cube'] },
  cubes: { of: ['gelatinous cubes'] },
  'evil eyes': { races: ['evil eye'], names: ['evil eye'] },
  eyes: { of: ['evil eyes'] },
  goos: { races: ['goo'], names: ['goo'] },
  gorgons: { races: ['gorgon'], names: ['gorgon'] },
  harpies: { races: ['harpie'], names: ['harpy', 'harpie'] },
  'tentacle terrors': { races: ['tentacle'], names: ['tentacle terror'] },
  'the avatar of a deity': {
    races: [
      'cazic thule',
      'innoruuk',
      'rallos zek',
      'tunare (race)',
      'bristlebane',
      'erollisi',
      'solusek ro',
      'tribunal'
    ]
  }
}

const TERMS = new Map<string, SlayerTerm>([
  ...NO_CLAIM.map((term): [string, SlayerTerm] => [term, {}]),
  ...Object.entries(CLAIMS)
])

/** Every term the table has looked at, claim or no claim, by its `raceKey`. */
export const SLAYER_TERMS: ReadonlyMap<string, SlayerTerm> = TERMS

/** What the game prints ahead of the nine clockwork models, which are one term here. */
const CLOCKWORK_PREFIX = 'clockwork:'

/**
 * A requirement line as its terms, each in `raceKey` form. The separators are the comma and the
 * word `and`; the closing period the game prints on some lines and not on others is dropped.
 */
export function labelTerms(label: string): string[] {
  const text = raceKey(label.replace(/\.\s*$/, ''))
  if (text.startsWith(CLOCKWORK_PREFIX)) return ['clockwork']
  const terms = text
    .split(/\s*,\s*(?:and\s+)?|\s+and\s+/)
    .map((t) => t.trim())
    .filter((t) => t !== '')
  return [...new Set(terms)]
}

/** A term and everything it is the sum of, each once. Unknown terms resolve to nothing. */
export function resolveTerm(term: string, seen = new Set<string>()): string[] {
  if (seen.has(term)) return []
  seen.add(term)
  const entry = SLAYER_TERMS.get(term)
  if (entry === undefined) return []
  return [term, ...(entry.of ?? []).flatMap((part) => resolveTerm(part, seen))]
}
