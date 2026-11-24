import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState, type ComponentRef } from 'react';
import { Pressable, ScrollView, View } from 'react-native';

import { HelpButton } from '@/components/help/help-button';
import { ChatBody } from '@/components/notes/chat-body';

import { LanguagePicker } from '@/components/notes/language-picker';
import { RecapDialog } from '@/components/notes/recap-dialog';
import { SummaryTab } from '@/components/notes/summary-tab';
import { TranslationBar } from '@/components/notes/translation-bar';
import { Body } from '@/components/ui/body';
import { Button } from '@/components/ui/button';
import { GlassPanel } from '@/components/ui/glass-panel';
import { Heading } from '@/components/ui/heading';
import { ActionMenu, type ActionItem as MenuItem } from '@/components/ui/action-menu';
import { Screen } from '@/components/ui/screen';
import { Skeleton } from '@/components/ui/skeleton';
import { StatusBadge } from '@/components/ui/status-badge';
import { ScriptText } from '@/components/ui/script-text';
import { TabBar } from '@/components/ui/tab-bar';
import { baseCode, languageName, sameLanguage } from '@/constants/languages';
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
import { useProfile } from '@/lib/profile';
import {
  getSavedTranslation,
  MESSAGES as TRANSLATE_MESSAGES,
  translate,
  type SummaryTranslation,
  type TranscriptTranslation,
  type TranslateKind,
  type TranslationContent,
} from '@/lib/translations';

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

const TABS = ['Summary', 'Transcript', 'Chat'] as const;
type Tab = (typeof TABS)[number];

/**
 * Each tab translates its own thing -- and Chat translates nothing.
 *
 * This map used to be a `Record<Tab, ...>`, so adding Chat was a compile error until the
 * question "what does translating a conversation mean?" had an answer. It means nothing: a
 * chat is written in your own language already, because Gyan answers in it. So Chat is left
 * out of the map and the Translate button is off while that tab is open.
 */
const KIND_FOR_TAB: Partial<Record<Tab, TranslateKind>> = { Summary: 'summary', Transcript: 'transcript' };

/** One tab's translation: the language it is in, and the words. */
type TabTranslation = { language: string; content: TranslationContent };

