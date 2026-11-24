import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, useWindowDimensions, View } from 'react-native';

import { FilterSheet } from '@/components/notes/filter-sheet';
import { NoteList } from '@/components/notes/note-list';
import { SearchField } from '@/components/notes/search-field';
import { UsageLine } from '@/components/notes/usage-line';
import { ActionMenu, type ActionItem } from '@/components/ui/action-menu';
import { Body } from '@/components/ui/body';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { GlassPanel } from '@/components/ui/glass-panel';
import { Heading } from '@/components/ui/heading';
import { PageHeader } from '@/components/ui/page-header';
import { Screen } from '@/components/ui/screen';
import { Skeleton } from '@/components/ui/skeleton';
import { Colors, MinTouchTarget, Radius, Spacing, WideBreakpoint } from '@/constants/theme';
import { MESSAGES } from '@/lib/account';
import { describeRange, PRESET_LABEL } from '@/lib/dates';
import { getUsage, noteTitle, refreshNoteStatuses, SOURCE_LABEL, type Usage } from '@/lib/notes';
import {
  deleteNotes,
  EMPTY_VIEW,
  filterCount,
  filtersFor,
  findNotes,
  FIRST_PAGE,
  isEmptyView,
  NEXT_PAGE,
  viewFromParams,
  viewToParams,
  VIEW_KEYS,
  type NoteHit,
  type ViewState,
} from '@/lib/notes-search';

/**
 * Still exported from here, although the code moved to `notes/note-list.tsx`.
 *
 * `__tests__/home-screen-test.tsx` reaches for it on this path with `jest.requireActual`, and
 * a test that proves which day a note lands under should not have to care which file does the
 * sorting.
 */
export { groupByDay } from '@/components/notes/note-list';

const BUSY = ['Uploading', 'Queued', 'Transcribing', 'Summarizing'];
const POLL_MS = 3000;
/** How long typing has to stop before Gyan searches. */
const SETTLE_MS = 300;

type Load =
  | { state: 'loading' }
  | { state: 'error' }
  | { state: 'ready'; notes: NoteHit[]; total: number };

/**
 * Home: your notes, newest first, with a way to find one.
 *
 * It asks for ten notes, then twenty at a time, and never more than thirty in one go. Everything
 * that narrows the list -- the words searched for, the dates, the statuses -- lives in the web
 * address, so a refresh brings back the same view and a link can be kept.
 *
 * THE ORDER ON THIS PAGE CHANGED, and that was the point of the redesign. It used to open with
 * a heading that said "Home", then a panel saying "Meetings used this month: 0 of 5", and only
 * then a person's own notes -- the least interesting thing on the screen in the most prominent
 * place. Now the page is called what it holds, the one blue glowing thing is the one thing to
 * do, and the meetings count has shrunk to a line that appears only when the month is nearly
 * spent. The notes themselves carry the weight (see `notes/note-row.tsx`).
 */
