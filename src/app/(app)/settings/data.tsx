import { useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Linking, Platform, Pressable, View } from 'react-native';

import { BackLink } from '@/components/ui/back-link';
import { Body } from '@/components/ui/body';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { GlassPanel } from '@/components/ui/glass-panel';
import { Heading } from '@/components/ui/heading';
import { Screen } from '@/components/ui/screen';
import { SettingRow } from '@/components/ui/setting-row';
import { Skeleton } from '@/components/ui/skeleton';
import { Colors, Radius, Spacing } from '@/constants/theme';
import {
  CONFIRM_WORD,
  MESSAGES,
  canDeleteAccount,
  deleteAccount,
  deleteNote,
  exportMyData,
  plainSize,
  WHAT_STAYS,
  type DeleteCheck,
  type ExportResult,
} from '@/lib/account';
import { useAuth } from '@/lib/auth';
import { listNotes, noteTitle, type NoteRow } from '@/lib/notes';
import { getSecuritySettings, saveSecuritySettings, type SecuritySettings } from '@/lib/security';

type Load = { state: 'loading' } | { state: 'error' } | { state: 'ready' };

/**
 * Is this an address Gyan is willing to hand to the browser or the phone?
 *
 * Only a secure address at the Supabase project this app was built against. Anything else --
 * another website, a javascript: address, a file on the machine -- is refused, whatever
 * came back from the server.
 */
export function isOurDownload(url: string): boolean {
  try {
    const asked = new URL(url);
    if (asked.protocol !== 'https:') return false;
    const ours = process.env.EXPO_PUBLIC_SUPABASE_URL;
    if (!ours) return false;
    return asked.origin === new URL(ours).origin;
  } catch {
    return false;
  }
}

/** How long notes may be kept. Null means for ever. */
const KEEPING_CHOICES: (number | null)[] = [null, 365, 90, 30];

function keepingLabel(days: number | null): string {
  if (days === null) return 'For ever';
  if (days === 365) return '1 year';
  return `${days} days`;
}

/**
 * One option in a short list. The chosen one is outlined in brand blue and a press is only
 * a fill, the rule settled in the prompt 8 design pass: otherwise the option you are on and
 * the row under your finger look the same.
 */
