//! The whole conversation with an NPC, for a new page's description (owner, 2026-11-21, of Malloy the
//! Songbird: "I Hailed this guy, went through his different hail prompts where I said those words back
//! to him ... We should be building up the full interaction chain with these guys"). Quest chains
//! (`gaps_threads.rs`) keep only what leads to a quest; this keeps what an NPC said, per NPC:
//!
//!   * THE HAIL: the NPC's lines in the ANSWER_MS after the player's hail.
//!   * EACH KEYWORD: a say within SAY_MS of the hail or the NPC's last line, answered in ANSWER_MS.
//!     Said again, the longest answer stays, so a song cut short by the next say keeps its full run.
//!   * VERSES: an NPC's timed lines after a keyword's answer, each VERSE_MIN_MS to VERSE_MAX_MS after
//!     the line before. Measured on the owner's logs (2026-11-21, 124 answered says): Malloy's five
//!     verses come 39-41 s apart; every other unprompted line in or below that band was a hand-in's
//!     reply, a shop greeting, or an answer to another player.
//!   * NOT THE PLAYER'S: the NPC's own hail answer after a keyword (a greeting to someone else: Guard
//!     Shilster, Voidling), a further line beside another player's say, a verse with a `[keyword]`,
//!     and anything after that player hails this NPC or after a trade opens.
//!
//! Capped per NPC and in total; a full store refuses new text rather than evicting what it holds.

use super::said_by;
use crate::modules::consider::mob_key;
use crate::modules::gaps_players::{hail_of, speaker_of};
use crate::modules::resist::world::is_player_shaped_name;
use serde::Serialize;
use serde_json::{json, Value};
use std::collections::HashMap;

use super::super::quests::REFUSAL;

/// An answer prints in the say's second or the next (123 of 124 measured; the other took 5 s).
const ANSWER_MS: i64 = 3_000;
/// A say goes to the NPC hailed or heard last within this long.
const SAY_MS: i64 = 60_000;
/// The spacing of an NPC's timed lines (module header).
const VERSE_MIN_MS: i64 = 30_000;
const VERSE_MAX_MS: i64 = 45_000;
/// Another player's line and the NPC's answer to it, either order (`gaps_quest_log.rs` OTHER_MS).
const OTHER_MS: i64 = 2_000;
const TURN_CAP: usize = 40;
const LINE_CAP: usize = 12;
const BYTES_CAP: usize = 4 * 1024 * 1024;

/// A keyword the player said and what the NPC answered.
#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
struct Asked {
    said: String,
    lines: Vec<String>,
}

/// One NPC's conversation as served: `{ hail, asked }`.
#[derive(Debug, Default, Serialize)]
struct Talked {
    hail: Vec<String>,
    asked: Vec<Asked>,
}

/// The exchange in progress: a hail (`said` none) or a keyword, and the lines answering it.
struct Open {
    key: String,
    npc: String,
    said: Option<String>,
    at: i64,
    last: i64,
    lines: Vec<String>,
    /// The newest line is a keyword's further line, so another player's line just after may take it back.
    loose: bool,
}

impl Open {
    fn new(npc: &str, said: Option<String>, at: i64) -> Self {
        Self { key: mob_key(npc), npc: npc.to_string(), said, at, last: at, lines: Vec::new(), loose: false }
    }
}

#[derive(Default)]
pub struct Dialogues {
    by: HashMap<String, Talked>,
    bytes: usize,
    /// The NPC hailed, and when it was hailed or last spoke.
    talking: Option<(String, i64)>,
    /// The player's say waiting for its answer.
    asked: Option<(String, i64)>,
    open: Option<Open>,
    other_at: Option<i64>,
}

fn text_size(lines: &[String]) -> usize {
    lines.iter().map(String::len).sum()
}

