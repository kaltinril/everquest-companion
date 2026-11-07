//! `combat.live` — level 1 of the damage meter, cut off the fold's combat engine.
//!
//! Two separate bundles draw this row — the Combat tab's `EntityRow.tsx` and the overlay's
//! `meterBars.tsx` — and the cells are what both of them print: rank, name, kind, the one-word tag,
//! a `~` ambiguity count, hit/resist/crit badges, total, dps, and the bar's `pct`.
//!
//! Rules the cells follow:
//! * The total and the rate are two cells, never the one string a bar prints: their order and
//!   separator differ between the two surfaces, so composing them here would break one of them.
//! * `kind` is the engine's attribution and decides the bar's colour, which stays the renderer's;
//!   `tag` is the word printed after the name, and the two are not the same map.
//! * A badge that is not shown is `null`, never an empty string or a zero — an absent cell means
//!   unchanged and a null cell means cleared, and there is no third spelling.
//! * `pct` is a number because the bar's fill is a CSS length; every other magnitude is the
//!   k/M-scaled string the reader actually sees.
//!
//! Outgoing only, level 1 only. A meter is a ranking, and one that interleaved incoming damage
//! would put a hard-hitting mob among your group; a drill into a source's ability lanes is a
//! different row shape with its own key space. Each gets its own source when its surface arrives.

use fold::combat::views::LiveRow;
use protocol::cell::Cell;
use protocol::generated::Cells;
#[cfg(test)]
use serde_json::Value;

use super::{Field, Order, SourceDef, SourceRow};

/// The registry entry. See [`super::SourceDef`].
pub const LIVE: SourceDef = SourceDef {
    id: "combat.live",
    // `id` is a field with no cell — the row's key already is it. It is declared because the
    // tiebreak must name a field, and it is the only value guaranteed unique within a segment.
    fields: &["rank", "name", "kind", "total", "id"],
    // The meter's own ranking, which is the order the fold already put the rows in.
    //
    // No `dps` field, for arithmetic rather than taste: every row of one segment divides the same
    // duration, so a sort by dps is the sort by total.
    default_sort: &[("total", Order::Desc)],
    tiebreak: ("id", Order::Asc),
    default_limit: super::DEFAULT_LIMIT,
};

/// Build every row of the meter, in the fold's own ranked order.
///
/// `selected` is one `SegmentView` as JSON, or `null` when the selection resolves to no fight at
/// all. Read as JSON rather than as a struct because `SourceView`'s fields are private to
/// `fold::combat::views` and its serialization is its published contract — the same one the app's
/// renderer reads. The serving loop reads the typed door instead (`rows_of`); this one is the
/// oracle it is pinned to, and lives for that test.
#[cfg(test)]
pub fn rows(selected: &Value) -> Vec<SourceRow> {
    let Some(entities) = selected.get("entities").and_then(Value::as_array) else {
        return Vec::new();
    };
    entities
        .iter()
        .enumerate()
        .map(|(index, e)| row(index, &Numbers::of_json(e)))
        .collect()
}

/// The same rows off the engine's typed door, `CombatEngine::live_rows`: the segment's outgoing
/// rows and nothing else, so the serve beat builds no snapshot to read twelve numbers out of.
#[must_use]
pub fn rows_of(live: &[LiveRow]) -> Vec<SourceRow> {
    live.iter()
        .enumerate()
        .map(|(index, e)| row(index, &Numbers::of_live(e)))
        .collect()
}

/// The numbers one row is cut from, read off either shape of the selected segment.
struct Numbers<'a> {
    id: &'a str,
    name: &'a str,
    kind: &'a str,
    total: i64,
    pct: f64,
    dps: f64,
    crit_pct: f64,
    misses: i64,
    hit_pct: f64,
    resists: i64,
    resist_pct: f64,
    ambiguous: i64,
}

