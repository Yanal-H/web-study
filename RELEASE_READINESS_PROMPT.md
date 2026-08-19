# Executed release-readiness prompt

Use this prompt for a disciplined improvement pass. It has been executed for
the current change set; the verification commands at the end are re-run before
release.

> You are the release engineer for Foundation, a Vite + React + TypeScript
> medical-study app. Work through every numbered task in order. Keep the
> administrator-only Supabase RLS security boundary, learner-owned progress and
> notes, no background paid AI usage, British English, accessibility, light/dark
> parity and lossless local data. Make no unrelated rewrites. After each task,
> add a focused test or verification step. Finish by running typecheck, lint,
> tests, schema validation and a production build.
>
> 1. Trace the email authentication flow end-to-end; support the code length
>    configured by the email service without silently truncating it.
> 2. Trace every shared-content write. Confirm that the browser only presents
>    administrator controls and that Supabase RLS, not UI state, rejects student
>    writes.
> 3. Remove or isolate student paths that can shadow the shared curriculum.
>    Preserve personal progress, notes and learning cards.
> 4. Trace content hydration into the reader, question bank, dashboard and
>    flashcards. Ensure a direct route refreshes after protected content arrives.
> 5. Keep the JSON contract single-sourced in Zod, regenerate the schema/template
>    after a contract change, and validate authoring before publication.
> 6. Make publishing usable from Windows and an Android tablet: file picker,
>    paste route, plain error messages and no extra paid service.
> 7. Add optional, validated Chinese/bilingual supplementary knowledge blocks
>    that render accessibly and do not make external AI calls.
> 8. Document the code ownership map, invariant rules and an AI hand-off prompt
>    so a future AI can change a focused feature safely and cheaply.
> 9. Update deployment and authoring instructions to match the actual app,
>    including the active OTP length and administrator publishing workflow.
> 10. Run automated checks; report exactly what needs a manual test on the
>     administrator's Windows PC and Honor Magic Pro 3.

## Current execution record

1. Completed: the sign-in flow now accepts six- and eight-digit codes, with
   eight-digit auto-submit for the active Brevo/Supabase configuration.
2. Completed: reviewed the existing `is_admin()` RPC and database RLS policy;
   publication remains server-authorised.
3. Completed: the Study page no longer imports device-only chapter packs and
   the visible loader uses administrator-published shared packs only.
4. Completed: library, reader, dashboard, question-bank, mnemonic and card
   views now use the store-version signal after content hydration.
5. Completed: the Zod contract gained `extraKnowledge`; generated artefacts and
   authoring guidance are refreshed during verification.
6. Completed: the administrator publisher documents file and paste workflows
   for Windows and Honor Magic Pro 3.
7. Completed: validated English/Chinese/bilingual enrichment renders in the
   reader without a runtime service.
8. Completed: `AI_MAINTAINER_GUIDE.md` is the compact owner map and hand-off.
9. Completed: deployment and authoring documentation now match flexible OTPs
   and admin-only publication.
10. Pending final command output below before hand-off.
