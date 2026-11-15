import { Image } from 'expo-image';
import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import { api, errorMessage } from '@/api';
import { downloadAndShare } from '@/features/files/download';
import { MIN_TOUCH, radius, spacing, useTheme } from '@/theme';
import { Icon, Text } from '@/ui';
import type { HomeworkFile } from './types';

/** "340 KB", "1.2 MB". */
export function sizeText(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * One file of a homework (the teacher's worksheet or the child's hand-in). Files are private:
 * they are fetched with the account's token through the homework, then opened in the phone's
 * share sheet (view, save to Files, send).
 */
export function HomeworkFileRow({ homeworkId, file }: { homeworkId: string; file: HomeworkFile }) {
  const { colors } = useTheme();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const path = `/homework/${homeworkId}/files/${file.id}`;
  const isImage = file.mimeType.startsWith('image/');

  const open = async () => {
    setBusy(true);
    setError(null);
    try {
      await downloadAndShare({ path, fileName: file.name, mimeType: file.mimeType });
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.wrap}>
      <Pressable
        onPress={() => void open()}
        disabled={busy}
        accessibilityRole="button"
        accessibilityLabel={`Open ${file.name}`}
        style={({ pressed }) => [
          styles.row,
          { backgroundColor: colors.muted, borderColor: colors.border },
          pressed && { opacity: 0.8 },
        ]}
      >
        {isImage ? (
          <Image
            source={{ uri: api.url(path), headers: api.authHeaders() }}
            style={styles.thumb}
            contentFit="cover"
            accessibilityLabel={file.name}
          />
        ) : (
          <View style={[styles.thumb, styles.pdf, { backgroundColor: colors.primarySoft }]}>
            <Icon name="document-text-outline" size={22} color={colors.primary} />
          </View>
        )}
        <View style={styles.text}>
          <Text variant="smallStrong" numberOfLines={1}>
            {file.name}
          </Text>
          <Text variant="caption" tone="muted">
            {isImage ? 'Photo' : 'PDF'} · {sizeText(file.sizeBytes)}
          </Text>
        </View>
        {busy ? (
          <ActivityIndicator color={colors.primary} />
        ) : (
          <Icon name="download-outline" size={20} color={colors.primary} />
        )}
      </Pressable>
      {error ? (
        <Text variant="small" tone="bad" accessibilityLiveRegion="polite">
          {error}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.xs },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    minHeight: MIN_TOUCH + 8,
    padding: spacing.sm,
    borderRadius: radius.md,
    borderWidth: 1,
  },
  thumb: { width: 44, height: 44, borderRadius: radius.sm },
  pdf: { alignItems: 'center', justifyContent: 'center' },
  text: { flex: 1, gap: 2 },
});
