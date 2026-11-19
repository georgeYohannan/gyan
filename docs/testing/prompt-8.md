# How to test languages and translating (prompt 8)

Use the Supabase TEST project and fake recordings only. No real customer calls.
You do **not** need a new key for this step. Translating uses the same Anthropic key the summary
and the chat use, which you set up in prompt 6.

Translating costs real money, but very little. Translating a summary costs about a cent.
Translating a whole transcript costs more, because there are far more words: roughly 10 to 15 cents
for a half hour recording. Every translation is **bought once and then kept for good**, so asking
for the same language a second time is instant and free.

## Part A: Things you must do first

1. **Send the new database file.** In the gyan folder, run:

   ```
   supabase db push
   ```

   It lists 1 new file (`..._translation.sql`) and asks to continue. Type `y`. It adds 2 new server
   functions and nothing else. **It deletes nothing, and it changes no existing rule.**
2. **Put the new function on Supabase.** Run:

   ```
   supabase functions deploy translate
   ```

   Nothing else needs deploying again. The transcript, summary and chat functions are unchanged.
3. **Check your key is still there** (it should be, from prompt 6). Run `supabase secrets list`.
   You should see `ANTHROPIC_API_KEY` in the list.
4. **Restart the app.** Click the terminal that runs the app, press Ctrl+C, then run
   `npx expo start --web`. Open http://localhost:8081 and log in with a fake test account.
5. **Have a Ready note to hand.** Any note from prompt 6 or 7 will do, as long as its label says
   **Ready** and the Summary tab has a summary in it.

## Part B: Choosing your language

1. On **Home**, scroll to the bottom. There is a box called **Your account**. It shows your email,
   then **Your language**, then a **Change language** button. This is the main place to set it.
2. Tap **Change language**. A list slides in from the right on a wide window, or up from the
   bottom on a narrow one. Each language shows **its own name first**, in its own letters, then its
   English name underneath.
3. Tap **Español**. The box should say **Spanish** straight away.
4. **Refresh the page** (F5, or Cmd+R). It should still say **Spanish**. That proves it was really
   saved, not just remembered on screen.
5. Open the Supabase dashboard, go to **Table Editor**, then **profiles**, and find your row. The
   `preferred_language` column should say `es`.
6. Open any note. There is also a **Language: Spanish** button next to the tabs, which opens the
   same list. Either place works; the one on Home is the one to remember.
7. Put it back to **English** before the next part, so the rest of the test reads easily.

## Part C: What your language actually changes

1. With your language set to **Spanish**, open a Ready note and tap **Ask**.
2. Ask any question, for example *"What were the decisions?"*
3. **The answer should come back in Spanish**, even though you asked in English. That is the point:
   Gyan writes in your language unless you ask it for another one.
4. In the same chat, ask *"Answer me in English please"*. The next answer should be in English.
   Your setting is a default, not a cage.
5. Set your language back to **English** before Part D.

   > Note: a summary that was already written stays in the language it was written in. Your
   > language is used for **new** summaries. To see that, tap **Regenerate** on the Summary tab
   > with your language set to Spanish, and wait for the new summary.

## Part D: Translating a summary

1. Open a **Ready** note on the **Summary** tab. Tap **Translate**.
2. The heading says **Translate this summary**. Tap **Español**.
3. After a few seconds the whole Summary tab should be in Spanish: the overview, the key points,
   the decisions, the open questions, and the to-do list.
   - **Read it properly.** Ordinary words must all be in Spanish, including technical and business
     ones. If you see English words sitting in the middle of a Spanish sentence, something that is
     not a name has been left behind, and I want to know.
4. Above it there is a bar that says **Spanish · Translated by AI**. That label must be on every
   translated text. If you ever see translated words without it, tell me.
5. Check these things carefully:
   - The **names** are unchanged. Priya is still Priya, not "Priya" translated.
   - **Product names** are unchanged. React, TypeScript, Slack, Zoom and your own product's name
     should all still be in English. Those are names, not words.
   - **Ordinary words are translated**, even the technical ones. Things like "ledger",
     "chain of custody", "workpapers", "frontend" or "forensic accountant" should be in the new
     language, not left in English.
   - The **numbers**, **dates** and **times** are unchanged.
   - The **tick boxes still work**. Tick a translated to-do, refresh, and it should still be ticked.
   - The **Copy** button copies the Spanish, not the English.

## Part E: Show original

1. With the Spanish summary on screen, tap **Show original**.
2. The English words come straight back, and the bar now says
   **Spanish translation ready · showing the original**.
3. Tap **Show translation**. The Spanish comes back. No waiting, and nothing new is paid for.

## Part F: Translating a transcript, in all 5 languages

1. Open the **Transcript** tab of a Ready note. Tap **Translate**.
2. Translate it into **Spanish**. Every line should be translated.
3. Check that the **speaker names** (Speaker 1, Speaker 2) and the **times** (0:04, 1:05) have
   **not** changed. Only the words people said should change.
4. Now do the same for **हिन्दी (Hindi)**, **Français (French)**, **العربية (Arabic)** and
   **日本語 (Japanese)**, one at a time.
