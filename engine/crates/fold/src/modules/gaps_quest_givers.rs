//! A known NPC's page that lacks a quest the catalog says it gives (owner, 2026-11-09: Lord Ollix
//! Everling's page lists none of The Tragic Tale of House Everling, and the app showed nothing). The
//! Mobs domain files only names the wiki lacks, and a quest enters the app only through a task line,
//! which a giver's talk need not print. So the log meeting such an NPC (a hail, a /con, a kill, its
//! loot) files a Mobs row for the known name, an Update page, carrying the page and the quests it
//! lacks (`questGaps`). The index is the knowledge crate's (`gap_index.rs mob_quest_gaps_of`).
//!
//! A child of `gaps.rs` (it files through the module's own `note`), apart so that file keeps its size.

use super::{Domain, GapsModule};
use crate::event::Event;
use crate::knowledge::GapIndex;
use crate::modules::consider::mob_key;
use serde::Serialize;
use std::collections::HashMap;

/// What a quest-giver row carries beyond a row's own fields: the page and the quest pages it lacks.
#[derive(Debug, Clone, Serialize)]
pub struct QuestGaps {
    page: String,
    quests: Vec<String>,
}

/// The pages lacking a quest their NPC gives, by the key each name of theirs folds to. The first
/// page under a shared name keeps it (a name split over several pages is rare and the row names one).
#[derive(Default)]
pub struct QuestGivers {
    mobs: HashMap<String, QuestGaps>,
}

impl QuestGivers {
    pub fn new(index: &GapIndex) -> Self {
        let mut mobs: HashMap<String, QuestGaps> = HashMap::new();
        for (name, page, quests) in &index.mob_quest_gaps {
            mobs.entry(mob_key(name)).or_insert_with(|| QuestGaps { page: page.clone(), quests: quests.clone() });
        }
        Self { mobs }
    }
}

impl GapsModule {
    /// A known mob met whose page lacks a quest it gives: a Mobs row for it, the gaps on the row.
    /// True when a row changed.
    pub(super) fn quest_gap(&mut self, domain: Domain, key: &str, name: &str, kind: &'static str, ev: &Event) -> bool {
        if domain != Domain::Mob {
            return false;
        }
        let Some(gaps) = self.quest_givers.mobs.get(key).cloned() else {
            return false;
        };
        let filed = self.note(Domain::Mob, key.to_string(), name, false, kind, ev);
        if let Some(row) = self.rows.get_mut(&(Domain::Mob, key.to_string())) {
            row.quest_gaps = Some(gaps);
        }
        filed
    }
}
