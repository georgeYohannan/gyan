/** Copying text to the clipboard. expo-clipboard works the same on the web and on phones. */
import * as Clipboard from 'expo-clipboard';

export async function copyText(text: string): Promise<void> {
  await Clipboard.setStringAsync(text);
}
