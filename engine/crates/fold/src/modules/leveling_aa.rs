//! The leveling module's two kinds of AA ownership evidence that are not purchase lines: the
//! character's latest `/alt list` run, and the AAs the log shows the player activating.
//!
//! THE RUN (MEASURED.md, "Alternate advancement"). Each AA prints a three-line block (`aaList` events:
//! header `value`+`ability`, then `text`, then `cost`), every block of one run inside about a second.
//! An AA owned but not maxed prints two blocks with the same id back to back (current rank, next
//! rank), so only a repeat of an id that is NOT the block just before starts a new run; so does a
//! header more than `RUN_GAP_MS` after the run's last line. A new run replaces the old one whole.
//! Reading a rank out of a block is the app's (`src/shared/aaList.ts`), which holds the AA table.
//!
//! ACTIVATIONS. `You activate <name>.` (`aaActivate`) for every name, AA or not (`Skull Bash` is a
//! skill): the app keeps only names its AA table has. First and last stamp per name.

use crate::event::{Event, Key};
use serde::Serialize;

/// Lines of one run further apart than this belong to two runs (one run prints in about 1 s).
const RUN_GAP_MS: i64 = 2_000;

#[derive(Debug, Clone, Serialize)]
pub struct AaListBlock {
    id: i64,
    name: String,
    description: String,
    cost: Option<i64>,
}

#[derive(Debug, Clone, Serialize)]
pub struct AaListRun {
    /// The first header's stamp.
    ts: i64,
    blocks: Vec<AaListBlock>,
    /// The run's last line, for the gap test. Not published.
    #[serde(skip)]
    last_ts: i64,
}

impl AaListRun {
    fn continues(&self, ts: i64, id: i64) -> bool {
        if ts - self.last_ts > RUN_GAP_MS {
            return false;
        }
        let prev = self.blocks.last().map(|b| b.id);
        prev == Some(id) || !self.blocks.iter().any(|b| b.id == id)
    }
}

/// Folds one `aaList` line into the latest run. Returns whether the published run changed.
pub fn fold_list_line(run: &mut Option<AaListRun>, ev: &Event) -> bool {
    let ts = ev.ts();
    if let Some(id) = ev.int(Key::Value) {
        let name = ev.str(Key::Ability).unwrap_or_default().to_string();
        let block = AaListBlock {
            id,
            name,
            description: String::new(),
            cost: None,
        };
        match run {
            Some(r) if r.continues(ts, id) => {
                r.blocks.push(block);
                r.last_ts = ts;
            }
            _ => {
                *run = Some(AaListRun {
                    ts,
                    blocks: vec![block],
                    last_ts: ts,
                })
            }
        }
        return true;
    }
    // A description or cost line belongs to the header just before it, in the same run.
    let Some(r) = run.as_mut().filter(|r| ts - r.last_ts <= RUN_GAP_MS) else {
        return false;
    };
    let Some(block) = r.blocks.last_mut() else {
        return false;
    };
    if let Some(text) = ev.str(Key::Text) {
        if !block.description.is_empty() {
            return false;
        }
        block.description = text.to_string();
    } else if let Some(cost) = ev.int(Key::Cost) {
        if block.cost.is_some() {
            return false;
        }
        block.cost = Some(cost);
    } else {
        return false;
    }
    r.last_ts = ts;
    true
}

#[derive(Debug, Clone, Serialize)]
pub struct AaActivation {
    name: String,
    first: i64,
    last: i64,
}

/// Folds one `aaActivate` line. Returns true only for a name not seen before: a repeat moves `last`
/// without announcing, so a Quick Buff every ten minutes does not refetch the whole history.
pub fn fold_activation(seen: &mut Vec<AaActivation>, ev: &Event) -> bool {
    let Some(name) = ev.str(Key::Name).filter(|n| !n.is_empty()) else {
        return false;
    };
    let ts = ev.ts();
    if let Some(a) = seen.iter_mut().find(|a| a.name == name) {
        a.last = a.last.max(ts);
        return false;
    }
    seen.push(AaActivation {
        name: name.to_string(),
        first: ts,
        last: ts,
    });
    true
}

