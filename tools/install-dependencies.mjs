#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { hasDependencies, listPackages, repoRoot } from './lib/repo.mjs';

const packages = listPackages(repoRoot(import.meta.dirname)).filter(({ pkg }) => hasDependencies(pkg));
for (const { dir, rel } of packages) {
  console.log(`
=== ${rel} → pnpm install --frozen-lockfile`);
  const result = spawnSync('pnpm', ['install', '--frozen-lockfile'], { cwd: dir, stdio: 'inherit' });
  if (result.status !== 0) {
    console.error(`install-dependencies: ${rel}：${result.error?.message ?? result.signal ?? result.status}`);
    process.exit(result.status === null ? 2 : 1);
  }
}