impl<'a> Numbers<'a> {
    #[cfg(test)]
    fn of_json(e: &'a Value) -> Numbers<'a> {
        Numbers {
            id: str_of(e, "id"),
            name: str_of(e, "name"),
            kind: str_of(e, "kind"),
            total: int_of(e, "total"),
            pct: float_of(e, "pct"),
            dps: float_of(e, "dps"),
            crit_pct: float_of(e, "critPct"),
            misses: int_of(e, "misses"),
            hit_pct: float_of(e, "hitPct"),
            resists: int_of(e, "resists"),
            resist_pct: float_of(e, "resistPct"),
            ambiguous: int_of(e, "ambiguousHits"),
        }
    }

    fn of_live(e: &'a LiveRow) -> Numbers<'a> {
        Numbers {
            id: &e.id,
            name: &e.name,
            kind: e.kind,
            total: e.total,
            pct: e.pct,
            dps: e.dps,
            crit_pct: e.crit_pct,
            misses: e.misses,
            hit_pct: e.hit_pct,
            resists: e.resists,
            resist_pct: e.resist_pct,
            ambiguous: e.ambiguous_hits,
        }
    }
}

fn row(index: usize, e: &Numbers<'_>) -> SourceRow {
    let (id, name, kind, total) = (e.id, e.name, e.kind, e.total);
    // The rank is the meter's, not the window's: both renderers number the fold's already-ranked
    // array, so a client that sorts by name does not renumber the meter.
    let rank = i64::try_from(index).unwrap_or(i64::MAX).saturating_add(1);

    let mut cells = std::collections::BTreeMap::new();
    cells.insert("rank".to_owned(), Cell::int(rank));
    cells.insert("name".to_owned(), Cell::text(name));
    cells.insert("kind".to_owned(), Cell::text(kind));
    cells.insert(
        "tag".to_owned(),
        kind_tag(kind).map_or(Cell::null(), Cell::text),
    );
    cells.insert("pct".to_owned(), Cell::float(e.pct));
    cells.insert(
        "total".to_owned(),
        Cell::text(format_num(int_to_f64(total))),
    );
    cells.insert("dps".to_owned(), Cell::text(format_rate(e.dps)));
    // The three conditional badges. Each gate is the renderer's own, and each absence is a `null`
    // because the diff protocol needs a cell it can clear.
    cells.insert(
        "crit".to_owned(),
        gated(
            e.crit_pct >= 1.0,
            &format!("{}% crit", js_round(e.crit_pct)),
        ),
    );
    cells.insert(
        "hit".to_owned(),
        gated(e.misses > 0, &format!("{}% hit", js_round(e.hit_pct))),
    );
    cells.insert(
        "resist".to_owned(),
        gated(
            e.resists > 0,
            &format!("{}% resist", js_round(e.resist_pct)),
        ),
    );
    // The `~` badge stands for a hit count on both surfaces, so the count is the cell. The sentence
    // the Combat tab's tooltip composes is a tab-only affordance; the overlay bars have no hover.
    let ambiguous = e.ambiguous;
    cells.insert(
        "ambiguous".to_owned(),
        if ambiguous > 0 {
            Cell::int(ambiguous)
        } else {
            Cell::null()
        },
    );

    SourceRow {
        key: id.to_owned(),
        cells: Cells(cells),
        fields: vec![
            ("rank", Field::Int(rank)),
            ("name", Field::Text(name.to_owned())),
            ("kind", Field::Text(kind.to_owned())),
            ("total", Field::Int(total)),
            ("id", Field::Text(id.to_owned())),
        ],
    }
}

/// The one word printed after a bar's name, or `None` for a row that gets none.
///
/// Mirrors `EntityRow.tsx`'s `KIND_TAG` and `meterBars.tsx`'s `KIND_SUFFIX`. `you` and `enemy` get
/// no word: the direction filter has already said which of the two the reader is looking at.
/// `other` is not `player` — EQ spells a summoned pet's name with the same grammar it gives people,
/// so the word must not pick one.
fn kind_tag(kind: &str) -> Option<&'static str> {
    match kind {
        "pet" => Some("pet"),
        "member" => Some("group"),
        "allyPet" => Some("ally"),
        "other" => Some("other"),
        _ => None,
    }
}

fn gated(shown: bool, text: &str) -> Cell {
    if shown {
        Cell::text(text)
    } else {
        Cell::null()
    }
}

/// The app's one spelling of a damage figure (`formatRate.ts formatNum`) — k/M-scaled magnitude
/// with no unit word. `21.7k` is what the pixel says, so the engine renders it rather than making
/// the client scale and round.
fn format_num(n: f64) -> String {
    if n >= 1_000_000.0 {
        return format!("{}M", to_fixed(n / 1_000_000.0, 2));
    }
    if n >= 1_000.0 {
        return format!("{}k", to_fixed(n / 1_000.0, 1));
    }
    js_round(n).to_string()
}

/// `formatRate` — the k/M-scaled number followed by the word `dps`. The word rather than `/s`,
/// which appears nowhere in the app.
fn format_rate(n: f64) -> String {
    format!("{} dps", format_num(n))
}

/// `Number.prototype.toFixed`, written out rather than left to `{:.*}` because the two round ties
/// in opposite directions: ECMA-262 picks the larger integer on a tie, Rust rounds half to even.
/// Ties are common here — a damage total is an integer, and `1250` renders `1.3k` in the app but
/// `1.2k` through `{:.1}`.
///
/// The tie is judged on the `f64`, not on the decimal somebody typed: the nearest double to `21.65`
/// is 21.6499999999999985…, which is not a tie and rounds down in both languages. So this rounds
/// the exact decimal expansion of the double, half up, with no floating-point step — the arithmetic
/// shortcut `floor(v * 10 + 0.5)` manufactures ties the value never had.
fn to_fixed(v: f64, digits: usize) -> String {
    if !v.is_finite() {
        return format!("{v}");
    }
    // Far more digits than the answer needs: they exist only to tell a true tie from a value that
    // merely looks like one. Two doubles differ by at least one ulp (~1e-14 in the band a
    // k/M-scaled figure lives in), so twenty-five extra places settle it.
    let exact = format!("{:.*}", digits + 25, v.abs());
    let (whole, frac) = exact.split_once('.').unwrap_or((exact.as_str(), ""));
    let (keep, rest) = frac.split_at(digits.min(frac.len()));
    let mut out: Vec<u8> = whole.bytes().chain(keep.bytes()).collect();
    // First dropped digit >= 5 rounds up, which covers both halves of the rule: above the tie
    // because it is nearer, on the tie because the spec says larger.
    if rest.as_bytes().first().is_some_and(|d| *d >= b'5') {
        let mut at = out.len();
        loop {
            if at == 0 {
                out.insert(0, b'1');
                break;
            }
            at -= 1;
            if out[at] == b'9' {
                out[at] = b'0';
            } else {
                out[at] += 1;
                break;
            }
        }
    }
    let sign = if v < 0.0 { "-" } else { "" };
    let text = String::from_utf8(out).unwrap_or_default();
    let point = text.len().saturating_sub(digits);
    if digits == 0 {
        format!("{sign}{text}")
    } else {
        format!("{sign}{}.{}", &text[..point], &text[point..])
    }
}

/// `Math.round` — round half up, which is not `f64::round` (half away from zero). They differ only
/// for negatives; a percentage here is never one, and it is spelled out so it is not "simplified".
fn js_round(v: f64) -> i64 {
    #[allow(clippy::cast_possible_truncation)]
    let n = (v + 0.5).floor() as i64;
    n
}

#[cfg(test)]
fn str_of<'a>(value: &'a Value, key: &str) -> &'a str {
    value.get(key).and_then(Value::as_str).unwrap_or_default()
}