const SAME_LANGUAGE_NOTE = 'This note is already in that language, so there is nothing to translate.';

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
  const { id, line, recap } = useLocalSearchParams<{ id: string; line?: string; recap?: string }>();
  const router = useRouter();
  const [load, setLoad] = useState<Load>({ state: 'loading' });
  const [tab, setTab] = useState<Tab>('Summary');
  const [starting, setStarting] = useState(false);
  const [startError, setStartError] = useState(false);
  const [savingItemId, setSavingItemId] = useState<string>();
  const [itemError, setItemError] = useState(false);
  const [recapOpen, setRecapOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  /** The transcript line a passage number pointed at. It stays lit until another one is tapped. */
  const [highlightId, setHighlightId] = useState<string>();

  const { languageCode, setLanguage } = useProfile();
  /** Which picker is open, if either. */
  const [picker, setPicker] = useState<'mine' | 'translate'>();
  /** The translation held for each tab. Each tab translates its own words. */
  const [translated, setTranslated] = useState<Partial<Record<Tab, TabTranslation>>>({});
  /** Tabs where the person has asked to see the original words again. */
  const [showOriginal, setShowOriginal] = useState<Partial<Record<Tab, boolean>>>({});
  /** The language being fetched right now, so the list cannot be tapped twice. */
  const [translateBusy, setTranslateBusy] = useState<string>();
  const [translateError, setTranslateError] = useState<string>();
  /** A quiet note, such as "already in that language". Not a problem, so not red. */
  const [translateNote, setTranslateNote] = useState<string>();

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
   * Somebody tapped a passage number in an answer. Open the Transcript tab, scroll to that
   * line, and light it up.
   *
   * It used to close the chat panel as well, so the highlighted line was in plain view. The
   * chat is a tab now, so switching to the Transcript IS leaving the chat -- one move where
   * there were two.
   */
  const jumpTo = useCallback((source: ChatSource) => {
    setTab('Transcript');
    setHighlightId(source.segment_id);
    // Wait for the Transcript tab to be drawn before scrolling to the line.
    setTimeout(() => {
      const top = lineTops.current[source.segment_id];
      if (typeof top === 'number') pageRef.current?.scrollTo({ y: Math.max(top - 80, 0), animated: true });
    }, 50);
  }, []);

  /**
   * A search result opened this note at a particular line, as "?line=<id>". It is the same
   * jump the chat's passage numbers make, so there is one way to land on a moment, not two.
   * It runs once per line asked for, so scrolling away and back does not drag you back to it.
   */
  const jumped = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (!line || load.state !== 'ready' || jumped.current === line) return;
    jumped.current = line;
    jumpTo({ n: 0, segment_id: line, start_ms: 0, speaker_label: null });
  }, [line, load.state, jumpTo]);

  /**
   * A row on Home asked to share this note, as "?recap=1".
   *
   * Share means "send a recap by email", because that is the only sharing Gyan has. It runs
   * once per visit and only when there is something to send, so arriving at a half-finished
   * note opens the note rather than an empty dialog.
   */
  const openedRecap = useRef(false);

  const lines = load.state === 'ready' ? load.lines : [];
  const passages = load.state === 'ready' ? load.passages : [];
  const isText = load.state === 'ready' && load.note.source === 'text';
  // A note can be asked about as soon as it has words, whether somebody spoke them or typed them.
  const canAsk = lines.length > 0 || passages.length > 0;

  const summary = load.state === 'ready' ? load.summary : undefined;
  // The Summary tab can be translated once a summary exists. The Transcript tab, once it has
  // words. The Chat tab, never.
  const canTranslate = tab === 'Summary' ? !!summary : tab === 'Transcript' ? canAsk : false;
  // There is only something worth emailing once the note is finished and has a summary.
  const canSendRecap = load.state === 'ready' && load.note.status === 'Ready' && !!summary;
  /** The language the words on this tab are already in. */
  const originalLanguage =
    tab === 'Summary'
      ? (summary?.language ?? 'en')
      : (load.state === 'ready' ? load.note.spoken_language : undefined);

  const tabTranslation = translated[tab];
  const showingTranslation = !!tabTranslation && !showOriginal[tab];

  /** Switches the whole app to a language: summaries and chat answers are written in it. */
  async function pickMyLanguage(code: string) {
    setPicker(undefined);
    const result = await setLanguage(code);
    if (result.error) setTranslateError(result.error);
  }

  /**
   * Translates the open tab into one language.
   * It looks in the database first, so a translation somebody already paid for appears at once and
   * costs nothing. Only when there is none saved does it ask the server to make one.
   */
  async function pickTranslation(code: string) {
    if (!id) return;
    const kind = KIND_FOR_TAB[tab];
    if (!kind) return;
    const language = baseCode(code);
    setPicker(undefined);
    setTranslateError(undefined);
    setTranslateNote(undefined);

    // Nothing to do when the words are already in that language.
    if (sameLanguage(language, originalLanguage)) {
      setTranslated((current) => ({ ...current, [tab]: undefined }));
      setTranslateNote(SAME_LANGUAGE_NOTE);
      return;
    }

    setTranslateBusy(language);
    try {
      const saved = await getSavedTranslation(id, kind, language);
      const content = saved ?? (await askServerToTranslate(id, kind, language));
      if (content) {
        setTranslated((current) => ({ ...current, [tab]: { language, content } }));
        setShowOriginal((current) => ({ ...current, [tab]: false }));
      }
    } catch {
      setTranslateError(TRANSLATE_MESSAGES.problem);
    }
    setTranslateBusy(undefined);
  }

  /** Asks the server function for a translation. Sets the error and gives back nothing if it fails. */
  async function askServerToTranslate(
    noteId: string,
    kind: TranslateKind,
    language: string,
  ): Promise<TranslationContent | undefined> {
    const result = await translate(noteId, kind, language);
    if (result.ok) return result.content;
    setTranslateError(result.message);
    return undefined;
  }

  /** Everything on this page that is not reading the note. */
  const moreItems: MenuItem[] = [
    {
      testID: 'note-language',
      title: `Your language: ${languageName(languageCode)}`,
      summary: 'Gyan writes summaries, to-dos and chat answers in this language.',
      accessibilityLabel: `Your language: ${languageName(languageCode)}`,
      enabled: true,
      onPress: () => {
        setMoreOpen(false);
        setPicker('mine');
      },
    },
    {
      testID: 'note-translate',
      title: `Translate this ${tab.toLowerCase()}`,
      summary: canTranslate
        ? 'Read it in another language, with the original a tap away.'
        : tab === 'Chat'
          ? 'Gyan already answers in your language, so there is nothing to translate.'
          : 'There is nothing to translate yet.',
      accessibilityLabel: `Translate this ${tab.toLowerCase()}`,
      enabled: canTranslate,
      onPress: () => {
        setMoreOpen(false);
        setPicker('translate');
      },
    },
    {
      testID: 'note-send-recap',
      title: 'Send a recap by email',
      summary: canSendRecap
        ? 'The summary and the to-dos, to people on this account.'
        : 'There is nothing to send until this note is finished and has a summary.',
      accessibilityLabel: 'Send a recap of this note by email',
      enabled: canSendRecap,
      onPress: () => {
        setMoreOpen(false);
        setRecapOpen(true);
      },
    },
  ];

  useEffect(() => {
    if (recap !== '1' || openedRecap.current || !canSendRecap) return;
    openedRecap.current = true;
    setRecapOpen(true);
  }, [recap, canSendRecap]);

  const translationBar = tabTranslation || translateBusy || translateError ? (
    <TranslationBar
      language={translateBusy ?? tabTranslation?.language ?? languageCode}
      busy={!!translateBusy}
      error={translateError}
      showing={showingTranslation}
      onToggle={() => setShowOriginal((current) => ({ ...current, [tab]: !current[tab] }))}
      onClear={() => {
        setTranslateError(undefined);
        setTranslated((current) => ({ ...current, [tab]: undefined }));
      }}
    />
  ) : null;

  return (
    <View style={{ flex: 1 }}>
      {/* The Chat tab does its own scrolling, so the page must not. Two scrolling things
          inside each other on a phone walks the question box off the bottom of the screen --
          and that is the likeliest place for this whole redesign to go wrong, so it is said
          out loud here rather than left to be discovered. */}
      <Screen
        testID="note-screen"
        scrollRef={pageRef}
        scroll={tab !== 'Chat'}
        style={tab === 'Chat' ? { flex: 1 } : undefined}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Spacing.three }}>
          <Pressable
            accessibilityRole="button"
            testID="note-back"
            accessibilityLabel="Back to Home"
            onPress={() => router.replace('/')}
            style={{ minHeight: MinTouchTarget, minWidth: MinTouchTarget, justifyContent: 'center' }}>
            <Body color="link">‹ Home</Body>
          </Pressable>
          {/* The help follows the tab. The chat has its own entry -- what you can ask, what
              the little numbers are, how many questions a day -- and it used to be reached
              from a button inside the panel. The panel is gone, so the one "?" on the page
              answers the question you are actually looking at. */}
          <HelpButton helpId={tab === 'Chat' ? 'noteChat' : 'note'} />
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
            {/* The title is this page's one large thing. A note is a document, and a
                document opens with its name. */}
            <View style={{ gap: Spacing.three }}>
              <Heading level={1} display>
                {noteTitle(load.note)}
              </Heading>
              <StatusBadge status={load.note.status} />
            </View>

            <View style={{ gap: Spacing.two }}>
              {/* Two things on this line, not six. The tabs, and everything that is not
                  reading the note. Four pills and two tabs used to share it, and on a phone
                  that pushed the whole page sideways. */}
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Spacing.two, flexWrap: 'wrap' }}>
                <TabBar
                  testIDPrefix="note-tab"
                  tabs={TABS}
                  selected={tab}
                  onSelect={(next) => {
                    setTab(next);
                    setHighlightId(undefined);
                  }}
                />
                <Pill
                  testID="note-more"
                  label="More"
                  accessibilityLabel="More things to do with this note"
                  tone="quiet"
                  onPress={() => setMoreOpen(true)}
                />
              </View>
              {translateNote ? (
                <Body small color="textSecondary" accessibilityRole="alert">
                  {translateNote}
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
                translation={showingTranslation ? (tabTranslation?.content as SummaryTranslation) : undefined}
                translationLanguage={tabTranslation?.language}
                translationBar={translationBar}
              />
            ) : tab === 'Transcript' ? (
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
                translation={showingTranslation ? (tabTranslation?.content as TranscriptTranslation) : undefined}
                translationLanguage={tabTranslation?.language}
                translationBar={translationBar}
              />
            ) : !canAsk || !id ? (
              <GlassPanel>
                <Heading level={3}>Nothing to ask about yet</Heading>
                <Body color="textSecondary">{isText ? NO_WORDS_MESSAGE : NO_TRANSCRIPT_MESSAGE}</Body>
              </GlassPanel>
            ) : (
              <View
                style={{
                  flex: 1,
                  minHeight: 320,
                  borderWidth: 1,
                  borderColor: Colors.glassBorder,
                  borderRadius: Radius.panel,
                  overflow: 'hidden',
                }}>
                {/* Coming back to this tab reads the conversation from the database again,
                    which is where it lives -- so a refresh, a different device and a trip to
                    the Transcript and back all show the same thing. */}
                <ChatBody testID="note-chat" meetingId={id} active onJump={jumpTo} />
              </View>
            )}
          </>
        )}
      </Screen>

      {id ? (
        <RecapDialog
          meetingId={id}
          visible={recapOpen}
          onClose={() => setRecapOpen(false)}
          noteLanguage={summary?.language ?? 'en'}
          onOpenSettings={() => router.push('/recap-emails')}
        />
      ) : null}

      <ActionMenu
        visible={moreOpen}
        onClose={() => setMoreOpen(false)}
        title="More"
        testIDPrefix="note-more"
        items={moreItems}
      />

      <LanguagePicker
        title="Your language"
        hint="Gyan writes your summaries, your to-dos and its chat answers in this language."
        selected={languageCode}
        visible={picker === 'mine'}
        onPick={pickMyLanguage}
        onClose={() => setPicker(undefined)}
        helpId="translation"
      />
      <LanguagePicker
        title={`Translate this ${tab.toLowerCase()}`}
        hint="Pick a language. Gyan keeps the names, numbers and times exactly as they are."
        selected={tabTranslation?.language ?? ''}
        visible={picker === 'translate'}
        onPick={pickTranslation}
        onClose={() => setPicker(undefined)}
        busyCode={translateBusy}
        helpId="translation"
      />
    </View>
  );
}

