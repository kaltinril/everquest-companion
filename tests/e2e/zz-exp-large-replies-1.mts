// zz-exp-large-replies-1.mts: THROWAWAY. Builds a synthetic EverQuest log from the game's real line
// shapes, stamped the way play advances. Usage:
//   node --import tsx tests/e2e/zz-exp-large-replies-1.mts <outFile> key=value ...
// Keys (all optional):
//   fights=N        how many fights
//   lootPer=N       loot lines after each kill (self loot: kept / sold / currency mix)
//   minLines,maxLines  combat lines per fight (melee, miss, spell, heal, pet, incoming)
//   chatPer=N       chat lines in the gap after each fight
//   zoneEvery=N     a zone line every N fights
//   mobs=N          distinct mob names
//   items=N         distinct item names
//   endAgoMin=N     the last line is stamped this many minutes before now
// Prints one JSON line: lines, bytes, fights, loots, days spanned.
import { closeSync, mkdirSync, openSync, writeSync } from 'node:fs'
import { dirname } from 'node:path'
import { stamp } from './logFixture.mjs'

const [out, ...rest] = process.argv.slice(2)
if (!out) throw new Error('usage: <outFile> key=value ...')
const arg = new Map(rest.map((kv) => kv.split('=') as [string, string]))
const num = (k: string, d: number): number => (arg.has(k) ? Number(arg.get(k)) : d)

const FIGHTS = num('fights', 1000)
const LOOT_PER = num('lootPer', 1)
const MIN_LINES = num('minLines', 40)
const MAX_LINES = num('maxLines', 400)
const CHAT_PER = num('chatPer', 1)
const ZONE_EVERY = num('zoneEvery', 25)
const MOBS = num('mobs', 300)
const ITEMS = num('items', 2000)
const END_AGO_MIN = num('endAgoMin', 30)

// A small deterministic generator, so a log can be rebuilt exactly.
let seed = num('seed', 12345) >>> 0
const rnd = (): number => {
  seed = (seed * 1664525 + 1013904223) >>> 0
  return seed / 4294967296
}
const int = (lo: number, hi: number): number => lo + Math.floor(rnd() * (hi - lo + 1))
const pick = <T,>(a: readonly T[]): T => a[Math.floor(rnd() * a.length)] as T

const ADJ = ['fire', 'ice', 'greater', 'lesser', 'decaying', 'frenzied', 'ancient', 'lava', 'plague', 'shadowed', 'tundra', 'dread', 'spectral', 'rabid', 'stone', 'storm', 'bog', 'ashen', 'gilded', 'feral']
const NOUN = ['giant warrior', 'kobold shaman', 'skeleton', 'duct crawler', 'goblin whelp', 'froglok knight', 'gorgon', 'harpie', 'drake', 'orc centurion', 'wolf', 'basilisk', 'imp protector', 'bat', 'spider', 'ghoul', 'banshee', 'lizard crusader', 'mummy', 'golem']
const mobName = (i: number): string => {
  const a = ADJ[i % ADJ.length] as string
  const n = NOUN[Math.floor(i / ADJ.length) % NOUN.length] as string
  const tier = Math.floor(i / (ADJ.length * NOUN.length))
  const art = /^[aeiou]/.test(a) ? 'an' : 'a'
  return tier === 0 ? `${art} ${a} ${n}` : `${art} ${a} ${n} ${['elder', 'lord', 'matron', 'runt', 'scout'][tier % 5]}`
}
const MOB_NAMES = Array.from({ length: MOBS }, (_, i) => mobName(i))
const ITEM_A = ['Rusty', 'Fine Steel', 'Polished', 'Cracked', 'Runed', 'Blackened', 'Gleaming', 'Tattered', 'Woven', 'Ornate', 'Silvered', 'Bloodstained', 'Etched', 'Crude', 'Ancient', 'Shimmering', 'Weathered', 'Forged', 'Gilded', 'Mithril']
const ITEM_B = ['Dagger', 'Long Sword', 'Breastplate', 'Ring', 'Earring', 'Mask', 'Bracer', 'Greaves', 'Cloak', 'Idol', 'Staff', 'Shield', 'Gem', 'Scales', 'Pelt', 'Fang', 'Totem', 'Sash', 'Mantle', 'Tome']
const ITEM_C = ['', ' of the Wolf', ' of Flame', ' of Frost', ' of the Underking', ' of Warding']
const ITEM_NAMES = Array.from({ length: ITEMS }, (_, i) => `${ITEM_A[i % 20] as string} ${ITEM_B[Math.floor(i / 20) % 20] as string}${ITEM_C[Math.floor(i / 400) % 6] as string}${i >= 2400 ? ` ${String(Math.floor(i / 2400))}` : ''}`)
const ZONES = ["Nagafen's Lair", 'The Plane of Hate', 'Lower Guk', 'Upper Guk', 'The Permafrost Caverns', 'Castle Mistmoore', 'The Estate of Unrest', 'Kedge Keep', 'The Plane of Fear', 'The Plane of Sky', 'Befallen', 'Blackburrow', 'The Commonlands', 'East Karana', 'The Lavastorm Mountains', 'Najena', 'The Ocean of Tears', 'Qeynos Hills', 'Runnyeye Citadel', "Solusek's Eye", 'The Temple of Solusek Ro', 'The Feerrott', 'Innothule Swamp', 'The Rathe Mountains', 'Lake Rathetear', 'The Nektulos Forest', 'The Lesser Faydark', 'The Greater Faydark', 'Crushbone', 'Kaladim']
const VERBS = ['slash', 'crush', 'pierce', 'hit', 'kick', 'bash', 'claw', 'strike']
const VERBS3 = ['slashes', 'crushes', 'pierces', 'hits', 'kicks', 'bashes', 'claws', 'bites']
const SPELLS = ['Smiting Strike', 'Lifetap Strike', 'Ice Comet', 'Conflagration', 'Lightning Bolt', 'Ignite Bones']
const HEALS = ['Lifetap Strike', 'Greater Healing', 'Superior Healing', 'Light Healing']
const FRIENDS = ['Chakito', 'Gobab', 'Zeldrath', 'Vebn', 'Raretricky']
const CHAT = ["inc", 'ready', 'oom', 'pulling', 'nice', 'one sec', 'afk a minute', 'camp check', 'need a rez', 'moving to the next room']
const coin = (): string => `${String(int(0, 12))} platinum, ${String(int(0, 9))} gold, ${String(int(0, 9))} silver and ${String(int(0, 9))} copper`

