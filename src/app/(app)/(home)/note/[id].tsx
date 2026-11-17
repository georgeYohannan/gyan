import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';

import { HelpButton } from '@/components/help/help-button';
import { Body } from '@/components/ui/body';
import { Button } from '@/components/ui/button';
import { GlassPanel } from '@/components/ui/glass-panel';
import { Heading } from '@/components/ui/heading';
import { Screen } from '@/components/ui/screen';
import { Skeleton } from '@/components/ui/skeleton';
import { StatusBadge } from '@/components/ui/status-badge';
import { Colors, MinTouchTarget, Radius, Spacing } from '@/constants/theme';
import { noteTitle } from '@/lib/notes';
import { formatTime, getNote, listSegments, startTranscription, type NoteDetail, type TranscriptLine } from '@/lib/transcripts';

type Load =
  | { state: 'loading' }
  | { state: 'error' }
  | { state: 'missing' }
  | { state: 'ready'; note: NoteDetail; lines: TranscriptLine[] };

/** Reads the note (and its lines when Ready). Never throws: problems become the error state. */
async function fetchState(id: string): Promise<Load> {
  try {
    const note = await getNote(id);
    if (!note) return { state: 'missing' };
    const lines = note.status === 'Ready' ? await listSegments(id) : [];
    return { state: 'ready', note, lines };
  } catch {
    return { state: 'error' };
  }
}

const BUSY = ['Uploading', 'Queued', 'Transcribing', 'Summarizing'];
const POLL_MS = 3000;

/** Note detail. For now it has one tab, Transcript. Summary, Mind map, and Action items come later. */
export default function NoteDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [load, setLoad] = useState<Load>({ state: 'loading' });
  const [starting, setStarting] = useState(false);
  const [startError, setStartError] = useState(false);

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

  async function start() {
    if (!id) return;
    setStarting(true);
    setStartError(false);
    try {
      await startTranscription(id);
      await refresh('quiet');
    } catch {
      setStartError(true);
    }
    setStarting(false);
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

          {/* Only Transcript for now. */}
          <View accessibilityRole="tablist" style={{ flexDirection: 'row' }}>
            <View
              accessible
              accessibilityRole="tab"
              accessibilityLabel="Transcript"
              accessibilityState={{ selected: true }}
              style={{
                minHeight: MinTouchTarget,
                justifyContent: 'center',
                paddingHorizontal: Spacing.four,
                borderRadius: Radius.pill,
                borderWidth: 1,
                borderColor: Colors.glassBorder,
                backgroundColor: Colors.backgroundSelected,
              }}>
              <Body style={{ fontWeight: '600' }}>Transcript</Body>
            </View>
          </View>

          <TranscriptTab note={load.note} lines={load.lines} onStart={start} starting={starting} startError={startError} />
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
  if (note.status === 'Failed') {
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

  if (note.status !== 'Ready') {
    const text =
      note.status === 'Uploading'
        ? 'Your file is still on its way.'
        : note.status === 'Queued'
          ? 'Your note is waiting for its turn.'
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