/**
 * One of the small round-ended buttons next to the tabs.
 *
 * `tone` is information, not decoration. Translate and Ask DO something to the note, so they are
 * outlined in brand blue. Language only shows what you are set to and lets you change it, so it is
 * quiet: three identical buttons would say these are three of the same thing, and they are not.
 */
function Pill({
  label,
  accessibilityLabel,
  onPress,
  enabled = true,
  tone = 'action',
  testID,
}: {
  label: string;
  accessibilityLabel: string;
  onPress: () => void;
  enabled?: boolean;
  tone?: 'action' | 'quiet';
  testID?: string;
}) {
  const quiet = tone === 'quiet';
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled: !enabled }}
      disabled={!enabled}
      onPress={onPress}
      style={{
        minHeight: MinTouchTarget,
        justifyContent: 'center',
        paddingHorizontal: Spacing.three,
        borderRadius: Radius.pill,
        borderWidth: 1,
        borderColor: !enabled || quiet ? Colors.glassBorder : Colors.brand,
        backgroundColor: quiet ? 'transparent' : Colors.glass,
        opacity: enabled ? 1 : 0.5,
      }}>
      <Body color={quiet ? 'textSecondary' : 'link'} weight={quiet ? 'regular' : 'semibold'}>
        {label}
      </Body>
    </Pressable>
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
  translation,
  translationLanguage,
  translationBar,
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
  /** The translated lines, when a translation is on screen instead of the spoken words. */
  translation?: TranscriptTranslation;
  translationLanguage?: string;
  /** Goes above the lines: the "Translated by AI" label and the Show original button. */
  translationBar?: React.ReactNode;
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

  // A translated line keeps its own speaker and its own time. Only the words change, and they
  // line up by position: the first translated line belongs to the first spoken line.
  const language = translation ? (translationLanguage ?? 'en') : 'en';
  const wordsFor = (index: number, original: string) => translation?.lines[index] ?? original;

  return (
    <View style={{ gap: Spacing.three }}>
      {translationBar}
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
      <View>
        {passages.map((p, i) => (
          <TranscriptLine
            key={p.id}
            id={p.id}
            speaker={`Paragraph ${i + 1}`}
            lit={p.id === highlightId}
            last={i === passages.length - 1}
            onLineLayout={onLineLayout}
            language={language}
            words={wordsFor(i, p.text)}
            spoken={`Paragraph ${i + 1}. ${wordsFor(i, p.text)}`}
          />
        ))}
        {lines.map((l, i) => (
          <TranscriptLine
            key={l.id}
            id={l.id}
            speaker={l.speaker_label ?? 'Speaker'}
            time={formatTime(l.start_ms)}
            lit={l.id === highlightId}
            last={i === lines.length - 1}
            onLineLayout={onLineLayout}
            language={language}
            words={wordsFor(i, l.text)}
            spoken={`${l.speaker_label ?? 'Speaker'}, ${formatTime(l.start_ms)}. ${wordsFor(i, l.text)}`}
          />
        ))}
      </View>
    </View>
  );
}

