import { useCallback, useEffect, useState } from 'react';
import { View } from 'react-native';

import { BackLink } from '@/components/ui/back-link';
import { Body } from '@/components/ui/body';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { GlassPanel } from '@/components/ui/glass-panel';
import { Heading } from '@/components/ui/heading';
import { Screen } from '@/components/ui/screen';
import { Skeleton } from '@/components/ui/skeleton';
import { TextField } from '@/components/ui/text-field';
import { Colors, Spacing } from '@/constants/theme';
import { looksLikeEmail } from '@/lib/auth-errors';
import {
  MESSAGES,
  inviteByEmail,
  listTeam,
  makeOwner,
  removeMember,
  revokeInvite,
  seatsFull,
  seatsFullMessage,
  seatsSentence,
  type Member,
  type Team,
} from '@/lib/team';

type Load = { state: 'loading' } | { state: 'error' } | { state: 'ready'; team: Team };
type Asking =
  | { kind: 'remove'; member: Member }
  | { kind: 'makeOwner'; member: Member }
  | { kind: 'revoke'; id: string; email: string };

/**
 * Team: who shares this account.
 *
 * ONLY THE OWNER CAN CHANGE ANYTHING. Everybody else can see who they share an account with,
 * which is the point of the page, and every control says plainly why it will not move. The
 * database refuses a member too, so this is the polite half of the rule, not the whole of it.
 *
 * The seat count comes from the plans table. There is no number for it in this file.
 */
