import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

import { getSupabase } from '@/lib/supabase';

/**
 * The recording-consent note, and the record of who agreed to it.
 *
 * Until now this was remembered only on the device, so clearing site data or moving to a
 * new phone erased the only evidence it had ever been shown. It is written to the database
 * as well now, with WHICH WORDS were agreed to and when -- which is the part that matters if
 * anybody ever asks. The device copy stays, because it is what stops the note appearing
 * again on every launch.
 */

/**
 * The exact words shown. Changing any of them means raising CONSENT_VERSION, which shows the
 * note again to everybody and records a fresh agreement.
 *
 * TODO before public launch: a lawyer must review these words (docs/product-spec.md).
 */
export const CONSENT_LINES = [
  'Gyan can record conversations and turn them into notes.',
  'Always tell everyone that they are being recorded. Some US states need everyone to agree.',
  'Gyan will never join or record a meeting without a notice for the people in it.',
] as const;

/** Raise this whenever CONSENT_LINES changes, so the note is shown and agreed to again. */
export const CONSENT_VERSION = 'v1';

/**
 * A short fingerprint of the exact words, saved next to the agreement.
 *
 * Why bother when the version is already saved: a version number is something a person
 * types, and somebody could change the words and forget to raise it. The fingerprint is
 * worked out from the words themselves, so it cannot disagree with what was shown.
 *
 * It is not a security measure and does not need to be hard to reverse -- the words are not
 * secret, they are printed on the screen. It only has to change when they do.
 */
export function consentFingerprint(lines: readonly string[] = CONSENT_LINES): string {
  const text = lines.join('\n');
  let a = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    a ^= text.charCodeAt(i);
    a = Math.imul(a, 0x01000193) >>> 0;
  }
  return `${CONSENT_VERSION}-${a.toString(16).padStart(8, '0')}-${text.length}`;
}

/** Where this device remembers that the note has been seen. */
export function consentKey(userId: string): string {
  return `gyan.consent.${CONSENT_VERSION}.${userId}`;
}

/** Has this person already agreed, on this device? */
export async function hasAgreedOnThisDevice(userId: string): Promise<boolean> {
  try {
    return (await AsyncStorage.getItem(consentKey(userId))) === 'yes';
  } catch {
    // Storage can be switched off in a private window. Showing the note again is the safe
    // way to be wrong.
    return false;
  }
}

/**
 * Writes down that this person agreed: on the device, and in the database.
 *
 * The database write is allowed to fail quietly. Being unable to reach the server must not
 * stop somebody using the app they have just agreed to use, and agreeing again later simply
 * changes nothing (the database refuses a second row for the same person and version).
 */
export async function recordAgreement(userId: string): Promise<void> {
  try {
    await AsyncStorage.setItem(consentKey(userId), 'yes');
  } catch {
    /* the note appears again next time, which is the safe way to be wrong */
  }
  try {
    await getSupabase().rpc('record_consent', {
      p_version: CONSENT_VERSION,
      p_hash: consentFingerprint(),
      p_platform: Platform.OS,
    });
  } catch {
    /* written on the device either way */
  }
}