#[cfg(test)]
fn int_of(value: &Value, key: &str) -> i64 {
    value.get(key).and_then(Value::as_i64).unwrap_or_default()
}

#[cfg(test)]
fn float_of(value: &Value, key: &str) -> f64 {
    value.get(key).and_then(Value::as_f64).unwrap_or_default()
}

#[allow(clippy::cast_precision_loss)]
fn int_to_f64(n: i64) -> f64 {
    n as f64
}

#[cfg(test)]
mod tests {
    use super::{format_num, format_rate, rows, rows_of, to_fixed, LIVE};
    use crate::views::{cut, validate, Field};
    use protocol::generated::ViewDescriptor;
    use serde_json::json;

    /// The typed door cuts what the snapshot door cuts: one engine, folded with a crit, a whiff, a
    /// resist and a mob's swings, read both ways at one instant, row for row — the
    /// keys, every cell and every field, in the same order.
    #[test]
    fn the_typed_door_cuts_the_rows_the_snapshot_cuts() {
        use fold::combat::{CombatEngine, SnapshotOpts};
        use fold::event::Event;
        let mut e = CombatEngine::new();
        e.set_player_name("Primitive");
        for line in [
            r#"{"kind":"zone","seq":0,"ts":0,"raw":"z","zone":"Najena"}"#,
            r#"{"kind":"damage","seq":1,"ts":1000,"raw":"d","attacker":"You","target":"a kodiak","amount":1250,"dtype":"melee","skill":"Melee","verb":"slash","crit":true}"#,
            r#"{"kind":"damage","seq":2,"ts":1500,"raw":"d","attacker":"a kodiak","target":"You","amount":42,"dtype":"melee","skill":"bite","crit":false}"#,
            r#"{"kind":"miss","seq":3,"ts":2000,"raw":"m","attacker":"You","target":"a kodiak","mtype":"dodge","verb":"slash"}"#,
            r#"{"kind":"damage","seq":4,"ts":2500,"raw":"d","attacker":"You","target":"a kodiak","amount":500,"dtype":"spell","skill":"Smiting Strike","crit":false}"#,
            r#"{"kind":"resist","seq":5,"ts":3000,"raw":"r","caster":"You","target":"a kodiak","spell":"Fear","incoming":false}"#,
            r#"{"kind":"damage","seq":6,"ts":3500,"raw":"d","attacker":"a kodiak","target":"You","amount":7,"dtype":"melee","skill":"bite","crit":false}"#,
        ] {
            let ev = Event::from_json(line).expect("a JSON object");
            e.on_event(&ev, false, None);
        }
        let now = 4_000;
        let opts = SnapshotOpts {
            max_segments: 0,
            ..SnapshotOpts::default()
        };
        let from_json = rows(&e.snapshot(now, &opts, None)["selected"]);
        let typed = rows_of(&e.live_rows(now));
        assert_eq!(from_json.len(), typed.len());
        assert!(!typed.is_empty(), "the fixture has a row");
        for (a, b) in from_json.iter().zip(&typed) {
            assert_eq!(a.key, b.key);
            assert_eq!(a.cells.0, b.cells.0, "{}", a.key);
            assert_eq!(a.fields, b.fields, "{}", a.key);
        }
        // The badges the fixture was built to light are lit the same way through both doors.
        let you = &typed[0].cells;
        assert_eq!(you["crit"], protocol::Cell::text("50% crit"));
        assert_eq!(you["hit"], protocol::Cell::text("67% hit"));
        assert_eq!(you["resist"], protocol::Cell::text("50% resist"));
        // …and an engine with nothing folded cuts nothing through either.
        let empty = CombatEngine::new();
        assert!(rows(&empty.snapshot(0, &opts, None)["selected"]).is_empty());
        assert!(rows_of(&empty.live_rows(0)).is_empty());
    }

