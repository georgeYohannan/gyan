/**
 * Pulls the sound out of a video so a big video becomes a small audio file before upload.
 * Phones: not built yet (it needs a native library and a development build). Returns undefined.
 */
export const canExtractAudio = false;

/* eslint-disable @typescript-eslint/no-unused-vars -- same shape as the web version */
export async function extractAudio(
  _file: File | Blob,
  _onProgress?: (fraction: number) => void,
): Promise<Blob | undefined> {
  return undefined;
}

/**
 * How long a recording is, in seconds, before it is uploaded.
 *
 * NOT BUILT ON PHONES, and that is the honest gap in enforcing the longest-meeting limit: there
 * is no way to read a media file's length here without a native library and a development build.
 * Returning undefined means "I do not know", and the caller then lets the upload through -- the
 * server checks again after the transcript, which is the backstop that cannot be got round.
 */
export async function readDuration(_file: File | Blob): Promise<number | undefined> {
  return undefined;
}
