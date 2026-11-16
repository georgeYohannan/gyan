/**
 * ALL help text lives in this one file. Change the words here. No other file needs to change.
 *
 * Each entry has:
 *  - id: a short name the screen uses to find its help
 *  - title: the heading of the help panel
 *  - sentences: 2 to 4 short, plain sentences
 *  - images: one or more screenshots (use fake data only) with a short description for screen readers
 *  - builderOnly: true shows a "For builders only" label
 */
import type { ImageSource } from 'expo-image';

export type HelpImage = { source: ImageSource | number; alt: string };

export type HelpEntry = {
  id: string;
  title: string;
  sentences: string[];
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
