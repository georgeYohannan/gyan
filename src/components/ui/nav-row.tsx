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
};

/**
 * One row of the Settings list: where it goes, and what is set in there.
 *
 * The name leads here, unlike a SettingRow, because this row is a way through to somewhere
 * rather than the setting itself. The quiet line underneath is what saves a trip: somebody
 * checking who gets recap emails can often read the answer without opening anything.
 */
export function NavRow({ title, summary, href, testID }: NavRowProps) {
  const router = useRouter();
  return (
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
        paddingVertical: Spacing.two,
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
  );
}