impl Dialogues {
    /// An unparsed line. True when what a row serves changed.
    pub fn line(&mut self, text: &str, ts: i64) -> bool {
        if let Some(said) = text.strip_prefix("You say, '").and_then(|r| r.strip_suffix('\'')) {
            self.you_said(text, said, ts);
            return false;
        }
        let Some(name) = speaker_of(text) else {
            return false;
        };
        let Some(npc) = self.talking.as_ref().map(|(n, _)| n.clone()) else {
            return false;
        };
        if !name.eq_ignore_ascii_case(&npc) {
            return self.other_said(name, text, ts);
        }
        let Some(said) = said_by(text, name).filter(|s| !s.contains(REFUSAL)) else {
            return false;
        };
        self.talking = Some((npc.clone(), ts));
        self.npc_said(&npc, said, ts)
    }

    /// A trade opened: what the NPC says next answers the trade.
    pub fn traded(&mut self) {
        self.open = None;
        self.asked = None;
    }

    fn you_said(&mut self, text: &str, said: &str, ts: i64) {
        self.asked = None;
        self.open = None;
        if let Some(npc) = hail_of(text) {
            self.talking = Some((npc.to_string(), ts));
            self.open = Some(Open::new(npc, None, ts));
        } else if self.talking.as_ref().is_some_and(|(_, at)| ts - at <= SAY_MS) {
            self.asked = Some((said.to_string(), ts));
        }
    }

    fn npc_said(&mut self, npc: &str, said: &str, ts: i64) -> bool {
        if let Some((asked, at)) = self.asked.take() {
            if ts - at > ANSWER_MS {
                return false;
            }
            self.open = Some(Open::new(npc, Some(asked), at));
        }
        let Some(open) = self.open.as_ref() else {
            return false;
        };
        let answer = ts - open.at <= ANSWER_MS;
        if !self.belongs(open, said, ts, answer) {
            // Timed lines come alone: anything else from it ends the run.
            if !answer {
                self.open = None;
            }
            return false;
        }
        let Some(open) = self.open.as_mut() else {
            return false;
        };
        open.loose = open.said.is_some() && !open.lines.is_empty();
        open.lines.push(said.to_string());
        open.last = ts;
        self.commit()
    }

    /// Whether an NPC line continues this exchange. Its own hail answer is a greeting to someone else
    /// (Voidling, Guard Shilster), and a further line beside another player's may answer them.
    fn belongs(&self, open: &Open, said: &str, ts: i64, answer: bool) -> bool {
        let asked = open.said.is_some();
        let more = !open.lines.is_empty();
        let greeting = asked && self.by.get(&open.key).is_some_and(|t| t.hail.iter().any(|l| l == said));
        let beside_other = more && self.other_at.is_some_and(|at| ts - at <= OTHER_MS);
        if greeting || beside_other || open.lines.len() >= LINE_CAP || open.lines.iter().any(|l| l == said) {
            return false;
        }
        answer || (asked && more && !said.contains('[') && (VERSE_MIN_MS..=VERSE_MAX_MS).contains(&(ts - open.last)))
    }

    /// Another speaker. A player's line beside a further line takes it back, as it may answer them;
    /// their hail of this NPC ends the exchange.
    fn other_said(&mut self, name: &str, text: &str, ts: i64) -> bool {
        if !is_player_shaped_name(name) {
            return false;
        }
        self.other_at = Some(ts);
        let hailed = text.split_once(" says, 'Hail, ").and_then(|(_, n)| n.strip_suffix('\''));
        let Some(open) = self.open.as_ref() else {
            return false;
        };
        let aimed = hailed.is_some_and(|n| n.eq_ignore_ascii_case(&open.npc));
        let changed = open.loose && ts - open.last <= OTHER_MS && self.take_back();
        if aimed {
            self.open = None;
        }
        changed
    }

