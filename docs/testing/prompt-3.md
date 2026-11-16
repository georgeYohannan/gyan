# How to test the database and login (prompt 3)

Everything here uses the Supabase TEST project (named "gyan"). Use only fake emails.

## Part A: Things you must do first

1. Open a terminal in the gyan folder.
2. Run `supabase projects list`. If it says you are not logged in, run `supabase login` and follow the browser steps.
3. Run `supabase link --project-ref ofnspnobzesxmyqjxzad`. It may ask for your **database password**. That is the password you chose when you made the project. If you forgot it: Supabase dashboard > Project Settings > Database > Reset database password. Type it only in the terminal. Never paste it into a file or chat.
4. Run `supabase db push`. It lists 3 new files and asks "Do you want to push these migrations?". These only ADD tables, rules, and the sign up helper. They delete nothing. Type `Y`.
5. In the dashboard, go to **Authentication > Sign In / Providers > Email**. Look at **Confirm email**.
   - **On (the Supabase default):** after Sign up, the person must open a link in an email before they can log in. This is how it will work for real customers. The email comes from Supabase's built-in sender, which only sends a few emails per hour. That is fine for testing.
   - **Off:** the person is logged in right away after Sign up. Easier for quick tests. Turn it back on before launch.
   - To choose where the email link takes people: **Authentication > URL Configuration**. Set **Site URL** to `http://localhost:8081` for now. Add `http://localhost:8081` under **Redirect URLs**.
6. Make 2 fake users for the privacy test. In the dashboard go to **Authentication > Users > Add user > Create new user**. Use fake emails such as `test.a@example.com` and `test.b@example.com`, any passwords, and tick **Auto Confirm User**.
7. Open `.env.local` (it is never committed) and add these 4 lines with the fake details from step 6:
   `TEST_USER_A_EMAIL=`, `TEST_USER_A_PASSWORD=`, `TEST_USER_B_EMAIL=`, `TEST_USER_B_PASSWORD=`
8. If the web app is not running, run `npx expo start --web`.

## Part B: Check the database in the dashboard

1. Go to **Table Editor**. You should see 16 tables: account_members, accounts, action_items, ai_usage, chat_messages, chat_threads, integrations, invites, meetings, mind_maps, plans, profiles, summaries, transcript_segments, translations, usage. There is no "chunks" table yet. That is on purpose.
2. Click **plans**. You should see one row: Free, meetings_per_month 5, seats_included 1.
3. Every table should show a **RLS enabled** badge (no red "RLS disabled" label).
4. Go to **Authentication > Policies**. Each table should list its rules.
5. Click **profiles**, **accounts**, and **account_members**. You should already see a row for each fake user from step 6 above. Each person has a profile, one account on the Free plan, and one account_members row with role "owner".

## Part C: Sign up, log in, log out in the app

1. Open http://localhost:8081 in Chrome. You should land on **Welcome back** (the Log in screen).
2. Click **Sign up** at the bottom.
3. Click the round **?**. A help panel should open with words and a screenshot. Close it.
4. Type a bad email like `abc` and a short password like `123`, then click **Sign up**. You should see red messages in plain words and nothing is created.
5. Use a fake email you can open, for example a Gmail "plus" address (`yourname+gyan1@gmail.com`). Use a password with 8 or more characters. Click **Sign up**.
6. If Confirm email is **on**: you should see a green message about a link. Open the email and click the link. Then log in at the Log in screen.
   If it is **off**: you should land on Home right away.
7. First time only: you should see **Before you start**, a short note about recording consent. Click **I understand**. Log out and back in. It should not show again.
8. On Home you should see "Logged in as" and your email. Click **Log out**. You should return to the Log in screen.
9. Refresh the page while logged in. You should stay logged in.
10. Try a wrong password on the Log in screen. You should see "That email and password do not match."
11. Try to sign up again with the same email. You should see a message that it already has an account (or the confirmation message again if it was never confirmed).
12. Back in the dashboard: **profiles**, **accounts**, and **account_members** should each have a new row for your email. In **accounts**, the plan_id should match the Free row in **plans**. In **account_members**, the role should be "owner". In **Authentication > Users** you should see the email.

## Part D: Tests

1. Run `npm run check`. It should say the tests passed and no red errors.
2. The file `__tests__/supabase-rls-test.ts` checks that user B cannot read or change user A's rows. If you did Part A step 7, it runs for real. If not, it says it is skipped.

## If something goes wrong

- "Something went wrong" on Sign up right after the push: the sign up helper may have failed. Check **Logs > Postgres** in the dashboard and tell me what it says.
- Sign up says it sent an email but none comes: check spam. The built-in sender has a small hourly limit. Wait, or turn Confirm email off for testing.
