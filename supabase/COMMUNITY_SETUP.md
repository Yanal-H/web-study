# Turning the Community on

If Community says **"Community unavailable"**, the tables do not exist in your
Supabase project yet. Nothing is broken in the app — this is a one-time setup
step, and it takes about two minutes.

## The short way (recommended)

Open your Supabase project → **SQL Editor** → **New query**. Paste the whole of
**`supabase/community-ALL-IN-ONE.sql`** in, and press **Run**.

That is the entire setup. It is one file containing all five community pieces in
the right order, and it is safe to run again as many times as you like.

> One thing must already be done first: **`supabase/setup.sql`**, which creates
> the chapters table and the admin rules. If your students can already sign in
> and read chapters, you have run it.

## The long way (the same thing, one file at a time)

If you would rather see each piece go in separately, run these in this order.
Each builds on the last, and each is safe to run twice.

| # | File | What it adds |
|---|------|--------------|
| 1 | `supabase/community-foundation.sql` | Departments, channels, student profiles and the private roster. |
| 2 | `supabase/community-messages.sql` | The chat itself: messages, edit history, reports. |
| 3 | `supabase/community-admin.sql` | The moderation and roster screens. |
| 4 | `supabase/community-intelligence.sql` | The daily intelligence panel. |
| 5 | `supabase/community-daily-logs.sql` | **Today's lectures** — what the year covered, and the administrator's digest. |

## Then

Reload the app. Community will load.

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
