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
  /** `tight` means a full stop or comma comes straight after, so leave no gap before it. */
  | { kind: 'chip'; source: ChatSource; tight: boolean };

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
    pieces.push({ kind: 'chip', source, tight: /^[.,;:!?)]/.test(text.slice(last)) });
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
 * One answer, with each passage number drawn as a small chip you can tap to jump to that
 * transcript line.
 */
export function AnswerText({ text, sources, onJump }: AnswerTextProps) {
  const pieces = splitAnswer(text, sources);

  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center' }}>
      {pieces.map((piece, i) =>
        piece.kind === 'words' ? (
          <Body key={`w${i}`}>{piece.text}</Body>
        ) : (
          <Pressable
            key={`c${i}`}
            accessibilityRole="link"
            accessibilityLabel={`Go to the line at ${timeLabel(piece.source.start_ms)}`}
            accessibilityHint="Opens the Transcript tab at this line"
            onPress={() => onJump(piece.source)}
            // The chip itself is small so it reads as part of the sentence. hitSlop grows the
            // part you can tap to the 44 by 44 points a finger needs.
            hitSlop={Spacing.three}
            style={{
              minHeight: MinTouchTarget / 2,
              justifyContent: 'center',
              marginLeft: Spacing.half,
              marginRight: piece.tight ? 0 : Spacing.half,
              paddingHorizontal: Spacing.two,
              paddingVertical: Spacing.half,
              borderRadius: Radius.pill,
              borderWidth: 1,
              borderColor: Colors.glassBorder,
              backgroundColor: Colors.glass,
            }}>
            <Body small color="link" style={{ fontWeight: '600' }}>
              {piece.source.n}
            </Body>
          </Pressable>
        ),
      )}
    </View>
  );
}
