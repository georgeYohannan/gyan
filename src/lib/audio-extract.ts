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
