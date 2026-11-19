import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { View } from 'react-native';

import { HelpButton } from '@/components/help/help-button';
import { LanguagePicker } from '@/components/notes/language-picker';
import { NoteRow } from '@/components/notes/note-row';
import { UsagePanel } from '@/components/notes/usage-panel';
import { Body } from '@/components/ui/body';
import { Button } from '@/components/ui/button';
import { GlassPanel } from '@/components/ui/glass-panel';
import { Heading } from '@/components/ui/heading';
import { Screen } from '@/components/ui/screen';
import { Skeleton } from '@/components/ui/skeleton';
import { languageName } from '@/constants/languages';
import { Spacing } from '@/constants/theme';
import { useAuth } from '@/lib/auth';
import { getUsage, listNotes, type NoteRow as Note, type Usage } from '@/lib/notes';
import { useProfile } from '@/lib/profile';
import {
  DEFAULT_SETTINGS,
  getRecapSettings,
  shortRecipients,
  shortWhen,
  type RecapSettings,
} from '@/lib/recaps';

const BUSY = ['Uploading', 'Queued', 'Transcribing', 'Summarizing'];
const POLL_MS = 3000;

type Load = { state: 'loading' } | { state: 'error' } | { state: 'ready'; notes: Note[]; usage?: Usage };

/** One line of the account box: what it is set to, what that means, and how to change it. */
function SettingRow({
  value,
  note,
  action,
  error,
}: {
  value: string;
  note: string;
  action?: React.ReactNode;
  error?: string;
}) {
  return (
    <View style={{ gap: Spacing.two }}>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: Spacing.two }}>
        <View style={{ flex: 1, minWidth: 180, gap: Spacing.half }}>
          <Body>{value}</Body>
          <Body small color="textSecondary">
            {note}
          </Body>
        </View>
        {action}
      </View>
      {error ? (
        <Body small color="danger" accessibilityRole="alert">
          {error}
        </Body>
      ) : null}
    </View>
  );
}

/** Home: the list of notes, newest first, and how many meetings are used this month. */
export default function HomeScreen() {
  const { session, signOut } = useAuth();
  const router = useRouter();
  const [load, setLoad] = useState<Load>({ state: 'loading' });
  const [busy, setBusy] = useState(false);
  const [logOutError, setLogOutError] = useState<string>();
  const { languageCode, setLanguage } = useProfile();
  const [languageOpen, setLanguageOpen] = useState(false);
  const [languageError, setLanguageError] = useState<string>();
  // The account's recap settings, so the row can say what is set rather than only naming itself.
  // If they cannot be read, the row shows the safe defaults instead of an error: this is a
  // signpost to a page, not the page itself.
  const [recap, setRecap] = useState<RecapSettings>(DEFAULT_SETTINGS);

  const refresh = useCallback((quiet = false) => {
    if (!quiet) setLoad({ state: 'loading' });
    // The list is the main thing. If only the usage or the recap settings fail, still show it.
    Promise.all([
      listNotes(),
      getUsage().catch(() => undefined),
      getRecapSettings().catch(() => undefined),
    ])
      .then(([notes, usage, recapSettings]) => {
        if (recapSettings) setRecap(recapSettings.settings);
        setLoad({ state: 'ready', notes, usage });
      })
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

      {/*
        A settings box, so it is built like one: the thing itself first, the explanation under it,
        and the button that changes it beside it. Stacking a quiet label above every value would
        make three lines where one will do.
      */}
      <GlassPanel>
        <Heading level={3}>Your account</Heading>

        <SettingRow value={session?.user.email ?? ''} note="Signed in on this device." />

        <SettingRow
          value={languageName(languageCode)}
          note="Your summaries, your to-dos and the chat answers are written in this language."
          action={<Button label="Change language" variant="secondary" onPress={() => setLanguageOpen(true)} />}
          error={languageError}
        />

        <SettingRow
          value={shortRecipients(recap)}
          note={shortWhen(recap)}
          action={
            <Button
              label="Recap emails"
              variant="secondary"
              onPress={() => router.push('/recap-emails')}
            />
          }
        />

        {logOutError ? (
          <Body small color="danger" accessibilityRole="alert">
            {logOutError}
          </Body>
        ) : null}
        <Button label="Log out" variant="secondary" loading={busy} onPress={logOut} />
      </GlassPanel>

      <LanguagePicker
        title="Your language"
        hint="Gyan writes your summaries, your to-dos and its chat answers in this language."
        selected={languageCode}
        visible={languageOpen}
        helpId="translation"
        onClose={() => setLanguageOpen(false)}
        onPick={async (code) => {
          setLanguageOpen(false);
          setLanguageError(undefined);
          const result = await setLanguage(code);
          if (result.error) setLanguageError(result.error);
        }}
      />
    </Screen>
  );
}
