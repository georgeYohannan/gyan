import { NativeTabs } from 'expo-router/native-tabs';

import { useTheme } from '@/hooks/use-theme';

export default function AppTabs() {
  const colors = useTheme();

  return (
    <NativeTabs
      backgroundColor={colors.background}
      indicatorColor={colors.backgroundElement}
      labelStyle={{ selected: { color: colors.text } }}>
      <NativeTabs.Trigger name="index">
        <NativeTabs.Trigger.Label>Home</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon
          src={require('@/assets/images/tabIcons/home.png')}
          renderingMode="template"
        />
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="explore">
        <NativeTabs.Trigger.Label>Explore</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon
          src={require('@/assets/images/tabIcons/explore.png')}
          renderingMode="template"
        />
      </NativeTabs.Trigger>

      {/* Builders-only page. Shows only while developing (__DEV__), never in a store build. */}
      {__DEV__ ? (
        <NativeTabs.Trigger name="design">
          <NativeTabs.Trigger.Label>Design</NativeTabs.Trigger.Label>
          <NativeTabs.Trigger.Icon sf="paintpalette" md="palette" />
        </NativeTabs.Trigger>
      ) : null}
    </NativeTabs>
  );
}