    /// One `SegmentView`, stated with only the fields the row builder reads; the real one carries
    /// twenty more.
    fn selected(entities: serde_json::Value) -> serde_json::Value {
        json!({ "id": "e1", "kind": "fight", "name": "a sand giant", "entities": entities })
    }

    fn entity(
        id: &str,
        name: &str,
        kind: &str,
        total: i64,
        dps: f64,
        pct: f64,
    ) -> serde_json::Value {
        json!({
            "id": id, "name": name, "kind": kind, "total": total, "dps": dps, "pct": pct,
            "hits": 10, "crits": 0, "critPct": 0.0, "ambiguousHits": 0, "ambiguousTotal": 0,
            "misses": 0, "hitPct": 100.0, "resists": 0, "resistPct": 0.0
        })
    }

    #[test]
    fn a_row_carries_what_a_level_one_bar_prints() {
        let built = rows(&selected(json!([entity(
            "you", "You", "you", 21_712, 723.7, 100.0
        )])));
        assert_eq!(built.len(), 1);
        let cells = &built[0].cells;
        assert_eq!(built[0].key, "you", "the key is the source's own id");
        assert_eq!(cells["rank"], protocol::Cell::int(1));
        assert_eq!(cells["name"], protocol::Cell::text("You"));
        assert_eq!(cells["kind"], protocol::Cell::text("you"));
        // `you` gets no word after its name on either surface.
        assert_eq!(cells["tag"], protocol::Cell::null());
        assert_eq!(cells["total"], protocol::Cell::text("21.7k"));
        // Under a thousand `formatNum` is a rounded integer with no unit scaling.
        assert_eq!(cells["dps"], protocol::Cell::text("724 dps"));
        // A badge whose gate is shut is null, not an empty string and not a zero.
        assert_eq!(cells["crit"], protocol::Cell::null());
        assert_eq!(cells["hit"], protocol::Cell::null());
        assert_eq!(cells["resist"], protocol::Cell::null());
        assert_eq!(cells["ambiguous"], protocol::Cell::null());
    }

