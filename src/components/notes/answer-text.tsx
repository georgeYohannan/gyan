import { Pressable, View } from 'react-native';

import { Body } from '@/components/ui/body';
import { Colors, MinTouchTarget, Radius, Spacing } from '@/constants/theme';
import type { ChatSource } from '@/lib/chat';

type AnswerTextProps = {
  /** The answer, with passage numbers in it like [2]. */
  text: string;
  /** The lines those numbers mean. A number that is not in here stays as plain words. */
  sources: ChatSource[];
  onJump: (source: ChatSource) => void;
};

type Piece =
  | { kind: 'words'; text: string }
  /**
   * `after` is the punctuation that came straight after the number, taken out of the words
   * that follow and carried WITH the number instead.
   *
   * It is carried rather than just measured because the answer is laid out as a wrapping row
   * of pieces: a full stop left at the head of the next piece can be pushed onto a line of
   * its own, and a line beginning with "." reads as a mistake. A screenshot of a two-note
   * answer is what showed this; no test could have.
   */
  | { kind: 'chip'; source: ChatSource; after: string };

/**
 * Splits an answer into words and tappable passage numbers.
 * Exported so a test can check it without drawing anything.
 */
export function splitAnswer(text: string, sources: ChatSource[]): Piece[] {
  const byNumber = new Map(sources.map((s) => [s.n, s]));
  const pieces: Piece[] = [];
  let last = 0;

  for (const match of text.matchAll(/\[(\d+)\]/g)) {
    const source = byNumber.get(Number(match[1]));
    // A number nobody can jump to is left exactly as it was written.
    if (!source) continue;
    const start = match.index ?? 0;
    if (start > last) pieces.push({ kind: 'words', text: text.slice(last, start) });
    last = start + match[0].length;
    // "…on Friday [3]." should read as "…on Friday (3)." with the stop right after the number.
    const after = /^[.,;:!?)]+/.exec(text.slice(last))?.[0] ?? '';
    last += after.length;
    pieces.push({ kind: 'chip', source, after });
  }
  if (last < text.length) pieces.push({ kind: 'words', text: text.slice(last) });
  return pieces;
}

/** 65000 -> "1:05". Used in the label a screen reader says. */
function timeLabel(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(total / 60);
  const s = String(total % 60).padStart(2, '0');
  return `${m}:${s}`;
}

/**
 * What a screen reader says about one passage number, and what happens if you follow it.
 *
 * A note chat only ever points inside the note you are already reading, so the time is
 * enough. An Ask answer reads several notes, so the number has to say which one -- "Go to the
 * line at 1:05" would be a link to somewhere unnamed. A pasted note has no times, so it is
 * named by its passage number instead of a made-up 0:00.
 */
export function chipLabel(source: ChatSource): { label: string; hint: string } {
  if (!source.note_title) {
    return {
      label: `Go to the line at ${timeLabel(source.start_ms)}`,
      hint: 'Opens the Transcript tab at this line',
    };
  }
  return {
    label:
      source.start_ms > 0
        ? `Go to ${source.note_title} at ${timeLabel(source.start_ms)}`
        : `Go to ${source.note_title}, passage ${source.n}`,
    hint: 'Opens that note at this line',
  };
}

/**
 * One answer, with each passage number drawn as a small chip you can tap to jump to that
 * transcript line.
 */
export function AnswerText({ text, sources, onJump }: AnswerTextProps) {
  const pieces = splitAnswer(text, sources);

  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center' }}>
      {pieces.map((piece, i) =>
        piece.kind === 'words' ? (
          // flexShrink lets a long run of words share a line with the number before it and
          // wrap inside itself, instead of being pushed whole onto the next line.
          <Body key={`w${i}`} style={{ flexShrink: 1 }}>
            {piece.text}
          </Body>
        ) : (
          // The number and the punctuation after it are ONE item in the wrapping row, so a
          // line can never start with a stray full stop.
          <View key={`c${i}`} style={{ flexDirection: 'row', alignItems: 'center' }}>
            <Pressable
              accessibilityRole="link"
              accessibilityLabel={chipLabel(piece.source).label}
              accessibilityHint={chipLabel(piece.source).hint}
              onPress={() => onJump(piece.source)}
              // The chip itself is small so it reads as part of the sentence. hitSlop grows
              // the part you can tap to the 44 by 44 points a finger needs.
              hitSlop={Spacing.three}
              style={{
                minHeight: MinTouchTarget / 2,
                justifyContent: 'center',
                marginLeft: Spacing.half,
                marginRight: piece.after ? 0 : Spacing.half,
                paddingHorizontal: Spacing.two,
                paddingVertical: Spacing.half,
                borderRadius: Radius.pill,
                borderWidth: 1,
                borderColor: Colors.glassBorder,
                backgroundColor: Colors.glass,
              }}>
              <Body small color="link" weight="semibold">
                {piece.source.n}
              </Body>
            </Pressable>
            {piece.after ? <Body>{piece.after}</Body> : null}
          </View>
        ),
      )}
    </View>
  );
}