5. For each one, check:
   - Every letter shows properly. **No empty boxes** and no question marks.
   - **Arabic sits on the right of each panel and reads right to left.** The speaker name and the
     time stay on the left, in English, which is what we want.
   - Japanese and Chinese letters look slightly different from the rest of Gyan. That is on
     purpose, and it is explained under "Known gaps" below.

## Part G: It is only ever bought once

1. Open a note's Summary tab and translate it into **Spanish**. Note how long it takes.
2. Tap **Translate** again and pick **Español** again. **It should appear instantly**, with no
   waiting at all.
3. Open the Supabase dashboard, **Table Editor**, then **ai_usage**. Sort by `created_at`, newest
   first.
4. There should be **exactly one** row with `kind` = `translation` for that note and language, not
   two. If there are two, tell me: that is the whole point of this step.
5. While you are there, open **translations**. You should see one row per note, kind and language,
   with the translated words in `content`.
6. Try the same with the **Transcript** tab. One row, one charge.

## Part H: A note you translated before this change

Translations made before today were done under looser rules and left too many English words in.
They are saved, and a saved translation is normally never made again.

1. Open a note you had already translated and translate it into the same language again.
2. It should take a few seconds, **not** come back instantly: Gyan noticed the saved words were
   made by the old rules and made them again properly.
3. Check **ai_usage**. There is one new row for that one re-translation. That is the one-off cost
   of the fix. From now on that note is instant and free again.
4. You do **not** have to delete anything by hand. This happens by itself, and only once.

## Part I: Picking the language the note is already in

1. On an English note's Summary tab, tap **Translate** and pick **English**.
2. Gyan should say *"This note is already in that language, so there is nothing to translate."*
3. Check **ai_usage** again. **No new row.** Nothing was paid for.

## Part J: The help entry, and the automatic checks

1. Tap **Translate** to open the language list, then tap the **?** button in its corner.
2. The help panel opens on **Languages and translating**. Read it: it should explain the label, the
   Show original button, and that asking again costs nothing.
3. Count the pictures. There should be **6**: the language list, a translated summary and the Show
   original view, each at phone size and at wide size.
4. Narrow your browser window to under 768 points wide. The language list should now slide up from
   the bottom instead of in from the right.
5. In the terminal, run these three and check they all pass:

   ```
   npm run check
   npm run e2e
   npm run e2e:shots
   ```

## If something does not work

- **The Translate button is grey and will not press.** The tab has nothing to translate yet. The
  Summary tab needs a summary; the Transcript tab needs lines. Wait for the note to say **Ready**.
- **"Gyan cannot translate yet, because it has not been set up to."** The key is missing on the
  server. Run `supabase secrets list` and check `ANTHROPIC_API_KEY` is there.
- **"This note is too long to translate in one go."** The recording is longer than the limit. The
  summary still translates. See "Known gaps" below; the limit is one number in one file and I can
  raise it.
- **Nothing happens when you pick a language.** Open the browser's developer tools (F12), look at
  the **Console** tab, and tell me what it says in red.
- **You see empty boxes instead of letters.** Tell me which language. It means a font did not load.
- **The second request is not instant.** Check in **Table Editor** that a row really appeared in
  **translations**. If it did not, the save step failed; tell me and I will look.

## Known gaps (on purpose, for later)

- **Long recordings cannot have their transcript translated yet.** It is capped at about 30 minutes
  of talking, because one Supabase server call is stopped after 150 seconds and a long translation
  is a long answer. **Hindi, Arabic and Japanese need more room than English**, so the real cut-off
  is lower for those than for French or Spanish. The fix, when you want it, is to cut the
  transcript into pieces and translate them at the same time. That is a change to one file.
- **Japanese, Chinese and Korean use your device's own font**, not ours. Their font files are about
  17 MB each, far too big to ship inside the app for one language. The words are correct and
  readable, they just look a little different from the rest of Gyan. Arabic and Hindi **do** use
  our own font family, so they match.
- **Arabic turns only the translated words around**, not the whole app. The buttons, tabs and
  headings stay in English and stay on the left. A full right-to-left app is a bigger piece of work
  and is not in version 1.
- **There is no limit on how many translations you can ask for.** Each one is bought once, so the
  worst case for one long note in all 16 languages is a couple of dollars. If you want a limit, say
  the word: it would be one new column on the plans table, like the daily chat limit.
- **No Translate button on a chat answer yet.** Answers already come in your preferred language,
  which closes most of the gap. A button to translate one answer afterwards is a later step.
- **The language setting lives in the Your account box on Home for now.** It moves to the proper
  Settings screen in prompt 10, along with your name and deleting your account. The button on the
  note page stays, because it is handy there.
- **A summary that is already written does not change language by itself.** Your setting is used
  for new summaries. Tap **Regenerate** to rewrite one in your language, or use **Translate**,
  which is cheaper and keeps the English too.
- **The browser scripts fake the server.** They prove the screens behave, not that the real AI
  translates well. That is what Parts B to H above are for.

## Before you run npm run check

Two automatic checks read the real test project and expect the **Free** plan to be **5 meetings a
month**. If an earlier test left it at **3**, open the Supabase dashboard, go to **Table Editor**,
then **plans**, and set the Free row's `meetings_per_month` back to **5**.

If something does not match, tell me the Part letter and the step number and I will fix it.
