# Prompt 12: checking the fast Home list, search and filters

Home used to ask for **every** note in one go and draw all of them. That was fine with ten
notes. This round makes it ask for ten, then twenty at a time, and gives you a search box and
filters so you can actually find a note among hundreds.

**I have already pushed the database change and made 300 fake notes on your test project**, so
you can look at the real thing straight away rather than setting it up first. Part 1 says what
was done and how to undo it; Part 2 is the ten minutes of checking on your own machine; Part 3
is clicking around the app. Part 4 is what is deliberately not built.

---

## Part 1: what has already been done for you

### 1. The database change is pushed

`supabase/migrations/20261121150000_search_and_paging.sql` is applied to your **test** project
(`ofnspnobzesxmyqjxzad`). **Nothing was deleted.** It adds, to every note, a ready-made copy of
the words worth searching, and four new doors: one to find notes, one to find transcript lines,
one to delete several notes at once, and one to make fake notes for measuring.

You do not need to run `supabase db push`. If you ever reset the project, you would.

### 2. There are 300 extra fake notes on your account

Every one is titled **`[test] ...`**, so they are obvious on screen. They have fake
transcripts, summaries and to-dos, spread over the last 120 days, with a mix of statuses and
sources, so the list has something real to page through and filter.

To see how many there are:

```
npm run fake:notes:count
```

**You should see:** `There are 423 fake notes on this account right now.`

### 3. Why it says 423 and not 300

**Your account already had 123 notes titled `[test] storage rules`** from testing in earlier
rounds. I did not touch them. 123 old ones plus my 300 new ones is 423, and you have about 10
real notes on top of that.

This matters for the next step, so read it before you run it.

### 4. How to remove them when you are done

```
npm run fake:notes:remove -- --yes
```

**This removes ALL 423**, not just my 300 — the old `[test] storage rules` ones go too, because
the only mark they share is the `[test] ` at the front of the title. They are all test notes, so
that is almost certainly what you want. If it is not, say so and I will mark mine differently.

Running it **without** `--yes` deletes nothing and just tells you what would go:

```
npm run fake:notes:remove
```

Your real notes are safe either way: it only ever touches notes on your own account whose title
starts with `[test] `.

### 5. One thing to know about the fake-note doors

They refuse everybody except you. You must own your account **and** be marked as a gyan admin in
the database, which you turned on by hand in prompt 10. No migration ever sets it and the app
cannot set it, so on a fresh project nobody at all can make fake notes. If you ever see
`this login is not a gyan admin`, that is why.

---

## Part 2: checking it on your own machine

### 6. Run the type check and every test

```
npm run check
```

**You should see:** `Tests: 1294 passed, 1294 total` and no type errors. (It was 1209 before
this round.) A line about "a worker process has failed to exit gracefully" is normal and was
there before.

### 7. Run the database rules against a throwaway database

```
npm run check:db
```

This builds a real Postgres in Docker, applies every database file, then **tries to break the
rules** as different signed-in people.

**You should see:** `All 44 checks passed.` (It was 30 before this round.) The 14 new ones are
the ones that matter most in this round:

- signed in as person B, searching for a word that only exists in person A's notes finds
  **nothing**;
- and B is **not told how many** notes A has either. This is the sneaky one: a count taken the
  wrong way would answer "none of these are yours, but there are four hundred of them", which
  still tells B something about A. No test that only looked at rows would have caught it;
- B cannot delete A's note **even when handed its id directly**;
- A really can find their own note, is told there is 1, is told the words were in the title, the
  summary and the transcript, and gets the moment the line was said;
- searching `reviews` finds a note titled `review`, so English word endings work;
- a signed-out visitor cannot search at all;
- a 3 MB note made of 400,000 different words saves and is still searchable. Without the length
  cut in the migration, Postgres refuses that note outright and it could not be saved at all —
  I measured that in the same database rather than assuming it;
- a Spanish word finds its own note, and the Japanese result is **recorded rather than claimed**
  (see number 20).

### 8. Run the live check against your real test project

