import { useEffect, useRef } from 'react';
import { AppState, Platform } from 'react-native';

/**
 * Signs somebody out after a while of doing nothing.
 *
 * WHY THIS IS IN THE APP AND NOT A SETTING. Supabase can do this itself, but only on its
 * paid plans (checked in its current docs). Gyan is on the free plan, so the timer lives
 * here. That means it is a courtesy rather than a wall: somebody holding a stolen token
 * could still use it until it expires, because nothing in the browser can stop that. What it
 * really protects against is the ordinary case -- a laptop left open in a cafe, a shared
 * desk, a phone handed to somebody else.
 *
 * WHAT COUNTS AS DOING SOMETHING. Any touch, any key, any mouse move, any scroll, and coming
 * back to the app from somewhere else. Also anything the app itself says is still going on,
 * through `busy` -- an upload in progress, say. Being thrown out in the middle of uploading
 * an hour-long recording would be a worse failure than the one this prevents.
 */
/**
 * The last time anything happened. Kept outside React on purpose, so code that is nowhere
 * near a screen -- the uploader, for instance -- can say "still going" without a prop being
 * threaded through three layouts to reach it.
 */
let lastActivity = Date.now();

/**
 * Says that something is still happening.
 *
 * Called by the uploader as a file goes up. A 50 MB recording on a slow connection can take
 * longer than the whole timeout with nobody touching the screen, and being signed out in the
 * middle of it would be a worse failure than the one this whole feature prevents.
 */
export function markActivity(): void {
  lastActivity = Date.now();
}

/** When something last happened. For tests and for the check below. */
export function lastActivityAt(): number {
  return lastActivity;
}

/**
 * The actual decision, with no React and no timers in it: given when something last
 * happened, what the time is now, and how long is allowed, is it time to sign out?
 *
 * Pulled out on purpose. The rule is the part worth being sure about, and testing it
 * through a React effect means fighting with when effects run and are cleaned up rather
 * than checking the thing that matters.
 */
export function timeToSignOut(options: {
  lastActivity: number;
  now: number;
  waitMs: number;
  busy?: boolean;
}): boolean {
  const { lastActivity: last, now, waitMs, busy = false } = options;
  // Something is going on that must not be interrupted.
  if (busy) return false;
  // The clock, not the timer. A timer does not run while a laptop is asleep, so closing a
  // lid for two hours and opening it again has to count as two hours of doing nothing.
  return now - last >= waitMs;
}

export function useInactivitySignOut(options: {
  /** Null when nobody is signed in, which switches the whole thing off. */
  minutes: number | null;
  /** True while something is going on that must not be interrupted. */
  busy?: boolean;
  onTimeout: () => void;
}) {
  const { minutes, busy = false, onTimeout } = options;
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onTimeoutRef = useRef(onTimeout);
  onTimeoutRef.current = onTimeout;

  useEffect(() => {
    if (minutes === null || minutes <= 0) return;

    const wait = minutes * 60 * 1000;
    let stopped = false;

    const clear = () => {
      if (timer.current) clearTimeout(timer.current);
      timer.current = null;
    };

    const restart = () => {
      if (stopped) return;
      clear();
      markActivity();
      timer.current = setTimeout(check, wait);
    };

    /**
     * Fires when the timer runs out, and decides whether it is really time.
     *
     * It checks the clock rather than trusting the timer, because something may have said
     * "still going" from outside React since the timer was set. It also covers a laptop that
     * was asleep: a timer does not run while the machine is, so the clock is the truth.
     */
    const check = () => {
      if (stopped) return;
      if (busy) {
        timer.current = setTimeout(check, 30 * 1000);
        return;
      }
      if (timeToSignOut({ lastActivity, now: Date.now(), waitMs: wait })) {
        onTimeoutRef.current();
        return;
      }
      // Something happened after the timer was set. Wait out the rest of it.
      timer.current = setTimeout(check, Math.max(1000, wait - (Date.now() - lastActivity)));
    };

    restart();

    // Coming back to the app counts as doing something. Going away does NOT stop the clock:
    // a phone in a pocket for an hour is exactly when this should fire.
    const appState = AppState.addEventListener('change', (next) => {
      if (next === 'active') restart();
    });

    const webEvents: (keyof WindowEventMap)[] = [
      'pointerdown', 'keydown', 'wheel', 'scroll', 'touchstart', 'focus',
    ];
    const onWeb = Platform.OS === 'web' && typeof window !== 'undefined';
    if (onWeb) {
      for (const name of webEvents) {
        window.addEventListener(name, restart, { passive: true });
      }
      // Coming back to the tab. This one belongs to the document rather than the window.
      document.addEventListener('visibilitychange', restart);
    }

    return () => {
      stopped = true;
      clear();
      appState.remove();
      if (onWeb) {
        for (const name of webEvents) window.removeEventListener(name, restart);
        document.removeEventListener('visibilitychange', restart);
      }
    };
  }, [minutes, busy]);
}
