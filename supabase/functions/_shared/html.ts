// Making text safe to put in an email.
//
// There were two copies of this, and they had drifted: the invite one was missing the
// single quote. Nothing was exploitable, because every attribute in both templates is
// written with double quotes -- but the next person to write an attribute with single
// quotes would have had a hole and no way to know. One copy, no drift.
//
// Note what this is NOT for: the app never shows any text as HTML, so none of this applies
// there. It is only for the two emails Gyan sends.

/**
 * Turns the five characters that mean something in HTML into the words for them, so text is
 * shown as text and can never become part of the page around it.
 */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Makes a string safe to put on one line of an email header, such as a Subject.
 *
 * An email header ends at a line break. A name holding a carriage return or a newline could
 * therefore add headers of its own -- another recipient, say. Mail libraries usually refuse
 * this, but "usually, by somebody else's code" is not a guarantee worth relying on when the
 * fix is one line. Tabs and runs of spaces are squeezed too, so a header stays readable.
 */
/**
 * Every character that ends a line somewhere. Written as a string rather than a regular
 * expression on purpose: U+2028 and U+2029 really do end a line as far as a JavaScript
 * parser is concerned, so typing them straight into a pattern breaks the file.
 */
const LINE_BREAKS = new RegExp('[\\r\\n\\u2028\\u2029]+', 'g');

export function oneLine(value: string, maxLength = 200): string {
  return value
    .replace(LINE_BREAKS, ' ')
    .replace(/[\t\v\f\u0000-\u001f]+/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim()
    .slice(0, maxLength);
}
