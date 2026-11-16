import { Text } from 'react-native';
import { act, fireEvent, render, screen } from '@testing-library/react-native';

import { HelpButton } from '@/components/help/help-button';
import { HELP } from '@/content/help';
import { Motion } from '@/constants/theme';
import { useMotion } from '@/hooks/use-motion';

// Lets a test switch the phone's "reduce motion" setting on.
let mockReduced = false;
jest.mock('react-native-reanimated', () =>
  Object.create(jest.requireActual('react-native-reanimated'), {
    useReducedMotion: { value: () => mockReduced },
  }),
);
afterEach(() => {
  mockReduced = false;
});

describe('help content file', () => {
  test.each(Object.values(HELP))('"$id" has a title, 2 to 4 sentences, and an image', (entry) => {
    expect(entry.title.length).toBeGreaterThan(0);
    expect(entry.sentences.length).toBeGreaterThanOrEqual(2);
    expect(entry.sentences.length).toBeLessThanOrEqual(4);
    expect(entry.images.length).toBeGreaterThanOrEqual(1);
    for (const img of entry.images) expect(img.alt.length).toBeGreaterThan(0);
  });

  test('"home" and "newNote" explain statuses, the monthly limit, and file sizes', () => {
    const words = (id: string) =>
      [...HELP[id].sentences, ...(HELP[id].lists ?? []).flatMap((l) => [l.heading, ...l.items])].join(' ');
    for (const status of ['Uploading', 'Queued', 'Transcribing', 'Summarizing', 'Ready', 'Failed']) {
      expect(words('home')).toContain(status);
    }
    expect(words('home')).toMatch(/monthly limit/i);
    expect(words('newNote')).toContain('50 MB');
    expect(words('newNote')).toMatch(/MP3/);
  });

  test('the design entry is marked for builders only', () => {
    expect(HELP.design.builderOnly).toBe(true);
  });
});

describe('HelpButton and HelpPanel', () => {
  test('opens with the title, sentences, and label, then closes', async () => {
    jest.useFakeTimers();
    await render(<HelpButton helpId="design" />);
    expect(screen.queryByText(HELP.design.title)).toBeNull();

    await fireEvent.press(screen.getByRole('button', { name: 'Help' }));
    expect(screen.getByText(HELP.design.title)).toBeTruthy();
    expect(screen.getByText('For builders only')).toBeTruthy();
    for (const s of HELP.design.sentences) expect(screen.getByText(s)).toBeTruthy();
    expect(screen.getByLabelText(HELP.design.images[0].alt)).toBeTruthy();

    await fireEvent.press(screen.getByRole('button', { name: 'Close' }));
    await act(async () => {
      jest.advanceTimersByTime(Motion.revealMs + 50);
    });
    expect(screen.queryByText(HELP.design.title)).toBeNull();
    jest.useRealTimers();
  });

  test('shows nothing for an unknown help id', async () => {
    await render(<HelpButton helpId="nope" />);
    expect(screen.queryByRole('button', { name: 'Help' })).toBeNull();
  });
});

describe('useMotion', () => {
  function Probe() {
    const m = useMotion();
    return <Text>{`${m.ui.duration}/${m.reveal.duration}`}</Text>;
  }
  test('uses 200 ms and 320 ms when motion is allowed', async () => {
    await render(<Probe />);
    expect(screen.getByText(`${Motion.uiMs}/${Motion.revealMs}`)).toBeTruthy();
  });

  test('uses 0 when reduce motion is on', async () => {
    mockReduced = true;
    await render(<Probe />);
    expect(screen.getByText('0/0')).toBeTruthy();
  });
});
