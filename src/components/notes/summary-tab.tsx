import { useEffect, useRef, useState } from 'react';
import { View } from 'react-native';

import { Body } from '@/components/ui/body';
import { Button } from '@/components/ui/button';
import { GlassPanel } from '@/components/ui/glass-panel';
import { Heading } from '@/components/ui/heading';
import { ActionItemRow } from '@/components/notes/action-item-row';
import { Colors, Spacing } from '@/constants/theme';
import { copyText } from '@/lib/clipboard';
import { noteTitle } from '@/lib/notes';
import { summaryToPlainText, type ActionItem, type Summary } from '@/lib/summaries';
import type { NoteDetail } from '@/lib/transcripts';

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
};

/** A short list of words under a heading. Nothing is drawn when the list is empty. */
function Points({ heading, items }: { heading: string; items: string[] }) {
  if (items.length === 0) return null;
  return (
    <GlassPanel>
      <Heading level={3}>{heading}</Heading>
      <View style={{ gap: Spacing.two }}>
        {items.map((item, i) => (
          <View key={`${heading}-${i}`} style={{ flexDirection: 'row', gap: Spacing.two }}>
            <Body color="textSecondary">{'•'}</Body>
            <Body style={{ flex: 1 }}>{item}</Body>
          </View>
        ))}
      </View>
    </GlassPanel>
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
}: SummaryTabProps) {
  const [confirming, setConfirming] = useState(false);
  const [copied, setCopied] = useState(false);
  const [copyFailed, setCopyFailed] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => () => clearTimeout(timer.current), []);

  async function copy() {
    if (!summary) return;
    setCopyFailed(false);
    try {
      await copyText(summaryToPlainText(noteTitle(note), summary, items));
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
    return (
      <GlassPanel accessibilityLabel={`Summary is not ready. Status: ${note.status}`}>
        <Heading level={3}>No summary yet</Heading>
        <Body color="textSecondary">{text} This page updates by itself.</Body>
        {note.status === 'Queued' ? (
          <>
            {startError ? (
              <Body small color="danger" accessibilityRole="alert">
                We could not start it. Check your internet and try again.
              </Body>
            ) : null}
            <Button label="Write summary" variant="secondary" loading={starting} onPress={onStart} />
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

  return (
    <View style={{ gap: Spacing.three }}>
      {summary.overview ? (
        <GlassPanel strong accessibilityLabel={`Overview. ${summary.overview}`}>
          <Body>{summary.overview}</Body>
        </GlassPanel>
      ) : null}

      <Points heading="Key points" items={summary.key_points} />
      <Points heading="Decisions" items={summary.decisions} />
      <Points heading="Open questions" items={summary.open_questions} />

      <GlassPanel>
        <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: Spacing.three, flexWrap: 'wrap' }}>
          <Heading level={3}>Action items</Heading>
          {items.length > 0 ? (
            <Body small color="textSecondary">
              {done} of {items.length} done
            </Body>
          ) : null}
        </View>
        {items.length === 0 ? (
          <Body color="textSecondary">Nobody agreed to do anything in this note.</Body>
        ) : (
          <View>
            {items.map((item) => (
              <ActionItemRow key={item.id} item={item} onToggle={onToggleItem} saving={savingItemId === item.id} />
            ))}
          </View>
        )}
        {itemError ? (
          <Body small color="danger" accessibilityRole="alert">
            We could not save that tick. Check your internet and try again.
          </Body>
        ) : null}
      </GlassPanel>

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
