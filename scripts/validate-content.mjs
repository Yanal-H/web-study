#!/usr/bin/env node
/*
 * Content validation entry point.
 *
 * Phase 0: no JSON content has been migrated yet (that lands in a later phase), so
 * this validates JSON integrity of anything already under content/ and exits clean
 * when there is nothing to check. The Zod schema pipeline is wired in a later phase.
 */
import { readdirSync, statSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', 'content');

/** @param {string} dir */
function walk(dir) {
  /** @type {string[]} */
  const out = [];
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return out;
  }
  for (const name of entries) {
    if (name.startsWith('.') || name === '_schema') continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else if (name.endsWith('.json')) out.push(full);
  }
  return out;
}

const files = walk(root);
let bad = 0;
for (const file of files) {
  try {
    JSON.parse(readFileSync(file, 'utf8'));
  } catch (err) {
    bad++;
    console.error(`Invalid JSON: ${file}\n  ${err instanceof Error ? err.message : err}`);
  }
}

if (bad > 0) {
  console.error(`\ncontent validation failed: ${bad} invalid file(s).`);
  process.exit(1);
}
console.log(
  files.length > 0
    ? `content validation passed: ${files.length} JSON file(s) parsed.`
    : 'content validation passed: no JSON content yet (Phase 0).'
);
