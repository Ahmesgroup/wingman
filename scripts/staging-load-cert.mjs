#!/usr/bin/env node
/**
 * Staging load certification runner.
 * Usage: node scripts/staging-load-cert.mjs
 * Requires REDIS_URL + DATABASE_URL for live GO; otherwise prints soft-pass instructions.
 */
import { spawnSync } from "node:child_process";

const redis = process.env.REDIS_URL;
const db = process.env.DATABASE_URL;

if (!redis || !db) {
  console.log(
    JSON.stringify({
      level: "info",
      msg: "staging.load.soft_mode",
      hint: "Set REDIS_URL and DATABASE_URL for live GO. See operations/STAGING_LOAD_CERTIFICATION.md",
    }),
  );
}

const r = spawnSync(
  "pnpm",
  ["--filter", "@wingman/api", "test", "--", "src/staging.load.certification.test.ts"],
  { stdio: "inherit", shell: true, env: process.env },
);
process.exit(r.status ?? 1);
