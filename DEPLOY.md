# Putting Foundation online — step by step

Written for a first deployment. Follow it in order; each step says what you
should see when it worked. **Total cost: £0.** Nothing here needs a card.

Set aside about 30 minutes. You can stop after Step 4 and still have a working,
private site — Steps 5 and 6 are content and polish.

---

## What you are building

| Piece | Service | Free allowance | You need |
|---|---|---|---|
| The website | Vercel Hobby | 100 GB traffic/month | about 350 MB for 1000 students |
| Sign-in | Supabase | 50,000 users/month | 1,000 |
| Chapters | Supabase database | 500 MB | about 2 MB |

Two accounts, both free: **Vercel** (already set up if your site is live) and
**Supabase** (new).

### Two honest things before you start

**1. You cannot stop a signed-in student saving your content.** Every website
sends its code to the browser — that is how the web works — and anyone signed in
can copy what they can see. No service, and no amount of money, changes this.

What this setup *does* give you, and what most sites get wrong:

- A visitor who is not signed in gets **nothing** — no chapters, no cards, not
  even a cached copy. (Before this, everything was downloadable by anyone.)
- Only people with your university email domain can create an account.
- Chapters are **never stored on the student's device**. They are downloaded
  into memory each visit and gone when the tab closes, so a borrowed, lost or
  resold phone carries no library, and revoking someone actually takes effect.
- You can remove anyone's access instantly.
- Every page carries the email of the account it was served to, so a leaked
  screenshot points somewhere.

**2. Foundation needs a connection.** Because nothing is kept on the device,
students must be online to open their chapters — on the ward, on the metro, they
will see "No connection" instead of their notes. Their *progress and personal
notes* stay on the device and are never lost; only the chapters need the network.

If offline studying matters more to you than keeping copies off devices, say so
and it can be changed back — the trade is one or the other, not both.

---

## Step 1 — Create the Supabase project

1. Go to **supabase.com** and sign up (GitHub login is fine).
2. Click **New project**.
   - **Name**: `foundation`
   - **Database password**: click Generate, then **save it somewhere safe**. You
     will not need it for this guide, but you cannot retrieve it later.
   - **Region**: pick the one closest to your students.
3. Click **Create new project** and wait ~2 minutes while it provisions.

**Worked when:** you land on the project dashboard and it does not say "Setting
up project".

---

## Step 2 — Set up the database

This creates the table your chapters live in, the rules about who can read and
write them, and the restriction to your email domain.

1. In the left sidebar click **SQL Editor**, then **New query**.
2. Open `supabase/setup.sql` from this repository and copy all of it.
3. Paste it into the editor. **Before running, change the two values at the top:**

   ```sql
   select 'CHANGE-ME.edu'::text;              -- your students' email domain
   select array['you@CHANGE-ME.edu']::text[]; -- your own email address
   ```

   For example, if your university issues addresses like
   `yasmin@med.cu.edu.eg`, the domain is `med.cu.edu.eg`.

   Use the domain **exactly** as it appears after the `@`, with no `@` and no
   spaces. Get this wrong and nobody — including you — can sign in.

4. Click **Run**.

**Worked when:** it says *Success. No rows returned*. To double-check, run:

```sql
select public.allowed_email_domain();
```

It should print your domain.

---

## Step 3 — Get your two keys

1. Left sidebar → **Project Settings** (the gear) → **API**.
2. Copy these two values somewhere you can paste from:
   - **Project URL** — looks like `https://abcdefghijkl.supabase.co`
   - **anon public** key — a long string starting `eyJ...`

The anon key is **safe to put in the website**. It only identifies your project;
what it is allowed to do is decided by the rules you ran in Step 2.

> **Never** copy the `service_role` key into Vercel or into the app. That one
> bypasses every rule. It is only used from your own computer in Step 5.

---

## Step 4 — Tell Vercel about it

1. Go to **vercel.com** → your project → **Settings** → **Environment
   Variables**.
2. Add three variables. For each: type the name, paste the value, leave all
   three environments (Production, Preview, Development) ticked, click **Save**.

   | Name | Value |
   |---|---|
   | `VITE_SUPABASE_URL` | the Project URL from Step 3 |
   | `VITE_SUPABASE_ANON_KEY` | the anon public key from Step 3 |
   | `VITE_ALLOWED_EMAIL_DOMAIN` | your domain, e.g. `med.cu.edu.eg` |

   `VITE_ALLOWED_EMAIL_DOMAIN` is **cosmetic** — it fills in the sign-in hint and
   the placeholder, nothing more. Who may actually sign in is decided by the
   database (Step 2), which is also the only place that knows your admin list.
   Changing or removing this variable does not weaken access control.

3. **Redeploy — this is the step people miss.** Environment variables are read
   when the site is *built*, so the running site knows nothing about them until
   you rebuild. Go to **Deployments**, click the ⋯ menu on the newest one, and
   choose **Redeploy**.

**Worked when:** open your site. You should see the Foundation sign-in screen
asking for your email — not the old passphrase box. If you still see the
passphrase box, the redeploy has not finished or has not picked up the branch.

---

## Step 4b — Make the email contain a CODE, not a link

Supabase's default sign-in email sends a **link**, and that link points at
`http://localhost:3000` — an address that only works on a developer's own
machine. Students clicking it get "This site can't be reached".

Foundation signs people in with a 6-digit code, so the template has to carry the
code instead. This is not optional; without it your students receive an email
with nothing usable in it.

