import { lintPuzzle, splitOf, cognatesOf } from '../tools/lint.mjs';

/* ── state ───────────────────────────────────────────── */
let state = { candidates: [], published: [], rejected: [] };
let dirty = false;
const editing = new Set();

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/* ── dates ───────────────────────────────────────────── */
const pad = (n) => String(n).padStart(2, '0');
const key = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const today = () => key(new Date());
const parseDay = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
const addDays = (s, n) => { const d = parseDay(s); d.setDate(d.getDate() + n); return key(d); };
const daysBetween = (a, b) => Math.round((parseDay(b) - parseDay(a)) / 86400000);
const shortDate = (s) => (s
  ? parseDay(s).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })
  : '—');

/**
 * Dates follow position, not the other way round: the queue runs one puzzle a
 * day with no gaps, so reordering the list is the only scheduling gesture.
 * Anything already published keeps its date and its place.
 * @returns {boolean} whether anything actually moved
 */
function reflowDates() {
  const t = today();
  const past = state.published
    .filter((p) => p.date && p.date < t)
    .sort((a, b) => a.date.localeCompare(b.date));
  const queue = state.published.filter((p) => !(p.date && p.date < t));

  let day = t;
  if (past.length) {
    const afterLast = addDays(past[past.length - 1].date, 1);
    if (afterLast > day) day = afterLast;
  }

  let changed = false;
  for (const puzzle of queue) {
    if (puzzle.date !== day) { puzzle.date = day; changed = true; }
    day = addDays(day, 1);
  }

  const ordered = [...past, ...queue];
  if (ordered.some((p, i) => p !== state.published[i])) changed = true;
  state.published = ordered;
  return changed;
}

/* ── plumbing ────────────────────────────────────────── */
const allPuzzles = () => [...state.candidates, ...state.published, ...state.rejected];

function markDirty() {
  dirty = true;
  const btn = $('btn-save');
  btn.disabled = false;
  btn.textContent = 'Save changes';
  btn.classList.add('dirty');
}

function toast(message, bad = false) {
  const el = $('toast');
  el.textContent = message;
  el.classList.toggle('bad', bad);
  el.hidden = false;
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => { el.hidden = true; }, 2600);
}

async function load() {
  const res = await fetch('/api/pools');
  if (!res.ok) throw new Error(`GET /api/pools → ${res.status}`);
  state = await res.json();
  state.published.sort((a, b) => String(a.date).localeCompare(String(b.date)));
  $('loading').hidden = true;
  render();
}

async function save() {
  const res = await fetch('/api/pools', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(state),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) { toast(body.error || 'Save failed', true); return; }
  dirty = false;
  const btn = $('btn-save');
  btn.disabled = true;
  btn.textContent = 'Saved';
  btn.classList.remove('dirty');
  toast('Written to puzzles/*.json');
}

function move(puzzle, from, to, mutate) {
  state[from] = state[from].filter((p) => p !== puzzle);
  if (mutate) mutate(puzzle);
  state[to] = [...state[to], puzzle];
  markDirty();
  render();
}

function previewUrl(puzzle) {
  const bytes = new TextEncoder().encode(JSON.stringify(puzzle));
  const bin = Array.from(bytes, (b) => String.fromCharCode(b)).join('');
  const b64 = btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  return `/play?preview=${b64}`;
}

/* ── rendering ───────────────────────────────────────── */
function issuesHTML(puzzle) {
  const issues = lintPuzzle(puzzle, { others: allPuzzles(), requireSources: true });
  if (!issues.length) return '';
  return `<ul class="issues">${issues.map((i) => `
    <li class="${i.level}"><span>${i.level === 'error' ? '✕' : '!'}</span>
    <span>${esc(i.message)}</span></li>`).join('')}</ul>`;
}

const hasError = (puzzle) => lintPuzzle(puzzle, { others: allPuzzles(), requireSources: true })
  .some((i) => i.level === 'error');

function rootLine(root) {
  const clueKin = cognatesOf(root, 'target').join(', ');
  const answerKin = cognatesOf(root, 'source').join(', ');
  return `<div class="root">
    <span class="t">${esc(root.target)}</span>
    <span class="s">${esc(root.source)}</span>
    <span class="m">${esc(root.meaning)}</span>
    <span class="c"><i>clue</i>${esc(clueKin) || '—'}</span>
    <span class="c${answerKin ? '' : ' none'}"><i>answer</i>${esc(answerKin) || 'no English trace'}</span>
  </div>`;
}

