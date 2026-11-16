# How to test adding notes and the Home list (prompt 4)

Everything here uses the Supabase TEST project and fake data. Never use a real meeting recording.

## Part A: Things you must do first

1. The new database file is already pushed to the test project. To double check, open the Supabase dashboard > **Storage**. You should see a bucket called **notes-files** with a "Private" label.
2. Stop the app if it is running (click the terminal and press Ctrl+C). Start it again with `npx expo start --web`. The old copy can show a "Requiring unknown module" error after new screens were added. A fresh start fixes it.
3. Open http://localhost:8081 in Chrome and log in with a fake test account.
4. Make a folder on your computer called **gyan-test-files** and put these fake files in it:
   - A short audio file, such as an MP3 or M4A, under 5 MB. (Record a voice memo of yourself reading 2 sentences.)
   - A short video file (MP4 or MOV), under 50 MB. A 10 second phone clip is fine.
   - A video file bigger than 50 MB (any long clip). This checks that the video shrinks. You can skip this one if you have none.
   - A small text file (`.txt`) with a few fake sentences.
   - A file that should be refused, such as any picture (`.png` or `.jpg`) or a PDF.
5. Know what "fake" means here: no real names, no real customer calls, no passwords in any file.

## Part B: Look at Home and New note

1. On **Home** you should see the title, a round **?** button, a box that says "Meetings used this month: 0 of 5", a blue **New note** button, and a list or the words "No notes yet".
2. Click **?**. A help panel opens with words (what each status means, what the monthly limit means) and a screenshot. Close it.
3. Click **New note**. You should see 4 cards: **Record** and **Meeting link** are dimmed with a "Coming soon" label. **Upload** and **Paste text** are bright.
4. Click **?** again. The help should talk about file types and the 50 MB size. Close it.

## Part C: Upload

1. On New note, click **Upload**, then **Choose a file**. Pick your short audio file.
2. You should see a progress bar and the word "Uploading". Then you land on Home.
3. The new note is first in the list with the **Queued** badge, today's date, and "Upload" as its source.
4. In the Supabase dashboard open **Storage > notes-files**. You should see a folder named with a long id. Inside it is another folder, and inside that your file.
5. In **Table Editor > meetings**, find the row. **source** is `upload`, **status** is `queued`, and **file_path** is filled in.
6. Repeat with the short video. In Storage the file should end in `.mp3`. That is the sound taken out of the video. It should be much smaller than your video.
7. Repeat with the over 50 MB video if you have one. It should still upload, as a small MP3. (On the web only. On a phone, a video bigger than 50 MB is refused for now. That is a known gap.)
8. Repeat with the `.txt` file. It lands in the list with the source "Pasted text".

## Part D: Paste text

1. Click **New note > Paste text**. Click **Add note** without typing. You should see "Paste or type some text first."
2. Type a title and a few fake sentences. Click **Add note**.
3. The note appears in the list with source **Pasted text** and **Queued**.
4. Pasted text never uses up one of your meetings. The box at the top should still say the same number.

## Part E: Things that go wrong on purpose

1. **Wrong file type:** Upload the picture. You should see "Gyan cannot use that kind of file." There is no Retry button, and nothing new appears in the list.
2. **Upload fails:** Start an upload. While it is working, turn your Wi-Fi off. You should see "The upload did not finish. Check your internet and try again." and a **Retry** button. The note in the list may show **Failed**. Turn Wi-Fi on and click **Retry**. The note should become **Queued**, and there should be only one row for it, not two.

## Part F: The monthly limit (no code change needed)

The limit is read from the database, not from the code.

1. In the dashboard open **Table Editor > plans**. The **Free** row has **meetings_per_month** = 5.
2. Change it to **3**. Save.
3. Reload Home. It should now say "Meetings used this month: 0 of 3". You did not change any code.
4. To see the block, make the account "full". Open **Table Editor > usage** and click **Insert row**. Put your test account's id in **account_id** (find it in the **accounts** table), the first day of this month in **month** (for example `2026-11-01`), and `3` in **meetings_used**. Save.
5. Reload Home. You should see a friendly message: "You have used all your meetings for this month." Open **New note**. **Upload** shows "Limit reached" and is off. **Paste text** still works, because pasted text does not count.
6. **Put things back:** set **meetings_per_month** back to **5**, and change the **usage** row to `meetings_used` = 0. The automatic privacy test expects the Free limit to be 5, so it will fail until you do this.

## Part G: Privacy between 2 people

1. Log out. Log in as the second fake test user.
2. Home should NOT show any notes from the first user.
3. In the dashboard, **Storage > notes-files** shows folders for both accounts. (The dashboard sees everything because you are the owner. The app does not.)
4. The automatic test `__tests__/notes-storage-test.ts` tries to read, download, change, and add files in the other person's folder. It should say all 9 tests passed.

## Part H: Automatic tests

1. Run `npm run check`. It runs the type check and every test. It should end with all tests passed.
2. If you skipped adding test users to `.env.local` (see prompt 3), the real-database tests are skipped and say so.

## Known gaps (on purpose, for later)

- **Phones:** taking sound out of a video is only built for the web. On a phone, a video up to 50 MB uploads as it is. A bigger video is refused with a friendly message. This needs a native library and a development build.
- **Phone progress bar:** on a phone the bar shows "Uploading" without a live percentage. On the web it shows the percentage.
- The notes stay **Queued**. Nothing reads them yet. Transcripts come in a later step.
- Test runs leave notes titled "[test] ..." in the first test account. They are harmless. Ask me and I will clear them for you.
