import { useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { View } from 'react-native';

import { BackLink } from '@/components/ui/back-link';
import { Body } from '@/components/ui/body';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { GlassPanel } from '@/components/ui/glass-panel';
import { Heading } from '@/components/ui/heading';
import { Screen } from '@/components/ui/screen';
import { Skeleton } from '@/components/ui/skeleton';
import { Colors, Radius, Spacing } from '@/constants/theme';
import {
  CONFIRM_WORD,
  MESSAGES,
  canDeleteAccount,
  deleteAccount,
  deleteNote,
  type DeleteCheck,
} from '@/lib/account';
import { useAuth } from '@/lib/auth';
import { listNotes, noteTitle, type NoteRow } from '@/lib/notes';

type Load = { state: 'loading' } | { state: 'error' } | { state: 'ready' };

/**
 * Data and privacy: the two ways to make something go away for good.
 *
 * Both are deliberately a little slow. Deleting a note names the note in the question. Deleting
 * an account makes you type a word, lists exactly what goes, and will not even start if other
 * people are still on the account.
 */
export default function DataPrivacyScreen() {
  const router = useRouter();
  const { signOut } = useAuth();
  const [load, setLoad] = useState<Load>({ state: 'loading' });
  const [notes, setNotes] = useState<NoteRow[]>([]);
  const [check, setCheck] = useState<DeleteCheck>();

  const [askingNote, setAskingNote] = useState<NoteRow>();
  const [askingAccount, setAskingAccount] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [done, setDone] = useState<string>();

  const refresh = useCallback(async () => {
    setLoad({ state: 'loading' });
    try {
      const [theNotes, theCheck] = await Promise.all([listNotes(), canDeleteAccount()]);
      setNotes(theNotes);
      setCheck(theCheck);
      setLoad({ state: 'ready' });
    } catch {
      setLoad({ state: 'error' });
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function removeNote() {
    if (!askingNote) return;
    setBusy(true);
    setError(undefined);
    try {
      await deleteNote(askingNote.id);
      setDone(`${noteTitle(askingNote)} is deleted.`);
      setAskingNote(undefined);
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : MESSAGES.noteProblem);
    } finally {
      setBusy(false);
    }
  }

  async function removeAccount() {
    setBusy(true);
    setError(undefined);
    const result = await deleteAccount();
    setBusy(false);
    if (!result.ok) {
      setError(result.message);
      return;
    }
    // Everything is gone, so there is nothing left to come back to. Sign out and leave.
    setAskingAccount(false);
    await signOut();
    router.replace('/');
  }

  return (
    <Screen>
      <BackLink label="Settings" href="/settings" helpId="settingsData" />
      <Heading level={1}>Data and privacy</Heading>

      {load.state === 'loading' ? (
        <GlassPanel accessibilityLabel="Loading your notes">
          <Skeleton width="60%" height={18} />
          <Skeleton width="40%" />
        </GlassPanel>
      ) : null}

      {load.state === 'error' ? (
        <GlassPanel>
          <Heading level={3}>Gyan could not read your notes</Heading>
          <Body color="textSecondary">
            This usually means the connection dropped. Nothing has changed.
          </Body>
          <Button label="Try again" variant="secondary" onPress={() => void refresh()} />
        </GlassPanel>
      ) : null}

      {load.state === 'ready' ? (
        <>
          <GlassPanel>
            <Heading level={3}>Delete a note</Heading>
            <Body small color="textSecondary">
              Deleting a note removes its recording, its transcript, its summary, its to-dos and
              the chat about it. It does not give you the meeting back this month.
            </Body>

            {notes.length === 0 ? (
              <Body color="textSecondary">You have no notes yet.</Body>
            ) : (
              notes.map((note) => (
                <View
                  key={note.id}
                  style={{
                    flexDirection: 'row',
                    flexWrap: 'wrap',
                    alignItems: 'center',
                    gap: Spacing.two,
                    paddingVertical: Spacing.one,
                    borderTopWidth: 1,
                    borderTopColor: Colors.glassBorder,
                  }}>
                  <View style={{ flex: 1, minWidth: 180, gap: Spacing.half }}>
                    <Body>{noteTitle(note)}</Body>
                    <Body small color="textSecondary">
                      {new Date(note.created_at).toLocaleDateString()}
                    </Body>
                  </View>
                  <Button label="Delete" variant="secondary" onPress={() => setAskingNote(note)} />
                </View>
              ))
            )}

            {done ? (
              <Body small color="success" accessibilityRole="alert">
                {done}
              </Body>
            ) : null}
          </GlassPanel>

          <GlassPanel>
            <View
              style={{
                alignSelf: 'flex-start',
                paddingHorizontal: Spacing.three,
                paddingVertical: Spacing.one,
                borderRadius: Radius.pill,
                backgroundColor: Colors.dangerFill,
                borderWidth: 1,
                borderColor: Colors.dangerBorder,
              }}>
              <Body small color="danger">
                Cannot be undone
              </Body>
            </View>

            <Heading level={3}>Delete your account</Heading>

            {check?.canDelete ? (
              <>
                <Body color="textSecondary">{check.whatGoes}</Body>
                <Button
                  label="Delete my account"
                  variant="secondary"
                  onPress={() => setAskingAccount(true)}
                />
              </>
            ) : (
              <>
                <Body color="danger" accessibilityRole="alert">
                  {check?.reason}
                </Body>
                <Button
                  label="Go to Team"
                  variant="secondary"
                  onPress={() => router.push('/settings/team')}
                />
              </>
            )}
          </GlassPanel>
        </>
      ) : null}

      <ConfirmDialog
        visible={!!askingNote}
        title="Delete this note?"
        message={askingNote ? `${noteTitle(askingNote)} will be gone for good.` : ''}
        details={[
          'The recording you uploaded',
          'The transcript and who said what',
          'The summary, the decisions and the to-dos',
          'Any translations, and the chat about this note',
          'It does not give you the meeting back this month',
        ]}
        confirmLabel="Delete this note"
        busy={busy}
        error={error}
        onConfirm={removeNote}
        onCancel={() => {
          setAskingNote(undefined);
          setError(undefined);
        }}
      />

      <ConfirmDialog
        visible={askingAccount}
        title="Delete your account?"
        message={check?.whatGoes ?? ''}
        details={[
          'Every note, recording and transcript',
          'Every summary, to-do and mind map',
          'Your chats, and everything you have translated',
          'Your login, so you cannot sign in again',
          'Gyan keeps no copy, and we cannot put it back',
        ]}
        typeToConfirm={CONFIRM_WORD}
        typeHint={`Type ${CONFIRM_WORD} to confirm`}
        confirmLabel="Delete everything"
        busy={busy}
        error={error}
        onConfirm={removeAccount}
        onCancel={() => {
          setAskingAccount(false);
          setError(undefined);
        }}
      />

      <View style={{ height: Spacing.six }} />
    </Screen>
  );
}
