//! The registry's drain of live `/con` lines. Apart from `lib.rs` so that file stays under its
//! recorded size.

use crate::{modules, Registry};

impl Registry {
    /// Every live `/con` any module saw since the last drain, in registration order. Empty for
    /// every historical fold — see [`EqModule::take_cons`].
    pub fn take_cons(&mut self) -> Vec<modules::consider::ConEvent> {
        let mut out = Vec::new();
        for m in &mut self.mods {
            out.append(&mut m.take_cons());
        }
        out
    }
}
