//! The gaps module's index off the committed corpora — see [`fold::knowledge::GapIndex`]. Apart
//! from `lib.rs` so that file stays under its recorded size.

use crate::mobs::MobIndex;
use crate::names::item_key;
use fold::knowledge::GapIndex;
use fold::modules::consider::mob_key;
use serde_json::{Map, Value};
use std::collections::{HashMap, HashSet};

/// The item keys with their pages, every effect an item states, and the mob catalog's names.
///
/// A record's `otherNames` (the wiki redirects that land on its page) are names of that page too
/// (owner, 2026-10-22: "no one told you to restrict it to mobs only"), handed over apart from its
/// own keys: a name known only through a redirect is a row to check, since a redirect can be wrong
/// (Halfling Blood was sent to Vial of Halfling Blood, a different item).
pub(crate) fn build(items: &Map<String, Value>, mobs: &MobIndex, quests: &[Value]) -> GapIndex {
    let page = |k: &String, e: &Value| e["page"].as_str().unwrap_or(k).to_string();
    let item_pages = items.iter().map(|(k, e)| (k.clone(), page(k, e))).collect();
    let item_redirects = items
        .iter()
        .flat_map(|(k, e)| {
            let others = e["otherNames"].as_array().into_iter().flatten();
            let keys = others.filter_map(Value::as_str).map(item_key).filter(|o| !o.is_empty());
            keys.map(|key| (key, page(k, e))).collect::<Vec<_>>()
        })
        .collect();
    let item_effects = items
        .iter()
        .flat_map(|(k, e)| {
            let effects = e["stats"]["effects"]
                .as_array()
                .cloned()
                .unwrap_or_default();
            let page = page(k, e);
            effects.into_iter().filter_map(move |x| {
                let name = x["name"].as_str()?.trim().to_string();
                (!name.is_empty()).then(|| (name, page.clone()))
            })
        })
        .collect();
    GapIndex {
        item_notices: item_notices(items),
        mob_notices: mob_notices_of(mobs.names().iter().filter_map(|n| mobs.entry(n))),
        mob_quest_gaps: mob_quest_gaps_of(mobs.names().iter().filter_map(|n| mobs.entry(n)), quests),
        item_pages,
        item_effects,
        mob_names: mobs.names().to_vec(),
        mob_pages: mobs.records().iter().filter_map(|m| m["page"].as_str()).map(str::to_string).collect(),
        mob_zone_splits: mob_zone_splits_of(mobs.records()),
        item_redirects,
        mob_redirects: mob_redirects_of(mobs.names().iter().filter_map(|n| mobs.entry(n))),
    }
}

/// Every mob page titled with a disambiguation (`A kobold (Warrens)`, `Cazic-Thule (God)`), with the
/// zones its record states: the plain name is that page's only where the record says it is.
fn mob_zone_splits_of(records: &[Value]) -> Vec<(String, Vec<String>)> {
    let titled = |t: &str| t.ends_with(')') && t.contains(" (");
    records
        .iter()
        .filter_map(|m| {
            let page = m["page"].as_str()?;
            if !titled(page) && !m["name"].as_str().is_some_and(titled) {
                return None;
            }
            let zones = m["zones"].as_array().into_iter().flatten().filter_map(Value::as_str).map(str::to_string).collect();
            Some((page.to_string(), zones))
        })
        .collect()
}

/// Every `(redirect name, page)` of the mob records, each page once.
fn mob_redirects_of<'a>(mobs: impl Iterator<Item = &'a Value>) -> Vec<(String, String)> {
    let mut pages = std::collections::HashSet::new();
    let mut out = Vec::new();
    for m in mobs {
        let Some(page) = m["page"].as_str().filter(|p| pages.insert(p.to_string())) else {
            continue;
        };
        let others = m["otherNames"].as_array().into_iter().flatten().filter_map(Value::as_str);
        out.extend(others.map(|n| (n.to_string(), page.to_string())));
    }
    out
}

/// A record's `notices` (`DNE`, `delete`, `delete: <reason>`; scripts/sources pageNotices).
fn notices_of(e: &Value) -> Vec<String> {
    let listed = e["notices"].as_array().into_iter().flatten();
    listed.filter_map(Value::as_str).map(str::to_string).collect()
}

