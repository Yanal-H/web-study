# Foundation AI maintainer guide

This is the short, authoritative map for a developer AI working on Foundation.
Read it before changing code. It is intentionally compact so an AI can make a
focused change without loading unrelated parts of the project.

## Non-negotiable boundaries

1. **Authentication and roles**: `src/features/auth/` owns the email-code UI;
   `src/lib/supabase.ts` owns the client. `supabase/setup.sql` is the security
   boundary. Only `public.is_admin()` and the `chapters_write` RLS policy decide
   who can change shared chapters. Never replace that with a browser-side flag.
2. **Shared curriculum**: `src/content/schema.ts` defines the one accepted JSON
   contract. `src/lib/publish.ts` validates and sends admin-authored packs.
   `src/data/remoteContent.ts` fetches them, then `src/data/bootstrap.ts`
   hydrates `src/content/loader.ts`. Student UI must only read this path.
3. **Student-owned data**: progress, notes, locally-created cards, tasks and
   appearance settings are device-local. They must not be able to alter shared
   curriculum, but do not delete a learner's study history in a feature change.
4. **Costs**: ordinary study and content publishing make no paid AI request.
   The optional AI tutor is the only paid capability and stays opt-in. Do not
   add background model calls, analytics services, trackers, CDNs or remote
   fonts without explicit approval.
5. **Content integrity**: validate every new/changed pack with the Zod schema.
   Do not put shared chapter JSON in the Vite bundle. Optional `extraKnowledge`
   blocks support English, Chinese (`zh`) or bilingual terminology and remain
   part of the same validated pack.
6. **Data safety**: migrations are additive and backups must remain importable.
   Do not reset localStorage or IndexedDB as a shortcut.
7. **Experience**: British English, no emoji, keyboard access, reduced-motion
   support, light/dark parity, and small-screen usability are baseline rules.

## Change map

| Need | Start here | Then check |
|---|---|---|
| Email code, session, sign out | `src/features/auth/` | `src/lib/supabase.ts`, `DEPLOY.md` |
| Administrator publishing / roles | `supabase/setup.sql`, `src/lib/admin.ts`, `src/lib/publish.ts` | `src/features/settings/SettingsView.tsx` |
| Chapter JSON / MCQs / bilingual notes | `src/content/schema.ts` | `authoring/AI_CONTENT_PROMPT.md`, `content/_schema/` |
| Reader display | `src/features/study/ReaderView.tsx` | `src/features/features.css` |
| Study library | `src/features/study/StudyView.tsx` | `src/content/loader.ts`, `src/data/bootstrap.ts` |
| Flashcards | `src/features/flashcards/` | `src/data/fsrs.ts`, `src/data/session.ts` |
| Question bank | `src/features/qbank/` | `src/content/schema.ts`, `src/state/types.ts` |
| Styling / components | `src/design/` | `src/features/features.css` |
| Local state / migrations | `src/state/` | `src/features/settings/backup.ts` |

## Safe change loop

1. Name the user-visible outcome and identify the smallest owner files above.
2. Read the nearby tests and extend them for any security, validation or data
   behaviour changed.
3. Change the schema first when the JSON contract changes, then run
   `npm run make:schema` to regenerate `content/_schema/`.
4. Run `npm run typecheck`, `npm run lint`, `npm test`, and `npm run build`.
5. For role or content changes, manually test both an administrator and a
   student account. A hidden button is not security; the Supabase policy must
   refuse the student's write.
6. Update the relevant authoring/deployment documentation in the same change.

## Fast hand-off prompt

> Read `AI_MAINTAINER_GUIDE.md` first. Implement only: [OUTCOME]. Preserve
> Supabase RLS administrator-only curriculum publishing, device-local learner
> data, no background paid AI/network usage, the content schema, British English,
> accessibility, and light/dark/reduced-motion support. Add or update focused
> tests, run typecheck, lint, tests and build, then report changed files and any
> manual verification still required.
