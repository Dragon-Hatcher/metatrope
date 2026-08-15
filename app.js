/* Metatrope — daily etymology game. No dependencies, no build step. */
(() => {
  'use strict';

  const HINT_FLOOR = 6;   // smallest a puzzle can have; the stats chart never shrinks below it
  const KEY_PROGRESS = 'metatrope.v1.progress';
  const KEY_STATS = 'metatrope.v1.stats';
  const KEY_SEEN = 'metatrope.v1.seenHelp';

  const $ = (id) => document.getElementById(id);

  /* ── storage (fails soft in private mode) ─────────────── */
  const store = {
    get(key, fallback) {
      try {
        const raw = localStorage.getItem(key);
        return raw ? JSON.parse(raw) : fallback;
      } catch { return fallback; }
    },
    set(key, value) {
      try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* ignore */ }
    },
  };

  /* ── dates ────────────────────────────────────────────── */
  const dateKey = (d = new Date()) => {
    const p = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
  };

  const prettyDate = (key) => {
    const [y, m, d] = key.split('-').map(Number);
    return new Date(y, m - 1, d).toLocaleDateString(undefined, {
      month: 'long', day: 'numeric', year: 'numeric',
    });
  };

  const yesterdayOf = (key) => {
    const [y, m, d] = key.split('-').map(Number);
    return dateKey(new Date(y, m - 1, d - 1));
  };

  /* ── text ─────────────────────────────────────────────── */
  const normalize = (s) => s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z]/g, '');

  function editDistance(a, b) {
    if (a === b) return 0;
    let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
    for (let i = 1; i <= a.length; i++) {
      const row = [i];
      for (let j = 1; j <= b.length; j++) {
        row[j] = Math.min(
          prev[j] + 1,
          row[j - 1] + 1,
          prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
        );
      }
      prev = row;
    }
    return prev[b.length];
  }

  const list = (items) => items.length < 2
    ? items.join('')
    : `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;

  /* ── state ────────────────────────────────────────────── */
  let puzzle = null;      // the active puzzle
  let number = 0;         // 1-indexed puzzle number, 0 when not in the daily series
  let preview = false;    // review-tool preview: never touches saved progress
  let progress = { guesses: [], hints: [], solved: false };
  let tickHandle = null;

  const saveProgress = () => {
    if (preview) return;
    const all = store.get(KEY_PROGRESS, {});
    all[puzzle.date || puzzle.id] = progress;
    // keep the file from growing forever
    const keys = Object.keys(all).sort();
    while (keys.length > 60) delete all[keys.shift()];
    store.set(KEY_PROGRESS, all);
  };

  /* ── puzzle loading ───────────────────────────────────── */
  function decodePreview(raw) {
    const b64 = raw.replace(/-/g, '+').replace(/_/g, '/');
    const bin = atob(b64);
    const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
    return JSON.parse(new TextDecoder().decode(bytes));
  }

  async function loadPuzzle() {
    const params = new URLSearchParams(location.search);

    if (params.has('preview')) {
      preview = true;
      return { puzzle: decodePreview(params.get('preview')), number: 0 };
    }

    const res = await fetch(`puzzles/published.json?v=${Date.now()}`, { cache: 'no-store' });
    if (!res.ok) throw new Error(`published.json: ${res.status}`);
    const data = await res.json();

    const all = (data.puzzles || [])
      .filter((p) => p.date)
      .sort((a, b) => a.date.localeCompare(b.date));
    if (!all.length) throw new Error('no puzzles published');

    const today = dateKey();

    if (params.has('p')) {
      const i = Math.min(Math.max(parseInt(params.get('p'), 10), 1), all.length) - 1;
      preview = true;
      return { puzzle: all[i], number: i + 1 };
    }
    if (params.has('d')) {
      const i = all.findIndex((p) => p.date === params.get('d'));
      if (i >= 0) { preview = true; return { puzzle: all[i], number: i + 1 }; }
    }

    // today's, else the most recent one already due
    let idx = all.findIndex((p) => p.date === today);
    if (idx < 0) {
      const due = all.filter((p) => p.date <= today);
      idx = due.length ? due.length - 1 : 0;
    }
    return { puzzle: all[idx], number: idx + 1 };
  }

  /* ── rendering ────────────────────────────────────────── */
  function splitParts() {
    const [a, b] = puzzle.roots;
    const x = (a.target || '').replace(/[-\u2013\u2014]/g, '');
    const y = (b.target || '').replace(/[-\u2013\u2014]/g, '');
    return normalize(x + y) === normalize(puzzle.clue) ? [x, y] : null;
  }

  function renderClue() {
    const parts = splitParts();
    const el = $('clue');
    if (parts) {
      el.innerHTML = '';
      el.append(parts[0]);
      const seam = document.createElement('span');
      seam.className = 'seam';
      seam.textContent = '·';
      el.append(seam, parts[1]);
    } else {
      el.textContent = puzzle.clue;
    }
    el.classList.toggle('split', progress.hints.includes('split'));
  }

  function renderDirection() {
    const known = progress.hints.includes('langs') || progress.solved;
    const src = known ? puzzle.source.language : '?';
    const tgt = known ? puzzle.target.language : '?';
    $('direction').innerHTML =
      `<span class="${known ? '' : 'lang-unknown'}">${src}</span>` +
      '<span class="arrow">→</span>' +
      `<span class="${known ? '' : 'lang-unknown'}">${tgt}</span>`;
  }

  /* Four levels of escalating generosity. The first is always open; each of the
     rest needs the rung below it *for the same root*, so the two columns line up
     and a card is unlocked by the card directly above it. Level four gives
     English words built on the root you are actually hunting, which is as close
     to the answer as a hint can get without being it. */
  const TIERS = [
    { n: 1, name: 'The coinage', note: 'open from the start' },
    { n: 2, name: 'Clue relatives', note: 'after the split' },
    { n: 3, name: 'Meanings', note: 'after the relatives above' },
    { n: 4, name: 'Answer relatives', note: 'after the meanings above' },
  ];

  const cognatesOf = (root, face) => {
    const raw = face === 'source' ? root.sourceCognates : (root.targetCognates ?? root.cognates);
    return Array.isArray(raw) ? raw.filter(Boolean) : [];
  };

  const rootLabel = (i) => (i === 0 ? 'First root' : 'Second root');

  function buildHints() {
    const hints = [
      {
        id: 'langs', tier: 1, label: 'The languages',
        value: () => `${puzzle.source.language} <span class="rootmark">→</span> ${puzzle.target.language}`,
      },
      {
        id: 'split', tier: 1, label: 'The split',
        value: () => {
          const parts = splitParts() || puzzle.roots.map((r) => r.target);
          return `<em>${parts[0]}</em> <span class="rootmark">+</span> <em>${parts[1]}</em>`;
        },
      },
    ];

    puzzle.roots.forEach((root, i) => hints.push({
      id: `cog${i}`, tier: 2, col: i + 1, label: rootLabel(i), needs: 'split',
      value: () => list(cognatesOf(root, 'target')),
    }));

    puzzle.roots.forEach((root, i) => hints.push({
      id: `mean${i}`, tier: 3, col: i + 1, label: rootLabel(i), needs: `cog${i}`,
      value: () => `<em>${root.meaning}</em>`,
    }));

    // only for roots that actually left descendants in English
    puzzle.roots.forEach((root, i) => {
      if (!cognatesOf(root, 'source').length) return;
      hints.push({
        id: `src${i}`, tier: 4, col: i + 1, label: rootLabel(i), needs: `mean${i}`,
        value: () => list(cognatesOf(root, 'source')),
      });
    });

    return hints;
  }

  let HINTS = [];

  const isOpen = (id) => progress.hints.includes(id) || progress.solved;
  const isAvailable = (hint) => !hint.needs || isOpen(hint.needs);

  function hintCard(hint) {
    const open = isOpen(hint.id);
    const available = isAvailable(hint);
    const state = open ? 'open' : available ? 'locked' : 'blocked';

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'hint';
    btn.dataset.state = state;
    btn.disabled = state !== 'locked';
    if (hint.col) btn.style.gridColumn = String(hint.col);
    btn.innerHTML =
      `<span class="hint-label">${hint.label}</span>` +
      `<span class="hint-value">${open ? hint.value() : available ? 'Reveal' : 'Locked'}</span>`;
    if (state === 'locked') btn.addEventListener('click', () => revealHint(hint.id));
    return btn;
  }

  function renderHints() {
    const host = $('hint-tiers');
    host.innerHTML = '';

    for (const tier of TIERS) {
      const hints = HINTS.filter((h) => h.tier === tier.n);
      if (!hints.length) continue;   // e.g. no root left a trace in English
      const locked = hints.some((h) => !isOpen(h.id) && !isAvailable(h));

      const section = document.createElement('section');
      section.className = 'tier';
      section.dataset.locked = String(locked);
      section.innerHTML =
        '<div class="tier-head">' +
          `<span class="tier-num">${tier.n}</span>` +
          `<span class="tier-name">${tier.name}</span>` +
          `<span class="tier-note">${tier.note}</span>` +
        '</div><div class="tier-cards"></div>';

      const cards = section.querySelector('.tier-cards');
      for (const hint of hints) cards.append(hintCard(hint));
      host.append(section);
    }

    const used = progress.hints.length;
    $('hints-count').textContent = `${used} of ${HINTS.length} used`;
  }

  function revealHint(id) {
    const hint = HINTS.find((h) => h.id === id);
    if (!hint || isOpen(id) || !isAvailable(hint)) return;
    progress.hints.push(id);
    saveProgress();
    renderHints();
    renderDirection();
    renderClue();
  }

  function renderGuesses() {
    const ul = $('guesses');
    ul.innerHTML = '';
    for (const g of progress.guesses) {
      const li = document.createElement('li');
      li.textContent = g;
      ul.append(li);
    }
  }

  /* ── guessing ─────────────────────────────────────────── */
  function accepted() {
    const words = puzzle.acceptable && puzzle.acceptable.length
      ? puzzle.acceptable
      : [puzzle.answer];
    return words.map(normalize);
  }

  function say(text, tone = '') {
    const el = $('feedback');
    el.textContent = text;
    el.className = `feedback ${tone}`;
  }

  function submitGuess(event) {
    event.preventDefault();
    const input = $('guess-input');
    const raw = input.value.trim();
    if (!raw) return;

    const guess = normalize(raw);
    if (!guess) return;

    if (accepted().includes(guess)) {
      input.value = '';
      win();
      return;
    }

    if (guess === normalize(puzzle.clue)) {
      say('That is the clue itself — you want the English word it was built from.');
      input.select();
      return;
    }

    if (progress.guesses.some((g) => normalize(g) === guess)) {
      say('You have tried that one already.');
      input.select();
      return;
    }

    progress.guesses.push(raw.toLowerCase());
    saveProgress();
    renderGuesses();

    const near = Math.min(...accepted().map((a) => editDistance(guess, a)));
    if (near <= 2) {
      say('So close — check your spelling.', 'warm');
    } else {
      const n = progress.guesses.length;
      say(n === 1 ? 'Not it. Try a hint if you are stuck.' : `Not it. (${n} guesses)`, 'cold');
    }

    $('guess-block').classList.remove('shake');
    void $('guess-block').offsetWidth;
    $('guess-block').classList.add('shake');
    input.select();
  }

  /* ── winning ──────────────────────────────────────────── */
  function win() {
    const firstTime = !progress.solved;
    progress.solved = true;
    saveProgress();
    if (firstTime && !preview) recordStats();

    say('');
    renderDirection();
    renderClue();
    renderHints();
    renderSolved();
    $('guess-form').hidden = true;
    $('solved').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  function renderSolved() {
    $('solved').hidden = false;
    $('solved-answer').textContent = puzzle.answer;

    const used = progress.hints.length;
    const g = progress.guesses.length + 1;
    $('solved-kicker').textContent =
      `${g} ${g === 1 ? 'guess' : 'guesses'} · ${used === 0 ? 'no hints' : `${used} ${used === 1 ? 'hint' : 'hints'}`}`;

    const parts = splitParts() || puzzle.roots.map((r) => r.target);
    $('breakdown').innerHTML = puzzle.roots.map((r, i) => `
      <div class="bd-row">
        <span class="from">${r.source}<span class="gloss">${puzzle.source.language}</span></span>
        <span class="mid">→ ${r.meaning} →</span>
        <span class="to">${parts[i]}<span class="gloss">${puzzle.target.language}</span></span>
      </div>`).join('');

    $('note').textContent = puzzle.note || '';
    $('note').hidden = !puzzle.note;

    startCountdown();
  }

  /* ── stats ────────────────────────────────────────────── */
  const blankStats = () => ({
    played: 0, solved: 0, streak: 0, best: 0, last: null, dist: {},
  });

  function recordStats() {
    const s = Object.assign(blankStats(), store.get(KEY_STATS, {}));
    const day = puzzle.date;
    if (!day || s.last === day) return;

    s.played += 1;
    s.solved += 1;
    s.streak = s.last === yesterdayOf(day) ? s.streak + 1 : 1;
    s.best = Math.max(s.best, s.streak);
    s.last = day;
    const used = String(progress.hints.length);
    s.dist[used] = (s.dist[used] || 0) + 1;
    store.set(KEY_STATS, s);
  }

  function renderStats() {
    const s = Object.assign(blankStats(), store.get(KEY_STATS, {}));
    $('stat-row').innerHTML = [
      ['Solved', s.solved],
      ['Streak', s.streak],
      ['Best', s.best],
    ].map(([k, v]) => `<div class="stat"><b>${v}</b><span>${k}</span></div>`).join('');

    const widest = Math.max(HINT_FLOOR, ...Object.keys(s.dist).map(Number), 0);
    const counts = Array.from({ length: widest + 1 }, (_, i) => s.dist[String(i)] || 0);
    const max = Math.max(1, ...counts);
    const mine = progress.solved ? progress.hints.length : -1;
    $('dist').innerHTML = counts.map((c, i) => `
      <div class="dist-row">
        <span>${i} hint${i === 1 ? '' : 's'}</span>
        <div class="dist-bar${i === mine ? ' hot' : ''}" style="width:${Math.max(8, (c / max) * 100)}%">${c}</div>
      </div>`).join('');
  }

  /* ── share ────────────────────────────────────────────── */
  function shareText() {
    const used = new Set(progress.hints);
    const squares = HINTS.map((h) => (used.has(h.id) ? '⬛' : '🟩')).join('');
    const g = progress.guesses.length + 1;
    const title = number ? `Metatrope #${number}` : 'Metatrope';
    const url = location.origin + location.pathname.replace(/index\.html$/, '');
    return `${title}\n${squares}\n${g} ${g === 1 ? 'guess' : 'guesses'} · ${progress.hints.length}/${HINTS.length} hints\n${url}`;
  }

  async function share() {
    const text = shareText();
    try {
      if (navigator.share && /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent)) {
        await navigator.share({ text });
        return;
      }
      await navigator.clipboard.writeText(text);
      $('share-status').textContent = 'Copied to clipboard';
      setTimeout(() => { $('share-status').textContent = ''; }, 2500);
    } catch {
      $('share-status').textContent = 'Could not copy — select and copy manually.';
    }
  }

  /* ── countdown ────────────────────────────────────────── */
  function startCountdown() {
    if (tickHandle) clearInterval(tickHandle);
    const tick = () => {
      const now = new Date();
      const next = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
      let left = Math.max(0, Math.floor((next - now) / 1000));
      const h = String(Math.floor(left / 3600)).padStart(2, '0');
      const m = String(Math.floor((left % 3600) / 60)).padStart(2, '0');
      const s = String(left % 60).padStart(2, '0');
      $('countdown').textContent = `${h}:${m}:${s}`;
      if (left === 0) { clearInterval(tickHandle); location.reload(); }
    };
    tick();
    tickHandle = setInterval(tick, 1000);
  }

  /* ── modals ───────────────────────────────────────────── */
  function openModal(id) {
    const modal = $(id);
    if (id === 'modal-stats') renderStats();
    modal.hidden = false;
    modal.querySelector('.modal-card').focus({ preventScroll: true });
  }
  const closeModals = () => document.querySelectorAll('.modal').forEach((m) => { m.hidden = true; });

  function wireModals() {
    document.querySelectorAll('.modal').forEach((modal) => {
      modal.addEventListener('click', (e) => {
        if (e.target === modal || e.target.hasAttribute('data-close')) closeModals();
      });
    });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeModals(); });
    $('btn-help').addEventListener('click', () => openModal('modal-help'));
    $('btn-help-2').addEventListener('click', () => openModal('modal-help'));
    $('btn-stats').addEventListener('click', () => openModal('modal-stats'));
  }

  /* ── boot ─────────────────────────────────────────────── */
  async function boot() {
    wireModals();

    try {
      const loaded = await loadPuzzle();
      puzzle = loaded.puzzle;
      number = loaded.number;
    } catch (err) {
      $('loading').textContent = 'Could not load today’s puzzle.';
      console.error(err);
      return;
    }

    if (!preview) {
      const saved = store.get(KEY_PROGRESS, {})[puzzle.date || puzzle.id];
      if (saved) progress = Object.assign(progress, saved);
    }

    HINTS = buildHints();

    $('loading').hidden = true;
    $('game').hidden = false;

    $('puzzle-number').textContent = number ? `No. ${number}` : 'Preview';
    $('puzzle-date').textContent = puzzle.date ? prettyDate(puzzle.date) : '—';
    $('preview-badge').hidden = !preview;

    renderDirection();
    renderClue();
    renderHints();
    renderGuesses();

    $('guess-form').addEventListener('submit', submitGuess);
    $('btn-share').addEventListener('click', share);

    if (progress.solved) {
      $('guess-form').hidden = true;
      renderSolved();
    } else {
      $('guess-input').focus({ preventScroll: true });
    }

    if (!preview && !store.get(KEY_SEEN, false)) {
      store.set(KEY_SEEN, true);
      openModal('modal-help');
    }
  }

  boot();
})();
