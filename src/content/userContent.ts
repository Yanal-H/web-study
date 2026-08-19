// Legacy device-only chapter storage.
//
// Kept solely so an older browser profile can retain its data without a breaking
// migration. The content loader no longer reads this store and the student UI no
// longer exposes an import action: all visible curriculum is administrator-published
// and server-authorised. Do not add new features that depend on this module.
import { useSyncExternalStore } from 'react';
import { ChapterSchema, formatZodError, type Chapter } from './schema';

const USER_KEY = 'foundation_user_content_v1';

interface UserStore {
  version: 1;
  chapters: Chapter[];
}

function read(): UserStore {
  try {
    const raw = localStorage.getItem(USER_KEY);
    if (!raw) return { version: 1, chapters: [] };
    const parsed = JSON.parse(raw);
    if (!parsed || !Array.isArray(parsed.chapters)) return { version: 1, chapters: [] };
    return { version: 1, chapters: parsed.chapters };
  } catch {
    return { version: 1, chapters: [] };
  }
}

function write(store: UserStore) {
  try {
    localStorage.setItem(USER_KEY, JSON.stringify(store));
  } catch (e) {
    console.warn('could not persist user content', e);
  }
  emit();
}

const listeners = new Set<() => void>();
let version = 0;
function emit() {
  version++;
  listeners.forEach((l) => l());
}

export function subscribeUserContent(cb: () => void) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}
export function getUserVersion() {
  return version;
}

export function getUserChapters(): Chapter[] {
  return read().chapters;
}

export interface ImportResult {
  ok: boolean;
  chapter?: Chapter;
  errors?: string[];
}

/**
 * Validate and add a chapter from raw JSON text. All-or-nothing: on any schema
 * error nothing is stored and precise messages are returned. A matching id
 * replaces the previous personal import (never a shipped chapter).
 */
export function importChapterJson(text: string): ImportResult {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch (e) {
    return { ok: false, errors: [`Invalid JSON: ${e instanceof Error ? e.message : String(e)}`] };
  }
  const result = ChapterSchema.safeParse(json);
  if (!result.success) return { ok: false, errors: formatZodError(result.error) };

  const chapter = result.data;
  const store = read();
  const idx = store.chapters.findIndex((c) => c.id === chapter.id);
  if (idx >= 0) store.chapters[idx] = chapter;
  else store.chapters.push(chapter);
  write(store);
  return { ok: true, chapter };
}

export function removeUserChapter(id: string) {
  const store = read();
  store.chapters = store.chapters.filter((c) => c.id !== id);
  write(store);
}

/** React hook that re-renders when personal content changes. */
export function useUserContentVersion() {
  return useSyncExternalStore(subscribeUserContent, getUserVersion, getUserVersion);
}