1. Supabase → **Authentication** → **Emails**
2. Open the **Magic Link** template
3. Replace its contents with:

   ```html
   <h2>Your Foundation sign-in code</h2>
   <p>Enter this code to sign in:</p>
   <p style="font-size:32px;font-weight:bold;letter-spacing:6px">{{ .Token }}</p>
   <p>The code expires in 60 minutes.</p>
   <p>If you didn't ask for this, you can ignore this email.</p>
   ```

   `{{ .Token }}` is the part that matters — it is what inserts the six digits.

4. Save.
5. Still under **Authentication**, open **URL Configuration** and set **Site URL**
   to your real site address, so no email ever points at localhost again.

**Worked when:** request a code and the email shows six large digits.

---

## Step 5 — Upload your chapters

Your chapters currently live as JSON files in `content/`. They are no longer
built into the site, so they need to go into the database once.

On your own computer, in the project folder:

```bash
SUPABASE_URL=https://YOUR-PROJECT.supabase.co \
SUPABASE_SERVICE_KEY=YOUR-SERVICE-ROLE-KEY \
npm run upload:content
```

The service_role key is under **Project Settings → API**, below the anon key.
It is used here because this runs on your machine, not in a browser. Do not
paste it anywhere else.

**Worked when:** it lists each chapter with its card and question counts and
ends with `Uploaded N chapter(s)`.

If a chapter fails validation, **nothing** is uploaded — that is deliberate, so
you never end up with students missing half a subject. Fix the reported problem
and run it again.

---

## Step 6 — Sign in and check

1. Open your site, enter **your own** email (the one you put in `admin_emails`).
2. Click **Send me a code**, check your inbox, type the 6 digits.
3. You should land on the dashboard, and your chapters should appear in **Study**
   within a few seconds.
4. Open **Settings → Admin**. It should say **Administrator**. If it says
   *Student*, your email is not in `admin_emails()` — re-run Step 2 with the
   right address.

From now on you can publish new chapters straight from **Settings → Admin →
Publish**, without touching the command line or redeploying.

---

## Step 7 — Give it to your students

Send them the URL. That is all they need. They sign in with their university
email, get a code, and they are in.

Tell them they need to be **online to study** — the chapters download each time
and are not kept on the phone. Their progress, notes and personal cards are
saved on the device and do not need a connection.

Nothing they do can change your content — the database refuses writes from any
account that is not on your admin list, on every device, no matter what they
edit in their own browser.

---

## When something goes wrong

**"Sign-in is not set up on this deployment yet"**
The environment variables are missing or you have not redeployed since adding
them. Redo Step 4, including the redeploy.

**The email arrives but has a link instead of a code / the link goes to localhost**
The Magic Link template still has its default contents. Do Step 4b.

**The code email never arrives**
Check spam. Supabase's built-in email sender is rate-limited (a few per hour)
and is meant for testing — fine while you try it out, but before you invite 1000
students go to **Authentication → Emails → SMTP Settings** and connect a free
email sender (Resend and Brevo both have free tiers). Otherwise students will
hit the limit and quietly get nothing.

**You are refused from your own site with a personal email**
Administrators may sign in from any domain, but only if the address is in
`admin_emails()`. Check with `select public.admin_emails();` and make sure it
matches what you type at sign-in, character for character.

**"Only @yourdomain addresses can use Foundation" for a valid student**
The domain in Step 2 does not match their address exactly. Run
`select public.allowed_email_domain();` and compare it character by character
with what comes after the `@` in their email.

**Settings → Admin says "Student" when it should say Administrator**
Your email is not in `admin_emails()`. Re-run the SQL from Step 2 with the
correct address — re-running is safe.

**Students do not see a chapter you just published**
They get it on their next load. Ask them to reload — chapters are fetched fresh
every visit, so a reload is always enough.

**A student says the app is empty / "No connection"**
They are offline, or the Supabase project is paused (see below). Chapters are not
stored on the device, so no connection means no chapters. Their own progress and
notes are untouched and will be there when they reconnect.

**"The chapters table does not exist yet"**
Step 2 has not been run, or was run against a different project.

**The site was fine, then everything stopped**
Supabase pauses free projects after 7 days with **no** activity — a holiday
could do it. Open the Supabase dashboard and click Resume. While it is paused
students cannot load chapters at all, so resume it before term restarts.

---

## What lives where

| | Where it lives | Survives closing the tab? |
|---|---|---|
| Your chapters | Downloaded into memory each visit | **No** — by design |
| Student progress and review history | That student's device | Yes |
| Notes and personal cards | That student's device | Yes |

Progress, review history, notes and personal cards are never uploaded, not
visible to you, and not visible to anyone else. The only thing that travels is
the chapters you publish, in one direction: you publish, students receive.

### Watch your Supabase usage

Because chapters download every visit rather than being cached, this uses more
bandwidth than a normal site. Your current content is **225 KB compressed**, and
the free tier allows **5 GB/month** — about **23,000 chapter loads**.

For 1000 students that is roughly **23 visits each per month**, or a bit under
one a day. Comfortable for most cohorts, but keep an eye on **Supabase →
Settings → Usage** as your content grows: doubling the chapters halves the
number of visits that fit. If you approach the limit, the fix is to load each
chapter only when a student opens it rather than all of them at sign-in — ask
and it can be built.

---

## Optional: the AI tutor

The AI tutor works with no setup — each student can paste their own Anthropic
key in Settings, which costs you nothing.

If you would rather provide it for everyone, add `ANTHROPIC_API_KEY` in Vercel
(Step 4) and redeploy. **This one does cost money**, charged per question asked,
so leave it unset unless you intend to pay for it.
