/* Shared puzzle validation. Pure ESM, no Node APIs — imported by both the
   review UI (in the browser) and tools/check.mjs (in CI). */

export const HYPHENS = /[-\u2010-\u2015\u2212]/g;

export const norm = (s = '') => String(s)
  .toLowerCase()
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .replace(/[^a-z]/g, '');

export const bareRoot = (s = '') => String(s).replace(HYPHENS, '').trim();

/** The clue split into its two surface pieces, or null if they do not join up. */
export function splitOf(puzzle) {
  const roots = puzzle?.roots;
  if (!Array.isArray(roots) || roots.length !== 2) return null;
  const parts = roots.map((r) => bareRoot(r.target));
  return norm(parts.join('')) === norm(puzzle.clue) ? parts : null;
}

const isBlank = (v) => v === undefined || v === null || String(v).trim() === '';

/**
 * English words built on one of a root's two faces.
 * `target` — the root as it appears in the clue; these help decode the coinage.
 * `source` — the root as it appears in the original; these point at the answer,
 * and are legitimately empty when the root left no other trace in English.
 */
export function cognatesOf(root, face) {
  const raw = face === 'source'
    ? root?.sourceCognates
    : (root?.targetCognates ?? root?.cognates);
  return Array.isArray(raw) ? raw.filter((c) => !isBlank(c)) : [];
}

/**
 * @param {object} puzzle
 * @param {{ others?: object[], requireSources?: boolean }} [context]
 *   `others` are puzzles to check for collisions; `requireSources` warns on any
 *   root whose etymology is not cited (generated puzzles must cite, the
 *   hand-authored seed set does not).
 * @returns {{level:'error'|'warn', message:string}[]}
 */
export function lintPuzzle(puzzle, context = {}) {
  const out = [];
  const err = (message) => out.push({ level: 'error', message });
  const warn = (message) => out.push({ level: 'warn', message });

  for (const field of ['id', 'clue', 'answer']) {
    if (isBlank(puzzle?.[field])) err(`missing ${field}`);
  }
  if (isBlank(puzzle?.source?.language)) err('missing source language');
  if (isBlank(puzzle?.target?.language)) err('missing target language');

  const roots = Array.isArray(puzzle?.roots) ? puzzle.roots : [];
  if (roots.length !== 2) {
    err(`expected exactly 2 roots, found ${roots.length}`);
  } else {
    roots.forEach((r, i) => {
      const which = i === 0 ? 'first' : 'second';
      if (isBlank(r.target)) err(`${which} root: missing target form`);
      if (isBlank(r.source)) err(`${which} root: missing source form`);
      if (isBlank(r.meaning)) err(`${which} root: missing meaning`);
      const clueKin = cognatesOf(r, 'target');
      if (clueKin.length === 0) err(`${which} root: no English relatives for the clue's root`);
      else if (clueKin.length < 2) warn(`${which} root: only one English relative for the clue's root — thin hint`);

      // relatives of the original root are the last-resort hint; classical roots
      // almost always have some, so an empty list there is usually an oversight
      const answerKin = cognatesOf(r, 'source');
      const classical = ['greek', 'latin'].includes(norm(puzzle.source?.language));
      if (answerKin.length === 0 && classical) {
        warn(`${which} root: no English relatives for the original root — ${puzzle.source.language} roots usually leave some`);
      }

      for (const c of [...clueKin, ...answerKin]) {
        if (norm(c) === norm(puzzle.answer)) err(`${which} root: relative "${c}" is the answer itself`);
      }
      if (context.requireSources) {
        const cited = Array.isArray(r.sources) ? r.sources.filter((s) => !isBlank(s)) : [];
        if (!cited.length) warn(`${which} root: etymology not cited`);
      }
    });

    if (!splitOf(puzzle)) {
      err(`roots do not spell the clue: "${roots.map((r) => bareRoot(r.target)).join('" + "')}" ≠ "${puzzle.clue}"`);
    }
  }

  if (puzzle?.clue && puzzle?.answer) {
    if (norm(puzzle.clue) === norm(puzzle.answer)) err('clue and answer are the same word');
    const len = String(puzzle.clue).replace(/[^A-Za-z]/g, '').length;
    if (len > 12) warn(`clue is ${len} letters — long enough to read as a phrase`);
    if (len < 6) warn(`clue is only ${len} letters — may be too thin to split`);
  }

  const accept = Array.isArray(puzzle?.acceptable) ? puzzle.acceptable : [];
  if (accept.length && !accept.some((a) => norm(a) === norm(puzzle.answer))) {
    err('the answer is not in its own accepted list');
  }

  if (puzzle?.source?.language && puzzle?.target?.language
      && norm(puzzle.source.language) === norm(puzzle.target.language)) {
    err('source and target languages are the same');
  }

  if (isBlank(puzzle?.note)) warn('no note — nothing to show the player after they solve it');

  for (const other of context.others || []) {
    if (other === puzzle) continue;
    if (norm(other.answer) === norm(puzzle.answer)) err(`answer duplicates puzzle "${other.id}"`);
    if (other.id === puzzle.id) err(`id duplicates another puzzle ("${other.id}")`);
    if (puzzle.date && other.date === puzzle.date) err(`date collides with "${other.id}"`);
  }

  // author-supplied warnings from the generator
  for (const flag of puzzle?.flags || []) warn(flag);

  return out;
}

export function lintPool(puzzles) {
  return puzzles.map((p) => ({ id: p.id, issues: lintPuzzle(p, { others: puzzles }) }));
}
