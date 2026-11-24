import { NativeTabs } from 'expo-router/native-tabs';

import { Colors } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

/**
 * The bottom bar on phones: the five places Gyan can take you.
 *
 * Every one is a real trigger pointing at a real group. None is hidden, deliberately -- the
 * Expo reference still warns that a hidden tab "cannot be navigated to in any way", which is
 * what made the New note screen flash and bounce back on iPhone once before
 * (docs/decisions.md, 2026-11-17).
 *
 * The icons are the system's own: SF Symbols on iPhone, Material symbols on Android. They are
 * thin-stroke and monochrome, which is what docs/design/sleek/brief.txt asks for, they match
 * whatever the person's phone does with weight and scale, and they ship nothing.
 *
 * Two things are deliberately not set:
 *   - `role="search"` on Search. On iOS 26.1+ it becomes a UISearchTab, which on selection
 *     focuses the header search bar of the stack inside the tab -- and every navigator here
 *     sets headerShown: false, so there is nothing to focus. (`disableAutomaticSearchActivation`
 *     would stop that, but it is iOS 26.1+ only and moves the tab on iOS 27.)
 *   - a background colour. On iOS 26 and later the system draws the tab bar background and
 *     these props have no effect, so `tintColor` marks the selected tab and the rest is the
 *     platform's. A new iPhone will not look exactly like the web bar, and that is the OS.
 */
export default function AppTabs() {
  const colors = useTheme();

  return (
    <NativeTabs
      backgroundColor={colors.background}
      indicatorColor={colors.backgroundElement}
      // The selected tab is marked in brand blue. Its LABEL cannot be: #0066FF fails our own
      // 4.5:1 rule on navy, and a test asserts that it fails, so the label uses #99CBFF.
      tintColor={Colors.brand}
      labelStyle={{ selected: { color: colors.link } }}>
      {/* Home holds a stack: the list, then a note on top of it. */}
      <NativeTabs.Trigger name="(home)" testID="nav-home" accessibilityLabel="Home">
        <NativeTabs.Trigger.Label>Home</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf={{ default: 'house', selected: 'house.fill' }} md="home" />
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="(search)" testID="nav-search" accessibilityLabel="Search">
        <NativeTabs.Trigger.Label>Search</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf="magnifyingglass" md="search" />
      </NativeTabs.Trigger>

      {/* The main action, in the middle, under a thumb. `prominent` gives it its own surface
          on iOS 27 and later and does nothing at all on older versions. */}
      <NativeTabs.Trigger name="(new)" testID="nav-new-note" accessibilityLabel="New note" prominent>
        <NativeTabs.Trigger.Label>New note</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon
          sf={{ default: 'plus.circle', selected: 'plus.circle.fill' }}
          md="add_circle"
        />
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="(ask)" testID="nav-ask" accessibilityLabel="Ask">
        <NativeTabs.Trigger.Label>Ask</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon
          sf={{ default: 'bubble.left', selected: 'bubble.left.fill' }}
          md="chat_bubble"
        />
      </NativeTabs.Trigger>

      {/* Settings holds its own stack: the list, and a page per section. */}
      <NativeTabs.Trigger name="settings" testID="nav-settings" accessibilityLabel="Settings">
        <NativeTabs.Trigger.Label>Settings</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf={{ default: 'gearshape', selected: 'gearshape.fill' }} md="settings" />
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}
