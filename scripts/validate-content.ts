/*
 * Build-time content validation. Runs on `prebuild` and in CI (via `vite-node`,
 * so it shares the exact Zod schema the app uses). Any chapter JSON that fails the
 * schema fails the build with precise, path-specific errors.
 */
import { readdirSync, statSync, readFileSync } from 'node:fs';
import { join, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ChapterSchema, formatZodError } from '../src/content/schema';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const contentDir = join(root, 'content');

function walk(dir: string): string[] {
  const out: string[] = [];
  let entries: string[];
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

const files = walk(contentDir);
let failed = 0;
let ok = 0;
const ids = new Map<string, string>();

for (const file of files) {
  const rel = relative(root, file);
  let json: unknown;
  try {
    json = JSON.parse(readFileSync(file, 'utf8'));
  } catch (e) {
    failed++;
    console.error(`\n✗ ${rel}\n    invalid JSON: ${e instanceof Error ? e.message : e}`);
    continue;
  }
  const result = ChapterSchema.safeParse(json);
  if (!result.success) {
    failed++;
    console.error(`\n✗ ${rel}`);
    for (const line of formatZodError(result.error)) console.error(`    ${line}`);
    continue;
  }
  const ch = result.data;
  if (ids.has(ch.id)) {
    failed++;
    console.error(`\n✗ ${rel}\n    duplicate chapter id "${ch.id}" (also in ${ids.get(ch.id)})`);
    continue;
  }
  ids.set(ch.id, rel);
  ok++;
  console.log(
    `✓ ${rel}  —  ${ch.sections.length} sections, ${ch.cards.length} cards, ${ch.mcqs.length} MCQs, ${ch.emqs.length} EMQs`
  );
}

if (failed > 0) {
  console.error(`\ncontent validation FAILED: ${failed} invalid file(s), ${ok} valid.`);
  process.exit(1);
}
console.log(
  files.length > 0
    ? `\ncontent validation passed: ${ok} chapter(s) valid.`
    : '\ncontent validation passed: no chapter JSON yet.'
);
