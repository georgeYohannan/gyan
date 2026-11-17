# How to test the transcript (prompt 5)

Use the Supabase TEST project and fake recordings only. No real customer calls. Never paste your Deepgram key into chat.

## Part A: Things you must do first

1. **Check the Supabase tool.** In the Terminal, in the gyan folder, run `supabase --version`. It should show a number (it showed 2.109.1 here).
2. **Link to the TEST project** (skip if you already did this). Run `supabase login`, then `supabase link --project-ref ofnspnobzesxmyqjxzad`. If it asks for the database password, use the one you made for the test project.
3. **Send the new database file.** Run `supabase db push`. It lists 1 new file (`..._transcription.sql`) and asks to continue. Type `y`. It only adds 3 functions. It deletes nothing.
4. **Save the Deepgram key as a server secret.** Run this exact line (it reads the key from your `.env.local`, so you never type or paste the key):

   ```
   supabase secrets set DEEPGRAM_API_KEY="$(grep '^EXPO_DEEPGRAM_KEY=' .env.local | cut -d= -f2-)"
   ```

   It should say the secret was set. Check with `supabase secrets list`. You should see the name `DEEPGRAM_API_KEY` and a scrambled value. You will not see the real key.
5. **Put the function on Supabase.** Run `supabase functions deploy transcribe`. If it says Docker is not running, that is fine as long as it finishes with "Deployed".
6. **Restart the app.** Click the terminal that runs the app, press Ctrl+C, then run `npx expo start --web`. Open http://localhost:8081 and log in with a fake test account.
7. **Make 3 test recordings** in a folder called **gyan-test-files**:
   - **Short (do this one first):** 20 to 30 seconds, 2 different voices taking turns, like 2 friends saying 3 or 4 sentences each. A voice memo on your phone is fine. This costs less than half a cent, so the free credit lasts.
   - **Long:** about 2 minutes, 2 people talking in turns. Use only after the short one works.
   - **Broken:** make a small text file and rename it `broken.mp3`. It is not real audio.

## Part B: The short recording

1. On **Home**, click **New note > Upload**, then choose the 20 to 30 second file.
2. You land on Home. The note shows **Queued**, then (after a few seconds) **Transcribing**. Reload Home if you do not see it change.
3. Click the note. You should see its title, the status label, a **?** button, and a **Transcript** tab.
4. While it says **Transcribing**, the page says "No transcript yet" and updates by itself. Wait for **Ready**. (A short file takes a few seconds.)
5. You should see lines with **Speaker 1** and **Speaker 2**, a time like `0:07` on each, and the words. Check that:
   - 2 different speakers show up (not just 1).
   - The times go up, starting near `0:00`.
   - The words match what was said. (The speaker can be wrong sometimes. That is explained in the help.)
6. Go back to Home. The box should say one more meeting is used (for example "1 of 5").

## Part C: What to see in the Supabase dashboard

1. **Table Editor > meetings:** your note has **status** = `ready`, **spoken_language** = `en` (or the language you spoke), and **duration_seconds** close to the length of your recording.
2. **Table Editor > transcript_segments:** several rows for your note. Each has **speaker_label** (`Speaker 1`, `Speaker 2`), **start_ms**, **end_ms** (in thousandths of a second, so 7000 means 7 seconds), and **text**.
3. **Table Editor > usage:** the row for your account and this month has **meetings_used** up by exactly 1.
4. **Table Editor > ai_usage:** a new row with **kind** = `transcription`, **provider** = `deepgram`, **units** = the audio length in seconds, and **cost** = a tiny number (about 0.0052 dollars per minute, so a 2 minute file is about 0.0104).
5. **Edge Functions > transcribe > Logs:** requests show a 202 answer. There should be no red errors. The log never shows your key.

## Part D: The 2 minute recording

1. Upload the 2 minute file the same way.
2. It should go **Queued > Transcribing > Ready**. This takes about 5 to 20 seconds.
3. The Transcript tab shows 2 different speakers with sensible times (the last line starts a little before 2:00).
4. **usage** goes up by 1 again, and there is a second **ai_usage** row.

## Part E: The broken file

1. Upload `broken.mp3`.
2. The note should end as **Failed**. Click it. You should see a red message like "We could not read this audio file..." and the words "This note did not use up one of your meetings."
3. In the dashboard: **usage** did NOT go up, and there is NO new **ai_usage** row for this note. **meetings.error_message** holds the same plain message.
4. Click **Retry**. It tries once more and fails again with the same message. That is correct, because the file is still broken.

## Part F: Help

1. On the note page click **?**. A help panel opens with words about the statuses, what the speaker labels mean, why speakers can be wrong, and what to do if a note is Failed. It also has 4 screenshots (phone and web, Ready and Failed). The screenshots use fake data.
2. Close it with the close button or the Escape key.

## Part G: Safety checks

1. Log in as the **second** fake test user. Home must not show the first user's notes. If you open the first note's address by hand, it says "Note not found".
2. Search your project for your Deepgram key: it must not be in any file that goes to GitHub. (`.env.local` is never committed.)
3. Run `npm run check`. All tests should pass.

## Known gaps (on purpose)

- **Privacy test and the Free limit:** the automatic privacy test (`supabase-rls-test`) expects the Free plan to be 5 meetings a month. If you left it at 3 after the prompt 4 test, 2 tests fail. Set it back to 5 in **Table Editor > plans**.
- **Very long recordings:** Supabase's free plan lets a server function run for 150 seconds. A recording over roughly an hour may not finish and would end as Failed. A later step can fix this.
- **A note stuck on Transcribing:** if the server stopped halfway (for example, it timed out), the note can stay on Transcribing. Tell me and I will add an automatic rescue.
- **Summary, mind map, and action items:** the other tabs come in later steps. Right now Ready means "transcript done".
- **Speaker names:** speakers are Speaker 1, Speaker 2. Real names are a later feature.
