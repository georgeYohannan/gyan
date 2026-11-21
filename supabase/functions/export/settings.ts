// Settings for the export function. Change them here, not inside the code.

/** The private bucket every recording and uploaded file lives in. */
export const STORAGE_BUCKET = 'notes-files';

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

/** Where a finished export is kept, inside the account's own folder. */
export const EXPORT_FOLDER = 'exports';
