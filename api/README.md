# Foundation server functions (all optional)

Foundation is offline-first: every chapter shipped in the build works with **no
server at all**. Everything in this folder is an optional add-on. Leaving all of
it unconfigured is a supported configuration, not a broken one.

| Function | Gives you | Needs |
|---|---|---|
| `ai.ts` | AI tutor for every student without each pasting a key | `ANTHROPIC_API_KEY` |
| `admin.ts` | Server-verified admin identity for your device | `ADMIN_KEY` |
| `content.ts` | Publish chapters to the cohort without a redeploy | `ADMIN_KEY` + a storage backend |

---

## 1. Shared AI tutor — `api/ai.ts`

Lets every student use the AI tutor without pasting their own API key. The
Anthropic key lives only in a server environment variable; it is never shipped to
the browser.

**Turn it on:** in Vercel → **Settings → Environment Variables**, add
`ANTHROPIC_API_KEY` = your Anthropic key (`sk-ant-…`), then **redeploy**.

**If you do not:** studying still works fully. A student pressing an AI button is
told they can add their **own** key in Settings → AI tutor, which then calls
Anthropic directly from their browser.

Notes: model is capped to Opus 5 / Sonnet 5 / Haiku 4.5, `max_tokens` is capped,
and requests must be same-origin. That is a deterrent suited to a class cohort,
not hardened auth — if the audience grows large or public, add rate-limiting
before relying on it.

---

## 2. Admin identity — `api/admin.ts`

Marks **one device — yours** as the administrator. The key is checked
server-side, so a student who flips the `admin` flag in their own browser storage
gains nothing: every shared write is verified against a signature only the server
can produce.

**Turn it on:** add `ADMIN_KEY` = a long secret only you know, redeploy, then
enter it once in **Settings → Admin** on your own device.

On success the server returns a short-lived signed token (12h) which the app
keeps in `sessionStorage` — so the long-lived key is sent once rather than on
every publish, and it can never end up inside an exported backup.

---

## 3. Shared content store — `api/content.ts`

Publish a chapter to the whole cohort **without redeploying**. Shipped chapters
stay the base layer; published chapters are an overlay on top, cached into
IndexedDB on each device so they keep working offline afterwards.

**Turn it on:** set `ADMIN_KEY` (above) **and** one storage backend:

- **Vercel Blob** — create a Blob store in the Vercel dashboard; it sets
  `BLOB_READ_WRITE_TOKEN` for you.
- **Vercel KV / Upstash Redis** — create the store; it sets `KV_REST_API_URL`
  and `KV_REST_API_TOKEN`.

Set either one and redeploy. If both are present, KV is used.

**If you do not:** `/api/content` answers 503, the app quietly keeps using the
chapters built into the bundle, and Settings → Admin says the store is not set
up. Nothing regresses.

### How publishing behaves

- Every pack is validated **server-side** against the same schema the build-time
  validator uses. A malformed pack is refused before it is stored, so it can
  never reach a student mid-revision.
- Publishing the same `id` again replaces it. Students pick the new revision up
  on their next load.
- Unpublishing stops distribution. Students keep what they already downloaded
  until their next sync — deliberately, so nobody loses material mid-session.
- Reads are public (students need them). Only writes require the admin token.

### API

```
GET    /api/content          → { ok, items: [{ id, revision, updatedAt }] }
GET    /api/content?id=…     → { ok, pack, revision, updatedAt }
POST   /api/content          → publish (Authorization: Bearer <admin token>)
DELETE /api/content?id=…     → unpublish (Authorization: Bearer <admin token>)
```

---

## What is never sent to the server

Student progress, scheduling, notes and personal cards stay **on the device**.
Nothing in this folder uploads them. The shared store carries authored chapter
content only, in one direction: you publish, students receive.
