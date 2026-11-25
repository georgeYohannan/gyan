# Prompt 13: checking the redesign

Gyan works, and has done for twelve rounds. This round changes **how it looks and how you move
around it**, and changes almost nothing about what any feature does. Two exceptions, both of
which you chose: the chat that used to slide in over a note is now a tab on it, and **Ask**
— asking one question of **all** your notes at once — is built. Ask is not a new idea: it is
the other half of feature 5 in `docs/product-spec.md`, half-built since prompt 7.

Ask is the only part that needs anything from you: two commands in Part 1, step 1.

Part 2 is about ten minutes of checking on your own machine. Part 3 is clicking around.
Part 4 is what is deliberately not built, and the things I could not check myself.

---

## Part 1: what you need to do once

### 1. Two commands, because Ask is a real feature

Everything else this round is app code and needs nothing. **Ask** is not: it adds database
functions and changes the `chat` server function.

```
supabase db push
supabase functions deploy chat
```

**You should see** one new migration applied (`20261124120000_ask_all_notes.sql`) and the `chat`
function deployed. No new key, no new setting, no new table, and nothing is deleted.

If you skip this, everything else works and Ask says it could not answer.

Then `git pull` and restart the app.

---

## Part 2: checking it on your own machine

### 2. Run the type check and every test

```
npm run check
```

**You should see:** `Tests: 1446 passed, 1446 total` and no type errors. (It was 1312 before
this round.) A line about "a worker process has failed to exit gracefully" is normal and was
there before.

### 3. Run the browser scripts

```
npm run e2e
```

**You should see:** `261 passed` in about 25 minutes. (It was 215 before this round.)

If it says the port is in use, your dev server has it. Use a different one:

```
GYAN_E2E_PORT=8099 npm run e2e
```

> **Only ever run one of these at a time.** `npm run e2e` does not just test the app — it also
> **rewrites all 66 pictures** in `docs/help/images/`. Two copies running together are writing
> the same files at the same moment and neither can win, on top of two bundlers and two browsers
> fighting over your processor. It fails in a way that looks like real bugs: timeouts in the
> slowest tests, usually the wide-window pictures at the end. A different port does **not** make
> them safe to run together, because the clash is over files, not ports.
>
> If it happens, nothing is damaged. Stop both, then run one:
>
> ```
> git checkout -- docs/help/images/
> npm run e2e
> ```

These scripts never touch your real Supabase project and never call a paid service. They start
their own copy of the web app with a made-up address and answer every request with fake data,
so they cost nothing and are safe to run as often as you like.

### 3b. Run the database checks (optional, needs Docker)

```
npm run check:db
```

**You should see:** `All 58 checks passed.` (It was 44 before this round.) This one is different
from everything else here: it starts a throwaway Postgres on your own machine, applies every
migration in order, and then **tries to break the rules** — it signs in as a second person and
attempts to reach your notes by asking a question, read your Ask conversation, and retry your
question. All three are refused. It throws the database away when it finishes, and it never
touches your real project.

If Docker is not running it says so and stops. Skipping it is fine; `npm run check` does not
need it.

### 4. Run the lint

```
npm run lint
```

**You should see** about 11 problems, all of them there before this round and none of them in
code written for it. They are the Expo starter's own warnings plus a React rule about setting
state inside an effect, which this project does deliberately in a handful of places.

---

## Part 3: clicking around the app

```
npx expo start --web
```

