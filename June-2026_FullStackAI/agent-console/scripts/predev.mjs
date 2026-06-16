#!/usr/bin/env node
/**
 * Dev server must not reuse a production .next/ tree (or vice versa).
 * Mixed artifacts cause MODULE_NOT_FOUND for webpack chunks on hard refresh.
 */
import { existsSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";

const NEXT_DIR = ".next";
const PAGE_JS = join(NEXT_DIR, "server", "app", "page.js");

if (!existsSync(NEXT_DIR)) {
  process.exit(0);
}

let shouldClean = existsSync(join(NEXT_DIR, "BUILD_ID"));

if (!shouldClean && existsSync(PAGE_JS)) {
  try {
    const head = readFileSync(PAGE_JS, "utf8").slice(0, 800);
    // Production app pages reference app-page.runtime.prod.js
    if (head.includes("app-page.runtime.prod")) {
      shouldClean = true;
    }
  } catch {
    shouldClean = true;
  }
}

if (shouldClean) {
  rmSync(NEXT_DIR, { recursive: true, force: true });
  console.log(
    "[predev] Cleared stale .next (production build detected — dev needs a fresh cache)",
  );
}
