import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, View } from 'react-native';

import { SearchField } from '@/components/notes/search-field';
import { Body } from '@/components/ui/body';
import { Button } from '@/components/ui/button';
import { GlassPanel } from '@/components/ui/glass-panel';
import { Heading } from '@/components/ui/heading';
import { HighlightedText } from '@/components/ui/highlighted-text';
import { PageHeader } from '@/components/ui/page-header';
import { Screen } from '@/components/ui/screen';
import { Skeleton } from '@/components/ui/skeleton';
import { Colors, FontFamily, Radius, Spacing } from '@/constants/theme';
import { useDebouncedValue } from '@/hooks/use-debounced-value';
import { formatMoment, shortDate } from '@/lib/dates';
import { findPassages, FIRST_PAGE, NEXT_PAGE, type Passage } from '@/lib/notes-search';

type Load =
  | { state: 'idle' }
  | { state: 'loading' }
  | { state: 'error' }
  | { state: 'ready'; passages: Passage[]; total: number; noteCount: number };

/**
 * Search: every line of every note that matches, with the moment it was said.
 *
 * Home finds NOTES. This finds LINES, which is what docs/product-spec.md asks the Search screen
 * for -- so a half-remembered sentence takes you to the second of the recording it was said in.
 *
 * It is a destination of its own in the navigation now, so there is no link back to Home: a tab
 * has no back. It used to live inside the Home tab with a "Home" link above the title, which is
 * why that link has gone.
 *
 * The results read like a script, which is what they are. Each one is a flat row with a
 * hairline under it, not a card, and the speaker's name is set small and spaced above the
 * line they said -- the one place in Gyan that uses letter spacing on purpose.
 */
