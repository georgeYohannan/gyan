import { View } from 'react-native';

import { HelpButton } from '@/components/help/help-button';
import { Body } from '@/components/ui/body';
import { Heading } from '@/components/ui/heading';
import { Spacing } from '@/constants/theme';

type PageHeaderProps = {
  /** The screen's name, said the way somebody would say it out loud. */
  title: string;
  /** One plain line about what this screen is for. Left off where the title says it all. */
  lead?: string;
  /** Which help entry the round "?" opens. Left off on a screen with no help entry. */
  helpId?: string;
  /** Set on the one screen whose own title is its focal point. */
  display?: boolean;
};

/**
 * The top of a screen: its name, what it is for, and the way to the help.
 *
 * This was the same eight lines of row-and-flex copied into five screens, and they had
 * already drifted: some put a line under the title, some did not, and the help button sat
 * at a different height on each. One piece means a change lands on every screen at once.
 *
 * The title and its line are ONE child of `Screen`, so they sit 8 points apart rather than
 * the 24 that `Screen` puts between the things on a page. They are one thought.
 */
export function PageHeader({ title, lead, helpId, display }: PageHeaderProps) {
  return (
    <View style={{ gap: Spacing.two }}>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          gap: Spacing.three,
        }}>
        <View style={{ flex: 1 }}>
          <Heading level={1} display={display}>
            {title}
          </Heading>
        </View>
        {helpId ? <HelpButton helpId={helpId} /> : null}
      </View>
      {lead ? <Body color="textSecondary">{lead}</Body> : null}
    </View>
  );
}