/// Every item key, and each redirect name of the record, whose page carries a notice.
fn item_notices(items: &Map<String, Value>) -> Vec<(String, String, Vec<String>)> {
    let mut out = Vec::new();
    for (k, e) in items {
        let notices = notices_of(e);
        if notices.is_empty() {
            continue;
        }
        let page = e["page"].as_str().unwrap_or(k).to_string();
        let others = e["otherNames"].as_array().into_iter().flatten().filter_map(Value::as_str);
        for key in std::iter::once(k.clone()).chain(others.map(item_key)) {
            out.push((key, page.clone(), notices.clone()));
        }
    }
    out
}

/// Every name a mob page whose text carries a notice answers to: its `|name`, title and redirects.
fn mob_notices_of<'a>(mobs: impl Iterator<Item = &'a Value>) -> Vec<(String, String, Vec<String>)> {
    // The mob index answers each record under several names: each page once.
    let mut pages = std::collections::HashSet::new();
    let mut out = Vec::new();
    for m in mobs {
        let notices = notices_of(m);
        let Some(page) = m["page"].as_str().filter(|p| !notices.is_empty() && pages.insert(p.to_string())) else {
            continue;
        };
        let others = m["otherNames"].as_array().into_iter().flatten().filter_map(Value::as_str);
        let names = [m["name"].as_str(), Some(page)].into_iter().flatten().chain(others);
        out.extend(names.map(|n| (n.to_string(), page.to_string(), notices.clone())));
    }
    out
}

/// A quest page title as two lists compare it: case apart, the game's backtick as the wiki's apostrophe.
fn quest_title_key(title: &str) -> String {
    title.trim().to_lowercase().replace('`', "'")
}

/// The quest pages each giver's mob key gives, off the quest catalog's `giver`.
fn quests_by_giver(quests: &[Value]) -> HashMap<String, Vec<String>> {
    let mut out: HashMap<String, Vec<String>> = HashMap::new();
    for q in quests {
        let Some(giver) = q["giver"].as_str().map(mob_key).filter(|g| !g.is_empty()) else {
            continue;
        };
        let Some(page) = q["page"].as_str().or_else(|| q["name"].as_str()).filter(|p| !p.trim().is_empty()) else {
            continue;
        };
        let given = out.entry(giver).or_default();
        if !given.iter().any(|p| quest_title_key(p) == quest_title_key(page)) {
            given.push(page.to_string());
        }
    }
    out
}

/// Every name a mob page answers to whose page lacks a quest the catalog says that NPC gives
/// (owner, 2026-11-09): `(name, page, the quest pages missing)`, each page once. A giver matches by
/// mob key under any of the page's names; a quest is listed when `relatedQuests` names its page.
fn mob_quest_gaps_of<'a>(mobs: impl Iterator<Item = &'a Value>, quests: &[Value]) -> Vec<(String, String, Vec<String>)> {
    let by_giver = quests_by_giver(quests);
    let mut pages = HashSet::new();
    let mut out = Vec::new();
    for m in mobs {
        let Some(page) = m["page"].as_str().filter(|p| pages.insert(p.to_string())) else {
            continue;
        };
        let others = m["otherNames"].as_array().into_iter().flatten().filter_map(Value::as_str);
        let names: Vec<&str> = [m["name"].as_str(), Some(page)].into_iter().flatten().chain(others).filter(|n| !n.trim().is_empty()).collect();
        let listed: Vec<String> = m["relatedQuests"].as_array().into_iter().flatten().filter_map(Value::as_str).map(quest_title_key).collect();
        let mut missing: Vec<String> = Vec::new();
        for given in names.iter().filter_map(|n| by_giver.get(&mob_key(n))) {
            for q in given {
                if !listed.contains(&quest_title_key(q)) && !missing.iter().any(|x| quest_title_key(x) == quest_title_key(q)) {
                    missing.push(q.clone());
                }
            }
        }
        if missing.is_empty() {
            continue;
        }
        out.extend(names.iter().map(|n| (n.to_string(), page.to_string(), missing.clone())));
    }
    out
}

#[cfg(test)]
mod tests {
    use super::{build, mob_notices_of, mob_quest_gaps_of};
    use crate::mobs::MobIndex;
    use serde_json::{json, Map, Value};

