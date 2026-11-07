//! `JsMap` — a string-keyed map that iterates in insertion order, because JavaScript's maps do.
//!
//! Several ported modules turn a map into an array at snapshot time (`[...map.values()]`), so the
//! iteration order is the serialized array's order, and array order is a claim the comparator
//! checks. A `HashMap` would randomize it and a `BTreeMap` would sort it.
//!
//! The two JS rules it reproduces: `set` on a present key keeps its original position, and `delete`
//! removes one entry and leaves the rest in order.
//!
//! Removal leaves a hole rather than shifting what follows: the entries are `Option`s, a removed
//! one becomes `None`, and the walks skip it. That keeps `remove` O(1), which the LRU maps (the
//! respawn history, the alerts recency and cooldown clocks) ask for on every death and every cast,
//! where the old shift-and-reindex was a pass over the whole map. The holes are compacted once they
//! outnumber the live entries, so a long-lived LRU never carries more than one dead slot per live
//! one. `Option<(String, V)>` is the same size as `(String, V)` (the `String`'s pointer is the
//! niche), so the hot maps that never remove pay nothing.
//!
//! Insertion order does not survive serialization — `serde_json`'s `Map` sorts the keys — and that
//! is fine rather than a bug to fix: parity is deep equality, under which object key order is not a
//! claim. What the order is load-bearing for is the arrays derived from `values()`, and those are
//! built before serialization.

use std::collections::HashMap;

/// Holes a compaction is worth: more dead slots than live entries, and at least this many.
const COMPACT_MIN_DEAD: usize = 32;

#[derive(Debug, Clone)]
pub struct JsMap<V> {
    /// Insertion order; `None` is a removed entry (see the header).
    entries: Vec<Option<(String, V)>>,
    at: HashMap<String, usize>,
    /// The first slot that can hold a live entry: `pop_front` moves it past the hole it leaves, so
    /// an LRU eviction stays O(1) instead of re-walking the dead front.
    head: usize,
}

impl<V> Default for JsMap<V> {
    fn default() -> Self {
        Self::new()
    }
}

impl<V> JsMap<V> {
    pub fn new() -> Self {
        JsMap {
            entries: Vec::new(),
            at: HashMap::new(),
            head: 0,
        }
    }

    pub fn clear(&mut self) {
        self.entries.clear();
        self.at.clear();
        self.head = 0;
    }

    pub fn len(&self) -> usize {
        self.at.len()
    }

    pub fn is_empty(&self) -> bool {
        self.at.is_empty()
    }

    pub fn contains_key(&self, key: &str) -> bool {
        self.at.contains_key(key)
    }

    fn live(&self, i: usize) -> &V {
        &self.entries[i].as_ref().expect("an indexed slot is live").1
    }

    fn live_mut(&mut self, i: usize) -> &mut V {
        &mut self.entries[i].as_mut().expect("an indexed slot is live").1
    }

    pub fn get(&self, key: &str) -> Option<&V> {
        self.at.get(key).map(|&i| self.live(i))
    }

    pub fn get_mut(&mut self, key: &str) -> Option<&mut V> {
        match self.at.get(key) {
            Some(&i) => Some(self.live_mut(i)),
            None => None,
        }
    }

    /// `map.set(k, v)` — an existing key keeps its position, a new one appends.
    pub fn insert(&mut self, key: String, value: V) {
        match self.at.get(&key) {
            Some(&i) => *self.live_mut(i) = value,
            None => {
                self.push(key, value);
            }
        }
    }

    /// The value under `key`, minted from `make` when absent — `map.get(k) ?? map.set(k, make())`.
    /// One hash on the hit path, where `contains_key` then `get_mut` paid two; the aggregates ask
    /// this a dozen times per damage line. A minted value takes the position `insert` gives it.
    pub fn get_or_insert_with(&mut self, key: &str, make: impl FnOnce() -> V) -> &mut V {
        let i = match self.at.get(key) {
            Some(&i) => i,
            None => self.push(key.to_string(), make()),
        };
        self.live_mut(i)
    }