    /// The newest verse leaves the exchange, and the store when the store holds this run.
    fn take_back(&mut self) -> bool {
        let Some(open) = self.open.as_mut() else {
            return false;
        };
        let held = self.by.get_mut(&open.key).and_then(|n| n.asked.iter_mut().find(|a| open.said.as_ref().is_some_and(|s| a.said.eq_ignore_ascii_case(s))));
        let stored = held.filter(|a| a.lines == open.lines);
        let line = open.lines.pop();
        open.loose = false;
        match (stored, line) {
            (Some(a), Some(l)) => {
                a.lines.pop();
                self.bytes -= l.len();
                true
            }
            _ => false,
        }
    }

    /// The open exchange into the store: the longest answer stays, the newer of two as long.
    fn commit(&mut self) -> bool {
        let Some(open) = self.open.as_ref() else {
            return false;
        };
        let talked = self.by.entry(open.key.clone()).or_default();
        let turn = open.said.as_ref().map(|said| talked.asked.iter().position(|a| a.said.eq_ignore_ascii_case(said)));
        let held: &[String] = match turn {
            None => &talked.hail,
            Some(Some(i)) => &talked.asked[i].lines,
            Some(None) => &[],
        };
        if open.lines.len() < held.len() || held == open.lines.as_slice() {
            return false;
        }
        let (had, now) = (text_size(held), text_size(&open.lines));
        let no_room = turn == Some(None) && talked.asked.len() >= TURN_CAP;
        if no_room || (self.bytes + now).saturating_sub(had) > BYTES_CAP {
            return false;
        }
        self.bytes = self.bytes + now - had;
        match (turn, &open.said) {
            (Some(Some(i)), _) => talked.asked[i].lines.clone_from(&open.lines),
            (Some(None), Some(said)) => talked.asked.push(Asked { said: said.clone(), lines: open.lines.clone() }),
            _ => talked.hail.clone_from(&open.lines),
        }
        true
    }