export default function HomeScreen() {
  const router = useRouter();
  // A full width button is right under a thumb and wrong under a mouse: at 1280 it would be a
  // 768 pixel glowing bar. Same breakpoint as the navigation and the panels.
  const wide = useWindowDimensions().width >= WideBreakpoint;
  const params = useLocalSearchParams<Record<string, string | string[]>>();

  // The view is held here and written to the address, rather than read back from it on every
  // keystroke. Reading it once on opening is what makes a refresh work.
  const [view, setViewNow] = useState<ViewState>(() => viewFromParams(params));
  /** What is in the search box this instant. It becomes part of the view once typing stops. */
  const [typed, setTyped] = useState(view.query);

  // The wait belongs to TYPING, not to the view. Pressing Clear filters, or applying the filter
  // sheet, has to take effect at once -- an earlier version delayed those too, which left the
  // old search word in the address for a third of a second after it had been cleared.
  const waiting = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(waiting.current), []);

  const typeInto = (text: string) => {
    setTyped(text);
    clearTimeout(waiting.current);
    waiting.current = setTimeout(() => setViewNow((current) => ({ ...current, query: text })), SETTLE_MS);
  };

  const setView = (next: ViewState) => {
    clearTimeout(waiting.current);
    setTyped(next.query);
    setViewNow(next);
  };

  const [load, setLoad] = useState<Load>({ state: 'loading' });
  const [usage, setUsage] = useState<Usage>();
  const [loadingMore, setLoadingMore] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);

  const [selecting, setSelecting] = useState(false);
  const [picked, setPicked] = useState<string[]>([]);
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string>();
  const [deleteNews, setDeleteNews] = useState<string>();
  /** The note whose "..." menu is open, if any. One menu for the whole list, not one per row. */
  const [acting, setActing] = useState<NoteHit>();

  const filters = useMemo(() => filtersFor(view), [view]);
  const searching = view.query.trim() !== '';
  const narrowed = !isEmptyView(view);
  const onFilters = filterCount(filters);

  // Keep the address in step with the view. Keys that have gone are sent empty rather than left
  // behind, or a cleared filter would still be in the address after a refresh.
  const written = useRef(JSON.stringify(viewToParams(view)));
  useEffect(() => {
    const next = viewToParams(view);
    const key = JSON.stringify(next);
    if (key === written.current) return;
    written.current = key;
    const all: Record<string, string | undefined> = {};
    for (const name of VIEW_KEYS) all[name] = next[name];
    router.setParams(all as Record<string, string>);
  }, [view, router]);

  const load1 = useCallback(
    (quiet = false) => {
      if (!quiet) setLoad({ state: 'loading' });
      findNotes(filters, { limit: FIRST_PAGE })
        .then((page) => setLoad({ state: 'ready', notes: page.notes, total: page.total }))
        .catch(() => {
          // A failed background check keeps what is already on screen.
          if (!quiet) setLoad({ state: 'error' });
        });
    },
    [filters],
  );

  // One loader, for all three reasons to load: opening Home, changing what is being asked for,
  // and coming back from somewhere else. Coming back loads quietly, keeping the notes on screen
  // until the new answer arrives; a changed question shows the skeletons, because the answer
  // really is about to be different.
  const asked = JSON.stringify(filters);
  const lastAsked = useRef<string | undefined>(undefined);
  useFocusEffect(
    useCallback(() => {
      const changed = lastAsked.current !== asked;
      lastAsked.current = asked;
      load1(!changed);
    }, [asked, load1]),
  );

  // The usage box is its own thing: if only the count fails, the notes still show.
  useFocusEffect(
    useCallback(() => {
      getUsage()
        .then(setUsage)
        .catch(() => undefined);
    }, []),
  );

  const notes = load.state === 'ready' ? load.notes : [];
  const busyIds = notes.filter((n) => BUSY.includes(n.status)).map((n) => n.id);
  const busyKey = busyIds.join(',');

  // While a note is being worked on, ask about THOSE notes every few seconds. It used to ask for
  // the whole list again, which would now quietly throw away every page after the first.
  useEffect(() => {
    if (busyKey === '') return;
    const ids = busyKey.split(',');
    const timer = setInterval(() => {
      refreshNoteStatuses(ids)
        .then((fresh) => {
          if (fresh.length === 0) return;
          setLoad((current) => {
            if (current.state !== 'ready') return current;
            const byId = new Map(fresh.map((f) => [f.id, f]));
            return {
              ...current,
              notes: current.notes.map((note) => {
                const update = byId.get(note.id);
                return update ? { ...note, status: update.status, error_message: update.error_message } : note;
              }),
            };
          });
        })
        .catch(() => undefined);
    }, POLL_MS);
    return () => clearInterval(timer);
  }, [busyKey]);

  const showMore = () => {
    if (load.state !== 'ready' || loadingMore) return;
    setLoadingMore(true);
    const last = load.notes[load.notes.length - 1];
    findNotes(filters, {
      limit: NEXT_PAGE,
      // Best-match order does not move while the words stay put, so counting forward is safe.
      // Newest-first order does move, so it walks on from the last note already shown instead.
      ...(searching ? { offset: load.notes.length } : { after: last }),
    })
      .then((page) =>
        setLoad((current) =>
          current.state === 'ready'
            ? { ...current, total: page.total, notes: [...current.notes, ...page.notes] }
            : current,
        ),
      )
      .catch(() => undefined)
      .finally(() => setLoadingMore(false));
  };

  const apply = (next: ViewState) => {
    setFiltersOpen(false);
    // The sheet owns the filters; the box owns the words. Taking the words from the sheet would
    // undo anything typed after it was opened, because the sheet keeps the view as it was then.
    setView({ ...next, query: typed });
  };

  const clearAll = () => {
    setFiltersOpen(false);
    setView(EMPTY_VIEW);
  };

  const stopSelecting = () => {
    setSelecting(false);
    setPicked([]);
    setDeleteError(undefined);
  };

  const chosen = notes.filter((n) => picked.includes(n.id));

  /**
   * Delete one note from its row.
   *
   * It goes through the SAME box, the same wording and the same delete as Select mode, by
   * picking exactly one note and opening the dialog Home already has. Nothing here is new
   * copy, and nothing can drift: the line about not getting the meeting back this month is
   * written once.
   */
  const deleteOne = (note: NoteHit) => {
    setActing(undefined);
    setPicked([note.id]);
    setConfirming(true);
  };

  /**
   * Share one note.
   *
   * There is no per-note share link in Gyan, and inventing one here would be inventing a
   * feature. The nearest real thing is the recap email, so Share opens the Send recap dialog
   * on that note. docs/testing/prompt-13.md says this in plain words, because somebody
   * reading "Share" expects a link.
   */
  const shareOne = (note: NoteHit) => {
    setActing(undefined);
    router.push({ pathname: '/note/[id]', params: { id: note.id, recap: '1' } });
  };

  const actingTitle = acting ? noteTitle(acting) : '';
  const actionItems: ActionItem[] = acting
    ? [
        {
          testID: 'home-note-action-share',
          title: 'Send a recap by email',
          summary:
            acting.status === 'Ready'
              ? 'The summary and the to-dos, to people on this account.'
              : 'There is nothing to send until this note is finished.',
          accessibilityLabel: `Send a recap of ${actingTitle} by email`,
          enabled: acting.status === 'Ready',
          onPress: () => shareOne(acting),
        },
        {
          testID: 'home-note-action-delete',
          title: 'Delete this note',
          summary: acting.canDelete
            ? 'The transcript, summary, to-dos and chat go too.'
            : 'Somebody else made this note, so you cannot delete it.',
          accessibilityLabel: `Delete ${actingTitle}`,
          enabled: !!acting.canDelete,
          onPress: () => deleteOne(acting),
        },
      ]
    : [];

  const doDelete = () => {
    setDeleting(true);
    setDeleteError(undefined);
    deleteNotes(picked)
      .then((outcomes) => {
        const gone = outcomes.filter((o) => o.errorCode === null).map((o) => o.id);
        const refused = outcomes.filter((o) => o.errorCode !== null);
        setConfirming(false);
        stopSelecting();
        setLoad((current) =>
          current.state === 'ready'
            ? {
                ...current,
                notes: current.notes.filter((n) => !gone.includes(n.id)),
                total: Math.max(0, current.total - gone.length),
              }
            : current,
        );
        setDeleteNews(
          refused.length === 0
            ? `${gone.length === 1 ? '1 note' : `${gone.length} notes`} deleted.`
            : `${gone.length === 1 ? '1 note' : `${gone.length} notes`} deleted. ` +
              `${refused.length === 1 ? '1 could not be' : `${refused.length} could not be`}: ` +
              `${refused[0].errorCode === 'not_yours' ? MESSAGES.notYours : MESSAGES.noSuchNote}`,
        );
        load1(true);
      })
      .catch(() => setDeleteError(MESSAGES.noteProblem))
      .finally(() => setDeleting(false));
  };

  const more = load.state === 'ready' && load.notes.length < load.total;

  return (
    <Screen testID="home-screen">
      <PageHeader title="Your notes" helpId="home" />

      {/* The one glowing thing on the screen. New note is also a destination in the bar at the
          bottom, which is what makes it reachable with one thumb; this is the same action where
          somebody looking at an empty list will look for it. */}
      <View style={wide ? { alignSelf: 'flex-start' } : undefined}>
        <Button testID="home-new-note" label="New note" onPress={() => router.push('/new-note')} />
      </View>

      <UsageLine usage={usage} />

      {/* Hidden only when this person genuinely has no notes at all. Searching nothing, and
          filtering a list that does not exist, would just crowd the one thing worth doing. */}
      {load.state === 'ready' && load.total === 0 && !narrowed ? null : (
      <View style={{ gap: Spacing.two }}>
        <SearchField value={typed} onChange={typeInto} testIDPrefix="home-search" />

        <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: Spacing.two }}>
          <Pressable
            testID="home-filters"
            accessibilityRole="button"
            accessibilityLabel={onFilters === 0 ? 'Filters' : `Filters, ${onFilters} on`}
            onPress={() => setFiltersOpen(true)}
            style={({ pressed }) => ({
              minHeight: MinTouchTarget,
              justifyContent: 'center',
              paddingHorizontal: Spacing.three,
              borderRadius: Radius.pill,
              borderWidth: 1,
              borderColor: onFilters > 0 ? Colors.brand : Colors.glassBorder,
              backgroundColor: onFilters > 0 || pressed ? Colors.backgroundSelected : Colors.glass,
            })}>
            <Body small>{onFilters === 0 ? 'Filters' : `Filters (${onFilters})`}</Body>
          </Pressable>

          {/* Each filter that is on says so, and can be taken off on its own. */}
          {view.preset !== 'any' ? (
            <FilterChip
              label={view.preset === 'custom' ? describeRange(view.custom) : PRESET_LABEL[view.preset]}
              onRemove={() => setView({ ...view, preset: 'any', custom: {} })}
            />
          ) : null}
          {view.statuses.map((status) => (
            <FilterChip
              key={status}
              label={status}
              onRemove={() => setView({ ...view, statuses: view.statuses.filter((s) => s !== status) })}
            />
          ))}
          {view.sources.map((source) => (
            <FilterChip
              key={source}
              label={SOURCE_LABEL[source]}
              onRemove={() => setView({ ...view, sources: view.sources.filter((s) => s !== source) })}
            />
          ))}
          {view.openActions ? (
            <FilterChip label="Has something to do" onRemove={() => setView({ ...view, openActions: false })} />
          ) : null}

          {narrowed ? (
            <Pressable
              testID="home-clear-filters"
              accessibilityRole="button"
              accessibilityLabel="Clear filters"
              onPress={clearAll}
              style={{ minHeight: MinTouchTarget, justifyContent: 'center', paddingHorizontal: Spacing.two }}>
              <Body small color="link">
                Clear filters
              </Body>
            </Pressable>
          ) : null}
        </View>

        {/* How many were found, and the two things you can do with the list, all on one line.
            Select used to sit on a line of its own, which left it floating in the middle of the
            screen with nothing near it. */}
        {(load.state === 'ready' && load.total > 0) || searching ? (
          <View
            style={{
              flexDirection: 'row',
              flexWrap: 'wrap',
              alignItems: 'center',
              gap: Spacing.three,
              minHeight: MinTouchTarget,
            }}>
            {load.state === 'ready' && load.total > 0 ? (
              <Body small color="textSecondary">
                {narrowed
                  ? `${load.total} ${load.total === 1 ? 'note' : 'notes'} found`
                  : `${load.total} ${load.total === 1 ? 'note' : 'notes'}`}
              </Body>
            ) : null}
            {/* Shown whenever there are words to look for, including when no NOTE matched --
                that is exactly when looking line by line is the useful next thing to try. */}
            {searching ? (
              <Pressable
                testID="home-see-lines"
                accessibilityRole="link"
                accessibilityLabel="See every matching line"
                onPress={() => router.push({ pathname: '/search', params: { q: view.query } })}
                style={{ minHeight: MinTouchTarget, justifyContent: 'center' }}>
                <Body small color="link">
                  See every matching line
                </Body>
              </Pressable>
            ) : null}

            <View style={{ flex: 1 }} />

            {load.state === 'ready' && load.notes.length > 0 ? (
              selecting ? (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: Spacing.three }}>
                  <Pressable
                    testID="home-select-cancel"
                    accessibilityRole="button"
                    accessibilityLabel="Cancel selecting"
                    onPress={stopSelecting}
                    style={{ minHeight: MinTouchTarget, justifyContent: 'center' }}>
                    <Body small color="link">
                      Cancel
                    </Body>
                  </Pressable>
                  <Pressable
                    testID="home-select-delete"
                    accessibilityRole="button"
                    accessibilityLabel="Delete selected notes"
                    accessibilityState={{ disabled: picked.length === 0 }}
                    disabled={picked.length === 0}
                    onPress={() => setConfirming(true)}
                    style={{ minHeight: MinTouchTarget, justifyContent: 'center' }}>
                    <Body small color={picked.length === 0 ? 'textSecondary' : 'danger'}>
                      Delete
                    </Body>
                  </Pressable>
                </View>
              ) : (
                <Pressable
                  testID="home-select"
                  accessibilityRole="button"
                  accessibilityLabel="Select notes"
                  onPress={() => setSelecting(true)}
                  style={{ minHeight: MinTouchTarget, justifyContent: 'center' }}>
                  <Body small color="link">
                    Select
                  </Body>
                </Pressable>
              )
            ) : null}
          </View>
        ) : null}

        {selecting ? (
          <Body small color="textSecondary">
            {picked.length === 0
              ? 'Tap the notes you want to delete.'
              : `${picked.length} ${picked.length === 1 ? 'note' : 'notes'} selected`}
          </Body>
        ) : null}
      </View>
      )}

      {deleteNews ? (
        <GlassPanel>
          <Body accessibilityRole="alert">{deleteNews}</Body>
          <Button label="OK" variant="secondary" onPress={() => setDeleteNews(undefined)} />
        </GlassPanel>
      ) : null}

      {load.state === 'loading' ? (
        /* Shaped like the list it is standing in for: flat rows with a hairline between, not
           glass cards, or the page jumps about the moment the notes arrive. */
        <View accessibilityLabel="Loading your notes">
          {[0, 1, 2].map((i) => (
            <View
              key={i}
              style={{
                gap: Spacing.two,
                paddingVertical: Spacing.three,
                borderBottomWidth: i === 2 ? 0 : 1,
                borderBottomColor: Colors.glassBorder,
              }}>
              <Skeleton width="70%" height={18} />
              <Skeleton width="40%" />
            </View>
          ))}
        </View>
      ) : load.state === 'error' ? (
        <GlassPanel>
          <Body color="danger" accessibilityRole="alert">
            We could not load your notes. Check your internet and try again.
          </Body>
          <Button label="Retry" variant="secondary" onPress={() => load1()} />
        </GlassPanel>
      ) : load.notes.length === 0 && narrowed ? (
        <GlassPanel>
          <Heading level={3}>No notes match</Heading>
          <Body color="textSecondary">
            Nothing here matches what you asked for. Try fewer words, or a wider date range.
          </Body>
          <Button label="Show all notes" variant="secondary" onPress={clearAll} />
        </GlassPanel>
      ) : load.notes.length === 0 ? (
        <GlassPanel>
          <Heading level={3}>No notes yet</Heading>
          <Body color="textSecondary">Add your first conversation. Upload a file or paste some text.</Body>
        </GlassPanel>
      ) : (
        <NoteList
          notes={load.notes}
          searching={searching}
          selecting={selecting}
          picked={picked}
          onToggle={(id) =>
            setPicked((current) =>
              current.includes(id) ? current.filter((other) => other !== id) : [...current, id],
            )
          }
          more={more}
          loadingMore={loadingMore}
          onShowMore={showMore}
          onMore={setActing}
          onShare={shareOne}
          onDelete={deleteOne}
        />
      )}

      <ActionMenu
        visible={!!acting}
        onClose={() => setActing(undefined)}
        title={actingTitle}
        testIDPrefix="home-note-actions"
        items={actionItems}
      />

      <FilterSheet
        visible={filtersOpen}
        view={view}
        onApply={apply}
        onClose={() => setFiltersOpen(false)}
        onClear={clearAll}
      />

      <ConfirmDialog
        testIDPrefix="home-delete"
        visible={confirming}
        title={chosen.length === 1 ? 'Delete this note?' : `Delete ${chosen.length} notes?`}
        // Which notes go in the message, and what that means in the list below it. Putting the
        // titles in the same list as the consequences made "Weekly team call" and "The
        // recordings are removed" read as the same kind of thing.
        message={namesOf(chosen)}
        details={[
          'The transcripts, summaries, to-dos and chats go too.',
          'The recordings and files are removed.',
          chosen.length === 1
            ? 'It does not give you the meeting back this month'
            : `It does not give you ${chosen.length} meetings back this month`,
          'This cannot be undone.',
        ]}
        confirmLabel={deleting ? 'Deleting' : chosen.length === 1 ? 'Delete note' : `Delete ${chosen.length} notes`}
        busy={deleting}
        error={deleteError}
        onConfirm={doDelete}
        onCancel={() => setConfirming(false)}
      />
    </Screen>
  );
}