Open it at **two sizes**, because the navigation is a different shape at each: a narrow window
(drag it to about a phone's width) and a wide one.

### 5. The navigation: five places, not two

**On a narrow window you should see** a bar along the **bottom** with five items: **Home,
Search, New note, Ask, Settings**. On a wide window that bar becomes a **sidebar down the left**
with the Gyan name above it.

Before this round there were two items on a phone (Home and Settings) and, on the web, a
floating pill bar at the **top** that carried a leftover **"Docs → docs.expo.dev"** link from
the Expo starter kit. Both are gone.

Press each of the five. **You should see** the address change to `/`, `/search`, `/new-note`,
`/ask`, `/settings`, and the item you pressed marked with a small blue line.

### 6. New note is reachable with one thumb

On the narrow window, hold the phone-shaped window the way you would hold a phone. **New note
is in the bottom bar**, in the middle, where your thumb naturally sits. It used to be a button
at the **top** of Home — the hardest place on a phone to reach.

Press **New note** from each of the other four places. It opens every time, and it opens
**fresh** — if you had started typing a note and wandered off, coming back gives you a clean
screen rather than a half-finished one.

### 7. Home leads with your notes

**You should see**, in this order: the heading **Your notes**, one glowing blue **New note**
button, the search box, then your notes grouped under **Today**, **Yesterday** and month names.

Three things that used to be there are not any more:

- the heading that said **"Home"** — a page called Home tells you nothing;
- the panel saying **"Meetings used this month: 0 of 5"**, which sat above your own notes;
- the identical grey card around every single note.

**The meetings count has not disappeared.** Home now says one quiet line only when you have
**one meeting left**, and the full message when you have none. The whole count is on the **New
note** screen and in **Settings → Plan and usage**.

### 8. A note only stands out when it wants something

Look down the list. **You should see:**

- an **orange edge** down the left of any note that still has something to do;
- a **thin blue line** under any note Gyan is still working on;
- a **red card** around any note that failed, with the message on it;
- **nothing at all** on a note that is finished and owes you nothing.

This is the whole idea of the design you picked. Thirty identical cards meant the one note that
needed you looked exactly like the twenty-nine that did not.

### 9. Share or delete one note

Tap the **three dots** on the right of any note.

**You should see** a panel titled with that note's name, offering two things:

- **Send a recap by email** — see the warning below;
- **Delete this note**.

Press **Delete this note**. **You should see** the same box Select mode has always shown: it
names the note, lists what goes with it, and says plainly that deleting **does not give you the
meeting back this month**. Press **Cancel**: nothing happens. Press **Delete note**: it goes,
and a line tells you so.

> **"Share" means "send a recap by email".** There is no share link in Gyan and I did not invent
> one. Pressing Share opens the note with the Send recap dialog already up. If you want a real
> share link — a web address you can send somebody who has no Gyan account — that is a feature,
> not a redesign, and it is not built.

Try a note that is **still being made**: its Share line is off, and says *"There is nothing to
send until this note is finished."* A greyed-out button could never tell you that.

### 10. Select mode still works, and does not fight the three dots

Press **Select**. **You should see** the three-dot buttons disappear, so there is one way to
delete at a time. Tick two notes, press **Delete**, and the box names both. Press **Cancel** and
the three dots come back.

### 11. A note has three tabs now

Open any finished note. **You should see** its title set large, then three underlined tabs —
**Summary, Transcript, Chat** — and one quiet **More**.

Before this round that line carried two tabs and four buttons (Language, Translate, Ask, Send
recap), six things in total, and on a phone it pushed the whole page sideways.

- **Summary** opens with one large paragraph you can read in a breath, then Key points,
  Decisions, Open questions and Action items as named groups with a line under each name. The
  to-do list has a thin **orange meter** showing how much is done.
- **Transcript** reads like a script: the speaker's name small and spaced above each line, with
  a hairline between lines.
- **Chat** is where Ask used to be. Ask a question, then tap one of the **small numbers** in the
  answer: it switches to the Transcript tab and outlines that line in blue.

Press **More**. **You should see** your language, Translate, and Send a recap by email. On the
Chat tab, Translate is off and says *"Gyan already answers in your language, so there is nothing
to translate."*

### 11b. Ask: one question, every note

Press **Ask** in the navigation. **You should see** the heading **Ask**, the line *One question,
answered from your notes*, and three questions offered as buttons above a question box pinned to
the bottom.

Press **What did I promise to do?** **You should see** your question appear, then an answer that
**names the notes it used** -- "In Weekly team call you..." -- with a small round number after
each fact.

Tap one of those numbers. **You should see** that **note** open, on the **Transcript** tab, with
the line outlined in blue. Inside a note the same number only switches tab; here it leaves the
screen, because the answer came from somewhere else.

Go to **Home** and back to **Ask**. **You should see** your conversation still there: it is kept
in the database, not in the screen. It is also **separate** from every note's own chat, and from
everybody else's -- a teammate cannot read it.

> **A number can sit on a line of its own at phone width.** When the words before it fill the
> line, the small round number wraps onto the next one. The full stop always stays with it, so
> no line ever starts with a stray ".". Putting the number properly inside the sentence would
> shrink the part you can tap from 44 points to about 20, which is a rule I am not going to
> break quietly. Say the word and I will.

### 12. Settings is two groups, not six doors

**You should see** **Your account** (Profile, Plan and usage, Team) and **How Gyan works**
(Recaps, Security, Data and privacy), with a hairline between rows, and **Log out** as a quiet
line at the bottom rather than a seventh setting.

Open each of the six and come back. Every one still works.

### 13. A keyboard-only tour

Click once on the page, then put the mouse away and use **Tab**, **Shift+Tab**, **Enter** and
**Escape** only.

**You should see a blue ring** around whatever the keyboard is on, every time, on every control.
Check you can reach: all five navigation items, the New note button, the search box, Filters,
the three dots on a note, and every row inside a panel. **Escape** closes any panel.

There is one deliberate exception: the **swipe** buttons cannot be reached by keyboard. They are
a touch shortcut and the three-dot button opens the same two things with real names — see
number 19.

### 14. Turn reduce motion on

On a Mac: **System Settings → Accessibility → Display → Reduce motion**.

**You should see** every panel appear and disappear with no sliding at all, and the Gyan
wordmark at startup vanish rather than fade. Nothing should break; things just arrive instantly.

### 15. Make the text much bigger

In the browser, press **Cmd + plus** four or five times, until the page is at about 200%.

**You should see** everything still fit, with no sideways scrolling and nothing cut off. Read
number 22 before you judge this one — there is an honest limit.

---

## Part 4: what is not built, and what I could not check

### 16. Nothing here has ever run on a real phone

This is the most important sentence in this document. Thirteen rounds of work have been checked
on the **web** at phone width, which is not the same thing as a phone. The build in
`docs/testing/phone-build.md` is real and waiting for you on Android.

One bug this round is a good example of why it matters: **ten places in the app asked a regular
font for bold and were not bold on a phone at all.** A browser fakes a bold by smearing the
regular letters, so every screenshot ever taken looked right and the problem was invisible to
all 179 browser scripts. It is fixed, but it was found by reading the code, not by seeing it.

### 17. Things worth looking at first, on a real phone

1. The bottom bar: on a phone it is the **system's own** tab bar with real icons, not the plain
   words you see on the web. This round is the first time it has had five items.
2. **Bold text**: note titles, speaker names, the chosen tab. They should look heavier than the
   text around them.
3. The **Chat tab with the keyboard up**: the question box should stay above the keyboard and
   the conversation should scroll behind it. This is the single most likely place for a layout
   bug in the whole round. **The Ask screen is the same code**, so check it there too.
4. **Swiping** a note left (see number 19).
5. The largest system text size, in the phone's accessibility settings.
6. **A long Ask answer** at phone width, to see how its numbers wrap (see number 11b).

### 18. The help pictures show words where your phone shows icons

Every picture in the in-app help is taken from the **web**, where the navigation is a bar of
words. On a phone the same bar shows system icons with the words under them. The pictures are
honest about everything else; this one difference is worth knowing.

### 19. Swiping a note is not checked by any script

The browser scripts drive a desktop browser with a **mouse**, and a mouse drag does not open a
touch gesture. I tried twice and then stopped, rather than loosening a check until it passed.

**So please try this by hand on a phone:**

1. Swipe a note to the left. **You should see** a blue **Share** and a red **Delete** appear
   behind it.
2. Tap **Delete**. The same box appears as from the three dots.
3. Swipe a note that is still being made. **Share should be dim.**
4. Turn Select mode on, then try to swipe. **Nothing should happen.**

If any of that misbehaves, the three-dot button does the same two things and is covered by ten
scripts, so nothing is lost while it is sorted out.

### 20. Large text on the web follows zoom, not the text-size setting

If you make text bigger in your **browser's settings** (rather than with Cmd + plus), Gyan's
text will not follow. That is because React Native writes exact pixel sizes on the web. Page
zoom works properly, and so does the phone's own text size setting on iOS and Android. Making
the web follow the browser's text setting is real work and is not in this round.

### 21. There is still no "Forgot password"

If you forget your password there is no way back in from the app. The help text admits this.
It is a feature, not a redesign, and it is still not built.

### 22. Ask finds notes by their words, not by their meaning

Ask is built (see number 15b), and this is its one real limit, which it shares with the Search
screen and which the help text says out loud:

> It finds notes where somebody **said** a word. It does not find a note about the same thing
> worded differently.

So asking about **"cost"** will not reach a meeting that only ever said **"pricing"**. Fixing that
needs a different kind of search -- embeddings -- which has been an open decision since
2026-11-16 and is still open. Nothing in this round pretends otherwise.

Two more numbers worth knowing: at most **4 notes** go into one answer, chosen by how well they
match, and asking here spends the **same daily questions** as the chat inside a note. There is
one allowance, not two, and Settings → Plan and usage counts both.

### 23. Five panels still have their own copy of the same code

The help, the filters, the language list, the recap dialog and the confirmation boxes each carry
their own copy of the forty lines that make a panel slide in. The shared version now exists and
the new menus use it, but moving the older five is real work with real risk and I judged late in
a large round to be the wrong time. It is written down in `docs/decisions.md` rather than left
quietly.

### 24. What has not changed at all

The colours, the two typefaces, your data, the notes you already have, and the addresses of
every page. A link you saved before this round still works. Every existing feature does exactly
what it did; the only thing that can now do something it could not before is **Ask**, and it
adds nothing to your database but one more kind of saved conversation.

---

## If something goes wrong

**The app will not start, or shows "Requiring unknown module".**

```
npx expo start --web --clear
```

**A browser script fails and you want to see it happen.**

```
GYAN_E2E_PORT=8099 npx playwright test tests/02-home-new-note.spec.ts --headed
```

**You want just the pictures taken again**, without running every script:

```
npm run e2e:shots
```

That rewrites every file in `docs/help/images/`. Do not run it unless you mean to: it changes 66
files and they all show up in `git status`. The same one-at-a-time rule applies as in number 3.

**A run failed and you think it might not be your fault.** Check nothing else is running first:

```
ps aux | grep -c "[p]laywright test"
```

`0` means you are clear. Anything else means another run is going, and its failures and yours
are both meaningless until one of them stops.
