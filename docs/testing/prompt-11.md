# Prompt 11: checking the security work

Everything in this round is about keeping your customers' meetings private. Most of it you
cannot see, so this list is mostly about **checking it is really there** rather than
admiring it.

Gyan is **built to support HIPAA and GDPR requirements, pending legal review.** It is not
HIPAA compliant, and nothing anywhere should say it is.

---

## Part 1: things you must do before testing

Do these in order. Numbers 1 to 4 take about ten minutes. Nothing below works properly
until they are done.

### 1. Push the database changes

```
supabase db push
```

Adds the audit log, the settings table, the counters, the privacy settings and the consent
records, and corrects one sentence on the delete screen. **It deletes nothing.**

### 2. Deploy the server functions

```
supabase functions deploy export
supabase functions deploy transcribe
supabase functions deploy summarize
supabase functions deploy chat
supabase functions deploy translate
supabase functions deploy recap
supabase functions deploy team
supabase functions deploy account
```

(`export` is new. The others changed.)

### 3. Set a real password rule in Supabase

Gyan asks for 12 characters, but **only the dashboard can actually enforce it.**

Dashboard → **Authentication** → **Sign In / Providers** → **Email**:

- Minimum password length: **12**
- Required characters: your choice. Length matters more than symbols.
- **Leaked password protection**: this needs the Pro plan. **Leave it off for now.** I have
  not turned on anything paid.

### 3b. Make the current-password check real

Gyan now asks for your current password before changing it. **Supabase does not check that
value unless the project is told to**, and I proved it: a change sent with a deliberately
wrong current password succeeded against your test project. (It changed the test user's
password; I put it straight back.)

So right now that box stops somebody sitting at your unattended laptop, and does **not** stop
somebody who has taken a session token.

The setting is called `security_update_password_require_current_password`. Look for it in
**Authentication → Sign In / Providers → Email**, near the password rules. If it is not
there, it can be set through Supabase's Management API.

**I could not verify from Supabase's own pages which plans allow it**, so if you cannot find
it, that is worth asking them rather than assuming it is missing.

### 4. Turn on two-factor for YOUR OWN Supabase account

Dashboard → account settings → enable two-factor.

**This matters more than almost anything else in this round.** The strongest database rules
in the world do not help if somebody opens your dashboard, where there are no rules at all.

### 5. Add a third test person (only if you want the full test)

Two test accounts exist. A third, **on the same account as the first**, is the only way to
check that one teammate cannot read another teammate's private chat.

- Make a third user in the dashboard, like `test.c@example.com`.
- Add to `.env.local`: `TEST_USER_C_EMAIL=` and `TEST_USER_C_PASSWORD=`.
- Sign in as them, then have test user A invite them to the team.

Skip this if you are short of time. Everything else still works.

### 6. Ask Deepgram two questions

**This is the most important thing on this page, and it is not code.**

Deepgram was keeping every recording you sent and may have used it to train their models.
That is their default and Gyan was not opting out. It is fixed from today.

Email them and ask:

1. **"What do you still hold from our past requests, and can you delete it?"** The fix does
   nothing about recordings already sent.
2. **"Can you switch opt-out on for our whole account?"** Their own documentation suggests
   this rather than relying on a setting per request, and their pages do not say whether the
   per-request one works on every plan.

Then check it is working: Deepgram console → **Usage → Logs** → `mip_opt_out` should say
**true** on new requests.

### 6b. Decide about automatic deletion (nothing happens until you do)

The tidy-up is built, deployed and tested. **Nothing runs it**, because running it deletes
real work and that is your decision, not mine.

It does two things: deletes notes past their account's keeping time (with their recordings),
and throws away copies of data that people downloaded more than a day ago.

**See what it WOULD do, without changing anything:**

```
curl -s -X POST "$SUPABASE_URL/functions/v1/retention"   -H "Authorization: Bearer $SERVICE_ROLE_KEY"   -H "Content-Type: application/json" -d '{}'
```

(Your project address and the **service_role** key are both in the Supabase dashboard under
Settings → API. That key is the master key — never put it in the app or in a file you commit.)

It answers with `notes_due` and `exports_due` and **changes nothing**.

**Only when you are happy with that number**, run it for real by sending `{"confirm": true}`.

**Your test account currently has 124 notes**, all set to "keep for ever", so nothing is due.
If you ever set a keeping time, check the dry run first.

To have it happen by itself, Supabase can call this on a schedule (Database → Cron). I have
not set that up: a scheduled job that deletes customer work should be switched on by you,
knowingly, not found later in a config file.

### 7. Read two documents and tell me if anything is wrong

- `docs/security/vendors.md` — who sees your customers' data.
- `docs/security/hipaa-checklist.md` — what is built, and what is paperwork you have not started.

---

## Part 2: checking it on your own machine

### 8. Watch somebody try to break the database rules

```
npm run check:db
```

Needs Docker running. It builds a throwaway database, applies all twelve database files,
signs people in and **tries to break every rule** — 26 checks. Then throws it away.

**You should see:** `All 26 checks passed.`

If Docker is not running it says so and nothing else breaks.

### 9. Run everything

```
npm run check
```

**You should see:** 1169 or more tests passing.

### 10. Try to commit a key

```
printf 'ANTHROPIC_API_KEY=sk-ant-%s\n' "api03-notarealkeyjustlongenoughtolooklikeone" > test-key.txt
git add test-key.txt
git commit -m "this should be refused"
```

(The key is built from two pieces on purpose, so this page does not itself contain
something key-shaped. The checks that guard this project caught it when it did.)