```
GYAN_REQUIRE_LIVE_RLS=1 npx jest __tests__/supabase-rls-test.ts
```

**You should see:** `Tests: 48 passed, 48 total`. (It was 42.) The six new ones make the same
cross-account attempts as number 7, but against your **real** test project, because a rule that
holds in a copy and not in the real thing is no rule at all.

### 9. Run the browser scripts

```
npm run e2e
```

**You should see:** `211 passed`. (It was 178. 19 are new for this round, and 14 more take the
new help screenshots.)

If it says the port is in use, your dev server has it:

```
GYAN_E2E_PORT=8099 npm run e2e
```

### 10. See the measured speeds for yourself

```
npm run measure:home
```

It asks your test project the same questions the screen asks, five times each, and reports the
middle time.

**You should see something close to this** (this is my run, against your project, with 433
notes on the account):

```
  148 ms   The first ten notes, as Home opens  (10 notes back, 433 match in all)
  220 ms   Twenty more, after Show more  (20 notes back, 433 match in all)
  123 ms   Searching one word  (10 notes back, 37 match in all)
  131 ms   Searching a word only said once  (10 notes back, 30 match in all)
  126 ms   Searching two words  (10 notes back, 23 match in all)
  116 ms   Last 30 days  (10 notes back, 219 match in all)
  129 ms   Ready notes only  (10 notes back, 214 match in all)
  114 ms   A word, a date range and a status together  (8 notes back, 8 match in all)
  116 ms   Notes with something still to do  (10 notes back, 142 match in all)
```

In plain words: **with 433 notes, Home's first ten come back in about a seventh of a second, and
a search in about an eighth.** Those numbers include the trip over the internet to Supabase and
back, so most of what you are seeing is distance, not work. Your own numbers will move around by
a few tens of milliseconds depending on your wifi.

Worth knowing: searching is *faster* than the plain list, because the plain list has to count all
433 matches while a search only counts the 37 that matched.

---

## Part 3: checking it in the app

Start the web app:

```
npx expo start --web
```

### 11. Home opens with ten notes, not all of them

Look at the list. **You should see:** ten notes, then a **Show more** button, and a quiet line
above the list saying how many there are in total (around **433 notes**).

Press **Show more**. Twenty more appear, below the first ten — they are added, not swapped in.
Press it again for twenty more.

### 12. The notes are grouped by day

**You should see** quiet headings — **Today**, **Yesterday**, **This week**, then month names
like **November** and **October**. There is deliberately no "Earlier": with hundreds of notes one
heading holding all of them tells you nothing.

### 13. Search for a word

Type **pricing** in the search box. Gyan waits until you stop typing, then looks.

**You should see:** the list narrow, a line saying how many were found, and under each note a few
words of the match with **pricing picked out on a blue background**, plus a line saying **Found
in the transcript** (or the summary, or the title).

The fake notes have two words planted in them on purpose, so you can check the two halves:

- **pelican** — said in a transcript only. Every tenth fake note has it. The result should say
  *Found in the transcript*, and show a time like **3:00** next to the words.
- **wombat** — written in a summary only. Every fifteenth fake note has it. The result should say
  *Found in the summary*, with no time, because nobody said it out loud.

### 14. Open a note at the moment a word was said

Search **pelican**, then tap one of the results. **You should see** the note open on the
**Transcript** tab with that line **lit up**, rather than at the top of the page. It is the same
jump the chat's little numbered links make.

### 15. Search line by line

With a word still in the box, tap **See every matching line**.

**You should see** the **Search** screen: one card per matching line, each with the note title,
the date, the speaker's name, the line with your word picked out, and a timestamp pill. Tapping a
card opens that note at that line, as in number 14.

### 16. Filter by date

Press **Filters**. Pick **Last 7 days**, then **Show these notes**.

**You should see** a much shorter list, a count, and the button now reading **Filters (1)** with a
pill next to it saying **Last 7 days**. Tap the pill to take that one filter off.

Now press **Filters**, pick **Custom range**, and use the little calendar: tap a first day, then a
last day. It says **Both days are included.** before you apply it, because that is the thing
people get wrong about date ranges.