function cardHTML(puzzle) {
  const split = splitOf(puzzle);
  const clue = split
    ? `${esc(split[0])}<span class="card-arrow">·</span>${esc(split[1])}`
    : esc(puzzle.clue);
  return `
    <div class="card-top">
      <span class="card-clue">${clue}</span>
      <span class="card-arrow">→</span>
      <span class="card-answer">${esc(puzzle.answer)}</span>
      <span class="card-langs">${esc(puzzle.source?.language)} → ${esc(puzzle.target?.language)}</span>
    </div>
    <div class="roots">${(puzzle.roots || []).map(rootLine).join('')}</div>
    ${puzzle.note ? `<p class="card-note">${esc(puzzle.note)}</p>` : ''}
    <div class="issues-slot">${issuesHTML(puzzle)}</div>
    <div class="card-actions">
      <a class="mini" href="${previewUrl(puzzle)}" target="_blank" rel="noopener">Play it</a>
      <button class="mini" data-act="edit">${editing.has(puzzle.id) ? 'Done' : 'Edit'}</button>
      <span class="spacer"></span>
      <button class="mini no" data-act="reject">Reject</button>
      <button class="mini go" data-act="publish">Publish →</button>
    </div>
    ${editing.has(puzzle.id) ? editHTML(puzzle) : ''}`;
}

const textField = (label, path, value, type = 'input') => `
  <div class="field">
    <label>${label}</label>
    ${type === 'textarea'
      ? `<textarea data-path="${path}">${esc(value)}</textarea>`
      : `<input data-path="${path}" value="${esc(value)}">`}
  </div>`;

function editHTML(puzzle) {
  const roots = puzzle.roots || [];
  return `<div class="edit">
    ${textField('Clue', 'clue', puzzle.clue)}
    ${textField('Answer', 'answer', puzzle.answer)}
    ${textField('Also accept', 'acceptable', (puzzle.acceptable || []).join(', '))}
    ${textField('From', 'source.language', puzzle.source?.language)}
    ${textField('Into', 'target.language', puzzle.target?.language)}
    ${textField('Difficulty', 'difficulty', puzzle.difficulty ?? '')}
    ${textField('Id', 'id', puzzle.id)}
    ${roots.map((r, i) => `
      <fieldset>
        <legend>${i === 0 ? 'First' : 'Second'} root</legend>
        ${textField('In the clue', `roots.${i}.target`, r.target)}
        ${textField('Original', `roots.${i}.source`, r.source)}
        ${textField('Means', `roots.${i}.meaning`, r.meaning)}
        ${textField('Clue kin', `roots.${i}.targetCognates`, cognatesOf(r, 'target').join(', '))}
        ${textField('Answer kin', `roots.${i}.sourceCognates`, cognatesOf(r, 'source').join(', '))}
      </fieldset>`).join('')}
    ${textField('Note', 'note', puzzle.note, 'textarea')}
  </div>`;
}

const LIST_PATHS = new Set(['acceptable', 'targetCognates', 'sourceCognates', 'cognates']);

function setPath(puzzle, path, raw) {
  const parts = path.split('.');
  const last = parts.pop();
  let target = puzzle;
  for (const part of parts) {
    if (target[part] === undefined) target[part] = {};
    target = target[part];
  }
  if (LIST_PATHS.has(last)) {
    target[last] = raw.split(',').map((s) => s.trim()).filter(Boolean);
  } else if (last === 'difficulty') {
    target[last] = raw.trim() === '' ? undefined : Number(raw);
  } else {
    target[last] = raw;
  }
}

function renderCandidates() {
  const host = $('candidates');
  host.innerHTML = '';
  $('empty-candidates').hidden = state.candidates.length > 0;

  for (const puzzle of state.candidates) {
    const card = document.createElement('article');
    card.className = `card${hasError(puzzle) ? ' has-error' : ''}`;
    card.innerHTML = cardHTML(puzzle);

    card.addEventListener('click', (e) => {
      const act = e.target.dataset?.act;
      if (!act) return;
      if (act === 'edit') {
        editing.has(puzzle.id) ? editing.delete(puzzle.id) : editing.add(puzzle.id);
        render();
      } else if (act === 'reject') {
        editing.delete(puzzle.id);
        move(puzzle, 'candidates', 'rejected', (p) => { delete p.date; });
      } else if (act === 'publish') {
        if (hasError(puzzle) && !confirm('This puzzle has errors. Publish anyway?')) return;
        editing.delete(puzzle.id);
        // lands at the end of the queue; reflowDates gives it the next free day
        move(puzzle, 'candidates', 'published', (p) => { delete p.date; delete p.flags; });
      }
    });

    card.addEventListener('input', (e) => {
      const path = e.target.dataset?.path;
      if (!path) return;
      setPath(puzzle, path, e.target.value);
      markDirty();
      card.querySelector('.issues-slot').innerHTML = issuesHTML(puzzle);
      card.classList.toggle('has-error', hasError(puzzle));
      if (path === 'clue' || path === 'answer') {
        card.querySelector('.card-clue').textContent = puzzle.clue;
        card.querySelector('.card-answer').textContent = puzzle.answer;
      }
    });

    host.append(card);
  }
  $('count-candidates').textContent = `${state.candidates.length} waiting`;
}

