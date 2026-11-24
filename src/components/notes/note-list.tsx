import { View } from 'react-native';

import { NoteRow, ROW_GUTTER } from '@/components/notes/note-row';
import { Button } from '@/components/ui/button';
import { Heading } from '@/components/ui/heading';
import { Spacing } from '@/constants/theme';
import { dayBucket } from '@/lib/dates';
import type { NoteHit } from '@/lib/notes-search';

type Entry = { kind: 'heading'; label: string } | { kind: 'note'; note: NoteHit };

/**
 * Puts day headings in among the notes.
 *
 * The headings are worked out over EVERY note loaded so far, not page by page, so a day that
 * runs across two pages still gets one heading. When somebody has searched there are no
 * headings at all: the list is in best-match order, and a date heading over a list that is not
 * in date order would be a lie.
 */
export function groupByDay(notes: NoteHit[], searching: boolean, now = new Date()): Entry[] {
  if (searching) return notes.map((note) => ({ kind: 'note', note }));

  const out: Entry[] = [];
  let last = '';
  for (const note of notes) {
    const bucket = dayBucket(note.created_at, now);
    if (bucket !== last) {
      out.push({ kind: 'heading', label: bucket });
      last = bucket;
    }
    out.push({ kind: 'note', note });
  }
  return out;
}

type NoteListProps = {
  notes: NoteHit[];
  /** Somebody has typed words, so there are no day headings and the order is best-match. */
  searching: boolean;
  selecting: boolean;
  picked: string[];
  onToggle: (id: string) => void;
  /** There are more notes than are on screen. */
  more: boolean;
  loadingMore: boolean;
  onShowMore: () => void;
};

/**
 * The notes, in days, with a hairline between them.
 *
 * This used to be thirty glass cards with sixteen points of air between each one, which is
 * three screens of scrolling to see ten notes and no sense of a list at all. The rows now sit
 * directly on the navy and a one-pixel line separates them, so a day of notes reads as a day
 * of notes. The gap is spent where it says something instead: above each day's name.
 */
export function NoteList({
  notes,
  searching,
  selecting,
  picked,
  onToggle,
  more,
  loadingMore,
  onShowMore,
}: NoteListProps) {
  const entries = groupByDay(notes, searching);

  return (
    <View>
      {entries.map((entry, i) => {
        if (entry.kind === 'heading') {
          return (
            <View
              key={`h-${entry.label}`}
              style={{
                paddingTop: i === 0 ? 0 : Spacing.four,
                paddingBottom: Spacing.two,
                paddingLeft: ROW_GUTTER,
              }}>
              {/* A day is set in the heading face, not in small grey body text, so it reads as
                  a divider in the list rather than as another line of note detail. */}
              <Heading level={3}>{entry.label}</Heading>
            </View>
          );
        }

        // No line under the last note of a day: the air above the next day's name already
        // says the group has ended, and a line there as well would say it twice.
        const next = entries[i + 1];
        return (
          <NoteRow
            key={entry.note.id}
            note={entry.note}
            divider={!!next && next.kind === 'note'}
            selectable={selecting}
            selected={picked.includes(entry.note.id)}
            cannotSelect={!entry.note.canDelete}
            onToggle={() => onToggle(entry.note.id)}
            snippet={entry.note.snippet}
            matchedIn={entry.note.matchedIn}
            hasOpenActions={entry.note.hasOpenActions}
            snippetStartMs={entry.note.snippetStartMs}
            snippetSegmentId={entry.note.snippetSegmentId}
          />
        );
      })}

      {more ? (
        <View style={{ paddingTop: Spacing.four }}>
          <Button
            label={loadingMore ? 'Loading' : 'Show more'}
            variant="secondary"
            loading={loadingMore}
            onPress={onShowMore}
          />
        </View>
      ) : null}
    </View>
  );
}
