// Settings for the export function. Change them here, not inside the code.

/** The private bucket every recording and uploaded file lives in. Read only, here. */
export const STORAGE_BUCKET = 'notes-files';

/**
 * Where a finished export is WRITTEN. A separate bucket with no rules at all, so nobody
 * can read it through the app -- see 20261121120000_exports_bucket.sql for why.
 */
export const EXPORT_BUCKET = 'account-exports';

/**
 * How much of somebody's recordings can go INSIDE the zip.
 *
 * Not a policy, a limit of where this runs: a Supabase server function has a few hundred
 * megabytes of memory and is stopped after 150 seconds, and the zip is built in memory. A
 * free-plan account can hold five recordings of 50 MB each, which is already more than that.
 *
 * Nothing is left out of the export because of this. Recordings that do not fit are listed
 * in the JSON with a link to download each one, and the export says so in plain words
 * rather than quietly handing somebody less than they asked for.
 */
export const MAX_ZIPPED_BYTES = 60 * 1024 * 1024;

/** How long the link to the finished export works for. */
export const EXPORT_LINK_SECONDS = 60 * 60;

/** How long a link to a single recording that did not fit works for. */
export const FILE_LINK_SECONDS = 24 * 60 * 60;

/**
 * Where a finished export is kept.
 *
 * NOT inside the account's own folder, and that matters. The storage rule lets any member
 * of an account read ANY file whose first part is that account's id -- which is right for
 * recordings, because notes are shared with the whole account. An export is not: it also
 * holds the person's own profile row and their own entries in the record of what happened,
 * and that record is owner-only by rule. A teammate could have opened the owner's export
 * and read the owner's history out of it.
 *
 * Putting exports under a first part that is not an account id means the rule matches
 * nothing, so NOBODY can read them through the app. The server writes them with the service
 * key and hands back a link that works for an hour, which is the only way in.
 */
export const EXPORT_FOLDER = 'exports';

