// Settings for the account function. Change them here, not inside the code.

/** The private bucket every recording and uploaded file lives in. */
export const STORAGE_BUCKET = 'notes-files';

/** How many names storage hands back at once. It pages, so this is asked for over and over. */
export const LIST_PAGE_SIZE = 100;

/** How many files to remove in one go, so a big workspace does not make one huge request. */
export const REMOVE_BATCH = 100;
