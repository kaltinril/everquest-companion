//! The reader's own looks at the log file: when it was last written.
//!
//! `session.health` reports the log's modified time and must never ask the disk for it. A stat on
//! a dropped share can block for longer than the app's health probe waits, two missed probes end
//! the engine, and the engine that was ended was healthy. So every stat of the log is made here, on
//! the ingest thread, which waits on the file anyway, and handed to the world
//! (`World::report_log_mtime`): at the open, at most once a second while the scan runs, and from
//! the stat every tail poll already makes. What health reports is therefore
//! the reader's last look, under a second old while the reader is moving.
//!
//! Nothing here reaches a sink: a file's time is not a fold input.

use std::fs::{File, Metadata};
use std::io;
use std::time::Duration;

use eqlog::tail::{modified_ms, PollStats};

use super::Cadence;
use crate::world::World;

/// The longest the scan goes between two looks at the file's time.
const LOOK_EVERY: Duration = Duration::from_secs(1);

/// The scan's pacer for its looks. The tail needs none: it looks once per poll.
pub(super) struct Looks {
    cadence: Cadence,
}

impl Looks {
    /// The open: the first look, off the metadata the open already read from its own handle.
    pub(super) fn opened(world: &World, generation: u64, meta: &Metadata) -> Self {
        world.report_log_mtime(generation, modified_ms(meta));
        Self {
            cadence: Cadence::from_now(LOOK_EVERY),
        }
    }

    /// A scan boundary: at most once a second the handle is asked again. A turn that lost the world
    /// reports nothing, and the scan's own ownership poll is what ends it.
    pub(super) fn scanning(&mut self, world: &World, generation: u64, file: &File) {
        if self.cadence.due() {
            let stamp = file.metadata().ok().as_ref().and_then(modified_ms);
            world.report_log_mtime(generation, stamp);
        }
    }
}

/// A tail poll's own stat, passed on. A poll that found no file, or failed, has no time to state.
pub(super) fn polled(world: &World, generation: u64, polled: &io::Result<PollStats>) {
    let stamp = polled.as_ref().ok().and_then(|stats| stats.modified_ms);
    world.report_log_mtime(generation, stamp);
}

#[cfg(test)]
#[path = "looks_tests.rs"]
mod tests;
