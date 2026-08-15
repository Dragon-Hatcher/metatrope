# Metatrope

A daily word game. An English compound word is split into its two borrowed
roots, each root is translated into a *different* language, and the pieces are
glued back together. You name the original word.

> **equoflumen** → Greek *hippos* (horse) + *potamos* (river), rendered in Latin
> as *equus* + *flumen*. The answer is **hippopotamus**.

## Layout

```
index.html  styles.css  app.js     the game — plain static files, no build step
puzzles/
  published.json                   the daily series, keyed by date
  candidates.json                  generated but not yet reviewed
  rejected.json                    set aside (kept so the generator can avoid repeats)
  tutorial.json                    the worked example used in "How to play"
review/                            the review desk (local only, never deployed)
tools/
  lint.mjs                         puzzle validation, shared by the desk and CI
  review-server.mjs                local server for the review desk
  check.mjs                        CLI validator — `npm run check`
.claude/skills/metatrope-puzzles/  the puzzle generator
```

## Making puzzles

The loop has two halves. To fill the queue, run the skill:

```
/metatrope-puzzles                 # six candidates, verified and cited
```

It reads all three pools so it never re-proposes a used answer, checks every
root against a dictionary, records a citation per root, and appends to
`candidates.json`. It never writes to the schedule.

To judge what it produced, open the desk:

```
npm run review          # http://127.0.0.1:4173/review/
```

The review desk shows candidates on the left and the publishing schedule on the
right. For each candidate you can **Play it** (opens the real game with that
puzzle loaded), **Edit** any field inline, **Reject** it, or **Publish →**,
which drops it at the end of the queue.

Dates follow position rather than the other way round: the queue runs one puzzle
a day with no gaps, so **dragging a row is the only scheduling gesture** — grab
the handle, drop it where you want it, and every date below re-flows. Anything
already published is frozen in place and cannot be dragged.

Changes are held in the page until you hit **Save** (or ⌘S), which rewrites
`puzzles/*.json`.

Every card is linted live: errors (red) block nothing but are flagged on
publish, warnings (amber) are advisory. `npm run check` runs the same rules from
the command line and exits non-zero on errors, so CI gates the deploy.

## Playing locally

```
npm run review          # then open http://127.0.0.1:4173/play
```

Useful URLs:

| URL | shows |
| --- | --- |
| `/play` | today's puzzle |
| `/play?p=3` | puzzle number 3, as a preview (no stats recorded) |
| `/play?d=2026-08-20` | the puzzle scheduled for that date |
| `/play?preview=<base64>` | an arbitrary puzzle — what **Play it** uses |

## Deploying

Push to `main`. `.github/workflows/pages.yml` validates the puzzles, then
publishes `index.html`, `styles.css`, `app.js` and `puzzles/published.json` to
GitHub Pages. Candidates and rejects stay in the repo but are never uploaded, so
upcoming answers are not sitting on the public site.

One-time setup: **Settings → Pages → Source → GitHub Actions**.

## Puzzle format

```jsonc
{
  "id": "hippopotamus-el-la",     // stable slug: answer + source + target
  "date": "2026-08-15",           // published puzzles only
  "clue": "equoflumen",           // what the player sees
  "answer": "hippopotamus",
  "acceptable": ["hippopotamus", "hippo"],
  "source": { "language": "Greek" },   // where the roots came from
  "target": { "language": "Latin" },   // what they were translated into
  "difficulty": 1,                     // 1–5, author's estimate
  "roots": [
    {
      "target": "equo-",               // this root's slice of the clue
      "source": "hippos",              // the root in the original language
      "meaning": "horse",
      "targetCognates": ["equestrian", "equine"],   // decode the clue
      "sourceCognates": ["hippodrome", "hippocampus"], // point at the answer
      "sources": ["https://… — equus, “horse”"]     // required on generated puzzles
    },
    { "target": "-flumen", "source": "potamos", "meaning": "river",
      "targetCognates": ["fluent", "affluent"],
      "sourceCognates": ["Mesopotamia"] }
  ],
  "note": "Shown after solving."
}
```

The two `roots[].target` values, with hyphens stripped, must concatenate to
exactly `clue` — that is what lets the game animate the seam and what `lint.mjs`
checks first.

Hints come in four levels, each opened by the one below it for the same root:
the languages and the split, then `targetCognates`, then `meaning`, then
`sourceCognates`. The last is the strongest hint in the game, so it is the last
one a player can reach. `sourceCognates` may be `[]` when the root left no other
word in English — common for Japanese borrowings — and that level simply does
not appear, giving the puzzle six hints instead of eight.
