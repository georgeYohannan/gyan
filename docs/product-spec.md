# gyan product spec

This spec says what gyan does in version 1, screen by screen. Save it as docs/product-spec.md in your code folder and add it as knowledge to your Product, Design, and Build projects. When a decision changes it, update this tab first.

## Goals

- Turn any conversation into a transcript, summary, action items, and mind map in under 1 sitting, without the user typing notes.
- Let users ask questions about their notes in a side chat, and read answers in their own language.
- Ship 1 codebase that runs on the web, iPhone, and Android, with a dark, glowing look that matches gyantechai.com.

## Roles and plans

| Role | Can do | Notes |
| --- | --- | --- |
| Free user | Create notes, use side chat and translation, up to the free monthly limit | Free limit starts at 5 meetings per month |
| Paid owner | Everything a free user can do, plus a higher limit, team seats, and billing | Owner pays. Owner invites team members |
| Team member (seat) | Create and read notes under the owner's plan | Uses 1 seat |
| Admin (you) | Change plan limits, seat rules, and see usage and cost | Internal admin page, not shown to customers |

Plan limits live in a database table. The numbers below are proposed rules to confirm in the decision log:

| Rule | Proposed | Status |
| --- | --- | --- |
| What counts as 1 meeting | Each uploaded recording, phone recording, or bot meeting counts as 1. Pasted text and text files never count, and still work at the limit. A meeting counts only when the note reaches Ready | Set |
| Free plan limit | 5 meetings per month, resets on the 1st | Set |
| Max length of 1 meeting | 60 minutes on the Free plan, from `plans.max_meeting_minutes`. Applies to every source: a bot leaves the call at the limit, and a longer upload is refused. Changing the number in the plans table changes what the app allows, with no new code | Set |
| Paid plan limits and seat price | To be decided | Open |

## Screens

| Screen | Purpose | Key parts | Key rules |
| --- | --- | --- | --- |
| Sign up and log in | Create an account and enter | Email and password, sign in with Google | Show a short note about recording consent on first sign in |
| Home | See and find notes | Note list, search bar, Filters, big New note button, meetings used this month | The 10 newest first, then 20 more at a time, never all at once. Grouped under Today, Yesterday, This week and the month. Each note shows its status |
| New note | Add a conversation | 4 choices: Record, Upload, Paste text, Meeting link | Block with a friendly message when the monthly limit is reached |
| Note detail | Read and work with 1 note | Tabs for Summary, Transcript and Chat (Mind map comes later). The Summary tab has the overview, key points, decisions, open questions, and the action items as a checklist, with Copy and Regenerate. Language, Translate and Send recap sit behind one More menu | The chat is a TAB on every platform, not a side panel or a bottom sheet (changed 2026-11-24, prompt 13). Regenerate asks for confirmation first, because it costs money |
| Search | Find words across all notes, line by line | Search box, results with matching line, speaker and time | Tapping a result opens the note at that moment. Keyword search is built; finding a topic worded differently needs embeddings and is not built (see feature 7) |
| Ask | Ask one question of all your notes | One chat, a question box, three suggested questions. Answers name the notes they used and carry numbered citations | The same chat as a note's Chat tab, reading several notes instead of one. A citation opens that note at that line. Which notes are read is decided by keyword search, so it finds notes where a word was SAID, not a topic worded differently |
| Settings | Account and preferences | Preferred language, name, email, delete account | Delete account removes all notes |
| Plan and billing | See plan and upgrade | Current plan, meetings used, upgrade button | Payments go through RevenueCat. Web uses Stripe |
| Team | Manage seats | List of members, invite by email, remove | Only the paid owner sees this |
| Admin (internal) | Change limits and see cost | Plan table editor, usage and AI cost per user | Only admin accounts can open it |

Every screen has 4 states: empty, loading, error, and success. See the Design project for how each looks.

## Version 1 features and when each is done

