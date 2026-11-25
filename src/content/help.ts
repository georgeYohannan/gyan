/**
 * ALL help text lives in this one file. Change the words here. No other file needs to change.
 *
 * Each entry has:
 *  - id: a short name the screen uses to find its help
 *  - title: the heading of the help panel
 *  - sentences: 2 to 4 short, plain sentences
 *  - lists: optional short lists under the sentences (for example, what each status means)
 *  - images: one or more screenshots (use fake data only) with a short description for screen readers
 *  - builderOnly: true shows a "For builders only" label
 */
import type { ImageSource } from 'expo-image';

export type HelpImage = { source: ImageSource | number; alt: string };

export type HelpList = { heading: string; items: string[] };

export type HelpEntry = {
  id: string;
  title: string;
  sentences: string[];
  lists?: HelpList[];
  images: HelpImage[];
  builderOnly?: boolean;
};

export const HELP: Record<string, HelpEntry> = {
  design: {
    id: 'design',
    title: 'The design page',
    builderOnly: true,
    sentences: [
      'This page shows every building block of the Gyan look in one place.',
      'Each block appears as normal, pressed, off, loading, and with an error.',
      'Use it to check that new screens match before you ship them.',
    ],
    images: [
      {
        // Metro needs require() for local images.
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        source: require('../../docs/help/images/design-390.png'),
        alt: 'The builders-only Design page on a phone, headed Design. A Text panel shows a Schibsted Grotesk heading and IBM Plex Sans body text, then a Buttons panel shows the primary, secondary and record buttons in their normal, pressed, off and loading states.',
      },
      {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        source: require('../../docs/help/images/design-1280.png'),
        alt: 'The same Design page on a wide web window, with the navigation as a sidebar down the left and the panels laid out wider.',
      },
    ],
  },
  home: {
    id: 'home',
    title: 'Home',
    sentences: [
      'Home shows your 10 newest notes. Show more adds 20 more at a time.',
      'Tap New note to add a conversation. It is also in the bar along the bottom.',
      'Search looks inside the title, the summary and every word that was said.',
      'A note only stands out when it needs something from you.',
    ],
    lists: [
      {
        heading: 'Finding a note',
        items: [
          'Type in the search box. Gyan waits until you stop typing, then looks.',
          'Each result shows the words it found and says where it found them.',
          'If the words came from something somebody said, tapping the note opens it at that moment.',
          'See every matching line opens a list of the lines themselves, not the notes.',
          'Searching knows English word endings, so "meeting" also finds "meetings".',
          'In other languages it finds the word exactly as you type it. Japanese, Chinese and Korean are the weak spot: a whole phrase works, a single word inside one often does not.',
        ],
      },
      {
        heading: 'Narrowing the list',
        items: [
          'Filters lets you pick when, what state, where it came from, and whether anything is still to do.',
          'Filters work together, and with whatever you have searched for.',
          'The number of notes found is shown above the list.',
          'Each filter you have on appears as a pill you can tap to take off. Clear filters takes off all of them.',
          'Today and This month are counted where you are. The monthly meeting count is kept in UTC time, so around the 1st the two can differ by a few hours.',
        ],
      },
      {
        heading: 'What a colour on a note means',
        items: [
          'An orange edge down the left: this note still has something to do.',
          'A thin blue line underneath: Gyan is still working on it.',
          'A red card: it did not work. The message on it says why.',
          'No colour at all: it is finished and nothing is owed.',
        ],
      },
      {
        heading: 'Sharing or deleting one note',
        items: [
          'Tap the three dots on the right of a note.',
          'On a phone you can also swipe the note to the left.',
          'Share sends a recap email. There is no share link yet.',
          'Delete asks you first, names the note, and lists what will go.',
          'A note somebody else made cannot be deleted, and the menu says so.',
        ],
      },
      {
        heading: 'Deleting several notes at once',
        items: [
          'Tap Select, tap the notes you want, then tap Delete.',
          'One box asks you first, and lists what will go.',
          'Deleting also removes the recordings and files.',
          'It does not give you the meetings back this month.',
          'You can delete a note you made. If you own the account you can delete any of them. A note somebody else made cannot be ticked.',
        ],
      },
      {
        heading: 'What each status means',
        items: [
          'Uploading: your file is on its way.',
          'Queued: your note is waiting for its turn.',
          'Transcribing: Gyan is turning the talking into text.',
          'Summarizing: Gyan is reading the note and writing the summary and the to-do list. If it stays here a long time, a button appears to start it again.',
          'Ready: your note is done.',
          'Failed: something went wrong. A message tells you what.',
        ],
      },
      {
        heading: 'What the monthly limit means',
        items: [
          'Your plan lets you finish a set number of meetings each month.',
          'A meeting counts only when it is Ready.',
          'Pasted text never counts. Failed notes never count.',
          'Home says nothing about this until your last meeting of the month. The whole count is on the New note screen, and in Settings under Plan and usage.',
          'When you have used them all, uploads wait until the 1st of next month.',
        ],
      },
    ],
    images: [
      {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        source: require('../../docs/help/images/home-notes-390.png'),
        alt: 'Home on a phone, headed Your notes, with a glowing blue New note button under it, then a search box, a Filters button, and a line saying 6 notes with Select on the right. The notes are grouped under Today, Yesterday and November. Weekly team call has an orange edge down its left and says Still has something to do. Customer call: Northwind has a blue Transcribing label and a thin blue line underneath. Design review sits in a red card saying We could not read this audio file. Every note has three dots on its right. A bar along the bottom holds Home, Search, New note, Ask and Settings.',
      },
      {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        source: require('../../docs/help/images/home-empty-390.png'),
        alt: 'Home on a phone with no notes yet, headed Your notes. A glowing blue New note button sits above one panel that says No notes yet and asks you to add your first conversation by uploading a file or pasting some text.',
      },
      {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        source: require('../../docs/help/images/home-notes-1280.png'),
        alt: 'The same Home screen on a wide web window. The navigation is a sidebar down the left, under the Gyan name, holding Home, Search, New note, Ask and Settings, and the New note button is the width of its words rather than the whole page.',
      },
    ],
  },
  search: {
    id: 'search',
    title: 'Search',
    sentences: [
      'Search looks through every line of every note you can see.',
      'Each result is one line somebody said, with the moment it was said.',
      'Tapping a result opens that note and jumps to that line.',
      'Home searches whole notes. This searches the lines inside them.',
    ],
    lists: [
      {
        heading: 'What it can and cannot do',
        items: [
          'It finds the words that were actually said or typed.',
          'It does not yet find a topic worded differently. Asking for "cost" will not find "pricing" unless somebody said "cost".',
          'A note still being transcribed has no words to find yet.',
          'You only ever see lines from your own account.',
        ],
      },
    ],
    images: [
      {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        source: require('../../docs/help/images/search-390.png'),
        alt: 'The Search screen on a phone, headed Search, with sign up typed in the box and a line saying 2 lines in 1 note. Each result is a flat row with a hairline under it: the note title on the left, the date on the right, the speaker name in small spaced capitals, the line they said with the searched words picked out in blue, and a pill holding the moment it was said.',
      },
      {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        source: require('../../docs/help/images/search-1280.png'),
        alt: 'The same Search screen on a wide web window, with the sidebar down the left and the results laid out wider.',
      },
    ],
  },
  ask: {
    id: 'ask',
    title: 'Asking across all your notes',
    sentences: [
      'Ask one question and Gyan answers it from several of your notes at once.',
      'It reads only what was said in them. It never makes anything up and never looks anything up elsewhere.',
      'Every answer names the notes it used, and the small numbers take you to the exact line.',
      'To ask about one note on its own, open it and choose Chat.',
    ],
    lists: [
      {
        heading: 'What you can ask',
        items: [
          'What did I promise to do?',
          'What is still open across my notes?',
          'What has been decided about pricing?',
          'Anything else in your own words, like "What did Priya say about the launch?".',
          'The first time you open Ask, 3 questions are offered. Tap one to try it.',
        ],
      },
      {
        heading: 'How Gyan chooses which notes to read',
        items: [
          'It looks for the words of your question in your notes, and reads the few that match best.',
          'At most 4 notes go into one answer, so a question stays quick and cheap.',
          'It finds notes where somebody SAID a word. It does not yet find a note about the same thing worded differently.',
          'Asking about "cost" will not find a meeting that only ever said "pricing".',
          'That is the same limit the Search screen has, and it needs a different kind of search to fix.',
        ],
      },
      {
        heading: 'What the little numbers mean',
        items: [
          'A small number in an answer is the part of a note that answer came from.',
          'Tap it. That note opens, on the Transcript tab, with the line outlined in blue.',
          'The number says which note it goes to, so a screen reader reads "Go to Weekly team call at 1:05".',
          'On a recording it points at a spoken line. On a pasted note it points at a paragraph.',
        ],
      },
      {
        heading: 'If it says it could not find something',
        items: [
          'Gyan says "I could not find that in your notes" when no note has the answer.',
          'That is on purpose. It would rather say nothing than make something up.',
          'Try a word somebody would have said out loud, like a person\'s name or the name of a project.',
          'A note needs its words before it can be asked about, so a note still being written is not read.',
        ],
      },
      {
        heading: 'Questions, and where this chat is kept',
        items: [
          'Asking here uses the same daily questions as the chat inside a note. There is one allowance, not two.',
          'When only a few are left, it quietly tells you how many. They come back the next day.',
          'If an answer goes wrong, Retry does not use up another question.',
          'This conversation is saved and separate from every note chat, and only you can see it.',
        ],
      },
    ],
    images: [
      {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        source: require('../../docs/help/images/ask-390.png'),
        alt: 'The Ask screen on a phone, headed Ask with the line One question, answered from your notes. A question from You says "What did I promise to do?" and an answer from Gyan says that in Weekly team call you promised to ship the sign up screen on Friday, with a small round number 2, and that in Pricing chat you agreed to send the new numbers, with a small round number 5. The question box and a Send button are pinned along the bottom, above the navigation bar with Ask underlined in blue.',
      },
      {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        source: require('../../docs/help/images/ask-empty-390.png'),
        alt: 'A new Ask screen on a phone. It says Ask one question and Gyan reads your notes to answer it, that it answers only from what was said in them, and that every answer says which note it came from. Three questions are offered as buttons above the question box: What did I promise to do?, What is still open across my notes?, and What has been decided about pricing?',
      },
      {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        source: require('../../docs/help/images/ask-1280.png'),
        alt: 'The same Ask conversation on a wide web window, with the navigation as a sidebar down the left and Ask marked with a blue line. The answer fits on two lines, each ending with its small round number before the full stop.',
      },
      {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        source: require('../../docs/help/images/ask-empty-1280.png'),
        alt: 'A new Ask screen on a wide web window, with the same three suggested questions sitting as pills above the question box.',
      },
    ],
  },
  newNote: {
    id: 'newNote',
    title: 'New note',
    sentences: [
      'Pick how you want to add your conversation.',
      'Upload and Paste text work now. Record and Meeting link are coming soon.',
      'Your files are private. Only people on your account can see them.',
    ],
    lists: [
      {
        heading: 'Files that work',
        items: [
          'Audio: MP3, M4A, WAV.',
          'Video: MP4, MOV. Gyan takes the sound out of the video first, so the file is much smaller.',
          'Text: TXT or MD files.',
        ],
      },
      {
        heading: 'How big can a file be?',
        items: [
          'Up to 50 MB.',
          'On the web, videos are shrunk to just the sound before they upload.',
          'On phones, a video bigger than 50 MB is too big for now.',
        ],
      },
      {
        heading: 'If an upload fails',
        items: ['You will see a message and a Retry button. Tap Retry to try again.'],
      },
    ],
    images: [
      {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        source: require('../../docs/help/images/new-note-390.png'),
        alt: 'The New note screen on a phone. Under the title, a heading asks How do you want to add it? with a line under it, then 4 choices: Record and Meeting link are dimmed with a Coming soon label, and Upload and Paste text are ready to tap. Below them: Meetings used this month, 2 of 5, a meter of five blocks with two filled, and the words Free plan.',
      },
      {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        source: require('../../docs/help/images/new-note-1280.png'),
        alt: 'The same New note screen on a wide web window, with the same 4 choices and the same meter.',
      },
    ],
  },
  note: {
    id: 'note',
    title: 'Your note',
    sentences: [
      'This page shows one note. It has three tabs: Summary, Transcript and Chat.',
      'The Summary tab has a short summary of the meeting and a to-do list you can tick off.',
      'The Transcript tab shows what people said, line by line, with who spoke and when.',
      'The label under the title tells you where the note is right now.',
    ],
    lists: [
      {
        heading: 'What the Summary tab shows',
        items: [
          'A few sentences at the top saying what the meeting was about.',
          'Key points: the things worth remembering.',
          'Decisions: what people agreed to do or chose.',
          'Open questions: things nobody answered yet.',
          'Action items: the to-do list, with a name and a date when somebody said one.',
          'A part is left out when the meeting had nothing to put in it.',
        ],
      },
      {
        heading: 'What is behind More',
        items: [
          'Your language: the language Gyan writes your summaries, to-dos and chat answers in.',
          'Translate this summary or transcript into another language.',
          'Send a recap by email to people on your account.',
          'A line that cannot be used yet says why, rather than just going grey.',
        ],
      },
      {
        heading: 'Ticking action items',
        items: [
          'Tap an action item to tick it off. Tap it again to untick it.',
          'The count above the list shows how many are done.',
          'Only you and your team can see your notes, so only they see your ticks.',
          'Gyan writes the name and the date only when somebody said them out loud.',
        ],
      },
      {
        heading: 'What Regenerate does',
        items: [
          'Regenerate asks the AI to write the summary again.',
          'Gyan asks you first, because each new summary costs money.',
          'The summary and the to-do list are replaced, and your ticks are cleared.',
          'Your transcript is never changed by Regenerate.',
          'Copy puts the summary and the to-do list on your clipboard, to paste anywhere.',
        ],
      },
      {
        heading: 'What each status means',
        items: [
          'Uploading: your file is on its way.',
          'Queued: your note is waiting for its turn.',
          'Transcribing: Gyan is turning the talking into text. This page updates by itself.',
          'Summarizing: Gyan is reading the note and writing the summary and the to-do list. If it stays here a long time, a button appears to start it again.',
          'Ready: your note is done and the transcript is here.',
          'Failed: something went wrong. A message tells you what.',
        ],
      },
      {
        heading: 'Notes you pasted or uploaded as text',
        items: [
          'These have no recording, so nobody spoke them and there are no speakers or times.',
          'The Transcript tab shows their words as Paragraph 1, Paragraph 2, and so on.',
          'You can still ask questions about them, and the little numbers point at a paragraph.',
        ],
      },
      {
        heading: 'What the speaker labels mean',
        items: [
          'Speaker 1, Speaker 2, and so on are different voices that Gyan heard.',
          'Gyan does not know real names. It only tells voices apart.',
          'The time is how far into the recording the line starts.',
        ],
      },
      {
        heading: 'Why a speaker can be wrong',
        items: [
          'Gyan guesses who is talking from the sound of each voice.',
          'It can mix up two people who sound alike, or people who talk at the same time.',
          'Noise, an echo, a far-away microphone, or a very short sentence also cause mistakes.',
          'The words are usually right even when the speaker is wrong.',
        ],
      },
      {
        heading: 'If your note says Failed',
        items: [
          'Read the message on the note. It says what went wrong.',
          'A Failed note does not use up one of your meetings.',
          'If the summary went wrong, your transcript is still there. Tap Retry summary on the Summary tab.',
          'If the transcript went wrong, tap Retry on the Transcript tab.',
          'If the message says the file could not be read, upload a different file.',
        ],
      },
    ],
    images: [
      {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        source: require('../../docs/help/images/note-summary-390.png'),
        alt: 'The Summary tab of a note on a phone. The title Weekly team call is set large with a green Ready label under it, then three underlined tabs — Summary, Transcript and Chat — and a More button. The summary opens with one large paragraph, then Key points, Decisions and Open questions as headings with a hairline under each, then Action items with 1 of 3 done, a thin orange meter, and three to-dos with tick boxes. One is ticked and crossed out. Copy and Regenerate sit at the bottom.',
      },
      {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        source: require('../../docs/help/images/note-summary-1280.png'),
        alt: 'The same Summary tab on a wide web window, with the sidebar down the left and the Copy and Regenerate buttons under the action items.',
      },
      {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        source: require('../../docs/help/images/note-summary-empty-390.png'),
        alt: 'A note on a phone with a blue Summarizing label under its large title. One panel says No summary yet, that Gyan is reading the note and writing the summary, and that the page updates by itself.',
      },
      {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        source: require('../../docs/help/images/note-summary-empty-1280.png'),
        alt: 'The same waiting note on a wide web window.',
      },
      {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        source: require('../../docs/help/images/note-transcript-390.png'),
        alt: 'The Transcript tab of a note on a phone. Under the tabs a quiet line says Spoken language: en, then each line of the conversation: the speaker name in small spaced capitals with the time beside it, the words underneath, and a hairline between one line and the next.',
      },
      {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        source: require('../../docs/help/images/note-transcript-1280.png'),
        alt: 'The same Transcript tab on a wide web window, with the sidebar down the left and the lines laid out wider.',
      },
      {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        source: require('../../docs/help/images/note-failed-390.png'),
        alt: 'A Failed note on a phone. A red Failed label sits under the large title, and a red-edged panel says This note did not work, that Gyan could not write a summary, that the note did not use up one of your meetings, that the transcript is still on the Transcript tab, and offers a Retry summary button.',
      },
      {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        source: require('../../docs/help/images/note-failed-1280.png'),
        alt: 'The same Failed note on a wide web window, with the sidebar down the left and the same message and Retry summary button.',
      },
    ],
  },
  noteChat: {
    id: 'noteChat',
    title: 'Asking about your note',
    sentences: [
      'Open the Chat tab to ask anything about this note.',
      'Gyan only reads this one note. It never makes things up, and it never looks anything up elsewhere.',
      'Every answer shows small numbers. Tap one to jump to the place the answer came from.',
      'To ask a question of all your notes at once, use Ask in the navigation instead.',
    ],
    lists: [
      {
        heading: 'What you can ask',
        items: [
          'What were the decisions?',
          'What did I promise to do?',
          'What is still open?',
          'Anything else in your own words, like "What did Priya say about Friday?".',
          'The first time you open the chat, 3 questions are offered. Tap one to try it.',
        ],
      },
      {
        heading: 'What the little numbers mean',
        items: [
          'A small number in an answer is the part of the note that answer came from.',
          'Tap it. The Transcript tab opens and that part is outlined in blue.',
          'On a recording it points at a spoken line. On a pasted note it points at a paragraph.',
          'Tap a different number to move the blue outline there.',
          'Switching tab by hand clears the outline.',
        ],
      },
      {
        heading: 'If it says it could not find something',
        items: [
          'Gyan says "I could not find that in your notes" when the answer is not in this note.',
          'That is on purpose. It would rather say nothing than make something up.',
          'It then suggests a question that this note can answer.',
          'A note needs its words before you can ask about it. Until then the Chat tab says so.',
        ],
      },
      {
        heading: 'How many questions you get a day',
        items: [
          'Your plan says how many questions you can ask each day.',
          'When only a few are left, the chat quietly tells you how many.',
          'When they run out, you get a new set the next day.',
          'If an answer goes wrong, Retry does not use up another question.',
        ],
      },
      {
        heading: 'Where your chat is kept',
        items: [
          'Your questions and answers are saved, so they are still there after you close the app.',
          'Only you can see your chat. Even people on your team cannot read it.',
          'Each note has its own separate chat, and Ask has its own again.',
          'Questions here and questions in Ask come out of the same daily allowance.',
        ],
      },
    ],
    images: [
      {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        source: require('../../docs/help/images/note-chat-390.png'),
        alt: 'The Chat tab of a note on a phone. The tabs read Summary, Transcript and Chat, with Chat underlined in blue. A question from You says "What were the decisions?" and an answer from Gyan says the sign up screen ships on Friday, with a small round number 3 at the end. The question box and a Send button are pinned along the bottom.',
      },
      {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        source: require('../../docs/help/images/note-chat-empty-390.png'),
        alt: 'A new Chat tab on a phone. It says Gyan answers only from what was said in this note and shows you where each answer came from. Three questions are offered as buttons above the question box: What were the decisions?, What did I promise to do?, and What is still open?',
      },
      {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        source: require('../../docs/help/images/note-chat-cited-390.png'),
        alt: 'The Transcript tab on a phone after tapping a number in an answer. The line at 1 minute 5 seconds, where Priya says she will send the test plan on Friday, sits in a raised card with a blue edge down its left.',
      },
      {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        source: require('../../docs/help/images/note-chat-1280.png'),
        alt: 'The same Chat tab on a wide web window, filling the page under the tabs, with the navigation as a sidebar down the left.',
      },
      {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        source: require('../../docs/help/images/note-chat-empty-1280.png'),
        alt: 'A new Chat tab on a wide web window, with the same three suggested questions above the question box.',
      },
      {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        source: require('../../docs/help/images/note-chat-cited-1280.png'),
        alt: 'The Transcript tab on a wide web window, with the line at 1 minute 5 seconds in a raised card with a blue edge, and the Summary, Transcript and Chat tabs above it.',
      },
    ],
  },
  translation: {
    id: 'translation',
    title: 'Languages and translating',
    sentences: [
      'More on a note, or Profile in Settings, is where you choose the language Gyan writes in. Your summaries, your to-dos and the chat answers all use it.',
      'Tap Translate to turn the note you are reading into any other language, without changing your own setting.',
      'Translated words always say "Translated by AI", because a person did not write them.',
      'Tap Show original at any time to put the first words back.',
    ],
    lists: [
      {
        heading: 'What gets translated',
        items: [
          'The summary, the key points, the decisions and the open questions',
          'Your to-do list, with its ticks left alone',
          'The transcript, line by line',
          'Names, numbers, dates and times are left exactly as they were',
        ],
      },
      {
        heading: 'Good to know',
        items: [
          'You can also change your language from the Language button on any note.',
          'A language you have asked for before opens straight away and costs nothing.',
          'A very long recording cannot be translated in one go yet. Its summary still can.',
          'Arabic reads from right to left on the page, the way it is written.',
          'The speaker names and the times never change, so you can still follow who said what.',
        ],
      },
    ],
    images: [
      {
        // Metro needs require() for local images.
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        source: require('../../docs/help/images/language-picker-390.png'),
        alt: 'The list of languages open on a phone, headed Translate this summary, with each language shown in its own letters above its English name, and a Close button along the bottom.',
      },
      {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        source: require('../../docs/help/images/note-translated-390.png'),
        alt: 'A summary in Spanish on a phone. A panel above it says Translated by AI, Spanish, names, numbers and times are unchanged, and offers Show original. The headings Key points, Decisions and Open questions stay in English while the words under them are Spanish.',
      },
      {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        source: require('../../docs/help/images/note-original-390.png'),
        alt: 'The same note on a phone after tapping Show original, with the English words back.',
      },
      {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        source: require('../../docs/help/images/language-picker-1280.png'),
        alt: 'The list of languages open on a wide window, as a panel on the right.',
      },
      {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        source: require('../../docs/help/images/note-translated-1280.png'),
        alt: 'A summary in Spanish on a wide window, with the words Translated by AI above it.',
      },
      {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        source: require('../../docs/help/images/note-original-1280.png'),
        alt: 'The same note on a wide window after tapping Show original, with the English words back.',
      },
    ],
  },

  recapEmail: {
    id: 'recapEmail',
    title: 'Sending a recap by email',
    sentences: [
      'A recap is an email with a note\u2019s summary and action items in it.',
      'Tap Send recap on a note to send one. It shows you exactly who will get it, and asks before anything goes.',
      'Gyan only emails people who are on your account. You can never type in an address.',
      'The account owner picks who gets recaps, and whether they go out on their own.',
    ],
    lists: [
      {
        heading: 'What is in the email',
        items: [
          'The note\u2019s title and the date',
          'The overview, the key points and the decisions',
          'The action items, with who they are for and when they are due',
          'A button that opens the note in Gyan',
        ],
      },
      {
        heading: 'Good to know',
        items: [
          'Everybody gets the recap in the language they have chosen, and translated words say "Translated by AI".',
          'Every email has a Turn off recaps link at the bottom.',
          'A note only ever sends itself once, so writing a new summary does not email everybody again.',
          'Only the account owner can change who gets recaps. Everybody else can see the setting.',
          'Every email Gyan sends is written down, so you can always check what went where.',
        ],
      },
    ],
    images: [
      {
        // Metro needs require() for local images.
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        source: require('../../docs/help/images/recap-dialog-390.png'),
        alt: 'The Send recap box slid up over a note on a phone, listing two made-up addresses with a tick box each — one marked you, one marked on your team, in Hindi — with Send recap and Change recap settings along the bottom.',
      },
      {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        source: require('../../docs/help/images/recap-email-390.png'),
        alt: 'A recap email on a phone, with the note title, the key points, the action items and a blue button.',
      },
      {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        source: require('../../docs/help/images/recap-settings-390.png'),
        alt: 'The Recap emails page on a phone, with switches for who gets a recap and when it is sent.',
      },
      {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        source: require('../../docs/help/images/recap-dialog-1280.png'),
        alt: 'The Send recap box on a wide window, as a panel on the right.',
      },
      {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        source: require('../../docs/help/images/recap-email-1280.png'),
        alt: 'The same recap email on a wide window.',
      },
      {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        source: require('../../docs/help/images/recap-settings-1280.png'),
        alt: 'The Recap emails page on a wide window, with the same switches laid out wider.',
      },
    ],
  },

  settings: {
    id: 'settings',
    title: 'Settings',
    sentences: [
      'Settings is where you change things about you and about your account.',
      'Each row says what it is set to now, so you can often check something without opening it.',
      'The rows are in two groups: your account, and how Gyan works on your behalf.',
      'Tap a row to open it. The ? button on every page explains that page.',
    ],
    lists: [
      {
        heading: 'Your account',
        items: [
          'Profile: your name, your email, the language Gyan writes in, and your password.',
          'Plan and usage: which plan you are on, and how much of it you have used.',
          'Team: the people who share this account, and inviting more of them.',
        ],
      },
      {
        heading: 'How Gyan works',
        items: [
          'Recaps: who gets a recap email, and when.',
          'Security: two-factor sign in, when you are signed out, and what has happened on the account.',
          'Data and privacy: how long notes are kept, downloading a copy, deleting a note, or deleting your account.',
        ],
      },
      {
        heading: 'Signing out',
        items: ['Log out is at the bottom of the page, under the email you are signed in as.'],
      },
    ],
    images: [
      {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        source: require('../../docs/help/images/settings-390.png'),
        alt: 'The Settings list on a phone, in two named groups. Your account holds Profile, Plan and usage and Team; How Gyan works holds Recaps, Security and Data and privacy, with a hairline between rows. Each row says what it is set to right now. Signed in as test.a@example.com and a Log out button sit quietly at the bottom.',
      },
      {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        source: require('../../docs/help/images/settings-1280.png'),
        alt: 'The same Settings list on a wide web window, with the navigation as a sidebar down the left.',
      },
    ],
  },
  settingsProfile: {
    id: 'settingsProfile',
    title: 'Your profile',
    sentences: [
      'This page is about you, not about your account. Only you can change it.',
      'Your name is what your team sees next to the notes you make.',
      'The language you pick here is the one Gyan writes your summaries, your to-dos and its chat answers in.',
      'You can change your password here. Type the new one twice, and you stay signed in.',
    ],
    lists: [
      {
        heading: 'Good to know',
        items: [
          'You can also change the language from any note, without coming here.',
          'Your email is how you sign in, so it cannot be changed here. Ask us if you need to.',
          'A password needs at least 8 characters.',
        ],
      },
    ],
    images: [
      {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        source: require('../../docs/help/images/settings-profile-390.png'),
        alt: 'The Profile page on a phone, with a name box, an email, the language, and two password boxes.',
      },
      {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        source: require('../../docs/help/images/settings-profile-1280.png'),
        alt: 'The same Profile page on a wide web window.',
      },
    ],
  },
  settingsPlan: {
    id: 'settingsPlan',
    title: 'Plan and usage',
    sentences: [
      'This shows which plan your account is on, and how much of it has been used.',
      'The bar is the meetings you have used this month. It starts again on the 1st.',
      'Every number here comes from your plan, so it changes by itself when your plan does.',
    ],
    lists: [
      {
        heading: 'Two different counts',
        items: [
          'Meetings are counted for the whole account. Everybody on it shares them.',
          'Chat questions are counted for you alone, and start again every day.',
          'Pasted text never counts as a meeting, and still works when you are at the limit.',
          'A note that failed does not count either.',
        ],
      },
    ],
    images: [
      {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        source: require('../../docs/help/images/settings-plan-390.png'),
        alt: 'Plan and usage on a phone. One panel says Meetings used this month, 2 of 5, with a meter of five blocks and two filled, and the line 3 left. They start again on the 1st. Below it: Chat questions today 4 of 20, what the Free plan includes, and a greyed-out Upgrade — coming soon.',
      },
      {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        source: require('../../docs/help/images/settings-plan-1280.png'),
        alt: 'The same Plan and usage page on a wide web window.',
      },
    ],
  },
  settingsTeam: {
    id: 'settingsTeam',
    title: 'Your team',
    sentences: [
      'A team is the people who share one account. They can all read the same notes.',
      'The account owner invites people by email. Everybody else can see the team but not change it.',
      'A seat is taken by somebody on the account, and by an invite that is still waiting.',
      'When the seats are full, free one up by removing somebody or taking an invite back.',
    ],
    lists: [
      {
        heading: 'Inviting somebody',
        items: [
          'Type their email address and tap Send invite.',
          'They get an email with a link. The link only works for that address.',
          'The link stops working after 14 days. Send a new one if it runs out.',
          'Until they join, their invite is holding a seat. Take it back to free the seat.',
        ],
      },
      {
        heading: 'Removing somebody',
        items: [
          'The notes they made stay here, with the account.',
          'Their own chats go with them, because only they could ever read those.',
          'They keep their Gyan login, with a workspace of their own.',
          'You can invite them back at any time.',
        ],
      },
    ],
    images: [
      {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        source: require('../../docs/help/images/settings-team-390.png'),
        alt: 'The Team page on a phone, showing seats used, a box to invite somebody by email, and a list of made up people.',
      },
      {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        source: require('../../docs/help/images/settings-team-1280.png'),
        alt: 'The same Team page on a wide web window.',
      },
    ],
  },
  settingsSecurity: {
    id: 'settingsSecurity',
    title: 'Security',
    sentences: [
      'This page makes your account harder to get into, and shows what has happened on it.',
      'Two-factor sign in asks for a 6-digit code from an app on your phone, as well as your password. A stolen password is then not enough on its own.',
      'Gyan signs you out if you walk away and do nothing for a while. Reading, typing and uploading all count as using it.',
      'The record at the bottom cannot be changed or deleted by anybody, including Gyan. Only the account owner can see it.',
    ],
    lists: [
      {
        heading: 'What the record keeps',
        items: [
          'Signing in.',
          'Opening, exporting, emailing and deleting a note.',
          'Changes to the team, and changes to these settings.',
          'It never keeps the words of a meeting. Only what happened, to which note, and when.',
        ],
      },
      {
        heading: 'If you lose the phone with your authenticator app',
        items: [
          'Email gyan@gyantechai.com from the address you sign in with. We will switch the code off so you can get back in.',
          'Keep the typed code somewhere safe when you set it up. With it you can add the app to a new phone yourself, with nobody\u2019s help.',
          'Do not ask to be removed from the team and invited again. That works, but you would lose your own chats.',
        ],
      },
    ],
    images: [
      {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        source: require('../../docs/help/images/settings-security-390.png'),
        alt: 'The Security page on a phone: two-factor sign in, the automatic sign out time, and the record of what has happened.',
      },
      {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        source: require('../../docs/help/images/settings-security-1280.png'),
        alt: 'The same Security page on a wide web window.',
      },
    ],
  },

  settingsData: {
    id: 'settingsData',
    title: 'Data and privacy',
    sentences: [
      'This page decides how long Gyan keeps your notes, what its emails may carry, and how to take a copy or delete something.',
      'You can download everything Gyan holds about you as one file, whenever you want.',
      'Deleting a note removes its recording, its transcript, its summary, its to-dos and its chat.',
      'Deleting your account removes everything you made, and lists the few records that stay and why.',
    ],
    lists: [
      {
        heading: 'How long notes are kept',
        items: [
          'For ever, or 30, 90 or 365 days. Only the account owner can change it.',
          'Notes older than the time you pick are deleted on their own, with their recordings.',
          'Keeping less is safer if anything ever goes wrong. Nothing comes back once it is gone.',
        ],
      },
      {
        heading: 'What recap emails carry',
        items: [
          'The whole summary, or a link only.',
          'An email sits in an inbox, gets forwarded and syncs to phones, so some workspaces would rather send only a link.',
          'With a link only, what was said never leaves Gyan.',
        ],
      },
      {
        heading: 'Downloading a copy of everything',
        items: [
          'One file holding every note on this workspace, with its transcript, summary and to-dos.',
          'Your own chats are in it. Nobody else\u2019s are, even on a shared account.',
          'The recordings are in it too. A recording too big to fit is listed with its own link instead.',
          'The download link works for one hour. Ask again any time for a fresh one.',
        ],
      },
      {
        heading: 'Before you delete a note',
        items: [
          'It does not give you the meeting back this month. It was already counted.',
          'Only the person who made a note, or the account owner, can delete it.',
          'A note somebody else made has no Delete button, and says why.',
          'The ten newest notes are listed, with how many you have in all. Show more brings twenty more.',
        ],
      },
      {
        heading: 'Before you delete your account',
        items: [
          'If other people are still on your account, remove them on the Team page first.',
          'You have to type DELETE, so it cannot happen by accident.',
          'A few records stay: what happened on the account, a line for each email sent, and what each AI call cost. The screen lists them with the reason. None holds a word anybody said.',
          'If you are on somebody else\u2019s team, the notes you made stay with them.',
        ],
      },
    ],
    images: [
      {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        source: require('../../docs/help/images/settings-data-390.png'),
        alt: 'Data and privacy on a phone: how long notes are kept, what recap emails carry, downloading a copy, then "12 notes, showing the 10 newest" above ten made up notes each with a Delete button, a Show more button, and a red Delete account panel.',
      },
      {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        source: require('../../docs/help/images/settings-data-1280.png'),
        alt: 'The same Data and privacy page on a wide web window.',
      },
    ],
  },
  signUp: {
    id: 'signUp',
    title: 'Sign up',
    sentences: [
      'Type your email. We use it to log you in and to send you a link to confirm it.',
      'Pick a password with at least 8 characters. Only you should know it.',
      'Tap Sign up. We may email you a link. Open it, then come back and log in.',
      'No email after a few minutes? Look in your spam folder, check the spelling of your email, then try again.',
    ],
    images: [
      {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        source: require('../../docs/help/images/signup-390.png'),
        alt: 'The Sign up screen on a phone. Create your account is set large, with Free to start. You get 5 meetings a month under it, then one panel holding an Email box, a Password box, the line At least 12 characters, and a glowing blue Sign up button. Already have an account? Log in sits below.',
      },
      {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        source: require('../../docs/help/images/signup-1280.png'),
        alt: 'The same Sign up screen on a wide web window, with the panel and the glowing blue Sign up button laid out wider.',
      },
    ],
  },
  logIn: {
    id: 'logIn',
    title: 'Log in',
    sentences: [
      'Type the email and password you signed up with.',
      'Tap Log in. You will land on your Home screen.',
      'Forgot your password? A reset button is not ready yet. For now, ask the Gyan team to reset it for you.',
      'Did you never get the confirmation email? Check your spam folder. Then sign up again with the same email to get a new one.',
    ],
    images: [
      {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        source: require('../../docs/help/images/login-390.png'),
        alt: 'The Log in screen on a phone. Welcome back is set large, with Log in to see your notes under it, then one panel holding an Email box, a Password box and a glowing blue Log in button. New to Gyan? Sign up sits below.',
      },
      {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        source: require('../../docs/help/images/login-1280.png'),
        alt: 'The same Log in screen on a wide web window, with the panel and the glowing blue Log in button laid out wider.',
      },
    ],
  },
};

export function getHelp(id: string): HelpEntry | undefined {
  return HELP[id];
}
