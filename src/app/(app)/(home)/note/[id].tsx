import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState, type ComponentRef } from 'react';
import { Pressable, ScrollView, View } from 'react-native';

import { HelpButton } from '@/components/help/help-button';
import { ChatPanel } from '@/components/notes/chat-panel';
import { SummaryTab } from '@/components/notes/summary-tab';
import { Body } from '@/components/ui/body';
import { Button } from '@/components/ui/button';
import { GlassPanel } from '@/components/ui/glass-panel';
import { Heading } from '@/components/ui/heading';
import { Screen } from '@/components/ui/screen';
import { Skeleton } from '@/components/ui/skeleton';
import { StatusBadge } from '@/components/ui/status-badge';
import { TabBar } from '@/components/ui/tab-bar';
import { Colors, MinTouchTarget, Radius, Spacing } from '@/constants/theme';
import { NO_TRANSCRIPT_MESSAGE, NO_WORDS_MESSAGE, type ChatSource } from '@/lib/chat';
import { listPassages, type Passage } from '@/lib/passages';
import { noteTitle } from '@/lib/notes';
import {
  getSummary,
  listActionItems,
  setActionItemDone,
  startSummary,
  type ActionItem,
  type Summary,
} from '@/lib/summaries';
import { formatTime, getNote, listSegments, startTranscription, type NoteDetail, type TranscriptLine } from '@/lib/transcripts';

type Ready = {
  state: 'ready';
  note: NoteDetail;
  /** A recording's transcript lines. Empty for a pasted-text note. */
  lines: TranscriptLine[];
  /** A pasted-text note's numbered paragraphs. Empty for a recording. */
  passages: Passage[];
  summary?: Summary;
  items: ActionItem[];
};

type Load = { state: 'loading' } | { state: 'error' } | { state: 'missing' } | Ready;

const TABS = ['Summary', 'Transcript'] as const;
type Tab = (typeof TABS)[number];

/** Statuses where a transcript, a summary, or action items may already exist. */
const HAS_WORDS = ['Summarizing', 'Ready', 'Failed'];

/** Reads the note, and its words when there are any. Never throws: problems become the error state. */
async function fetchState(id: string): Promise<Load> {
  try {
    const note = await getNote(id);
    if (!note) return { state: 'missing' };
    if (!HAS_WORDS.includes(note.status)) return { state: 'ready', note, lines: [], passages: [], items: [] };

    // A recording has transcript lines. Pasted text has paragraphs instead, kept in the file.
    const isText = note.source === 'text';
    const [lines, passages, summary, items] = await Promise.all([
      isText ? Promise.resolve([]) : listSegments(id),
      isText ? listPassages(note.file_path).catch(() => []) : Promise.resolve([]),
      getSummary(id),
      listActionItems(id),
    ]);
    return { state: 'ready', note, lines, passages, summary, items };
  } catch {
    return { state: 'error' };
  }
}

const BUSY = ['Uploading', 'Queued', 'Transcribing', 'Summarizing'];
const POLL_MS = 3000;

