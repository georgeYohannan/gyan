import { useRouter } from 'expo-router';
import { View } from 'react-native';

import { ChatBody } from '@/components/notes/chat-body';
import { PageHeader } from '@/components/ui/page-header';
import { Screen } from '@/components/ui/screen';
import { Colors, Radius } from '@/constants/theme';
import { allNotesChat, ASK_BLURB, ASK_PLACEHOLDER, ASK_SUGGESTED } from '@/lib/ask';
import type { ChatSource } from '@/lib/chat';

/**
 * Ask: one conversation about every note you have.
 *
 * `docs/product-spec.md` feature 5 promises asking "about this note or all notes". The
 * per-note half shipped in prompt 7; this is the other half.
 *
 * It is the SAME chat the note page shows, with a different transport: `allNotesChat` sends
 * questions to the server with `scope: 'all'`, and the answers come back with the note each
 * passage number belongs to. Tapping a number therefore leaves this screen and opens that
 * note at that line, where tapping one inside a note only switches tab.
 *
 * The page does not scroll. The chat fills the window and does its own scrolling, so the
 * question box stays within reach of a thumb and the keyboard cannot push it off the bottom.
 */
export default function AskScreen() {
  const router = useRouter();

  /** A passage number in an Ask answer names a note as well as a line, so it opens that note. */
  const open = (source: ChatSource) => {
    if (!source.meeting_id) return;
    router.push({ pathname: '/note/[id]', params: { id: source.meeting_id, line: source.segment_id } });
  };

  return (
    <Screen testID="ask-screen" scroll={false} style={{ flex: 1 }}>
      <PageHeader title="Ask" lead="One question, answered from your notes." helpId="ask" />

      <View
        style={{
          flex: 1,
          minHeight: 320,
          borderWidth: 1,
          borderColor: Colors.glassBorder,
          borderRadius: Radius.panel,
          overflow: 'hidden',
        }}>
        <ChatBody
          testID="ask-chat"
          transport={allNotesChat}
          blurb={ASK_BLURB}
          suggestions={ASK_SUGGESTED}
          placeholder={ASK_PLACEHOLDER}
          active
          onJump={open}
        />
      </View>
    </Screen>
  );
}