    /// The slot a key sits in, which is stable for as long as nothing is removed: the resist row
    /// cache holds one of these so a tick stream on one mob skips its key build and hash.
    pub fn index_of(&self, key: &str) -> Option<usize> {
        self.at.get(key).copied()
    }

    /// The value at a slot `index_of` or `push` handed out, while nothing has been removed since.
    pub fn value_at_mut(&mut self, i: usize) -> &mut V {
        self.live_mut(i)
    }

    /// `insert` for a key known to be absent, handing back its slot. The caller has just asked
    /// `index_of`, so the hash is not paid a second time.
    pub fn push(&mut self, key: String, value: V) -> usize {
        let i = self.entries.len();
        self.at.insert(key.clone(), i);
        self.entries.push(Some((key, value)));
        i
    }

    /// `map.delete(k); map.set(k, v)` in one move — the LRU re-insert: the key goes to the back
    /// whether or not it was present, and the rest keep their order.
    pub fn move_to_back(&mut self, key: &str, value: V) {
        if let Some(i) = self.at.remove(key) {
            self.entries[i] = None;
        }
        self.push(key.to_string(), value);
        self.compact_if_sparse();
    }

    /// The oldest entry, removed — the LRU eviction. O(1) amortised: the dead front is skipped by
    /// `head`, never re-walked.
    pub fn pop_front(&mut self) -> Option<(String, V)> {
        while self.head < self.entries.len() {
            let i = self.head;
            self.head += 1;
            if let Some((key, value)) = self.entries[i].take() {
                self.at.remove(&key);
                self.compact_if_sparse();
                return Some((key, value));
            }
        }
        None
    }

    /// `remove`, handing the value back; None when the key is absent. O(1): the slot becomes a
    /// hole (see the header).
    pub fn take(&mut self, key: &str) -> Option<V> {
        let i = self.at.remove(key)?;
        let (_, value) = self.entries[i].take()?;
        self.compact_if_sparse();
        Some(value)
    }

    /// `map.delete(k)` — true when something was removed. See the header on the cost.
    pub fn remove(&mut self, key: &str) -> bool {
        self.take(key).is_some()
    }

    /// Keep the entries `keep` says to, in their order.
    pub fn retain(&mut self, mut keep: impl FnMut(&str, &V) -> bool) {
        let before = self.at.len();
        for slot in &mut self.entries {
            let dead = slot.as_ref().is_some_and(|(k, v)| !keep(k, v));
            if dead {
                if let Some((k, _)) = slot.take() {
                    self.at.remove(&k);
                }
            }
        }
        if self.at.len() != before {
            self.compact();
        }
    }

    fn compact_if_sparse(&mut self) {
        let dead = self.entries.len() - self.at.len();
        if dead >= COMPACT_MIN_DEAD && dead > self.at.len() {
            self.compact();
        }
    }

    /// Drop the holes and re-index. Order is kept, slots are not: nothing holds a slot across a
    /// removal (`value_at_mut`).
    fn compact(&mut self) {
        self.entries.retain(Option::is_some);
        self.at.clear();
        for (i, slot) in self.entries.iter().enumerate() {
            if let Some((k, _)) = slot {
                self.at.insert(k.clone(), i);
            }
        }
        self.head = 0;
    }

    pub fn iter(&self) -> impl Iterator<Item = (&str, &V)> {
        self.entries
            .iter()
            .filter_map(|slot| slot.as_ref().map(|(k, v)| (k.as_str(), v)))
    }

    pub fn values(&self) -> impl Iterator<Item = &V> {
        self.entries
            .iter()
            .filter_map(|slot| slot.as_ref().map(|(_, v)| v))
    }

