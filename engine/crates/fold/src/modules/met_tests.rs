use crate::event::Event;
use crate::{registered, ClusterDeps, Fold};
use serde_json::{json, Value};

fn folded(lines: &[&str]) -> Fold {
    let mut fold = Fold::new(registered(ClusterDeps::default()), i64::MAX);
    for line in lines {
        fold.on_primary(&Event::from_json(line).expect("a JSON object"), false);
    }
    fold
}

fn state(fold: &Fold, id: &str) -> Value {
    fold.registry.snapshot_of(id).expect("registered")["state"].clone()
}

fn cursor(fold: &Fold) -> i64 {
    let seqs = fold.registry.published_seqs();
    seqs.into_iter()
        .find(|(id, _)| *id == "met")
        .expect("met announces")
        .1
}

const ZONE: &str = r#"{"kind":"zone","seq":1,"ts":1000,"raw":"z","zone":"Nagafen's Lair"}"#;
const LOOT: &str =
    r#"{"kind":"loot","item":"Bone Chips","source":"a gnoll","seq":2,"ts":2000,"raw":"x"}"#;
const CON: &str =
    r#"{"kind":"consider","mob":"a lava spider","level":40,"seq":3,"ts":3000,"raw":"x"}"#;
const PET: &str =
    r#"{"kind":"petClaim","seq":4,"ts":4000,"raw":"p","name":"Gobekn","via":"leader"}"#;
const PET_DIES: &str = r#"{"kind":"death","seq":5,"ts":5000,"raw":"d","name":"Gobekn","bySelf":false,"killer":"Terror"}"#;
const KILL: &str =
    r#"{"kind":"death","seq":6,"ts":6000,"raw":"d","name":"a fire beetle","bySelf":true}"#;
const BOSS: &str =
    r#"{"kind":"death","seq":7,"ts":7000,"raw":"d","name":"Lord Nagafen","bySelf":true}"#;

/// Every mob killed, looted from or conned, every item looted, every zone entered; never a pet.
#[test]
fn the_names_are_what_the_other_modules_fold() {
    let fold = folded(&[ZONE, LOOT, CON, PET, PET_DIES, KILL]);
    let met = state(&fold, "met");
    assert_eq!(
        met["mobs"],
        json!(["a fire beetle", "a gnoll", "a lava spider"])
    );
    assert_eq!(met["items"], json!(["Bone Chips"]));
    assert_eq!(met["zones"], json!(["Nagafen's Lair"]));
    assert_eq!(met["bosses"], json!({}));
    // The kills module's own display set, which the app used to read.
    let kills = state(&fold, "kills");
    let shown: Vec<&str> = kills["mobs"]
        .as_object()
        .expect("mobs")
        .values()
        .map(|k| k["display"].as_str().expect("display"))
        .collect();
    assert_eq!(shown, ["a fire beetle"]);
}

/// A roster boss's record is the kills map's own, under its key.
#[test]
fn a_roster_boss_carries_its_kill_record() {
    let fold = folded(&[ZONE, KILL, BOSS]);
    let met = state(&fold, "met");
    let kills = state(&fold, "kills");
    assert_eq!(
        met["bosses"],
        json!({ "lord nagafen": kills["mobs"]["lord nagafen"] })
    );
}

/// The cursor moves for something new and stays put for a repeat: the point of the module.
#[test]
fn a_repeat_moves_nothing() {
    let once = folded(&[ZONE, LOOT, KILL]);
    let twice = folded(&[
        ZONE,
        LOOT,
        KILL,
        r#"{"kind":"loot","item":"Bone Chips","source":"a gnoll","seq":8,"ts":8000,"raw":"x"}"#,
        r#"{"kind":"death","seq":9,"ts":9000,"raw":"d","name":"a fire beetle","bySelf":true}"#,
    ]);
    assert_eq!(cursor(&once), cursor(&twice));
    let more = folded(&[ZONE, LOOT, KILL, BOSS]);
    assert!(cursor(&more) > cursor(&once));
    let again = folded(&[
        ZONE,
        LOOT,
        KILL,
        BOSS,
        r#"{"kind":"death","seq":9,"ts":9000,"raw":"d","name":"Lord Nagafen","bySelf":true}"#,
    ]);
    assert!(
        cursor(&again) > cursor(&more),
        "a boss's repeat kill is news"
    );
}

/// A rebirth clears what the dead character met, as the four source modules do.
#[test]
fn the_epoch_clears_everything() {
    let fold = folded(&[
        ZONE,
        LOOT,
        BOSS,
        r#"{"kind":"epoch","seq":9,"ts":9000,"raw":"e"}"#,
    ]);
    assert_eq!(
        state(&fold, "met"),
        json!({ "mobs": [], "items": [], "zones": [], "bosses": {} })
    );
}

/// `bossStatus.ts matchKey`: one leading article off, then trimmed.
#[test]
fn the_match_key_is_the_apps() {
    assert_eq!(
        super::match_key("A Thunder Spirit Princess"),
        "thunder spirit princess"
    );
    assert_eq!(super::match_key("an ogre"), "ogre");
    assert_eq!(super::match_key("The Avatar of War "), "avatar of war");
    assert_eq!(super::match_key("Theodore"), "theodore");
}

/// The loot and consider modules keep the zone they stamp across a rebirth; so does this one.
#[test]
fn a_loot_after_a_rebirth_still_names_its_zone() {
    let fold = folded(&[
        ZONE,
        r#"{"kind":"epoch","seq":2,"ts":2000,"raw":"e"}"#,
        r#"{"kind":"loot","item":"Bone Chips","source":"a gnoll","seq":3,"ts":3000,"raw":"x"}"#,
    ]);
    assert_eq!(state(&fold, "met")["zones"], json!(["Nagafen's Lair"]));
}
