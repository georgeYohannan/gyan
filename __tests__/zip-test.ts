/**
 * The zip file the data export hands somebody.
 *
 * These tests do not check the bytes against a description of the format. They write a real
 * zip to disk and open it with the COMPUTER'S OWN unzip, because the only question that
 * matters is whether the file a person downloads opens on their machine.
 */
import { execFileSync } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';

import { crc32, makeZip, safeZipName } from '../supabase/functions/_shared/zip';

/** Writes the zip to a temporary folder and unpacks it with the system unzip. */
function unzipForReal(bytes: Uint8Array): { files: Record<string, string>; listing: string } {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gyan-zip-'));
  const file = path.join(dir, 'export.zip');
  fs.writeFileSync(file, bytes);

  // -t tests every checksum inside. It fails loudly on a zip that is subtly wrong.
  execFileSync('unzip', ['-t', file], { encoding: 'utf8' });
  const listing = execFileSync('unzip', ['-l', file], { encoding: 'utf8' });

  const out = path.join(dir, 'out');
  execFileSync('unzip', ['-q', file, '-d', out]);

  const files: Record<string, string> = {};
  const walk = (at: string, prefix = '') => {
    for (const entry of fs.readdirSync(at, { withFileTypes: true })) {
      const full = path.join(at, entry.name);
      const name = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.isDirectory()) walk(full, name);
      else files[name] = fs.readFileSync(full, 'utf8');
    }
  };
  walk(out);
  fs.rmSync(dir, { recursive: true, force: true });
  return { files, listing };
}

const text = (value: string) => new TextEncoder().encode(value);

describe('the zip really opens', () => {
  test('A ZIP GYAN MAKES CAN BE OPENED BY AN ORDINARY UNZIP', () => {
    const zip = makeZip([
      { name: 'gyan-export.json', bytes: text('{"notes":[]}') },
      { name: 'notes/weekly-call.txt', bytes: text('Alice: hello\nBob: hi') },
    ]);
    const { files } = unzipForReal(zip);
    expect(Object.keys(files).sort()).toEqual(['gyan-export.json', 'notes/weekly-call.txt']);
    expect(files['gyan-export.json']).toBe('{"notes":[]}');
    expect(files['notes/weekly-call.txt']).toBe('Alice: hello\nBob: hi');
  });

  test('EVERY CHECKSUM INSIDE IS RIGHT, so nothing is quietly corrupted', () => {
    // unzip -t checks each one. A zip with a wrong checksum opens in some tools and fails in
    // others, which is the worst kind of broken: it looks fine until it does not.
    const zip = makeZip([{ name: 'a.txt', bytes: text('x'.repeat(5000)) }]);
    expect(() => unzipForReal(zip)).not.toThrow();
  });

  test('an empty zip is still a well formed zip', () => {
    // Not opened with the system unzip here: Info-ZIP on macOS refuses a zip with nothing
    // in it, which is its own quirk rather than a problem with the file. Gyan never makes
    // one anyway -- an export always carries at least the JSON -- so what is checked is
    // that the end marker is written correctly.
    const zip = makeZip([]);
    expect(zip.length).toBe(22);
    expect(Array.from(zip.slice(0, 4))).toEqual([0x50, 0x4b, 0x05, 0x06]);
  });

  test('an empty FILE inside a zip is fine too', () => {
    const { files } = unzipForReal(makeZip([{ name: 'empty.txt', bytes: new Uint8Array(0) }]));
    expect(files['empty.txt']).toBe('');
  });

  test('WORDS IN ANY SCRIPT SURVIVE INSIDE THE FILES', () => {
    // What is inside a file is what matters: somebody's notes in Japanese or Hindi have to
    // come back exactly as they were.
    const japanese = '\u4f1a\u8b70\u306e\u8a18\u9332';
    const hindi = '\u092c\u0948\u0920\u0915 \u0915\u0947 \u0928\u094b\u091f';
    const zip = makeZip([
      { name: 'notes/japanese.txt', bytes: text(japanese) },
      { name: 'notes/hindi.txt', bytes: text(hindi) },
    ]);
    const { files } = unzipForReal(zip);
    expect(files['notes/japanese.txt']).toBe(japanese);
    expect(files['notes/hindi.txt']).toBe(hindi);
  });

  test('NAMES ARE PLAIN ASCII, on purpose, and the real title lives in the JSON', () => {
    // A note titled in Japanese would make a file name in Japanese. The zip format can
    // carry that, and Gyan writes the flag that says so -- but the unzip built into
    // Windows and the one on macOS both make a mess of it, and somebody opening their own
    // export to find nonsense would reasonably think their notes were damaged.
    //
    // So names keep to characters every tool agrees on, and the real title sits in
    // gyan-export.json beside the file name. Nothing is lost; it is just not in the name.
    expect(safeZipName('notes/\u4f1a\u8b70.txt')).toBe('notes/_.txt');
    const { files } = unzipForReal(makeZip([{ name: safeZipName('notes/\u4f1a\u8b70.txt'), bytes: text('kept') }]));
    expect(files['notes/_.txt']).toBe('kept');
  });

  test('a big file comes back byte for byte', () => {
    // Recordings are large. A size written in the wrong place shows up here and nowhere else.
    const big = new Uint8Array(300_000);
    for (let i = 0; i < big.length; i++) big[i] = i % 251;
    const zip = makeZip([{ name: 'big.bin', bytes: big }]);

    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gyan-zip-big-'));
    const file = path.join(dir, 'e.zip');
    fs.writeFileSync(file, zip);
    execFileSync('unzip', ['-qo', file, '-d', dir]);
    const back = fs.readFileSync(path.join(dir, 'big.bin'));
    fs.rmSync(dir, { recursive: true, force: true });

    expect(back.length).toBe(big.length);
    expect(Buffer.compare(back, Buffer.from(big))).toBe(0);
  });

  test('the listing shows the real sizes, so nothing looks empty', () => {
    const { listing } = unzipForReal(makeZip([{ name: 'a.txt', bytes: text('12345') }]));
    expect(listing).toContain('a.txt');
    expect(listing).toMatch(/\b5\b/);
  });
});

