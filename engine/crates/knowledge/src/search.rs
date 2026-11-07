//! `knowledge.search`: the name search over every corpus, off names case-folded once per process
//! rather than once per keystroke. Apart from `lib.rs` so that file stays under its recorded size.

use serde_json::{json, Value};

use crate::{Corpus, SEARCH_DEFAULT_LIMIT, SEARCH_MAX_LIMIT};

/// One searchable name: its fold, the name as the corpus spells it, and the page it links to.
pub(crate) struct Row {
    folded: String,
    name: String,
    page: Option<String>,
}

/// The four corpora's names, in the order the search walked them before.
pub(crate) struct SearchIndex {
    items: Vec<Row>,
    mobs: Vec<Row>,
    quests: Vec<Row>,
    spells: Vec<Row>,
}

impl SearchIndex {
    pub(crate) fn build(corpus: &Corpus) -> Self {
        let row = |name: &str, page: Option<&str>| Row {
            folded: name.to_lowercase(),
            name: name.to_owned(),
            page: page.map(str::to_owned),
        };
        let items = corpus
            .items()
            .iter()
            .map(|(_, entry)| {
                let page = entry["page"].as_str();
                let name = entry["name"].as_str().or(page).unwrap_or_default();
                row(name, page)
            })
            .collect();
        let mobs = corpus
            .mob_index()
            .names()
            .iter()
            .map(|name| {
                let page = corpus
                    .mob_index()
                    .entry(name)
                    .and_then(|e| e["page"].as_str());
                row(name, page)
            })
            .collect();
        let quests = corpus
            .quests()
            .iter()
            .map(|q| row(q["name"].as_str().unwrap_or_default(), q["page"].as_str()))
            .collect();
        let spells = eqlog::spelldb::shared()
            .spells
            .iter()
            .map(|e| row(&e.name, None))
            .collect();
        SearchIndex {
            items,
            mobs,
            quests,
            spells,
        }
    }
}

impl Corpus {
    /// Name search across every corpus this engine holds — `knowledge.search`.
    ///
    /// A lookup needs the exact name; a person types three letters. Hits rank EXACT, then PREFIX,
    /// then CONTAINS, and within a rank by name length then alphabetically, so the ranking is total
    /// and the same query twice is the same answer twice.
    ///
    /// The ranking is the ENGINE'S, not the client's: the renderer never sorts or filters domain
    /// data, so handing back an unordered bag would be handing back the work.
    #[must_use]
    pub fn search(&self, query: &str, domain: Option<&str>, limit: Option<usize>) -> Value {
        let needle = query.trim().to_lowercase();
        let limit = limit.unwrap_or(SEARCH_DEFAULT_LIMIT).min(SEARCH_MAX_LIMIT);
        if needle.is_empty() {
            return json!({ "query": query.trim(), "total": 0, "hits": [] });
        }
        let index = self.search_index.get_or_init(|| SearchIndex::build(self));
        let wants = |d: &str| domain.is_none_or(|only| only == d);
        let mut scored: Vec<(u8, usize, &str, &'static str, Option<&str>)> = Vec::new();
        for (rows, domain) in [
            (&index.items, "item"),
            (&index.mobs, "mob"),
            (&index.quests, "quest"),
            (&index.spells, "spell"),
        ] {
            if !wants(domain) {
                continue;
            }
            for r in rows {
                if let Some(rank) = rank_of(&r.folded, &needle) {
                    scored.push((rank, r.name.len(), &r.name, domain, r.page.as_deref()));
                }
            }
        }
        scored.sort_by(|a, b| {
            a.0.cmp(&b.0)
                .then(a.1.cmp(&b.1))
                .then(a.2.cmp(b.2))
                .then(a.3.cmp(b.3))
        });
        let total = scored.len();
        let hits: Vec<Value> = scored
            .into_iter()
            .take(limit)
            .map(|(_, _, name, domain, page)| {
                let mut hit = json!({ "domain": domain, "name": name });
                if let Some(page) = page {
                    hit["page"] = json!(page);
                }
                hit
            })
            .collect();
        // `total` is the MATCH count, not the hit count: the one number a caller cannot compute from
        // what it was handed.
        json!({ "query": query.trim(), "total": total, "hits": hits })
    }
}

/// EXACT (0), PREFIX (1), CONTAINS (2), or no match, over the name's fold.
fn rank_of(folded: &str, needle: &str) -> Option<u8> {
    if folded == needle {
        return Some(0);
    }
    if folded.starts_with(needle) {
        return Some(1);
    }
    if folded.contains(needle) {
        return Some(2);
    }
    None
}
