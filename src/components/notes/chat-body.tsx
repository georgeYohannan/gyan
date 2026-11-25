import { useCallback, useEffect, useRef, useState, type ComponentRef, type ReactNode } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, View } from 'react-native';

import { AnswerText } from '@/components/notes/answer-text';
import { Body } from '@/components/ui/body';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { TextField } from '@/components/ui/text-field';
import { Colors, MinTouchTarget, Radius, Spacing } from '@/constants/theme';
import {
  ChatLimitError,
  LIMIT_MESSAGE,
  MAX_QUESTION_LENGTH,
  SEND_PROBLEM_MESSAGE,
  type ChatMessage,
  type ChatSource,
  type ChatTransport,
} from '@/lib/chat';

/** Below this many questions left, we quietly say how many are left. */
const LOW_LEFT = 3;

/** A question that has been asked but has no answer yet. */
type Pending = { question: string };

type ChatBodyProps = {
  /**
   * Which chat this is: the side chat on one note, or the Ask destination across every note.
   * The component reads the conversation, asks and retries through this and nothing else, so
   * it never needs to know which of the two it is drawing.
   */
  transport: ChatTransport;
  /** What an empty chat says before anybody has asked anything. */
  blurb: string;
  /** The questions offered as buttons on an empty chat. */
  suggestions: readonly string[];
  /** The grey example inside the question box. */
  placeholder: string;
  /**
   * The chat is on screen, so it is time to read the conversation.
   *
   * It is read once, the first time this turns true, and never again: the conversation lives
   * in the database, so it survives a refresh, and re-reading it every time somebody comes
   * back to the tab would throw away an answer that has not been saved yet.
   */
  active: boolean;
  /**
   * Called when somebody taps a passage number.
   *
   * What that means depends on where the chat is. On a note it jumps to that line of the
   * Transcript tab. On the Ask screen the source also says WHICH note, so it opens that note
   * at that line.
   */
  onJump: (source: ChatSource) => void;
  /** A title bar above the conversation. The panel had one; a tab does not need one. */
  header?: ReactNode;
  testID?: string;
};

/**
 * The chat itself: the conversation, the question box, and everything that can go wrong.
 *
 * It knows nothing about WHERE it is drawn, or WHICH chat it is. That is the whole point of
 * it being its own piece. It started life inside a slide-in panel; the note page now shows it
 * as a tab beside Summary and Transcript, and the Ask destination shows the same component
 * reading every note at once. Three homes, one chat -- same states, same failures, same
 * markup -- so an answer looks and behaves the same wherever you asked for it.
 *
 * Everything that differs between the two chats arrives as a prop: where the questions go
 * (`transport`), and the words on an empty one (`blurb`, `suggestions`, `placeholder`).
 *
 * It owns its own scrolling and its own keyboard avoidance, and expects a parent that gives
 * it a height to fill -- never a page that scrolls, or there would be two scrolling things
 * inside each other and the question box would walk off the bottom of a phone.
 */
