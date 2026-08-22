# Rule: data safety and permissions

A student's progress is theirs and is irreplaceable. Treat it that way.

## Never destroy student data

- **No mass reschedule.** Do not rewrite `due`, `state`, stability, or lapse
  counts across cards to "clean up" or "reset". Scheduling changes apply to one
  card as the direct result of one grade.
- **No wiping IndexedDB.** Personal study data (schedules, review history, notes,
  personal cards) lives in IndexedDB and must survive sign-out, re-import, content
  changes, and app updates.
- **Content import overwrites content, not progress.** Importing a chapter updates
  its cards/questions by id. It must never reset a student's schedule for those
  cards. Verify this whenever you touch the import path.
- **Migrations are forward-only and additive.** A schema migration adds fields or
  backfills; it does not drop a student's history. Guard every migration with a
  version check and make it idempotent.
- **Reconcile only on a clean sync.** `remoteContent.ts` deletes rows for
  unpublished chapters only when *no* chapter failed to download — an incomplete
  manifest must never trigger deletion. Keep that guard.

## Never weaken permissions

- The list of administrators lives in the **database** (`admin_emails()` /
  `is_admin()` reading `auth.jwt() ->> 'email'`), not in the browser. The client
  may present a friendlier message, but it must not gate sign-in or admin actions
  — a client-side gate once locked the owner out of her own site.
- Row-level security is the enforcement point for who can read and publish
  content. Don't route around it. `src/lib/publish.ts` says so at the top: nothing
  there is a security boundary.
- Students must never reach admin-only actions; admins must never lose access.
  When in doubt, fail closed for writes and let the server reject.

## When unsure

If a change might touch schedules, history, or permissions and you cannot prove it
is safe, stop and ask rather than guessing. A wrong reschedule is invisible until a
thousand students have lost their queue.
