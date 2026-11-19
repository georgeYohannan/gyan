# How to test recap emails (prompt 9)

Use the Supabase TEST project and fake recordings only. No real customer calls.

Recaps are sent **through your own Hostinger mailbox**, gyan@gyantechai.com. Gyan signs in to it
and posts the message, exactly as a mail program on your computer would. A reply comes back to
the same mailbox. Your own **hello@gyantechai.com** is never used by the app, so app email and
your own conversations stay apart.

**While you are testing, only send emails to addresses you own.**

What this costs: nothing to send. Hostinger allows **1,000 emails a day** on Business Starter and
3,000 on Business Premium, counted per mailbox over a rolling 24 hours. The only money is
translation: when somebody on the account reads a language nobody has translated this note into
yet, Gyan buys that translation for about a cent, and then keeps it for good.

---

## Part A: Things you must do first

Work through these in order. Steps 1 to 6 are one-offs.

1. **Check the mailbox exists and works.** In Hostinger's hPanel, open **Emails** and check
   that **gyan@gyantechai.com** is there. From any other email account, send it a short message
   and check it arrives. Gyan sends *as* this mailbox and replies come back *to* it, so both
   halves need to work.

   **There is no DNS work to do, and nothing to change.** Your domain already tells the world
   that Hostinger may send for it (the SPF record saying `include:_spf.mail.hostinger.com`), and
   Hostinger already signs its mail with its own key. Sending this way uses records that have
   been there all along.

2. **Have the mailbox password to hand.** It is the password you set when you made
   gyan@gyantechai.com. If you do not know it, reset it in hPanel under **Emails**.

3. **Put the password in your own file.** Open `.env.local` in the gyan folder and add this
   line, with the real password after the `=`:

   ```
   EXPO_SMTP_PASSWORD=the_mailbox_password
   ```

   `.env.local` is never committed, so it never leaves your computer.
   **Never paste the password into a chat, a document, or a screenshot.** If the password has a
   `#` or a space in it, put it in quotes: `EXPO_SMTP_PASSWORD="the password"`.

   > **This step on its own does nothing.** `.env.local` is a file on your computer. Supabase's
   > servers cannot read it, and the app never reads it either. It is only a convenient place to
   > keep the password so that step 4 can copy it across. **If you stop here, sending will fail
   > with "the email mailbox is not set up on the server."** Step 4 is the one that counts.

4. **Put the password on the server.** In the gyan folder, run this as one line:

   ```
   grep -q '^EXPO_SMTP_PASSWORD=.' .env.local && supabase secrets set SMTP_PASSWORD="$(grep '^EXPO_SMTP_PASSWORD=' .env.local | cut -d= -f2- | sed 's/^\"//; s/\"$//')" || echo 'STOP: .env.local has no EXPO_SMTP_PASSWORD= line with a value. Do step 3 first.'
   ```

   The `grep` at the front is there on purpose. Without it, if step 3 was missed, the command
   sets the password to **nothing at all** and says it worked. `supabase secrets list` would
   then show the name `SMTP_PASSWORD` as if everything were fine, and sending would still fail.

   Check it with `supabase secrets list`. You should see the name `SMTP_PASSWORD` in the list.
   The value shown next to it is a scramble, not the password; you will never see the real one.
   **If `SMTP_PASSWORD` is not in that list, the password has not reached the server**, whatever
   `.env.local` says, and sending will fail.

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

7. **Put the functions on Supabase.** Three, in this order. The first will take a little longer
   than you are used to, because it downloads the small piece of code that talks to mail servers:

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
   - come from **gyan**, at gyan@gyantechai.com;
   - have the subject **Recap: <your note's title>**;
   - show the title, the date, the overview, the key points, the decisions and the action items;
   - have a blue **Open this note in gyan** button;
   - have a footer saying why you got it, a **Turn off recaps** link, and that a reply reaches
     gyan@gyantechai.com.
9. **Press Reply** (do not send it). It should be addressed to gyan@gyantechai.com, and that
   reply should land in the gyan@gyantechai.com inbox on Hostinger. Your own hello@ inbox is
   never used by the app.
10. **Tap Turn off recaps** in the email. It should open the Recap emails page in the app.
11. **Tap Open this note in gyan.** It should open that note.
12. **Check the sent copy.** Open gyan@gyantechai.com in Hostinger's webmail and look in
    **Sent**. Because Gyan posts through the real mailbox, the recap should be sitting there, the
    same as if you had sent it by hand. That is a useful habit: it is the quickest way to see
    what actually went out.

> If the email has not arrived after a few minutes, look in your spam folder first, then in the
> **Sent** folder of gyan@gyantechai.com. If it is in Sent, Hostinger accepted it and the delay
> is at the other end. If it is not, look at `email_log` in Supabase: every attempt is there,
> with the reason when one fails.

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

**"Gyan cannot send emails yet. The email mailbox is not set up on the server."**
The password has not reached the server. Everything else is working: the note, the account and
the list of people were all read properly, or you would have seen a different message. Run
`supabase secrets list`. If `SMTP_PASSWORD` is missing, do Part A steps 2 to 4. If it is listed
but sending still fails, it was almost certainly set to an empty value, so run the Part A step 4
command again now that `.env.local` really has the password in it.

**"Gyan could not sign in to its own email mailbox, so nothing was sent."**
The password reached the server but Hostinger refused it. Check you can sign in to
gyan@gyantechai.com at Hostinger's webmail with that exact password, then do Part A step 4
again. A password with a space or a `#` in it needs the quotes shown in step 3.

**"Gyan could not reach the mail service. Please try again later."**
This is the one to tell me about. It means the message never got to Hostinger at all, and the
likeliest cause is that Supabase has closed the mail port this uses. Hostinger offers two ports
and Supabase blocks the other one, so there is no second port to try: the fix would be to send
through an email service over the web instead. Check `email_log` in Supabase; if every row says
`failed` with this reason, that is what has happened.

**"The mailbox has sent as much as it is allowed to today."**
Hostinger's daily limit for that mailbox. It clears on a rolling 24 hours.

**"Gyan could not work out who would get this recap."**
The `recap` function is not deployed, or the app cannot reach it. Run
`supabase functions deploy recap`.

**"Something went wrong sending the recap."**
The database file has not been sent. Run `supabase db push`.


1. **A wrong password.** In `.env.local`, change `EXPO_SMTP_PASSWORD` to `not-the-real-one`,
   run the `supabase secrets set` line from Part A step 4 again, then try to send a recap.
   - You should see **"Gyan could not sign in to its own email mailbox"**, not a crash.
   - `email_log` should get a row with `result` = `failed` and that reason.
   - Put the real password back and run the `supabase secrets set` line again.
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
`rua=mailto:gyan@gyantechai.com` to it would start sending you weekly reports about who is
sending email as your domain. It is not required and nothing here depends on it. It means
**changing an existing DNS record**, so I have not touched it. Say the word if you want it.

There are also three DNS records left over from when this was going to use Resend, on
`send.gyantechai.com` and `resend._domainkey.gyantechai.com`. Nothing uses them now. They are
harmless and I have **not** removed them, because removing a DNS record is your call, not mine.
Leaving them costs nothing, and they would be needed again if we ever switch.
