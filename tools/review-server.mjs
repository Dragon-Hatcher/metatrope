#!/usr/bin/env node
/* Local review server. Serves the repo statically (so the game and the review
   UI both run for real) and exposes a tiny read/write API over puzzles/*.json.
   Localhost only — this is an authoring tool, never deployed. */

import { createServer } from 'node:http';
import { readFile, writeFile, rename } from 'node:fs/promises';
import { join, extname, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const PORT = Number(process.env.PORT || 4173);
const POOLS = ['candidates', 'published', 'rejected'];

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
};

const poolPath = (name) => join(ROOT, 'puzzles', `${name}.json`);

async function readPool(name) {
  try {
    const raw = await readFile(poolPath(name), 'utf8');
    const data = JSON.parse(raw);
    return Array.isArray(data.puzzles) ? data.puzzles : [];
  } catch (err) {
    if (err.code === 'ENOENT') return [];
    throw err;
  }
}

async function writePool(name, puzzles) {
  const body = `${JSON.stringify({ schema: 1, puzzles }, null, 2)}\n`;
  const tmp = `${poolPath(name)}.tmp`;
  await writeFile(tmp, body, 'utf8');
  await rename(tmp, poolPath(name));
}

const json = (res, code, body) => {
  const text = JSON.stringify(body);
  res.writeHead(code, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(text),
    'cache-control': 'no-store',
  });
  res.end(text);
};

function readBody(req, limit = 4 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > limit) { reject(new Error('body too large')); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

async function serveStatic(res, urlPath) {
  let rel = decodeURIComponent(urlPath.split('?')[0]);
  if (rel.endsWith('/')) rel += 'index.html';
  const abs = join(ROOT, normalize(rel));
  if (!abs.startsWith(ROOT + sep) && abs !== ROOT) {
    res.writeHead(403).end('forbidden');
    return;
  }
  try {
    const buf = await readFile(abs);
    res.writeHead(200, {
      'content-type': TYPES[extname(abs)] || 'application/octet-stream',
      'cache-control': 'no-store',
    });
    res.end(buf);
  } catch {
    res.writeHead(404, { 'content-type': 'text/plain' }).end('not found');
  }
}

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost');

    if (url.pathname === '/api/pools' && req.method === 'GET') {
      const entries = await Promise.all(POOLS.map(async (n) => [n, await readPool(n)]));
      json(res, 200, Object.fromEntries(entries));
      return;
    }

    if (url.pathname === '/api/pools' && req.method === 'POST') {
      const payload = JSON.parse(await readBody(req));
      for (const name of POOLS) {
        if (!Array.isArray(payload[name])) {
          json(res, 400, { error: `missing or malformed pool: ${name}` });
          return;
        }
      }
      for (const name of POOLS) await writePool(name, payload[name]);
      json(res, 200, { ok: true, saved: POOLS.map((n) => `puzzles/${n}.json`) });
      return;
    }

    // the review UI lives in /review/ so its relative asset paths resolve
    if (url.pathname === '/') { res.writeHead(302, { location: '/review/' }).end(); return; }
    if (url.pathname === '/play') { await serveStatic(res, '/index.html'); return; }

    await serveStatic(res, url.pathname);
  } catch (err) {
    json(res, 500, { error: String(err && err.message || err) });
  }
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`\n  metatrope review  →  http://127.0.0.1:${PORT}/review/`);
  console.log(`  the game itself   →  http://127.0.0.1:${PORT}/play\n`);
});
