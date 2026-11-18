import { useCallback, useEffect, useRef, useState, type ComponentRef } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, View, useWindowDimensions } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

import { HelpButton } from '@/components/help/help-button';
import { AnswerText } from '@/components/notes/answer-text';
import { Body } from '@/components/ui/body';
import { Button } from '@/components/ui/button';
import { Heading } from '@/components/ui/heading';
import { Skeleton } from '@/components/ui/skeleton';
import { TextField } from '@/components/ui/text-field';
import { Colors, MinTouchTarget, Radius, Spacing, WideBreakpoint } from '@/constants/theme';
import { useMotion } from '@/hooks/use-motion';
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

type ChatPanelProps = {
  meetingId: string;
  visible: boolean;
  onClose: () => void;
  /** Called when somebody taps a passage number. The note screen jumps to that line. */
  onJump: (source: ChatSource) => void;
};

const SIDE_WIDTH = 420;

/** Below this many questions left, we quietly say how many are left. */
const LOW_LEFT = 3;

/** A question that has been asked but has no answer yet. */
type Pending = { question: string };

/**
 * The side chat. On a wide web window it floats in from the right. On a phone (or a narrow
 * window) it slides up from the bottom.
 *
 * It is drawn the same way as the help panel, so it sits above everything else on the page
 * (including the bar at the top of the web app) and the help panel can still open on top of it.
 */
export function ChatPanel({ meetingId, visible, onClose, onJump }: ChatPanelProps) {
  const { width, height } = useWindowDimensions();
  const { reveal } = useMotion();
  const side = Platform.OS === 'web' && width >= WideBreakpoint;

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

  // `mounted` keeps the panel on screen while it slides away.
  const [mounted, setMounted] = useState(visible);
  const progress = useSharedValue(0);
  if (visible && !mounted) setMounted(true);

  useEffect(() => {
    if (visible) {
      progress.set(withTiming(1, reveal));
      return;
    }
    progress.set(withTiming(0, reveal));
    const t = setTimeout(() => setMounted(false), reveal.duration);
    return () => clearTimeout(t);
  }, [visible, reveal, progress]);

  // On the web, the Escape key closes the panel.
  useEffect(() => {
    if (Platform.OS !== 'web' || !visible) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [visible, onClose]);

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

  // Read the conversation the first time the panel opens. It comes from the database, so it is
  // still there after a refresh. A ref, not state, so opening the panel does not draw it twice.
  // `loading` already starts true, so nothing is set until the answer comes back.
  const everOpened = useRef(false);
  useEffect(() => {
    if (!visible || everOpened.current) return;
    everOpened.current = true;
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
  }, [visible, meetingId]);

  const panelStyle = useAnimatedStyle(() => ({
    opacity: progress.value,
    transform: side
      ? [{ translateX: (1 - progress.value) * SIDE_WIDTH }]
      : [{ translateY: (1 - progress.value) * height * 0.5 }],
  }));
  const backdropStyle = useAnimatedStyle(() => ({ opacity: progress.value * 0.55 }));

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

  if (!mounted) return null;

  const empty = !loading && !loadFailed && messages.length === 0 && !pending;
  const lowLeft = typeof remaining === 'number' && remaining > 0 && remaining <= LOW_LEFT;

  return (
    <Modal transparent visible animationType="none" onRequestClose={onClose} statusBarTranslucent>
      <View style={{ flex: 1, justifyContent: side ? 'flex-start' : 'flex-end', alignItems: side ? 'flex-end' : 'stretch' }}>
      <Animated.View style={[{ position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, backgroundColor: '#000' }, backdropStyle]}>
        <Pressable accessibilityLabel="Close chat" style={{ flex: 1 }} onPress={onClose} />
      </Animated.View>

      <Animated.View
        accessibilityViewIsModal
        accessibilityLabel="Ask about this note"
        style={[
          { backgroundColor: Colors.backgroundElement, borderColor: Colors.glassBorder, borderWidth: 1, overflow: 'hidden' },
          side
            ? { width: SIDE_WIDTH, height: '100%', borderTopLeftRadius: Radius.panel, borderBottomLeftRadius: Radius.panel }
            : { maxHeight: '88%', borderTopLeftRadius: Radius.panel, borderTopRightRadius: Radius.panel },
          panelStyle,
        ]}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
          {/* Header */}
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: Spacing.two,
              padding: Spacing.three,
              borderBottomWidth: 1,
              borderBottomColor: Colors.glassBorder,
            }}>
            <Heading level={3}>Ask about this note</Heading>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: Spacing.two }}>
              <HelpButton helpId="noteChat" />
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Close chat"
                onPress={onClose}
                style={{ minHeight: MinTouchTarget, minWidth: MinTouchTarget, alignItems: 'center', justifyContent: 'center' }}>
                <Body color="link">Close</Body>
              </Pressable>
            </View>
          </View>

          {/* The conversation */}
          <ScrollView
            ref={listRef}
            onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: false })}
            contentContainerStyle={{ padding: Spacing.three, gap: Spacing.three }}>
            {loading ? (
              <View style={{ gap: Spacing.two }} accessibilityLabel="Loading your questions">
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
      </Animated.View>
      </View>
    </Modal>
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
