import { Redirect } from 'expo-router';

/**
 * The recap settings used to live here, and every recap email already sent has a
 * "Turn off recaps" link pointing at this address. So the address keeps working and sends
 * people to the real page, which is now part of Settings.
 *
 * Do not delete this. It is the only thing standing between an old email and a dead link.
 */
export default function RecapEmailsRedirect() {
  return <Redirect href="/settings/recaps" />;
}