**You should see:** `STOPPED: this looks like a key or a password.` and the commit refused.

Then tidy up:

```
git reset HEAD test-key.txt && rm test-key.txt
```

---

## Part 3: checking it in the app

Start the app with `npx expo start --web`.

### 11. Find the new Security page

**Settings** → **Security**. You should see three things:

- Two-factor sign in, currently **Off**
- Automatic sign out, **After 30 minutes**
- **What has happened** — the record

### 12. Turn on two-factor, for real

You need an authenticator app on your phone (Google Authenticator, 1Password, Authy).

1. Tap **Turn on two-factor**.
2. **A square code should appear.** If you see a blank white square, something is wrong —
   tell me. (It was blank once, and that is why the test now checks the picture really loads.)
3. Scan it, or type the code underneath into the app by hand.
4. Type the 6 digits back and tap **Confirm and turn on**.
5. It should now say **On**.

Then **log out and back in**. It should ask for a code before showing you anything.

**If you get stuck out — and this is the bit to remember, because a customer will ask one
day:**

1. Supabase dashboard → **Authentication** → **Users**
2. Find the person by their email address
3. Open them, and delete their **MFA factor**

They can then sign in with just their password and set it up again. **Nothing of theirs is
lost** — not their notes, not their chats.

Do **not** remove them from the team and re-invite them. That works too, but they would lose
their own chats.

There are no self-service recovery codes yet. Both ways of building one into the app are
marked experimental by Supabase, so neither is something to build a security feature on
today — and it is why two-factor is not yet required at the database level.

### 13. Watch the record fill up

Go back to **Settings → Security**. Under **What has happened** you should now see your own
sign in and turning two-factor on, newest first, in plain sentences.

Try this: it says the record cannot be changed or deleted by anybody. That is a trigger in
the database, not a promise — `npm run check:db` proves it by trying, as the server.

### 14. Change how long notes are kept

**Settings → Data and privacy**. The first panel is **How long notes are kept**, starting at
**For ever**.

**Your account keeps notes for ever**, deliberately. Only accounts made from today start at
90 days, so nothing you already have could be deleted by a default you never chose.

**Nothing is deleted automatically yet.** Choosing 30 days does not start deleting things:
somebody still has to run it, and that is a decision for you, not something I switched on.

### 15. Keep meeting summaries out of email

Same screen, **What recap emails carry**. Switch it to **A link only**, then send yourself a
recap from a Ready note.

**The email should have the title, the date and a button — and none of what was said.**

This is the single most useful setting if you ever sell to anybody in healthcare, because
Hostinger (who send your email) do not appear to offer a BAA.

### 16. Download everything Gyan holds about you

Same screen, **Download a copy of everything** → **Put my copy together**.

It takes a few seconds. Then **Download it**, and open the zip.

**You should see:**

- `gyan-export.json` — every note, transcript, summary, to-do, your chats, who is on the
  team, what you agreed to and when
- a `recordings` folder with your audio files

Open the JSON in any text editor. **It should start by explaining itself** rather than being
a wall of data.

A recording too big to fit is **not** left out — it is listed near the bottom under
`recordings_not_in_this_zip` with its own download link.

### 17. Read what happens when an account is deleted

Same screen, bottom panel. **Do not actually do it.**

Read **"What stays, and why"**. It lists the record of what happened, the email log and the
cost rows, with a reason for each, and says none of them holds a word anybody said.

The screen used to say *"gyan keeps no copy"* directly above that list. It was not true, and
it is gone.

### 18. Get signed out by leaving it alone

Sign in, then leave the app alone for 30 minutes without touching the window.

**You should come back to the sign in screen**, saying you were signed out because the app
was left alone.

To check it faster: Settings → Security → change the time to 15 minutes. (The shortest is 15.)

**It should NOT sign you out mid-upload.** Start uploading a large recording and leave it: the
uploader keeps telling the timer that something is happening.

### 19. Try to look at somebody else's notes

Sign in as your second test user. You should see **their** notes and nothing of the first
user's. Try pasting a note address from the first account into the address bar — you should
get nothing.

This is also checked automatically, against the real test project:

```
GYAN_REQUIRE_LIVE_RLS=1 npx jest __tests__/supabase-rls-test.ts
```

**Strict mode is the point**: it now fails loudly if the test accounts are missing, instead
of quietly passing having checked nothing.

### 20. Check the web pages carry their protections

With the app running, in another terminal:

```
curl -sI http://localhost:8081 | grep -i "content-security\|x-frame\|referrer"
```

**You should see** a content security policy, `x-frame-options: DENY`, and a referrer policy.
Those stop Gyan being put inside somebody else's website and stop a note's address leaking.

---

## What is NOT done, and is written down

Being straight about the edges, all in `docs/security/hipaa-checklist.md`:

- **No recovery codes** for two-factor. Until there are, losing your phone means asking for
  help, and it is why two-factor is not required at the database level.
- **Automatic deletion is not scheduled.** It works; nothing runs it.
- **Changing your password does not ask for the old one.** Being signed in is enough.
- **Nothing watches for trouble.** No alert on failed sign-ins, odd activity or a strange
  bill. You would find out from a customer or an invoice.
- **No BAA is signed with anybody**, which is the right state for a product not selling to
  healthcare yet.

---

## If something looks wrong

Tell me what you did, what you expected, and what happened instead. A screenshot is worth
more than a description — two of the three real bugs in this round were found by looking at
one, not by a test.
