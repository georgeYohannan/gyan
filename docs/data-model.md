# gyan data model and AI prompts

This tab has 3 parts: the database tables, the steps a note goes through, and the exact prompts for the AI. Save it as docs/data-model.md in your code folder and add it to the Build project as knowledge. Claude Code should create the real tables from it, then check each name against the current Supabase docs.

## Database tables

A "meeting" is 1 note. An "account" is the paying workspace that owns notes and seats.

| Table | Holds | Key columns |
| --- | --- | --- |
| profiles | 1 row per person | id (same as login id), display_name, preferred_language, is_admin (default false) |
| plans | Limits for each plan. Prices live in RevenueCat and the stores | id, name, meetings_per_month, seats_included, max_meeting_minutes (can be empty), is_active |
| accounts | A workspace | id, owner_id, plan_id, created_at |
| account_members | Who belongs to which account | account_id, user_id, role (owner or member) |
| invites | Pending seat invites | account_id, email, token, status, created_at |
| usage | Meetings used each month | account_id, month, meetings_used |
| meetings | The notes | id, account_id, created_by, title, source (upload, phone, bot, or text), status, spoken_language, duration_seconds, file_path, error_message, created_at |
| transcript_segments | Transcript lines | id, meeting_id, speaker_label, start_ms, end_ms, text |
| summaries | Overview and key points | id, meeting_id, language, overview, key_points, decisions, open_questions |
| action_items | To-dos | id, meeting_id, text, owner_name, due_text, start_ms, done |
| mind_maps | Topic tree | id, meeting_id, language, tree |
| translations | Saved translations | id, meeting_id, kind (transcript, summary, action_items, or chat_message), source_id, language, content, created_at. Unique on kind, source_id, language |
| chunks | Searchable pieces of transcript | id, meeting_id, account_id, start_ms, end_ms, text, embedding (vector) |
| chat_threads | Side chat conversations | id, account_id, user_id, meeting_id (empty means all notes), created_at |
| chat_messages | Messages in a thread | id, thread_id, role (user or assistant), content, language, sources, created_at |
| integrations | Slack, Teams, and email settings | id, account_id, kind, settings, created_at. Keep any token encrypted |
| ai_usage | Cost tracking for the admin page | id, account_id, meeting_id, kind, provider, units, cost, created_at |

The search column on chunks needs a vector size. The size depends on which embedding model you pick, and notes can be in any language, so pick a multilingual one. This is an open decision. Ask Claude Code to check the current docs before creating the column.

## Who can see and change what

Turn on Row Level Security for every table, and write these rules in plain terms first:

- A signed in user can read rows only when the row's account is one of their own accounts, through account_members. This covers meetings, transcripts, summaries, action items, mind maps, translations, chunks, chats, and invites.
- Everyone on an account can read all of that account's notes. Only the owner can manage invites, billing, and integrations.
- Users cannot write to plans, usage, ai_usage, translations, summaries, mind_maps, chunks, or transcript_segments. Only server functions write to these.
- Only profiles where is_admin is true can open the admin page. The is_admin value is set by you in the Supabase dashboard and never by the app.
- Files go in a private storage bucket. The path starts with the account id, and the storage rules check it.

## Steps a note goes through

All steps run in Supabase server functions, so secret keys never reach the app.

1. The app uploads the file to the private bucket. A server function checks the plan limit, creates the meeting row, and sets the status to Queued.
2. The server function sends the audio to Deepgram with speaker labels and language detection on. It saves the result as transcript_segments and sets the status to Summarizing.
3. Claude writes the summary, decisions, and action items, using the summary prompt below. Claude writes the mind map with the mind map prompt. Both are saved in the user's preferred language.
4. The transcript is cut into chunks of about 1 to 2 minutes of speech. Each chunk gets an embedding and is saved in chunks, for search and side chat.
5. The status becomes Ready. Only now does the meeting count toward the monthly limit.
6. Every call to Deepgram, Claude, and the embedding model writes a row in ai_usage, so the admin page can show cost per user.

If any step fails, set the status to Failed, save a plain error message, and do not count the meeting. For meeting bot notes, Recall.ai sends the recording and transcript, and the steps start from step 3 or step 2. Ask Claude Code to read the current Recall.ai docs for the exact flow.