export default function TeamScreen() {
  const [load, setLoad] = useState<Load>({ state: 'loading' });
  const [email, setEmail] = useState('');
  const [inviting, setInviting] = useState(false);
  const [inviteError, setInviteError] = useState<string>();
  const [invited, setInvited] = useState<string>();
  const [asking, setAsking] = useState<Asking>();
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string>();

  const refresh = useCallback(async (quiet = false) => {
    if (!quiet) setLoad({ state: 'loading' });
    try {
      setLoad({ state: 'ready', team: await listTeam() });
    } catch {
      if (!quiet) setLoad({ state: 'error' });
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const team = load.state === 'ready' ? load.team : undefined;
  const isOwner = !!team?.isOwner;
  const full = !!team && seatsFull(team);
  const locked = isOwner ? undefined : MESSAGES.notOwner;

  async function invite() {
    setInvited(undefined);
    if (!looksLikeEmail(email)) {
      setInviteError('That does not look like an email address. Check it and try again.');
      return;
    }
    setInviting(true);
    setInviteError(undefined);
    const result = await inviteByEmail(email.trim());
    setInviting(false);
    if (!result.ok) {
      setInviteError(result.message);
      return;
    }
    setEmail('');
    setInvited(result.email);
    await refresh(true);
  }

  async function doAsked() {
    if (!asking) return;
    setBusy(true);
    setActionError(undefined);
    try {
      if (asking.kind === 'remove') await removeMember(asking.member.userId);
      if (asking.kind === 'makeOwner') await makeOwner(asking.member.userId);
      if (asking.kind === 'revoke') await revokeInvite(asking.id);
      setAsking(undefined);
      await refresh(true);
    } catch (e) {
      setActionError(e instanceof Error ? e.message : MESSAGES.problem);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen>
      <BackLink label="Settings" href="/settings" helpId="settingsTeam" />
      <Heading level={1}>Team</Heading>

      {load.state === 'loading' ? (
        <GlassPanel accessibilityLabel="Loading your team">
          <Skeleton width="40%" height={20} />
          <Skeleton width="70%" />
          <Skeleton width="60%" />
        </GlassPanel>
      ) : null}

      {load.state === 'error' ? (
        <GlassPanel>
          <Heading level={3}>Gyan could not read your team</Heading>
          <Body color="textSecondary">
            This usually means the connection dropped. Nothing has changed.
          </Body>
          <Button label="Try again" variant="secondary" onPress={() => void refresh()} />
        </GlassPanel>
      ) : null}

      {team ? (
        <>
          <GlassPanel strong accessibilityLabel="Seats used">
            <Heading level={2}>{seatsSentence(team)}</Heading>
            <Body small color="textSecondary">
              A seat is taken by somebody on the account, and by an invite that is still waiting.
            </Body>
          </GlassPanel>

          <GlassPanel>
            <Heading level={3}>Invite somebody</Heading>
            {full ? (
              <Body color="danger" accessibilityRole="alert">
                {seatsFullMessage(team)}
              </Body>
            ) : (
              <Body small color="textSecondary">
                They get an email with a link. The link only works for the address you type here.
              </Body>
            )}
            <TextField
              label="Email address"
              value={email}
              onChangeText={(next) => {
                setEmail(next);
                setInviteError(undefined);
                setInvited(undefined);
              }}
              autoCapitalize="none"
              autoComplete="email"
              keyboardType="email-address"
              placeholder="name@company.com"
              disabled={!isOwner || full}
              error={inviteError}
            />
            <Button
              label="Send invite"
              loading={inviting}
              disabled={!isOwner || full || email.trim() === ''}
              onPress={invite}
            />
            {locked ? (
              <Body small color="textSecondary">
                {locked}
              </Body>
            ) : null}
            {invited ? (
              <Body small color="success" accessibilityRole="alert">
                Invite sent to {invited}.
              </Body>
            ) : null}
          </GlassPanel>

          {team.invites.length > 0 ? (
            <GlassPanel>
              <Heading level={3}>Waiting to accept</Heading>
              {team.invites.map((invite) => (
                <View
                  key={invite.id}
                  style={{
                    flexDirection: 'row',
                    flexWrap: 'wrap',
                    alignItems: 'center',
                    gap: Spacing.two,
                    paddingVertical: Spacing.one,
                  }}>
                  <View style={{ flex: 1, minWidth: 180, gap: Spacing.half }}>
                    <Body>{invite.email}</Body>
                    <Body small color="textSecondary">
                      Invited, not joined yet. This is holding a seat.
                    </Body>
                  </View>
                  {isOwner ? (
                    <Button
                      label="Take back"
                      variant="secondary"
                      onPress={() => setAsking({ kind: 'revoke', id: invite.id, email: invite.email })}
                    />
                  ) : null}
                </View>
              ))}
            </GlassPanel>
          ) : null}

          <GlassPanel>
            <Heading level={3}>On this account</Heading>
            {team.members.map((member) => (
              <View
                key={member.userId}
                style={{
                  flexDirection: 'row',
                  flexWrap: 'wrap',
                  alignItems: 'center',
                  gap: Spacing.two,
                  paddingVertical: Spacing.one,
                  borderTopWidth: 1,
                  borderTopColor: Colors.glassBorder,
                }}>
                <View style={{ flex: 1, minWidth: 180, gap: Spacing.half }}>
                  <Body>
                    {member.name}
                    {member.isYou ? ' (you)' : ''}
                  </Body>
                  <Body small color="textSecondary">
                    {member.email}
                  </Body>
                </View>

                <Body small color="textSecondary">
                  {member.role === 'owner' ? 'Owner' : 'Member'}
                </Body>

                {isOwner && member.role === 'member' ? (
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two }}>
                    <Button
                      label="Make owner"
                      variant="secondary"
                      onPress={() => setAsking({ kind: 'makeOwner', member })}
                    />
                    <Button
                      label="Remove"
                      variant="secondary"
                      onPress={() => setAsking({ kind: 'remove', member })}
                    />
                  </View>
                ) : null}
              </View>
            ))}
            {!isOwner ? (
              <Body small color="textSecondary">
                {MESSAGES.notOwner}
              </Body>
            ) : null}
          </GlassPanel>
        </>
      ) : null}

      <ConfirmDialog
        visible={asking?.kind === 'remove'}
        title="Remove this person?"
        message={
          asking?.kind === 'remove'
            ? `${asking.member.name} will lose their way into this account straight away.`
            : ''
        }
        details={[
          'The notes they made stay here, with you.',
          'Their own chats go with them.',
          'They keep their Gyan login, with a workspace of their own.',
          'You can invite them back at any time.',
        ]}
        confirmLabel="Remove them"
        busy={busy}
        error={actionError}
        onConfirm={doAsked}
        onCancel={() => {
          setAsking(undefined);
          setActionError(undefined);
        }}
      />

      <ConfirmDialog
        visible={asking?.kind === 'makeOwner'}
        title="Hand the account over?"
        message={
          asking?.kind === 'makeOwner'
            ? `${asking.member.name} becomes the owner, and you become an ordinary member.`
            : ''
        }
        details={[
          'They can invite and remove people, including you.',
          'They change the plan and the recap settings.',
          'You cannot undo this on your own. They would have to hand it back.',
        ]}
        confirmLabel="Hand it over"
        busy={busy}
        error={actionError}
        onConfirm={doAsked}
        onCancel={() => {
          setAsking(undefined);
          setActionError(undefined);
        }}
      />

      <ConfirmDialog
        visible={asking?.kind === 'revoke'}
        title="Take this invite back?"
        message={
          asking?.kind === 'revoke'
            ? `The link sent to ${asking.email} stops working, and the seat it is holding is free again.`
            : ''
        }
        confirmLabel="Take it back"
        busy={busy}
        error={actionError}
        onConfirm={doAsked}
        onCancel={() => {
          setAsking(undefined);
          setActionError(undefined);
        }}
      />

      <View style={{ height: Spacing.six }} />
    </Screen>
  );
}
