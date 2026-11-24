import { useCallback, useEffect, useRef, useState, type ComponentRef, type ReactNode } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, View } from 'react-native';

import { AnswerText } from '@/components/notes/answer-text';
import { Body } from '@/components/ui/body';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { TextField } from '@/components/ui/text-field';
import { Colors, MinTouchTarget, Radius, Spacing } from '@/constants/theme';
import {
  askChat,
  ChatLimitError,
  LIMIT_MESSAGE,
  listChatMessages,
  MAX_QUESTION_LENGTH,
  retryChat,
  SEND_PROBLEM_MESSAGE,
  SUGGESTED,
  type ChatMessage,
  type ChatSource,
} from '@/lib/chat';

/** Below this many questions left, we quietly say how many are left. */
const LOW_LEFT = 3;

/** A question that has been asked but has no answer yet. */
type Pending = { question: string };

type ChatBodyProps = {
  meetingId: string;
  /**
   * The chat is on screen, so it is time to read the conversation.
   *
   * It is read once, the first time this turns true, and never again: the conversation lives
   * in the database, so it survives a refresh, and re-reading it every time somebody comes
   * back to the tab would throw away an answer that has not been saved yet.
   */
  active: boolean;
  /** Called when somebody taps a passage number. The note screen jumps to that line. */
  onJump: (source: ChatSource) => void;
  /** A title bar above the conversation. The panel has one; the tab does not need one. */
  header?: ReactNode;
  testID?: string;
};

/**
 * The chat itself: the conversation, the question box, and everything that can go wrong.
 *
 * It knows nothing about WHERE it is drawn. That is the whole point of it being its own
 * piece: it started life inside a slide-in panel, and the note page now also shows it as a
 * tab beside Summary and Transcript. Both are the same chat, with the same state and the
 * same markup, so an answer looks the same wherever you asked for it.
 *
 * It owns its own scrolling and its own keyboard avoidance, and expects a parent that gives
 * it a height to fill -- never a page that scrolls, or there would be two scrolling things
 * inside each other and the question box would walk off the bottom of a phone.
 */
export function ChatBody({ meetingId, active, onJump, header, testID }: ChatBodyProps) {
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
      setMessages(await listChatMessages(meetingId));
    } catch {
      setLoadFailed(true);
    }
    setLoading(false);
  }, [meetingId]);

  // Read the conversation the first time the chat is shown. A ref, not state, so showing it
  // does not draw it twice. `loading` already starts true, so nothing is set until the answer
  // comes back.
  const everShown = useRef(false);
  useEffect(() => {
    if (!active || everShown.current) return;
    everShown.current = true;
    listChatMessages(meetingId).then(
      (rows) => {
        setMessages(rows);
        setLoading(false);
      },
      () => {
        setLoadFailed(true);
        setLoading(false);
      },
    );
  }, [active, meetingId]);

  /** Reads one answer back and puts it on screen, or shows the problem with a Retry. */
  function apply(result: Awaited<ReturnType<typeof askChat>>, asked: string) {
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
      apply(await askChat(meetingId, asked), asked);
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
      apply(retryId ? await retryChat(retryId) : await askChat(meetingId, asked), asked);
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
            <Body color="textSecondary">
              Ask anything about this note. Gyan answers only from what was said in it, and shows you where
              each answer came from.
            </Body>
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
                {SUGGESTED.map((s) => (
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
              placeholder="What were the decisions?"
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