describe('the checksum', () => {
  test('matches the published answer for "123456789"', () => {
    // The number every CRC-32 implementation is checked against.
    expect(crc32(text('123456789'))).toBe(0xcbf43926);
  });

  test('an empty file is zero', () => {
    expect(crc32(new Uint8Array(0))).toBe(0);
  });

  test('one changed byte changes it', () => {
    expect(crc32(text('hello'))).not.toBe(crc32(text('hellp')));
  });
});

describe('names inside the zip', () => {
  test('A NAME CANNOT CLIMB OUT OF THE FOLDER IT IS UNPACKED INTO', () => {
    // The classic zip trick: a file called ../../etc/something, which writes outside the
    // folder somebody unpacked it into.
    expect(safeZipName('../../etc/passwd')).toBe('etc/passwd');
    expect(safeZipName('/absolute/path')).toBe('absolute/path');
    expect(safeZipName('..\\..\\windows\\system32')).toBe('windows/system32');
    expect(safeZipName('./././x')).toBe('x');
  });

  test('awkward characters are replaced rather than passed on', () => {
    expect(safeZipName('note: "urgent" <draft>.txt')).toBe('note_ _urgent_ _draft_.txt');
  });

  test('a name that is nothing but rubbish still gets a name', () => {
    expect(safeZipName('../..')).toBe('file');
    expect(safeZipName('')).toBe('file');
  });

  test('a very long name is shortened', () => {
    expect(safeZipName('a'.repeat(500)).length).toBe(180);
  });

  test('ordinary names are left alone', () => {
    expect(safeZipName('notes/Weekly team call.mp3')).toBe('notes/Weekly team call.mp3');
  });
});
