import { useState } from 'react';
import { View } from 'react-native';

import { LanguagePicker } from '@/components/notes/language-picker';
import { BackLink } from '@/components/ui/back-link';
import { Body } from '@/components/ui/body';
import { Button } from '@/components/ui/button';
import { GlassPanel } from '@/components/ui/glass-panel';
import { Heading } from '@/components/ui/heading';
import { Screen } from '@/components/ui/screen';
import { SettingRow } from '@/components/ui/setting-row';
import { TextField } from '@/components/ui/text-field';
import { languageName } from '@/constants/languages';
import { Spacing } from '@/constants/theme';
import { useAuth } from '@/lib/auth';
import { MIN_PASSWORD_LENGTH } from '@/lib/auth-errors';
import { MAX_NAME_LENGTH, useProfile } from '@/lib/profile';

/**
 * Profile: the things that are yours rather than the account's.
 *
 * A person can only ever change their own. There is no id anywhere on this page: everything
 * here acts on whoever is signed in, which is what makes that true rather than just intended.
 */
export default function ProfileScreen() {
  const { session, changePassword } = useAuth();
  const { displayName, languageCode, setDisplayName, setLanguage } = useProfile();

  const [name, setName] = useState(displayName);
  const [nameSaving, setNameSaving] = useState(false);
  const [nameSaved, setNameSaved] = useState(false);
  const [nameError, setNameError] = useState<string>();

  const [languageOpen, setLanguageOpen] = useState(false);
  const [languageError, setLanguageError] = useState<string>();

  const [current, setCurrent] = useState('');
  const [password, setPassword] = useState('');
  const [again, setAgain] = useState('');
  const [passwordSaving, setPasswordSaving] = useState(false);
  const [passwordSaved, setPasswordSaved] = useState(false);
  const [passwordError, setPasswordError] = useState<string>();

  const email = session?.user.email ?? '';

  async function saveName() {
    setNameSaving(true);
    setNameError(undefined);
    setNameSaved(false);
    const result = await setDisplayName(name);
    setNameSaving(false);
    if (result.error) setNameError(result.error);
    else setNameSaved(true);
  }

  async function savePassword() {
    setPasswordSaved(false);
    if (current.trim() === '') {
      setPasswordError('Type your current password first.');
      return;
    }
    if (password.length < MIN_PASSWORD_LENGTH) {
      setPasswordError(`Use at least ${MIN_PASSWORD_LENGTH} characters.`);
      return;
    }
    if (password !== again) {
      setPasswordError('Those two passwords are not the same. Check them and try again.');
      return;
    }
    setPasswordSaving(true);
    setPasswordError(undefined);
    const result = await changePassword(password, current);
    setPasswordSaving(false);
    if (result.error) {
      setPasswordError(result.error);
      return;
    }
    // Clear every box, so no password is left sitting on screen.
    setCurrent('');
    setPassword('');
    setAgain('');
    setPasswordSaved(true);
  }

  return (
    <Screen>
      <BackLink label="Settings" href="/settings" helpId="settingsProfile" />
      <Heading level={1}>Profile</Heading>

      <GlassPanel>
        <Heading level={3}>Your name</Heading>
        <Body small color="textSecondary">
          This is what your team sees next to the notes you make.
        </Body>
        <TextField
          label="Name"
          value={name}
          onChangeText={(next) => {
            setName(next);
            setNameSaved(false);
          }}
          maxLength={MAX_NAME_LENGTH}
          autoCapitalize="words"
          placeholder="Your name"
          error={nameError}
        />
        <Button
          label="Save name"
          variant="secondary"
          loading={nameSaving}
          disabled={name.trim() === displayName.trim()}
          onPress={saveName}
        />
        {nameSaved && !nameError ? (
          <Body small color="success" accessibilityRole="alert">
            Saved
          </Body>
        ) : null}
      </GlassPanel>

      <GlassPanel>
        <Heading level={3}>Email</Heading>
        <SettingRow
          value={email}
          note="This is how you sign in. Ask us if you need to change it."
        />
      </GlassPanel>

      <GlassPanel>
        <Heading level={3}>Language</Heading>
        <SettingRow
          value={languageName(languageCode)}
          note="Gyan writes your summaries, your to-dos and its chat answers in this language."
          action={
            <Button label="Change language" variant="secondary" onPress={() => setLanguageOpen(true)} />
          }
          error={languageError}
        />
        <Body small color="textSecondary">
          You can also change this from any note, without coming here.
        </Body>
      </GlassPanel>

      <GlassPanel>
        <Heading level={3}>Password</Heading>
        <Body small color="textSecondary">
          Type the password you use now, then pick a new one and type it twice. You stay
          signed in on this device.
        </Body>
        {/*
          ASKING FOR THE CURRENT PASSWORD IS THE POINT OF THIS BOX.
          It used to be enough to be signed in. That turned an unattended laptop, or a
          stolen session, straight into a full account takeover: whoever had it could set a
          new password and lock the real person out of their own meetings.
        */}
        <TextField
          label="Your current password"
          value={current}
          onChangeText={(next) => {
            setCurrent(next);
            setPasswordError(undefined);
            setPasswordSaved(false);
          }}
          secureTextEntry
          autoComplete="current-password"
          textContentType="password"
          placeholder="The one you use now"
        />
        <TextField
          label="New password"
          value={password}
          onChangeText={(next) => {
            setPassword(next);
            setPasswordSaved(false);
          }}
          secureTextEntry
          autoCapitalize="none"
          autoComplete="new-password"
          textContentType="newPassword"
        />
        <TextField
          label="New password again"
          value={again}
          onChangeText={(next) => {
            setAgain(next);
            setPasswordSaved(false);
          }}
          secureTextEntry
          autoCapitalize="none"
          autoComplete="new-password"
          textContentType="newPassword"
          error={passwordError}
        />
        <Button
          label="Change password"
          variant="secondary"
          loading={passwordSaving}
          disabled={password === '' || again === ''}
          onPress={savePassword}
        />
        {passwordSaved && !passwordError ? (
          <Body small color="success" accessibilityRole="alert">
            Your password is changed.
          </Body>
        ) : null}
      </GlassPanel>

      <LanguagePicker
        title="Your language"
        hint="Gyan writes your summaries, your to-dos and its chat answers in this language."
        selected={languageCode}
        visible={languageOpen}
        helpId="translation"
        onClose={() => setLanguageOpen(false)}
        onPick={async (code) => {
          setLanguageOpen(false);
          setLanguageError(undefined);
          const result = await setLanguage(code);
          if (result.error) setLanguageError(result.error);
        }}
      />

      <View style={{ height: Spacing.six }} />
    </Screen>
  );
}