export default function SearchScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ q?: string }>();

  const [typed, setTyped] = useState(params.q ?? '');
  const query = useDebouncedValue(typed, 300);
  const [load, setLoad] = useState<Load>({ state: query.trim() === '' ? 'idle' : 'loading' });
  const [loadingMore, setLoadingMore] = useState(false);

  // Keep the address in step, so a search can be kept or shared.
  const written = useRef(params.q ?? '');
  useEffect(() => {
    if (query === written.current) return;
    written.current = query;
    router.setParams({ q: query });
  }, [query, router]);

  const look = useCallback(() => {
    if (query.trim() === '') {
      setLoad({ state: 'idle' });
      return;
    }
    setLoad({ state: 'loading' });
    findPassages(query, { limit: FIRST_PAGE })
      .then((page) =>
        setLoad({ state: 'ready', passages: page.passages, total: page.total, noteCount: page.noteCount }),
      )
      .catch(() => setLoad({ state: 'error' }));
  }, [query]);

  useEffect(look, [look]);

  const showMore = () => {
    if (load.state !== 'ready' || loadingMore) return;
    setLoadingMore(true);
    findPassages(query, { limit: NEXT_PAGE, offset: load.passages.length })
      .then((page) =>
        setLoad((current) =>
          current.state === 'ready'
            ? { ...current, total: page.total, passages: [...current.passages, ...page.passages] }
            : current,
        ),
      )
      .catch(() => undefined)
      .finally(() => setLoadingMore(false));
  };

  const open = (passage: Passage) => {
    router.push({
      pathname: '/note/[id]',
      params: { id: passage.meetingId, line: passage.segmentId },
    });
  };

  const more = load.state === 'ready' && load.passages.length < load.total;

  return (
    <Screen testID="search-screen">
      {/* The invitation below the box says what this screen is for, at more length and in
          plainer words, so there is no line under the title as well. */}
      <PageHeader title="Search" helpId="search" />

      <SearchField value={typed} onChange={setTyped} autoFocus placeholder="A word somebody said" />

      {load.state === 'ready' && load.total > 0 ? (
        <Body small color="textSecondary">
          {`${load.total} ${load.total === 1 ? 'line' : 'lines'} in ` +
            `${load.noteCount} ${load.noteCount === 1 ? 'note' : 'notes'}`}
        </Body>
      ) : null}

      {load.state === 'idle' ? (
        <View style={{ gap: Spacing.two }}>
          <Heading level={3}>Search across every note</Heading>
          <Body color="textSecondary">
            Type a word somebody said. Gyan looks through every transcript you can see and shows
            the lines that match, with the moment each one was said.
          </Body>
        </View>
      ) : load.state === 'loading' ? (
        <View accessibilityLabel="Looking through your notes">
          {[0, 1, 2].map((i) => (
            <View
              key={i}
              style={{
                gap: Spacing.two,
                paddingVertical: Spacing.three,
                borderBottomWidth: i === 2 ? 0 : 1,
                borderBottomColor: Colors.glassBorder,
              }}>
              <Skeleton width="55%" height={18} />
              <Skeleton width="90%" />
              <Skeleton width="30%" />
            </View>
          ))}
        </View>
      ) : load.state === 'error' ? (
        <GlassPanel>
          <Body color="danger" accessibilityRole="alert">
            We could not search your notes. Check your internet and try again.
          </Body>
          <Button label="Retry" variant="secondary" onPress={look} />
        </GlassPanel>
      ) : load.passages.length === 0 ? (
        <GlassPanel>
          <Heading level={3}>Nothing said that</Heading>
          <Body color="textSecondary">
            No line in any of your notes matches those words. Try fewer words, or different ones.
          </Body>
        </GlassPanel>
      ) : (
        <View>
          {load.passages.map((passage, i) => (
            <Pressable
              key={passage.segmentId}
              accessibilityRole="link"
              accessibilityLabel={
                `${passage.noteTitle ?? 'Untitled note'}, ${shortDate(passage.noteCreatedAt)}, ` +
                `${passage.speaker ?? 'Speaker'} at ${formatMoment(passage.startMs)}`
              }
              onPress={() => open(passage)}>
              <View
                style={{
                  gap: Spacing.two,
                  paddingVertical: Spacing.three,
                  borderBottomWidth: i === load.passages.length - 1 ? 0 : 1,
                  borderBottomColor: Colors.glassBorder,
                }}>
                <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.three }}>
                  <Body weight="semibold" style={{ flex: 1 }} numberOfLines={2}>
                    {passage.noteTitle?.trim() || 'Untitled note'}
                  </Body>
                  <Body small color="textSecondary">
                    {shortDate(passage.noteCreatedAt)}
                  </Body>
                </View>

                {/* Speaker names are set small, spaced and in capitals so a transcript reads
                    like a script. This is the one place this project uses letter spacing on
                    purpose, and the capitals are `textTransform`, NEVER a changed string: the
                    screen reader label and `getByText('Speaker 1')` both read the real words. */}
                <Body
                  small
                  color="textSecondary"
                  style={{ letterSpacing: 1, textTransform: 'uppercase', fontFamily: FontFamily.bodyMedium }}>
                  {passage.speaker ?? 'Speaker'}
                </Body>

                <HighlightedText snippet={passage.line} numberOfLines={3} />

                <View style={{ flexDirection: 'row' }}>
                  <View
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: Spacing.one,
                      paddingHorizontal: Spacing.two,
                      paddingVertical: Spacing.one,
                      borderRadius: Radius.pill,
                      borderWidth: 1,
                      borderColor: Colors.glassBorder,
                      backgroundColor: Colors.glass,
                    }}>
                    <Body small color="link" accessibilityElementsHidden>
                      {'▷'}
                    </Body>
                    <Body small color="textSecondary">
                      {formatMoment(passage.startMs)}
                    </Body>
                  </View>
                </View>
              </View>
            </Pressable>
          ))}

          {more ? (
            <View style={{ paddingTop: Spacing.four }}>
              <Button
                label={loadingMore ? 'Loading' : 'Show more'}
                variant="secondary"
                loading={loadingMore}
                onPress={showMore}
              />
            </View>
          ) : null}
        </View>
      )}
    </Screen>
  );
}
