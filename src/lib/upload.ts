import { markActivity } from '@/hooks/use-inactivity-signout';
import { Platform } from 'react-native';

import { getSupabase } from '@/lib/supabase';

const BUCKET = 'notes-files';

/**
 * Sends one file to the private bucket. `onProgress` gets 0 to 1 (or undefined when the
 * size is not known). On the web we use XMLHttpRequest because it can report progress.
 */
export async function uploadFile(
  path: string,
  body: Blob | { uri: string },
  contentType: string,
  onProgress?: (fraction: number | undefined) => void,
): Promise<void> {
  const supabase = getSupabase();

  if (Platform.OS === 'web' && body instanceof Blob) {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (!token) throw new Error('not_signed_in');
    const url = `${process.env.EXPO_PUBLIC_SUPABASE_URL}/storage/v1/object/${BUCKET}/${path.split('/').map(encodeURIComponent).join('/')}`;

    await new Promise<void>((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('POST', url);
      xhr.setRequestHeader('Authorization', `Bearer ${token}`);
      xhr.setRequestHeader('apikey', process.env.EXPO_PUBLIC_SUPABASE_KEY ?? '');
      xhr.setRequestHeader('Content-Type', contentType);
      xhr.setRequestHeader('x-upsert', 'true');
      xhr.upload.onprogress = (e) => {
        // Tell the automatic sign out that something is still happening. A 50 MB file on a
        // slow connection can take longer than the whole timeout with nobody touching the
        // screen, and being signed out mid-upload would be a worse failure than the one the
        // timeout prevents.
        markActivity();
        onProgress?.(e.lengthComputable ? e.loaded / e.total : undefined);
      };
      xhr.onload = () =>
        xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(
              new Error(
                // The status only. This used to paste the store's whole reply into the
                // error, which put somebody else's internal wording (and the file path)
                // into a message that can end up in a crash report.
                xhr.status === 413 ? 'too_big' : `upload_failed_${xhr.status}`,
              ),
            );
      xhr.onerror = () => reject(new Error('network'));
      xhr.ontimeout = () => reject(new Error('timeout'));
      xhr.send(body);
    });
    return;
  }

  // Phones: expo-file-system's File can be sent like a Blob. No live progress here yet.
  onProgress?.(undefined);
  let blob: Blob;
  if (body instanceof Blob) {
    blob = body;
  } else {
    const { File } = await import('expo-file-system');
    blob = new File(body.uri) as unknown as Blob;
  }
  const { error } = await supabase.storage.from(BUCKET).upload(path, blob, { contentType, upsert: true });
  if (error) throw error;
  onProgress?.(1);
}