    #[test]
    fn the_one_word_after_a_name_is_the_renderers_word_and_not_the_kind() {
        // `member` prints `group`, `allyPet` prints `ally`, and `enemy` prints nothing, like `you`.
        let built = rows(&selected(json!([
            entity("pet:3", "Gybrush", "pet", 900, 30.0, 40.0),
            entity("member:rowel", "Rowel", "member", 800, 26.6, 35.0),
            entity("ally:vex", "Vex's pet", "allyPet", 700, 23.3, 30.0),
            entity("other:kez", "Kez", "other", 600, 20.0, 26.0),
            entity("enemy:giant", "a sand giant", "enemy", 500, 16.6, 22.0),
        ])));
        let tags: Vec<protocol::Cell> = built.iter().map(|r| r.cells["tag"].clone()).collect();
        assert_eq!(
            tags,
            [
                protocol::Cell::text("pet"),
                protocol::Cell::text("group"),
                protocol::Cell::text("ally"),
                protocol::Cell::text("other"),
                protocol::Cell::null(),
            ]
        );
    }

    #[test]
    fn a_badge_appears_exactly_where_its_gate_says_it_does() {
        let mut e = entity("you", "You", "you", 21_712, 723.7, 100.0);
        e["critPct"] = json!(34.4);
        e["misses"] = json!(7);
        e["hitPct"] = json!(58.82);
        e["resists"] = json!(2);
        e["resistPct"] = json!(16.6);
        e["ambiguousHits"] = json!(3);
        let built = rows(&selected(json!([e.clone()])));
        let cells = &built[0].cells;
        assert_eq!(cells["crit"], protocol::Cell::text("34% crit"));
        assert_eq!(cells["hit"], protocol::Cell::text("59% hit"));
        assert_eq!(cells["resist"], protocol::Cell::text("17% resist"));
        assert_eq!(cells["ambiguous"], protocol::Cell::int(3));

        // …and the crit gate is `>= 1`, not `> 0`, so a rounded `0% crit` cannot appear.
        e["critPct"] = json!(0.4);
        let built = rows(&selected(json!([e])));
        assert_eq!(built[0].cells["crit"], protocol::Cell::null());
    }

