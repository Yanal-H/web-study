// Load the authored chapters for tests.
//
// The app no longer bundles chapters — they arrive from the content store for a
// signed-in student. Tests still need real material to assert against (the search
// index, the MCQ pools, deck paths), so this helper reads the same JSON files from
// disk and seeds the in-memory list directly.
//
// Keeping this in the test layer rather than in src/content is deliberate: it is
// the one place that should still reach for the files, and having it here makes it
// obvious that shipping them to the browser is no longer how the app works.

import { ChapterSchema, type Chapter } from '../content/schema';
import { setLoadedChapters } from '../content/loader';

const modules = import.meta.glob('/content/**/*.json', { eager: true, import: 'default' });

let cache: Chapter[] | null = null;

/** Every valid chapter under /content. */
export function testChapters(): Chapter[] {
  if (cache) return cache;
  const out: Chapter[] = [];
  for (const path in modules) {
    if (path.includes('/_schema/')) continue;
    const parsed = ChapterSchema.safeParse(modules[path]);
    if (parsed.success) out.push(parsed.data);
    else throw new Error(`Test content failed schema at ${path}: ${parsed.error.issues[0]?.message}`);
  }
  cache = out;
  return out;
}

/** Seed the loader so listChapters() returns the authored content. */
export function loadTestContent(): Chapter[] {
  const chapters = testChapters();
  setLoadedChapters(chapters);
  return chapters;
}