### 17. Use several filters at once

Press **Filters** and tick **Ready**, **Upload**, and **Still has something to do**, then apply.
Type a word in the search box as well.

**You should see** only notes that satisfy **all** of it, the count matching what is on screen,
and a pill for each filter. **Clear filters** takes everything off in one press, including the
search word.

### 18. Refresh the page, and press back

With a search word and a filter on, look at the address bar. **You should see** something like:

```
http://localhost:8081/?q=pricing&status=Ready
```

Nothing else — no empty leftovers. Now press **refresh**. **You should see the same view come
back**, with the word still in the box and the filter still on.

Open a note, then press your browser's **back** button. You come back to the same narrowed list,
not to a blank Home.

### 19. Delete several notes at once

Press **Select**. The rows grow tick boxes. Tap two notes.

**You should see** "2 notes selected", and **Delete** turn red. Press it.

**You should see one box** that lists the notes by name and says, in the plural:

- the transcripts, summaries, to-dos and chats go too;
- the recordings and files are removed;
- **it does not give you 2 meetings back this month**;
- this cannot be undone.

Confirm. The rows disappear and a line says **2 notes deleted.**

If you are on a team account and tick a note a teammate made, it will not tick, and the row says
**Somebody else made this note, so you cannot delete it.** That is the same rule as deleting one
note: you may delete your own, and an account owner may delete any of them.

### 20. Try a language that is not English

Type a Spanish word, or a word in any language that puts spaces between words — it will find
itself exactly. English is the only language where Gyan also knows word **endings**, so
"meeting" finds "meetings".

**Japanese, Chinese and Korean are the weak spot, and this is measured, not guessed.** In
`npm run check:db` I put a Japanese line into a note and searched it two ways:

- the **whole phrase** `予算の会議は来週です` → **found it**;
- a **single word inside** that phrase, `予算` → **found nothing**.

The reason is that Postgres has no way to tell where one word ends and the next begins in those
scripts, so it treats a run of them as one long word. There is no quick fix inside the database.
If Japanese, Chinese or Korean customers matter, that is a real piece of work and worth deciding
on its own.

---

## Part 4: what is NOT done, and is written down

- **Searching still cannot find a topic worded differently.** `docs/product-spec.md` feature 7
  asks for "topics that use different words" — searching *cost* and finding *pricing*. That needs
  embeddings, and the `chunks` table and the embedding model are still open decisions from
  2026-11-16. The spec now carries the two halves separately and marks feature 7 part built, and
  the help text says so in plain words rather than letting you find out.
- **Japanese, Chinese and Korean search poorly**, as measured in number 20.
- **Settings → Data and privacy still lists every note at once**, unpaged. That screen is the one
  place where seeing all of them is the point, but with 433 notes it will be slow to open. Worth a
  small follow-up.
- **Deleting notes is not written into the record of what happened.** Nor is deleting one note,
  which is how it already was — so bulk delete matches single delete rather than quietly
  differing from it. That gap was there before this round and I have not widened it.
- **I have not tested this on a phone.** Everything is checked at 390 and 1280 pixels wide in a
  browser, and the calendar and filter sheet were built by hand precisely so they behave the same
  on a phone, but a real iPhone and a real Android still need your eyes.
- **The 300 fake notes are on your test project right now.** Number 4 says how to remove them.

## If something looks wrong

- **Home shows no notes at all, with no error.** The database change did not reach your project.
  Run `supabase migration list` — `20261121150000` should have a date in the remote column.
- **A search finds nothing it should.** A note still being transcribed has no words to search yet.
  Check its status is Ready.
- **`npm run fake:notes` says "not a gyan admin".** Supabase dashboard → **Table editor** →
  **profiles** → your row → set **is_admin** to true.
- **`npm run e2e` says the port is in use.** Use `GYAN_E2E_PORT=8099 npm run e2e`.
- **`npm run check:db` says Docker is not running.** Start Docker Desktop. That check is extra;
  `npm run check` does not need it.