    /// `dialogue` on the row, when the log holds more than a one-line hail answer (`greeting`).
    pub fn serve(&self, key: &str, v: &mut Value) {
        if let Some(t) = self.by.get(key).filter(|t| !t.asked.is_empty() || t.hail.len() > 1) {
            v["dialogue"] = json!(t);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::Dialogues;
    use crate::modules::consider::mob_key;
    use serde_json::{json, Value};

    const NPC: &str = "Malloy the Songbird";
    const HAIL: &str = "Hello, Drywrought! I am Malloy the Songbird.  I have traveled back to Norrath from the halls of the Realm of Heroes to reward those who perform heroic acts in the eyes of the gods. Are you just [traveling] through, or would you like to hear a song of my [adventures]?";
    const TRAVEL: &str = "Very well, then, good luck to you on your travels.  If you journey to Qeynos, you may want to speak to Jaylia the Faithful.  She has adventures of her own that she may wish to tell you.";
    const ADVENTURES: &str = "Ah, excellent!  Would you like to hear about my [childhood] or would you like to hear how I was sent to the Hall of the [Realm of Heroes]?";
    const CHILD: &str = "I was born Malloy Birtonel on a farm in the westerns plains of the Karanas.  My parents, Tralvin and Dortha, were very poor and struggled to keep the [farmstead] going.";
    const LEAVE: &str = "Would you mind leaving already? I don't like people.";
    const FARM: &str = "Our farm is bright and cheery, O, how I treasure it so.";
    const HEROES: &str = "Those who perform heroic acts in the eyes of the gods usually get sent to the Realm of Heroes.  While I'm not sure what heroic act I performed, I was sent to the Realm of Heroes by a [vision of loveliness].";
    const VISION: &str = "While I traveled from Qeynos to Freeport, the most beautiful female I have ever seen followed along behind me.  I found myself in the [Plane of Music] where a concert was performed in my presence.";
    const MUSIC: &str = "With harmonic winds blowing across the demi-plane...";
    const VERSES: [&str; 5] = [
        "From each grain planted to the rain that falls...",
        "To the sunlight that brightens and glistens it all...",
        "To the creatures that roam the fields of corn...",
        "To the moonlight that guides us home, O, how I treasure it so.",
        "I would often travel to Qeynos at sunset after work on the farm was completed for the day.",
    ];

    fn you(d: &mut Dialogues, s: i64, said: &str) {
        d.line(&format!("You say, '{said}'"), s * 1000);
    }

    fn npc(d: &mut Dialogues, s: i64, said: &str) -> bool {
        d.line(&format!("{NPC} says, '{said}'"), s * 1000)
    }

    fn hail(d: &mut Dialogues, s: i64) {
        you(d, s, &format!("Hail, {NPC}"));
        npc(d, s + 1, HAIL);
    }

    fn served(d: &Dialogues) -> Value {
        let mut v = json!({});
        d.serve(&mob_key(NPC), &mut v);
        v["dialogue"].clone()
    }

    fn answer(v: &Value, said: &str) -> Vec<String> {
        let turn = v["asked"].as_array().and_then(|a| a.iter().find(|t| t["said"] == said));
        turn.and_then(|t| t["lines"].as_array()).map_or_else(Vec::new, |l| l.iter().filter_map(|x| x.as_str().map(str::to_string)).collect())
    }

    /// The owner's conversation, 2026-11-21 16:10:22 to 16:14:43, seconds from 16:10:00.
    fn malloy() -> Dialogues {
        let mut d = Dialogues::default();
        hail(&mut d, 22);
        you(&mut d, 27, "traveling");
        npc(&mut d, 27, TRAVEL);
        hail(&mut d, 30);
        you(&mut d, 31, "adventures");
        npc(&mut d, 32, ADVENTURES);
        you(&mut d, 35, "childhood");
        npc(&mut d, 36, CHILD);
        you(&mut d, 40, "farmstead");
        npc(&mut d, 40, LEAVE);
        npc(&mut d, 41, FARM);
        hail(&mut d, 64);
        you(&mut d, 66, "adventures");
        npc(&mut d, 66, ADVENTURES);
        you(&mut d, 67, "Realm of Heroes");
        npc(&mut d, 68, HEROES);
        you(&mut d, 69, "vision of loveliness");
        npc(&mut d, 69, VISION);
        you(&mut d, 71, "Plane of Music");
        npc(&mut d, 71, MUSIC);
        hail(&mut d, 78);
        you(&mut d, 79, "traveling");
        npc(&mut d, 79, TRAVEL);
        hail(&mut d, 81);
        you(&mut d, 83, "adventures");
        npc(&mut d, 83, ADVENTURES);
        you(&mut d, 84, "childhood");
        npc(&mut d, 84, CHILD);
        you(&mut d, 86, "farmstead");
        npc(&mut d, 86, LEAVE);
        npc(&mut d, 86, FARM);
        for (s, verse) in [125, 164, 203, 242, 283].into_iter().zip(VERSES) {
            npc(&mut d, s, verse);
        }
        d
    }

    #[test]
    fn malloys_whole_conversation_each_keyword_once_with_the_song() {
        let v = served(&malloy());
        assert_eq!(v["hail"], json!([HAIL]));
        let said: Vec<&str> = v["asked"].as_array().unwrap().iter().filter_map(|t| t["said"].as_str()).collect();
        assert_eq!(said, ["traveling", "adventures", "childhood", "farmstead", "Realm of Heroes", "vision of loveliness", "Plane of Music"]);
        assert_eq!(answer(&v, "traveling"), [TRAVEL]);
        assert_eq!(answer(&v, "Plane of Music"), [MUSIC]);
        let mut farm = vec![LEAVE, FARM];
        farm.extend(VERSES);
        assert_eq!(answer(&v, "farmstead"), farm);
    }

    #[test]
    fn a_hail_answer_alone_is_left_to_the_greeting() {
        let mut d = Dialogues::default();
        hail(&mut d, 0);
        assert_eq!(served(&d), Value::Null);
    }

    /// The owner's logs: what would have been pulled in by a looser rule.
    #[test]
    fn a_line_outside_the_verse_band_or_after_a_trade_is_not_the_answers() {
        let mut d = Dialogues::default();
        hail(&mut d, 0);
        you(&mut d, 2, "ingredients");
        npc(&mut d, 2, "First answer.");
        assert!(!npc(&mut d, 20, "This is great so far, but I need all of the components I asked for."), "a hand-in's reply, 18 s on");
        assert!(!npc(&mut d, 58, "Too late for the run, which ended above."));
        you(&mut d, 60, "dice");
        npc(&mut d, 60, "Second answer.");
        d.traded();
        assert!(!npc(&mut d, 95, "Thanks for that."), "a trade opened");
        let v = served(&d);
        assert_eq!(answer(&v, "ingredients"), ["First answer."]);
        assert_eq!(answer(&v, "dice"), ["Second answer."]);
    }

    #[test]
    fn another_players_exchange_stays_out() {
        let mut d = Dialogues::default();
        hail(&mut d, 0);
        you(&mut d, 2, "farmstead");
        npc(&mut d, 2, FARM);
        // Logged a second before their say, as Dorian G`Wyn's greeting was.
        assert!(npc(&mut d, 41, VERSES[0]));
        assert!(d.line("Bacon says, 'farmstead'", 42_000), "their say takes the verse back");
        assert_eq!(answer(&served(&d), "farmstead"), [FARM]);
        assert!(!npc(&mut d, 43, VERSES[1]));
        hail(&mut d, 50);
        you(&mut d, 52, "farmstead");
        npc(&mut d, 52, FARM);
        d.line(&format!("Bacon says, 'Hail, {NPC}'"), 60_000);
        assert!(!npc(&mut d, 91, VERSES[0]), "their hail ended the exchange");
        // A greeting to someone else names a keyword.
        hail(&mut d, 100);
        you(&mut d, 102, "farmstead");
        npc(&mut d, 102, FARM);
        assert!(!npc(&mut d, 140, "Hello, Bacon! Are you just [traveling] through?"));
        assert_eq!(answer(&served(&d), "farmstead"), [FARM]);
    }

    /// The owner's log, 2026-10-13 00:43:35: Malkil hailed Guard Shilster a second before the player's
    /// say, and the guard's greeting to them printed in the second of its answer.
    #[test]
    fn a_greeting_to_someone_else_in_the_answers_second_stays_out() {
        let mut d = Dialogues::default();
        hail(&mut d, 0);
        you(&mut d, 2, "adventures");
        npc(&mut d, 3, ADVENTURES);
        assert!(!npc(&mut d, 3, HAIL), "its own hail answer");
        assert_eq!(answer(&served(&d), "adventures"), [ADVENTURES]);
        d.line(&format!("Malkil says, 'Hail, {NPC}'"), 10_000);
        you(&mut d, 11, "childhood");
        npc(&mut d, 12, CHILD);
        assert!(!npc(&mut d, 12, "Hey, hey! I have some Blackburrow Stout for sale."), "a further line beside their hail");
        assert_eq!(answer(&served(&d), "childhood"), [CHILD]);
    }

    #[test]
    fn a_say_with_no_answer_and_a_say_long_after_the_hail_are_no_turns() {
        let mut d = Dialogues::default();
        hail(&mut d, 0);
        you(&mut d, 3, "anyone here");
        assert!(!npc(&mut d, 9, "A bark six seconds later."));
        you(&mut d, 200, "much later");
        assert!(!npc(&mut d, 200, "Not to that say."));
        assert_eq!(served(&d), Value::Null);
    }

    #[test]
    fn a_full_store_keeps_what_it_holds() {
        let mut d = Dialogues::default();
        hail(&mut d, 0);
        d.bytes = super::BYTES_CAP;
        you(&mut d, 2, "adventures");
        assert!(!npc(&mut d, 2, ADVENTURES));
        assert_eq!(d.by[&mob_key(NPC)].hail, [HAIL], "nothing is evicted");
    }
}
