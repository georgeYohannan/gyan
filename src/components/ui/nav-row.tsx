import { useRouter } from 'expo-router';
import { Pressable, View } from 'react-native';

import { Body } from '@/components/ui/body';
import { Colors, MinTouchTarget, Radius, Spacing } from '@/constants/theme';

type NavRowProps = {
  /** Where this row goes. Leads the row, because this is a door, not a setting. */
  title: string;
  /** What is set in there right now, in a few words, so you can often skip going in. */
  summary: string;
  href: string;
  /** A stable name for tests, so a visual change does not break them. */
  testID?: string;
  /** Draw the hairline under this row. Off on the last row of a group. */
  divider?: boolean;
};

/**
 * One row of the Settings list: where it goes, and what is set in there.
 *
 * The name leads here, unlike a SettingRow, because this row is a way through to somewhere
 * rather than the setting itself. The quiet line underneath is what saves a trip: somebody
 * checking who gets recap emails can often read the answer without opening anything.
 */
export function NavRow({ title, summary, href, testID, divider = true }: NavRowProps) {
  const router = useRouter();
  return (
    <View>
      <Pressable
        testID={testID}
        accessibilityRole="link"
        accessibilityLabel={`${title}. ${summary}`}
        onPress={() => router.push(href as never)}
        style={({ pressed }) => ({
          flexDirection: 'row',
          alignItems: 'center',
          gap: Spacing.three,
          minHeight: MinTouchTarget,
          paddingVertical: Spacing.three,
          paddingHorizontal: Spacing.three,
          borderRadius: Radius.panel,
          backgroundColor: pressed ? Colors.backgroundSelected : 'transparent',
        })}>
        <View style={{ flex: 1, gap: Spacing.half }}>
          <Body>{title}</Body>
          <Body small color="textSecondary">
            {summary}
          </Body>
        </View>
        <Body color="textSecondary">{'›'}</Body>
      </Pressable>
      {/* The line sits between two rows, so it stops before the edge of the press area: it
          separates the rows rather than drawing a box round each one. */}
      {divider ? (
        <View style={{ height: 1, marginHorizontal: Spacing.three, backgroundColor: Colors.glassBorder }} />
      ) : null}
    </View>
  );
}
