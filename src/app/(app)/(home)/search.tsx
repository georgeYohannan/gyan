import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, View } from 'react-native';

import { SearchField } from '@/components/notes/search-field';
import { BackLink } from '@/components/ui/back-link';
import { Body } from '@/components/ui/body';
import { Button } from '@/components/ui/button';
import { GlassPanel } from '@/components/ui/glass-panel';
import { Heading } from '@/components/ui/heading';
import { HighlightedText } from '@/components/ui/highlighted-text';
import { Screen } from '@/components/ui/screen';
import { Skeleton } from '@/components/ui/skeleton';
import { Colors, FontFamily, MinTouchTarget, Radius, Spacing } from '@/constants/theme';
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
 * It lives inside the Home tab rather than being a tab of its own: the bottom bar is Home and
 * Settings, and docs/decisions.md records that adding a third is a separate decision.
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
      <BackLink label="Home" href="/" helpId="search" />

      <View style={{ gap: Spacing.two }}>
        <Heading level={1}>Search</Heading>
        <Body color="textSecondary">Every line of every note, with the moment it was said.</Body>
      </View>

      <SearchField value={typed} onChange={setTyped} autoFocus placeholder="A word somebody said" />

      {load.state === 'ready' && load.total > 0 ? (
        <Body small color="textSecondary">
          {`${load.total} ${load.total === 1 ? 'line' : 'lines'} in ` +
            `${load.noteCount} ${load.noteCount === 1 ? 'note' : 'notes'}`}
        </Body>
      ) : null}

      {load.state === 'idle' ? (
        <GlassPanel>
          <Heading level={3}>Search across every note</Heading>
          <Body color="textSecondary">
            Type a word somebody said. Gyan looks through every transcript you can see and shows
            the lines that match, with the moment each one was said.
          </Body>
        </GlassPanel>
      ) : load.state === 'loading' ? (
        <View style={{ gap: Spacing.three }} accessibilityLabel="Looking through your notes">
          {[0, 1, 2].map((i) => (
            <GlassPanel key={i}>
              <Skeleton width="55%" height={18} />
              <Skeleton width="90%" />
              <Skeleton width="30%" />
            </GlassPanel>
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
        <View style={{ gap: Spacing.three }}>
          {load.passages.map((passage) => (
            <Pressable
              key={passage.segmentId}
              accessibilityRole="link"
              accessibilityLabel={
                `${passage.noteTitle ?? 'Untitled note'}, ${shortDate(passage.noteCreatedAt)}, ` +
                `${passage.speaker ?? 'Speaker'} at ${formatMoment(passage.startMs)}`
              }
              onPress={() => open(passage)}>
              <GlassPanel style={{ gap: Spacing.two }}>
                <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.three }}>
                  <Body style={{ flex: 1, fontWeight: '600' }} numberOfLines={2}>
                    {passage.noteTitle?.trim() || 'Untitled note'}
                  </Body>
                  <Body small color="textSecondary">
                    {shortDate(passage.noteCreatedAt)}
                  </Body>
                </View>

                {/* Speaker names are set small and spaced so a transcript reads like a script,
                    which is the one place this project uses letter spacing on purpose. */}
                <Body small color="textSecondary" style={{ letterSpacing: 1, fontFamily: FontFamily.bodyMedium }}>
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
              </GlassPanel>
            </Pressable>
          ))}

          {more ? (
            <Button
              label={loadingMore ? 'Loading' : 'Show more'}
              variant="secondary"
              loading={loadingMore}
              onPress={showMore}
            />
          ) : null}
        </View>
      )}
    </Screen>
  );
}
