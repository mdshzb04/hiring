#!/usr/bin/env node
/**
 * Remove Next.js build caches. Prevents "Cannot find module './NNN.js'" errors
 * caused by stale or mixed production/dev artifacts in .next/
 */
import { existsSync, rmSync } from "node:fs";

const TARGETS = [".next", "out", "tsconfig.tsbuildinfo"];

for (const target of TARGETS) {
  if (existsSync(target)) {
    rmSync(target, { recursive: true, force: true });
    console.log(`[clean] removed ${target}`);
  }
}
