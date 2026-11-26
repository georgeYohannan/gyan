/**
 * Pulls the sound out of a video in the browser, so a big video becomes a small MP3 before upload.
 * Steps: decode the sound, make it mono at 16,000 Hz (plenty for speech), then squeeze it to MP3 at 32 kbps.
 * That is about 14 MB per hour of speech. The license of the MP3 tool is noted in docs/decisions.md.
 */
import { Mp3Encoder } from '@breezystack/lamejs';

export const canExtractAudio = true;

const SAMPLE_RATE = 16000;
const KBPS = 32;
const BLOCK = 1152 * 20;

export async function extractAudio(file: File | Blob, onProgress?: (fraction: number) => void): Promise<Blob | undefined> {
  const AudioContextClass: typeof AudioContext | undefined =
    window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioContextClass) return undefined;

  const context = new AudioContextClass();
  let decoded: AudioBuffer;
  try {
    decoded = await context.decodeAudioData(await file.arrayBuffer());
  } catch {
    return undefined;
  } finally {
    void context.close();
  }

  // Mix to mono and slow down to 16,000 Hz.
  const length = Math.ceil(decoded.duration * SAMPLE_RATE);
  const offline = new OfflineAudioContext(1, length, SAMPLE_RATE);
  const source = offline.createBufferSource();
  source.buffer = decoded;
  source.connect(offline.destination);
  source.start();
  const mono = (await offline.startRendering()).getChannelData(0);

  const pcm = new Int16Array(mono.length);
  for (let i = 0; i < mono.length; i++) {
    const s = Math.max(-1, Math.min(1, mono[i]));
    pcm[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }

  const encoder = new Mp3Encoder(1, SAMPLE_RATE, KBPS);
  const parts: Uint8Array[] = [];
  for (let i = 0; i < pcm.length; i += BLOCK) {
    const chunk = encoder.encodeBuffer(pcm.subarray(i, i + BLOCK));
    if (chunk.length) parts.push(new Uint8Array(chunk));
    onProgress?.(Math.min(1, i / pcm.length));
    // Let the screen redraw between blocks so the page does not freeze.
    await new Promise((r) => setTimeout(r, 0));
  }
  const end = encoder.flush();
  if (end.length) parts.push(new Uint8Array(end));
  onProgress?.(1);

  return new Blob(parts as BlobPart[], { type: 'audio/mpeg' });
}

/**
 * How long a recording is, in seconds, before it is uploaded.
 *
 * This is what lets the browser refuse a too-long file BEFORE spending anything on it. It asks
 * the browser for the file's own metadata rather than decoding it, so it costs almost nothing
 * even for a two hour video -- `decodeAudioData` would read the whole thing into memory.
 *
 * Anything it cannot work out returns undefined, which means "I do not know" and lets the upload
 * through. The server checks again once Deepgram has answered, so a file that slips past here is
 * still refused; it just costs one transcription to find out.
 */
export async function readDuration(file: File | Blob): Promise<number | undefined> {
  if (typeof document === 'undefined' || typeof URL?.createObjectURL !== 'function') return undefined;
  const address = URL.createObjectURL(file);
  try {
    return await new Promise<number | undefined>((resolve) => {
      const media = document.createElement('video');
      media.preload = 'metadata';
      // A file the browser cannot read must not leave somebody staring at a spinner.
      const giveUp = setTimeout(() => resolve(undefined), 10_000);
      const done = (value: number | undefined) => {
        clearTimeout(giveUp);
        resolve(value);
      };
      media.onloadedmetadata = () =>
        done(Number.isFinite(media.duration) && media.duration > 0 ? media.duration : undefined);
      media.onerror = () => done(undefined);
      media.src = address;
    });
  } finally {
    URL.revokeObjectURL(address);
  }
}