function Choice({
  label,
  chosen,
  disabled,
  onPress,
}: {
  label: string;
  chosen: boolean;
  disabled?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      role="radio"
      aria-checked={chosen}
      accessibilityRole="radio"
      accessibilityState={{ selected: chosen, checked: chosen, disabled: !!disabled }}
      style={({ pressed }) => ({
        paddingVertical: Spacing.two,
        paddingHorizontal: Spacing.three,
        borderRadius: Radius.pill,
        borderWidth: 1,
        borderColor: chosen ? Colors.brand : Colors.glassBorder,
        backgroundColor: pressed ? Colors.glass : 'transparent',
        opacity: disabled ? 0.5 : 1,
      })}
    >
      <Body small color={chosen ? 'text' : 'textSecondary'}>
        {label}
      </Body>
    </Pressable>
  );
}



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
  const [privacy, setPrivacy] = useState<SecuritySettings>();
  const [privacyBusy, setPrivacyBusy] = useState(false);
  const [privacyError, setPrivacyError] = useState<string>();
  const [exportBusy, setExportBusy] = useState(false);
  const [exportError, setExportError] = useState<string>();
  const [exportResult, setExportResult] = useState<ExportResult>();

  const [askingNote, setAskingNote] = useState<NoteRow>();
  const [askingAccount, setAskingAccount] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [done, setDone] = useState<string>();

  const refresh = useCallback(async () => {
    setLoad({ state: 'loading' });
    try {
      const [theNotes, theCheck, thePrivacy] = await Promise.all([
        listNotes(),
        canDeleteAccount(),
        // A problem reading the privacy settings must not stop somebody deleting a note,
        // so this one is allowed to come back empty and the panels say nothing rather than
        // the whole screen failing.
        getSecuritySettings().catch(() => undefined),
      ]);
      setNotes(theNotes);
      setCheck(theCheck);
      setPrivacy(thePrivacy);
      setLoad({ state: 'ready' });
    } catch {
      setLoad({ state: 'error' });
    }
  }, []);

  /** Changes how long notes are kept. Owner only; the database says so out loud. */
  const chooseKeeping = useCallback(
    async (days: number | null) => {
      if (!privacy) return;
      setPrivacyBusy(true);
      setPrivacyError(undefined);
      const { error } = await saveSecuritySettings({ retentionDays: days });
      setPrivacyBusy(false);
      if (error) {
        setPrivacyError(error);
        return;
      }
      setPrivacy({ ...privacy, retentionDays: days });
    },
    [privacy],
  );

  /** Turns the summary in recap emails on or off. */
  const chooseEmails = useCallback(
    async (allowed: boolean) => {
      if (!privacy) return;
      setPrivacyBusy(true);
      setPrivacyError(undefined);
      const { error } = await saveSecuritySettings({ emailSummaries: allowed });
      setPrivacyBusy(false);
      if (error) {
        setPrivacyError(error);
        return;
      }
      setPrivacy({ ...privacy, emailSummaries: allowed });
    },
    [privacy],
  );

  /** Asks the server to put a copy of everything together. It can take a little while. */
  const makeExport = useCallback(async () => {
    setExportBusy(true);
    setExportError(undefined);
    const { result, error } = await exportMyData();
    setExportBusy(false);
    if (error || !result) {
      setExportError(error ?? MESSAGES.exportProblem);
      return;
    }
    setExportResult(result);
  }, []);

  /**
   * Opens the finished copy. On the web the browser downloads it; on a phone it opens.
   *
   * THE ADDRESS IS CHECKED FIRST. It comes from our own server, so this is belt and braces
   * rather than a hole being closed -- but handing an address straight to the operating
   * system is the one thing in this app that reaches outside it, and the check costs
   * nothing. Only https, and only to the project this app is built against; never a
   * javascript: or file: address, whatever came back.
   */
  const openExport = useCallback(async (url: string) => {
    if (!isOurDownload(url)) {
      setExportError(MESSAGES.exportProblem);
      return;
    }
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      window.open(url, '_blank', 'noopener,noreferrer');
      return;
    }
    await Linking.openURL(url);
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
          {/* ------------------------------------------------------------- */}
          {/* How long notes are kept                                       */}
          {/* ------------------------------------------------------------- */}
          <GlassPanel>
            <Heading level={3}>How long notes are kept</Heading>
            <SettingRow
              value={keepingLabel(privacy?.retentionDays ?? null)}
              note="Notes older than this are deleted on their own, with their recordings. Keeping less is safer if anything ever goes wrong, but nothing comes back once it is gone."
              error={privacyError}
            />
            {privacy?.isOwner ? (
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two }}>
                {KEEPING_CHOICES.map((days) => (
                  <Choice
                    key={String(days)}
                    label={keepingLabel(days)}
                    chosen={(privacy?.retentionDays ?? null) === days}
                    disabled={privacyBusy}
                    onPress={() => void chooseKeeping(days)}
                  />
                ))}
              </View>
            ) : (
              <Body small color="textSecondary">Only the account owner can change this.</Body>
            )}
          </GlassPanel>

          {/* ------------------------------------------------------------- */}
          {/* What emails may carry                                         */}
          {/* ------------------------------------------------------------- */}
          <GlassPanel>
            <Heading level={3}>What recap emails carry</Heading>
            <SettingRow
              value={privacy?.emailSummaries === false ? 'A link only' : 'The whole summary'}
              note={
                privacy?.emailSummaries === false
                  ? 'Recap emails carry the title, the date and a button to open the note. What was said never leaves gyan.'
                  : 'Recap emails carry the summary itself. An email sits in an inbox, gets forwarded and syncs to phones, so some workspaces would rather send only a link.'
              }
              action={
                privacy?.isOwner ? (
                  <Button
                    label={privacy?.emailSummaries === false ? 'Send the summary' : 'Send a link only'}
                    variant="secondary"
                    loading={privacyBusy}
                    onPress={() => void chooseEmails(privacy?.emailSummaries === false)}
                  />
                ) : undefined
              }
            />
          </GlassPanel>

          {/* ------------------------------------------------------------- */}
          {/* A copy of everything                                          */}
          {/* ------------------------------------------------------------- */}
          <GlassPanel>
            <Heading level={3}>Download a copy of everything</Heading>
            <Body small color="textSecondary">
              One file holding every note on this workspace, with its transcript, summary and
              to-dos, your own chats, and the recordings. It is yours to keep.
            </Body>
            {exportResult ? (
              <>
                <Body small color="success" accessibilityRole="alert">
                  Your copy is ready ({plainSize(exportResult.bytes)}
                  {exportResult.filesLinked > 0
                    ? `, and ${exportResult.filesLinked} recording${exportResult.filesLinked === 1 ? '' : 's'} linked inside it`
                    : ''}
                  ).
                </Body>
                <Button label="Download it" onPress={() => void openExport(exportResult.url)} />
                <Body small color="textSecondary">
                  The link works for one hour. Ask again any time for a fresh one.
                </Body>
              </>
            ) : (
              <Button
                label="Put my copy together"
                variant="secondary"
                loading={exportBusy}
                onPress={() => void makeExport()}
              />
            )}
            {exportError ? (
              <Body small color="danger" accessibilityRole="alert">
                {exportError}
              </Body>
            ) : null}
          </GlassPanel>

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

                {/*
                  WHAT DOES NOT GO, AND WHY.
                  Being straight about this matters more than the list being short. Somebody
                  told "everything is gone" who later finds a row with their account id on
                  it has been misled, and that is worse than saying so plainly now.
                */}
                <View style={{ gap: Spacing.two, paddingTop: Spacing.two }}>
                  <Body small>What stays, and why:</Body>
                  {WHAT_STAYS.map((item) => (
                    <View key={item.what} style={{ gap: 2 }}>
                      <Body small>{item.what}</Body>
                      <Body small color="textSecondary">
                        {item.why}
                      </Body>
                    </View>
                  ))}
                  <Body small color="textSecondary">
                    None of these holds a word anybody said in a meeting.
                  </Body>
                </View>

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
          // NOT "gyan keeps no copy", which was not true: a few records stay, and the
          // screen behind this dialog lists them with the reason for each.
          'None of it can be put back',
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
