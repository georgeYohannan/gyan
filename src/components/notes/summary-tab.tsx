import { useEffect, useRef, useState } from 'react';
import { View } from 'react-native';

import { Body } from '@/components/ui/body';
import { Button } from '@/components/ui/button';
import { GlassPanel } from '@/components/ui/glass-panel';
import { Heading } from '@/components/ui/heading';
import { ActionItemRow } from '@/components/notes/action-item-row';
import { ScriptText } from '@/components/ui/script-text';
import { Section } from '@/components/ui/section';
import { DEFAULT_LANGUAGE } from '@/constants/languages';
import { Colors, Radius, Spacing } from '@/constants/theme';
import { copyText } from '@/lib/clipboard';
import { noteTitle } from '@/lib/notes';
import { summaryToPlainText, type ActionItem, type Summary } from '@/lib/summaries';
import type { NoteDetail } from '@/lib/transcripts';
import type { SummaryTranslation } from '@/lib/translations';

/** How long a summary may run before the page offers to start it again. */
export const STUCK_AFTER_MS = 45_000;

type SummaryTabProps = {
  note: NoteDetail;
  summary?: Summary;
  items: ActionItem[];
  /** Ticks an item on or off. */
  onToggleItem: (item: ActionItem) => void;
  /** The item whose tick is being saved right now. */
  savingItemId?: string;
  /** True when a tick could not be saved. */
  itemError?: boolean;
  /** Asks for a summary (first one, retry, or a fresh one). */
  onStart: () => void;
  starting?: boolean;
  startError?: boolean;
  /** The translated words, when a translation is on screen instead of the original. */
  translation?: SummaryTranslation;
  /** The language the translated words are in, for example 'es'. */
  translationLanguage?: string;
  /** Goes above the summary: the "Translated by AI" label and the Show original button. */
  translationBar?: React.ReactNode;
};

/**
 * A short list of words under a heading. Nothing is drawn when the list is empty.
 *
 * Key points, Decisions and Open questions used to be three glass cards, identical to each
 * other and to the overview above them and the to-dos below them -- five boxes with the same
 * border and the same corners, telling a reader nothing about which was which. They are
 * sections now: a name, a hairline, and the words.
 */
function Points({
  heading,
  items,
  language = DEFAULT_LANGUAGE,
}: {
  heading: string;
  items: string[];
  language?: string;
}) {
  if (items.length === 0) return null;
  return (
    <Section title={heading} style={{ gap: Spacing.two }}>
      <View style={{ gap: Spacing.two }}>
        {items.map((item, i) => (
          <View key={`${heading}-${i}`} style={{ flexDirection: 'row', gap: Spacing.two }}>
            <Body color="textSecondary">{'•'}</Body>
            <ScriptText language={language} style={{ flex: 1 }}>
              {item}
            </ScriptText>
          </View>
        ))}
      </View>
    </Section>
  );
}

/**
 * How much of a note's to-do list is done.
 *
 * The burnt orange from the brief, used as a fill and nowhere near a word. It is the one warm
 * thing on this screen, and it marks the one thing on the page that is still owed.
 */
function DoneMeter({ done, total }: { done: number; total: number }) {
  if (total === 0) return null;
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={{ height: 4, borderRadius: Radius.pill, backgroundColor: Colors.skeleton, overflow: 'hidden' }}>
      <View
        style={{
          height: 4,
          width: `${Math.round((done / total) * 100)}%`,
          backgroundColor: Colors.record,
          borderRadius: Radius.pill,
        }}
      />
    </View>
  );
}

