// Checking that a stored file really is where it claims to be.
//
// WHY THIS EXISTS. `meetings.file_path` is written by the APP, and three server functions
// hand it to storage using the SERVICE KEY, which skips every rule. So the one thing that
// keeps those reads inside an account is that the path really starts with that account's id.
//
// A prefix check alone is not enough, and this is not theoretical:
//
//   "<account>/<note>/../../<other account>/<their note>/recording.m4a"
//
// starts with the right prefix, and the "../.." is removed later by the thing that turns a
// path into a web address -- the parser every browser and server uses collapses those
// segments before the request is sent. The storage service never sees them. It is handed a
// perfectly ordinary key belonging to somebody else, and the service key lets it through.
//
// So the segments have to be checked, not just the start of the string.

/**
 * Is this path really inside this account's folder?
 *
 * Refuses anything with a `..` or `.` segment, a leading slash, a backslash, an empty
 * segment or a null byte -- all of which can change what a path means once it is turned
 * into a web address.
 */
export function isPathInsideAccount(path: string, accountId: string): boolean {
  if (typeof path !== 'string' || path === '') return false;
  if (typeof accountId !== 'string' || accountId === '') return false;
  // A backslash is a separator on some systems and a plain character on others. Nothing
  // Gyan writes ever contains one, so anything that does is suspect.
  if (path.includes('\\') || path.includes('\u0000')) return false;
  if (path.startsWith('/')) return false;

  const segments = path.split('/');
  if (segments.length < 2) return false;
  for (const segment of segments) {
    if (segment === '' || segment === '.' || segment === '..') return false;
  }
  return segments[0] === accountId;
}

/** Plain words for a file whose path does not belong to this account. */
export const WRONG_PLACE_MESSAGE =
  'Gyan could not open that file. Please try adding the note again.';
