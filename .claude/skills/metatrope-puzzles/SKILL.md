---
name: metatrope-puzzles
description: Generate new candidate puzzles for the Metatrope daily word game — English compound words whose two borrowed roots are translated into Latin or Greek and glued back together. Use when asked to make, generate, write, or add Metatrope puzzles, to refill the candidate queue, or when the review desk is running low. Appends to puzzles/candidates.json; never touches the published schedule.
---

# Generating Metatrope puzzles

A Metatrope puzzle takes an English word built from two borrowed roots,
translates each root into a *different* classical language, and joins the
results. The player sees only the coinage and names the English original.

```
hippopotamus  =  Greek hippos (horse) + potamos (river)
              →  Latin equus (horse) + flumen (river)
              →  clue: equoflumen
```

The player's route back is always the same three steps: recognise the root in
the clue → recover its meaning through an English word built on that same root
→ translate the meaning-pair back into English. **Every rule below exists to
keep those three steps possible.** A puzzle that breaks one of them is not
merely hard, it is unsolvable.

## Before generating anything

Read all three pools and build the exclusion set:

```
puzzles/published.json    already scheduled — answers and roots are spent
puzzles/candidates.json   awaiting review — do not duplicate
puzzles/rejected.json     already turned down — do not re-propose
```

The JSON files are authoritative for what has been used. Never re-propose an
answer that appears in any pool, and avoid reusing a *target root* (Latin
`-graphia`, Greek `-gramma`) that appeared in the last dozen puzzles — repeated
roots make the relatives hint feel recycled.

`reference/wordbank.md` is an idea list only. It is not a record of what has
been used; check the JSON for that.

## The rules

**1. The answer is one English word from exactly two non-Germanic roots,
borrowed as a unit.** Both halves must come from the same source language.
Hybrids (Greek + Latin in one word, like *television* or *bicycle*) have no
single source language and cannot be labelled honestly.

**2. Target language is Latin or Greek.** When the source is Greek the target
is Latin, and vice versa. This is not stylistic: the "relatives" hint shows
English words built on the *target* root, so the target must be a language whose
roots are visible throughout English. Romance and Germanic targets starve that
hint.

**3. Every target root needs at least two recognisable English descendants.**
This is the most common way a puzzle dies. Latin `centum` gives *century,
percent, centennial* — fine. Greek `hekaton` gives *hecatomb* and nothing else —
the player hits a wall with no way through. Check this *before* committing to a
root, and pick a different synonym in the target language if it fails.

**4. The clue must not be, or closely resemble, an existing English word.**
Greek *sarkophagos* is a perfect calque of *carnivore* and completely unusable,
because the clue reads as *sarcophagus*.

**5. The meaning pair must identify exactly one English word.** "time" +
"measure" yields chronometer, chronograph, chronoscope and horologe — four
defensible answers, so no puzzle. Say the gloss pair aloud and ask what else it
could be. If you can name a second candidate, either add it to `acceptable` or
drop the puzzle.

**6. Clue length 8–12 letters.** Below eight there is too little to split;
*amorsapientia* at thirteen stops reading as a word and starts reading as a
phrase.

**7. The seam must be pronounceable.** Use the classical linking vowel: `-o-`
for Greek compounds (`eikono-gramma`), `-i-` for Latin (`spiri-penna`). Drop the
linking vowel when the second root starts with a vowel (`port-unda`).

**8. The etymology must be uncontested.** *chocolate* from Nahuatl *xococ*
(bitter) + *ātl* (water) is a popular gloss and a disputed one. Skip anything
where scholars disagree about the split — the note has to be true.

**9. Keep the two relative lists in their own lanes.** Each root carries two of
them and they do opposite jobs:

- `targetCognates` — English words on the root **as it appears in the clue**.
  These let the player decode the coinage: *cartography* and *charter* reveal
  that `charta` means paper. They must not point at the answer.
- `sourceCognates` — English words on the root **as it appears in the original**.
  These point straight at the answer, which is the whole idea: for
  *equoflumen*, being handed *hippodrome* and *hippocampus* all but spells
  hippo-. They are the last hint the player can buy.

Neither list may contain the answer itself. `sourceCognates` is legitimately
empty when the root left no other word in English — the usual case for Japanese
borrowings, which arrive alone. Leave it as `[]` rather than padding it; the
game simply shows fewer hints. For Greek and Latin sources an empty list is
almost always an oversight, and the linter says so.

## Making one puzzle

