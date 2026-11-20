// zz-exp-slow-panel-1.mts: THROWAWAY. Synthetic EverQuest log generator (streamed, seeded).
//   node --import tsx tests/e2e/zz-exp-slow-panel-1.mts <shape> <targetBytes|lines> <outFile> [endAgoSec]
// shapes: real | probe | onefight | short | raid
import { closeSync, mkdirSync, openSync, writeSync } from 'node:fs'
import { dirname } from 'node:path'

const [shape = 'real', targetArg = '100000000', out = '', endAgoArg = '3600'] = process.argv.slice(2)
const TARGET = Number(targetArg)
const END_AGO = Number(endAgoArg)
if (out === '') throw new Error('usage: <shape> <target> <outFile> [endAgoSec]')

// ---- deterministic rng
let seed = 0x2f6e2b1
function rnd(): number {
  seed |= 0
  seed = (seed + 0x6d2b79f5) | 0
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296
}
const ri = (lo: number, hi: number): number => lo + Math.floor(rnd() * (hi - lo + 1))
const pick = <T,>(a: readonly T[]): T => a[Math.floor(rnd() * a.length)]!

// ---- stamps
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const pad = (n: number): string => (n < 10 ? `0${String(n)}` : String(n))
let stampSec = -1
let stampStr = ''
function stamp(sec: number): string {
  if (sec !== stampSec) {
    const at = new Date(sec * 1000)
    stampSec = sec
    stampStr = `[${DAYS[at.getDay()]} ${MONTHS[at.getMonth()]} ${pad(at.getDate())} ${pad(at.getHours())}:${pad(at.getMinutes())}:${pad(at.getSeconds())} ${String(at.getFullYear())}] `
  }
  return stampStr
}

// ---- output
mkdirSync(dirname(out), { recursive: true })
const fd = openSync(out, 'w')
let buf: string[] = []
let bufLen = 0
let bytes = 0
let lines = 0
let dry = false
function emit(sec: number, text: string): void {
  const l = `${stamp(sec)}${text}\r\n`
  buf.push(l)
  bufLen += l.length
  bytes += l.length
  lines += 1
  if (bufLen > 4_000_000) flush()
}
function flush(): void {
  if (buf.length === 0) return
  if (dry) {
    buf = []
    bufLen = 0
    return
  }
  writeSync(fd, buf.join(''), null, 'utf8')
  buf = []
  bufLen = 0
}

// ---- vocabulary (shapes taken from tests/fixtures/*.log and engine/crates/eqlog tests)
const ADJ = ['decaying', 'greater', 'lesser', 'bloodthirsty', 'dar', 'zol', 'wan', 'forsaken', 'ancient', 'enraged', 'spectral', 'rotting', 'feral', 'frost', 'fire', 'sand', 'cave', 'plague', 'dread', 'shadowed']
const NOUN = ['skeleton', 'ghoul knight', 'giant warrior', 'giant wizard', 'revenant', 'kodiak', 'ghoul sentinel', 'imp protector', 'essence carrier', 'froglok', 'gnoll', 'orc centurion', 'spider', 'drake', 'mummy']
const MOBS: string[] = []
for (const a of ADJ) for (const n of NOUN) MOBS.push(`${/^[aeiou]/.test(a) ? 'an' : 'a'} ${a} ${n}`)
const NAMED = ['Lord Nagafen', 'King Tranix', 'Avatar of Abhorrence', 'Magi P`tasa', 'Innoruuk`s Chosen', 'Lost Crusader', 'Vibartik', 'Cleric of Innoruuk']
const ZONES = ['Innothule Swamp', "Nagafen's Lair", 'The Southern Desert of Ro', 'The Oasis of Marr', 'The Northern Desert of Ro', 'The Plane of Hate', 'The Feerrott', 'East Commonlands', 'The Plane of Sky', 'East Freeport', 'Najena', 'Lower Guk', 'Upper Guk', 'The Plane of Fear', 'Befallen', 'Blackburrow', 'Crushbone', 'Estate of Unrest', 'Castle Mistmoore', 'Permafrost Caverns', 'The Temple of Solusek Ro', 'Lavastorm Mountains', 'West Karana', 'South Karana', 'Lake Rathetear', 'Rathe Mountains', 'Kithicor Forest', 'High Keep', 'Highpass Hold', 'Qeynos Hills']
const ITEMS: string[] = []
for (const a of ['Rusty', 'Fine Steel', 'Bronze', 'Cracked', 'Tarnished', 'Runed', 'Blackened', 'Glowing', 'Ancient', 'Polished', 'Ornate', 'Crude', 'Enchanted', 'Shadowed', 'Gilded', 'Frosted', 'Burnt', 'Woven', 'Carved', 'Etched'])
  for (const n of ['Dagger', 'Long Sword', 'Mace', 'Breastplate', 'Bracer', 'Ring', 'Earring', 'Bone Chips', 'Silk', 'Totem', 'Shield', 'Helm', 'Boots', 'Cloak', 'Gem', 'Scroll', 'Rune', 'Idol', 'Staff', 'Spear', 'Words of Power', 'Pelt', 'Fang', 'Claw', 'Essence']) ITEMS.push(`${a} ${n}`)
