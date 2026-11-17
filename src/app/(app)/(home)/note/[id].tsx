import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';

import { HelpButton } from '@/components/help/help-button';
import { SummaryTab } from '@/components/notes/summary-tab';
import { Body } from '@/components/ui/body';
import { Button } from '@/components/ui/button';
import { GlassPanel } from '@/components/ui/glass-panel';
import { Heading } from '@/components/ui/heading';
import { Screen } from '@/components/ui/screen';
import { Skeleton } from '@/components/ui/skeleton';
import { StatusBadge } from '@/components/ui/status-badge';
import { TabBar } from '@/components/ui/tab-bar';
import { Colors, MinTouchTarget, Spacing } from '@/constants/theme';
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
  lines: TranscriptLine[];
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
    if (!HAS_WORDS.includes(note.status)) return { state: 'ready', note, lines: [], items: [] };
    const [lines, summary, items] = await Promise.all([listSegments(id), getSummary(id), listActionItems(id)]);
    return { state: 'ready', note, lines, summary, items };
  } catch {
    return { state: 'error' };
  }
}

const BUSY = ['Uploading', 'Queued', 'Transcribing', 'Summarizing'];
const POLL_MS = 3000;

/** Note detail: a Summary tab and a Transcript tab. Mind map and side chat come later. */
export default function NoteDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [load, setLoad] = useState<Load>({ state: 'loading' });
  const [tab, setTab] = useState<Tab>('Summary');
  const [starting, setStarting] = useState(false);
  const [startError, setStartError] = useState(false);
  const [savingItemId, setSavingItemId] = useState<string>();
  const [itemError, setItemError] = useState(false);

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

  return (
    <Screen>
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

          <TabBar tabs={TABS} selected={tab} onSelect={setTab} />

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
              onStart={() => start('transcript')}
              starting={starting}
              startError={startError}
            />
          )}
        </>
      )}
    </Screen>
  );
}

function TranscriptTab({
  note,
  lines,
  onStart,
  starting,
  startError,
}: {
  note: NoteDetail;
  lines: TranscriptLine[];
  onStart: () => void;
  starting: boolean;
  startError: boolean;
}) {
  // A note that failed while writing its summary still has its transcript. Keep showing it, and
  // point to the Summary tab, where the Retry summary button is.
  const failedWithTranscript = note.status === 'Failed' && lines.length > 0;

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

  if (lines.length === 0) {
    return (
      <GlassPanel>
        <Heading level={3}>No transcript</Heading>
        <Body color="textSecondary">This note has no transcript lines.</Body>
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
      {lines.map((l) => (
        <GlassPanel key={l.id} accessibilityLabel={`${l.speaker_label ?? 'Speaker'}, ${formatTime(l.start_ms)}. ${l.text}`}>
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
      ))}
    </View>
  );
}
