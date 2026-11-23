import { useCallback, useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';

import { QrCode } from '@/components/auth/qr-code';
import { BackLink } from '@/components/ui/back-link';
import { Body } from '@/components/ui/body';
import { Button } from '@/components/ui/button';
import { GlassPanel } from '@/components/ui/glass-panel';
import { Heading } from '@/components/ui/heading';
import { Screen } from '@/components/ui/screen';
import { SettingRow } from '@/components/ui/setting-row';
import { Skeleton } from '@/components/ui/skeleton';
import { TextField } from '@/components/ui/text-field';
import { Colors, Radius, Spacing } from '@/constants/theme';
import { listAudit, sentenceFor, timeAgo, type AuditEntry } from '@/lib/audit';
import { useAuth } from '@/lib/auth';
import { copyText } from '@/lib/clipboard';
import {
  confirmTwoFactor,
  getSecuritySettings,
  getTwoFactor,
  saveSecuritySettings,
  startTwoFactor,
  stopTwoFactor,
  type SecuritySettings,
  type TwoFactor,
  type TwoFactorSetup,
} from '@/lib/security';

/** The sign-out times on offer. Short enough to be useful, long enough not to annoy. */
const SIGN_OUT_CHOICES = [15, 30, 60, 120] as const;

function signOutLabel(minutes: number): string {
  if (minutes < 60) return `${minutes} minutes`;
  const hours = minutes / 60;
  return hours === 1 ? '1 hour' : `${hours} hours`;
}

/**
 * One option in a short list of them.
 *
 * The chosen one is outlined in brand blue and a press is only a fill, which is the rule
 * settled in the prompt 8 design pass: otherwise the option you are on and the row under
 * your finger look identical.
 */
function Choice({
  label,
  chosen,
  disabled,
  onPress,
}: {
  label: string;
  chosen: boolean;
  disabled?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      role="radio"
      aria-checked={chosen}
      accessibilityRole="radio"
      accessibilityState={{ selected: chosen, checked: chosen, disabled: !!disabled }}
      style={({ pressed }) => ({
        paddingVertical: Spacing.two,
        paddingHorizontal: Spacing.three,
        borderRadius: Radius.pill,
        borderWidth: 1,
        borderColor: chosen ? Colors.brand : Colors.glassBorder,
        backgroundColor: pressed ? Colors.glass : 'transparent',
        opacity: disabled ? 0.5 : 1,
      })}
    >
      <Body small color={chosen ? 'text' : 'textSecondary'}>
        {label}
      </Body>
    </Pressable>
  );
}

export default function SecurityScreen() {
  const { session } = useAuth();
  const myUserId = session?.user.id;

  const [settings, setSettings] = useState<SecuritySettings | null>(null);
  const [twoFactor, setTwoFactor] = useState<TwoFactor | null>(null);
  const [loadError, setLoadError] = useState<string | undefined>();

  // Turning two-factor on, step by step.
  const [setup, setSetup] = useState<TwoFactorSetup | null>(null);
  const [code, setCode] = useState('');
  const [twoFactorBusy, setTwoFactorBusy] = useState(false);
  const [twoFactorError, setTwoFactorError] = useState<string | undefined>();
  const [secretCopied, setSecretCopied] = useState(false);

  const [signOutBusy, setSignOutBusy] = useState(false);
  const [signOutError, setSignOutError] = useState<string | undefined>();

  const [log, setLog] = useState<AuditEntry[] | null>(null);
  const [logError, setLogError] = useState<string | undefined>();
  const [logMore, setLogMore] = useState(false);
  const [logBusy, setLogBusy] = useState(false);

  const loadLog = useCallback(
    async (before?: string) => {
      setLogBusy(true);
      const { entries, error } = await listAudit({ before, myUserId });
      setLogBusy(false);
      if (error) {
        setLogError(error);
        return;
      }
      setLogError(undefined);
      setLog((already) => (before && already ? [...already, ...(entries ?? [])] : (entries ?? [])));
      setLogMore((entries ?? []).length > 0 && (entries ?? []).length % 25 === 0);
    },
    [myUserId],
  );

  const refresh = useCallback(async () => {
    const [nextSettings, nextTwoFactor] = await Promise.all([
      getSecuritySettings().catch(() => null),
      getTwoFactor().catch(() => null),
    ]);
    if (!nextSettings) {
      setLoadError('Gyan could not read your security settings. Please try again.');
      return;
    }
    setLoadError(undefined);
    setSettings(nextSettings);
    setTwoFactor(nextTwoFactor ?? { on: false, unfinished: [] });
    if (nextSettings.isOwner) await loadLog();
  }, [loadLog]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const beginTwoFactor = async () => {
    setTwoFactorBusy(true);
    setTwoFactorError(undefined);
    const { setup: next, error } = await startTwoFactor();
    setTwoFactorBusy(false);
    if (error || !next) {
      setTwoFactorError(error);
      return;
    }
    setSetup(next);
    setCode('');
  };

  const finishTwoFactor = async () => {
    if (!setup) return;
    setTwoFactorBusy(true);
    setTwoFactorError(undefined);
    const { error } = await confirmTwoFactor(setup.factorId, code);
    setTwoFactorBusy(false);
    if (error) {
      setTwoFactorError(error);
      return;
    }
    setSetup(null);
    setCode('');
    await refresh();
  };

  const turnOffTwoFactor = async () => {
    if (!twoFactor?.factorId) return;
    setTwoFactorBusy(true);
    setTwoFactorError(undefined);
    const { error } = await stopTwoFactor(twoFactor.factorId);
    setTwoFactorBusy(false);
    if (error) {
      setTwoFactorError(error);
      return;
    }
    await refresh();
  };

  const chooseSignOut = async (minutes: number) => {
    if (!settings) return;
    setSignOutBusy(true);
    setSignOutError(undefined);
    const { error } = await saveSecuritySettings({ inactivityMinutes: minutes });
    setSignOutBusy(false);
    if (error) {
      setSignOutError(error);
      return;
    }
    setSettings({ ...settings, inactivityMinutes: minutes });
  };

  return (
    <Screen>
      <BackLink label="Settings" href="/settings" helpId="settingsSecurity" />
      <Heading level={1}>Security</Heading>

      {!settings && !loadError ? (
        <GlassPanel accessibilityLabel="Loading your security settings">
          <Skeleton width="60%" />
          <Skeleton width="80%" />
          <Skeleton width="40%" />
        </GlassPanel>
      ) : null}

      {loadError ? (
        <GlassPanel>
          <Body color="danger" accessibilityRole="alert">
            {loadError}
          </Body>
          <Button label="Try again" variant="secondary" onPress={() => void refresh()} />
        </GlassPanel>
      ) : null}

      {settings ? (
        <>
          {/* ------------------------------------------------------------- */}
          {/* Two-factor sign in                                            */}
          {/* ------------------------------------------------------------- */}
          <GlassPanel>
            <Heading level={3}>Two-factor sign in</Heading>

            {setup ? (
              <>
                <Body small color="textSecondary">
                  Open your authenticator app, add an account, and scan this.
                </Body>
                <View style={{ alignItems: 'center', paddingVertical: Spacing.three }}>
                  <View style={{ backgroundColor: '#FFFFFF', padding: Spacing.three, borderRadius: Radius.panel }}>
                    <QrCode
                      uri={setup.qrImage}
                      size={180}
                      label="A square code to scan with your authenticator app"
                    />
                  </View>
                </View>
                <Body small color="textSecondary">
                  No camera, or cannot scan it? Type this into the app by hand instead.
                </Body>
                <SettingRow
                  value={setup.secret}
                  note="This is the same code as the picture. Keep it to yourself."
                  action={
                    <Button
                      label={secretCopied ? 'Copied' : 'Copy'}
                      variant="secondary"
                      onPress={async () => {
                        await copyText(setup.secret);
                        setSecretCopied(true);
                      }}
                    />
                  }
                />
                <TextField
                  label="The 6-digit code from your app"
                  value={code}
                  onChangeText={(next) => {
                    setCode(next.replace(/\D/g, '').slice(0, 6));
                    setTwoFactorError(undefined);
                  }}
                  keyboardType="number-pad"
                  autoComplete="one-time-code"
                  textContentType="oneTimeCode"
                  maxLength={6}
                  placeholder="123456"
                  error={twoFactorError}
                />
                <Button
                  label="Confirm and turn on"
                  loading={twoFactorBusy}
                  disabled={code.length !== 6}
                  onPress={() => void finishTwoFactor()}
                />
                <Button
                  label="Cancel"
                  variant="secondary"
                  onPress={() => {
                    setSetup(null);
                    setCode('');
                    setTwoFactorError(undefined);
                  }}
                />
              </>
            ) : (
              <SettingRow
                value={twoFactor?.on ? 'On' : 'Off'}
                note={
                  twoFactor?.on
                    ? 'Signing in needs a 6-digit code from your authenticator app, as well as your password.'
                    : 'Add a 6-digit code from an app on your phone, so a stolen password is not enough on its own.'
                }
                action={
                  twoFactor?.on ? (
                    <Button
                      label="Turn off"
                      variant="secondary"
                      loading={twoFactorBusy}
                      onPress={() => void turnOffTwoFactor()}
                    />
                  ) : (
                    <Button label="Turn on two-factor" loading={twoFactorBusy} onPress={() => void beginTwoFactor()} />
                  )
                }
                error={twoFactorError}
              />
            )}
          </GlassPanel>

          {/* ------------------------------------------------------------- */}
          {/* Automatic sign out                                            */}
          {/* ------------------------------------------------------------- */}
          <GlassPanel>
            <Heading level={3}>Automatic sign out</Heading>
            <SettingRow
              value={`After ${signOutLabel(settings.inactivityMinutes)}`}
              note="Gyan signs you out if you walk away. Reading, typing and uploading all count as using it, so this only happens when the app is really left alone."
              error={signOutError}
            />
            {settings.isOwner ? (
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two }}>
                {SIGN_OUT_CHOICES.map((minutes) => (
                  <Choice
                    key={minutes}
                    label={signOutLabel(minutes)}
                    chosen={settings.inactivityMinutes === minutes}
                    disabled={signOutBusy}
                    onPress={() => void chooseSignOut(minutes)}
                  />
                ))}
              </View>
            ) : (
              <Body small color="textSecondary">
                Only the account owner can change this.
              </Body>
            )}
          </GlassPanel>

          {/* ------------------------------------------------------------- */}
          {/* The record                                                    */}
          {/* ------------------------------------------------------------- */}
          <GlassPanel>
            <Heading level={3}>What has happened</Heading>

            {!settings.isOwner ? (
              <Body small color="textSecondary">
                Only the account owner can see the record of what has happened on this account.
              </Body>
            ) : logError ? (
              <>
                <Body color="danger" accessibilityRole="alert">
                  {logError}
                </Body>
                <Button label="Try again" variant="secondary" onPress={() => void loadLog()} />
              </>
            ) : log === null ? (
              <Skeleton width="70%" />
            ) : log.length === 0 ? (
              <Body small color="textSecondary">
                Nothing yet. Signing in, opening and deleting notes, and changes to the team or these settings will all show up here.
              </Body>
            ) : (
              <>
                <Body small color="textSecondary">
                  Newest first. This record cannot be changed or deleted by anybody, including Gyan.
                </Body>
                {log.map((entry) => (
                  <View
                    key={entry.id}
                    style={{
                      paddingVertical: Spacing.two,
                      borderTopWidth: 1,
                      borderTopColor: Colors.glassBorder,
                      gap: 2,
                    }}
                  >
                    <Body>{sentenceFor(entry)}</Body>
                    <Body small color="textSecondary">
                      {entry.noteTitle ? `${entry.noteTitle}, ${timeAgo(entry.at)}` : timeAgo(entry.at)}
                    </Body>
                  </View>
                ))}
                {logMore ? (
                  <Button
                    label="Show older"
                    variant="secondary"
                    loading={logBusy}
                    onPress={() => void loadLog(log[log.length - 1]?.at)}
                  />
                ) : null}
              </>
            )}
          </GlassPanel>
        </>
      ) : null}

      <View style={{ height: Spacing.six }} />
    </Screen>
  );
}