/** Note detail: a Summary tab, a Transcript tab, and the side chat. Mind map comes later. */
export default function NoteDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [load, setLoad] = useState<Load>({ state: 'loading' });
  const [tab, setTab] = useState<Tab>('Summary');
  const [starting, setStarting] = useState(false);
  const [startError, setStartError] = useState(false);
  const [savingItemId, setSavingItemId] = useState<string>();
  const [itemError, setItemError] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  /** The transcript line a passage number pointed at. It stays lit until another one is tapped. */
  const [highlightId, setHighlightId] = useState<string>();

  const pageRef = useRef<ComponentRef<typeof ScrollView>>(null);
  /** How far down the page each transcript line starts, so we can scroll to it. */
  const lineTops = useRef<Record<string, number>>({});

  const refresh = useCallback(
    // 'again' shows the loading state first. 'quiet' is a background check that keeps what is on screen if it fails.
    async (mode: 'again' | 'quiet' = 'again') => {
      if (!id) return;
      if (mode === 'again') setLoad({ state: 'loading' });
      const next = await fetchState(id);
      if (mode === 'quiet' && next.state === 'error') return;
      setLoad(next);
    },
    [id],
  );

  // Load the note when the screen opens.
  useEffect(() => {
    if (!id) return;
    let alive = true;
    fetchState(id).then((next) => {
      if (alive) setLoad(next);
    });
    return () => {
      alive = false;
    };
  }, [id]);

  // While the note is still being made, check again every few seconds.
  const status = load.state === 'ready' ? load.note.status : undefined;
  useEffect(() => {
    if (!status || !BUSY.includes(status)) return;
    const t = setInterval(() => refresh('quiet'), POLL_MS);
    return () => clearInterval(t);
  }, [status, refresh]);

  /** Starts a step on the server: the transcript, or the summary. */
  async function start(step: 'transcript' | 'summary') {
    if (!id) return;
    setStarting(true);
    setStartError(false);
    try {
      if (step === 'transcript') await startTranscription(id);
      else await startSummary(id);
      await refresh('quiet');
    } catch {
      setStartError(true);
    }
    setStarting(false);
  }

  /** Ticks one action item, and puts it back if saving did not work. */
  async function toggleItem(item: ActionItem) {
    setItemError(false);
    setSavingItemId(item.id);
    // Show the tick straight away, so it feels instant.
    setLoad((current) =>
      current.state === 'ready'
        ? { ...current, items: current.items.map((i) => (i.id === item.id ? { ...i, done: !item.done } : i)) }
        : current,
    );
    try {
      await setActionItemDone(item.id, !item.done);
    } catch {
      setItemError(true);
      setLoad((current) =>
        current.state === 'ready'
          ? { ...current, items: current.items.map((i) => (i.id === item.id ? { ...i, done: item.done } : i)) }
          : current,
      );
    }
    setSavingItemId(undefined);
  }

  /**
   * Somebody tapped a passage number in an answer. Close the chat, open the Transcript tab,
   * scroll to that line, and light it up.
   */
  const jumpTo = useCallback((source: ChatSource) => {
    setChatOpen(false);
    setTab('Transcript');
    setHighlightId(source.segment_id);
    // Wait for the Transcript tab to be drawn before scrolling to the line.
    setTimeout(() => {
      const top = lineTops.current[source.segment_id];
      if (typeof top === 'number') pageRef.current?.scrollTo({ y: Math.max(top - 80, 0), animated: true });
    }, 50);
  }, []);

  const lines = load.state === 'ready' ? load.lines : [];
  const passages = load.state === 'ready' ? load.passages : [];
  const isText = load.state === 'ready' && load.note.source === 'text';
  // A note can be asked about as soon as it has words, whether somebody spoke them or typed them.
  const canAsk = lines.length > 0 || passages.length > 0;

  return (
    <View style={{ flex: 1 }}>
      <Screen scrollRef={pageRef}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Spacing.three }}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Back to Home"
            onPress={() => router.replace('/')}
            style={{ minHeight: MinTouchTarget, minWidth: MinTouchTarget, justifyContent: 'center' }}>
            <Body color="link">‹ Home</Body>
          </Pressable>
          <HelpButton helpId="note" />
        </View>

        {load.state === 'loading' ? (
          <View style={{ gap: Spacing.three }} accessibilityLabel="Loading your note">
            <Skeleton width="60%" height={30} />
            {[0, 1, 2].map((i) => (
              <GlassPanel key={i}>
                <Skeleton width="30%" />
                <Skeleton width="90%" height={18} />
              </GlassPanel>
            ))}
          </View>
        ) : load.state === 'error' ? (
          <GlassPanel>
            <Body color="danger" accessibilityRole="alert">
              We could not load this note. Check your internet and try again.
            </Body>
            <Button label="Retry" variant="secondary" onPress={() => refresh()} />
          </GlassPanel>
        ) : load.state === 'missing' ? (
          <GlassPanel>
            <Heading level={3}>Note not found</Heading>
            <Body color="textSecondary">This note does not exist, or it belongs to another account.</Body>
            <Button label="Back to Home" variant="secondary" onPress={() => router.replace('/')} />
          </GlassPanel>
        ) : (
          <>
            <View style={{ gap: Spacing.two }}>
              <Heading level={1}>{noteTitle(load.note)}</Heading>
              <StatusBadge status={load.note.status} />
            </View>

            <View style={{ gap: Spacing.two }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Spacing.two, flexWrap: 'wrap' }}>
                <TabBar
                  tabs={TABS}
                  selected={tab}
                  onSelect={(next) => {
                    setTab(next);
                    setHighlightId(undefined);
                  }}
                />
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Ask about this note"
                  accessibilityState={{ disabled: !canAsk }}
                  disabled={!canAsk}
                  onPress={() => setChatOpen(true)}
                  style={{
                    minHeight: MinTouchTarget,
                    justifyContent: 'center',
                    paddingHorizontal: Spacing.four,
                    borderRadius: Radius.pill,
                    borderWidth: 1,
                    borderColor: canAsk ? Colors.brand : Colors.glassBorder,
                    backgroundColor: Colors.glass,
                    opacity: canAsk ? 1 : 0.5,
                  }}>
                  <Body color="link" style={{ fontWeight: '600' }}>
                    Ask
                  </Body>
                </Pressable>
              </View>
              {!canAsk ? (
                <Body small color="textSecondary">
                  {isText ? NO_WORDS_MESSAGE : NO_TRANSCRIPT_MESSAGE}
                </Body>
              ) : null}
            </View>

            {tab === 'Summary' ? (
              <SummaryTab
                note={load.note}
                summary={load.summary}
                items={load.items}
                onToggleItem={toggleItem}
                savingItemId={savingItemId}
                itemError={itemError}
                onStart={() => start('summary')}
                starting={starting}
                startError={startError}
              />
            ) : (
              <TranscriptTab
                note={load.note}
                lines={load.lines}
                passages={load.passages}
                onStart={() => start('transcript')}
                starting={starting}
                startError={startError}
                highlightId={highlightId}
                onLineLayout={(lineId, y) => {
                  lineTops.current[lineId] = y;
                }}
              />
            )}
          </>
        )}
      </Screen>

      {id ? <ChatPanel meetingId={id} visible={chatOpen} onClose={() => setChatOpen(false)} onJump={jumpTo} /> : null}
    </View>
  );
}

