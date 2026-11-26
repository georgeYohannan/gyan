# Prompt 14: checking the meeting bot

Gyan can now send a notetaker into a Zoom, Google Meet or Microsoft Teams call. You paste the
link, somebody in the call lets it in, it records, and when the call ends you get an ordinary
Gyan note — transcript, summary, action items, chat, all of it.

**It is switched off for every account, including yours.** Turning it on is something only you
can do, by hand, in the Supabase dashboard, and it stays off for real customers until a lawyer
has read the words Gyan shows people about recording.

This round needs more from you than most, because it is the first feature with an outside
service you do not yet have an account with. **Part 1 is about twenty minutes of setting up.**
Part 2 is ten minutes of checking on your own machine. Part 3 is clicking around. Part 4 is the
real test, with a real Google Meet call you make yourself. Part 5 is what is deliberately not
built, and the things I could not check.

---

## Part 1: what you need to do once

### 1. Make a Recall.ai account — in the **US East** region

Go to <https://www.recall.ai/> and sign up on the **Pay As You Go** plan.

**The region matters and cannot be changed later.** Recall runs four completely separate
services, and an account belongs to one of them for ever — moving means a new account and a new
key. You chose **US East**, which is what Gyan is built for.

When you sign up, make sure the dashboard you end up in is the **US East / `us-east-1`** one. If
you land somewhere else, do not carry on — tell me and I will change the one line that sets it.

**You should see:** a dashboard, and under Developers → API Keys, a key you can copy.

**What it costs:** $0.50 for each hour a bot is in a call, billed by the second. Your first
**5 hours are free**. There is no monthly minimum. Worth asking them about: they offer a startup
rate of $0.25 an hour for the first 10,000 hours, which would halve it.

### 2. Give Gyan the key, without it ever going through chat

In your terminal, in the project folder. **Type it, do not paste it anywhere else:**

```
supabase secrets set MEETING_BOT_API_KEY=paste-your-key-here
```

**You should see** `Finished supabase secrets set.`

The name is deliberately not "RECALL" — it says what the key is *for*, so that if Gyan ever moves
to a different bot service, nothing about your setup has to change.

### 3. Make the webhook secret, and tell Recall where to send events

Recall tells Gyan what the bot is doing by calling a web address of ours. Two things to set up.

**First, the secret.** In the Recall dashboard: **Developers → API Keys & Secrets → Create
Workspace Secret**. Copy what it gives you — it starts with `whsec_`.

```
supabase secrets set MEETING_BOT_WEBHOOK_SECRET=whsec_paste-it-here
```

**Second, the address.** In the Recall dashboard, go to the **Webhooks** tab and **Add Endpoint**,
with this address:

```
https://ofnspnobzesxmyqjxzad.supabase.co/functions/v1/bot-webhook
```

(That is your test project. The whole address is also printed by `supabase functions list`.)

**You should see** the endpoint listed as active.

**If you skip the secret**, every message from Recall is refused and no note ever moves past
"Joining". That is deliberate: the signature is the only thing proving a message really came from
Recall, so no signature means no.

### 4. Push the database and the functions

```
supabase db push
supabase functions deploy bot
supabase functions deploy bot-webhook --no-verify-jwt
supabase functions deploy transcribe
supabase functions deploy summarize
```

**You should see** one new migration applied (`20261125120000_meeting_bot.sql`) and five
functions deployed.

**`--no-verify-jwt` on that one function only.** Every other door in Gyan is opened with a
Supabase login. Recall does not have one, so that door is opened by the signature instead. It is
the only function in the whole project like this, and `supabase/config.toml` now says so in
writing.

`transcribe` and `summarize` are redeployed because a bot note arrives with nobody sitting there
waiting for it, so those two steps had to learn to carry on by themselves.

### 5. Turn the switch on, for your account only

In the Supabase dashboard → **Table editor** → **integrations** → **Insert row**:

| Column | What to put |
|---|---|
| `account_id` | your account's id (Table editor → `accounts` → the row where `owner_id` is you) |
| `kind` | `meeting_bot` |
| `settings` | `{"enabled": true, "bot_name": null}` |

**You should see** the Meeting link card on New note stop being dimmed.

**Nothing in the app can do this.** The function that saves bot settings reads `enabled` out of
the row that is already there and writes it back unchanged, whatever it is sent — so "only you can
turn this on" is a rule the database keeps, not a habit the app follows.

### 6. Give your account some bot hours

