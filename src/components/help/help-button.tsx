import { useState } from 'react';
import { Pressable, Text } from 'react-native';

import { Colors, FontFamily, MinTouchTarget, Radius } from '@/constants/theme';
import { getHelp } from '@/content/help';

import { HelpPanel } from './help-panel';

/** A round "?" button. Tap it to open the help for the screen named by `helpId`. */
export function HelpButton({ helpId }: { helpId: string }) {
  const [open, setOpen] = useState(false);
  const entry = getHelp(helpId);
  if (!entry) return null;

  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Help"
        onPress={() => setOpen(true)}
        style={({ pressed }) => ({
          width: MinTouchTarget,
          height: MinTouchTarget,
          borderRadius: Radius.pill,
          alignItems: 'center',
          justifyContent: 'center',
          borderWidth: 1,
          borderColor: Colors.glassBorder,
          backgroundColor: pressed ? Colors.backgroundSelected : Colors.glass,
        })}>
        <Text style={{ color: Colors.heading, fontFamily: FontFamily.heading, fontSize: 20 }}>?</Text>
      </Pressable>
      <HelpPanel entry={entry} visible={open} onClose={() => setOpen(false)} />
    </>
  );
}