#[cfg(test)]
mod tests {
    use super::*;

    fn ev(json: &str) -> Event<'static> {
        Event::from_json(json).expect("event")
    }

    fn header(ts: i64, id: i64, name: &str) -> Event<'static> {
        ev(&format!(
            r#"{{"kind":"aaList","seq":1,"ts":{ts},"raw":"h","value":{id},"ability":"{name}"}}"#
        ))
    }

    fn text(ts: i64, t: &str) -> Event<'static> {
        ev(&format!(
            r#"{{"kind":"aaList","seq":1,"ts":{ts},"raw":"d","text":"{t}"}}"#
        ))
    }

    fn cost(ts: i64, c: i64) -> Event<'static> {
        ev(&format!(
            r#"{{"kind":"aaList","seq":1,"ts":{ts},"raw":"c","cost":{c}}}"#
        ))
    }

    fn block(run: &mut Option<AaListRun>, ts: i64, id: i64, name: &str, t: &str, c: i64) {
        assert!(fold_list_line(run, &header(ts, id, name)));
        assert!(fold_list_line(run, &text(ts, t)));
        assert!(fold_list_line(run, &cost(ts, c)));
    }

    #[test]
    fn a_run_joins_its_blocks_and_keeps_a_current_and_next_rank_pair() {
        let mut run = None;
        block(&mut run, 1000, 40, "Combat Fury", "by 5%.", 4);
        block(&mut run, 1000, 15073, "Banestrike", "by 2%.", 0);
        block(&mut run, 1000, 15073, "Banestrike", "by 4%.", 0);
        let r = run.as_ref().unwrap();
        assert_eq!(r.blocks.len(), 3);
        assert_eq!(r.blocks[0].name, "Combat Fury");
        assert_eq!(r.blocks[0].description, "by 5%.");
        assert_eq!(r.blocks[0].cost, Some(4));
        assert_eq!(r.blocks[2].description, "by 4%.");
    }

    #[test]
    fn a_later_run_replaces_the_earlier_one_on_a_gap_or_a_repeated_id() {
        let mut run = None;
        block(&mut run, 1000, 40, "Combat Fury", "by 1%.", 1);
        block(&mut run, 1000, 4, "Quick Buff", "q", 5);
        // Two seconds later is still the same run; more is a new one.
        block(&mut run, 5000, 40, "Combat Fury", "by 5%.", 4);
        let r = run.as_ref().unwrap();
        assert_eq!((r.ts, r.blocks.len(), r.blocks[0].cost), (5000, 1, Some(4)));
        // Within the second, an id already in the run (not the block before) starts a new run.
        block(&mut run, 5000, 4, "Quick Buff", "q", 5);
        block(&mut run, 5000, 40, "Combat Fury", "by 2%.", 2);
        let r = run.as_ref().unwrap();
        assert_eq!(r.blocks.len(), 1);
        assert_eq!(r.blocks[0].description, "by 2%.");
    }

    #[test]
    fn a_stray_description_or_cost_line_changes_nothing() {
        let mut run = None;
        assert!(!fold_list_line(&mut run, &text(1000, "lone")));
        block(&mut run, 1000, 40, "Combat Fury", "by 5%.", 4);
        assert!(!fold_list_line(&mut run, &text(9000, "late")));
        assert!(!fold_list_line(&mut run, &cost(1000, 9)));
        assert_eq!(run.unwrap().blocks[0].cost, Some(4));
    }

    #[test]
    fn an_activation_is_new_once_and_then_only_moves_its_last_stamp() {
        let mut seen = Vec::new();
        let act = |ts: i64, n: &str| {
            ev(&format!(
                r#"{{"kind":"aaActivate","seq":1,"ts":{ts},"raw":"a","name":"{n}"}}"#
            ))
        };
        assert!(fold_activation(&mut seen, &act(1000, "Quick Buff")));
        assert!(!fold_activation(&mut seen, &act(9000, "Quick Buff")));
        assert!(fold_activation(&mut seen, &act(9500, "Skull Bash")));
        assert_eq!((seen[0].first, seen[0].last), (1000, 9000));
        assert_eq!(seen.len(), 2);
    }
}
