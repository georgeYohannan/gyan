# How to test the side chat (prompt 7)

Use the Supabase TEST project and fake recordings only. No real customer calls.
You do **not** need a new key for this step. The chat uses the same Anthropic key the summary uses,
which you set up in prompt 6.

Each question costs real money, but very little: well under a cent for a short note, and a few
cents for a 1 hour meeting. Follow-up questions about the same note cost less again, because Gyan
only pays full price for reading the note the first time.

## Part A: Things you must do first

1. **Send the new database file.** In the gyan folder, run:

   ```
   supabase db push
   ```

   It lists 1 new file (`..._side_chat.sql`) and asks to continue. Type `y`. It adds 1 column to
   the plans table, 4 new server functions, and makes your chat more private than before. **It
   deletes nothing.**
2. **Put the new function on Supabase.** Run:

   ```
   supabase functions deploy chat
   ```

   Nothing else needs deploying again. The transcript and summary functions are unchanged.
3. **Check your key is still there** (it should be, from prompt 6). Run `supabase secrets list`.
   You should see `ANTHROPIC_API_KEY` in the list.
4. **Restart the app.** Click the terminal that runs the app, press Ctrl+C, then run
   `npx expo start --web`. Open http://localhost:8081 and log in with a fake test account.
5. **Have a Ready note to hand.** Any note from prompt 6 will do, as long as its label says
   **Ready** and the Transcript tab has lines in it.

## Part B: Asking your first question

1. Open a **Ready** note. Next to the Summary and Transcript tabs there is now an **Ask** button.
2. Tap **Ask**. On a wide window the chat slides in from the right. On a narrow window it slides up
   from the bottom.
3. You should see 3 suggested questions: **What were the decisions?**, **What did I promise to
   do?**, and **What is still open?**
4. Tap **What were the decisions?**
5. Watch for the waiting message, *"Gyan is reading your note…"*. The answer usually arrives in
   under 10 seconds.
6. Check the answer:
   - It says something that really was said in **your** note.
   - It has 1 or more **small round numbers** in it.
   - It is short. It does not ramble.
7. Type a question of your own in the box, for example *"What did Priya say about Friday?"*, and
   tap **Send**. Use a name that really is in your test recording.

## Part C: The little numbers really work

1. In an answer, tap one of the small round numbers.
2. Three things should happen at once: the chat closes, the **Transcript** tab opens, and **one
   line is outlined in blue**.
3. Read that line. It should be the line the answer came from. This is the most important check in
   this whole step: if the number points at the wrong line, tell me.
4. Tap **Ask** again, then tap a **different** number. The blue outline should move to that line.
5. Tap the **Summary** tab and then the **Transcript** tab again. The blue outline should be gone.

## Part D: It must never make things up

1. Tap **Ask** and ask something your note definitely does not cover, for example
   *"What is the budget for next year?"* or *"Who won the football?"*
2. The answer **must** say *"I could not find that in your notes."* and then suggest a better
   question.
3. It must **not** invent an answer, and it must **not** tell you a fact from the outside world.
4. That answer should have **no** round numbers in it, because it came from nothing in the note.

## Part E: Your chat is saved, and it is yours alone

1. With a conversation on screen, press the browser **refresh** button (or close the app and open
   it again).
2. Open the same note and tap **Ask**. Your questions and answers should all still be there.
3. Open a **different** note and tap **Ask**. That note should have its own **empty** chat. Each
   note has its own conversation.
4. In the Supabase dashboard for the TEST project, open **Table Editor**:
   - **chat_threads**: 1 row per note you have chatted about, with your user id on it.
   - **chat_messages**: 2 rows per question (1 `user`, 1 `assistant`). The assistant rows have a
     `sources` column holding the numbers and the lines they point at.
   - **ai_usage**: 1 new row per question, with `kind = chat`, `provider = anthropic`, the tokens
     in `units`, and the money in `cost`.

## Part F: The daily limit

1. In the Supabase dashboard, open **Table Editor**, then the **plans** table.
2. Find the **Free** row. There is a new column, **chat_messages_per_day**. It starts at **20**.
3. Change it to **1** and save.
4. In the app, ask 1 question about any note. It should work as normal.
5. Ask a **second** question. Instead of an answer you should see:
   *"You have used all your questions for today. You get a new set tomorrow."*
   The question box disappears, so there is nothing to press.