function scheduleRow(puzzle, index) {
  const row = document.createElement('div');
  const day = puzzle.date || '';
  const past = Boolean(day && day < today());
  row.className = 'row'
    + (hasError(puzzle) ? ' has-error' : '')
    + (past ? ' past' : '')
    + (day === today() ? ' today' : '');
  row.dataset.id = puzzle.id;
  row.draggable = !past;
  row.innerHTML = `
    <span class="grip" title="${past ? 'already published' : 'drag to reorder'}">${past ? '·' : '⠿'}</span>
    <span class="row-date"><b>#${index + 1}</b>${shortDate(day)}</span>
    <div class="row-word">
      <b>${esc(puzzle.clue)}</b> <span>→ ${esc(puzzle.answer)}</span>
    </div>
    <div class="row-actions">
      <a class="mini" href="${previewUrl(puzzle)}" target="_blank" rel="noopener">Play</a>
      <button class="mini" data-act="back">Unpublish</button>
    </div>`;

  row.querySelector('[data-act="back"]').addEventListener('click', () => {
    move(puzzle, 'published', 'candidates', (p) => { delete p.date; });
  });
  return row;
}

function renderSchedule() {
  if (reflowDates()) markDirty();

  const host = $('schedule');
  host.innerHTML = '';
  state.published.forEach((puzzle, i) => host.append(scheduleRow(puzzle, i)));

  const upcoming = state.published.filter((p) => p.date && p.date >= today());
  $('count-published').textContent = upcoming.length
    ? `${upcoming.length} still to come · drag to reorder`
    : 'nothing scheduled';
}

/* ── dragging the queue ──────────────────────────────── */
let dragId = null;

const clearDropMarks = (host) => host
  .querySelectorAll('.drop-above, .drop-below')
  .forEach((el) => el.classList.remove('drop-above', 'drop-below'));

function reorder(id, targetId, after) {
  if (!id || id === targetId) return;
  const queue = state.published;
  const from = queue.findIndex((p) => p.id === id);
  const [moved] = queue.splice(from, 1);
  const target = queue.findIndex((p) => p.id === targetId);
  if (target < 0) { queue.splice(from, 0, moved); return; }
  queue.splice(target + (after ? 1 : 0), 0, moved);
  markDirty();
  render();
}

function wireDragAndDrop(host) {
  host.addEventListener('dragstart', (e) => {
    const row = e.target.closest?.('.row[draggable="true"]');
    if (!row) return;
    dragId = row.dataset.id;
    row.classList.add('dragging');
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', dragId);
  });

  host.addEventListener('dragover', (e) => {
    if (!dragId) return;
    clearDropMarks(host);
    const row = e.target.closest?.('.row[draggable="true"]');
    if (!row || row.dataset.id === dragId) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    const box = row.getBoundingClientRect();
    row.classList.add(e.clientY - box.top > box.height / 2 ? 'drop-below' : 'drop-above');
  });

  host.addEventListener('drop', (e) => {
    const row = e.target.closest?.('.row');
    if (!dragId || !row) return;
    e.preventDefault();
    reorder(dragId, row.dataset.id, row.classList.contains('drop-below'));
  });

  host.addEventListener('dragend', () => {
    dragId = null;
    host.querySelectorAll('.dragging').forEach((el) => el.classList.remove('dragging'));
    clearDropMarks(host);
  });
}

function renderRejected() {
  const host = $('rejected');
  host.innerHTML = '';
  for (const puzzle of state.rejected) {
    const row = document.createElement('div');
    row.className = 'row simple';
    row.innerHTML = `
      <div class="row-word"><b>${esc(puzzle.clue)}</b> <span>→ ${esc(puzzle.answer)}</span></div>
      <div class="row-actions"><button class="mini" data-act="restore">Restore</button></div>`;
    row.querySelector('[data-act="restore"]').addEventListener('click', () => {
      move(puzzle, 'rejected', 'candidates');
    });
    host.append(row);
  }
  $('count-rejected').textContent = `${state.rejected.length} set aside`;
}

function renderBar() {
  const upcoming = state.published.filter((p) => p.date && p.date >= today());
  const last = upcoming.map((p) => p.date).sort().pop();
  const runway = last ? daysBetween(today(), last) + 1 : 0;
  $('bar-stats').innerHTML = runway
    ? `<b>${runway}</b> day${runway === 1 ? '' : 's'} of runway — scheduled through ${last}. <b>${state.candidates.length}</b> candidate${state.candidates.length === 1 ? '' : 's'} waiting.`
    : `Nothing scheduled from today onward. <b>${state.candidates.length}</b> candidate${state.candidates.length === 1 ? '' : 's'} waiting.`;
}

function render() {
  renderCandidates();
  renderSchedule();
  renderRejected();
  renderBar();
}

/* ── boot ────────────────────────────────────────────── */
wireDragAndDrop($('schedule'));
$('btn-save').addEventListener('click', save);
document.addEventListener('keydown', (e) => {
  if ((e.metaKey || e.ctrlKey) && e.key === 's') { e.preventDefault(); if (dirty) save(); }
});
window.addEventListener('beforeunload', (e) => {
  if (dirty) { e.preventDefault(); e.returnValue = ''; }
});

load().catch((err) => {
  $('loading').textContent = `${err.message} — is tools/review-server.mjs running?`;
});
