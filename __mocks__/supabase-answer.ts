/**
 * An answer shaped like a real Supabase call, for tests that stand in for the database.
 *
 * WHY THIS EXISTS, and why it is not just `Promise.resolve(...)`:
 *
 * A Supabase call looks like a promise but is not one. It is a builder object with a `then`
 * method and nothing else, so `await` works on it while `.catch(...)` and `.finally(...)` throw
 * "catch is not a function" the moment they run.
 *
 * Standing in for the database with a real promise hides that difference, and on 2026-11-20 it
 * hid it in the worst way: the invite pipeline called `.catch(() => undefined)` on a tidying-up
 * call, every test passed, and the first real invite sent its email and THEN crashed on the way
 * out, telling the founder "Gyan could not send that invite" about an email that had already
 * arrived.
 *
 * So a stand-in has to be as unhelpful as the real thing. This is.
 */
export function answer<T>(value: T): PromiseLike<T> {
  return {
    then(resolve, reject) {
      return Promise.resolve(value).then(resolve, reject);
    },
  };
}
