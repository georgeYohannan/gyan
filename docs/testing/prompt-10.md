# How to test the Settings area (prompt 10)

Use the Supabase TEST project and fake data only. No real customer calls, and no real person's
email address except your own.

What this costs: **nothing.** Nothing on these screens calls a paid AI service. The only emails
are team invites, which go through the same Hostinger mailbox recaps already use, and Hostinger
allows 1,000 a day.

**One warning before you start.** This step adds two things that delete data for good: deleting
a note, and deleting an account. Neither can be undone and Gyan keeps no copy. Use a throwaway
test account for the deleting parts, never your own.

---

## Part A: Things you must do first

Work through these in order. Steps 1 to 5 are one-offs.

1. **Update the database.** In the gyan folder, run:

   ```
   supabase db push
   ```

   This runs the new file `supabase/migrations/20261119140000_settings_and_team.sql`.

   > **Read this before you run it.** Every other migration in this project only ever adds
   > things. This one changes two rules on purpose, and the file says so at the top:
   >
   > - **A note can now outlive the person who made it.** Before, the database refused to delete
   >   anybody who had ever made a note, which meant "delete my account" could never work. Now,
   >   deleting a person leaves their notes exactly where they are and simply takes their name
   >   off them. Gyan shows "A removed person" in that place. **No note, recording, transcript,
   >   summary or to-do is deleted by this.**
   > - **The app can no longer write invites directly.** It never did, but it was allowed to.
   >   Invites now go through the one door that counts seats and sends the email. **No invite
   >   row is deleted; only the permission changes.**
   >
   > Everything else is an addition: 3 new columns on `plans`, 2 new plan rows, 2 indexes and
   > 15 new database doors.

2. **Deploy the two new server functions.**

   ```
   supabase functions deploy team
   supabase functions deploy account
   ```

   `team` sends the invite email. `account` deletes an account: it sweeps the files out of
   storage, removes the workspace, and removes the login, in that order.

   Also redeploy the one that changed, so its "Turn off recaps" link points at the new address:

   ```
   supabase functions deploy recap
   ```

3. **Check the server secrets are already there.** Both new functions use secrets you set in
   prompt 9. Run `supabase secrets list` and check you can see `SMTP_PASSWORD` and
   `GYAN_APP_URL`. If `GYAN_APP_URL` is missing, set it to where you are testing:

   ```
   supabase secrets set GYAN_APP_URL=http://localhost:8081
   ```

   > Invite links are built from this. If it is wrong, the link in the email goes nowhere.

   **If you are going to open the invite email on your phone, do NOT use `localhost`.**
   `localhost` means "the device I am holding". On your computer that is the computer, and the
   link works. On your phone it is the phone, which is not running Gyan, so the phone says
   **"site can't be reached"**. Nothing is broken: the phone is looking in the wrong place.

   Use your computer's address on your home wifi instead. `npx expo start` prints it, on the
   line that says something like `Metro waiting on exp://192.168.1.23:8081`. Or run
   `ipconfig getifaddr en0`. Then:

   ```
   supabase secrets set GYAN_APP_URL=http://192.168.1.23:8081
   ```

   Both the phone and the computer have to be on the same wifi. This address changes when you
   move to a different network, so re-check it if links stop working.

   **An invite email already sent keeps the old address inside it.** You do not have to waste
   the invite: open the link on your phone and edit the address bar, replacing `localhost`
   with your computer's address. Everything after `/join?token=` stays exactly as it is.

4. **Make yourself an admin, so you can use the test-only plan switch.** In the Supabase
   dashboard, open **SQL Editor** and run this, with your own test address:

   ```sql
   update public.profiles set is_admin = true
   where id = (select id from auth.users where email = 'your-test-address@example.com');
   ```

   > This is on purpose. The plan switch asks the database "is this person a Gyan admin?", and
   > **no migration ever sets that to true**. It can only be turned on by hand, in the dashboard,
   > one project at a time. That is what stops the switch ever working in a real paid project,
   > even though the same files built it.

