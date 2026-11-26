import * as DocumentPicker from 'expo-document-picker';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { View } from 'react-native';

import { ChoiceCard } from '@/components/notes/choice-card';
import { FilePickButton } from '@/components/notes/file-pick-button';
import { UsagePanel } from '@/components/notes/usage-panel';
import { Body } from '@/components/ui/body';
import { Button } from '@/components/ui/button';
import { GlassPanel } from '@/components/ui/glass-panel';
import { PageHeader } from '@/components/ui/page-header';
import { Screen } from '@/components/ui/screen';
import { Section } from '@/components/ui/section';
import { TextField } from '@/components/ui/text-field';
import { Colors, Radius, Spacing } from '@/constants/theme';
import { canExtractAudio, extractAudio, readDuration } from '@/lib/audio-extract';
import { getBotSettings, getMeetingMinutesAllowed } from '@/lib/meeting-bot';
import { getPlanAndUsage, type PlanAndUsage } from '@/lib/plans';
import {
  ACCEPTED_TYPES_TEXT,
  classifyFile,
  getUsage,
  isLimitReached,
  MAX_FILE_BYTES,
  MAX_VIDEO_BYTES_TO_EXTRACT,
  NOTE_ERROR_TEXT,
  NoteError,
  prepareAttempt,
  sendAttempt,
  type Attempt,
  type NoteErrorCode,
  type PickedFile,
  type Usage,
} from '@/lib/notes';

type Mode = 'none' | 'upload' | 'text';
type Phase =
  | { name: 'idle' }
  | { name: 'preparing'; message: string; fraction?: number }
  | { name: 'uploading'; fraction?: number }
  | { name: 'failed'; message: string };

