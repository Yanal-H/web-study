export interface ManifestRow {
  id: string;
  revision: string;
}

export interface ContentSyncPlan {
  seen: Set<string>;
  removed: string[];
  batches: string[][];
}

/**
 * Pure bounded plan for one content sync. Invalid manifest rows are ignored,
 * unchanged revisions cost no pack transfer, and changed ids are split so a
 * large library never creates one request per chapter or an unbounded URL.
 */
export function planContentSync(
  rows: ManifestRow[],
  held: Record<string, string>,
  batchSize = 25
): ContentSyncPlan {
  const size = Math.max(1, Math.floor(batchSize));
  const seen = new Set<string>();
  const changed: string[] = [];

  for (const row of rows) {
    if (!row || typeof row.id !== 'string' || !row.id || typeof row.revision !== 'string') continue;
    seen.add(row.id);
    if (held[row.id] !== row.revision) changed.push(row.id);
  }

  const batches: string[][] = [];
  for (let i = 0; i < changed.length; i += size) batches.push(changed.slice(i, i + size));
  const removed = Object.keys(held).filter((id) => !seen.has(id));
  return { seen, removed, batches };
}