5. **Turn on the builders' tools in the app.** Open `.env.local` and add this line:

   ```
   EXPO_PUBLIC_GYAN_TEST_TOOLS=1
   ```

   Then stop the app and start it again, because this is read when the app is built:

   ```
   npx expo start --web --clear
   ```

   Open http://localhost:8081.

   > Anything other than exactly `1`, including leaving the line out, hides the switch. That is
   > the safe way round: forgetting hides it rather than showing it.

6. **Have a second test email address to hand.** Any address you own that is not the one you
   signed up with. You will invite it in Part D.

---

## Part B: Finding Settings

1. Look at the bottom of the screen on a phone, or the bar at the top on the web. There are now
   **two** places to go: **Home** and **Settings**. The old **Explore** page is gone; it was a
   leftover demo page from the starter kit and was never in the plan.
2. Tap **Settings**. You should see five rows: **Profile**, **Plan and usage**, **Team**,
   **Recaps**, and **Data and privacy**.
3. Each row says what is set right now underneath its name, for example
   *Free plan. 2 of 5 meetings used this month.* You should be able to answer most questions
   without opening anything.
4. At the bottom, **Signed in** shows your email and a **Log out** button.
5. Tap the **?** at the top right. A panel opens explaining the page, with two pictures. Close it.

> The box at the bottom of Home that used to hold your email, your language and recap emails is
> gone. Everything that was in it is here now.

---

## Part C: Profile

1. Open **Settings > Profile**.
2. **Change your name.** Type a new name in the **Name** box and tap **Save name**. The word
   **Saved** appears under it.
3. **Refresh the page** (F5 on the web). Go back to **Settings**. The Profile row says the new
   name. Open Profile: the box still has it. *This is the thing to check — it has to survive a
   refresh, not just look right.*
4. **Your email** is shown but cannot be changed. That is on purpose: it is how you sign in.
5. **Change your language.** Tap **Change language**, pick **Español**. The row now says
   *Español*. Refresh, and it is still Español. Put it back to English.
6. **The shortcut still works.** Open any note. The language picker is still there too, so you do
   not have to come to Settings for it.
7. **Change your password.**
   - Type a password shorter than 8 characters in both boxes and tap **Change password**. It says
     *Use at least 8 characters.* and nothing is sent.
   - Type two **different** passwords and tap it. It says *Those two passwords are not the same.*
     and nothing is sent.
   - Type the same new password in both boxes and tap it. It says *Your password is changed.* and
     both boxes empty themselves.
   - **Log out, and log back in with the new password.** This is the real check.

---

## Part D: Plan and usage

1. Open **Settings > Plan and usage**.
2. You should see:
   - **Meetings used this month**, as a big number and a bar. On the Free plan the bar is drawn as
     5 blocks, because five is a number you can count. The block you used last is orange.
   - How many are **left**, and that they start again on the 1st.
   - **Chat questions today**, and a line saying this one is yours alone while meetings are shared
     with the whole account.
   - **Your plan**, with a list of what it includes.
   - **Upgrade — coming soon**, greyed out. Paying is not built yet.
3. **Check the numbers are real.** In the Supabase dashboard, open the **plans** table and change
   the Free plan's `meetings_per_month` from 5 to 3. Refresh the page. It now says
   *x of 3*, and the bar has 3 blocks. **Put it back to 5 when you are done.**
4. **Use the test plan switch.** At the bottom there is a panel marked **For builders only**,
   headed *Switch plan, for testing*.
   - Tap **Switch to Pro**. The page reloads and now says **Pro**, with 50 meetings and 200 chat
     questions. The bar has changed to one filling bar, because fifty is not a number anybody
     counts.
   - Tap **Switch to Team**. 200 meetings, 20 seats.
   - Tap **Switch to Free** to go back.
   - A red line says **These numbers are stand-ins** whenever you are on Pro or Team. They are
     placeholders for you to change before launch, in the **plans** table.