**This step catches everybody.** The Free plan has **0** bot hours a month, on purpose, so a free
account can never send a bot. Your test account is on Free.

The easiest way: in the app, go to **Settings → Plan and usage**, scroll to the builders' switch
at the bottom, and press **Pro**. That stand-in plan has 10 hours. (If you do not see the switch,
your `.env.local` needs `EXPO_PUBLIC_GYAN_TEST_TOOLS=1` and your profile needs `is_admin` set to
true — that is step 6 of `docs/testing/prompt-10.md`.)

**Or**, if you would rather keep Free: Table editor → `plans` → the Free row → set
`bot_hours_per_month` to `2`. That is worth doing once anyway, because it proves the thing this
round promises: **changing that one number changes what the app allows, with no new code.**

---

## Part 2: checking it on your own machine

### 7. Run the type check and every test

```
npm run check
```

**You should see:** `Tests: 1675 passed, 1675 total` and no type errors. (It was 1450 before this
round.)

### 8. Run the live database checks

```
npm run check:db
```

Needs Docker running. It builds a throwaway Postgres on your own machine, really runs every
migration, and then tries to break the new rules.

**You should see:** `All 91 checks passed.` (It was 58 before this round.) Among them, tried for
real rather than read: the switch off refuses a bot, 0 hours on the plan refuses a bot, no consent
refuses a bot, a stranger cannot send or stop a bot on your account, a status event that arrives
late cannot move a bot backwards, a recording cannot be written into another account's folder,
the daily caps refuse, **the app cannot turn the switch on**, and a 90-minute recording is refused
on a 60-minute plan while a 30-minute one is not.

### 9. Run the browser scripts

```
npm run e2e
```

**You should see:** `289 passed` in about 28 minutes. (It was 261 before this round.)

**Only one copy at a time.** Two runs together rewrite the same help pictures at the same moment
and neither wins; it fails in a way that looks like real bugs. If you have `npx expo start`
already running, use `GYAN_E2E_PORT=8082 npm run e2e`.

**No real bot is ever sent by any of these.** They run the web app against a made-up Supabase
address with every call intercepted, so the real server function never runs and Recall is never
reached. A fake walks a note through joining, the waiting room, recording, ended and failed.

---

## Part 3: clicking around, with no real bot

All of this works before you have spent a penny at Recall.

10. **With the switch off**, open New note. **Meeting link should be dimmed and say "Coming
    soon".** Then type `/meeting-link` into the address bar yourself: you should get a screen that
    says it is coming soon and gives you nothing to press. The dimmed card is the polite half; the
    screen refusing is the real one.

11. **Turn the switch on** (step 5) and reload. The card should be pressable.

12. Open **Meeting link** and paste some rubbish — "hello", or a link to a news site. **You should
    see** "Gyan could not read that as a meeting link", and **Send the bot** stays unpressable.

13. Paste a real Google Meet link. **You should see** the screen change: it names the platform,
    says what the bot will be called, and tells you who has to let it in.

14. **Do not tick the box.** Send the bot should still be unpressable, and under it: "Tick the box
    to confirm, and Gyan will send the bot."

15. Read the three things you are confirming, and the line under the button saying **DRAFT
    wording: a lawyer has not checked these words yet.** That line is there on purpose and should
    not come off until one has.

16. Look at the bottom: **hours left this month** and **the longest one call may be**. Both come
    out of the plans table. Change `bot_hours_per_month` in the dashboard and reload — the number
    on the screen should follow it.

17. Press the **?** at the top right and read the help entry.

---

## Part 4: the real test, with a real meeting

This is the one that spends money — a few pence.

18. **Make a Google Meet call.** In your own Google Calendar, make an event now, with a Meet link,
    and join it from your laptop. You are the host, which matters: you need to be able to let the
    bot in.

19. In Gyan, **Meeting link → paste the link → tick the box → Send the bot.** Gyan takes you
    straight to the new note.

20. **You should see** the note say **Joining**, then within about half a minute, **In waiting
    room** — with an orange edge and "Let gyan Notetaker (Your Name) in".

21. **In Google Meet, admit the bot.** A box appears asking you to let somebody in. It will be
    called **gyan Notetaker (Your Name)**.

22. **You should see**, in the Meet chat, a message from the bot saying it is recording and who
    asked for it. **Check it really arrived** — that message is the whole of Gyan's promise that it
    never records a meeting without telling the people in it. If it is missing, tell me, because it
    is the one part of this I could not test without a real call.

23. In Gyan, the note should say **Recording**.

