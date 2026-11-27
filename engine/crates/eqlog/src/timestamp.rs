//! `"Sat Aug 01 13:00:28 2026"` → epoch millis, in host local time.
//!
//! The app hands a zone-less string to `Date.parse`, whose legacy-format path is local, so a golden
//! is a fact about the machine that recorded it and this crate must resolve the same wall clock
//! through the same zone.
//!
//! ECMA-262 resolves both DST corner cases at the offset in effect *before* the transition:
//!
//!   * Ambiguous (the hour a fall-back repeats): jiff reports a fold with the offsets before and
//!     after it, and the earlier instant is the one reached through the pre-transition offset.
//!   * Skipped (the hour a spring-forward deletes): jiff reports a gap, and the offset is read off
//!     a local time a day earlier — never two transitions in one day, so that is unambiguous and is
//!     the offset the gap interrupted.
//!
//! Neither branch runs on the acceptance corpus; they are here because a live tail will reach one.

use crate::jsstr::{js_trim, JS_S};
use crate::tz::Tz;
use jiff::civil::DateTime;
use jiff::tz::{AmbiguousOffset, Offset, TimeZone};
use jiff::{SignedDuration, Timestamp};
use regex::Regex;
use std::sync::OnceLock;

/// The prefix every engine diagnostic carries, spelled here because this crate is below `engined`
/// and must not depend on it. One string in two places, and both are stderr-only.
const DIAGNOSTIC_PREFIX: &str = "[eqc-engine]";

/// The platform's own answer, or `None`. On Windows the probe is a WinRT call, which Wine does not
/// implement and which is unavailable on some real installs — so a miss is ordinary, not exotic.
///
/// The probe stays `iana-time-zone` rather than jiff's own system lookup: jiff reads `TZ` first and
/// maps the Windows zone through its own table, so the host would be named by a different route.
#[must_use]
pub fn platform_timezone() -> Option<Tz> {
    iana_time_zone::get_timezone()
        .ok()
        .and_then(|n| Tz::get(&n))
}

/// The host's IANA zone, or `UTC` when the platform will not name one. `parity --tz` overrides it.
pub fn host_timezone() -> Tz {
    platform_timezone().unwrap_or(Tz::UTC)
}

/// The zone a log's stamps resolve through: a named zone with history, or a bare offset.
///
/// A NAME OUTRANKS AN OFFSET FOR DST and an offset outranks a name that disagrees with it — see
/// [`resolve_zone`]. `Fixed` has no transitions, so a session spanning one reads an hour off; that
/// is the priced cost of parsing at all on a host that cannot name its zone.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Zone {
    /// A zone from the IANA database, with its historical DST rules.
    Iana(Tz),
    /// A constant offset east of UTC, rendered `+HH:MM`/`-HH:MM`.
    Fixed(Offset),
}

/// The widest fixed offset a zone may carry, exclusive: a day, the range `chrono`'s `FixedOffset`
/// accepted. jiff's `Offset` reaches further, so the bound is kept here.
const FIXED_LIMIT_SECONDS: u32 = 86_400;

impl Zone {
    /// A constant offset stated in minutes east of UTC, or `None` when that is not an offset.
    #[must_use]
    pub fn fixed(minutes: i32) -> Option<Zone> {
        minutes
            .checked_mul(60)
            .filter(|s| s.unsigned_abs() < FIXED_LIMIT_SECONDS)
            .and_then(|s| Offset::from_seconds(s).ok())
            .map(Zone::Fixed)
    }

    /// How this zone names itself on the wire: the IANA name, or the signed `+HH:MM` offset (with
    /// `:SS` only when the offset has seconds).
    #[must_use]
    pub fn name(&self) -> String {
        match self {
            Zone::Iana(tz) => tz.name().to_owned(),
            Zone::Fixed(off) => {
                let seconds = off.seconds();
                let sign = if seconds < 0 { '-' } else { '+' };
                let abs = seconds.unsigned_abs();
                let (hour, min, sec) = (abs / 3600, abs / 60 % 60, abs % 60);
                if sec == 0 {
                    format!("{sign}{hour:02}:{min:02}")
                } else {
                    format!("{sign}{hour:02}:{min:02}:{sec:02}")
                }
            }
        }
    }