export function ChatBody({ transport, blurb, suggestions, placeholder, active, onJump, header, testID }: ChatBodyProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [question, setQuestion] = useState('');
  const [pending, setPending] = useState<Pending>();
  const [problem, setProblem] = useState<string>();
  const [retryId, setRetryId] = useState<string>();
  const [limitReached, setLimitReached] = useState(false);
  const [remaining, setRemaining] = useState<number>();

  const listRef = useRef<ComponentRef<typeof ScrollView>>(null);

  /** The Retry button on a chat that would not open. */
  const load = useCallback(async () => {
    setLoading(true);
    setLoadFailed(false);
    try {
      setMessages(await transport.list());
    } catch {
      setLoadFailed(true);
    }
    setLoading(false);
  }, [transport]);

  // Read the conversation the first time the chat is shown. A ref, not state, so showing it
  // does not draw it twice. `loading` already starts true, so nothing is set until the answer
  // comes back.
  const everShown = useRef(false);
  useEffect(() => {
    if (!active || everShown.current) return;
    everShown.current = true;
    transport.list().then(
      (rows) => {
        setMessages(rows);
        setLoading(false);
      },
      () => {
        setLoadFailed(true);
        setLoading(false);
      },
    );
  }, [active, transport]);

  /** Reads one answer back and puts it on screen, or shows the problem with a Retry. */
  function apply(result: Awaited<ReturnType<ChatTransport['ask']>>, asked: string) {
    if (typeof result.remaining === 'number') setRemaining(result.remaining);
    if (result.ok) {
      setMessages((current) => [
        ...current,
        { id: `${result.messageId}-q`, role: 'user', content: asked, sources: [], created_at: '' },
        { id: result.messageId, role: 'assistant', content: result.answer, sources: result.sources, created_at: '' },
      ]);
      setPending(undefined);
      setProblem(undefined);
      setRetryId(undefined);
      return;
    }
    setProblem(result.message);
    setRetryId(result.messageId);
  }

  async function send(text: string) {
    const asked = text.trim();
    if (asked === '' || pending) return;
    setQuestion('');
    setPending({ question: asked });
    setProblem(undefined);
    setRetryId(undefined);
    try {
      apply(await transport.ask(asked), asked);
    } catch (e) {
      if (e instanceof ChatLimitError) {
        setLimitReached(true);
        setPending(undefined);
        return;
      }
      setProblem(SEND_PROBLEM_MESSAGE);
    }
  }

  /** Tries the same question again. It never costs a second question out of the day. */
  async function tryAgain() {
    if (!pending) return;
    const asked = pending.question;
    setProblem(undefined);
    try {
      apply(retryId ? await transport.retry(retryId) : await transport.ask(asked), asked);
    } catch (e) {
      if (e instanceof ChatLimitError) {
        setLimitReached(true);
        setPending(undefined);
        return;
      }
      setProblem(SEND_PROBLEM_MESSAGE);
    }
  }

  const empty = !loading && !loadFailed && messages.length === 0 && !pending;
  const lowLeft = typeof remaining === 'number' && remaining > 0 && remaining <= LOW_LEFT;

  return (
    <KeyboardAvoidingView
      testID={testID}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={{ flex: 1 }}>
      {header}

      {/* The conversation */}
      <ScrollView
        ref={listRef}
        onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: false })}
        contentContainerStyle={{ padding: Spacing.three, gap: Spacing.three }}>
        {loading ? (
          /* "Reading your chat", not "Loading your questions". The question box below is
             labelled "Your question", and a label that CONTAINS another label is a trap:
             Playwright's getByLabel matches a substring, so for the half second this was on
             screen, looking for the question box found two things. */
          <View style={{ gap: Spacing.two }} accessibilityLabel="Reading your chat">
            <Skeleton width="70%" />
            <Skeleton width="90%" height={18} />
          </View>
        ) : loadFailed ? (
          <View style={{ gap: Spacing.two }}>
            <Body color="danger" accessibilityRole="alert">
              We could not open your questions. Check your internet and try again.
            </Body>
            <Button label="Retry" variant="secondary" onPress={load} />
          </View>
        ) : null}

        {empty ? (
          <View style={{ gap: Spacing.two }}>
            <Body color="textSecondary">{blurb}</Body>
          </View>
        ) : null}

        {messages.map((m) => (
          <Bubble key={m.id} message={m} onJump={onJump} />
        ))}

        {pending ? (
          <>
            <Bubble
              message={{ id: 'pending-q', role: 'user', content: pending.question, sources: [], created_at: '' }}
              onJump={onJump}
            />
            {problem ? (
              <View style={{ gap: Spacing.two }}>
                <Body color="danger" accessibilityRole="alert">
                  {problem}
                </Body>
                <Button label="Retry" variant="secondary" onPress={tryAgain} />
              </View>
            ) : (
              <Body small color="textSecondary" accessibilityLabel="Gyan is reading your note">
                Gyan is reading your note…
              </Body>
            )}
          </>
        ) : null}
      </ScrollView>

      {/* Asking */}
      <View
        style={{
          gap: Spacing.two,
          padding: Spacing.three,
          paddingBottom: Spacing.three,
          borderTopWidth: 1,
          borderTopColor: Colors.glassBorder,
        }}>
        {limitReached ? (
          <Body color="textSecondary" accessibilityRole="alert">
            {LIMIT_MESSAGE}
          </Body>
        ) : (
          <>
            {empty ? (
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two }}>
                {suggestions.map((s) => (
                  <Pressable
                    key={s}
                    accessibilityRole="button"
                    accessibilityLabel={s}
                    onPress={() => send(s)}
                    style={{
                      minHeight: MinTouchTarget,
                      justifyContent: 'center',
                      paddingHorizontal: Spacing.three,
                      borderRadius: Radius.pill,
                      borderWidth: 1,
                      borderColor: Colors.glassBorder,
                      backgroundColor: Colors.glass,
                    }}>
                    <Body small color="link">
                      {s}
                    </Body>
                  </Pressable>
                ))}
              </View>
            ) : null}

            <TextField
              label="Your question"
              placeholder={placeholder}
              value={question}
              onChangeText={setQuestion}
              maxLength={MAX_QUESTION_LENGTH}
              onSubmitEditing={() => send(question)}
              returnKeyType="send"
              editable={!pending}
            />
            <Button label="Send" loading={!!pending && !problem} disabled={question.trim() === ''} onPress={() => send(question)} />
            {lowLeft ? (
              <Body small color="textSecondary">
                {remaining === 1 ? '1 question left today.' : `${remaining} questions left today.`}
              </Body>
            ) : null}
          </>
        )}
      </View>
    </KeyboardAvoidingView>
  );
}

/** One message: the person's question, or Gyan's answer with its passage numbers. */
function Bubble({ message, onJump }: { message: ChatMessage; onJump: (source: ChatSource) => void }) {
  const mine = message.role === 'user';
  return (
    <View
      accessibilityLabel={`${mine ? 'You' : 'Gyan'}: ${message.content}`}
      style={{
        alignSelf: mine ? 'flex-end' : 'flex-start',
        maxWidth: '92%',
        padding: Spacing.three,
        borderRadius: Radius.panel,
        borderWidth: 1,
        borderColor: Colors.glassBorder,
        backgroundColor: mine ? Colors.backgroundSelected : Colors.glass,
      }}>
      <Body small color="textSecondary" style={{ marginBottom: Spacing.half }}>
        {mine ? 'You' : 'Gyan'}
      </Body>
      {mine ? <Body>{message.content}</Body> : <AnswerText text={message.content} sources={message.sources} onJump={onJump} />}
    </View>
  );
}
