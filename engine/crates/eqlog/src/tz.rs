//! The zone type every clock in the engine names: an IANA zone from jiff's bundled database.
//!
//! The database is jiff's bundled copy (`tzdb-bundle-always`), never the host's: the same zone
//! names and rules on every machine, as the compiled-in `chrono-tz` tables gave before it.

use jiff::tz::TimeZone;
use std::sync::{Mutex, PoisonError};

/// A zone from the IANA database, named exactly as the database spells it.
///
/// `Copy`, like the `chrono-tz` enum it replaces, so a `Clock` stays a plain value: each zone is
/// loaded once per process and kept for its life (see [`Tz::get`]), and a `Tz` is a reference to
/// that one copy. Two `Tz`s are equal when they name the same zone.
#[derive(Clone, Copy)]
pub struct Tz(&'static TimeZone);

/// The zone behind [`Tz::UTC`].
static UTC_ZONE: TimeZone = TimeZone::UTC;

impl Tz {
    /// Coordinated Universal Time, the fallback when nothing names a zone.
    pub const UTC: Tz = Tz(&UTC_ZONE);

    /// The zone the bundled database files under exactly `name`, or `None`.
    ///
    /// CASE-SENSITIVE, as `chrono-tz`'s `FromStr` was: jiff's own lookup ignores case, so a name is
    /// accepted only when the database spells it the same way. Zones are kept, not dropped: the
    /// process names a handful at most (the host's, a hint's, a `--tz`), and a reference to one
    /// loaded copy is what keeps `Tz`, `Zone` and `Clock` `Copy`.
    #[must_use]
    pub fn get(name: &str) -> Option<Tz> {
        static LOADED: Mutex<Vec<&'static TimeZone>> = Mutex::new(Vec::new());
        let mut loaded = LOADED.lock().unwrap_or_else(PoisonError::into_inner);
        if let Some(tz) = loaded.iter().find(|tz| tz.iana_name() == Some(name)) {
            return Some(Tz(tz));
        }
        let tz = TimeZone::get(name)
            .ok()
            .filter(|tz| tz.iana_name() == Some(name))?;
        let kept: &'static TimeZone = Box::leak(Box::new(tz));
        loaded.push(kept);
        Some(Tz(kept))
    }

    /// The zone's IANA name.
    #[must_use]
    pub fn name(&self) -> &'static str {
        self.0.iana_name().unwrap_or("UTC")
    }

    /// The zone's transition rules, for the clock arithmetic in `timestamp.rs`.
    pub(crate) fn rules(self) -> &'static TimeZone {
        self.0
    }
}

impl PartialEq for Tz {
    fn eq(&self, other: &Self) -> bool {
        self.name() == other.name()
    }
}

impl Eq for Tz {}

impl std::fmt::Debug for Tz {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_tuple("Tz").field(&self.name()).finish()
    }
}

impl std::fmt::Display for Tz {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str(self.name())
    }
}

/// A name [`Tz::get`] does not know.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct UnknownZone(pub String);

impl std::fmt::Display for UnknownZone {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{} is not an IANA zone name", self.0)
    }
}

impl std::error::Error for UnknownZone {}

impl std::str::FromStr for Tz {
    type Err = UnknownZone;

    fn from_str(name: &str) -> Result<Self, Self::Err> {
        Tz::get(name).ok_or_else(|| UnknownZone(name.to_owned()))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn zone_names_are_case_sensitive_and_kept_as_spelled() {
        assert_eq!(
            Tz::get("America/Los_Angeles").map(|tz| tz.name()),
            Some("America/Los_Angeles")
        );
        assert_eq!(Tz::get("america/los_angeles"), None);
        assert_eq!(
            Tz::get("US/Pacific").map(|tz| tz.name()),
            Some("US/Pacific")
        );
        assert_eq!(Tz::get("UTC"), Some(Tz::UTC));
        assert_eq!("Middle/Earth".parse::<Tz>().ok(), None);
        assert_eq!(
            Tz::get("Europe/Berlin").map(|tz| tz.to_string()),
            Some("Europe/Berlin".to_owned())
        );
    }
}