    /// This zone's distance from UTC in minutes east, at one instant — the same number the attach
    /// hint carries, so the two can be compared without either side spelling the arithmetic again.
    #[must_use]
    pub fn offset_min(&self, at: Timestamp) -> i32 {
        let seconds = match self {
            Zone::Iana(tz) => tz.rules().to_offset(at).seconds(),
            Zone::Fixed(off) => off.seconds(),
        };
        seconds / 60
    }

    /// …at an epoch-millis instant, for a caller with no `jiff` of its own.
    #[must_use]
    pub fn offset_min_at_ms(&self, ms: i64) -> i32 {
        Timestamp::from_millisecond(ms).map_or(0, |at| self.offset_min(at))
    }
}

impl From<Tz> for Zone {
    fn from(tz: Tz) -> Self {
        Zone::Iana(tz)
    }
}

/// Where a resolved zone came from — the wire's `clockSource`, and the only way a silent UTC
/// fallback becomes visible.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ZoneSource {
    /// The attach hint's IANA name.
    Host,
    /// This process's own platform probe.
    Platform,
    /// The attach hint's fixed offset — no name was usable.
    Offset,
    /// Nothing answered. The failure this enum exists to make loud.
    Utc,
}

impl ZoneSource {
    /// The wire spelling, which is also what a diagnostic prints.
    #[must_use]
    pub fn as_str(self) -> &'static str {
        match self {
            ZoneSource::Host => "host",
            ZoneSource::Platform => "platform",
            ZoneSource::Offset => "offset",
            ZoneSource::Utc => "utc",
        }
    }
}

/// What the app knows about its own clock, as the attach carries it. Both halves optional: absent
/// means the engine resolves alone, which is what every non-app client says.
#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct ZoneHint {
    /// An IANA name as the host spells it.
    pub tz: Option<String>,
    /// Minutes EAST of UTC at the instant of the attach.
    pub utc_offset_min: Option<i32>,
}

/// A resolved zone and the evidence it rests on.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct ResolvedZone {
    /// The zone every stamp of this generation parses through.
    pub zone: Zone,
    /// Which rung of [`resolve_zone`]'s order answered.
    pub source: ZoneSource,
}

/// THE AGREEMENT RULE: a hinted offset vetoes a zone NAME that disagrees with it.
///
/// The offset came from the same ICU clock that stamped the log, so it is a measurement of the
/// thing being parsed; a name is a lookup that can be stale, wrong or unmapped. A name with no
/// offset to check against is accepted on trust, because it is still better than UTC.
fn agrees(tz: Tz, utc_offset_min: Option<i32>, now: Timestamp) -> bool {
    let Some(want) = utc_offset_min else {
        return true;
    };
    Zone::Iana(tz).offset_min(now) == want
}

/// Which zone this generation parses through, in the order (a) the host's name, (b) this process's
/// probe, (c) the host's offset, (d) UTC.
///
/// A `utc` answer is the one outcome that is always a defect — every stamp will be read hours away
/// from the wall clock the game wrote it with — so it says so on stderr rather than passing for a
/// choice. `utc` reached because the HINT names UTC is not that case and stays quiet.
#[must_use]
pub fn resolve_zone(hint: &ZoneHint) -> ResolvedZone {
    resolve_zone_at(hint, now_utc(), platform_timezone())
}

/// This process's wall clock, to the whole second. Read through `SystemTime` on purpose rather than
/// `Timestamp::now`: the parser itself never reads a clock, and this is the one place that does.
fn now_utc() -> Timestamp {
    let secs = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map_or(0, |d| i64::try_from(d.as_secs()).unwrap_or(0));
    Timestamp::from_second(secs).unwrap_or(Timestamp::UNIX_EPOCH)
}

