import type { ComponentRef, RefObject } from 'react';
import { Platform, ScrollView, View, type ViewProps } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Colors, MaxContentWidth, Spacing } from '@/constants/theme';

type ScreenProps = ViewProps & {
  /** Scroll when content is taller than the window. Default true. */
  scroll?: boolean;
  /** Lets a screen scroll itself, for example to jump to one transcript line. */
  scrollRef?: RefObject<ComponentRef<typeof ScrollView> | null>;
};

/** The dark navy page every screen sits on. Content is centered and not too wide. */
export function Screen({ scroll = true, scrollRef, children, style, ...rest }: ScreenProps) {
  const content = (
    <View
      style={[
        { width: '100%', maxWidth: MaxContentWidth, alignSelf: 'center', padding: Spacing.three, paddingTop: Platform.OS === 'web' ? Spacing.six + Spacing.four : Spacing.three, gap: Spacing.four },
        style,
      ]}
      {...rest}>
      {children}
    </View>
  );
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: Colors.background }}>
      {scroll ? (
        <ScrollView ref={scrollRef} contentContainerStyle={{ flexGrow: 1 }}>
          {content}
        </ScrollView>
      ) : (
        content
      )}
    </SafeAreaView>
  );
}