/**
 * One line of a transcript: who spoke, when, and what they said.
 *
 * Every line used to be its own glass card, so a three minute conversation was forty
 * identical boxes. A transcript is a script, so it is set like one now: a hairline between
 * lines, and the speaker's name small, spaced and in capitals above the words. That last
 * detail is in `docs/design/sleek/brief.txt` and had never been built.
 *
 * THE CAPITALS ARE `textTransform`, never a changed string. `getByText('Speaker 1')` and the
 * line a screen reader reads out both get the real words.
 */
function TranscriptLine({
  id,
  speaker,
  time,
  words,
  spoken,
  language,
  lit,
  last,
  onLineLayout,
}: {
  id: string;
  speaker: string;
  time?: string;
  words: string;
  /** What a screen reader reads, in the order somebody would say it. */
  spoken: string;
  language: string;
  lit: boolean;
  last: boolean;
  onLineLayout?: (lineId: string, y: number) => void;
}) {
  return (
    <View
      onLayout={(e) => onLineLayout?.(id, e.nativeEvent.layout.y)}
      accessibilityLabel={`${spoken}${lit ? '. Highlighted' : ''}`}
      style={{
        flexDirection: 'row',
        overflow: 'hidden',
        borderRadius: lit ? Radius.panel : 0,
        backgroundColor: lit ? Colors.backgroundSelected : 'transparent',
        marginVertical: lit ? Spacing.two : 0,
        ...(lit || last ? {} : { borderBottomWidth: 1, borderBottomColor: Colors.glassBorder }),
      }}>
      {/* The blue edge marks the line a passage number pointed at, and nothing else does. */}
      <View style={{ width: 3, backgroundColor: lit ? Colors.brand : 'transparent' }} />
      <View style={{ flex: 1, gap: Spacing.one, paddingVertical: Spacing.three, paddingLeft: Spacing.two }}>
        <View style={{ flexDirection: 'row', gap: Spacing.three, alignItems: 'baseline' }}>
          <Body
            small
            color="textSecondary"
            weight="medium"
            style={{ letterSpacing: 1, textTransform: 'uppercase' }}>
            {speaker}
          </Body>
          {time ? (
            <Body small color="textSecondary">
              {time}
            </Body>
          ) : null}
        </View>
        <ScriptText language={language}>{words}</ScriptText>
      </View>
    </View>
  );
}
