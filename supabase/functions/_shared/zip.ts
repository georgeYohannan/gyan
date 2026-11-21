// Making a zip file, by hand.
//
// WHY BY HAND. This is a security round, and the audit it belongs to names other people's
// code as one of the ten things most likely to go wrong (OWASP A03, Software Supply Chain
// Failures). It already flags that the mailing library is fetched from a web address with no
// fixed fingerprint. Adding another outside package -- to the one feature whose whole job is
// handing somebody a copy of their private meetings -- would be adding exactly the risk the
// audit warns about, to the worst possible place.
//
// A zip that does not compress anything is a simple, fixed, well-published format: a small
// header before each file, a list at the end, and a checksum. It is about a hundred lines,
// it has no dependencies, and the tests check it by really unzipping what it makes with the
// computer's own unzip. Recordings are already compressed, so compressing them again would
// save almost nothing anyway.

/** One file to put in the zip. */
export type ZipEntry = {
  /** The name inside the zip, with forward slashes. */
  name: string;
  bytes: Uint8Array;
  /** When it was made. Defaults to now. */
  at?: Date;
};

// ---------------------------------------------------------------------------
// The checksum every zip entry carries
// ---------------------------------------------------------------------------

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let value = i;
    for (let bit = 0; bit < 8; bit++) {
      value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    }
    table[i] = value >>> 0;
  }
  return table;
})();

/** The checksum a zip reader uses to tell whether a file arrived intact. */
export function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) {
    crc = CRC_TABLE[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

// ---------------------------------------------------------------------------
// Dates, the way a zip writes them down
// ---------------------------------------------------------------------------

/** Zip keeps the time in two 16-bit numbers, counting from 1980 and in 2-second steps. */
function dosDateTime(at: Date): { time: number; date: number } {
  const year = Math.max(1980, at.getUTCFullYear());
  return {
    time: (at.getUTCHours() << 11) | (at.getUTCMinutes() << 5) | (at.getUTCSeconds() >> 1),
    date: ((year - 1980) << 9) | ((at.getUTCMonth() + 1) << 5) | at.getUTCDate(),
  };
}

// ---------------------------------------------------------------------------
// Building the file
// ---------------------------------------------------------------------------

class Writer {
  private parts: Uint8Array[] = [];
  length = 0;

  push(bytes: Uint8Array): void {
    this.parts.push(bytes);
    this.length += bytes.length;
  }

  /** A little-endian number, which is the only kind a zip uses. */
  pushNumber(value: number, bytes: 2 | 4): void {
    const out = new Uint8Array(bytes);
    for (let i = 0; i < bytes; i++) out[i] = (value >>> (i * 8)) & 0xff;
    this.push(out);
  }

  done(): Uint8Array {
    const out = new Uint8Array(this.length);
    let at = 0;
    for (const part of this.parts) {
      out.set(part, at);
      at += part.length;
    }
    return out;
  }
}

/**
 * Makes a zip file holding these entries, with nothing compressed.
 *
 * Every size here is a plain 32-bit number, which is what an ordinary zip uses. That caps a
 * single export at about 4 GB, far above anything the function that calls this will allow
 * through, so the bigger format (zip64) is not needed and is not pretended at.
 */
export function makeZip(entries: ZipEntry[]): Uint8Array {
  const encoder = new TextEncoder();
  const body = new Writer();
  const directory = new Writer();
  const now = new Date();

  for (const entry of entries) {
    const name = encoder.encode(entry.name);
    const { time, date } = dosDateTime(entry.at ?? now);
    const checksum = crc32(entry.bytes);
    const offset = body.length;

    // The header that sits just before each file's bytes.
    body.pushNumber(0x04034b50, 4); // "this is a file"
    body.pushNumber(20, 2); // the version needed to read it
    body.pushNumber(0x0800, 2); // names are UTF-8
    body.pushNumber(0, 2); // stored, not compressed
    body.pushNumber(time, 2);
    body.pushNumber(date, 2);
    body.pushNumber(checksum, 4);
    body.pushNumber(entry.bytes.length, 4); // size in the file
    body.pushNumber(entry.bytes.length, 4); // size once unpacked: the same
    body.pushNumber(name.length, 2);
    body.pushNumber(0, 2); // nothing extra
    body.push(name);
    body.push(entry.bytes);

    // The same facts again, for the list at the end. A zip reader uses the list, which is
    // why a zip can be opened without reading the whole file.
    directory.pushNumber(0x02014b50, 4); // "this is a list entry"
    directory.pushNumber(20, 2); // the version that wrote it
    directory.pushNumber(20, 2); // the version needed to read it
    directory.pushNumber(0x0800, 2);
    directory.pushNumber(0, 2);
    directory.pushNumber(time, 2);
    directory.pushNumber(date, 2);
    directory.pushNumber(checksum, 4);
    directory.pushNumber(entry.bytes.length, 4);
    directory.pushNumber(entry.bytes.length, 4);
    directory.pushNumber(name.length, 2);
    directory.pushNumber(0, 2); // nothing extra
    directory.pushNumber(0, 2); // no comment
    directory.pushNumber(0, 2); // which disk: there is only one
    directory.pushNumber(0, 2); // internal attributes
    directory.pushNumber(0, 4); // external attributes
    directory.pushNumber(offset, 4); // where the file's header starts
    directory.push(name);
  }

  const end = new Writer();
  end.pushNumber(0x06054b50, 4); // "this is the end"
  end.pushNumber(0, 2); // which disk
  end.pushNumber(0, 2); // which disk the list starts on
  end.pushNumber(entries.length, 2); // entries on this disk
  end.pushNumber(entries.length, 2); // entries in total
  end.pushNumber(directory.length, 4);
  end.pushNumber(body.length, 4); // where the list starts
  end.pushNumber(0, 2); // no comment

  const out = new Writer();
  out.push(body.done());
  out.push(directory.done());
  out.push(end.done());
  return out.done();
}

/** A name that is safe inside a zip: no folders climbed, no awkward characters. */
export function safeZipName(name: string): string {
  const cleaned = name
    .replace(/\\/g, '/')
    .split('/')
    .filter((part) => part !== '' && part !== '.' && part !== '..')
    .join('/')
    .replace(/[^A-Za-z0-9._\-/ ]+/g, '_');
  return cleaned.slice(0, 180) || 'file';
}
