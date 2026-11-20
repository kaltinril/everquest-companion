//! The file under a running read, through a real ingest and the suite's own rig: a fold held at its
//! first event is a read a test can move the file under without racing it.

use super::{append, recording_world, scan_oracle, settle, Gate, Ledger, Scratch};
use eqlog::tail::modified_ms;
use protocol::generated::HealthResultStatus;
use std::path::Path;
use std::sync::Arc;

/// The file's own modified time, asked of the disk by the test.
fn on_disk(log: &Path) -> Option<i64> {
    std::fs::metadata(log).ok().as_ref().and_then(modified_ms)
}

/// The log moved aside, the way the archive and a player's own tidy-up both do it.
fn moved_aside(log: &Path) {
    std::fs::rename(log, log.with_extension("old")).expect("the log moves aside");
}

/// Health says when the log was last written while the scan is still running, and it is the
/// reader's stamp: with the file moved away under the read, an answer that asked the disk by name
/// would have nothing to say.
#[test]
fn health_states_the_files_time_during_the_scan_without_asking_the_disk() {
    let scratch = Scratch::new("stamp-scan");
    let log = scratch.stage();
    let truth = on_disk(&log);
    assert!(truth.is_some(), "this filesystem keeps a modified time");
    let ledger = Arc::new(Ledger::default());
    let gate = Arc::new(Gate::default());
    let world = recording_world(&ledger, Some(Arc::clone(&gate)));

    world.attach(&log.to_string_lossy(), None, eqlog::ZoneHint::default());
    settle("the scan to reach its first event", || {
        !ledger.of(0).is_empty()
    });
    assert_eq!(world.health().log_mtime_ms, truth, "the open's own stamp");

    moved_aside(&log);
    assert_eq!(
        world.health().log_mtime_ms,
        truth,
        "health asked the disk: the path has no file and the answer changed"
    );
    gate.release();
}

/// Once live, the stamp follows the file from the stat each poll of the tail already makes: a line
/// the game writes moves it, and a log that goes away leaves no time at all.
#[test]
fn once_live_health_follows_the_file_from_the_tails_own_poll() {
    let scratch = Scratch::new("stamp-live");
    let log = scratch.stage();
    let scanned = scan_oracle(&log);
    let ledger = Arc::new(Ledger::default());
    let world = recording_world(&ledger, None);

    world.attach(&log.to_string_lossy(), None, eqlog::ZoneHint::default());
    settle("the fold to land", || {
        matches!(world.health().status, HealthResultStatus::Live)
    });
    settle("the first poll's stamp", || {
        world.health().log_mtime_ms == on_disk(&log)
    });

    // Long enough that the append is worth a tick of the filesystem's clock.
    std::thread::sleep(std::time::Duration::from_millis(20));
    append(
        &log,
        "[Wed Aug 19 16:21:54 2026] You gain experience! (3.288%)\n",
    );
    settle("the appended line and its stamp", || {
        world.mark().events == scanned + 1 && world.health().log_mtime_ms == on_disk(&log)
    });

    moved_aside(&log);
    settle("a log that went away to have no time", || {
        world.health().log_mtime_ms.is_none()
    });
    assert!(
        matches!(world.health().status, HealthResultStatus::Live),
        "the tail waits for the file, as before"
    );
}