/** The Summary tab: what happened, what matters, what was agreed, and what to do next. */
export function SummaryTab({
  note,
  summary,
  items,
  onToggleItem,
  savingItemId,
  itemError,
  onStart,
  starting,
  startError,
  translation,
  translationLanguage,
  translationBar,
}: SummaryTabProps) {
  const [confirming, setConfirming] = useState(false);
  const [copied, setCopied] = useState(false);
  const [copyFailed, setCopyFailed] = useState(false);
  const [waitedLong, setWaitedLong] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => () => clearTimeout(timer.current), []);

  // A summary normally takes well under a minute. If one is still going after this long, something
  // went wrong, so offer a way to start it again instead of leaving the person waiting forever.
  useEffect(() => {
    if (note.status !== 'Summarizing') {
      setWaitedLong(false);
      return;
    }
    const t = setTimeout(() => setWaitedLong(true), STUCK_AFTER_MS);
    return () => clearTimeout(t);
  }, [note.status]);

  async function copy() {
    if (!summary) return;
    setCopyFailed(false);
    try {
      // Copy exactly what is on screen: the translation when one is showing, else the original.
      const words: Summary = translation ? { ...summary, ...translation } : summary;
      const toDos = translation
        ? items.map((item, i) => ({
            ...item,
            text: translation.action_items[i]?.text ?? item.text,
            due_text: translation.action_items[i]?.due ?? item.due_text,
          }))
        : items;
      await copyText(summaryToPlainText(noteTitle(note), words, toDos));
      setCopied(true);
      clearTimeout(timer.current);
      timer.current = setTimeout(() => setCopied(false), 2500);
    } catch {
      setCopyFailed(true);
    }
  }

  if (note.status === 'Failed') {
    return (
      <GlassPanel style={{ borderColor: Colors.dangerBorder }}>
        <Heading level={3}>This note did not work</Heading>
        <Body color="danger" accessibilityRole="alert">
          {note.error_message ?? 'Something went wrong while writing the summary.'}
        </Body>
        <Body small color="textSecondary">
          This note did not use up one of your meetings. Your transcript is still here, on the
          Transcript tab.
        </Body>
        {startError ? (
          <Body small color="danger" accessibilityRole="alert">
            We could not start it again. Check your internet and try again.
          </Body>
        ) : null}
        <Button label="Retry summary" variant="secondary" loading={starting} onPress={onStart} />
      </GlassPanel>
    );
  }

  if (note.status !== 'Ready') {
    const text =
      note.status === 'Uploading'
        ? 'Your file is still on its way.'
        : note.status === 'Queued'
          ? 'Your note is waiting for its turn.'
          : note.status === 'Transcribing'
            ? 'Gyan is turning the talking into text first.'
            : 'Gyan is reading your note and writing the summary. This usually takes less than a minute.';
    const stuck = note.status === 'Summarizing' && waitedLong;
    return (
      <GlassPanel accessibilityLabel={`Summary is not ready. Status: ${note.status}`}>
        <Heading level={3}>No summary yet</Heading>
        <Body color="textSecondary">{text} This page updates by itself.</Body>
        {stuck ? (
          <Body small color="textSecondary">
            This is taking longer than usual. You can start it again.
          </Body>
        ) : null}
        {note.status === 'Queued' || stuck ? (
          <>
            {startError ? (
              <Body small color="danger" accessibilityRole="alert">
                We could not start it. Check your internet and try again.
              </Body>
            ) : null}
            <Button
              label={stuck ? 'Start summary again' : 'Write summary'}
              variant="secondary"
              loading={starting}
              onPress={onStart}
            />
          </>
        ) : null}
      </GlassPanel>
    );
  }

  if (!summary) {
    return (
      <GlassPanel>
        <Heading level={3}>No summary yet</Heading>
        <Body color="textSecondary">
          This note is ready, but no summary was written for it. Tap Write summary and Gyan will read
          the note and make one.
        </Body>
        {startError ? (
          <Body small color="danger" accessibilityRole="alert">
            We could not start it. Check your internet and try again.
          </Body>
        ) : null}
        <Button label="Write summary" variant="secondary" loading={starting} onPress={onStart} />
      </GlassPanel>
    );
  }

  const done = items.filter((i) => i.done).length;

  // When a translation is on screen, every word shown comes from it. The speaker names, the times
  // and the tick boxes stay exactly as they were, because those are not words to translate.
  // The lists line up by position: the first translated key point belongs to the first original.
  const shown = translation ?? summary;
  const language = translation ? (translationLanguage ?? DEFAULT_LANGUAGE) : DEFAULT_LANGUAGE;
  const overview = translation ? translation.overview : summary.overview;

  return (
    <View style={{ gap: Spacing.four }}>
      {translationBar}

      {/* The whole note in one breath, set large. It is the one paragraph anybody reads
          every time, so it is the first thing and the biggest thing. */}
      {overview ? (
        <ScriptText language={language} lead accessibilityLabel={`Overview. ${overview}`}>
          {overview}
        </ScriptText>
      ) : null}

      <Points heading="Key points" items={shown.key_points} language={language} />
      <Points heading="Decisions" items={shown.decisions} language={language} />
      <Points heading="Open questions" items={shown.open_questions} language={language} />

      <Section
        title="Action items"
        style={{ gap: Spacing.two }}
        right={
          items.length > 0 ? (
            <Body small color="textSecondary">
              {done} of {items.length} done
            </Body>
          ) : null
        }>
        <DoneMeter done={done} total={items.length} />
        {items.length === 0 ? (
          <Body color="textSecondary">Nobody agreed to do anything in this note.</Body>
        ) : (
          <View>
            {items.map((item, i) => {
              // The to-dos came back in the same order they went out, so the i-th translated line
              // belongs to the i-th to-do. Only its words change; its tick box is the same one.
              const translated = translation?.action_items[i];
              return (
                <ActionItemRow
                  key={item.id}
                  item={
                    translated ? { ...item, text: translated.text, due_text: translated.due } : item
                  }
                  onToggle={() => onToggleItem(item)}
                  saving={savingItemId === item.id}
                  language={language}
                />
              );
            })}
          </View>
        )}
        {itemError ? (
          <Body small color="danger" accessibilityRole="alert">
            We could not save that tick. Check your internet and try again.
          </Body>
        ) : null}
      </Section>

      <View style={{ flexDirection: 'row', gap: Spacing.two, flexWrap: 'wrap', alignItems: 'center' }}>
        <Button label="Copy" variant="secondary" onPress={copy} />
        <Button label="Regenerate" variant="secondary" onPress={() => setConfirming(true)} />
        {copied ? (
          <Body small color="success" accessibilityRole="alert">
            Copied
          </Body>
        ) : null}
        {copyFailed ? (
          <Body small color="danger" accessibilityRole="alert">
            We could not copy it. Select the words and copy them yourself.
          </Body>
        ) : null}
      </View>

      {confirming ? (
        <GlassPanel accessibilityLabel="Write a new summary?">
          <Heading level={3}>Write a new summary?</Heading>
          <Body color="textSecondary">
            This asks the AI again, so it costs money. The summary and action items you have now will
            be replaced, and any ticks will be cleared. Your transcript is not touched.
          </Body>
          <View style={{ flexDirection: 'row', gap: Spacing.two, flexWrap: 'wrap' }}>
            <Button
              label="Yes, write a new one"
              variant="secondary"
              loading={starting}
              onPress={() => {
                setConfirming(false);
                onStart();
              }}
            />
            <Button label="Cancel" variant="secondary" onPress={() => setConfirming(false)} />
          </View>
        </GlassPanel>
      ) : null}

      {startError ? (
        <Body small color="danger" accessibilityRole="alert">
          We could not start a new summary. Check your internet and try again.
        </Body>
      ) : null}
    </View>
  );
}