5. **Check the switch really is test-only.** Open `.env.local`, change the line to
   `EXPO_PUBLIC_GYAN_TEST_TOOLS=0`, and restart the app with `npx expo start --web --clear`.
   Open Plan and usage again. **The whole builders' panel is gone.** Put the line back to `1`
   and restart if you want to carry on testing.

---

## Part E: Team

1. Open **Settings > Team**. It says **1 of 1 seat** on the Free plan, with just you on it.
2. **Try to invite somebody while you are on Free.** The box is greyed out and it says
   *All 1 seat is taken. Remove somebody, or change your plan, to invite another person.*
   That number comes from the plans table, not from the app.
3. Go to **Plan and usage** and switch to **Pro** (5 seats). Come back to Team. It now says
   **1 of 5 seats** and the invite box works.
4. **Send an invite.** Type your second email address and tap **Send invite**. It says
   *Invite sent to …*, the seats go to **2 of 5**, and the address appears under
   **Waiting to accept**, marked *Invited, not joined yet. This is holding a seat.*
5. **Check the email arrived.** Open that inbox. The subject is *<your name> invited you to
   gyan*. It has a blue **Join** button, says the link works for 14 days and only for that
   address, and says ignoring it is safe.
6. **Join.** In a **private/incognito window**, click the link in the email.
   - If that address has no Gyan login, sign up with it. Gyan remembers the invite while you do,
     and takes you to the joining screen afterwards.
   - It says **You are in**, and names whose account you joined.
   - Tap **Go to Home**. You see the first account's notes.
7. **Check what a member can and cannot do.** Still in the private window, open
   **Settings > Team**. You can see both people. The invite box is greyed out and it says
   *Only the account owner can change the team.* There is no **Remove** and no **Make owner**.
8. **And the same for recaps.** Open **Settings > Recaps**. You can read the settings, but every
   switch is off-limits and says *Only the account owner can change who gets recap emails.*
9. **Back in your own window**, on the Team page:
   - **Take an invite back.** Send another invite, then tap **Take back** on it. It asks first and
     says the seat comes free. Confirm: the seats go down by one.
   - **Remove somebody.** Tap **Remove** next to the member. It asks first and says
     *The notes they made stay here, with you.* Confirm. They disappear and a seat comes free.
   - In the private window, refresh. That person is no longer on your account, but **they still
     have a Gyan login and a workspace of their own** — they are not locked out of the app.
10. **Try to invite the same address twice.** Invite somebody, then invite the same address again
    without them joining. It says *That person has already been invited. Their invite is still
    waiting.*
11. **Try to invite somebody already on the team.** It says *That person is already on your
    account.*

---

## Part F: Recaps

Nothing has changed about how recaps work. The page has only moved.

1. Open **Settings > Recaps**. It is the same page as prompt 9, with the same three switches.
2. **Check an old email still works.** Open a recap email Gyan sent you before today and click
   **Turn off recaps** at the bottom. It still opens the right page. (The old address now sends
   you to the new one, so links in emails already sent do not break.)
3. Any recap sent from now on links straight to the new address.

---

## Part G: Data and privacy

> **This part deletes things for good. Use a throwaway test account, not your own.**

1. Open **Settings > Data and privacy**.
2. **Delete a note.**
   - Your notes are listed with their dates. Tap **Delete** next to one.
   - It names the note and lists exactly what goes, including the line
     *It does not give you the meeting back this month.*
   - Tap **Cancel**. Nothing happens. The note is still there.
   - Tap **Delete** again, then **Delete this note**. It disappears, and it is gone from Home too.
   - Check **Plan and usage**: the meetings used has **not** gone down. The transcript and summary
     were already paid for, so deleting is not a way around the limit.
3. **Try to delete your account while somebody is still on it.** Invite somebody and have them
   join, then come back here. It says *There is 1 other person on your account. Remove them on
   the Team screen first…* and there is no delete button, only **Go to Team**.
