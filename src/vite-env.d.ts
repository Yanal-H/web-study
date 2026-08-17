/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Supabase project URL, e.g. https://abcdefgh.supabase.co */
  readonly VITE_SUPABASE_URL?: string;
  /**
   * Supabase anon (publishable) key. Public by design — it identifies the
   * project, and every permission it carries is decided by row-level security
   * on the server. Not a secret.
   */
  readonly VITE_SUPABASE_ANON_KEY?: string;
  /**
   * Email domain students must sign in with, e.g. "student.university.edu".
   * Used for friendly errors only; the real check is a server-side trigger.
   */
  readonly VITE_ALLOWED_EMAIL_DOMAIN?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
