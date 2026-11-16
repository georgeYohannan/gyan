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
          'Summarizing: Gyan is writing the short summary and the to-do list.',
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
