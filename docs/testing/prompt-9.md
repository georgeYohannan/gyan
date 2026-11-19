# How to test recap emails (prompt 9)

Use the Supabase TEST project and fake recordings only. No real customer calls.

**While you are testing, only send emails to addresses you own.** Resend also gives you a bin
address, `delivered@resend.dev`, which accepts a message and throws it away.

What this costs: Resend's free plan allows **100 emails a day and 3,000 a month**, so testing is
free. Sending itself costs nothing. The only money is translation: when somebody on the account
reads a language nobody has translated this note into yet, Gyan buys that translation for about a
cent, and then keeps it for good.

---

## Part A: Things you must do first

Work through these in order. Steps 1 to 6 are one-offs.

1. **Check your sending domain is ready.** Open [resend.com](https://resend.com) and go to
   **Domains**. `gyantechai.com` should say **Verified**.

   I checked your live DNS while planning this, and all three records Resend needs are already
   there and correct: an MX record and an SPF record on `send.gyantechai.com`, and a DKIM key on
   `resend._domainkey.gyantechai.com`. **So there is no DNS work to do.** Nothing needs adding,
   changing or deleting.

   Your Hostinger email is not affected by any of them, because they sit at different names.
   Mail to anyone@gyantechai.com still goes to Hostinger exactly as before.

   If it does *not* say Verified, stop and tell me, and I will compare what Resend shows against
   what is really in your DNS. **Do not change a DNS record until we have looked.**

2. **Make a Resend key.** In Resend, go to **API Keys** and click **Create API Key**.
   - Name it something like `gyan test`.
   - Permission: **Sending access** only. It does not need anything else.
   - Copy the key. It starts with `re_`. You will only be shown it once.

3. **Put the key in your own file.** Open `.env.local` in the gyan folder and add this line,
   with your real key after the `=`:

   ```
   EXPO_RESEND_KEY=re_your_key_here
   ```

   `.env.local` is never committed, so the key never leaves your computer.
   **Never paste a key into a chat, a document, or a screenshot.**

4. **Put the key on the server.** In the gyan folder, run:

   ```
   supabase secrets set RESEND_API_KEY="$(grep '^EXPO_RESEND_KEY=' .env.local | cut -d= -f2-)"
   ```

   Check it with `supabase secrets list`. You should see the name `RESEND_API_KEY` and a
   scrambled value. You will never see the real key.

5. **Tell the emails where the app lives**, so the buttons inside them work while you test:

   ```
   supabase secrets set GYAN_APP_URL="http://localhost:8081"
   ```

   When the web app is really published, run this again with its real address.

6. **Send the new database file.** Run:

   ```
   supabase db push
   ```

   It lists 1 new file (`..._recap_email.sql`) and asks to continue. Type `y`. It adds one new
   table (`email_log`), four database functions, and one index. **It deletes nothing, and it
   changes no existing rule.**

7. **Put the functions on Supabase.** Three, in this order:

   ```
   supabase functions deploy recap
   supabase functions deploy summarize
   supabase functions deploy translate
   ```

   All three are needed. `recap` is new. `summarize` changed, because it is what starts the
   automatic send. `translate` changed, so the recap can ask it for a translation.

8. **Restart the app.** Click the terminal that runs the app, press Ctrl+C, then run
   `npx expo start --web`. Open http://localhost:8081 and log in with a fake test account.

9. **Have a Ready note to hand.** Any note from an earlier prompt will do, as long as its label
   says **Ready** and the Summary tab has a summary in it.

---

## Part B: Sending a recap to yourself

1. Open a **Ready** note. Next to the Summary and Transcript tabs there is a new pill,
   **Send recap**. On a phone it may sit on a second line.
2. Tap **Send recap**. A box opens: from the right on a wide window, up from the bottom on a
   phone.
3. Check what it says:
   - Your own email address is listed, with the word **you** under it.
   - It is **ticked**, because the setting starts as "the account owner only".
   - Under the list: *"The ticks come from your recap settings."*
4. Tap the blue **Send recap** button. It must **ask first**: *"Send this recap to 1 person?"*,
   with *"An email cannot be taken back once it has gone."* underneath, and your address listed.
5. Tap **Cancel**. Nothing is sent. Open your inbox and check: nothing arrived.
6. Tap **Send recap** again, then **Send recap** to confirm.
7. You should see **"Recap sent to 1 person."** and, under your address, **"Sent in English"**.
8. **Check your inbox.** The email should:
   - come from **gyan**, at hello@gyantechai.com;
   - have the subject **Recap: <your note's title>**;
   - show the title, the date, the overview, the key points, the decisions and the action items;
   - have a blue **Open this note in gyan** button;
   - have a footer saying why you got it, a **Turn off recaps** link, and that a reply reaches
     hello@gyantechai.com.
9. **Press Reply** (do not send it). It should be addressed to hello@gyantechai.com.
10. **Tap Turn off recaps** in the email. It should open the Recap emails page in the app.
11. **Tap Open this note in gyan.** It should open that note.

> If the email has not arrived after a few minutes, look in your spam folder first, then in
> Resend under **Emails**, which shows every message and what happened to it.

---

## Part C: Changing who gets a recap

1. On **Home**, scroll to the bottom. The **Your account** box now has a row saying
   **The account owner only**, with a **Recap emails** button. Tap it.
2. The page opens with one sentence saying what is set right now:
   *"Recaps go to the account owner only, only when somebody presses Send recap on a note."*
3. Turn **Everyone on the team** on. Watch the sentence change as you do it, and a small
   **Saved** appear.
4. Tap **‹ Home**. The row now says **The account owner and the team**.
5. Go back into **Recap emails** and turn **Everyone on the team** off again.
6. Refresh the page in the browser. The switches must come back the way you left them.

---

## Part D: The automatic send

1. In **Recap emails**, turn **Send on its own when a note is ready** on. The sentence should
   end with *"as soon as a note is ready"*.
2. Make a new note (Paste text is the quickest). Wait for it to reach **Ready**.
3. A recap should arrive in your inbox on its own, with nobody pressing anything.
4. Now open that note and tap **Regenerate**, then **Yes, write a new one**. When it is Ready
   again, **no second email should arrive.** A note only ever sends itself once.
5. Turn the switch back off when you are done, so you are not emailed during other testing.

---

## Part E: Another language

This one costs about a cent.

1. On **Home**, in the **Your account** box, tap **Change language** and pick **Spanish**.
2. Open a Ready note and tap **Send recap**. Your row should now say **you, in Spanish**.
3. Send it to yourself.
4. The email should be in Spanish, with **Translated by AI** at the top and, under it,
   *"Spanish. Names, numbers and times are unchanged."*
5. Check that names, numbers, dates and times in it are unchanged.
6. Send the same note again. It should be instant, because that translation is now saved and is
   never bought twice.
7. Put your language back to **English** when you are done.

There is a picture of what a translated recap looks like in
`docs/help/images/recap-email-translated-390.png`, made with fake data.

---

## Part F: Only the account owner can change the settings

You need a **second** fake test account on the same workspace for this. If you do not have one
yet, skip this part and tell me, and we will set one up when the Team screen is built.

1. Log out and log in as the team member.
2. Go to **Home**, then **Recap emails**.
3. They should be able to **see** every setting, so they can tell why they are getting emails.
4. Every switch should be greyed out and should not move when tapped, with the line
   **"Only the account owner can change who gets recap emails."** on screen.
5. They **can** still open a note and press **Send recap**. That is on purpose: sending a recap
   is sharing a note they can already read.

---

## Part G: Every email is written down

1. Open the Supabase dashboard for the **test** project, then **Table editor**.
2. Open the new **email_log** table.
3. There should be one row for every email from Parts B to E. Check:
   - `recipient_email` is your address;
   - `result` says `sent`;
   - `language` matches what you expected, and `translated` is true for the Spanish one;
   - `auto` is true for the one from Part D and false for the ones you pressed Send on;
   - `sent_by` is empty for the automatic one.

---

## Part H: When something goes wrong

1. **A wrong key.** In `.env.local`, change your Resend key to `re_not_a_real_key`, run the
   `supabase secrets set` line from Part A step 4 again, then try to send a recap.
   - You should see a plain message, not a crash.
   - `email_log` should get a row with `result` = `failed` and a reason.
   - Put your real key back and run the `supabase secrets set` line again.
2. **Nobody ticked.** Open Send recap and untick everybody. The **Send recap** button should go
   dim and do nothing.
3. **A note that is not finished.** Open a note that is still Transcribing or Summarizing. The
   **Send recap** pill should be dim.

---

## What is NOT in this step

- Posting a recap to Slack or Teams. That is the other half of this feature and comes later.
- The mind map in the email.
- A real Settings screen. The recap settings sit in their own page for now, reached from the
  Your account box at the bottom of Home. Everything in that box moves to Settings in prompt 10.

## One optional thing, your call

Your domain has a DMARC record set to `v=DMARC1; p=none` with no reporting address. Adding
`rua=mailto:hello@gyantechai.com` to it would start sending you weekly reports about who is
sending email as your domain. It is not required and nothing here depends on it. It means
**changing an existing DNS record**, so I have not touched it. Say the word if you want it.
