//! One trade-chat message → the offers in it. The parser behind [`super::bazaar`], kept apart so
//! it is tested without a fold.
//!
//! Measured on the owner's log (2026-10-06): 1,644 messages that open with WTS, WTB, WTT,
//! selling, buying or trading; an item is found in 86% of them, and most of the rest name it by an
//! abbreviation (COF, SBoZ) or a spelling no item page uses. What it reads:
//!
//! * the direction word opens the message, or follows a separator ("WTS a 5k / WTB b 3k"); the
//!   acronyms switch direction anywhere. "anyone selling X?" opens with no direction, so it is not
//!   an offer.
//! * item names are the item database's, matched longest first, and only where a name can start:
//!   after the direction word, a separator, a price, a tier, a quantity or another item. A name
//!   found after unmatched words is the tail of something else ("Mithril Champ arrows" is not
//!   "Arrow"). Case and apostrophes never matter.
//! * prices: `5k`, `2.5k`, `500pp`, `10 000pp`, `4 pp`, `150g`, `20 copper`, `5kpp`, and a price
//!   glued to the name (`Cloak6k`). `3k each: A | B` prices both; so does `A, B 150g each`.
//! * a bare number (no `k`, `pp` or coin) is a price only right after the item, its tier or its
//!   count, or before `each`: "only have 1" and "- buying 100 10lb meatpies" are counts.
//! * `+4` and `4+` are the upgrade tier; `x2`, `2x` and a bare count before the name are the
//!   quantity, as is a count before "for" (`Bone Chips 1000 for 10k`).
//! * a trade (WTT) is a barter: its numbers count the other thing, so it never carries a price.

use regex::Regex;
use std::collections::HashMap;
use std::sync::OnceLock;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, PartialOrd, Ord)]
pub enum Dir {
    Sell,
    Buy,
    Trade,
}

impl Dir {
    pub fn as_str(self) -> &'static str {
        match self {
            Dir::Sell => "sell",
            Dir::Buy => "buy",
            Dir::Trade => "trade",
        }
    }

    fn of(word: &str) -> Option<Dir> {
        match word {
            "wts" | "selling" => Some(Dir::Sell),
            "wtb" | "buying" => Some(Dir::Buy),
            "wtt" | "trading" => Some(Dir::Trade),
            _ => None,
        }
    }
}

#[derive(Debug, Clone, PartialEq)]
pub struct Offer {
    pub dir: Dir,
    /// The item page's own spelling.
    pub item: String,
    pub tier: u32,
    pub qty: Option<u32>,
    /// As stated, in platinum: per unit when `each`, else for the whole `qty`.
    pub price_pp: Option<f64>,
    pub each: bool,
}

impl Offer {
    /// Platinum per unit: a stated total over a stated count is divided.
    pub fn unit_pp(&self) -> Option<f64> {
        match (self.price_pp, self.qty) {
            (Some(p), Some(q)) if !self.each && q > 0 => Some(p / f64::from(q)),
            (p, _) => p,
        }
    }
}

/// Item names keyed by [`loose`] spelling.
#[derive(Default)]
pub struct ItemIndex {
    names: HashMap<String, String>,
    max_words: usize,
}

impl ItemIndex {
    pub fn new(names: impl IntoIterator<Item = String>) -> Self {
        let mut ix = ItemIndex::default();
        for name in names {
            let key = loose(&name);
            if key.len() < 3 {
                continue;
            }
            ix.max_words = ix.max_words.max(key.split(' ').count());
            ix.names.entry(key).or_insert(name);
        }
        ix
    }

    pub fn is_empty(&self) -> bool {
        self.names.is_empty()
    }

    /// The name a phrase spells, allowing a plural `s` and a leading article.
    fn get(&self, phrase: &str) -> Option<&String> {
        let unplural = phrase.strip_suffix('s').unwrap_or(phrase);
        let bare = ["a ", "an ", "the "]
            .iter()
            .find_map(|a| phrase.strip_prefix(a))
            .unwrap_or(phrase);
        self.names
            .get(phrase)
            .or_else(|| self.names.get(unplural))
            .or_else(|| self.names.get(bare))
    }
}

/// Lowercase, apostrophes gone, anything but letters, digits, `:` and `-` a space, spaces single.
pub fn loose(s: &str) -> String {
    let mut out = String::with_capacity(s.len());
    for c in s.chars().flat_map(char::to_lowercase) {
        match c {
            '`' | '\'' | '\u{2019}' => {}
            'a'..='z' | '0'..='9' | ':' | '-' => out.push(c),
            _ => out.push(' '),
        }
    }
    out.split_whitespace().collect::<Vec<_>>().join(" ")
}