/** "A, B and C will be deleted." Long lists stop at three and count the rest. */
function namesOf(notes: NoteHit[]): string {
  const titles = notes.map((n) => noteTitle(n));
  if (titles.length === 0) return 'Nothing is selected.';
  if (titles.length === 1) return `"${titles[0]}" will be deleted.`;
  const shown = titles.slice(0, 3).map((t) => `"${t}"`);
  const rest = titles.length - shown.length;
  const list =
    rest > 0
      ? `${shown.join(', ')} and ${rest} ${rest === 1 ? 'other' : 'others'}`
      : `${shown.slice(0, -1).join(', ')} and ${shown[shown.length - 1]}`;
  return `${list} will be deleted.`;
}

function FilterChip({ label, onRemove }: { label: string; onRemove: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      testID={`home-filter-chip-${label}`}
      accessibilityLabel={`Remove the ${label} filter`}
      onPress={onRemove}
      style={({ pressed }) => ({
        minHeight: MinTouchTarget,
        flexDirection: 'row',
        alignItems: 'center',
        gap: Spacing.two,
        paddingHorizontal: Spacing.three,
        borderRadius: Radius.pill,
        borderWidth: 1,
        borderColor: Colors.glassBorder,
        backgroundColor: pressed ? Colors.backgroundSelected : Colors.glass,
      })}>
      <Body small>{label}</Body>
      <Body small color="textSecondary" accessibilityElementsHidden>
        {'✕'}
      </Body>
    </Pressable>
  );
}
