import { createElement } from 'react';
import { View } from 'react-native';

import { Button } from '@/components/ui/button';
import { MinTouchTarget } from '@/constants/theme';
import type { PickedFile } from '@/lib/notes';

type Props = {
  disabled?: boolean;
  onPressNative: () => void;
  onFile: (file: PickedFile) => void;
};

/**
 * "Choose a file" on the web. A real, invisible file input sits on top of the button, so the person's
 * click goes straight to the browser's file input. Browsers always allow that, and some block a file
 * window that is opened from code.
 */
export function FilePickButton({ disabled, onFile }: Props) {
  return (
    <View style={{ position: 'relative', minHeight: MinTouchTarget }}>
      {/* The look of the button. The input on top receives the click. */}
      <View pointerEvents="none">
        <Button label="Choose a file" variant="secondary" disabled={disabled} />
      </View>
      {createElement('input', {
        type: 'file',
        accept: 'audio/*,video/*,text/plain,text/markdown,.txt,.md,.mp3,.m4a,.wav,.aac,.ogg,.opus,.flac,.webm,.mp4,.mov,.m4v,.mkv',
        disabled,
        'aria-label': 'Choose a file',
        onChange: (e: { target: HTMLInputElement }) => {
          const file = e.target.files?.[0];
          if (!file) return;
          onFile({ name: file.name, size: file.size, mimeType: file.type, uri: URL.createObjectURL(file), file });
          // Let the same file be chosen again later (for example after a Retry from scratch).
          e.target.value = '';
        },
        style: {
          position: 'absolute',
          inset: 0,
          width: '100%',
          height: '100%',
          opacity: 0,
          cursor: disabled ? 'default' : 'pointer',
          // Hides the small "No file chosen" text some browsers draw.
          fontSize: 0,
        },
      })}
    </View>
  );
}
