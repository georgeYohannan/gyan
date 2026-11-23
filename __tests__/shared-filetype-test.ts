/**
 * Working out what a file really is, by looking inside it rather than at its name.
 *
 * This is the check that stops a file DECLARED as text having its raw contents fed into the
 * AI prompt, which was the shortest route from "upload anything" to "put anything I like in
 * front of the model".
 */
import {
  kindMatches,
  looksLikeText,
  sniffKind,
  sniffName,
  SNIFF_BYTES,
  WRONG_TYPE_MESSAGE,
} from '../supabase/functions/_shared/filetype';

/** Builds a pretend file: a signature, then filler. */
function file(signature: number[] | string, atOffset = 0, length = 64): Uint8Array {
  const bytes = new Uint8Array(length);
  const values = typeof signature === 'string' ? [...signature].map((c) => c.charCodeAt(0)) : signature;
  bytes.set(values, atOffset);
  return bytes;
}

const utf8 = (text: string) => new TextEncoder().encode(text);

describe('recordings are recognised by what is inside them', () => {
  test.each([
    ['mp3 with tags', file('ID3'), 'audio'],
    ['mp3 raw frame', file([0xff, 0xfb, 0x90, 0x00]), 'audio'],
    ['flac', file('fLaC'), 'audio'],
    ['ogg, oga or opus', file('OggS'), 'audio'],
    ['aac', file([0xff, 0xf1, 0x50, 0x80]), 'audio'],
    ['webm or mkv', file([0x1a, 0x45, 0xdf, 0xa3]), 'audio'],
  ])('%s is audio', (_name, bytes, expected) => {
    expect(sniffKind(bytes as Uint8Array)).toBe(expected);
  });

  test('wav needs RIFF at the start and WAVE further in', () => {
    const wav = new Uint8Array(64);
    wav.set(utf8('RIFF'), 0);
    wav.set(utf8('WAVE'), 8);
    expect(sniffKind(wav)).toBe('audio');
    // RIFF on its own is a container for other things too, so it is not enough.
    expect(sniffKind(file('RIFF'))).toBeUndefined();
  });

  test('mp4, mov and m4v are video; m4a is sound only, so it counts as audio', () => {
    const iso = (brand: string) => {
      const bytes = new Uint8Array(64);
      bytes.set(utf8('ftyp'), 4);
      bytes.set(utf8(brand), 8);
      return bytes;
    };
    expect(sniffKind(iso('isom'))).toBe('video');
    expect(sniffKind(iso('mp42'))).toBe('video');
    expect(sniffKind(iso('qt  '))).toBe('video');
    expect(sniffKind(iso('M4V '))).toBe('video');
    expect(sniffKind(iso('M4A '))).toBe('audio');
  });

  test('it can say which format it found, for a message a person can read', () => {
    expect(sniffName(file('fLaC'))).toBe('flac');
    expect(sniffName(file('OggS'))).toBe('ogg, oga or opus');
    expect(sniffName(utf8('just some writing'))).toBeUndefined();
  });
});

describe('text is checked differently, because it has no signature', () => {
  test('ordinary writing is text', () => {
    expect(sniffKind(utf8('Notes from the meeting.\n\nWe agreed to ship on Friday.'), 'text')).toBe('text');
  });

  test('writing in other scripts is text', () => {
    for (const words of ['こんにちは', 'नमस्ते', 'مرحبا', 'Nos reunimos el jueves']) {
      expect(looksLikeText(utf8(words))).toBe(true);
    }
  });

  test('A PICTURE RENAMED TO .TXT IS NOT TEXT', () => {
    // A real PNG: the bytes that start every one of them.
    const png = file([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    expect(sniffKind(png, 'text')).toBeUndefined();
    expect(looksLikeText(png)).toBe(false);
  });

  test('A ZIP OR A PROGRAM RENAMED TO .TXT IS NOT TEXT', () => {
    expect(looksLikeText(file([0x50, 0x4b, 0x03, 0x04]))).toBe(false); // zip
    expect(looksLikeText(file([0x7f, 0x45, 0x4c, 0x46]))).toBe(false); // a Linux program
    expect(looksLikeText(file([0xcf, 0xfa, 0xed, 0xfe]))).toBe(false); // a Mac program
  });

  test('bytes that are not valid UTF-8 are not text', () => {
    expect(looksLikeText(new Uint8Array([0xc3, 0x28]))).toBe(false);
    expect(looksLikeText(new Uint8Array([0xff, 0xfe, 0x41, 0x00]))).toBe(false);
  });

  test('an empty file is not text', () => {
    expect(looksLikeText(new Uint8Array(0))).toBe(false);
  });

  test('a byte order mark, tabs and newlines are all fine', () => {
    expect(looksLikeText(utf8('﻿First line\r\n\tindented\n'))).toBe(true);
  });

  test('ONE STRAY BYTE DOES NOT REFUSE SOMEBODY’S NOTES', () => {
    // Real documents out of odd editors sometimes carry a control character. Refusing a
    // whole meeting's notes over one would be its own kind of failure.
    const mostlyFine = 'Minutes of the meeting. '.repeat(40) + '\u0001';
    expect(looksLikeText(utf8(mostlyFine))).toBe(true);
  });

  test('but a file that is mostly control characters is not', () => {
    expect(looksLikeText(utf8('a\u0001\u0002\u0003\u0004\u0005'))).toBe(false);
  });
});

describe('what the server does with the answer', () => {
  test('A FILE THAT IS NOT WHAT IT SAYS IT IS gets refused', () => {
    // The case that mattered: a picture claiming to be text.
    const png = file([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    expect(sniffKind(png, 'text')).toBeUndefined();
    // And a recording claiming to be text, which would skip transcription entirely.
    expect(kindMatches(sniffKind(file('ID3'))!, 'text')).toBe(false);
  });

  test('audio and video count as the same family', () => {
    // A .mov holding only sound, or an .mp4 with an empty video track, are both perfectly
    // good recordings and both go to the same place.
    expect(kindMatches('audio', 'video')).toBe(true);
    expect(kindMatches('video', 'audio')).toBe(true);
    expect(kindMatches('text', 'text')).toBe(true);
  });

  test('but a recording is never treated as words to read, nor the other way round', () => {
    expect(kindMatches('audio', 'text')).toBe(false);
    expect(kindMatches('video', 'text')).toBe(false);
    expect(kindMatches('text', 'audio')).toBe(false);
  });

  test('WHAT THE APP CLAIMED CAN NEVER PROMOTE A FILE', () => {
    // Saying "this is audio" about a PNG must not make it audio.
    const png = file([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    expect(sniffKind(png, 'audio')).toBeUndefined();
    expect(sniffKind(png, 'video')).toBeUndefined();
    // The claim is used for one thing only: whether to consider the text check at all.
    expect(sniffKind(utf8('hello'), undefined)).toBeUndefined();
    expect(sniffKind(utf8('hello'), 'text')).toBe('text');
  });

  test('only a few thousand bytes are needed, so nothing large is downloaded to check', () => {
    expect(SNIFF_BYTES).toBeLessThanOrEqual(8192);
    expect(SNIFF_BYTES).toBeGreaterThanOrEqual(512);
  });

  test('the message a person sees says what to do, and nothing about the inside', () => {
    expect(WRONG_TYPE_MESSAGE).toContain('not the kind of file it says it is');
    expect(WRONG_TYPE_MESSAGE).toContain('audio, video or text');
    expect(WRONG_TYPE_MESSAGE).not.toMatch(/byte|signature|magic|mime|header/i);
  });
});
