import { useRouter } from 'expo-router';
import { Pressable, View } from 'react-native';

import { HelpButton } from '@/components/help/help-button';
import { Body } from '@/components/ui/body';
import { MinTouchTarget, Spacing } from '@/constants/theme';

type BackLinkProps = {
  /** Where it goes, and what the link says: "‹ Settings". */
  label: string;
  href: string;
  /** The help entry for this page, shown as a ? on the right. */
  helpId?: string;
  /** A stable name for tests, so a visual change does not break them. */
  testID?: string;
};

/** The top line of a page: the way back on the left, and help on the right. */
export function BackLink({ label, href, helpId, testID }: BackLinkProps) {
  const router = useRouter();
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: Spacing.three,
      }}>
      <Pressable
        testID={testID ?? 'back-link'}
        accessibilityRole="link"
        accessibilityLabel={`Back to ${label}`}
        onPress={() => router.push(href as never)}
        style={{ minHeight: MinTouchTarget, minWidth: MinTouchTarget, justifyContent: 'center' }}>
        <Body color="link">{`‹ ${label}`}</Body>
      </Pressable>
      {helpId ? <HelpButton helpId={helpId} /> : <View />}
    </View>
  );
}
