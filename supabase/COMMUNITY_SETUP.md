# Turning the Community on

If Community says **"Community unavailable"**, the tables do not exist in your
Supabase project yet. Nothing is broken in the app — this is a one-time setup
step, and it takes about two minutes.

## What to do

1. Open your Supabase project → **SQL Editor** → **New query**.
2. Open each file below, copy its whole contents into the editor, and press
   **Run**. Do them **in this order** — each one builds on the last.

| # | File | What it adds |
|---|------|--------------|
| 1 | `supabase/setup.sql` | The base tables and admin rules. You have likely run this already; running it again is safe. |
| 2 | `supabase/community-foundation.sql` | Departments, channels, student profiles and the private roster. |
| 3 | `supabase/community-messages.sql` | The chat itself: messages, edit history, reports. |
| 4 | `supabase/community-admin.sql` | The moderation and roster screens. |
| 5 | `supabase/community-intelligence.sql` | The daily intelligence panel. |
| 6 | `supabase/community-daily-logs.sql` | **Today's lectures** — what the year covered, and the administrator's digest. |

Every file is safe to run twice. If one has already been applied, running it
again changes nothing.

3. Reload the app. Community will load.

## Then: let students in

A student never picks their own department in the browser — that is what makes
the isolation real. Add their university email to the private roster
(`private.community_entitlements`), and it is claimed automatically the next
time they sign in. The **Manage community** button in the app does this for you.

## Today's lectures, and where the study material comes from

The **Discussion** tab is conversation. The **Today's lectures** tab is
different on purpose: a day's learning scattered through hundreds of chat
messages cannot be collected, which is exactly the problem. Each entry is one
lecture — subject, topic, lecturer, and what mattered.

As the administrator you get **Copy the day for authoring**: the whole day,
grouped by subject and topic with every student's account of each lecture
together, as one block of text. Paste that straight into the chapter-authoring
prompt and you are building material out of what the cohort actually sat
through, instead of re-typing it.

Pick any past date to re-read a day you missed.

## Who can see what

- A student sees their **own year's** logs. Reading across the year is the
  point — it is how a missed lecture gets picked up.
- An administrator sees **all** of them.
- A student can edit or delete **their own** entries, and nobody else's.
- The author and their alias are set by the **database**, not the browser, so
  one student can never file a log under another's name.
