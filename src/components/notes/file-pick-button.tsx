import { Button } from '@/components/ui/button';

import type { PickedFile } from '@/lib/notes';

type Props = {
  disabled?: boolean;
  /** Phones: called when the button is pressed. It opens the phone's file picker. */
  onPressNative: () => void;
  /** Web only: called with the file the person chose. */
  onFile: (file: PickedFile) => void;
};

/** "Choose a file". On phones it opens the file picker. (The web version is in file-pick-button.web.tsx.) */
export function FilePickButton({ disabled, onPressNative }: Props) {
  return <Button label="Choose a file" variant="secondary" disabled={disabled} onPress={onPressNative} />;
}