    /// A walk that writes to every value without touching the keys.
    pub fn values_mut(&mut self) -> impl Iterator<Item = &mut V> {
        self.entries
            .iter_mut()
            .filter_map(|slot| slot.as_mut().map(|(_, v)| v))
    }

    /// The keys in insertion order — the LRU order the respawn module's history evicts from.
    pub fn keys(&self) -> impl Iterator<Item = &str> {
        self.entries
            .iter()
            .filter_map(|slot| slot.as_ref().map(|(k, _)| k.as_str()))
    }

    /// `[...map.values()]` — the values, owned, in insertion order, which is a published claim
    /// wherever a map becomes an array.
    pub fn into_values(self) -> Vec<V> {
        self.entries
            .into_iter()
            .filter_map(|slot| slot.map(|(_, v)| v))
            .collect()
    }
}

impl<V: serde::Serialize> serde::Serialize for JsMap<V> {
    fn serialize<S: serde::Serializer>(&self, s: S) -> Result<S::Ok, S::Error> {
        use serde::ser::SerializeMap;
        let mut m = s.serialize_map(Some(self.at.len()))?;
        for (k, v) in self.iter() {
            m.serialize_entry(k, v)?;
        }
        m.end()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_reinsert_keeps_its_place_and_a_delete_closes_the_gap() {
        let mut m: JsMap<i32> = JsMap::new();
        m.insert("a".into(), 1);
        m.insert("b".into(), 2);
        m.insert("c".into(), 3);
        m.insert("a".into(), 9);
        assert_eq!(m.values().copied().collect::<Vec<_>>(), vec![9, 2, 3]);
        assert!(m.remove("b"));
        assert!(!m.remove("b"));
        assert_eq!(m.values().copied().collect::<Vec<_>>(), vec![9, 3]);
        assert_eq!(m.get("c"), Some(&3));
        m.insert("b".into(), 4);
        assert_eq!(m.values().copied().collect::<Vec<_>>(), vec![9, 3, 4]);
        assert_eq!(m.len(), 3);
    }

    /// The LRU moves: a re-insert goes to the back whether or not the key was there, and the
    /// front pops oldest-first past any hole, exactly as delete-then-set and `keys().next()` did.
    #[test]
    fn move_to_back_and_pop_front_are_the_lru_in_insertion_order() {
        let mut m: JsMap<i32> = JsMap::new();
        for (k, v) in [("a", 1), ("b", 2), ("c", 3)] {
            m.insert(k.into(), v);
        }
        m.move_to_back("a", 10);
        m.move_to_back("d", 4);
        assert_eq!(m.keys().collect::<Vec<_>>(), vec!["b", "c", "a", "d"]);
        assert_eq!(m.pop_front(), Some(("b".to_string(), 2)));
        m.remove("c");
        assert_eq!(m.pop_front(), Some(("a".to_string(), 10)));
        assert_eq!(m.keys().collect::<Vec<_>>(), vec!["d"]);
        assert_eq!(m.len(), 1);
        assert_eq!(m.pop_front(), Some(("d".to_string(), 4)));
        assert_eq!(m.pop_front(), None);
        assert!(m.is_empty());
    }

    /// Holes are compacted once they outnumber the live entries, and the order survives it.
    #[test]
    fn compaction_keeps_the_order_and_every_live_entry() {
        let mut m: JsMap<usize> = JsMap::new();
        for i in 0..200 {
            m.insert(format!("k{i}"), i);
        }
        for i in 0..150 {
            assert!(m.remove(&format!("k{i}")));
        }
        assert_eq!(m.len(), 50);
        assert!(m.entries.len() < 200, "compacted");
        let keys: Vec<String> = (150..200).map(|i| format!("k{i}")).collect();
        assert_eq!(m.keys().collect::<Vec<_>>(), keys);
        assert_eq!(m.get("k170"), Some(&170));
        m.retain(|_, &v| v % 2 == 0);
        assert_eq!(m.len(), 25);
        assert_eq!(m.values().copied().next(), Some(150));
    }
}
