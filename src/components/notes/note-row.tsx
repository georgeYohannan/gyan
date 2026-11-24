import { useRouter } from 'expo-router';
import { Pressable, View } from 'react-native';
import ReanimatedSwipeable from 'react-native-gesture-handler/ReanimatedSwipeable';

import { Body } from '@/components/ui/body';
import { HighlightedText } from '@/components/ui/highlighted-text';
import { StatusBadge } from '@/components/ui/status-badge';
import { TickBox } from '@/components/ui/tick-box';
import { Colors, MinTouchTarget, Radius, Spacing } from '@/constants/theme';
import { formatMoment, formatNoteDate } from '@/lib/dates';
import { noteTitle, SOURCE_LABEL, type NoteRow as Note } from '@/lib/notes';
import { foundInSentence, plainSnippet, type MatchedIn } from '@/lib/notes-search';

/** The statuses that mean Gyan is still working on this note. */
const WORKING = ['Uploading', 'Queued', 'Transcribing', 'Summarizing'];

/** How wide the colored edge down the left of a row is. */
const EDGE = 3;

/**
 * How far a row's words sit from the left of the list.
 *
 * The edge lives in this gutter, so a note with nothing to say has an empty one and every
 * title in the list still starts in the same place. `note-list.tsx` indents the day headings
 * by the same amount, so all the words on the screen line up and only the colours stick out.
 */
export const ROW_GUTTER = EDGE + Spacing.two;

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
  /** Draw the hairline that separates this row from the next. Off on the last one. */
  divider?: boolean;
  /** Open the two things you can do to this note: share it, or delete it. */
  onMore?: () => void;
  /** Send a recap of this note by email. Only a finished note has anything to send. */
  onShare?: () => void;
  canShare?: boolean;
  canDelete?: boolean;
  /** Delete this note, after the box that names it. */
  onDelete?: () => void;
};

/**
 * One note in the list: its title, when it happened, what state it is in, and -- when
 * somebody has searched -- the words that matched and where they were found.
 *
 * Every note used to be a glass card, all thirty of them identical, so the one that needed
 * something from you looked exactly like the twenty-nine that did not. Now a row is a plain
 * row on navy, and a note only takes on weight when it has earned it:
 *
 * - something still to do  -> a burnt orange edge down the left
 * - still being worked on   -> a thin blue strip along the bottom
 * - it failed               -> a red tinted card with a red edge, which is the one case
 *                              where a note really is a thing that stands out of the list
 * - ticked in select mode    -> a raised card with a brand blue edge
 *
 * The date and the source are two facts, so they stay in two places: when it happened sits
 * under the title, and where it came from sits with the status.
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
    divider = true,
    onMore,
    onShare,
    canShare,
    canDelete,
    onDelete,
  } = extras;
  const router = useRouter();
  const date = formatNoteDate(note.created_at);
  const found = foundInSentence(matchedIn);

  const ticked = !!(selectable && selected);
  const failed = note.status === 'Failed';
  const working = WORKING.includes(note.status);

  // One colour down the left edge, and only one, so it always answers the same question:
  // what does this note want from me? Ticked beats failed beats a to-do, because while
  // select mode is on, what you have ticked is the only thing you are thinking about.
  const edge = ticked
    ? Colors.brand
    : failed
      ? Colors.danger
      : hasOpenActions
        ? Colors.record
        : 'transparent';

  // A raised row is a card: it has a fill, so it gets corners and sits apart from the list.
  // A plain row has neither, and a hairline under it does the separating instead.
  const raised = ticked || failed;

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

  const title = noteTitle(note);

  // Swiping is a SHORTCUT, never the only way. A gesture is invisible to a keyboard, silent to
  // a screen reader and undiscoverable with a mouse, so every row also carries a button that
  // opens the same two things -- and that is the button every test drives.
  //
  // A note somebody else made still gets the button: it cannot be deleted, but it can be
  // shared, and the menu is where it says why the other one is off.
  const canAct = !!onMore && !selectable;

  const row = (
    <View style={{ flexDirection: 'row', alignItems: 'stretch' }}>
      <Pressable
        // Built from the note's own id, so a test can count rows and press one by name
        // however the row is drawn. Counting by the title broke the moment a redesign
        // repeated the title anywhere else in the row.
        testID={`home-note-row-${note.id}`}
        accessibilityRole={selectable ? 'checkbox' : 'link'}
        accessibilityState={selectable ? { checked: !!selected, disabled: !!cannotSelect } : undefined}
        accessibilityLabel={spoken}
        disabled={selectable && cannotSelect}
        onPress={selectable ? onToggle : open}
        style={{ flex: 1 }}>
        <View
          style={{
            flexDirection: 'row',
            overflow: 'hidden',
            opacity: selectable && cannotSelect ? 0.55 : 1,
            borderRadius: raised ? Radius.panel : 0,
            backgroundColor: ticked ? Colors.backgroundSelected : failed ? Colors.dangerFill : 'transparent',
            marginVertical: raised ? Spacing.two : 0,
            // A failed note is bordered all the way round, because it IS a card. A plain row
            // gets one hairline underneath instead, and the last row in the list gets none.
            ...(failed
              ? { borderWidth: 1, borderColor: Colors.dangerBorder }
              : ticked
                ? {}
                : divider
                  ? { borderBottomWidth: 1, borderBottomColor: Colors.glassBorder }
                  : {}),
          }}>
          <View style={{ width: EDGE, backgroundColor: edge }} />

          <View
            style={{
              flex: 1,
              gap: Spacing.two,
              paddingVertical: Spacing.three,
              paddingLeft: Spacing.two,
              paddingRight: raised ? Spacing.three : 0,
            }}>
            <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.three }}>
              {selectable ? (
                <View style={{ minHeight: MinTouchTarget, justifyContent: 'center' }}>
                  <TickBox checked={!!selected} />
                </View>
              ) : null}

              <View style={{ flex: 1, gap: Spacing.one }}>
                <Body weight="semibold" numberOfLines={2}>
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

            {working ? <WorkingStrip /> : null}
          </View>
        </View>
      </Pressable>

      {canAct ? (
        <Pressable
          testID={`home-note-more-${note.id}`}
          accessibilityRole="button"
          accessibilityLabel={`More for ${title}`}
          onPress={onMore}
          style={({ pressed }) => ({
            width: MinTouchTarget,
            minHeight: MinTouchTarget,
            alignItems: 'center',
            justifyContent: 'center',
            borderRadius: Radius.pill,
            backgroundColor: pressed ? Colors.backgroundSelected : 'transparent',
          })}>
          <Body color="textSecondary" accessibilityElementsHidden>
            {'⋯'}
          </Body>
        </Pressable>
      ) : null}
    </View>
  );

  if (!canAct) return row;

  return (
    <ReanimatedSwipeable
      friction={2}
      rightThreshold={40}
      overshootRight={false}
      /*
       * The row has to be OPAQUE, or you see straight through it to the buttons behind.
       *
       * Gesture handler draws the actions underneath and slides the row off them. Every row
       * in this redesign sits directly on the navy with no fill of its own, so with nothing
       * here "Share" and "Delete" showed through every closed row, printed over the dates.
       * Found by screenshot; no test would have noticed, because every word was present and
       * pressable exactly as expected.
       */
      childrenContainerStyle={{ backgroundColor: Colors.background }}
      renderRightActions={() => (
        /*
         * HIDDEN FROM SCREEN READERS, AND THAT IS THE POINT.
         *
         * Gesture handler keeps these in the page whether the row is open or shut, so without
         * this a screen reader found two "Delete Weekly team call" buttons per row -- sixty
         * phantom buttons on a list of thirty notes, half of them off the side of the screen.
         * That is worse than having no swipe at all.
         *
         * Nobody loses anything: swiping is a touch shortcut, and the "..." button beside it
         * opens the same two actions with real names, real focus and real announcements.
         */
        <View
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          aria-hidden
          style={{ flexDirection: 'row', alignItems: 'center' }}>
          <SwipeAction
            testID={`home-note-share-${note.id}`}
            word="Share"
            enabled={!!canShare}
            onPress={onShare}
          />
          <SwipeAction
            testID={`home-note-delete-${note.id}`}
            word="Delete"
            danger
            enabled={!!canDelete}
            onPress={onDelete}
          />
        </View>
      )}>
      {row}
    </ReanimatedSwipeable>
  );
}

