import type { ComponentRef, RefObject } from 'react';
import { ScrollView, View, type ViewProps } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Colors, MaxContentWidth, Spacing } from '@/constants/theme';

type ScreenProps = ViewProps & {
  /** Scroll when content is taller than the window. Default true. */
  scroll?: boolean;
  /** Lets a screen scroll itself, for example to jump to one transcript line. */
  scrollRef?: RefObject<ComponentRef<typeof ScrollView> | null>;
};

/**
 * The dark navy page every screen sits on. Content is centered and not too wide.
 *
 * There used to be 88 points of padding at the top on the web, and nothing on a phone. It was
 * there for one reason: to clear a navigation bar that floated over the top of the page. The
 * bar is along the bottom now (or down the left side), so the padding is gone and the web and
 * the phone finally agree.
 *
 * Nothing is added at the BOTTOM here on purpose. The sign in and sign up screens use Screen
 * too and sit outside the tabs, so they must not get room for a bar that is not there. The one
 * place that knows how tall the bar is wraps the slot in `app-tabs.web.tsx`.
 */
export function Screen({ scroll = true, scrollRef, children, style, ...rest }: ScreenProps) {
  const content = (
    <View
      style={[
        {
          width: '100%',
          maxWidth: MaxContentWidth,
          alignSelf: 'center',
          padding: Spacing.three,
          gap: Spacing.four,
        },
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
