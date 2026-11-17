# How to test the summary and action items (prompt 6)

Use the Supabase TEST project and fake recordings only. No real customer calls.
Never paste your Anthropic key into chat, into the app, or into any file that gets committed.

Each summary costs real money (about 4 to 6 cents for a 1 hour meeting, well under a cent for a
short test clip). Start with the short recording, as below.

## Part A: Things you must do first

1. **Get an Anthropic key.** Go to the Claude Console at platform.claude.com, open **API keys**, and
   make a key. Use a key you keep **only for testing**. Make a different one later for the real app.
2. **Set a monthly spend limit, before you test anything.** In the Claude Console, open **Limits**
   (or Billing) and set a monthly spend limit you are comfortable with, for example $5. This is your
   safety net: if something goes wrong in a loop, it cannot spend more than that.
3. **Put the key in your own file.** Open `.env.local` in the gyan folder and add this line, with
   your real key after the `=`:

   ```
   EXPO_ANTHROPIC_KEY=sk-ant-...
   ```

   This file is never committed. The app never reads this key: it is here only so the next step can
   copy it for you.
4. **Save the key as a server secret.** Run this exact line. It reads the key from `.env.local`, so
   you never type or paste the key anywhere:

   ```
   supabase secrets set ANTHROPIC_API_KEY="$(grep '^EXPO_ANTHROPIC_KEY=' .env.local | cut -d= -f2-)"
   ```

   Check it with `supabase secrets list`. You should see the name `ANTHROPIC_API_KEY` and a
   scrambled value. You will never see the real key.
5. **Send the new database file.** Run `supabase db push`. It lists 1 new file
   (`..._summaries.sql`) and asks to continue. Type `y`. It adds 2 columns and 4 functions, changes
   1 function, and lets you tick action items off. It deletes no data.
6. **Put both functions on Supabase.** Run these two lines. The transcript one changed too, so it
   has to go up again:

   ```
   supabase functions deploy summarize
   supabase functions deploy transcribe
   ```

7. **Install the test browser** (one time only): `npx playwright install chromium`.
8. **Restart the app.** Click the terminal that runs the app, press Ctrl+C, then run
   `npx expo start --web`. Open http://localhost:8081 and log in with a fake test account.
9. **Have a short test recording ready** in your **gyan-test-files** folder: 20 to 30 seconds, 2
   different voices taking turns, where somebody says who will do something and when. For example:
   *"Priya, can you send the test plan by Friday?" "Yes, I will send it Friday."* That gives the
   summary a real decision and a real action item to find.

## Part B: The short recording, from start to finish

1. On **Home**, tap **New note**, then **Upload**, then choose your short recording.
2. Watch the label on the note. It should go **Queued**, then **Transcribing**, then
   **Summarizing**, then **Ready**. You do not need to refresh: the page updates by itself.
   The whole thing usually takes under a minute for a short clip.
3. Tap the note to open it. The **Summary** tab is the one that opens.
4. Check the Summary tab has:
   - A few sentences at the top saying what the meeting was about.
   - **Key points**, **Decisions**, and **Open questions** (a part is left out when the meeting had
     nothing to put in it, which is normal for a 20 second clip).
   - **Action items** with the name and the date **only if somebody said them out loud**.
5. Tap an action item. It should get a tick and go grey, and the count above the list should go up.
   Reload the page. The tick should still be there.
6. Tap **Copy**. A quiet "Copied" appears. Paste it into a notes app: you should see the summary and
   the to-do list as plain words, with `[x]` next to the ones you ticked.
7. Tap the **Transcript** tab. The lines, the speakers and the times should all still be there.

## Part C: Check the numbers in the dashboard

Open the Supabase dashboard for the TEST project, then **Table Editor**.

1. **meetings**: your note's row has `status = ready`, a `counted_at` with a time in it, and
   `summary_started_at` empty.
2. **summaries**: 1 row for your note, with `overview`, `key_points`, `decisions` and
   `open_questions`.
3. **action_items**: 1 row per to-do. The one you ticked has `done = true`.
4. **usage**: `meetings_used` went up by exactly **1**, and only after the note became Ready.
5. **ai_usage**: **2** rows for this note. One with `provider = deepgram`, `kind = transcription`.
   One with `provider = anthropic`, `kind = summary`, `units` = the tokens used, and `cost` in
   dollars (a few cents or less).