/// [`resolve_zone`] with both readings of the outside world stated: the instant the agreement rule
/// judges at, and what the platform probe answered. The seam the order is tested through — a test
/// that let the probe answer would assert about the machine it runs on.
#[must_use]
pub fn resolve_zone_at(hint: &ZoneHint, now: Timestamp, platform: Option<Tz>) -> ResolvedZone {
    let named = hint
        .tz
        .as_deref()
        .and_then(Tz::get)
        .filter(|tz| agrees(*tz, hint.utc_offset_min, now));
    if let Some(tz) = named {
        return ResolvedZone {
            zone: Zone::Iana(tz),
            source: ZoneSource::Host,
        };
    }
    if let Some(tz) = platform.filter(|tz| agrees(*tz, hint.utc_offset_min, now)) {
        return ResolvedZone {
            zone: Zone::Iana(tz),
            source: ZoneSource::Platform,
        };
    }
    if let Some(zone) = hint.utc_offset_min.and_then(Zone::fixed) {
        return ResolvedZone {
            zone,
            source: ZoneSource::Offset,
        };
    }
    eprintln!(
        "{DIAGNOSTIC_PREFIX} no host zone and no platform zone: log stamps will be read as UTC, so \
         every wall-clock answer is off by this machine's offset"
    );
    ResolvedZone {
        zone: Zone::Iana(Tz::UTC),
        source: ZoneSource::Utc,
    }
}

/// The zone one attach's stamps resolve through. Cloneable so a sink can hold the parser's own
/// clock rather than rebuild a second one from its name.
#[derive(Debug, Clone, Copy)]
pub struct Clock {
    zone: Zone,
}

/// The offset a named zone's local wall clock is read at, the one ECMA-262 picks.
fn local_offset(tz: &TimeZone, local: DateTime) -> Offset {
    match tz.to_ambiguous_timestamp(local).offset() {
        AmbiguousOffset::Unambiguous { offset } => offset,
        // The repeated hour: the offset before the transition reaches the earlier instant.
        AmbiguousOffset::Fold { before, .. } => before,
        // The skipped hour: read the pre-transition offset off the previous day.
        AmbiguousOffset::Gap { .. } => {
            let probe = local
                .checked_sub(SignedDuration::from_hours(24))
                .map(|day_before| tz.to_ambiguous_timestamp(day_before).offset());
            match probe {
                Ok(
                    AmbiguousOffset::Unambiguous { offset }
                    | AmbiguousOffset::Fold { before: offset, .. },
                ) => offset,
                // Two transitions a day apart: the offset at the wall clock read as a UTC instant.
                _ => Timestamp::from_second(epoch_seconds(local))
                    .map_or(Offset::UTC, |at| tz.to_offset(at)),
            }
        }
    }
}

/// Seconds since the Unix epoch of a wall clock read as if it were UTC. Integer calendar arithmetic
/// (days from civil, proleptic Gregorian) rather than a `Timestamp`, whose range stops a day short
/// of `DateTime`'s and would refuse the year 9999's last wall clocks on a zone west of UTC.
fn epoch_seconds(local: DateTime) -> i64 {
    let (month, day) = (i64::from(local.month()), i64::from(local.day()));
    let year = i64::from(local.year()) - i64::from(month <= 2);
    let era = year.div_euclid(400);
    let year_of_era = year - era * 400;
    let day_of_year = (153 * ((month + 9) % 12) + 2) / 5 + day - 1;
    let day_of_era = year_of_era * 365 + year_of_era / 4 - year_of_era / 100 + day_of_year;
    let days = era * 146_097 + day_of_era - 719_468;
    days * 86_400
        + i64::from(local.hour()) * 3600
        + i64::from(local.minute()) * 60
        + i64::from(local.second())
}

/// A local wall clock read as an instant, at the offset ECMA-262 picks. One path for both kinds of
/// zone: a fixed offset has no transitions to resolve.
fn instant_of(zone: Zone, local: DateTime) -> i64 {
    let offset = match zone {
        Zone::Iana(tz) => local_offset(tz.rules(), local),
        Zone::Fixed(off) => off,
    };
    (epoch_seconds(local) - i64::from(offset.seconds())) * 1000
}

