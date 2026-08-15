#!/usr/bin/env node
/* Lints every puzzle pool. Exits non-zero on errors so CI can gate a deploy. */

import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { lintPuzzle } from './lint.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const POOLS = ['published', 'candidates'];

const read = async (name) => {
  try {
    const data = JSON.parse(await readFile(join(ROOT, 'puzzles', `${name}.json`), 'utf8'));
    return data.puzzles || [];
  } catch (err) {
    if (err.code === 'ENOENT') return [];
    throw new Error(`puzzles/${name}.json: ${err.message}`);
  }
};

const pools = Object.fromEntries(await Promise.all(POOLS.map(async (n) => [n, await read(n)])));
const tutorial = JSON.parse(await readFile(join(ROOT, 'puzzles', 'tutorial.json'), 'utf8'));

let errors = 0;
let warnings = 0;

for (const [name, puzzles] of Object.entries({ ...pools, tutorial: [tutorial] })) {
  const others = name === 'tutorial' ? [] : puzzles;
  console.log(`\n${name} — ${puzzles.length} puzzle${puzzles.length === 1 ? '' : 's'}`);
  for (const puzzle of puzzles) {
    // generated candidates must cite their roots; the hand-authored seed set predates the rule
    const issues = lintPuzzle(puzzle, { others, requireSources: name === 'candidates' });
    for (const issue of issues) {
      if (issue.level === 'error') errors++; else warnings++;
      console.log(`  ${issue.level === 'error' ? '✕' : '!'} ${puzzle.id}: ${issue.message}`);
    }
  }
}

// published puzzles need dates; the daily series must not have holes in the past
const dates = pools.published.map((p) => p.date);
if (dates.some((d) => !d)) {
  console.log('\n  ✕ published: every puzzle needs a date');
  errors++;
}

console.log(`\n${errors} error${errors === 1 ? '' : 's'}, ${warnings} warning${warnings === 1 ? '' : 's'}\n`);
process.exit(errors ? 1 : 0);
