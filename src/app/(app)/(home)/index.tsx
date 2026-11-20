import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { View } from 'react-native';

import { HelpButton } from '@/components/help/help-button';
import { NoteRow } from '@/components/notes/note-row';
import { UsagePanel } from '@/components/notes/usage-panel';
import { Body } from '@/components/ui/body';
import { Button } from '@/components/ui/button';
import { GlassPanel } from '@/components/ui/glass-panel';
import { Heading } from '@/components/ui/heading';
import { Screen } from '@/components/ui/screen';
import { Skeleton } from '@/components/ui/skeleton';
import { Spacing } from '@/constants/theme';
import { getUsage, listNotes, type NoteRow as Note, type Usage } from '@/lib/notes';

const BUSY = ['Uploading', 'Queued', 'Transcribing', 'Summarizing'];
const POLL_MS = 3000;

type Load = { state: 'loading' } | { state: 'error' } | { state: 'ready'; notes: Note[]; usage?: Usage };

/** Home: the list of notes, newest first, and how many meetings are used this month. */
export default function HomeScreen() {
  const router = useRouter();
  const [load, setLoad] = useState<Load>({ state: 'loading' });

  const refresh = useCallback((quiet = false) => {
    if (!quiet) setLoad({ state: 'loading' });
    // The list is the main thing. If only the usage count fails, still show the notes.
    Promise.all([listNotes(), getUsage().catch(() => undefined)])
      .then(([notes, usage]) => setLoad({ state: 'ready', notes, usage }))
      // A failed background check keeps what is on screen.
      .catch(() => !quiet && setLoad({ state: 'error' }));
  }, []);

  // Load again every time the person comes back to Home (for example after adding a note).
  useFocusEffect(refresh);

  // While any note is still being made, check again every few seconds so statuses update by themselves.
  const anyBusy = load.state === 'ready' && load.notes.some((n) => BUSY.includes(n.status));
  useEffect(() => {
    if (!anyBusy) return;
    const t = setInterval(() => refresh(true), POLL_MS);
    return () => clearInterval(t);
  }, [anyBusy, refresh]);

  return (
    <Screen>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Spacing.three }}>
        <View style={{ flex: 1 }}>
          <Heading level={1}>Home</Heading>
        </View>
        <HelpButton helpId="home" />
      </View>

      <UsagePanel usage={load.state === 'ready' ? load.usage : undefined} loading={load.state === 'loading'} />

      <Button label="New note" onPress={() => router.push('/new-note')} />

      {load.state === 'loading' ? (
        <View style={{ gap: Spacing.three }} accessibilityLabel="Loading your notes">
          {[0, 1, 2].map((i) => (
            <GlassPanel key={i}>
              <Skeleton width="70%" height={18} />
              <Skeleton width="40%" />
            </GlassPanel>
          ))}
        </View>
      ) : load.state === 'error' ? (
        <GlassPanel>
          <Body color="danger" accessibilityRole="alert">
            We could not load your notes. Check your internet and try again.
          </Body>
          <Button label="Retry" variant="secondary" onPress={() => refresh()} />
        </GlassPanel>
      ) : load.notes.length === 0 ? (
        <GlassPanel>
          <Heading level={3}>No notes yet</Heading>
          <Body color="textSecondary">Add your first conversation. Upload a file or paste some text.</Body>
        </GlassPanel>
      ) : (
        <View style={{ gap: Spacing.three }}>
          {load.notes.map((n) => (
            <NoteRow key={n.id} note={n} />
          ))}
        </View>
      )}

    </Screen>
  );
}
