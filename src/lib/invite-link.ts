/**
 * Remembering an invite link long enough to use it.
 *
 * Somebody who is invited taps a link before they have a Gyan login. The app sends them to the
 * sign up screen, and the address they arrived at, token and all, is gone. So the token is put
 * away the moment it is seen, and picked up again once they are signed in.
 *
 * It is kept on the device only, next to the consent note, and is thrown away as soon as it has
 * been used, whether joining worked or not. A token that has been spent is of no use to anybody,
 * and one left lying around would try to join again on the next sign in.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY = 'gyan.invite.v1';

/** The token out of a /join?token=... address, if that is what this address is. */
export function tokenFromUrl(url: string | null | undefined): string | undefined {
  if (!url) return undefined;
  const match = /[?&]token=([^&#\s]+)/.exec(url);
  if (!match) return undefined;
  if (!/\/join\b/.test(url)) return undefined;
  try {
    const token = decodeURIComponent(match[1]).trim();
    return token === '' ? undefined : token;
  } catch {
    return undefined;
  }
}

export async function rememberInviteToken(token: string): Promise<void> {
  try {
    await AsyncStorage.setItem(KEY, token);
  } catch {
    // A device that will not remember is not worth failing over. The person can tap the link
    // again once they are signed in, and it will work then.
  }
}

/** Hands back the remembered token AND forgets it, so it is only ever used once. */
export async function takeInviteToken(): Promise<string | undefined> {
  try {
    const token = await AsyncStorage.getItem(KEY);
    if (token) await AsyncStorage.removeItem(KEY);
    return token ?? undefined;
  } catch {
    return undefined;
  }
}

/** Looks at the remembered token without using it up, so a screen can say "you were invited". */
export async function peekInviteToken(): Promise<string | undefined> {
  try {
    return (await AsyncStorage.getItem(KEY)) ?? undefined;
  } catch {
    return undefined;
  }
}
