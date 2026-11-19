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
        alt: 'The design page on a phone-sized window, with dark navy panels and a glowing blue button.',
      },
      {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        source: require('../../docs/help/images/design-1280.png'),
        alt: 'The design page on a wide web window, with the same panels laid out wider.',
      },
    ],
  },
  home: {
    id: 'home',
    title: 'Home',
    sentences: [
      'Home shows all your notes, newest first.',
      'Tap New note to add a conversation.',
      'The box at the top shows how many meetings you have used this month, and how many your plan allows.',
    ],
    lists: [
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
          'When you have used them all, uploads wait until the 1st of next month.',
        ],
      },
    ],
    images: [
      {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        source: require('../../docs/help/images/home-notes-390.png'),
        alt: 'The Home screen on a phone-sized window. A box says 0 of 5 meetings used, a blue New note button sits below it, and 4 notes are listed with Queued, Transcribing, Ready, and Failed labels.',
      },
      {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        source: require('../../docs/help/images/home-empty-390.png'),
        alt: 'The Home screen on a phone-sized window with no notes yet. It says No notes yet and asks you to upload a file or paste some text.',
      },
      {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        source: require('../../docs/help/images/home-notes-1280.png'),
        alt: 'The Home screen on a wide web window, with the same box, button, and list of notes laid out wider.',
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
        alt: 'The New note screen on a phone-sized window. It shows 4 choices: Record and Meeting link are dimmed with a Coming soon label, and Upload and Paste text are ready to tap.',
      },
      {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        source: require('../../docs/help/images/new-note-1280.png'),
        alt: 'The New note screen on a wide web window with the same 4 choices.',
      },
    ],
  },
  note: {
    id: 'note',
    title: 'Your note',
    sentences: [
      'This page shows one note. It has two tabs: Summary and Transcript.',
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
        alt: 'The Summary tab of a note on a phone-sized window. A green Ready label sits under the title, then Summary and Transcript tabs, then a few sentences about the meeting, then Key points, Decisions, Open questions, and an Action items list with tick boxes. One item is ticked and crossed out.',
      },
      {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        source: require('../../docs/help/images/note-summary-1280.png'),
        alt: 'The same Summary tab on a wide web window, with a Copy button and a Regenerate button under the action items.',
      },
      {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        source: require('../../docs/help/images/note-summary-empty-390.png'),
        alt: 'A note on a phone-sized window with a blue Summarizing label. A panel says "No summary yet" and that Gyan is reading the note and writing the summary.',
      },
      {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        source: require('../../docs/help/images/note-summary-empty-1280.png'),
        alt: 'The same waiting note on a wide web window.',
      },
      {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        source: require('../../docs/help/images/note-transcript-390.png'),
        alt: 'A note on a phone-sized window. The title and a green Ready label are at the top, then a Transcript tab, then lines from Speaker 1 and Speaker 2 with the time of each line.',
      },
      {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        source: require('../../docs/help/images/note-transcript-1280.png'),
        alt: 'The same note on a wide web window, with the transcript lines laid out wider.',
      },
      {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        source: require('../../docs/help/images/note-failed-390.png'),
        alt: 'A Failed note on a phone-sized window. A red Failed label sits under the title, and a panel explains what went wrong, says the note did not use up a meeting, and has a Retry summary button.',
      },
      {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        source: require('../../docs/help/images/note-failed-1280.png'),
        alt: 'The same Failed note on a wide web window, with the same message and Retry summary button.',
      },
    ],
  },
  noteChat: {
    id: 'noteChat',
    title: 'Asking about your note',
    sentences: [
      'Tap Ask to open the chat and ask anything about this note.',
      'Gyan only reads this one note. It never makes things up, and it never looks anything up elsewhere.',
      'Every answer shows small numbers. Tap one to jump to the place the answer came from.',
      'This works on recordings and on notes you pasted or uploaded as text.',
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
          'Tap it. The chat closes, the Transcript tab opens, and that part is outlined in blue.',
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
          'A note needs its words before you can ask about it. Until then the Ask button is greyed out.',
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
          'Each note has its own separate chat.',
        ],
      },
    ],
    images: [
      {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        source: require('../../docs/help/images/note-chat-390.png'),
        alt: 'The chat on a phone-sized window, slid up from the bottom. A question from You says "What were the decisions?" and an answer from Gyan says the sign up screen ships on Friday, with a small round number 3 at the end.',
      },
      {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        source: require('../../docs/help/images/note-chat-empty-390.png'),
        alt: 'A new chat on a phone-sized window, with 3 suggested questions as buttons: What were the decisions?, What did I promise to do?, and What is still open?',
      },
      {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        source: require('../../docs/help/images/note-chat-cited-390.png'),
        alt: 'The Transcript tab on a phone-sized window after tapping a number. The line at 1 minute 5 seconds, where Priya says she will send the test plan on Friday, is outlined in blue.',
      },
      {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        source: require('../../docs/help/images/note-chat-1280.png'),
        alt: 'The same chat on a wide web window, floating down the right side of the note while the note stays on the left.',
      },
      {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        source: require('../../docs/help/images/note-chat-empty-1280.png'),
        alt: 'A new chat on a wide web window, with the same 3 suggested questions.',
      },
      {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        source: require('../../docs/help/images/note-chat-cited-1280.png'),
        alt: 'The Transcript tab on a wide web window with the line at 1 minute 5 seconds outlined in blue, and an Ask button beside the tabs.',
      },
    ],
  },
  translation: {
    id: 'translation',
    title: 'Languages and translating',
    sentences: [
      'Tap Language to choose the language you want Gyan to write in. Your summaries, your to-dos and the chat answers all use it.',
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
        alt: 'The list of languages open on a phone, each language shown in its own letters.',
      },
      {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        source: require('../../docs/help/images/note-translated-390.png'),
        alt: 'A summary in Spanish on a phone, with the words Translated by AI above it.',
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
        alt: 'The Sign up screen with an Email box, a Password box, and a blue Sign up button on a phone-sized window.',
      },
      {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        source: require('../../docs/help/images/signup-1280.png'),
        alt: 'The Sign up screen with an Email box, a Password box, and a blue Sign up button on a wide web window.',
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
        alt: 'The Log in screen with an Email box, a Password box, and a blue Log in button on a phone-sized window.',
      },
      {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        source: require('../../docs/help/images/login-1280.png'),
        alt: 'The Log in screen with an Email box, a Password box, and a blue Log in button on a wide web window.',
      },
    ],
  },
};

export function getHelp(id: string): HelpEntry | undefined {
  return HELP[id];
}
