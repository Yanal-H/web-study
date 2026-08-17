// Pure helpers for the export/import data-safety path, kept out of the view so
// they can be unit-tested without rendering anything.

/**
 * A light structural guard for a state backup, run BEFORE anything touches the
 * live store. It rejects the common mistakes — an array, a chapter content file,
 * or an unrelated JSON object — without pretending to be a full schema validator
 * (runMigrations + the downstream schemaVersion check do the rest).
 */
export function looksLikeStateBackup(o: unknown): o is Record<string, any> {
  if (!o || typeof o !== 'object' || Array.isArray(o)) return false;
  const r = o as Record<string, unknown>;
  if (r.schema === 'foundation.study-module/v1') return false; // a chapter file, not a backup
  return (
    typeof r.settings === 'object' ||
    Array.isArray(r.flashcards) ||
    Array.isArray(r.subjects) ||
    typeof r.study === 'object' ||
    typeof r.notes === 'object' ||
    typeof r.schemaVersion === 'number'
  );
}

/**
 * Deep-clone the state and strip every secret, so nothing sensitive can leave the
 * device inside a shareable backup file. Currently that is the AI tutor key; add
 * future secrets here so there is a single choke point.
 */
export function redactBackup(state: unknown): Record<string, any> {
  const safe = JSON.parse(JSON.stringify(state)) as Record<string, any>;
  if (safe?.settings?.ai) delete safe.settings.ai.apiKey;
  return safe;
}