const PLAYERS = ['Rykkerr', 'Vebn', 'Bzzazzt', 'Kelmora', 'Thandric', 'Ossuin', 'Maevra', 'Dorrikan', 'Yselle', 'Brakkus', 'Tinuvael', 'Corwyth', 'Halgrim', 'Sennara', 'Ulveric', 'Pyrrha', 'Morwenna', 'Galdric', 'Zephra', 'Odrunn', 'Lysaria', 'Fenwick', 'Aldous', 'Mirelle', 'Torvald', 'Quenya', 'Baldrin', 'Seraphel', 'Ignar', 'Wyndra', 'Castiel', 'Harrow', 'Nimue', 'Draven', 'Elowen', 'Garrik', 'Isolde', 'Jorund', 'Kaelis', 'Liriel']
const MELEE: readonly [string, string][] = [['slash', 'slashes'], ['crush', 'crushes'], ['pierce', 'pierces'], ['kick', 'kicks'], ['bash', 'bashes'], ['hit', 'hits'], ['claw', 'claws'], ['strike', 'strikes']]
const MOBVERB: readonly [string, string][] = [['hit', 'hits'], ['crush', 'crushes'], ['slash', 'slashes'], ['bite', 'bites'], ['pierce', 'pierces']]
const NUKES = ['Chaos Flux', 'Smiting Strike', 'Lightning Bolt', 'Ice Comet', 'Siphon Life', 'Vampiric Curse', 'Dry Bone Fire Burst', 'Blood Draw Strike']
const HEALS = ['Superior Healing', 'Greater Healing', 'Healing', 'Lifetap Strike', 'Vampiric Embrace', 'Ethereal Cleansing']
const SKILLS = ['1H Piercing', 'Backstab', 'Kick', 'Dual Wield', 'Conjuration', 'Dodge', 'Offense', 'Defense', 'Double Attack', 'Parry', 'Bash', 'Channeling', 'Meditate', 'Evocation']
const FACTIONS = ['Inhabitants of Hate', 'Undead Frogloks of Guk', 'Frogloks of Guk', 'Minions of Underfoot', 'Clan Runnyeye', 'Freeport Militia', 'Knights of Truth', 'Dismal Rage']
const cap = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1)
const ME = 'Primitive'
const PET = 'Gobaner'

