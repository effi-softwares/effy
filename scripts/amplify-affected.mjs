#!/usr/bin/env node
// Which Amplify-hosted web apps does a change touch? (selective Amplify builds, 2026-11-07)
//
//   node scripts/amplify-affected.mjs <base-sha> <head-sha>     → one appRoot per line, e.g. apps/shop-web
//   node scripts/amplify-affected.mjs --all                     → every appRoot
//
// Amplify used to build all three apps on every push to the deploy branch. Branch auto-build is now off
// (infra/modules/amplify-web-app, build_trigger = "webhook") and .github/workflows/amplify-deploy.yml asks
// this script which apps to start. An app is affected when a changed file is:
//   - under its appRoot, or
//   - under a workspace package it depends on, directly or through another workspace package
//     (read from every package.json's `workspace:` dependencies, so a new shared package needs no edit here), or
//   - one of the root build inputs below (the lockfile, the workspace config, amplify.yml) - every app.
// Anything else (backend, infra, mobile, docs, specs) builds nothing.
//
// The app list is amplify.yml's `appRoot:` entries - one source, the same one Amplify reads.
// ⚠ When unsure (no base commit, unreadable history) the answer is EVERY app: a missed deploy is worse
// than a wasted build.

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname;

// Root files every app's install or build reads. A change here rebuilds all of them.
const ROOT_BUILD_INPUTS = new Set([
  'amplify.yml',
  'package.json',
  'pnpm-lock.yaml',
  'pnpm-workspace.yaml',
  '.npmrc',
  'turbo.json',
]);

function appRoots() {
  const spec = readFileSync(join(ROOT, 'amplify.yml'), 'utf8');
  const roots = [...spec.matchAll(/^\s*-\s*appRoot:\s*(\S+)\s*$/gm)].map((m) => m[1].replace(/\/$/, ''));
  if (roots.length === 0) throw new Error('amplify.yml declares no appRoot');
  return roots;
}

// name → directory, and directory → its workspace dependency names, for every workspace package.
function workspace() {
  const globs = readFileSync(join(ROOT, 'pnpm-workspace.yaml'), 'utf8')
    .split('\n')
    .map((l) => l.match(/^\s*-\s*["']?([^"'#]+?)\/\*["']?\s*$/))
    .filter(Boolean)
    .map((m) => m[1]);
  const dirByName = new Map();
  const depsByDir = new Map();
  for (const parent of globs) {
    const abs = join(ROOT, parent);
    if (!existsSync(abs)) continue;
    for (const entry of readdirSync(abs, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const dir = `${parent}/${entry.name}`;
      const pkgPath = join(ROOT, dir, 'package.json');
      if (!existsSync(pkgPath)) continue;
      const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
      if (pkg.name) dirByName.set(pkg.name, dir);
      const all = { ...pkg.dependencies, ...pkg.devDependencies, ...pkg.peerDependencies };
      depsByDir.set(
        dir,
        Object.entries(all)
          .filter(([, v]) => String(v).startsWith('workspace:'))
          .map(([n]) => n),
      );
    }
  }
  return { dirByName, depsByDir };
}

// The app's own directory plus every workspace package it reaches.
function closure(appRoot, { dirByName, depsByDir }) {
  const seen = new Set([appRoot]);
  const queue = [appRoot];
  while (queue.length) {
    for (const name of depsByDir.get(queue.shift()) ?? []) {
      const dir = dirByName.get(name);
      if (dir && !seen.has(dir)) {
        seen.add(dir);
        queue.push(dir);
      }
    }
  }
  return seen;
}

function changedFiles(base, head) {
  const out = execFileSync('git', ['diff', '--name-only', `${base}...${head}`], { cwd: ROOT, encoding: 'utf8' });
  return out.split('\n').filter(Boolean);
}

function main(argv) {
  const roots = appRoots();
  if (argv[0] === '--all') return roots;
  const [base, head] = argv;
  if (!base || !head) throw new Error('usage: amplify-affected.mjs <base-sha> <head-sha> | --all');

  let files;
  try {
    files = changedFiles(base, head);
  } catch {
    console.error(`amplify-affected: cannot diff ${base}...${head}; building every app`);
    return roots;
  }

  if (files.some((f) => ROOT_BUILD_INPUTS.has(f))) return roots;

  const ws = workspace();
  return roots.filter((root) => {
    const dirs = closure(root, ws);
    return files.some((f) => [...dirs].some((d) => f.startsWith(`${d}/`)));
  });
}

try {
  for (const root of main(process.argv.slice(2))) console.log(root);
} catch (err) {
  console.error(`amplify-affected: ${err.message}`);
  process.exit(1);
}
