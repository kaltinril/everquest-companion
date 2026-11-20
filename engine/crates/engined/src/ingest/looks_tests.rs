//! The reader's looks, against a world that folds nothing: what `session.health` says after each.

use super::{polled, Looks, LOOK_EVERY};
use crate::ingest::Cadence;
use crate::world::World;
use eqlog::tail::{modified_ms, PollStats};
use std::fs::File;
use std::io;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Arc;

/// A world whose attach starts nothing, attached to `log`, and the turn that owns it.
fn attached(log: &Path) -> (World, u64) {
    let turn = Arc::new(AtomicU64::new(0));
    let seen = Arc::clone(&turn);
    let world = World::with_ingest(Arc::new(move |_world, generation, _attach| {
        seen.store(generation, Ordering::SeqCst);
    }));
    world.attach(&log.to_string_lossy(), None, eqlog::ZoneHint::default());
    (world, turn.load(Ordering::SeqCst))
}

/// A scratch file with a few bytes in it, removed when the test ends.
struct Scratch(PathBuf);

impl Scratch {
    fn new(tag: &str) -> Self {
        let path = std::env::temp_dir().join(format!(
            "engined-looks-{}-{tag}.txt",
            std::process::id()
        ));
        std::fs::write(&path, b"[Wed Aug 19 16:00:00 2026] one.\n").expect("a scratch file");
        Self(path)
    }
}

impl Drop for Scratch {
    fn drop(&mut self) {
        let _ignored = std::fs::remove_file(&self.0);
    }
}

/// What the world's health answer says the log's time is.
fn said(world: &World) -> Option<i64> {
    world.health().log_mtime_ms
}

#[test]
fn the_open_states_the_files_time_and_the_scan_restates_it_at_most_once_a_second() {
    let scratch = Scratch::new("open");
    let (world, turn) = attached(&scratch.0);
    let file = File::open(&scratch.0).expect("the scratch file opens");
    let meta = file.metadata().expect("its metadata");
    let truth = modified_ms(&meta);
    assert!(truth.is_some(), "this filesystem keeps a modified time");

    let mut looks = Looks::opened(&world, turn, &meta);
    assert_eq!(said(&world), truth, "the open's own stamp");

    // A boundary inside the second: the handle is not asked again. The marker is what shows it.
    assert!(world.report_log_mtime(turn, Some(1)));
    looks.scanning(&world, turn, &file);
    assert_eq!(said(&world), Some(1), "one look a second, not one per megabyte");

    // A look that is owed is taken off the handle, and the one after it waits again.
    let mut owed = Looks {
        cadence: Cadence::every(LOOK_EVERY),
    };
    owed.scanning(&world, turn, &file);
    assert_eq!(said(&world), truth);
    assert!(world.report_log_mtime(turn, Some(2)));
    owed.scanning(&world, turn, &file);
    assert_eq!(said(&world), Some(2));
}

#[test]
fn a_tail_polls_time_is_passed_on_and_a_poll_with_no_file_or_no_answer_has_none() {
    let scratch = Scratch::new("poll");
    let (world, turn) = attached(&scratch.0);

    let seen = PollStats {
        modified_ms: Some(1_787_181_707_123),
        ..PollStats::default()
    };
    polled(&world, turn, &Ok(seen));
    assert_eq!(said(&world), Some(1_787_181_707_123));

    let missing = PollStats {
        missing: true,
        ..PollStats::default()
    };
    polled(&world, turn, &Ok(missing));
    assert_eq!(said(&world), None, "no file, no time: never the last one seen");

    polled(&world, turn, &Ok(seen));
    polled(&world, turn, &Err(io::Error::other("the drive went away")));
    assert_eq!(said(&world), None, "a poll that failed looked at nothing");
}

#[test]
fn a_turn_that_lost_the_world_states_nothing() {
    let scratch = Scratch::new("lost");
    let (world, loser) = attached(&scratch.0);
    world.attach(&scratch.0.to_string_lossy(), None, eqlog::ZoneHint::default());

    let file = File::open(&scratch.0).expect("the scratch file opens");
    let meta = file.metadata().expect("its metadata");
    let _looks = Looks::opened(&world, loser, &meta);
    let seen = PollStats {
        modified_ms: Some(9),
        ..PollStats::default()
    };
    polled(&world, loser, &Ok(seen));
    assert_eq!(said(&world), None, "the new read has not looked yet");
}