1. **Pick an answer** — from `reference/wordbank.md` or your own reading. Check
   it against the exclusion set.

2. **Verify the source split.** Fetch the Wiktionary entry for the English word
   and confirm both roots and their meanings from the etymology section. Do not
   work from memory: plausible-looking roots are exactly what gets confabulated,
   and a wrong root reads as correct to everyone who is not holding a
   dictionary.

3. **Translate each meaning into the target language.** Choose the root form
   that is actually productive in English compounds, not the dictionary
   headword — Latin *spira* over *helix*, *penna* over *ala*.

4. **Verify rule 3.** Confirm each target root has two or more recognisable
   English descendants. Wiktionary's "Derived terms" and "Descendants" sections
   are the fastest check. While you are there, collect the same list for the
   *source* root — that becomes `sourceCognates`, the final hint.

5. **Build the clue** and check it against rules 4, 5, 6 and 7.

6. **Write the note** — one or two sentences shown after solving. It must teach
   something the player did not know: a mis-split (*helico + pter*, not *heli +
   copter*), a sound change (*kami* → *gami*), a piece of history. A note that
   only restates the gloss is wasted.

7. **Estimate difficulty 1–5** from: how familiar the answer is, how opaque the
   English word's own structure is (*origami* hides its seam, *photograph* does
   not), and how directly the gloss pair points at the answer.

## Citing sources

Every root carries a `sources` array — the URL plus the specific claim it
supports. The review desk and `npm run check` both warn on any uncited root.

```json
"sources": [
  "https://en.wiktionary.org/wiki/origami — 折り (ori, “fold”) + 紙 (kami, “paper”)",
  "https://en.wiktionary.org/wiki/plico#Latin — plicō, “I fold”"
]
```

One line per claim. If a source contradicts what you assumed, follow the source
or drop the puzzle.

## Output

Append to the `puzzles` array in `puzzles/candidates.json`. **Never write to
`published.json`** — scheduling is the reviewer's decision, made at the desk.

```json
{
  "id": "origami-ja-la",
  "clue": "plicocharta",
  "answer": "origami",
  "acceptable": ["origami"],
  "source": { "language": "Japanese" },
  "target": { "language": "Latin" },
  "difficulty": 2,
  "roots": [
    {
      "target": "plico-",
      "source": "ori (折り)",
      "meaning": "fold",
      "targetCognates": ["duplicate", "complicate", "replica"],
      "sourceCognates": [],
      "sources": ["https://en.wiktionary.org/wiki/plico#Latin — plicō, “I fold”"]
    },
    {
      "target": "-charta",
      "source": "gami (紙, kami)",
      "meaning": "paper",
      "targetCognates": ["cartography", "charter", "cartoon"],
      "sourceCognates": [],
      "sources": ["https://en.wiktionary.org/wiki/charta#Latin — charta, “sheet of papyrus”"]
    }
  ],
  "note": "折り紙 — literally “folding paper.” The k of kami softens to g inside the compound, which is why the seam is invisible in English.",
  "generated": "YYYY-MM-DD",
  "flags": []
}
```

Field notes:

- `id` — `answer-source-target`, using ISO-ish language tags (`ja`, `el`, `la`,
  `ar`, `sa`, `nah`).
- `target` on each root — that root's exact slice of the clue, hyphenated to
  show which end it joins. With hyphens stripped, the two must concatenate to
  spell `clue` exactly. This is the first thing the linter checks.
- `source` on each root — the root as it appears in the original language;
  include the native script where there is one.
- `acceptable` — every spelling you would accept, including the answer itself
  and any plural or common variant.
- `flags` — plain-English misgivings for the reviewer, and **only for things the
  linter cannot detect**. It already reports missing fields, split mismatches,
  duplicate answers, thin cognate lists, clue length and uncited roots; repeating
  those just adds noise to the card. Use `flags` for judgement calls: a shaky
  gloss, a second plausible answer, a note you are not certain of.

## Finishing

Run `npm run check`. It applies the same rules as the review desk. Fix every
error; each warning is either fixed or explained in `flags`.

Then tell the reviewer what to look at: how many candidates, which source
languages, and which ones you have doubts about. They will open the desk with
`npm run review` and judge each one by playing it.

## Batches

Default to six candidates per run unless asked otherwise. Spread them across
source languages and across the difficulty range rather than generating six
variations on one idea — a queue of six Greek→Latin animal compounds is a worse
week than four good puzzles from four different languages.
