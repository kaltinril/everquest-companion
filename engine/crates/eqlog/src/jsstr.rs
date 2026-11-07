//! JavaScript string semantics, spelled out: the three places Rust's defaults are not V8's.
//!
//!   * `String.prototype.trim` strips the ECMA-262 WhiteSpace ∪ LineTerminator set; Rust's
//!     `str::trim` strips Unicode `White_Space`. They disagree both ways — JS strips U+FEFF and
//!     does not strip U+0085 NEL — and either is one code point away from a mis-normed mob name.
//!   * `\s` inside a JS regex is that same ECMA set. `JS_S` is it as a regex class.
//!   * `JSON.stringify` escapes `"`, `\` and the C0 controls and nothing else — no `/`, no DEL, no
//!     non-ASCII. The whole golden rests on `write_json_string`.
//!
//! `to_lowercase` is deliberately absent: JS `toLowerCase` and Rust's `str::to_lowercase` are both
//! Unicode Default Case Conversion, so callers use Rust's directly.

/// The ECMA-262 `WhiteSpace ∪ LineTerminator` set, as a regex character class. Interpolated into
/// every ported pattern that wrote `\s`.
pub const JS_S: &str =
    "[\\t\\n\\x0B\\x0C\\r \\u{A0}\\u{1680}\\u{2000}-\\u{200A}\\u{2028}\\u{2029}\\u{202F}\\u{205F}\\u{3000}\\u{FEFF}]";

/// The same set with no brackets, for the one ported pattern that unions it with something else
/// (`COIN_SEPARATORS_RE`'s `[\s,]`).
pub const JS_S_INNER: &str =
    "\\t\\n\\x0B\\x0C\\r \\u{A0}\\u{1680}\\u{2000}-\\u{200A}\\u{2028}\\u{2029}\\u{202F}\\u{205F}\\u{3000}\\u{FEFF}";

/// JavaScript's `.`: every character except a line terminator, which in ECMA-262 is four characters
/// (U+000A, U+000D, U+2028, U+2029). The `regex` crate's `.` excludes only U+000A.
///
/// It matters because the log carries chat lines with bare carriage returns inside them — the
/// splitter cuts on `\n` and strips only a trailing `\r`. `LINE_RE`'s `(.*)$` cannot cross one, so
/// the line becomes no event at all and `seq` does not advance.
pub const JS_DOT: &str = "[^\\n\\r\\u{2028}\\u{2029}]";

/// One character of `JS_S`. See the header for the two disagreements with `char::is_whitespace`.
pub fn is_js_space(c: char) -> bool {
    matches!(
        c,
        '\u{9}'
            | '\u{A}'
            | '\u{B}'
            | '\u{C}'
            | '\u{D}'
            | '\u{20}'
            | '\u{A0}'
            | '\u{1680}'
            | '\u{2000}'
            ..='\u{200A}'
                | '\u{2028}'
                | '\u{2029}'
                | '\u{202F}'
                | '\u{205F}'
                | '\u{3000}'
                | '\u{FEFF}'
    )
}

/// `String.prototype.trim`.
pub fn js_trim(s: &str) -> &str {
    s.trim_matches(is_js_space)
}

/// `JSON.stringify` on a string, including the surrounding quotes.
///
/// Clean runs are copied whole and only the rare byte is escaped: the escaped set is `"`, `\` and
/// the C0 controls, all ASCII, so a cut at one of them is a character boundary and every byte of a
/// multi-byte character is part of a run. (The string is written for every event; this was a
/// `push` per char.)
pub fn write_json_string(out: &mut String, s: &str) {
    out.push('"');
    let mut run = 0;
    for (i, &b) in s.as_bytes().iter().enumerate() {
        if b >= 0x20 && b != b'"' && b != b'\\' {
            continue;
        }
        out.push_str(&s[run..i]);
        push_escape(out, b);
        run = i + 1;
    }
    out.push_str(&s[run..]);
    out.push('"');
}

/// The escape for one byte of the escaped set.
fn push_escape(out: &mut String, b: u8) {
    const HEX: &[u8; 16] = b"0123456789abcdef";
    match b {
        b'"' => out.push_str("\\\""),
        b'\\' => out.push_str("\\\\"),
        0x08 => out.push_str("\\b"),
        0x09 => out.push_str("\\t"),
        0x0A => out.push_str("\\n"),
        0x0C => out.push_str("\\f"),
        0x0D => out.push_str("\\r"),
        _ => {
            out.push_str("\\u00");
            out.push(HEX[usize::from(b >> 4)] as char);
            out.push(HEX[usize::from(b & 0xf)] as char);
        }
    }
}

/// `JSON.stringify` on a number.
///
/// JS has a single numeric type, so an integral double prints without a fraction (`3`, never
/// `3.0`). Every integer field here is already an `i64`; this exists for `expGain.pct`, the one
/// true f64 in the stream, which a log printing `(3%)` makes integral.
pub fn write_js_number(out: &mut String, v: f64) {
    if v.fract() == 0.0 && v.abs() < 9.0e15 {
        out.push_str(&format!("{}", v as i64));
    } else {
        // Rust's `Display` for f64 is shortest-round-trip, the same guarantee V8 makes. The two
        // notations only part company past 1e21 / below 1e-6, which no percentage reaches.
        out.push_str(&format!("{v}"));
    }
}

#[cfg(test)]
mod json_string_tests {
    use super::write_json_string;

    /// The character-at-a-time writer this replaced, kept as the oracle.
    fn by_char(s: &str) -> String {
        let mut out = String::from("\"");
        for c in s.chars() {
            match c {
                '"' => out.push_str("\\\""),
                '\\' => out.push_str("\\\\"),
                '\u{8}' => out.push_str("\\b"),
                '\u{9}' => out.push_str("\\t"),
                '\u{A}' => out.push_str("\\n"),
                '\u{C}' => out.push_str("\\f"),
                '\u{D}' => out.push_str("\\r"),
                c if (c as u32) < 0x20 => {
                    out.push_str(&format!("\\u{:04x}", c as u32));
                }
                c => out.push(c),
            }
        }
        out.push('"');
        out
    }

    /// Every escape class, each at the start, in the middle and at the end of a run, beside the
    /// bytes that are NOT escaped (`/`, DEL, every non-ASCII character), and `serde_json` as a
    /// second witness that this is `JSON.stringify`'s set.
    #[test]
    fn the_run_writer_is_the_char_writer_byte_for_byte() {
        let cases = [
            "",
            "plain",
            "\"",
            "\\",
            "a\"b",
            "a\\b",
            "\"\\\"",
            "\u{8}\t\n\u{C}\r",
            "tab\there",
            "nl\n",
            "\rcr",
            "\u{0}",
            "\u{1}x\u{1f}",
            "\u{B}vertical tab",
            "del\u{7f}",
            "slash/",
            "Ünïcödé mob",
            "日本語 \"quoted\" \u{2028}",
            "a rat tries to bite YOU, but misses! (Lucky)",
            "Velkator tells general2:1, 'rebaseline\rCount items from'",
        ];
        for s in cases {
            let mut got = String::new();
            write_json_string(&mut got, s);
            assert_eq!(got, by_char(s), "{s:?}");
            assert_eq!(got, serde_json::to_string(s).unwrap(), "{s:?}");
        }
    }
}