If a transcript is too long for 1 Claude request, summarize it in parts and then combine the parts. Ask Claude Code to check the current context limits in the Claude API docs, and keep the model name in a settings file, not in the code.

## AI prompts

These are the first versions. Test each with 3 real recordings and improve it. Values in double curly braces are filled in by the server function.

### 1. Summary and action items

```text
SYSTEM
You write meeting notes. Use only what is in the transcript. Never add facts. If something is unclear, say that it is unclear.
Write all text in {{language}}.
Each transcript line looks like this: [speaker, start time in ms] text.

Return JSON only, in this shape:
{
  "title": "short title, at most 8 words",
  "overview": "2 to 4 sentences",
  "key_points": ["..."],
  "decisions": ["..."],
  "action_items": [{"text": "...", "owner": "name or null", "due": "as said, or null", "start_ms": 0}],
  "open_questions": ["..."]
}

RULES
- owner is a name only when the transcript says who will do it. Otherwise null.
- due is a date or time only when someone said it. Otherwise null. Do not work out dates.
- Keep names, numbers, and dates exactly as spoken.
- start_ms is the start time of the line where the action item was said.
- If the transcript is too short or has no clear content, return empty lists and an overview that says so.

USER
Meeting type: {{meeting_type or "general"}}
Transcript:
{{transcript}}
```

### 2. Mind map

```text
SYSTEM
You turn a meeting transcript into a mind map. Use only what is in the transcript.
Write all labels in {{language}}.

Return JSON only, in this shape:
{"label": "main topic", "start_ms": 0, "children": [{"label": "...", "start_ms": 0, "children": []}]}

RULES
- At most 3 levels deep and at most 7 branches under any 1 topic.
- Each label is 1 to 5 words.
- start_ms is where the topic is first discussed.
- Group related ideas. Do not make a branch for small talk.

USER
Transcript:
{{transcript}}
```

### 3. Side chat answer

```text
SYSTEM
You answer questions about the user's own meeting notes. Use only the numbered passages below. Never use outside knowledge to fill gaps.
Answer in {{language}}, unless the user asks for another language.

RULES
- After each fact, add the passage number in square brackets, like [2].
- If the passages do not answer the question, say: "I could not find that in your notes." Then suggest 1 better question.
- Keep answers short. Use a short list only when the answer has several parts.
- Keep names, numbers, and dates exactly as written in the passages.
- Do not give legal, medical, or financial advice. You may report what was said in a meeting.

PASSAGES
[1] {{meeting title}}, {{date}}, at {{time}}: {{text}}
[2] ...

USER QUESTION
{{question}}
```

The app turns each number like [2] into a link that opens that note at that moment. To find the passages: turn the question into an embedding, find the closest chunks in the user's account (only in the open note when the chat is limited to 1 note), and pass the best ones.

### 4. Translation

```text
SYSTEM
Translate the content into {{target_language}}.

RULES
- Translate meaning faithfully. Do not add, remove, or explain anything.
- Translate every ordinary word, including technical, legal, financial, and business terms. A word being technical is not a reason to leave it in English.
- Leave unchanged only these: people's names, company, product and brand names, file names, code, web addresses, numbers, dates, times, speaker labels, and timestamps.
- If the input is JSON, translate only the text values. Keep every key and the structure exactly the same.
- Somebody who reads {{target_language}} and no English at all must be able to understand every sentence you write.
- Return only the translation.

USER
{{content}}
```

After a translation, the server function saves it in translations under the note, kind, source id, and language. The app labels it "Translated by AI" and offers "Show original".

The saved words carry the version of these rules that made them (`"v"` inside the saved content). When the rules above are changed, the version goes up by 1, and a translation saved under an older version is made again the next time somebody asks for it. Without that, a change to these rules would never reach anybody who had already translated a note.

## Open decisions

- [ ] Which embedding model and provider to use, and its vector size.
- [ ] Which meeting types to offer as templates (sales call, interview, lecture, standup).
- [ ] Whether summaries are made only in the preferred language, or also in the spoken language.
