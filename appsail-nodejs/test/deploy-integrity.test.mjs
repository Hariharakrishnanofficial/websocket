/**
 * Deploy-integrity test
 * ---------------------
 * Catches the class of failures that broke the Slate deploy on
 * commit 4291609 ("Missing script: build") and a28d6e9 ("404 @ws/...").
 *
 * The Catalyst Slate deployer:
 *   1. Clones the repo and `cd`s into the *repo root* (NOT react-vite/)
 *   2. Runs `npm install`  ← must succeed without hitting the public
 *      registry for any @ws/* workspace package
 *   3. Runs `npm run build` ← the root package.json MUST expose a
 *      `build` script (not `build:web`)
 *   4. Uploads <slate.source>/dist/ as the static artifact
 *
 * These tests are pure file-system assertions — no network, no spawn,
 * <50 ms runtime — so they run in the standard `node --test test/` flow
 * alongside the relay protocol tests.
 *
 * Run:  node --test test/deploy-integrity.test.mjs
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { execSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..');

const readJson = (rel) =>
  JSON.parse(readFileSync(path.join(REPO_ROOT, rel), 'utf8'));

// ---------------------------------------------------------------------------
// 1.  Slate deployer expectations against root package.json
// ---------------------------------------------------------------------------
test('root package.json exposes `build` script for Slate deployer', () => {
  const pkg = readJson('package.json');
  assert.ok(
    pkg.scripts && typeof pkg.scripts.build === 'string',
    'root package.json must define scripts.build — Slate deployer runs ' +
      '`npm run build` from the repo root. Without it the deploy fails ' +
      'with `npm ERR! Missing script: "build"`.',
  );
  // The build script must ultimately invoke the react-vite workspace build
  assert.match(
    pkg.scripts.build,
    /react-vite/,
    'root scripts.build must delegate to the react-vite workspace ' +
      '(e.g. `npm --workspace react-vite run build`)',
  );
});

test('root package.json declares the workspaces Slate relies on', () => {
  const pkg = readJson('package.json');
  assert.ok(Array.isArray(pkg.workspaces), 'workspaces field missing');
  assert.ok(
    pkg.workspaces.includes('react-vite'),
    'react-vite must be a workspace so `npm install` resolves its deps',
  );
});

// ---------------------------------------------------------------------------
// 2.  catalyst.json points at react-vite for Slate
// ---------------------------------------------------------------------------
test('catalyst.json declares react-vite as the Slate source', () => {
  const cfg = readJson('catalyst.json');
  assert.ok(Array.isArray(cfg.slate) && cfg.slate.length > 0,
    'catalyst.json must have a non-empty slate[] array');
  const target = cfg.slate[0];
  assert.match(target.source, /react-vite/,
    `Slate target source must point at react-vite (got "${target.source}")`);
  // Source MUST be a relative path. An absolute path like
  // /home/workspace/Websocket/react-vite will not resolve on the Slate
  // deployer's filesystem (it lives at /catalyst/websocket/), causing the
  // deployer to fall back to the repo root and fail to locate `dist/`.
  assert.ok(
    !path.isAbsolute(target.source),
    `slate[0].source must be a relative path (got absolute "${target.source}"). ` +
    `Absolute paths break the Slate deploy because the deployer cannot ` +
    `resolve host-machine paths in its container.`,
  );
});

// ---------------------------------------------------------------------------
// 3.  react-vite/package.json has the vite build script
// ---------------------------------------------------------------------------
test('react-vite/package.json defines `build` -> vite build', () => {
  const pkg = readJson('react-vite/package.json');
  assert.equal(pkg.scripts?.build, 'vite build',
    'react-vite/package.json scripts.build must be "vite build"');
});

// ---------------------------------------------------------------------------
// 4.  react-vite must NOT depend on any @ws/* workspace package — Slate
//     deploys without the monorepo's packages/ directory.
// ---------------------------------------------------------------------------
test('react-vite has no @ws/* workspace dependencies (Slate self-contained)', () => {
  const pkg = readJson('react-vite/package.json');
  const allDeps = {
    ...(pkg.dependencies || {}),
    ...(pkg.devDependencies || {}),
    ...(pkg.peerDependencies || {}),
    ...(pkg.optionalDependencies || {}),
  };
  const leakedWorkspaceDeps = Object.keys(allDeps).filter((n) => n.startsWith('@ws/'));
  assert.deepEqual(
    leakedWorkspaceDeps, [],
    `react-vite must not depend on @ws/* workspace packages — found: ` +
      `${leakedWorkspaceDeps.join(', ')}. ` +
      `The Slate deployer cannot resolve workspace symlinks; vendor the ` +
      `code under react-vite/src/shared/ instead.`,
  );
});

test('react-vite source files do not import from @ws/* packages', () => {
  // Ad-hoc grep — keeps this test self-contained, no extra deps.
  let hits = '';
  try {
    hits = execSync(
      `grep -rEn --include='*.js' --include='*.jsx' --include='*.ts' --include='*.tsx' "from ['\\"]@ws/" "${path.join(REPO_ROOT, 'react-vite', 'src')}" || true`,
      { encoding: 'utf8' },
    ).trim();
  } catch {
    /* grep returns 1 on no-match; we treat that as success */
  }
  assert.equal(hits, '',
    `Found imports from @ws/* inside react-vite/src — these will break the ` +
    `Slate deploy. Offenders:\n${hits}`);
});

// ---------------------------------------------------------------------------
// 5.  The vendored shared-protocol files exist and export expected symbols
// ---------------------------------------------------------------------------
test('vendored shared-protocol exists at react-vite/src/shared/protocol/', () => {
  const protoDir = path.join(REPO_ROOT, 'react-vite', 'src', 'shared', 'protocol');
  for (const f of ['index.js', 'roles.js', 'messages.js', 'limits.js']) {
    assert.ok(existsSync(path.join(protoDir, f)),
      `Missing vendored protocol file: shared/protocol/${f}`);
  }
});

// ---------------------------------------------------------------------------
// 6.  catalyst Slate dev_command is set (used by `catalyst serve`)
// ---------------------------------------------------------------------------
test('react-vite/cli-config.json has a slate.dev_command', () => {
  const cfg = readJson('react-vite/cli-config.json');
  assert.ok(cfg.slate?.dev_command,
    'react-vite/cli-config.json must define slate.dev_command for `catalyst serve`');
  assert.match(cfg.slate.dev_command, /\$ZC_SLATE_PORT/,
    'dev_command must use $ZC_SLATE_PORT so Catalyst can bind the correct port');
});