24. **Talk for a minute.** Say a couple of things worth summarising — a decision and a to-do, so
    you can check the summary found them.

25. **End the meeting.** (Or press **Stop recording** in Gyan, which makes the bot leave
    immediately — worth trying once, on a second call.)

26. **You should see**, over the next two or three minutes: Recording → Transcribing →
    Summarizing → **Ready**. Nothing to press, and the page updates by itself.

27. Open the note. **You should see** a transcript with speaker labels, a summary, and any action
    items. Check the names and numbers you said came through correctly.

28. Go to **Settings → Plan and usage**. **Meeting bot hours this month** should have gone up by
    about the length of your call.

### Things worth trying once each

29. **Send a bot and never let it in.** After ten minutes it gives up, and the note ends as
    **Failed** saying "Nobody let Gyan into the meeting."

30. **Send a bot to a Zoom link.** It will fail, with "Gyan cannot join Zoom calls yet." That is
    correct for now — see Part 5.

31. **Set `bot_hours_per_month` to 0** on your plan in the dashboard and try again. You should be
    refused with a friendly message, with no code change anywhere. **That is the promise this
    round makes about every limit.**

32. **Set `max_meeting_minutes` to 1** on your plan, then upload a recording longer than a minute.
    It should be refused, naming the limit. Set it back to 60 afterwards.

---

## Part 5: what is deliberately not built, and what I could not check

**Zoom does not work for anybody but you, yet, and that is paperwork rather than code.** Recall
needs Zoom SDK credentials in their dashboard, and to join meetings outside your own Zoom account
the Zoom app has to be **submitted to Zoom and approved**. Until then, Recall's own error says
bots "can only join meetings hosted in the workspace of the user that created the credentials".
Gyan handles all three platforms; a Zoom failure comes back as a plain message. The other
open-source bot services have exactly the same hurdle, so it is not a reason to prefer one.

**No calendar auto-join.** Still a written decision (2026-11-21): a bot that joins by default
records people who never agreed to it, and the person running it often does not realise which
meetings it picked up.

**No live notes during a call.** The bot records; Deepgram writes the transcript afterwards,
exactly as it does for an upload.

**Record on a phone or in the browser is still "Coming soon".** The longest-meeting limit is ready
for it the day it is built.

### Things I could not verify, and you may hit

- **What a Recall recording actually looks like.** Their own documentation does not name the key
  their mixed audio arrives under, and does not say what container their "raw" format is. Gyan
  asks for MP3 and **looks** for the audio rather than trusting a name, so it should be fine — but
  the very first real call is the first time this has ever run against the real thing. If the note
  fails with "The call finished but Gyan could not get the recording", that is this, and it is a
  small fix.
- **How long Google Meet keeps a bot in the waiting room.** Three of Recall's own pages say three
  different things (never, ten minutes, and a ten-minute cap on the setting). Gyan sets ten
  minutes, which is valid under all three readings.
- **Whether Recall trains on recordings, and whether they will sign a BAA or a data agreement.**
  Their security page still will not load and nothing public says. **This is worth an email**, and
  it is written down in `docs/security/vendors.md` as three questions for you.
- **A very long call.** A Supabase function is stopped after 150 seconds, and moving a big
  recording from Recall into our bucket happens inside one. The 60-minute limit makes this
  unlikely, and the bucket refuses anything over 50 MB with a plain message either way. A
  four-hour call has never been tried.
- **The in-meeting chat message**, on each of the three platforms. Recall says Teams can refuse it
  if the meeting is a channel meeting or the tenant blocks chat from guests. Step 22 is you
  checking it for real.

### Why a long meeting costs so much more than a short one

Worth knowing before you set the limits.

Every part of the bill is **by the minute, and they stack.** A bot in a call costs $0.50 an hour
for as long as it sits there, whether anybody is talking or not. Deepgram then charges for every
minute of audio. Claude then reads the **whole** transcript to write the summary.

A one-hour meeting costs a few pence end to end. A four-hour meeting costs four times that to
make — and then it **keeps** costing more, because every chat question about it, and every
translation of it, reads the whole thing again. That is why `max_meeting_minutes` exists, why the
Free plan gets 60 minutes, and why there is a cap on bot hours per day as well as per month: at
$0.50 an hour, a bug that sent bots in a loop could run up a real bill overnight. The caps are 2
hours per account per day and 6 hours for all of Gyan per day, both in the `security_settings`
table, both yours to raise once you trust it.