fn re(cell: &'static OnceLock<Regex>, pattern: &str) -> &'static Regex {
    cell.get_or_init(|| Regex::new(pattern).expect("a valid pattern"))
}

struct Tok {
    raw: String,
    n: String,
}

/// Split glued prices and counts off words, expand the shorthands, and pad separators.
fn tokens(msg: &str) -> Vec<Tok> {
    static GLUED_PRICE: OnceLock<Regex> = OnceLock::new();
    static PRICE_WORD: OnceLock<Regex> = OnceLock::new();
    static GLUED_QTY: OnceLock<Regex> = OnceLock::new();
    static SHORT: OnceLock<Regex> = OnceLock::new();
    static SEP: OnceLock<Regex> = OnceLock::new();
    let s = re(&GLUED_PRICE, r"(?i)([a-z])(\d+(?:\.\d+)?k)\b").replace_all(msg, "$1 $2");
    let s = re(&PRICE_WORD, r"(?i)(\d(?:k|pp))([a-z]{2,})").replace_all(&s, "$1 $2");
    let s = re(&GLUED_QTY, r"(?i)([a-z]{3,})(x\d+)\b").replace_all(&s, "$1 $2");
    let s = re(&SHORT, r"(?i)\b(champ|hq|mq|lq)\b").replace_all(&s, |c: &regex::Captures| {
        match c[1].to_lowercase().as_str() {
            "champ" => "champion",
            "hq" => "high quality",
            "mq" => "medium quality",
            _ => "low quality",
        }
        .to_string()
    });
    let s = re(&SEP, r"([|/,;:!?()]|\s-\s)").replace_all(&s, " $1 ");
    s.split_whitespace()
        .map(|raw| Tok {
            raw: raw.to_string(),
            n: loose(raw),
        })
        .collect()
}

fn unit_of(word: &str) -> f64 {
    match word {
        "g" | "gp" | "gold" => 0.1,
        "s" | "sp" | "silver" => 0.01,
        "c" | "cp" | "copper" => 0.001,
        _ => 1.0,
    }
}

/// A price starting at `t[i]`, in platinum, and how many tokens it spans.
fn price_at(t: &[Tok], i: usize) -> Option<(f64, usize)> {
    static PRICE: OnceLock<Regex> = OnceLock::new();
    let rx = re(
        &PRICE,
        r"(?i)^(\d{1,3}(?:[ ,]\d{3})+|\d+(?:\.\d+)?)\s*(k|m|mil)?\s*(pp|p|plat|platinum|g|gp|gold|s|sp|silver|c|cp|copper)?$",
    );
    (1..=3)
        .rev()
        .filter(|span| i + span <= t.len())
        .find_map(|span| {
            let joined: Vec<&str> = t[i..i + span].iter().map(|x| x.raw.as_str()).collect();
            let s = joined.join(" ");
            let s = s.trim_end_matches(['.', '!']);
            let m = rx.captures(s)?;
            // Two bare numbers side by side are a count and a price, unless they are `10 000`.
            let lettered = s.chars().any(|c| c.is_ascii_alphabetic());
            let thousands = s.split(' ').skip(1).all(|g| g.len() == 3);
            if span > 1 && !lettered && !thousands {
                return None;
            }
            let num: f64 = m[1].replace([' ', ','], "").parse().ok()?;
            let mult = m.get(2).map_or(1.0, |k| {
                if k.as_str().eq_ignore_ascii_case("k") {
                    1e3
                } else {
                    1e6
                }
            });
            let unit = m
                .get(3)
                .map_or(1.0, |u| unit_of(&u.as_str().to_lowercase()));
            if m.get(2).is_none() && m.get(3).is_none() && num < 1.0 {
                return None;
            }
            Some((num * mult * unit, span))
        })
}

const SEPARATORS: &[&str] = &["|", "/", ",", ";", ":", "!", "-", "(", ")"];
const FILLERS: &[&str] = &[
    "a", "an", "the", "my", "some", "few", "any", "your", "of", "for", "and", "or", "&",
];

struct Parser<'a> {
    t: Vec<Tok>,
    ix: &'a ItemIndex,
    out: Vec<Offer>,
    dir: Option<Dir>,
    lead_price: Option<f64>,
    pending_qty: Option<u32>,
    /// Index into `out` of the offer the next tier, count or price belongs to.
    last: Option<usize>,
    /// May an item name start here.
    fresh: bool,
}

impl<'a> Parser<'a> {
    fn item_at(&self, i: usize) -> Option<(String, usize)> {
        let max = self.ix.max_words.min(self.t.len().saturating_sub(i));
        (1..=max).rev().find_map(|w| {
            let words: Vec<&str> = self.t[i..i + w].iter().map(|x| x.n.as_str()).collect();
            let phrase = words.join(" ");
            let phrase = phrase.trim();
            if w == 1 && phrase.len() < 4 {
                return None;
            }
            self.ix.get(phrase).map(|name| (name.clone(), w))
        })
    }

    fn try_dir(&mut self, i: usize) -> Option<usize> {
        let d = Dir::of(&self.t[i].n)?;
        let acronym = self.t[i].n.starts_with("wt");
        let opens = i == 0 || self.t[..i].iter().all(|x| x.n.is_empty());
        let after_sep = i > 0 && [",", ".", "|", "/"].contains(&self.t[i - 1].raw.as_str());
        if !(opens || acronym || after_sep) {
            return None;
        }
        self.dir = Some(d);
        self.last = None;
        self.lead_price = None;
        self.fresh = true;
        Some(i + 1)
    }