function meleeYou(sec: number, mob: string): void {
  const v = pick(MELEE)
  if (rnd() < 0.62) emit(sec, `You ${v[0]} ${mob} for ${String(ri(8, 420))} points of damage.${rnd() < 0.08 ? ' (Critical)' : ''}`)
  else emit(sec, `You try to ${v[0]} ${mob}, but miss!`)
}
function meleeOther(sec: number, who: string, mob: string): void {
  const v = pick(MELEE)
  if (rnd() < 0.6) emit(sec, `${who} ${v[1]} ${mob} for ${String(ri(8, 380))} points of damage.`)
  else emit(sec, `${who} tries to ${v[0]} ${mob}, but misses!`)
}
function mobSwing(sec: number, mob: string, target: string): void {
  const v = pick(MOBVERB)
  const t = target === ME ? 'YOU' : target
  const r = rnd()
  if (r < 0.55) emit(sec, `${cap(mob)} ${v[1]} ${t} for ${String(ri(5, 260))} points of damage.`)
  else if (r < 0.9) emit(sec, `${cap(mob)} tries to ${v[0]} ${t}, but misses!`)
  else if (target === ME) emit(sec, `${cap(mob)} tries to ${v[0]} YOU, but YOU ${pick(['dodge', 'block', 'parry'])}!`)
  else emit(sec, `${cap(mob)} tries to ${v[0]} ${t}, but misses!`)
}
function chatter(sec: number): void {
  const r = rnd()
  const p = pick(PLAYERS)
  if (r < 0.3) emit(sec, `${p} tells the group, 'inc ${pick(MOBS)}'`)
  else if (r < 0.45) emit(sec, `${p} says out of character, 'LFG ${String(ri(10, 60))} ${pick(['WAR', 'CLR', 'WIZ', 'ENC'])}'`)
  else if (r < 0.6) emit(sec, `${p} auctions, 'WTS ${pick(ITEMS)} ${String(ri(1, 900))}pp'`)
  else if (r < 0.7) emit(sec, `You say, 'Hail, ${p}'`)
  else if (r < 0.8) emit(sec, `You have become better at ${pick(SKILLS)}! (${String(ri(1, 250))})`)
  else if (r < 0.9) emit(sec, `Your ${pick(HEALS)} spell has worn off of ${ME}.`)
  else emit(sec, "You can't use that command right now...")
}
function killTail(sec: number, mob: string, byYou: boolean, killer: string): void {
  if (byYou) emit(sec, `You have slain ${mob}!`)
  else emit(sec, `${cap(mob)} has been slain by ${killer}!`)
  emit(sec, `Your faction standing with ${pick(FACTIONS)} has been adjusted by -${String(ri(1, 10))}.`)
  if (rnd() < 0.5) emit(sec, `Your faction standing with ${pick(FACTIONS)} has been adjusted by ${String(ri(1, 5))}.`)
  emit(sec, rnd() < 0.6 ? `You gain experience! (${(rnd() * 0.9).toFixed(3)}%)` : 'You gain experience!')
  if (rnd() < 0.6) emit(sec + 2, `You receive ${String(ri(1, 9))} gold, ${String(ri(1, 9))} silver and ${String(ri(1, 9))} copper from the corpse.`)
  const loots = rnd() < 0.5 ? 0 : ri(1, 3)
  for (let i = 0; i < loots; i++) {
    const it = pick(ITEMS)
    if (rnd() < 0.3) emit(sec + 3, `You looted a ${it} from ${mob}'s corpse and sold it for ${String(ri(1, 9))} silver and ${String(ri(1, 9))} copper.`)
    else emit(sec + 3, `--You have looted a ${it} from ${mob}'s corpse.--`)
  }
}

// One fight of `dur` seconds against `mobs`, with `allies` (names, PET included) helping.
// `density` scales swings per second. Returns the second it ended at.
function fight(t0: number, dur: number, mobs: readonly string[], allies: readonly string[], density: number): number {
  const main = mobs[0]!
  let casting = 0
  for (let s = 0; s < dur; s++) {
    const sec = t0 + s
    const yourSwings = density >= 1 ? ri(1, 2) : rnd() < density ? 1 : 0
    for (let i = 0; i < yourSwings; i++) meleeYou(sec, main)
    for (const mob of mobs) if (rnd() < 0.7 * Math.min(1, density)) mobSwing(sec, mob, rnd() < 0.7 || allies.length === 0 ? ME : pick(allies))
    for (const a of allies) if (rnd() < 0.55 * Math.min(1, density)) meleeOther(sec, a, rnd() < 0.8 ? main : pick(mobs))
    if (s % 7 === 3) {
      emit(sec, `You begin casting ${pick(NUKES)}.`)
      casting = sec + 3
    }
    if (sec === casting) {
      const n = pick(NUKES)
      if (rnd() < 0.85) emit(sec, `You hit ${main} for ${String(ri(60, 900))} points of magic damage by ${n}.`)
      else emit(sec, `${cap(main)} resisted your ${n}!`)
    }
    if (s % 11 === 5) emit(sec, `You healed ${ME} for ${String(ri(40, 600))} hit points by ${pick(HEALS)}.`)
    if (allies.length > 1 && s % 9 === 4) {
      const h = pick(allies.slice(1))
      emit(sec, `${h} begins casting ${pick(HEALS)}.`)
      emit(sec + 1 <= t0 + dur - 1 ? sec : sec, `${h} healed you for ${String(ri(40, 600))} hit points by ${pick(HEALS)}.`)
    }
    if (s % 13 === 6) emit(sec, `${cap(main)} begins casting ${pick(NUKES)}.`)
    if (rnd() < 0.03) chatter(sec)
  }
  const end = t0 + dur
  mobs.forEach((mob, i) => killTail(end, mob, i === 0 && rnd() < 0.7, allies.length > 0 ? pick(allies) : PET))
  return end + 4
}

