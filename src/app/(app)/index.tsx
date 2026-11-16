import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
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
import { useAuth } from '@/lib/auth';
import { getUsage, listNotes, type NoteRow as Note, type Usage } from '@/lib/notes';

type Load = { state: 'loading' } | { state: 'error' } | { state: 'ready'; notes: Note[]; usage?: Usage };

/** Home: the list of notes, newest first, and how many meetings are used this month. */
export default function HomeScreen() {
  const { session, signOut } = useAuth();
  const router = useRouter();
  const [load, setLoad] = useState<Load>({ state: 'loading' });
  const [busy, setBusy] = useState(false);
  const [logOutError, setLogOutError] = useState<string>();

  const refresh = useCallback(() => {
    setLoad({ state: 'loading' });
    // The list is the main thing. If only the usage fails, still show the list.
    Promise.all([listNotes(), getUsage().catch(() => undefined)])
      .then(([notes, usage]) => setLoad({ state: 'ready', notes, usage }))
      .catch(() => setLoad({ state: 'error' }));
  }, []);

  // Load again every time the person comes back to Home (for example after adding a note).
  useFocusEffect(refresh);

  async function logOut() {
    setBusy(true);
    const result = await signOut();
    setBusy(false);
    setLogOutError(result.error);
  }

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
          <Button label="Retry" variant="secondary" onPress={refresh} />
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

      <GlassPanel>
        <Body small color="textSecondary">
          Logged in as
        </Body>
        <Body>{session?.user.email}</Body>
        {logOutError ? (
          <Body small color="danger" accessibilityRole="alert">
            {logOutError}
          </Body>
        ) : null}
        <Button label="Log out" variant="secondary" loading={busy} onPress={logOut} />
      </GlassPanel>
    </Screen>
  );
}