/** New note: pick how to add a conversation. Upload and Paste text work. The other 2 are coming. */
export default function NewNoteScreen() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>('none');
  const [usage, setUsage] = useState<Usage>();
  const [usageFailed, setUsageFailed] = useState(false);
  const [phase, setPhase] = useState<Phase>({ name: 'idle' });
  const [attempt, setAttempt] = useState<Attempt>();
  const [title, setTitle] = useState('');
  const [text, setText] = useState('');
  const [fieldError, setFieldError] = useState<string>();
  // Whether this account may send a bot at all. Undefined while it is being asked, which keeps
  // the card dimmed -- not knowing is treated exactly like "off".
  const [botEnabled, setBotEnabled] = useState(false);
  /** The plan, for the bot hours line. Only asked for because the bot card needs it. */
  const [plan, setPlan] = useState<PlanAndUsage>();
  /**
   * The longest one note may be, in minutes, from the plans table.
   *
   * Undefined means either "no limit on this plan" or "could not ask", and both let an upload
   * through. The server checks again once the transcript is made, which is the backstop.
   */
  const [maxMinutes, setMaxMinutes] = useState<number>();

  useEffect(() => {
    getUsage().then(setUsage, () => setUsageFailed(true));
    // A failure here leaves the card saying "Coming soon", which is the safe way to be wrong.
    getBotSettings().then(
      (s) => setBotEnabled(s.enabled),
      () => setBotEnabled(false),
    );
    getPlanAndUsage().then(setPlan, () => undefined);
    getMeetingMinutesAllowed().then(setMaxMinutes, () => undefined);
  }, []);

  const limitReached = !!usage && isLimitReached(usage.used, usage.limit);
  const busy = phase.name === 'preparing' || phase.name === 'uploading';

  async function send(a: Attempt) {
    setAttempt(a);
    setPhase({ name: 'uploading' });
    try {
      await sendAttempt(a, (fraction) => setPhase({ name: 'uploading', fraction }));
      router.replace('/');
    } catch (e) {
      setPhase({ name: 'failed', message: NOTE_ERROR_TEXT[(e as NoteError).code ?? 'unknown'] });
    }
  }

  function fail(code: NoteErrorCode) {
    setPhase({ name: 'failed', message: NOTE_ERROR_TEXT[code] });
    setAttempt(undefined);
  }

  /** Phones: open the phone's file picker, then handle the file. */
  async function pickFile() {
    if (!usage || busy) return;
    setFieldError(undefined);
    const result = await DocumentPicker.getDocumentAsync({ type: '*/*', copyToCacheDirectory: true, base64: false });
    if (result.canceled || !result.assets?.[0]) return;
    const asset = result.assets[0];
    await handlePicked({ name: asset.name, size: asset.size ?? 0, mimeType: asset.mimeType, uri: asset.uri, file: asset.file });
  }

  /** A file was chosen (on any platform). Check it, take the sound out of videos, and send it. */
  async function handlePicked(picked: PickedFile) {
    if (!usage || busy) return;
    setFieldError(undefined);
    const kind = classifyFile(picked.name, picked.mimeType);
    if (!kind) return fail('bad_type');

    let body: Blob | { uri: string } = picked.file ?? { uri: picked.uri };
    let name = picked.name;
    let contentType = picked.mimeType || (kind === 'text' ? 'text/plain' : kind === 'audio' ? 'audio/mpeg' : 'video/mp4');
    if (kind === 'text') contentType = contentType.startsWith('text/') ? contentType : 'text/plain';

    // TOO LONG FOR THIS PLAN? Asked here, before anything is uploaded or paid for.
    //
    // Only the web can answer: a phone cannot read a media file's length without a native
    // library. When the answer is "I do not know" the upload goes ahead and the server refuses
    // it after the transcript instead -- which works, but costs one transcription to find out.
    if (kind !== 'text' && maxMinutes && picked.file) {
      const seconds = await readDuration(picked.file);
      // The same half minute of slack the server allows, so the two cannot disagree about a
      // recording that measures 60:00.4.
      if (seconds && seconds > maxMinutes * 60 + 30) {
        setPhase({
          name: 'failed',
          message: `That recording is ${Math.round(seconds / 60)} minutes long, and your plan allows ${maxMinutes} minutes in one note. A bigger plan allows longer notes.`,
        });
        setAttempt(undefined);
        return;
      }
    }

    // Videos: take the sound out first, so big videos shrink.
    if (kind === 'video') {
      let extracted: Blob | undefined;
      if (canExtractAudio && picked.file && picked.size <= MAX_VIDEO_BYTES_TO_EXTRACT) {
        setPhase({ name: 'preparing', message: 'Taking the sound out of your video…', fraction: 0 });
        extracted = await extractAudio(picked.file, (fraction) =>
          setPhase({ name: 'preparing', message: 'Taking the sound out of your video…', fraction }),
        );
      }
      if (extracted) {
        body = extracted;
        contentType = 'audio/mpeg';
        name = `${name.replace(/\.[^.]+$/, '')}.mp3`;
      } else if (picked.size > MAX_FILE_BYTES) {
        return fail('too_big');
      }
      // If the sound could not be taken out but the video is small enough, send the video as it is.
    }

    const size = body instanceof Blob ? body.size : picked.size;
    if (size > MAX_FILE_BYTES) return fail('too_big');

    await send(prepareAttempt(usage.accountId, { kind: 'file', title: picked.name.replace(/\.[^.]+$/, ''), name, contentType, body }));
  }

  async function submitText() {
    if (!usage || busy) return;
    if (text.trim().length === 0) {
      setFieldError('Paste or type some text first.');
      return;
    }
    setFieldError(undefined);
    await send(prepareAttempt(usage.accountId, { kind: 'text', title: title.trim(), text }));
  }

  async function retry() {
    if (attempt) await send(attempt);
    else setPhase({ name: 'idle' });
  }

  const progress = phase.name === 'preparing' || phase.name === 'uploading' ? phase.fraction : undefined;

  return (
    <Screen testID="new-note-screen">
      {/* No line under the title: the section heading below already asks the question, and
          saying it twice in two sizes is how a screen starts to feel padded. */}
      <PageHeader title="New note" helpId="newNote" />

      {/* The four ways in come FIRST now. The meetings meter used to sit above them, which
          put a number nobody came here for between the title and the only thing to do. */}
      <Section title="How do you want to add it?">
        <ChoiceCard
          testID="new-note-record"
          title="Record"
          description="Record a conversation with your phone."
          disabled
          disabledLabel="Coming soon"
        />
        <ChoiceCard
          testID="new-note-upload"
          title="Upload"
          description="Audio, video, or a text file."
          selected={mode === 'upload'}
          disabled={limitReached || !usage}
          disabledLabel={limitReached ? 'Limit reached' : undefined}
          onPress={() => {
            setMode('upload');
            setPhase({ name: 'idle' });
          }}
        />
        <ChoiceCard
          testID="new-note-paste"
          title="Paste text"
          description="Paste a transcript or your own notes."
          selected={mode === 'text'}
          disabled={!usage}
          onPress={() => {
            setMode('text');
            setPhase({ name: 'idle' });
          }}
        />
        {/* The only card that leads somewhere else, because sending a bot needs a link, a
            confirmation and a look at the hours left -- more than fits under a choice. While the
            account's switch is off it keeps the dimmed "Coming soon" it has had since prompt 4. */}
        <ChoiceCard
          testID="new-note-meeting-link"
          title="Meeting link"
          description="Send a bot to a Zoom, Meet, or Teams call."
          disabled={!botEnabled}
          disabledLabel={!botEnabled ? 'Coming soon' : undefined}
          onPress={botEnabled ? () => router.push('/meeting-link') : undefined}
        />
      </Section>

      {mode === 'upload' && !limitReached ? (
        <GlassPanel style={{ gap: Spacing.three }}>
          <Body color="textSecondary">{ACCEPTED_TYPES_TEXT}. Up to 50 MB.</Body>
          <FilePickButton disabled={busy} onPressNative={pickFile} onFile={handlePicked} />
        </GlassPanel>
      ) : null}

      {mode === 'text' ? (
        <GlassPanel style={{ gap: Spacing.three }}>
          <TextField
            testID="new-note-title"
            label="Title (optional)"
            value={title}
            onChangeText={setTitle}
            editable={!busy}
          />
          <TextField
            testID="new-note-text"
            label="Your text"
            value={text}
            onChangeText={setText}
            multiline
            disabled={busy}
            error={fieldError}
            numberOfLines={8}
          />
          <Button testID="new-note-add" label="Add note" disabled={busy} onPress={submitText} />
        </GlassPanel>
      ) : null}

      {phase.name === 'preparing' || phase.name === 'uploading' ? (
        <GlassPanel accessibilityRole="progressbar" accessibilityLabel="Upload progress">
          <Body>{phase.name === 'preparing' ? phase.message : 'Uploading…'}</Body>
          <View style={{ height: 8, borderRadius: Radius.pill, backgroundColor: Colors.skeleton, overflow: 'hidden' }}>
            <View
              style={{
                height: 8,
                width: progress === undefined ? '35%' : `${Math.round(progress * 100)}%`,
                backgroundColor: Colors.brand,
                borderRadius: Radius.pill,
              }}
            />
          </View>
          <Body small color="textSecondary">
            {progress === undefined ? 'Please keep this screen open.' : `${Math.round(progress * 100)}% done. Please keep this screen open.`}
          </Body>
        </GlassPanel>
      ) : null}

      {phase.name === 'failed' ? (
        <GlassPanel style={{ borderColor: Colors.dangerBorder }}>
          <Body color="danger" accessibilityRole="alert">
            {phase.message}
          </Body>
          {attempt ? <Button label="Retry" variant="secondary" onPress={retry} /> : null}
        </GlassPanel>
      ) : null}

      <View style={{ gap: Spacing.two, paddingTop: Spacing.two }}>
        {/* Bot hours, but only once the feature is switched on: a line about a thing somebody
          cannot use is noise on the screen they use most. */}
      {botEnabled && plan ? (
        <Body small color="textSecondary" testID="new-note-bot-hours">
          {plan.botHoursPerMonth <= 0
            ? 'Meeting bot: not included on this plan.'
            : `Meeting bot: ${hours(plan.botHoursUsed)} of ${hours(plan.botHoursPerMonth)} hours used this month.`}
          {maxMinutes ? ` One note can be up to ${maxMinutes} minutes long.` : ''}
        </Body>
      ) : null}

      <UsagePanel usage={usage} loading={!usage && !usageFailed} />
        {usageFailed ? (
          <Body small color="danger" accessibilityRole="alert">
            We could not check your meetings used this month. Go back and try again.
          </Body>
        ) : null}
      </View>
    </Screen>
  );
}

/** Hours, to one place, with no trailing ".0" to make a whole number look like a measurement. */
function hours(value: number): string {
  const one = Math.round(value * 10) / 10;
  return Number.isInteger(one) ? String(one) : one.toFixed(1);
}
