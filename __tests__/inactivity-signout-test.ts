/**
 * The automatic sign out.
 *
 * Supabase can do this itself, but only on its paid plans, so the timer lives in the app.
 * That makes it a courtesy rather than a wall -- somebody holding a stolen token could keep
 * using it, because nothing in a browser can stop that. What it really protects against is
 * the ordinary case: a laptop left open in a cafe, a shared desk, a phone handed over.
 *
 * The RULE is tested here rather than the React plumbing around it. Driving effects and
 * fake timers together mostly tests when React runs things, which is not the part that
 * would ever be wrong.
 */
import { lastActivityAt, markActivity, timeToSignOut } from '@/hooks/use-inactivity-signout';

const MINUTES = 60 * 1000;
const at = (minutesFromNow: number) => Date.UTC(2026, 10, 21, 10, 0, 0) + minutesFromNow * MINUTES;

describe('when it is time to sign somebody out', () => {
  const waitMs = 30 * MINUTES;

  test('NOT before the time is up', () => {
    expect(timeToSignOut({ lastActivity: at(0), now: at(29), waitMs })).toBe(false);
  });

  test('YES once it is', () => {
    expect(timeToSignOut({ lastActivity: at(0), now: at(30), waitMs })).toBe(true);
    expect(timeToSignOut({ lastActivity: at(0), now: at(31), waitMs })).toBe(true);
  });

  test('something happening puts the clock back to zero', () => {
    // Doing something at minute 29 buys another 30 minutes from then.
    expect(timeToSignOut({ lastActivity: at(29), now: at(31), waitMs })).toBe(false);
    expect(timeToSignOut({ lastActivity: at(29), now: at(59), waitMs })).toBe(true);
  });

  test('AN UPLOAD IS NEVER CUT OFF', () => {
    // A 50 MB recording on a slow connection can take longer than the whole timeout with
    // nobody touching the screen. Being signed out in the middle of it would be a worse
    // failure than the one this prevents.
    expect(timeToSignOut({ lastActivity: at(0), now: at(120), waitMs, busy: true })).toBe(false);
    // And the moment it finishes, the ordinary rule applies again.
    expect(timeToSignOut({ lastActivity: at(0), now: at(120), waitMs, busy: false })).toBe(true);
  });

  test('IT USES THE CLOCK, so a sleeping laptop still counts', () => {
    // A timer does not run while a machine is asleep. Closing a lid for two hours and
    // opening it again has to count as two hours of doing nothing, and it does, because
    // this compares times rather than counting ticks.
    expect(timeToSignOut({ lastActivity: at(0), now: at(180), waitMs })).toBe(true);
  });

  test('a longer setting really is longer', () => {
    const twoHours = 120 * MINUTES;
    expect(timeToSignOut({ lastActivity: at(0), now: at(60), waitMs: twoHours })).toBe(false);
    expect(timeToSignOut({ lastActivity: at(0), now: at(121), waitMs: twoHours })).toBe(true);
  });

  test('a clock that goes backwards does not sign anybody out', () => {
    // Clocks do move backwards: daylight saving, a correction from the network.
    expect(timeToSignOut({ lastActivity: at(10), now: at(0), waitMs })).toBe(false);
  });
});

describe('saying that something is still happening', () => {
  test('the uploader can reach it without a prop threaded through three layouts', () => {
    const before = lastActivityAt();
    markActivity();
    expect(lastActivityAt()).toBeGreaterThanOrEqual(before);
    // And it is a real time, not a counter.
    expect(Math.abs(lastActivityAt() - Date.now())).toBeLessThan(1000);
  });

  test('the uploader really calls it', () => {
    // The beacon is no use if nothing uses it. This is the one caller that matters: a slow
    // upload with nobody touching the screen.
    const fs = require('fs') as typeof import('fs');
    const path = require('path') as typeof import('path');
    const upload = fs.readFileSync(path.join(__dirname, '..', 'src/lib/upload.ts'), 'utf8');
    expect(upload).toContain('markActivity()');
    expect(upload).toMatch(/onprogress[\s\S]{0,400}markActivity\(\)/);
  });
});
