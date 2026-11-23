// Working out what a file REALLY is, by looking inside it.
//
// THE PROBLEM. Until now Gyan believed whatever the app said a file was. The app reads that
// from the computer's file picker, which reads it from the file's name. So the "we only
// accept audio, video and text" rule was a request, not a check: the store checks the label
// on the request, and the label is written by whoever is uploading.
//
// Why that matters more than it sounds. A file declared as text is treated as PASTED TEXT,
// which skips transcription and sends the file's raw contents straight into the AI prompt.
// So "upload a file" was the shortest route to "put anything I like in front of the model".
//
// THE CHECK. Nearly every audio and video format starts with a few fixed bytes -- a
// signature. This reads the first few bytes of the stored file and says what it actually is.
// Text has no signature, so text is checked differently: it has to decode as UTF-8 and read
// like writing rather than like a program.
//
// It runs on the SERVER, against the bytes already in the store, because anything the app
// checks can be skipped by not using the app.

/** The kinds of file Gyan supports, matching classifyFile in src/lib/notes.ts. */
export type FileKind = 'audio' | 'video' | 'text';

/** How much of the file is needed to tell. Signatures all live in the first few bytes. */
export const SNIFF_BYTES = 4096;

type Signature = {
  kind: FileKind;
  name: string;
  /** Checks the first bytes. Written as a function because some formats need two places. */
  matches(b: Uint8Array): boolean;
};

const starts = (b: Uint8Array, at: number, text: string): boolean => {
  if (b.length < at + text.length) return false;
  for (let i = 0; i < text.length; i++) if (b[at + i] !== text.charCodeAt(i)) return false;
  return true;
};

const SIGNATURES: Signature[] = [
  // --- audio ---
  { kind: 'audio', name: 'mp3 (with tags)', matches: (b) => starts(b, 0, 'ID3') },
  {
    kind: 'audio',
    name: 'mp3 (raw frame)',
    // 11 bits of 1s, then a version that is not the reserved one.
    matches: (b) => b.length > 1 && b[0] === 0xff && (b[1] & 0xe0) === 0xe0 && (b[1] & 0x18) !== 0x08,
  },
  { kind: 'audio', name: 'wav', matches: (b) => starts(b, 0, 'RIFF') && starts(b, 8, 'WAVE') },
  { kind: 'audio', name: 'flac', matches: (b) => starts(b, 0, 'fLaC') },
  { kind: 'audio', name: 'aiff', matches: (b) => starts(b, 0, 'FORM') && starts(b, 8, 'AIFF') },
  {
    kind: 'audio',
    name: 'aac',
    matches: (b) => b.length > 1 && b[0] === 0xff && (b[1] === 0xf1 || b[1] === 0xf9),
  },
  // --- either ---
  // Ogg and Matroska both carry audio or video. Which one is inside needs a full parser, and
  // it makes no difference here: both go to Deepgram, which reads either.
  { kind: 'audio', name: 'ogg, oga or opus', matches: (b) => starts(b, 0, 'OggS') },
  {
    kind: 'audio',
    name: 'webm or mkv',
    matches: (b) => b.length > 3 && b[0] === 0x1a && b[1] === 0x45 && b[2] === 0xdf && b[3] === 0xa3,
  },
  // --- video ---
  // MP4, M4A, M4V and MOV all share one container. The word "ftyp" sits at byte 4, with the
  // flavour just after it. M4A is sound only, so it counts as audio.
  {
    kind: 'audio',
    name: 'm4a',
    matches: (b) => starts(b, 4, 'ftyp') && (starts(b, 8, 'M4A') || starts(b, 8, 'M4B')),
  },
  { kind: 'video', name: 'mp4, mov or m4v', matches: (b) => starts(b, 4, 'ftyp') },
];

/**
 * What this file really is, or undefined when nothing recognises it.
 *
 * `declared` is what the app claimed. It is used for ONE thing only: deciding whether to
 * consider the text check, since text has no signature to find. It can never promote a file
 * to a kind the bytes do not support.
 */
export function sniffKind(bytes: Uint8Array, declared?: FileKind): FileKind | undefined {
  for (const signature of SIGNATURES) {
    if (signature.matches(bytes)) return signature.kind;
  }
  // No signature. The only kind Gyan supports without one is text, and only if it really
  // reads as text.
  if (declared === 'text' && looksLikeText(bytes)) return 'text';
  return undefined;
}

/** The name of the format, for a message a person can understand. */
export function sniffName(bytes: Uint8Array): string | undefined {
  return SIGNATURES.find((s) => s.matches(bytes))?.name;
}

/**
 * Does this read like writing?
 *
 * Two things have to be true: it decodes as UTF-8, and it is mostly not control characters.
 * A JPEG, a zip or a program renamed to .txt fails both. Tabs, newlines and carriage returns
 * are of course fine, and so is a byte order mark.
 */
export function looksLikeText(bytes: Uint8Array): boolean {
  if (bytes.length === 0) return false;
  let text: string;
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    return false;
  }
  let odd = 0;
  for (const char of text) {
    const code = char.codePointAt(0)!;
    const ordinary =
      code === 0x09 || code === 0x0a || code === 0x0d || code === 0xfeff || code >= 0x20;
    if (!ordinary) odd++;
  }
  // A real document has none of these. Allowing a few means one stray byte from an odd
  // editor does not refuse somebody's notes.
  return odd / text.length < 0.01;
}

/**
 * The one a note's kind is checked against.
 *
 * Audio and video are deliberately treated as one family. A .mov holding only sound, or an
 * .mp4 whose video track is empty, are both perfectly good recordings, and both go to the
 * same place. What this stops is the thing that matters: something that is not a recording
 * at all being treated as words to read.
 */
export function kindMatches(real: FileKind, declared: FileKind): boolean {
  if (real === declared) return true;
  const recording = (k: FileKind) => k === 'audio' || k === 'video';
  return recording(real) && recording(declared);
}

/** Plain words for a file that is not what it says it is. */
export const WRONG_TYPE_MESSAGE =
  'That file is not the kind of file it says it is, so Gyan has not opened it. Please upload an audio, video or text file.';
