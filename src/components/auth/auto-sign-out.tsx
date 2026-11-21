import { router } from 'expo-router';
import { useEffect, useState } from 'react';

import { useInactivitySignOut } from '@/hooks/use-inactivity-signout';
import { useAuth } from '@/lib/auth';
import { getSecuritySettings } from '@/lib/security';

/**
 * Signs somebody out after a while of doing nothing.
 *
 * It draws nothing. It sits inside the signed-in part of the app, reads how long this
 * account allows, and watches. The number comes from the database (the account's own
 * setting, or the 30 minutes in security_settings), never from this file.
 *
 * Why it is a component rather than a line in the layout: it needs to fetch the setting,
 * and that means state and an effect. Keeping it on its own means the layout stays readable
 * and the fetch happens once per sign in rather than on every render of the tabs.
 */
export function AutoSignOut() {
  const { session, signOut } = useAuth();
  const [minutes, setMinutes] = useState<number | null>(null);

  useEffect(() => {
    if (!session) {
      setMinutes(null);
      return;
    }
    let cancelled = false;
    getSecuritySettings()
      .then((settings) => !cancelled && setMinutes(settings.inactivityMinutes))
      // A problem reading the setting must not leave somebody signed in for ever, so this
      // falls back to the same 30 minutes the database starts from.
      .catch(() => !cancelled && setMinutes(30));
    return () => {
      cancelled = true;
    };
  }, [session]);

  useInactivitySignOut({
    minutes: session ? minutes : null,
    onTimeout: () => {
      void signOut().then(() => {
        // Say why, rather than dumping somebody on the sign in screen with no explanation.
        router.replace('/log-in?signedOut=time');
      });
    },
  });

  return null;
}
