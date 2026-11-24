/**
 * The chat: every state a person can see, and what each button does.
 * The real server and the real AI are never called here.
 *
 * This used to drive `ChatPanel`, the slide-in panel the chat arrived in. The chat is a tab
 * on the note page now and the panel is gone, so these drive `ChatBody` -- the same markup,
 * the same state, one wrapper less. The two tests about closing the panel went with it:
 * leaving a tab is pressing another tab, which `tests/05-chat.spec.ts` covers.
 */
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import { AnswerText, splitAnswer } from '@/components/notes/answer-text';
import { ChatBody } from '@/components/notes/chat-body';
import { ChatLimitError, LIMIT_MESSAGE, SEND_PROBLEM_MESSAGE, SUGGESTED, type ChatMessage } from '@/lib/chat';

const mockList = jest.fn();
const mockAsk = jest.fn();
const mockRetry = jest.fn();

jest.mock('@/lib/chat', () => ({
  ...jest.requireActual('@/lib/chat'),
  listChatMessages: (...a: unknown[]) => mockList(...a),
  askChat: (...a: unknown[]) => mockAsk(...a),
  retryChat: (...a: unknown[]) => mockRetry(...a),
}));

const SOURCE = { n: 3, segment_id: 's3', start_ms: 65000, speaker_label: 'Speaker 1' };

const conversation: ChatMessage[] = [
  { id: 'm1', role: 'user', content: 'What were the decisions?', sources: [], created_at: '2026-11-18T10:00:00Z' },
  { id: 'm2', role: 'assistant', content: 'Ship the sign up screen on Friday [3].', sources: [SOURCE], created_at: '2026-11-18T10:00:05Z' },
];

beforeEach(() => {
  mockList.mockReset().mockResolvedValue([]);
  mockAsk.mockReset();
  mockRetry.mockReset();
});

/** Draws the panel already open, and waits for it to finish reading the chat. */
async function open(onJump = jest.fn()) {
  const view = await render(<ChatBody meetingId="n1" active onJump={onJump} />);
  await waitFor(() => expect(mockList).toHaveBeenCalledWith('n1'));
  return { view, onJump };
}

/** Types a question into the box and lets the screen catch up before anything is pressed. */
async function type(text: string) {
  await act(async () => {
    fireEvent.changeText(screen.getByLabelText('Your question'), text);
  });
}

/** Presses one button and lets the screen catch up. */
async function press(name: string) {
  await act(async () => {
    fireEvent.press(screen.getByRole('button', { name }));
  });
}

describe('the empty state', () => {
  test('it offers 3 suggested questions and says where answers come from', async () => {
    await open();
    for (const s of SUGGESTED) expect(screen.getByRole('button', { name: s })).toBeTruthy();
    expect(screen.getByText(/answers only from what was said in it/)).toBeTruthy();
  });

  test('tapping a suggested question asks it', async () => {
    mockAsk.mockResolvedValue({ ok: true, answer: 'Ship on Friday [3].', sources: [SOURCE], remaining: 19, messageId: 'q1' });
    await open();

    await press('What were the decisions?');

    expect(mockAsk).toHaveBeenCalledWith('n1', 'What were the decisions?');
    expect(screen.getByText(/Ship on Friday/)).toBeTruthy();
  });
});

describe('a conversation', () => {
  test('questions and answers are both shown, with who said each one', async () => {
    mockList.mockResolvedValue(conversation);
    await open();

    expect(screen.getByLabelText('You: What were the decisions?')).toBeTruthy();
    expect(screen.getByLabelText('Gyan: Ship the sign up screen on Friday [3].')).toBeTruthy();
    // Once there is a conversation, the suggested questions make way for the box.
    expect(screen.queryByRole('button', { name: 'What is still open?' })).toBeNull();
  });

  test('a passage number is a link that jumps to that transcript line', async () => {
    mockList.mockResolvedValue(conversation);
    const { onJump } = await open();

    const chip = screen.getByRole('link', { name: 'Go to the line at 1:05' });
    await act(async () => {
      fireEvent.press(chip);
    });

    expect(onJump).toHaveBeenCalledWith(SOURCE);
  });

  test('the chat that was saved before is there when the panel opens', async () => {
    mockList.mockResolvedValue(conversation);
    await open();
    expect(mockList).toHaveBeenCalledWith('n1');
    expect(screen.getByText(/Ship the sign up screen on Friday/)).toBeTruthy();
  });
});

describe('sending a question', () => {
  test('while it waits, the question is on screen and so is a quiet message', async () => {
    let settle: (v: unknown) => void = () => {};
    mockAsk.mockReturnValue(new Promise((r) => (settle = r)));
    await open();

    await type('Who tested it?');
    await press('Send');

    expect(screen.getByLabelText('You: Who tested it?')).toBeTruthy();
    expect(screen.getByLabelText('Gyan is reading your note')).toBeTruthy();

    await act(async () => {
      settle({ ok: true, answer: 'Two people did [2].', sources: [], remaining: 18, messageId: 'q1' });
    });
    expect(screen.getByText(/Two people did/)).toBeTruthy();
  });

  test('Send does nothing until something is typed', async () => {
    await open();
    await act(async () => {
      fireEvent.press(screen.getByRole('button', { name: 'Send' }));
    });
    expect(mockAsk).not.toHaveBeenCalled();
  });

  test('once there are few questions left, it quietly says so', async () => {
    mockAsk.mockResolvedValue({ ok: true, answer: 'Yes [1].', sources: [], remaining: 2, messageId: 'q1' });
    await open();

    await type('Anything?');
    await press('Send');

    expect(screen.getByText('2 questions left today.')).toBeTruthy();
  });
});