/**
 * One of the two buttons a swipe reveals.
 *
 * They are the same two the "..." button opens, deliberately: a swipe must never be able to
 * do something no other way can, or the app has a feature only some people can reach. They
 * carry no role and no label, and cannot be reached by keyboard, because the named, focusable
 * copies live in the menu -- see the note above `renderRightActions`.
 */
function SwipeAction({
  testID,
  word,
  danger,
  enabled,
  onPress,
}: {
  testID: string;
  word: string;
  danger?: boolean;
  enabled: boolean;
  onPress?: () => void;
}) {
  return (
    <Pressable
      testID={testID}
      focusable={false}
      tabIndex={-1}
      disabled={!enabled}
      onPress={onPress}
      style={({ pressed }) => ({
        minWidth: 88,
        minHeight: MinTouchTarget,
        alignSelf: 'stretch',
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: Spacing.three,
        opacity: enabled ? 1 : 0.5,
        backgroundColor: pressed
          ? Colors.backgroundSelected
          : danger
            ? Colors.dangerFill
            : Colors.glass,
      })}>
      <Body small weight="semibold" color={danger ? 'danger' : 'link'}>
        {word}
      </Body>
    </Pressable>
  );
}

/**
 * The thin blue strip that says Gyan is still working on this note.
 *
 * It does not move, on purpose. The badge beside the title already says the word
 * ("Transcribing"), so the strip is there to be seen out of the corner of an eye while you
 * read the rest of the list -- and a bar that slides back and forth on every unfinished note
 * would make a list of five of them impossible to read past. It is hidden from screen
 * readers, because the badge has already said it in words.
 */
function WorkingStrip() {
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={{ height: 2, borderRadius: Radius.pill, backgroundColor: Colors.skeleton, overflow: 'hidden' }}>
      <View style={{ height: 2, width: '40%', backgroundColor: Colors.brand }} />
    </View>
  );
}