## Part D: Pasted text is free

1. **Home**, then **New note**, then **Paste text**.
2. Paste a few lines of fake meeting notes, including one sentence like
   *"Sam will book the review next week."* Tap **Add note**.
3. The note should go **Queued**, then **Summarizing**, then **Ready**. There is no Transcribing
   step, because there is no sound.
4. The Summary tab should have a summary and, if your text said who does what, an action item.
5. **The important check:** on **New note**, the line "Meetings used this month" is **the same as
   before**. Pasted text never uses up a meeting.
6. In the dashboard, the note's `counted_at` is **empty** and `usage` did **not** go up. There is
   one `ai_usage` row with `provider = anthropic` (the summary did cost money, which is fine, it
   just does not use a meeting).

## Part E: Things that go wrong on purpose

1. **A summary that fails.** The easiest safe way: in `.env.local`, change your key to something
   invalid such as `not-a-real-key`, run the `supabase secrets set` line from Part A again,
   then open a Ready note and tap **Regenerate**, then **Yes, write a new one**.
   - The note should become **Failed** with a message in plain words.
   - The **Transcript** tab still has every line. Nothing was lost.
   - The Summary tab has a **Retry summary** button.
   - In the dashboard, `usage` did **not** go up again.
   - Now put your real key back and run the `supabase secrets set` line again, then tap
     **Retry summary**. The note should become **Ready** again, and `usage` should **still** be the
     same number, because this note was already counted once.
2. **Regenerate asks first.** On a Ready note, tap **Regenerate**. It must ask
   *"Write a new summary?"* and say that it costs money, **before** anything happens. Tap **Cancel**
   and check nothing changed.
3. **At the monthly limit.** In the dashboard, open **plans** and set the Free row's
   `meetings_per_month` to `1`. In the app, on New note, **Upload** should be blocked with a
   friendly message, and **Paste text** should still work. Put the number back to `5` when you are
   done.

## Part F: The help entry

1. On a note page, tap the round **?** button.
2. The help panel should explain, in short plain sentences: the two tabs, what the Summary tab
   shows, how to tick action items, what **Regenerate** does and that it costs money, what each
   status means, and what to do if a note says Failed.
3. Scroll to the pictures. There should be screenshots of the Summary tab, an empty Summary, and a
   Failed note, at phone size and web size. **They all use fake names only.**
4. Make the window narrow (under 768 pixels wide). The help should slide up from the bottom instead
   of in from the side.

## Part G: The automatic checks

1. Run `npm run check`. This runs the type check and every unit test. Everything should pass.
2. Run `npm run e2e`. This drives a real browser through the login, Home, New note, Transcript and
   Summary screens. It uses fake data and never calls a paid service, so it costs nothing.
   The first run takes a few minutes, because the web app has to be built first.
3. If you want the help screenshots made again, run `npm run e2e:shots`.

## If a note gets stuck on Summarizing

This almost always means the key is not set up yet. Check with `supabase secrets list`: you should
see `ANTHROPIC_API_KEY` in the list. If it is missing, do Part A steps 3 and 4, then open the note
and tap **Start summary again** (that button appears under the waiting message after about a
minute). A note added before the key was set can always be picked up this way, and a note that was
never counted still will not be counted until it is Ready.

A note added **before this step was built** can sit on **Queued** instead. Open it and tap
**Write summary** on the Summary tab.

## Known gaps (on purpose, for later)

- **Mind map and side chat** are not built yet. The Summary and Transcript tabs are the only tabs.
- **The 150 second limit** on Supabase Free still applies. A very long recording can still end as
  Failed partway through, and a note can still get stuck on Transcribing. The summary step now has
  a 3 minute lock, so a stuck summary can be started again, but there is no automatic rescue.
- **Recap emails and the meeting bot** are not built. The decisions about who gets recap emails and
  the bot's feature switch are written down in `docs/decisions.md` but not coded yet.
- **The browser scripts fake the server.** They prove the screens behave, not that the real AI
  works. That is what Parts B to E above are for.
- **The free-plan privacy test** expects the Free plan to be 5 meetings a month. If you leave it at
  1 after Part E step 3, `npm run check` will fail. Put it back to 5.

If something does not match, tell me the Part letter and the step number and I will fix it.