function done(): boolean {
  return bytes >= TARGET
}

// Each shape first lays the whole log out on a clock starting at 0, then we need the START so the
// log ends END_AGO seconds before now. To stream, the span is estimated per shape from a dry rate
// and the start is set so the END lands in the past with margin: we generate with t relative and
// rebase by choosing start = now - END_AGO - span, where span comes from a first dry pass.
function run(gen: (t0: number) => number, dry: boolean): number {
  seed = 0x2f6e2b1
  bytes = 0
  lines = 0
  stampSec = -1
  return gen(dry ? 1_000_000_000 : START)
}
let START = 0
let fights = 0

const gens: Record<string, (t0: number) => number> = {
  // The probe's own log: one line a second, never a quiet minute, no zone line.
  probe: (t0) => {
    emit(t0, 'Welcome to EverQuest Legends!')
    const n = TARGET // lines, for this shape
    for (let i = 1; i <= n; i++) {
      const sec = t0 + i
      if (i % 5000 === 0) emit(sec, `You have become better at ${['Fishing', 'Dodge', 'Offense', 'Baking'][(i / 5000) % 4]}! (${String(i / 5000)})`)
      else if (i % 7 === 0) emit(sec, `A decaying skeleton hits YOU for ${String(1 + (i % 40))} points of damage.`)
      else if (i % 11 === 0) emit(sec, 'You have slain a decaying skeleton!')
      else emit(sec, `You slash a decaying skeleton for ${String(1 + (i % 90))} points of damage.`)
    }
    fights = 1
    return t0 + n
  },
  // Real play: fights of 20-180 s, a group of 2-3 and a pet, 1-3 mobs, gaps, zone lines, loot, exp, chat.
  real: (t0) => {
    let t = t0
    fights = 0
    emit(t, 'Welcome to EverQuest Legends!')
    emit(t, `You have entered ${pick(ZONES)}.`)
    const group = [PET, pick(PLAYERS), pick(PLAYERS)]
    while (!done()) {
      const mobs = Array.from({ length: rnd() < 0.7 ? 1 : ri(2, 3) }, () => (rnd() < 0.03 ? pick(NAMED) : pick(MOBS)))
      t = fight(t, ri(20, 180), mobs, group, 1)
      fights += 1
      // the pull gap: quiet, with chat. Longer than the 60 s idle fallback about half the time.
      const gap = ri(8, 150)
      for (let g = 0; g < gap; g += ri(3, 20)) chatter(t + g)
      t += gap
      if (fights % 12 === 0) {
        emit(t, 'LOADING, PLEASE WAIT...')
        t += ri(8, 25)
        emit(t, `You have entered ${pick(ZONES)}.`)
        group[1] = pick(PLAYERS)
      }
      if (fights % 45 === 0) t += ri(6, 20) * 3600 // the player logs off until the next session
    }
    return t
  },
  // One unbroken fight of real density (a group on one mob that never dies), with one zone line first.
  onefight: (t0) => {
    let t = t0
    emit(t, 'Welcome to EverQuest Legends!')
    emit(t, 'You have entered The Plane of Hate.')
    const group = [PET, PLAYERS[0]!, PLAYERS[1]!]
    const mob = 'Innoruuk'
    fights = 1
    let s = 0
    while (!done()) {
      const sec = t + s
      for (let i = ri(1, 2); i > 0; i--) meleeYou(sec, mob)
      if (rnd() < 0.7) mobSwing(sec, mob, rnd() < 0.7 ? ME : pick(group))
      for (const a of group) if (rnd() < 0.55) meleeOther(sec, a, mob)
      if (s % 7 === 3) emit(sec, `You hit ${mob} for ${String(ri(60, 900))} points of magic damage by ${pick(NUKES)}.`)
      if (s % 11 === 5) emit(sec, `You healed ${ME} for ${String(ri(40, 600))} hit points by ${pick(HEALS)}.`)
      s += 1
    }
    t += s
    return t
  },
  // Very many short fights: two swings and a kill, 70 s apart (past the 60 s idle fallback).
  short: (t0) => {
    let t = t0
    fights = 0
    emit(t, 'Welcome to EverQuest Legends!')
    emit(t, `You have entered ${pick(ZONES)}.`)
    while (!done()) {
      const mob = pick(MOBS)
      meleeYou(t, mob)
      mobSwing(t + 1, mob, ME)
      emit(t + 2, `You slash ${mob} for ${String(ri(8, 420))} points of damage.`)
      emit(t + 2, `You have slain ${mob}!`)
      emit(t + 2, 'You gain experience!')
      if (rnd() < 0.3) emit(t + 4, `--You have looted a ${pick(ITEMS)} from ${mob}'s corpse.--`)
      fights += 1
      t += 70
      if (fights % 400 === 0) {
        emit(t, 'LOADING, PLEASE WAIT...')
        emit(t + 5, `You have entered ${pick(ZONES)}.`)
        t += 10
      }
    }
    return t
  },
  // A raid: 40 named players on 1-4 mobs, 120-300 s a fight, healers healing each other.
  raid: (t0) => {
    let t = t0
    fights = 0
    emit(t, 'Welcome to EverQuest Legends!')
    emit(t, 'You have entered The Plane of Fear.')
    const raiders = [PET, ...PLAYERS.slice(0, 39)]
    while (!done()) {
      const mobs = Array.from({ length: ri(1, 4) }, () => (rnd() < 0.3 ? pick(NAMED) : pick(MOBS)))
      const dur = ri(120, 300)
      const main = mobs[0]!
      for (let s = 0; s < dur; s++) {
        const sec = t + s
        meleeYou(sec, main)
        for (const mob of mobs) mobSwing(sec, mob, rnd() < 0.2 ? ME : pick(raiders))
        for (const a of raiders) {
          const r = rnd()
          if (r < 0.45) meleeOther(sec, a, rnd() < 0.8 ? main : pick(mobs))
          else if (r < 0.5) emit(sec, `${a} hit ${main} for ${String(ri(60, 900))} points of magic damage by ${pick(NUKES)}.`)
          else if (r < 0.55) emit(sec, `${a} healed ${pick(raiders)} for ${String(ri(40, 600))} hit points by ${pick(HEALS)}.`)
          else if (r < 0.58) emit(sec, `${a} begins casting ${pick(HEALS)}.`)
        }
        if (s % 7 === 3) emit(sec, `You hit ${main} for ${String(ri(60, 900))} points of magic damage by ${pick(NUKES)}.`)
        if (s % 11 === 5) emit(sec, `You healed ${pick(raiders)} for ${String(ri(40, 600))} hit points by ${pick(HEALS)}.`)
      }
      t += dur
      mobs.forEach((mob, i) => killTail(t, mob, i === 0 && rnd() < 0.1, pick(raiders)))
      t += 4
      fights += 1
      const gap = ri(70, 240)
      for (let g = 0; g < gap; g += ri(3, 12)) chatter(t + g)
      t += gap
      if (fights % 30 === 0) t += ri(20, 44) * 3600
    }
    return t
  }
}

const gen = gens[shape]
if (!gen) throw new Error(`unknown shape ${shape}`)

// Dry pass for the span (writes nothing), then the real pass rebased so the log ends END_AGO s ago.
dry = true
const span = run(gen, true) - 1_000_000_000
buf = []
bufLen = 0
dry = false
START = Math.floor(Date.now() / 1000) - END_AGO - span
const tGen = Date.now()
run(gen, false)
flush()
closeSync(fd)
console.log(JSON.stringify({ shape, out, bytes, lines, fights, spanDays: Number((span / 86400).toFixed(2)), endAgoSec: END_AGO, genMs: Date.now() - tGen }))
