# pet-rules: what was asked for

Every request about whose pet a pet is, newest at the bottom. Read it before changing the pet
code; nothing listed here is removed or narrowed without the owner's word (RULES.md, rule 19).

| Date | Asked by | The ask | Status |
| --- | --- | --- | --- |
| 2026-11-19 | owner | Malkil's pet Xabantik was not on the meter, and four pets (Jasekab, Gebarn, Genober, Xekn) were listed as members of his group. "we need a set of rules that are smarter". | Five rules were proposed to him that night (below). |
| 2026-11-20 | owner | On the two open questions (show strangers' pets? may the engine infer an owner from summon timing?): "i'll go by your opinion for now on pets". | The opinion given him: a pet with no known owner gets its own row and is never dropped; an owner is inferred from timing only for a group mate, only when exactly one summoned just before the pet appeared; a leader line always wins. Batch 1 built 2026-11-20 (rules 1 and 2), batch 2 the same evening (rule 3). Rule 4 not reviewed. |

## The five rules proposed on 2026-11-19

1. Recognise pet names. A name from the game's summoned-pet table is a summoned pet: never guessed
   to be a player or a group member. BUILT 2026-11-20 for the group list (the buff-burst rung).
2. Never drop pet damage. A pet with no known owner gets its own row; when the owner is learned,
   that damage moves to the owner's pet row, including what came before. BUILT 2026-11-20: the row
   reads `Pet (Xabantik) - owner unknown`.
3. Learn the owner without `/pet leader`. When exactly one group member cast a pet summon and a new
   pet-named attacker then joins the group's fights, credit it to that member and mark it as
   inferred. Two members summoning at once stays unknown until a leader line. BUILT 2026-11-20
   (`fold/tests/pet_summon_owner.rs`). As built:
   - Waited on: a `begins casting <a pet summon>` line by someone on the group roster at that
     moment, for 10 minutes.
   - The guess is made when a table name with no owner swings (hit or miss) at something the group
     is fighting, the name first acted at least 2 s after that cast, and exactly one summon is
     waiting. Your own unanswered summon counts as a second one: the new pet may be yours.
   - The row reads `Pet (Jeber) - Malkil (guessed)` and what the pet did before moves into it.
   - A leader line or a claim replaces the guess and takes the row with it, whoever it names.
   - One summon explains one pet. A second summon by the same group mate ends their earlier guess.
4. "Yours" ends. Your claim on a name ends when that pet dies, when you summon another, or when it
   names someone else its leader. PARTLY THERE already (death, succession); not reviewed yet.
5. The leader line stays the strongest evidence. It overrides any inference, and a pet you have
   right now cannot be taken by a chat line. ALREADY SO (`fold/tests/ally_pet_reused_name.rs`).

## Limits the owner has not ruled on

- The table also holds names a player could pick (Karn, Garn, Kaber). A player with such a name
  who is in the group only by having been buffed is not listed until a join line, group chat, a
  stated membership or the owner's own add. Outside the group their row reads `Pet (Karn) - owner
  unknown`.
- A guess can be wrong: a stranger's new pet that joins the group's fight inside the 10 minutes,
  before the group mate's own pet has swung, is credited to the group mate until a leader line.
- A summon cast before the app started reading, or more than 10 minutes before the pet's first
  swing at the group's target, is not guessed: the pet stays `owner unknown` until `/pet leader`.
- An unclaimed pet's row is kind `other`, which the Group view hides. The opinion given the owner
  was "shown only while it hits your group's targets"; what is built is "shown under Everyone, and
  under Group once tied to a group member". Rule 3 is what brings a group mate's pet into Group
  without a leader line.
