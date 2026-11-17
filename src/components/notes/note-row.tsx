import { useRouter } from 'expo-router';
import { Pressable, View } from 'react-native';

import { Body } from '@/components/ui/body';
import { GlassPanel } from '@/components/ui/glass-panel';
import { StatusBadge } from '@/components/ui/status-badge';
import { Spacing } from '@/constants/theme';
import { noteTitle, SOURCE_LABEL, type NoteRow as Note } from '@/lib/notes';

/** One note in the Home list: title, date, where it came from, and its status. */
export function NoteRow({ note }: { note: Note }) {
  const date = new Date(note.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  const router = useRouter();
  return (
    <Pressable
      accessibilityRole="link"
      onPress={() => router.push({ pathname: '/note/[id]', params: { id: note.id } })}>
    <GlassPanel accessibilityLabel={`${noteTitle(note)}, ${date}, ${SOURCE_LABEL[note.source]}, ${note.status}`}>
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: Spacing.three }}>
        <View style={{ flex: 1, gap: Spacing.one }}>
          <Body style={{ fontWeight: '600' }} numberOfLines={2}>
            {noteTitle(note)}
          </Body>
          <Body small color="textSecondary">
            {date} · {SOURCE_LABEL[note.source]}
          </Body>
        </View>
        <StatusBadge status={note.status} />
      </View>
      {note.status === 'Failed' && note.error_message ? (
        <Body small color="danger">
          {note.error_message}
        </Body>
      ) : null}
    </GlassPanel>
    </Pressable>
  );
}