function TranscriptTab({
  note,
  lines,
  passages,
  onStart,
  starting,
  startError,
  highlightId,
  onLineLayout,
}: {
  note: NoteDetail;
  lines: TranscriptLine[];
  passages: Passage[];
  onStart: () => void;
  starting: boolean;
  startError: boolean;
  /** The line a passage number pointed at. It gets a blue border and a brighter fill. */
  highlightId?: string;
  onLineLayout?: (lineId: string, y: number) => void;
}) {
  const hasWords = lines.length > 0 || passages.length > 0;
  // A note that failed while writing its summary still has its words. Keep showing them, and
  // point to the Summary tab, where the Retry summary button is.
  const failedWithTranscript = note.status === 'Failed' && hasWords;

  if (note.status === 'Failed' && !failedWithTranscript) {
    return (
      <GlassPanel style={{ borderColor: Colors.dangerBorder }}>
        <Heading level={3}>This note did not work</Heading>
        <Body color="danger" accessibilityRole="alert">
          {note.error_message ?? 'Something went wrong while making the transcript.'}
        </Body>
        <Body small color="textSecondary">
          This note did not use up one of your meetings.
        </Body>
        {startError ? (
          <Body small color="danger" accessibilityRole="alert">
            We could not start it again. Check your internet and try again.
          </Body>
        ) : null}
        <Button label="Retry" variant="secondary" loading={starting} onPress={onStart} />
      </GlassPanel>
    );
  }

  if (note.status !== 'Ready' && !failedWithTranscript) {
    const text =
      note.status === 'Uploading'
        ? 'Your file is still on its way.'
        : note.status === 'Queued'
          ? 'Your note is waiting for its turn.'
          : note.status === 'Summarizing'
            ? 'The words are being read for the summary.'
            : 'Gyan is turning the talking into text. This usually takes a minute or two.';
    return (
      <GlassPanel accessibilityLabel={`Transcript is not ready. Status: ${note.status}`}>
        <Heading level={3}>No transcript yet</Heading>
        <Body color="textSecondary">{text} This page updates by itself.</Body>
        {note.status === 'Queued' ? (
          <>
            {startError ? (
              <Body small color="danger" accessibilityRole="alert">
                We could not start it. Check your internet and try again.
              </Body>
            ) : null}
            <Button label="Start now" variant="secondary" loading={starting} onPress={onStart} />
          </>
        ) : null}
      </GlassPanel>
    );
  }

  if (!hasWords) {
    return (
      <GlassPanel>
        <Heading level={3}>{note.source === 'text' ? 'No words' : 'No transcript'}</Heading>
        <Body color="textSecondary">
          {note.source === 'text' ? 'This note has no words in it.' : 'This note has no transcript lines.'}
        </Body>
      </GlassPanel>
    );
  }

  return (
    <View style={{ gap: Spacing.three }}>
      {failedWithTranscript ? (
        <GlassPanel style={{ borderColor: Colors.dangerBorder }}>
          <Body color="danger" accessibilityRole="alert">
            {note.error_message ?? 'Something went wrong while writing the summary.'}
          </Body>
          <Body small color="textSecondary">
            Your transcript is safe and is below. Open the Summary tab to try the summary again.
          </Body>
        </GlassPanel>
      ) : null}
      {note.spoken_language ? (
        <Body small color="textSecondary">
          Spoken language: {note.spoken_language}
        </Body>
      ) : null}
      {passages.map((p, i) => {
        const lit = p.id === highlightId;
        return (
          <GlassPanel
            key={p.id}
            onLayout={(e) => onLineLayout?.(p.id, e.nativeEvent.layout.y)}
            style={lit ? { borderColor: Colors.brand, backgroundColor: Colors.backgroundSelected } : undefined}
            accessibilityLabel={`Paragraph ${i + 1}. ${p.text}${lit ? '. Highlighted' : ''}`}>
            <Body color="link" style={{ fontWeight: '600' }}>
              Paragraph {i + 1}
            </Body>
            <Body>{p.text}</Body>
          </GlassPanel>
        );
      })}
      {lines.map((l) => {
        const lit = l.id === highlightId;
        return (
          <GlassPanel
            key={l.id}
            onLayout={(e) => onLineLayout?.(l.id, e.nativeEvent.layout.y)}
            style={lit ? { borderColor: Colors.brand, backgroundColor: Colors.backgroundSelected } : undefined}
            accessibilityLabel={`${l.speaker_label ?? 'Speaker'}, ${formatTime(l.start_ms)}. ${l.text}${lit ? '. Highlighted' : ''}`}>
            <View style={{ flexDirection: 'row', gap: Spacing.three, alignItems: 'baseline' }}>
              <Body color="link" style={{ fontWeight: '600' }}>
                {l.speaker_label ?? 'Speaker'}
              </Body>
              <Body small color="textSecondary">
                {formatTime(l.start_ms)}
              </Body>
            </View>
            <Body>{l.text}</Body>
          </GlassPanel>
        );
      })}
    </View>
  );
}
