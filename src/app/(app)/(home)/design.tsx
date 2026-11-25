import { View } from 'react-native';

import { HelpButton } from '@/components/help/help-button';
import { Body } from '@/components/ui/body';
import { Button } from '@/components/ui/button';
import { GlassPanel } from '@/components/ui/glass-panel';
import { Heading } from '@/components/ui/heading';
import { Screen } from '@/components/ui/screen';
import { Skeleton } from '@/components/ui/skeleton';
import { STATUSES, StatusBadge } from '@/components/ui/status-badge';
import { TextField } from '@/components/ui/text-field';
import { Spacing } from '@/constants/theme';

/** Builders only: shows every design piece in every state. Not a real app screen. */
export default function DesignScreen() {
  return (
    <Screen>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Spacing.three }}>
        <View style={{ flex: 1 }}>
          <Heading level={1}>Design</Heading>
        </View>
        <HelpButton helpId="design" />
      </View>
      <Body color="textSecondary">Every piece of the Gyan look, in every state. Fake data only.</Body>

      <GlassPanel>
        <Heading level={3}>Text</Heading>
        <Heading level={2}>Heading in Schibsted Grotesk</Heading>
        <Body>Body text in IBM Plex Sans. It is easy to read on dark navy.</Body>
        <Body color="textSecondary">Quiet body text for hints.</Body>
        <Body color="link">A light blue link</Body>
      </GlassPanel>

      <GlassPanel>
        <Heading level={3}>Buttons</Heading>
        <Body small color="textSecondary">Default (the one glowing focal point)</Body>
        <Button label="Primary" />
        <Button label="Secondary" variant="secondary" />
        <Button label="Record" variant="record" />
        <Body small color="textSecondary">Pressed</Body>
        <Button label="Primary pressed" glow={false} forcePressed />
        <Button label="Secondary pressed" variant="secondary" forcePressed />
        <Button label="Record pressed" variant="record" forcePressed />
        <Body small color="textSecondary">Disabled</Body>
        <Button label="Primary disabled" disabled />
        <Button label="Secondary disabled" variant="secondary" disabled />
        <Button label="Record disabled" variant="record" disabled />
        <Body small color="textSecondary">Loading</Body>
        <Button label="Saving" loading />
        <Button label="Saving" variant="secondary" loading />
        <Body small color="textSecondary">Error</Body>
        <Body color="danger">Could not save. Check your internet and try again.</Body>
        <Button label="Try again" variant="secondary" />
      </GlassPanel>

      <GlassPanel>
        <Heading level={3}>Text fields</Heading>
        <TextField label="Default" placeholder="Type here" />
        <TextField label="Disabled" placeholder="You cannot type here" disabled />
        <TextField label="Error" defaultValue="not-an-email" error="That does not look like an email address." />
      </GlassPanel>

      <GlassPanel>
        <Heading level={3}>Status badges</Heading>
        <View style={{ gap: Spacing.two }}>
          {STATUSES.map((s) => (
            <StatusBadge key={s} status={s} />
          ))}
        </View>
      </GlassPanel>

      <GlassPanel>
        <Heading level={3}>Loading skeleton</Heading>
        <Skeleton height={20} width="60%" />
        <Skeleton />
        <Skeleton width="85%" />
      </GlassPanel>
    </Screen>
  );
}