6. **Put the number back to 20** and save. Reload the app. You should be able to ask again.
7. Set it to **4**, reload, and ask 1 question. Under the Send button you should now see a quiet
   line saying how many questions are left today. Put it back to **20** when you are done.

## Part G: Notes you pasted, not recorded

A note you pasted in (or uploaded as a .txt or .md file) has no recording, so nobody spoke it and
it has no speakers and no times. It can still be asked about.

1. Open a note whose words you **pasted**. Its title may say *Pasted text* if you did not name it.
2. Tap the **Transcript** tab. Its words should be listed as **Paragraph 1**, **Paragraph 2**, and
   so on. No speaker names, no times, because there was no recording.
3. Tap **Ask**. The button must **not** be greyed out.
4. Ask something the pasted words really cover.
5. Tap one of the small numbers in the answer. It should jump to the right **paragraph** and
   outline it in blue, exactly like a recording jumps to a line.

## Part H: The help entry, and the automatic checks

1. Open a note, tap **Ask**, then tap the round **?** button in the top of the chat panel.
2. The help should explain, in short plain sentences: what you can ask, what the little numbers
   mean, why it sometimes says it could not find something, how many questions you get a day, and
   that only you can see your chat.
3. Scroll to the pictures. There should be 6 screenshots: the chat with a conversation, the chat
   with its suggested questions, and a highlighted transcript line, each at phone size and web
   size. **They all use fake names only.**
4. Make the window narrow (under 768 pixels wide). The chat should slide up from the bottom instead
   of in from the side.
5. Run `npm run check`. This runs the type check and every unit test. Everything should pass.
6. Run `npm run e2e`. This drives a real browser through login, Home, New note, Transcript, Summary
   and now the chat. It uses fake data and never calls a paid service, so it costs nothing.
7. If you want the help screenshots made again, run `npm run e2e:shots`.

## If something does not work

- **The Ask button is greyed out.** The note has no words yet. Wait for it to say **Ready**. If it
  is a pasted note and the Transcript tab says *No words*, the pasted text was empty.
- **Every question says Gyan has not been set up.** The key is missing. Run `supabase secrets list`
  and check `ANTHROPIC_API_KEY` is there. If not, do Part A of `docs/testing/prompt-6.md`.
- **Every question fails with a problem and a Retry button.** The `chat` function probably is not
  deployed. Run `supabase functions deploy chat` again.
- **A question says the note is too long.** Tell me. No normal meeting should ever be too long, so
  if you see this I want to know what the note was. Nothing was cut off: Gyan stopped instead.
- **Retry does not use up another question**, so you can press it safely.

## Known gaps (on purpose, for later)

- **The free-plan check needs the Free plan back at 5 meetings a month.** It is at 3 in the test
  project right now, left over from an earlier test, so 2 of the automatic checks fail until you
  put it back. See "Before you run npm run check" below.
- **The chat only reads 1 note at a time.** Asking across all your notes at once needs the search
  pieces (`chunks`) and an embedding model, which is still an open decision. The Search screen will
  bring both.
- **The answer appears all at once**, not word by word. You chose this: it is simpler and more
  reliable. Expect a 5 to 10 second wait with a quiet waiting message.
- **No translate button on a chat answer yet.** Answers come in your preferred language, but the
  "Translate this answer" button is a later step.
- **Mind map** is still not built. Summary and Transcript are still the only 2 tabs.
- **The browser scripts fake the server.** They prove the screens behave, not that the real AI
  works. That is what Parts B to F above are for.
- **The free-plan privacy test** expects the Free plan to be 5 meetings a month **and** a chat limit
  above 0. If you leave the chat limit at 1 after Part F step 3, put it back to 20, or
  `npm run check` will tell you to.

## Before you run npm run check

Two automatic checks read the real test project and expect the **Free** plan to be **5 meetings a
month**. Right now it is **3**, left over from testing the limit in an earlier step. In the Supabase
dashboard, open **Table Editor**, then **plans**, and set the Free row's `meetings_per_month` back
to **5**. Then `npm run check` passes.

If something does not match, tell me the Part letter and the step number and I will fix it.
