// ============================================================================
// shared/outputs/factions.ts — THE `/outputfile faction` FORMAT, characterized from a real dump,
// and the projection this app reads out of it.
// ============================================================================
//
// THE THIRD GRADUATED KIND, and the one the log could never substitute for. EQ's faction messages
// say only "got better" / "got worse" — a delta with no baseline — and `/con` samples one mob of
// one faction at one instant. This file is the server saying the NUMBER: an absolute standing for
// every faction it tracks for the character, which is exactly the fact a faction surface needs
// and exactly the fact nothing else in the game will state.
//
// ---------------------------------------------------------------------------
// THE FORMAT, MEASURED — a real dump from the Legends server, 2026-09-05.
// ---------------------------------------------------------------------------
// `<EQ root>\Drywrought_oggok-WAR-Factions.txt`, 5,602 bytes, CRLF throughout, 1 header + 185
// rows, trailing newline, committed verbatim as `tests/fixtures/Drywrought_oggok-WAR-Factions.txt`.
//
// TAB-SEPARATED, one header row then one row per faction:
//
//   ID <TAB> Name <TAB> StandingValue <TAB> PointsToMax
//   225 <TAB> Clan Runnyeye <TAB> -377 <TAB> 2377
//
// Four facts the audit of that file established, and what each one decides below:
//
//   * `StandingValue` is a signed integer and every observed value sits in [-2000, 2000], with
//     both endpoints occurring (21 rows at 2000, 12 at -2000). The endpoints read as CAPS — a
//     dozen-plus distinct factions parked at exactly ±2000 is clamping, not coincidence.
//   * `PointsToMax` equals `2000 - StandingValue` on ALL 185 rows. It is derived today, but it is
//     KEPT on the row (see `FactionStanding.toMax`) because it is the file's own statement of
//     where this faction's ceiling is: the day a faction caps somewhere other than 2000, the
//     reader that computed `standing + toMax` keeps working and the one that hardcoded 2000 lies.
//   * `ID` is a numeric faction id, unique across the file (185 distinct values). It is the join
//     key the day any faction knowledge base lands; the NAME is display.
//   * The roster includes factions at 0 the character has plainly never met — it is the server's
//     faction TABLE, not a diary. A 0 is therefore "unremarkable", never "visited and neutral".
//
// TWO THINGS ABOUT THE FILE **NAME**, both measured against the same dump:
//
//   * The command is `/outputfile faction` — SINGULAR. The in-game usage line lists `faction`
//     and typing the plural errors; the SUFFIX the file carries is `-Factions.txt` — PLURAL. The
//     registry states both spellings and neither may be derived from the other.
//   * The name carries a CLASS TOKEN the other kinds' files do not: `Drywrought_oggok-WAR-…`, i.e.
//     `<Character>_<server>-<CLASS>-Factions.txt`. `preferredOutputFile` (shared/outputs/kinds.ts)
//     grew a prefix rule for exactly this shape; the suffix match that discovery and the watchers
//     use (`isOutputFileName`) was always token-agnostic and needed nothing.
//
// THE PARSER IS STRICT, on the achievements parser's argument verbatim: the real file produced
// zero malformed rows, so a row that stops being regular — a non-integer id or standing, a blank
// name, a field count that is not 4 — is DROPPED rather than guessed at. Half-reading a changed
// format is what the registry's no-guessing law exists to prevent. Blank lines are skipped and CR
// is stripped, so a dump that has been through a text tool still reads.

/**
 * ONE FACTION'S STANDING, as the file states it — the flat artifact main persists
 * (`ProgressState.factionStandings`) and the renderer draws.
 */
export interface FactionStanding {
  /** The game's numeric faction id — stable, unique, the join key for any future faction data. */
  id: number
  /** The faction's display name, verbatim (`Clan Runnyeye`, `Miners Guild 249`). */
  name: string
  /** The absolute standing, signed. Every observed value sits in [-2000, 2000]. */
  standing: number
  /**
   * The file's `PointsToMax` — today always `2000 - standing`, kept because it is the server's
   * own statement of this faction's ceiling: `standing + toMax` is the cap without hardcoding it.
   */
  toMax: number
}

/**
 * WHAT WE KNOW ABOUT THE FACTIONS DUMP WE READ — `ProgressState.factionsSource`. The
 * `AchievementsSource` shape exactly, and for its reasons: the file's mtime is when the PLAYER
 * typed the command (the freshness line's subject), `readAt` is when THIS APP read it (the
 * JOS-253 pair), and nothing else in this path compares an instant against anything.
 */
export interface FactionsSource {
  path: string
  /** The file's mtime, ISO — when the player typed `/outputfile faction`. */
  loadedAt: string
  /** When this app last read it, epoch ms. */
  readAt: number
}

/** The header row, verbatim — recognized and skipped rather than special-cased by position, so a
 *  dump that has lost or duplicated it still reads by the same rule as every other line. */
const HEADER = 'ID\tName\tStandingValue\tPointsToMax'

/** An integer as the file writes one: optional sign, digits, nothing else. `Number(' ')` is 0 and
 *  `parseInt('12abc')` is 12 — both are guesses, and this parser does not guess. */
const INT = /^-?\d+$/

/**
 * Parse a dump's text into standings, strictly (see the header's last paragraph). Row order is
 * the file's; the caller sorts for display.
 */
export function parseFactionsDump(text: string): FactionStanding[] {
  const rows: FactionStanding[] = []
  for (const raw of text.split('\n')) {
    const line = raw.endsWith('\r') ? raw.slice(0, -1) : raw
    if (line === '' || line === HEADER) continue
    const fields = line.split('\t')
    if (fields.length !== 4) continue
    const [id, name, standing, toMax] = fields
    if (!INT.test(id) || !INT.test(standing) || !INT.test(toMax) || name.trim() === '') continue
    rows.push({ id: Number(id), name: name.trim(), standing: Number(standing), toMax: Number(toMax) })
  }
  return rows
}