| # | Feature | How it works | Done when |
| --- | --- | --- | --- |
| 1 | Upload files | User picks audio, video, or text files, or pastes text. The note appears at once with a status | A test file appears in the note list and moves to Ready |
| 2 | Phone recording | Big record button, timer, pause, and stop. The recording saves and processes like an upload | A 30 minute recording saves and processes. Test with the screen locked and write the result in docs/progress.md |
| 3 | Transcript with speakers | Each line shows speaker label, time, and text. Tapping a line plays the audio from that moment | A 2 person test call shows 2 speakers with correct times |
| 4 | Summary and action items | A short overview, key points, and action items with an owner and due date when one is said | A test meeting gives a summary the user calls useful and action items that match the call |
| 5 | Side chat | Ask about this note or all notes. Answers use only the user's notes and show which note and moment they came from. When nothing matches, say so. **Both halves built.** One note: the Chat tab on a note (prompt 7). All notes: the Ask destination (prompt 13), which picks the best 4 notes by keyword search and shares one daily question allowance with the note chat | "What did we decide about pricing?" returns the right answer with a link to the moment |
| 6 | Mind map | Topics and subtopics from the transcript. Zoom, pan, and tap a topic to see the lines behind it | A test note shows a readable map that opens the right transcript lines |
| 7 | Search | Find words across all notes. Two places do it: Home finds whole NOTES, searching the title, the summary and the transcript, and says where the words were found; the Search screen finds the matching LINES, with the speaker and the moment. **Part built.** Finding a topic that uses different words needs embeddings, and the `chunks` table and the embedding model are still open decisions | Keyword half: searching a word finds every note and line that holds it, in under a second with hundreds of notes. Topic half, NOT BUILT: searching a topic finds notes that never use that exact word |
| 7a | Narrowing the list | Filters for when (Today, Last 7 days, Last 30 days, This month, or a custom range picked on a calendar), what state, where it came from, and whether anything is still to do. They work together and with the search words. The count of matches is shown, with a way to clear them. The search and the filters live in the web address | Picking two filters and a word narrows the list to notes that meet all three, the count is right, and a refresh or the back button brings back the same view |
| 7b | Deleting several notes | A Select mode ticks notes and deletes them together, after one box that lists what will go. Deleting removes the recordings too, and does not give the month's meetings back. A note somebody else made cannot be ticked unless you own the account | Two notes are deleted in one go, their files are gone from storage, and a teammate's note is refused by name |
| 8 | Preferred language | Set in Settings and during first sign in. Summaries, action items, chat answers, and recap emails use it | Switching to Hindi shows the same answer in Hindi |
| 9 | Translate on request | A Translate button on any transcript, summary, or chat answer. Pick any language. The result is saved | A second request for the same language loads at once and costs nothing |
| 10 | Meeting bot | Paste a Zoom, Meet, or Teams link. The bot joins with a clear name, announces that it is recording, and sends notes when the call ends. **Built behind the switch (prompt 14)**, which is off for every account until the founder turns it on by hand in the Supabase dashboard, and stays off until a lawyer has reviewed the consent wording in `src/content/bot-consent.ts`. Hours come from `plans.bot_hours_per_month`, which is 0 on Free. **The honest gap: Zoom needs a Zoom Marketplace app submitted and approved by Zoom before it can join anybody else's meeting.** Google Meet and Microsoft Teams work from a link | Google Meet and Teams: the bot joins a real call and the notes arrive. Zoom: after the Zoom app is approved. The switch is off until the wording is signed off |
| 11 | Share out | Email a recap to attendees. Post to a Slack or Teams channel. The account owner chooses who gets recap emails: the owner only, the team members, or both. The default is the owner only | A test recap arrives by email and in a Slack channel, and only to the people the owner chose |
| 12 | Free and paid plans | Check the limit before processing. Show an upgrade screen when it is reached. An admin changes limits without new code | Changing the free limit from 5 to 3 in the admin page takes effect right away |
| 13 | Team seats | The owner invites teammates by email. Members use the owner's plan | A teammate accepts an invite and sees shared notes |

Upload size: Supabase free plans cap each uploaded file at 50 MB ([source](https://dev.to/0012303/supabase-has-a-free-postgres-auth-storage-edge-functions-and-realtime-for-zero-dollars-4id4)). Meeting videos are often larger, so decide before building feature 1 whether to extract audio on the phone or upgrade the Supabase plan.

## Note statuses

Every note moves through these statuses. The app shows the current one with a progress animation.

1. **Uploading.** The file is being sent.
2. **Queued.** Waiting to be processed.
3. **Transcribing.** Speech is being turned into text.
4. **Summarizing.** The summary, action items, and mind map are being written.
5. **Ready.** Everything is available.
6. **Failed.** Something went wrong. Show a plain message and a Retry button. A failed note does not count toward the monthly limit.

## Translation rules

- The transcript stays in the language people spoke. Translations are separate saved copies.
- Every translation is labeled "Translated by AI" and has a "Show original" toggle.
- Each translation is saved once per note and language, so the same request is never paid for twice.
- Chat answers are written in the user's preferred language by default. The user can ask for another language in the chat.
- Names, numbers, and dates must not change in translation.

## Recording consent rules

- The meeting bot has a clear name, and it announces that it is recording when it joins.
- The meeting bot sits behind a feature switch that stays off until a lawyer has reviewed the consent wording. Nobody can send a bot to a call before then.
- Before a phone recording starts, show a short reminder to tell everyone that they are being recorded. Some US states require everyone to agree.
- First sign in includes a short note on consent.
- A lawyer reviews the consent wording before public launch.

## Not in version 1

Calendar auto-join, live notes during a call, CRM and task tool links, phone call recording, named speakers, clips, offline recording, API and Zapier, and white-label. See the project plan for the full list of later ideas.

## Open questions

- [x] Max length of 1 meeting on the free plan. Decided 2026-11-25: 60 minutes, in the plans table, enforced for every source.
- [ ] Paid plan limits and seat price.
- [x] Confirm what counts as 1 meeting. Decided 2026-11-18: see the limits table above and docs/decisions.md.
- [ ] Which languages to test translation with first, for example Spanish and Hindi.
- [ ] Audio extraction on the phone, or a bigger Supabase plan, for large video files.
