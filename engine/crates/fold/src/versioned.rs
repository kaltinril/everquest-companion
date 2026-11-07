//! `Versioned<T>` — a value that counts its own mutable borrows.
//!
//! The buffs hygiene sweep memoizes "nothing can come due before instant X" and must forget that
//! memo the moment a map it was computed over changes. Every change to the map goes through a
//! `&mut` borrow, so counting those borrows is a sound over-approximation of "changed": a borrow
//! that wrote nothing bumps the count too, which costs one re-sweep and never a stale answer.
//! Reads go through `Deref` and move nothing.

use std::ops::{Deref, DerefMut};

#[derive(Debug, Clone, Default)]
pub struct Versioned<T> {
    inner: T,
    version: u64,
}

impl<T> Versioned<T> {
    pub fn new(inner: T) -> Self {
        Versioned { inner, version: 0 }
    }

    /// How many times the value has been borrowed mutably. Two equal readings mean nothing could
    /// have changed between them.
    #[must_use]
    pub fn version(&self) -> u64 {
        self.version
    }
}

impl<T> Deref for Versioned<T> {
    type Target = T;

    fn deref(&self) -> &T {
        &self.inner
    }
}

impl<T> DerefMut for Versioned<T> {
    fn deref_mut(&mut self) -> &mut T {
        self.version = self.version.wrapping_add(1);
        &mut self.inner
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_read_moves_nothing_and_a_mutable_borrow_moves_the_version() {
        let mut v = Versioned::new(vec![1, 2]);
        assert_eq!(v.version(), 0);
        assert_eq!(v.len(), 2);
        assert_eq!(v.version(), 0);
        v.push(3);
        assert_eq!(v.version(), 1);
        let _ = v.last_mut();
        assert_eq!(v.version(), 2);
    }
}
