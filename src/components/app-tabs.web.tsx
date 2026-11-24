import { Tabs, TabList, TabTrigger, TabSlot, type TabTriggerSlotProps } from 'expo-router/ui';
import { Pressable, type PressableProps, Text, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  Colors,
  FontFamily,
  MinTouchTarget,
  Radius,
  SidebarWidth,
  Spacing,
  TabBarHeight,
  WideBreakpoint,
} from '@/constants/theme';

/**
 * Getting around on the web: a bar along the bottom on a phone-sized window, a sidebar down
 * the left on a wide one.
 *
 * This replaces a floating pill bar at the TOP that looked nothing like the bar on a phone and
 * carried a leftover link to another company's documentation.
 *
 * The shape is the one Expo documents as "multiple tab bars": the `TabList` below is hidden,
 * and exists only to say which routes are tabs (those triggers carry the `href`). The bar you
 * can see is built from more `TabTrigger`s with the same `name` and no `href`. They have to be
 * inside `Tabs` or they cannot switch anything.
 *
 * Only ONE breakpoint, `WideBreakpoint`, and it is the same one every slide-in panel already
 * used -- so the sidebar appears at exactly the width where panels start coming in from the
 * right instead of up from the bottom.
 */
export default function AppTabs() {
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const wide = width >= WideBreakpoint;

  return (
    <Tabs>
      <View style={{ flex: 1, flexDirection: wide ? 'row' : 'column', backgroundColor: Colors.background }}>
        {wide ? <Sidebar /> : null}

        {/* The bar is drawn over nothing, so the screen below it needs room to finish.
            This is the one place that knows how tall the bar is. */}
        <View style={{ flex: 1, paddingBottom: wide ? 0 : TabBarHeight + insets.bottom }}>
          <TabSlot style={{ height: '100%' }} />
        </View>

        {wide ? null : <BottomBar bottomInset={insets.bottom} />}
      </View>

      {/* Not drawn. This is the list of what counts as a tab. */}
      <TabList style={{ display: 'none' }}>
        <TabTrigger name="(home)" href="/" />
        <TabTrigger name="(search)" href="/search" />
        {/* Coming back to New note should offer a fresh one, not the upload that just
            finished. `resetOnFocus` is the prop the installed expo-router actually has; the
            guide page still documents a `reset` prop that was renamed. */}
        <TabTrigger name="(new)" href="/new-note" resetOnFocus />
        <TabTrigger name="(ask)" href="/ask" />
        <TabTrigger name="settings" href="/settings" />
      </TabList>
    </Tabs>
  );
}

/** The five places, in the order somebody works: find, then make, then ask, then settings. */
const PLACES = [
  { name: '(home)', label: 'Home', testID: 'nav-home' },
  { name: '(search)', label: 'Search', testID: 'nav-search' },
  { name: '(new)', label: 'New note', testID: 'nav-new-note' },
  { name: '(ask)', label: 'Ask', testID: 'nav-ask' },
  { name: 'settings', label: 'Settings', testID: 'nav-settings' },
] as const;

function Sidebar() {
  return (
    <View
      style={{
        width: SidebarWidth,
        borderRightWidth: 1,
        borderRightColor: Colors.glassBorder,
        paddingHorizontal: Spacing.three,
        paddingTop: Spacing.four,
        gap: Spacing.one,
      }}>
      <Text
        style={{
          fontFamily: FontFamily.heading,
          fontSize: 22,
          color: Colors.heading,
          marginLeft: Spacing.three,
          marginBottom: Spacing.four,
        }}>
        gyan
      </Text>
      {PLACES.map((p) => (
        <TabTrigger key={p.name} name={p.name} asChild>
          <SideItem testID={p.testID}>{p.label}</SideItem>
        </TabTrigger>
      ))}
    </View>
  );
}

function BottomBar({ bottomInset }: { bottomInset: number }) {
  return (
    <View
      style={{
        position: 'absolute',
        left: 0,
        right: 0,
        bottom: 0,
        flexDirection: 'row',
        borderTopWidth: 1,
        borderTopColor: Colors.glassBorder,
        // Flat navy, not glass: it sits on top of scrolling content, and a see-through bar
        // over moving text is unreadable.
        backgroundColor: Colors.background,
        paddingBottom: bottomInset,
      }}>
      {PLACES.map((p) => (
        <TabTrigger key={p.name} name={p.name} asChild>
          <BarItem testID={p.testID}>{p.label}</BarItem>
        </TabTrigger>
      ))}
    </View>
  );
}

type ItemProps = TabTriggerSlotProps & { testID?: string };

/**
 * One item in the bottom bar.
 *
 * The chosen one is marked by a short brand-blue bar above it, which is as close to the
 * brief's "marked by brand blue and nothing else" as the contrast rule allows: the LABEL
 * cannot be #0066FF, because it fails 4.5:1 on navy and a test asserts that it fails. So the
 * mark is brand blue and the word is #99CBFF.
 */
function BarItem({ children, isFocused, testID, ...props }: ItemProps) {
  return (
    <Pressable
      {...(props as PressableProps)}
      testID={testID}
      accessibilityRole="tab"
      accessibilityState={{ selected: !!isFocused }}
      aria-selected={!!isFocused}
      style={{
        flex: 1,
        minHeight: TabBarHeight,
        alignItems: 'center',
        justifyContent: 'center',
        gap: Spacing.two,
      }}>
      <View
        style={{
          height: 3,
          width: 20,
          borderRadius: Radius.pill,
          backgroundColor: isFocused ? Colors.brand : 'transparent',
        }}
      />
      <Text
        numberOfLines={1}
        style={{
          fontFamily: isFocused ? FontFamily.bodySemiBold : FontFamily.body,
          fontSize: 12,
          color: isFocused ? Colors.link : Colors.textSecondary,
        }}>
        {children}
      </Text>
    </Pressable>
  );
}

/** One row of the sidebar. Same rule as the bar: blue mark, light-blue word. */
function SideItem({ children, isFocused, testID, ...props }: ItemProps) {
  return (
    <Pressable
      {...(props as PressableProps)}
      testID={testID}
      accessibilityRole="tab"
      accessibilityState={{ selected: !!isFocused }}
      aria-selected={!!isFocused}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: Spacing.three,
        minHeight: MinTouchTarget,
        paddingHorizontal: Spacing.three,
        borderRadius: Radius.pill,
        backgroundColor: isFocused ? Colors.glass : 'transparent',
      }}>
      <View
        style={{
          width: 3,
          height: 18,
          borderRadius: Radius.pill,
          backgroundColor: isFocused ? Colors.brand : 'transparent',
        }}
      />
      <Text
        numberOfLines={1}
        style={{
          fontFamily: isFocused ? FontFamily.bodySemiBold : FontFamily.body,
          fontSize: 15,
          color: isFocused ? Colors.link : Colors.textSecondary,
        }}>
        {children}
      </Text>
    </Pressable>
  );
}