// Stamps advance like play: plan the whole span first, then count back from the end.
interface Plan { mob: number; dur: number; lines: number; gap: number }
const plan: Plan[] = []
let total = 0
for (let f = 0; f < FIGHTS; f++) {
  const dur = int(20, 180)
  const gap = int(5, 60)
  plan.push({ mob: int(0, MOBS - 1), dur, lines: int(MIN_LINES, MAX_LINES), gap })
  total += dur + gap
}
const end = Date.now() - END_AGO_MIN * 60_000
let t = end - total * 1000 - 5000

mkdirSync(dirname(out), { recursive: true })
const fd = openSync(out, 'w')
let buf: string[] = []
let held = 0
let lines = 0
let bytes = 0
let loots = 0
const flush = (): void => {
  if (buf.length === 0) return
  const text = buf.join('')
  bytes += writeSync(fd, text, null, 'latin1')
  buf = []
  held = 0
}
let curSec = -1
let curStamp = ''
const emit = (ms: number, text: string): void => {
  const sec = Math.floor(ms / 1000)
  if (sec !== curSec) {
    curSec = sec
    curStamp = stamp(new Date(sec * 1000))
  }
  const line = `${curStamp} ${text}\r\n`
  buf.push(line)
  held += line.length
  lines++
  if (held > 4_000_000) flush()
}

emit(t, 'Welcome to EverQuest Legends!')
emit(t + 1000, `You have entered ${ZONES[0] as string}.`)
t += 3000
let zone = 0
for (let f = 0; f < FIGHTS; f++) {
  const p = plan[f] as Plan
  const mob = MOB_NAMES[p.mob] as string
  const Mob = mob.charAt(0).toUpperCase() + mob.slice(1)
  if (f > 0 && f % ZONE_EVERY === 0) {
    zone = (zone + 1) % ZONES.length
    emit(t, 'LOADING, PLEASE WAIT...')
    emit(t + 2000, `You have entered ${ZONES[zone] as string}.`)
    t += 4000
  }
  const start = t
  const span = p.dur * 1000
  for (let i = 0; i < p.lines; i++) {
    const at = start + Math.floor((i / p.lines) * span)
    const r = rnd()
    if (r < 0.34) emit(at, `You ${pick(VERBS)} ${mob} for ${String(int(1, 180))} points of damage.`)
    else if (r < 0.46) emit(at, `You try to ${pick(VERBS)} ${mob}, but miss!`)
    else if (r < 0.58) emit(at, `${Mob} ${pick(VERBS3)} YOU for ${String(int(1, 120))} points of damage.`)
    else if (r < 0.66) emit(at, `${Mob} tries to hit YOU, but misses!`)
    else if (r < 0.74) emit(at, `You hit ${mob} for ${String(int(20, 600))} points of magic damage by ${pick(SPELLS)}.`)
    else if (r < 0.79) emit(at, `You healed Primitive for ${String(int(20, 400))} hit points by ${pick(HEALS)}.`)
    else if (r < 0.91) emit(at, `${pick(FRIENDS)} ${pick(VERBS3)} ${mob} for ${String(int(1, 150))} points of damage.`)
    else if (r < 0.95) emit(at, `${pick(FRIENDS)} tries to hit ${mob}, but misses!`)
    else if (r < 0.98) emit(at, `You begin casting ${pick(SPELLS)}.`)
    else emit(at, `${Mob} tries to hit YOU, but YOU dodge!`)
  }
  t = start + span
  emit(t, `You have slain ${mob}!`)
  emit(t, 'You gain experience!')
  if (LOOT_PER > 0) emit(t + 1000, `You receive ${String(int(1, 9))} gold, ${String(int(0, 9))} silver and ${String(int(0, 9))} copper from the corpse.`)
  for (let l = 0; l < LOOT_PER; l++) {
    const item = pick(ITEM_NAMES)
    const k = rnd()
    const at = t + 1000 + l * 300
    if (k < 0.45) emit(at, `--You have looted a ${item} from ${mob}'s corpse.--`)
    else if (k < 0.9) emit(at, `You looted a ${item} from ${mob}'s corpse and sold it for ${coin()}.`)
    else emit(at, `You looted ${String(int(2, 20))} ${item} from ${mob}'s corpse and stored it in your currency.`)
    loots++
  }
  for (let c = 0; c < CHAT_PER; c++) emit(t + 3000 + c * 1500, `${pick(FRIENDS)} tells the group, '${pick(CHAT)}'`)
  t += p.gap * 1000
}
flush()
closeSync(fd)
console.log(JSON.stringify({ out, lines, bytes, fights: FIGHTS, loots, lootPer: LOOT_PER, linesPerFight: [MIN_LINES, MAX_LINES], mobs: MOBS, items: ITEMS, daysSpanned: Math.round((total / 86400) * 10) / 10 }))