    #[test]
    fn the_rank_is_the_folds_order_and_a_client_sort_does_not_renumber_it() {
        let built = rows(&selected(json!([
            entity("you", "You", "you", 900, 30.0, 100.0),
            entity("pet:3", "Gybrush", "pet", 100, 3.3, 11.0),
        ])));
        let mut d = ViewDescriptor {
            source: LIVE.id.to_owned(),
            filter: None,
            sort: Vec::new(),
            window: None,
        };
        // The default order is the meter's: total desc.
        let view = validate(&d).expect("a view");
        let (window, total) = cut(&view, &built);
        assert_eq!(
            window.iter().map(|r| r.key.0.as_str()).collect::<Vec<_>>(),
            ["you", "pet:3"]
        );
        assert_eq!(total, 2);

        // …and asking for it by name reorders the window while every row keeps the rank the meter
        // gave it. A rank that moved with the window would be a second, disagreeing ranking.
        d.sort = vec![protocol::generated::SortTerm([
            "name".to_owned(),
            "asc".to_owned(),
        ])];
        let view = validate(&d).expect("a view");
        let (window, _) = cut(&view, &built);
        assert_eq!(
            window.iter().map(|r| r.key.0.as_str()).collect::<Vec<_>>(),
            ["pet:3", "you"]
        );
        assert_eq!(window[0].cells["rank"], protocol::Cell::int(2));
    }

    #[test]
    fn a_selection_that_resolved_to_nothing_is_an_empty_window_rather_than_a_panic() {
        // `selected: null` is what a session with no fights publishes.
        assert!(rows(&serde_json::Value::Null).is_empty());
        assert!(rows(&json!({ "id": "zone", "kind": "zone" })).is_empty());
    }

    #[test]
    fn the_total_is_the_apps_own_spelling_of_a_damage_figure() {
        assert_eq!(format_num(0.0), "0");
        assert_eq!(format_num(999.0), "999");
        assert_eq!(format_num(1_000.0), "1.0k");
        assert_eq!(format_num(21_712.0), "21.7k");
        assert_eq!(format_num(2_300_000.0), "2.30M");
        assert_eq!(format_rate(723.7), "724 dps");
        assert_eq!(format_rate(21_712.0), "21.7k dps");
    }

    #[test]
    fn a_tie_rounds_the_way_javascript_rounds_it() {
        // `1250 / 1000` is exactly 1.25, a true tie: `toFixed(1)` answers "1.3" and Rust's `{:.1}`
        // answers "1.2".
        assert_eq!(to_fixed(1.25, 1), "1.3");
        assert_eq!(format_num(1_250.0), "1.3k");
        assert_eq!(to_fixed(1.125, 2), "1.13");
        assert_eq!(to_fixed(8.25, 1), "8.3");
        // …and a value that only looks like a tie is not one: the nearest double to 21.65 is
        // 21.64999999999999857…, so both the app and this answer 21.6.
        assert_eq!(to_fixed(21.65, 1), "21.6");
        assert_eq!(format_num(21_650.0), "21.6k");
        assert_eq!(to_fixed(1.45, 1), "1.4", "1.45 is really 1.4499999…");
        assert_eq!(to_fixed(1.35, 1), "1.4", "1.35 is really 1.3500000…88");
        // The carry, all the way out of the number it started in.
        assert_eq!(to_fixed(9.99, 1), "10.0");
        assert_eq!(format_num(999_999.0), "1000.0k");
    }

    #[test]
    fn the_field_and_the_cell_of_one_name_are_different_values() {
        // `total` renders as `21.7k` and sorts as 21,712; sorting the strings would put 9 after 2.
        let built = rows(&selected(json!([entity(
            "you", "You", "you", 21_712, 723.7, 100.0
        )])));
        assert_eq!(built[0].cells["total"], protocol::Cell::text("21.7k"));
        assert_eq!(
            built[0]
                .fields
                .iter()
                .find(|(f, _)| *f == "total")
                .map(|(_, v)| v),
            Some(&Field::Int(21_712))
        );
    }
}
