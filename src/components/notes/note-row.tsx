import { useRouter } from 'expo-router';
import { Pressable, View } from 'react-native';

import { HighlightedText } from '@/components/ui/highlighted-text';
import { Body } from '@/components/ui/body';
import { GlassPanel } from '@/components/ui/glass-panel';
import { StatusBadge } from '@/components/ui/status-badge';
import { TickBox } from '@/components/ui/tick-box';
import { Colors, MinTouchTarget, Spacing } from '@/constants/theme';
import { formatMoment, formatNoteDate } from '@/lib/dates';
import { noteTitle, SOURCE_LABEL, type NoteRow as Note } from '@/lib/notes';
import { foundInSentence, plainSnippet, type MatchedIn } from '@/lib/notes-search';

export type NoteRowExtras = {
  /** Select mode is on, so the row ticks instead of opening. */
  selectable?: boolean;
  selected?: boolean;
  onToggle?: () => void;
  /** Set when this note is not yours to delete, so it cannot be ticked. */
  cannotSelect?: boolean;
  /** A few words around a search match, with the matched words marked. */
  snippet?: string;
  matchedIn?: MatchedIn[];
  hasOpenActions?: boolean;
  /** The moment in the recording the snippet came from, shown next to the snippet. */
  snippetStartMs?: number;
  /** The transcript line the snippet came from, so the note opens at that moment. */
  snippetSegmentId?: string;
};

/**
 * One note in the Home list: its title, when it happened, what state it is in, and -- when
 * somebody has searched -- the words that matched and where they were found.
 *
 * The date and the source used to be one line joined by a middle dot. They are two things, so
 * they are now in two places: when it happened sits under the title, and where it came from sits
 * with the status, because "what state is it in" and "where did it come from" are the same kind
 * of fact about a note.
 */
export function NoteRow({ note, ...extras }: { note: Note } & NoteRowExtras) {
  const {
    selectable,
    selected,
    onToggle,
    cannotSelect,
    snippet,
    matchedIn = [],
    hasOpenActions,
    snippetStartMs,
    snippetSegmentId,
  } = extras;
  const router = useRouter();
  const date = formatNoteDate(note.created_at);
  const found = foundInSentence(matchedIn);

  const open = () => {
    router.push({
      pathname: '/note/[id]',
      // A snippet from the transcript knows which LINE it came from, so the note can open at
      // that moment rather than at the top. It is the same path the chat's citations use.
      params: snippetSegmentId ? { id: note.id, line: snippetSegmentId } : { id: note.id },
    });
  };

  // What a screen reader hears, in the order somebody would say it.
  const spoken = [
    noteTitle(note),
    date,
    SOURCE_LABEL[note.source],
    note.status,
    hasOpenActions ? 'still has something to do' : '',
    found,
    plainSnippet(snippet),
    cannotSelect ? 'you cannot delete this note, somebody else made it' : '',
  ]
    .filter(Boolean)
    .join(', ');

  return (
    <Pressable
      accessibilityRole={selectable ? 'checkbox' : 'link'}
      accessibilityState={selectable ? { checked: !!selected, disabled: !!cannotSelect } : undefined}
      accessibilityLabel={spoken}
      disabled={selectable && cannotSelect}
      onPress={selectable ? onToggle : open}>
      <GlassPanel
        strong={selectable && selected}
        style={{
          borderColor: selectable && selected ? Colors.brand : Colors.glassBorder,
          opacity: selectable && cannotSelect ? 0.55 : 1,
        }}>
        <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.three }}>
          {selectable ? (
            <View style={{ minHeight: MinTouchTarget, justifyContent: 'center' }}>
              <TickBox checked={!!selected} />
            </View>
          ) : null}

          <View style={{ flex: 1, gap: Spacing.one }}>
            <Body style={{ fontWeight: '600' }} numberOfLines={2}>
              {noteTitle(note)}
            </Body>
            <Body small color="textSecondary">
              {date}
            </Body>
          </View>

          <View style={{ alignItems: 'flex-end', gap: Spacing.one }}>
            <StatusBadge status={note.status} />
            <Body small color="textSecondary">
              {SOURCE_LABEL[note.source]}
            </Body>
          </View>
        </View>

        {snippet ? (
          <View style={{ gap: Spacing.half }}>
            <HighlightedText snippet={snippet} small numberOfLines={3} />
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: Spacing.two }}>
              {found ? (
                <Body small color="textSecondary">
                  {found}
                </Body>
              ) : null}
              {snippetStartMs !== undefined ? (
                <Body small color="link">
                  {formatMoment(snippetStartMs)}
                </Body>
              ) : null}
            </View>
          </View>
        ) : found ? (
          <Body small color="textSecondary">
            {found}
          </Body>
        ) : null}

        {hasOpenActions ? (
          <Body small color="textSecondary">
            Still has something to do
          </Body>
        ) : null}

        {cannotSelect ? (
          <Body small color="textSecondary">
            Somebody else made this note, so you cannot delete it.
          </Body>
        ) : null}

        {note.status === 'Failed' && note.error_message ? (
          <Body small color="danger">
            {note.error_message}
          </Body>
        ) : null}
      </GlassPanel>
    </Pressable>
  );
}