/// A wall-clock reading: the calendar fields an instant shows on one zone, and the inverse of
/// [`Clock::parse_eq_timestamp`]. Fields rather than a formatted string, because a format is a
/// display decision while resolving an instant through the parse zone is this file's job.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Civil {
    /// Calendar year.
    pub year: i32,
    /// Month, 1..=12.
    pub month: u32,
    /// Day of month, 1..=31.
    pub day: u32,
    /// Hour of a 24-hour clock, 0..=23.
    pub hour: u32,
    /// Minute, 0..=59.
    pub minute: u32,
    /// Second, 0..=59.
    pub second: u32,
}

fn stamp_re() -> &'static Regex {
    static RE: OnceLock<Regex> = OnceLock::new();
    RE.get_or_init(|| {
        // The app's stamp pattern with JS's ASCII `\w`/`\d` and `\s` set spelled out (jsstr.rs).
        Regex::new(&format!(
            r"^[0-9A-Za-z_]{{3}}{s}+([0-9A-Za-z_]{{3}}){s}+([0-9]{{1,2}}){s}+([0-9]{{2}}):([0-9]{{2}}):([0-9]{{2}}){s}+([0-9]{{4}})$",
            s = JS_S
        ))
        .unwrap()
    })
}

/// V8's legacy date parser recognizes month names by their first three letters, case-insensitively.
fn month_of(m: &str) -> Option<i8> {
    const MONTHS: [&str; 12] = [
        "jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec",
    ];
    let lower = m.to_ascii_lowercase();
    MONTHS.iter().position(|x| *x == lower).map(|i| i as i8 + 1)
}

impl Clock {
    /// Takes anything that names a zone, so `Clock::new(Tz::…)` and `Clock::new(resolved.zone)` are
    /// the same call.
    pub fn new(zone: impl Into<Zone>) -> Self {
        Clock { zone: zone.into() }
    }

    #[must_use]
    pub fn zone(&self) -> Zone {
        self.zone
    }

    /// Read an epoch-millis instant back as the wall clock it shows on this zone.
    ///
    /// Inverse of `parse_eq_timestamp` everywhere the mapping is one-to-one; a repeated hour reads
    /// back as one of its two spellings and a skipped one never occurs.
    ///
    /// `None` for an instant outside the representable range (jiff's, years -9999 to 9999). A
    /// stamp the parser could not read is 0, and 0 is a real instant (1970), so the caller decides
    /// what an unknown timestamp renders as.
    #[must_use]
    pub fn civil(&self, ms: i64) -> Option<Civil> {
        let utc = Timestamp::from_millisecond(ms).ok()?;
        let local = match self.zone {
            Zone::Iana(tz) => tz.rules().to_datetime(utc),
            Zone::Fixed(off) => off.to_datetime(utc),
        };
        Some(Civil {
            year: i32::from(local.year()),
            month: u32::try_from(local.month()).unwrap_or(0),
            day: u32::try_from(local.day()).unwrap_or(0),
            hour: u32::try_from(local.hour()).unwrap_or(0),
            minute: u32::try_from(local.minute()).unwrap_or(0),
            second: u32::try_from(local.second()).unwrap_or(0),
        })
    }

