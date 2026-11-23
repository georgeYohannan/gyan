import { Text, type TextProps } from 'react-native';

import { Colors, FontFamily } from '@/constants/theme';
import { plainSnippet, splitHighlight } from '@/lib/notes-search';

type HighlightedTextProps = Omit<TextProps, 'children'> & {
  /** A snippet from the database, with matched words wrapped in the two marker characters. */
  snippet?: string;
  small?: boolean;
};

/**
 * A snippet with the matched words picked out.
 *
 * The matched words sit on a brand-blue fill rather than being coloured blue, because brand blue
 * is never body text on navy -- that rule is about readability, and a fill keeps it. White on
 * #0066FF measures 4.8 to 1, which clears the 4.5 the project asks for.
 *
 * Nothing here renders html. The database marks matches with two private-use characters and
 * splitHighlight turns them into pieces; see src/lib/notes-search.ts for why.
 */
export function HighlightedText({ snippet, small, style, ...rest }: HighlightedTextProps) {
  const parts = splitHighlight(snippet);
  if (parts.length === 0) return null;

  return (
    <Text
      // One label for the whole line, without the marks, so a screen reader reads a sentence
      // rather than a word at a time.
      accessibilityLabel={plainSnippet(snippet)}
      style={[
        {
          color: Colors.text,
          fontFamily: FontFamily.body,
          fontSize: small ? 14 : 16,
          lineHeight: small ? 20 : 24,
        },
        style,
      ]}
      {...rest}>
      {parts.map((part, index) =>
        part.match ? (
          <Text
            key={index}
            style={{
              backgroundColor: Colors.brand,
              color: Colors.heading,
              fontFamily: FontFamily.bodySemiBold,
            }}>
            {part.text}
          </Text>
        ) : (
          <Text key={index}>{part.text}</Text>
        ),
      )}
    </Text>
  );
}