    fn try_skip(&mut self, i: usize) -> Option<usize> {
        let tok = &self.t[i];
        if FILLERS.contains(&tok.n.as_str()) {
            return Some(i + 1);
        }
        if SEPARATORS.contains(&tok.raw.as_str()) || tok.n.is_empty() {
            self.fresh = true;
            return Some(i + 1);
        }
        None
    }

    fn try_item(&mut self, i: usize, dir: Dir) -> Option<usize> {
        if !self.fresh {
            return None;
        }
        let (item, used) = self.item_at(i)?;
        self.out.push(Offer {
            dir,
            item,
            tier: 0,
            qty: self.pending_qty.take(),
            price_pp: self.lead_price,
            each: self.lead_price.is_some(),
        });
        self.last = Some(self.out.len() - 1);
        Some(i + used)
    }

    /// `+4` or `4+` sets the tier; `x2` or `2x` the count; `each` marks the price per unit.
    fn try_modifier(&mut self, i: usize) -> Option<usize> {
        static TIER: OnceLock<Regex> = OnceLock::new();
        static QTY: OnceLock<Regex> = OnceLock::new();
        let raw = self.t[i].raw.as_str();
        if let Some(c) = re(&TIER, r"^(?:\+(\d{1,2})|(\d{1,2})\+)$").captures(raw) {
            let last = self.last?;
            self.out[last].tier = c.get(1).or(c.get(2))?.as_str().parse().ok()?;
            self.fresh = true;
            return Some(i + 1);
        }
        if let Some(c) = re(&QTY, r"(?i)^(?:x(\d+)|(\d+)x)$").captures(raw) {
            if let Some(last) = self.last {
                self.out[last].qty = c.get(1).or(c.get(2))?.as_str().parse().ok();
            }
            self.fresh = true;
            return Some(i + 1);
        }
        if matches!(self.t[i].n.as_str(), "each" | "ea" | "per") {
            if let Some(last) = self.last {
                self.out[last].each = true;
            }
            return Some(i + 1);
        }
        None
    }

    fn try_price(&mut self, i: usize, dir: Dir) -> Option<usize> {
        let (pp, used) = price_at(&self.t, i)?;
        let bare = used == 1 && self.t[i].raw.bytes().all(|b| b.is_ascii_digit());
        let each_next = self
            .t
            .get(i + 1)
            .is_some_and(|x| matches!(x.n.as_str(), "each" | "ea" | "per"));
        if bare && !self.fresh && !each_next && self.item_at(i + 1).is_none() {
            return None;
        }
        self.fresh = true;
        if bare && self.item_at(i + 1).is_some() {
            self.pending_qty = self.t[i].raw.parse().ok();
            return Some(i + 1);
        }
        if bare && self.t.get(i + 1).is_some_and(|x| x.n == "for") {
            if let Some(last) = self.last {
                self.out[last].qty = self.t[i].raw.parse().ok();
                return Some(i + 1);
            }
        }
        let next = i + used;
        if dir != Dir::Trade {
            self.apply_price(pp, next, dir);
        }
        Some(next)
    }

    fn apply_price(&mut self, pp: f64, next: usize, dir: Dir) {
        let each = self
            .t
            .get(next)
            .is_some_and(|x| matches!(x.n.as_str(), "each" | "ea" | "per"));
        let Some(last) = self.last else {
            if each {
                self.lead_price = Some(pp);
            }
            return;
        };
        if self.out[last].price_pp.is_some() {
            return;
        }
        for (k, o) in self.out.iter_mut().enumerate() {
            let backfill = each && o.price_pp.is_none() && o.dir == dir;
            if k == last || backfill {
                o.price_pp = Some(pp);
                o.each |= each;
            }
        }
    }

    fn step(&mut self, i: usize) -> Option<usize> {
        if let Some(next) = self.try_dir(i) {
            return Some(next);
        }
        let Some(dir) = self.dir else {
            return self.t[i].n.is_empty().then_some(i + 1);
        };
        let next = self
            .try_skip(i)
            .or_else(|| self.try_item(i, dir))
            .or_else(|| self.try_modifier(i))
            .or_else(|| self.try_price(i, dir));
        Some(next.unwrap_or_else(|| {
            self.fresh = false;
            i + 1
        }))
    }
}

/// Every offer in one chat message. Empty when it does not open with a direction.
pub fn parse_trade(msg: &str, ix: &ItemIndex) -> Vec<Offer> {
    let mut p = Parser {
        t: tokens(msg),
        ix,
        out: Vec::new(),
        dir: None,
        lead_price: None,
        pending_qty: None,
        last: None,
        fresh: true,
    };
    let mut i = 0;
    while i < p.t.len() {
        match p.step(i) {
            Some(next) => i = next,
            None => break,
        }
    }
    p.out
}
