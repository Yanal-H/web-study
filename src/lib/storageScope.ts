// Per-account browser-storage boundary.
//
// Supabase sessions can change without the page reloading (including in another
// tab). Every durable store therefore resolves its key/database through the
// currently authenticated user instead of using one origin-wide namespace.
//
// Existing installations already have data under the legacy unscoped names. The
// first authenticated account after this migration claims those names once. We
// keep using them for that owner, avoiding a risky copy of large PDFs, while all
// other accounts receive isolated names. The claim is never cleared on sign-out.

const LEGACY_OWNER_KEY = 'foundation_storage_legacy_owner_v1';
const OWNER_PREFIX = '__user_';

let activeOwnerId: string | null = null;

function normaliseOwnerId(userId: string): string {
  const value = userId.trim();
  if (!/^[a-zA-Z0-9_-]{6,128}$/.test(value)) {
    throw new Error('Cannot activate browser storage for an invalid user id.');
  }
  return value;
}

function readLegacyOwner(): string | null {
  if (typeof localStorage === 'undefined') return null;
  try {
    return localStorage.getItem(LEGACY_OWNER_KEY);
  } catch {
    return null;
  }
}

function claimLegacyOwner(userId: string): string {
  const existing = readLegacyOwner();
  if (existing) return existing;
  try {
    localStorage.setItem(LEGACY_OWNER_KEY, userId);
    return localStorage.getItem(LEGACY_OWNER_KEY) || userId;
  } catch {
    // Storage can be unavailable in private/restricted modes. Isolation still
    // works for this session by avoiding the legacy namespace entirely.
    return '';
  }
}

export function setActiveStorageOwner(userId: string | null): void {
  activeOwnerId = userId ? normaliseOwnerId(userId) : null;
  if (activeOwnerId) claimLegacyOwner(activeOwnerId);
}

export function getActiveStorageOwner(): string | null {
  return activeOwnerId;
}

export function requireActiveStorageOwner(): string {
  if (!activeOwnerId) throw new Error('Sign in before accessing personal data on this device.');
  return activeOwnerId;
}

function ownerSuffix(): string {
  const owner = requireActiveStorageOwner();
  const legacyOwner = readLegacyOwner() || claimLegacyOwner(owner);
  return legacyOwner === owner ? '' : `${OWNER_PREFIX}${owner}`;
}

/** Resolve a localStorage key owned by the active Supabase user. */
export function scopedLocalStorageKey(base: string): string {
  return `${base}${ownerSuffix()}`;
}

/** Resolve an IndexedDB database name owned by the active Supabase user. */
export function scopedDatabaseName(base: string): string {
  return `${base}${ownerSuffix()}`;
}

/** Test/support hook. The claim remains durable; only the active session clears. */
export function clearActiveStorageOwner(): void {
  activeOwnerId = null;
}