describe('when something goes wrong', () => {
  test('a problem shows plain words and a Retry button', async () => {
    mockAsk.mockResolvedValue({ ok: false, message: 'The answering service is busy. Please try again in a minute.', messageId: 'q1' });
    await open();

    await type('Anything?');
    await press('Send');

    expect(screen.getByText(/answering service is busy/)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Retry' })).toBeTruthy();
  });

  test('Retry uses the question that is already saved, so it costs nothing extra', async () => {
    mockAsk.mockResolvedValue({ ok: false, message: 'Something went wrong while answering. Please try again.', messageId: 'q1' });
    mockRetry.mockResolvedValue({ ok: true, answer: 'Ship on Friday [3].', sources: [SOURCE], remaining: 19, messageId: 'q1' });
    await open();

    await type('What were the decisions?');
    await press('Send');
    await press('Retry');

    expect(mockRetry).toHaveBeenCalledWith('q1');
    // Only the first Send ever asked a NEW question.
    expect(mockAsk).toHaveBeenCalledTimes(1);
    expect(screen.getByText(/Ship on Friday/)).toBeTruthy();
  });

  test('a question that never reached the server also gets a Retry', async () => {
    mockAsk.mockRejectedValue(new Error('offline'));
    await open();

    await type('Anything?');
    await press('Send');

    expect(screen.getByText(SEND_PROBLEM_MESSAGE)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Retry' })).toBeTruthy();
  });

  test('AT THE LIMIT: the box is replaced by a friendly message', async () => {
    mockAsk.mockRejectedValue(new ChatLimitError(LIMIT_MESSAGE));
    await open();

    await type('Anything?');
    await press('Send');

    expect(screen.getByText(LIMIT_MESSAGE)).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Send' })).toBeNull();
  });

  test('a chat that will not open offers to try again', async () => {
    mockList.mockRejectedValue(new Error('down'));
    await open();
    expect(screen.getByText(/could not open your questions/)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Retry' })).toBeTruthy();
  });
});

describe('when it is not the open tab', () => {
  test('a chat nobody is looking at asks the server for nothing', async () => {
    await render(<ChatBody meetingId="n1" active={false} onJump={jest.fn()} />);
    expect(mockList).not.toHaveBeenCalled();
  });
});

describe('passage numbers inside an answer', () => {
  test('only numbers that point at a real line become links', () => {
    const pieces = splitAnswer('Ship Friday [3], and nobody knows [9].', [SOURCE]);
    expect(pieces.filter((p) => p.kind === 'chip')).toHaveLength(1);
    // The number nobody can jump to stays exactly as it was written.
    expect(pieces.map((p) => (p.kind === 'words' ? p.text : '')).join('')).toContain('[9]');
  });

  test('the same number twice makes two links', () => {
    const pieces = splitAnswer('Ship Friday [3]. Priya agreed [3].', [SOURCE]);
    expect(pieces.filter((p) => p.kind === 'chip')).toHaveLength(2);
  });

  test('an answer with no numbers is just words', () => {
    const pieces = splitAnswer('I could not find that in your notes.', []);
    expect(pieces).toEqual([{ kind: 'words', text: 'I could not find that in your notes.' }]);
  });

  test('a link says where it goes, for somebody using a screen reader', async () => {
    await render(<AnswerText text="Ship Friday [3]." sources={[SOURCE]} onJump={jest.fn()} />);
    expect(screen.getByRole('link', { name: 'Go to the line at 1:05' })).toBeTruthy();
  });
});

describe('a passage number next to a full stop', () => {
  const SRC = [{ n: 3, segment_id: 's3', start_ms: 65000, speaker_label: 'Speaker 1' }];

  test('the full stop stays right beside the number, not on its own', () => {
    const pieces = splitAnswer('We ship on Friday [3].', SRC);
    const chip = pieces.find((p) => p.kind === 'chip')!;
    expect(chip.kind === 'chip' && chip.tight).toBe(true);
  });

  test('a number in the middle of a sentence keeps its normal spacing', () => {
    const pieces = splitAnswer('We ship on Friday [3] and Priya agrees.', SRC);
    const chip = pieces.find((p) => p.kind === 'chip')!;
    expect(chip.kind === 'chip' && chip.tight).toBe(false);
  });
});

describe('tapping a passage number on a phone', () => {
  test('the part you can tap is at least 44 by 44 points', async () => {
    await render(<AnswerText text="Ship Friday [3]." sources={[{ n: 3, segment_id: 's3', start_ms: 65000, speaker_label: null }]} onJump={jest.fn()} />);
    const chip = screen.getByRole('link', { name: 'Go to the line at 1:05' });
    const style = chip.props.style;
    const slop = chip.props.hitSlop as number;
    // The drawn chip is small, so hitSlop on both sides makes up the rest.
    expect(style.minHeight + slop * 2).toBeGreaterThanOrEqual(44);
  });
});