    /// A stamp the pattern declines, or a date V8 would call NaN, is 0.
    pub fn parse_eq_timestamp(&self, stamp: &str) -> i64 {
        let t = js_trim(stamp);
        let Some(m) = stamp_re().captures(t) else {
            // The app falls back to a bare `Date.parse` here. Every timestamped line in an EQ log
            // matches the pattern above — the parity comparator reports any that do not — so this
            // answers 0 rather than shipping a partial V8 legacy date grammar.
            let _ = t;
            return 0;
        };
        let Some(month) = month_of(&m[1]) else {
            return 0;
        };
        // Each group is at most two digits (four for the year), so every parse fits its type.
        let day: i8 = m[2].parse().unwrap_or(0);
        let hour: i8 = m[3].parse().unwrap_or(99);
        let min: i8 = m[4].parse().unwrap_or(99);
        let sec: i8 = m[5].parse().unwrap_or(99);
        let year: i16 = m[6].parse().unwrap_or(0);
        let Ok(local) = DateTime::new(year, month, day, hour, min, sec, 0) else {
            return 0;
        };
        instant_of(self.zone, local)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn los_angeles() -> Tz {
        Tz::get("America/Los_Angeles").expect("a zone in the bundled database")
    }

    fn la() -> Clock {
        Clock::new(los_angeles())
    }

    #[test]
    fn reads_the_slice_corpus_shape() {
        // The first line of the patch-week golden: [Wed Aug 19 16:21:47 2026] → 1787181707000.
        assert_eq!(
            la().parse_eq_timestamp("Wed Aug 19 16:21:47 2026"),
            1787181707000
        );
    }

    #[test]
    fn the_wall_clock_reads_back_out_of_the_instant_it_resolved_to() {
        // The round trip through the same zone, on the corpus's own first line.
        let ms = la().parse_eq_timestamp("Wed Aug 19 16:21:47 2026");
        let civil = la().civil(ms).expect("a representable instant");
        assert_eq!(
            (
                civil.year,
                civil.month,
                civil.day,
                civil.hour,
                civil.minute,
                civil.second
            ),
            (2026, 8, 19, 16, 21, 47)
        );
        // …and a UTC clock reads the same instant seven hours later, which is why the zone is a
        // property of the Clock rather than of the caller.
        let utc = Clock::new(Tz::UTC).civil(ms).expect("an instant");
        assert_eq!((utc.day, utc.hour), (19, 23));
    }

    #[test]
    fn a_stamp_that_is_not_one_is_zero() {
        assert_eq!(la().parse_eq_timestamp("not a timestamp"), 0);
        assert_eq!(la().parse_eq_timestamp("Sat Zzz 01 13:00:28 2026"), 0);
        // A field out of range is NaN to V8 and 0 here, whichever field it is.
        assert_eq!(la().parse_eq_timestamp("Sat Feb 30 13:00:28 2026"), 0);
        assert_eq!(la().parse_eq_timestamp("Sat Aug 01 24:00:00 2026"), 0);
        assert_eq!(la().parse_eq_timestamp("Sat Aug 01 13:00:60 2026"), 0);
    }

    #[test]
    fn the_skipped_hour_reads_at_the_offset_before_the_transition() {
        // 2026-03-08 02:30 does not exist in America/Los_Angeles. ECMA-262 reads it at PST
        // (-08:00), landing on 10:30Z — the same answer V8 gives.
        let ms = la().parse_eq_timestamp("Sun Mar 08 02:30:00 2026");
        assert_eq!(ms, 1772965800000);
    }

    #[test]
    fn the_repeated_hour_reads_at_the_offset_before_the_transition() {
        // 2026-11-01 01:30 happens twice. The rule takes PDT (-07:00) → 08:30Z.
        let ms = la().parse_eq_timestamp("Sun Nov 01 01:30:00 2026");
        assert_eq!(ms, 1793521800000);
    }

    #[test]
    fn the_calendar_arithmetic_agrees_with_jiff_across_its_whole_range() {
        // `epoch_seconds` is hand-rolled for range; jiff is the reference wherever it can answer.
        for (y, m, d) in [
            (0, 1, 1),
            (1, 3, 1),
            (1969, 12, 31),
            (1970, 1, 1),
            (2000, 2, 29),
            (2026, 11, 26),
            (2100, 3, 1),
            (9999, 12, 30),
        ] {
            let local = DateTime::new(y, m, d, 21, 14, 3, 0).expect("a date");
            let want = Offset::UTC
                .to_timestamp(local)
                .expect("in range")
                .as_second();
            assert_eq!(epoch_seconds(local), want, "{local}");
        }
    }

    #[test]
    fn a_fixed_offset_names_itself_as_chrono_did() {
        let name = |minutes| Zone::fixed(minutes).map(|z| z.name());
        assert_eq!(name(-420).as_deref(), Some("-07:00"));
        assert_eq!(name(0).as_deref(), Some("+00:00"));
        assert_eq!(name(345).as_deref(), Some("+05:45"));
        assert_eq!(name(1439).as_deref(), Some("+23:59"));
        assert_eq!(name(-1439).as_deref(), Some("-23:59"));
        assert_eq!(name(1440), None);
        assert_eq!(name(-1440), None);
        assert_eq!(name(i32::MAX), None);
    }

    /// A September 2026 instant: PDT is in force in Los Angeles and CEST in Berlin, so every
    /// agreement assertion below is a fact about the zone database rather than about today.
    fn september() -> Timestamp {
        Timestamp::from_second(1_789_000_000).expect("a representable instant")
    }

    fn hint(tz: Option<&str>, offset: Option<i32>) -> ZoneHint {
        ZoneHint {
            tz: tz.map(str::to_owned),
            utc_offset_min: offset,
        }
    }

    /// Wine's failure: the probe answers nothing.
    const NO_PROBE: Option<Tz> = None;

    #[test]
    fn the_hosts_name_is_the_first_rung() {
        let resolved = resolve_zone_at(
            &hint(Some("America/Los_Angeles"), Some(-420)),
            september(),
            NO_PROBE,
        );
        assert_eq!(resolved.source, ZoneSource::Host);
        assert_eq!(resolved.zone, Zone::Iana(los_angeles()));
    }

    #[test]
    fn the_platform_probe_is_the_second() {
        let resolved = resolve_zone_at(&hint(None, None), september(), Some(los_angeles()));
        assert_eq!(resolved.source, ZoneSource::Platform);
        assert_eq!(resolved.zone, Zone::Iana(los_angeles()));
    }

    #[test]
    fn a_host_name_that_disagrees_with_the_host_offset_falls_through_to_the_offset() {
        // Berlin is east of UTC in every season, so it can never be -420. The offset is a
        // measurement of the clock that stamped the log and the name is a lookup; the name loses,
        // and so does a platform probe that repeats it.
        let resolved = resolve_zone_at(
            &hint(Some("Europe/Berlin"), Some(-420)),
            september(),
            Tz::get("Europe/Berlin"),
        );
        assert_eq!(resolved.source, ZoneSource::Offset);
        assert_eq!(
            resolved.zone,
            Zone::Fixed(Offset::from_seconds(-420 * 60).unwrap())
        );
    }

    #[test]
    fn a_garbage_zone_name_is_skipped() {
        let resolved = resolve_zone_at(
            &hint(Some("Middle/Earth"), Some(-420)),
            september(),
            NO_PROBE,
        );
        assert_eq!(resolved.source, ZoneSource::Offset);
        assert_eq!(resolved.zone.name(), "-07:00");
    }

    #[test]
    fn nothing_usable_is_utc_and_says_so() {
        let resolved = resolve_zone_at(&hint(Some("Middle/Earth"), None), september(), NO_PROBE);
        assert_eq!(resolved.source, ZoneSource::Utc);
        assert_eq!(resolved.zone, Zone::Iana(Tz::UTC));
    }

    #[test]
    fn an_agreeing_probe_outranks_a_bare_offset() {
        // The offset alone would resolve `Fixed(-07:00)`, which has no DST; a probe that agrees with
        // it right now carries the transitions the fold will cross later.
        let resolved = resolve_zone_at(&hint(None, Some(-420)), september(), Some(los_angeles()));
        assert_eq!(resolved.source, ZoneSource::Platform);
    }

    #[test]
    fn the_live_probe_and_the_live_order_agree_with_each_other() {
        // `resolve_zone` reads the machine; this pins the two entry points to one answer rather
        // than asserting which zone this particular machine is on.
        let hinted = hint(None, None);
        assert_eq!(
            resolve_zone(&hinted).source,
            resolve_zone_at(&hinted, now_utc(), platform_timezone()).source
        );
    }

    #[test]
    fn a_fixed_offset_clock_parses_and_reads_back_the_same_wall_clock() {
        // The same corpus line through -07:00: LA was on PDT that day, so the instant is the LA
        // one, and the round trip through `civil` returns the wall clock it was written with.
        let fixed = Clock::new(Zone::Fixed(Offset::from_seconds(-420 * 60).unwrap()));
        let ms = fixed.parse_eq_timestamp("Wed Aug 19 16:21:47 2026");
        assert_eq!(ms, 1787181707000);
        let civil = fixed.civil(ms).expect("a representable instant");
        assert_eq!((civil.day, civil.hour, civil.minute), (19, 16, 21));
    }
}