    #[test]
    fn an_items_other_names_are_its_pages_redirects_apart_from_its_own_keys() {
        // Owner, 2026-10-22: Halfling Blood redirects to Vial of Halfling Blood and was a Gaps row.
        let items: Map<String, Value> = serde_json::from_value(json!({
            "vial of halfling blood": {"page": "Vial of Halfling Blood", "otherNames": ["Halfling Blood"]},
            "rusty mace": {"page": "Rusty Mace"}
        }))
        .unwrap();
        let index = build(&items, &MobIndex::build(), &[]);
        let pages: Vec<(&str, &str)> = index
            .item_pages
            .iter()
            .map(|(k, p)| (k.as_str(), p.as_str()))
            .collect();
        // Own keys only: a redirect can be wrong, so its name is handed over apart.
        assert_eq!(pages.len(), 2, "{pages:?}");
        assert!(pages.contains(&("vial of halfling blood", "Vial of Halfling Blood")));
        assert!(pages.contains(&("rusty mace", "Rusty Mace")));
        assert_eq!(
            index.item_redirects,
            [("halfling blood".to_string(), "Vial of Halfling Blood".to_string())]
        );
    }

    #[test]
    fn a_page_with_a_notice_is_listed_under_every_name_it_answers_to() {
        // Owner, 2026-10-22: A Rotting Citizen opens {{delete}}{{DNE}}.
        let mobs = r#"{"mobs":[
          {"page":"A Rotting Citizen","name":"a rotting citizen","notices":["delete","DNE"],"otherNames":["Rotting Citizen"]},
          {"page":"A bat","name":"a bat"}
        ]}"#;
        let mobs: Value = serde_json::from_str(mobs).unwrap();
        let records = mobs["mobs"].as_array().unwrap();
        let names: Vec<String> = mob_notices_of(records.iter().chain(records.iter())).into_iter().map(|(n, _, _)| n).collect();
        assert_eq!(names, ["a rotting citizen", "A Rotting Citizen", "Rotting Citizen"]);
        let items: Map<String, Value> = serde_json::from_value(json!({
            "old thing": {"page": "Old Thing", "notices": ["delete: No longer in game"], "otherNames": ["Older Thing"]},
            "rusty mace": {"page": "Rusty Mace"}
        }))
        .unwrap();
        let index = build(&items, &MobIndex::build(), &[]);
        let keys: Vec<(&str, &str)> = index.item_notices.iter().map(|(k, p, _)| (k.as_str(), p.as_str())).collect();
        assert_eq!(keys, [("old thing", "Old Thing"), ("older thing", "Old Thing")]);
        assert_eq!(index.item_notices[0].2, ["delete: No longer in game"]);
    }

    #[test]
    fn a_quest_givers_page_that_does_not_list_the_quest_is_a_gap_under_every_name_it_answers_to() {
        // Owner, 2026-11-09: Lord Ollix Everling's page (a template stub) lists no quest; the
        // catalog says he gives The Tragic Tale of House Everling. Nikko Canti's page lists his two.
        let mobs: Value = serde_json::from_str(
            r#"{"mobs":[
          {"page":"Lord Ollix Everling","name":"NPC Name","otherNames":["Ollix"]},
          {"page":"Nikko Canti","name":"Nikko Canti","relatedQuests":["Something Fishy","Alchemical solution"]},
          {"page":"A bat","name":"a bat"}
        ]}"#,
        )
        .unwrap();
        let records = mobs["mobs"].as_array().unwrap();
        let quests = vec![
            json!({"name":"The Tragic Tale of House Everling","page":"The Tragic Tale of House Everling","giver":"Lord Ollix Everling"}),
            json!({"name":"Something Fishy","page":"Something Fishy","giver":"Nikko Canti"}),
            json!({"name":"Alchemical Solution","page":"Alchemical Solution","giver":"nikko canti"}),
            json!({"name":"No giver","page":"No giver"}),
        ];
        let tale = vec!["The Tragic Tale of House Everling".to_string()];
        let gaps = mob_quest_gaps_of(records.iter().chain(records.iter()), &quests);
        assert_eq!(
            gaps,
            [
                ("NPC Name".to_string(), "Lord Ollix Everling".to_string(), tale.clone()),
                ("Lord Ollix Everling".to_string(), "Lord Ollix Everling".to_string(), tale.clone()),
                ("Ollix".to_string(), "Lord Ollix Everling".to_string(), tale),
            ]
        );
    }
}
