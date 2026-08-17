// Upload every chapter under /content to the Supabase content store.
//
// Use this once, when you first set the project up, so the chapters that used to
// ship inside the app are available to signed-in students. After that you can
// publish from inside the app (Settings -> Admin), or run this again after
// editing the JSON files — it overwrites by chapter id and never duplicates.
//
// Usage:
//   SUPABASE_URL=https://xxxx.supabase.co \
//   SUPABASE_SERVICE_KEY=eyJ... \
//   npx vite-node scripts/upload-content.ts
//
// The SERVICE key (Project Settings -> API -> service_role) is used rather than
// the anon key because it bypasses row-level security — this runs on your machine,
// not in a browser. Never put the service key in the app, in Vercel, or in git.

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { ChapterSchema, formatZodError, type Chapter } from '../src/content/schema';

const URL_ = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_KEY;

if (!URL_ || !KEY) {
  console.error('Set SUPABASE_URL and SUPABASE_SERVICE_KEY, then run again.');
  console.error('  Project Settings -> API -> Project URL and service_role key.');
  process.exit(1);
}

const ROOT = join(process.cwd(), 'content');

function jsonFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    if (entry.startsWith('_')) continue; // _schema and friends
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...jsonFiles(full));
    else if (entry.endsWith('.json')) out.push(full);
  }
  return out;
}

/** Must match revisionOf() in src/lib/publish.ts, or clients re-download endlessly. */
function revisionOf(pack: Chapter): string {
  const s = JSON.stringify(pack);
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(36);
}

async function main() {
  const files = jsonFiles(ROOT);
  if (files.length === 0) {
    console.error(`No chapter JSON found under ${ROOT}`);
    process.exit(1);
  }
  console.log(`Found ${files.length} chapter file(s).`);

  const rows: Array<Record<string, unknown>> = [];
  let invalid = 0;

  for (const file of files) {
    const rel = relative(process.cwd(), file);
    let parsed: unknown;
    try {
      parsed = JSON.parse(readFileSync(file, 'utf8'));
    } catch (e) {
      console.error(`  INVALID JSON  ${rel}: ${(e as Error).message}`);
      invalid++;
      continue;
    }
    const check = ChapterSchema.safeParse(parsed);
    if (!check.success) {
      console.error(`  FAILED SCHEMA ${rel}`);
      for (const line of formatZodError(check.error).slice(0, 5)) console.error(`      ${line}`);
      invalid++;
      continue;
    }
    const pack = check.data;
    rows.push({
      id: pack.id,
      revision: revisionOf(pack),
      subject: pack.subject,
      title: pack.title,
      pack,
    });
    console.log(`  ok  ${pack.id}  (${pack.cards.length} cards, ${pack.mcqs.length} questions)`);
  }

  // All-or-nothing: uploading a partial set would leave students with a library
  // that silently misses chapters, which is worse than uploading nothing.
  if (invalid > 0) {
    console.error(`\n${invalid} file(s) failed validation. Nothing was uploaded — fix them first.`);
    process.exit(1);
  }

  const res = await fetch(`${URL_}/rest/v1/chapters?on_conflict=id`, {
    method: 'POST',
    headers: {
      apikey: KEY!,
      authorization: `Bearer ${KEY}`,
      'content-type': 'application/json',
      prefer: 'resolution=merge-duplicates',
    },
    body: JSON.stringify(rows),
  });

  if (!res.ok) {
    const body = await res.text();
    console.error(`\nUpload failed (${res.status}): ${body}`);
    if (/relation .*chapters.* does not exist/i.test(body)) {
      console.error('Run supabase/setup.sql in the Supabase SQL editor first.');
    }
    process.exit(1);
  }

  console.log(`\nUploaded ${rows.length} chapter(s). Students receive them on their next load.`);
}

void main();
