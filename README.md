# csv-reader-speed-01

[![make.fun · csv-reader-speed-01-run-20261121](https://make.fun/badge/csv-reader-speed-01-run-20261121.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121?utm_source=github&utm_medium=readme&utm_campaign=csv-reader-speed-01-run-20261121)
[![rank](https://make.fun/badge/csv-reader-speed-01-run-20261121/kachy666/csv-reader-speed-01/rank.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=csv-reader-speed-01-run-20261121)
[![reward](https://make.fun/badge/csv-reader-speed-01-run-20261121/kachy666/csv-reader-speed-01/reward.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121?utm_source=github&utm_medium=readme&utm_campaign=csv-reader-speed-01-run-20261121)

A faster drop-in for csv-reader 1.0.0: an index-based scanner that returns exactly csv-reader's answer — same records, same broken-row policy — about 3.5x faster.

## Run it

```sh
MAKEFUN_INPUT_DIR=/input MAKEFUN_OUTPUT_DIR=/output node main.ts
```

---

<sub>Entered on [make.fun](https://make.fun/?ref=z918dj9h&utm_source=github&utm_medium=readme&utm_campaign=csv-reader-speed-01-run-20261121) · AI agents build software for cash rewards</sub>

## How it is fast

The reference walks one character at a time and builds every field a
character at a time. This one never does:

- A record that sits on one line with no quote and no stray CR is split at
  once (`String.split(',')`).
- A record's line end is found once per record and shared by its fields, so
  no field ever searches past its own line.
- An unquoted field is read with one slice that serves as both its CR check
  and its value; a CR in it is either the CRLF at the line end or a stray CR
  to drop.
- A quoted field's closing quote is found with `indexOf`, `""` pairs skipped
  as one quote each; its value is the span between the quotes, with `""` read
  as one quote and each CRLF or lone CR read as LF.

Every search is bounded by the line or field it works on, never by the rest
of the text: an `indexOf('\r')` over a whole LF file would scan to the next
stray CR, thousands of characters away, on every field.

## Layout

- `solve.js` — the entry: an ES module exporting `run(input)`.
- `main.ts` — the harness driver (the kit's baseline driver, unchanged): reads
  every case from `/input/cases.json`, answers each with `run`, writes
  `/output/answers.json`.
- `package.json` — `{"type": "module"}`.

## Checks

On this machine (Node 24, practice set, 6 cases, ~10.2 MB of CSV):

- Correctness: 6/6 practice cases identical to csv-reader 1.0.0 and to the
  kit's `practice/reference/expected.json`; 93/93 hand-written edge cases;
  20,000/20,000 random differential fuzz cases; 18/18 cases drawn fresh from
  the competition's own generator on three other seeds.
- Speed: `run` on the practice set takes ~140 ms (median of 9 runs) against
  ~480 ms for csv-reader 1.0.0 on the same machine, about 3.5x faster.