4. **Remove everybody**, then come back. Now **Delete my account** is there.
5. **Delete a throwaway account.**
   - Tap **Delete my account**. It lists everything that goes and says Gyan keeps no copy.
   - The **Delete everything** button is greyed out. Type `delete` in lower case: still greyed
     out. Type `DELETE`: now it works.
   - Tap **Delete everything**. You are signed out and sent back to the log in screen.
   - Try to log in with that account. It does not exist.
   - In the Supabase dashboard, check the **meetings** table: that account's notes are gone. Check
     **Storage > notes-files**: its folder is gone too.

---

## Part H: The automatic checks

1. In the gyan folder, run:

   ```
   npm run check
   ```

   This runs the type check and all the unit tests. Everything should pass.

2. Then run the browser scripts, which click through the app like a person:

   ```
   npm run e2e
   ```

   > If your own `npx expo start` is already using port 8081, run
   > `GYAN_E2E_PORT=8101 npm run e2e` instead, and the scripts use their own port.

   These never touch the real Supabase project, never send an email and never call a paid
   service. Everything they see is fake data.

---

## When something does not work

**"The Free plan is missing from the plans table"** — `supabase db push` did not finish, or you
are pointed at the wrong project. Run it again and check which project is linked.

**The builders' plan panel is not there** — `.env.local` does not say exactly
`EXPO_PUBLIC_GYAN_TEST_TOOLS=1`, or the app was not restarted after you changed it. It is read
when the app is built, not while it runs.

**"This switch is only for the Gyan team."** — you are not an admin in this project. Do step 4 of
Part A.

**"That plan is a real one, so this test switch cannot reach it."** — somebody has set `is_test`
to false on Pro or Team in the plans table. The switch is only ever allowed to touch plans whose
numbers are marked as stand-ins.

**The invite email never arrives** — check your junk folder first. Then check
`supabase secrets list` shows `SMTP_PASSWORD`. Gyan takes the invite back by itself if the email
will not send, so a missing email should also mean no seat is being held.

**The link in the invite goes nowhere** — `GYAN_APP_URL` is not set, or points somewhere else.
See step 3 of Part A.

**"That invite was sent to a different email address."** — you are signed in as somebody else.
An invite only ever works for the one address it was sent to, which is what stops a forwarded
link letting a stranger in.

**"You already have notes in Gyan on your own account."** — the address you are joining with has
already made notes of its own. Gyan stops rather than quietly leaving them behind. Use an address
that has not made any notes.

**"There is 1 other person on your account."** — deleting the owner's login would take the whole
workspace with it, including every note your team has made. Remove everybody first.

---

## Known gaps (on purpose, for later)

- **Paying is not built.** Upgrade is a greyed-out button. Plan changes happen only through the
  builders' test switch, and only for an admin, on a stand-in plan.
- **The Pro and Team numbers are made up.** Change them in the **plans** table before launch, and
  set `is_test` to false when they become real. The moment you do, the test switch can no longer
  touch any account on them.
- **Somebody who already has notes cannot join a team.** Gyan refuses rather than leaving their
  work behind. The proper fix is letting one person belong to two accounts and choose between
  them, which is a bigger change.
- **There is one owner per account.** "Make owner" hands the account over: you stop being the
  owner in the same moment. Two owners at once is not possible.
- **Changing your email is not built.** It is how you sign in, so it needs its own confirm-by-email
  step.
- **No goodbye email.** Deleting an account sends nothing, because by the time it is done there is
  no address left to send to.

---

## Before you run npm run check

- Put the Free plan's `meetings_per_month` back to **5** if you changed it in Part D.
- Switch your test account back to the **Free** plan.
- You can leave `EXPO_PUBLIC_GYAN_TEST_TOOLS=1` in `.env.local`. It is never committed, and the
  tests check both ways round anyway.
