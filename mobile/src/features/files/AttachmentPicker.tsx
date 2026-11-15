import { Image } from 'expo-image';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import { MIN_TOUCH, radius, spacing, useTheme } from '@/theme';
import { Button, Icon, Text } from '@/ui';
import type { useAttachments } from './useAttachments';

type Attachments = ReturnType<typeof useAttachments>;

/** Buttons to add a photo (camera or gallery) or a PDF, and the list of what has been added. */
export function AttachmentPicker({ attachments, max }: { attachments: Attachments; max: number }) {
  const { colors } = useTheme();
  const { items, notice, add, remove, retry, full } = attachments;

  return (
    <View style={styles.wrap}>
      <View style={styles.buttons}>
        <Button
          title="Camera"
          icon="camera-outline"
          variant="secondary"
          size="sm"
          fullWidth={false}
          disabled={full}
          onPress={() => void add('camera')}
          testID="attach-camera"
        />
        <Button
          title="Photos"
          icon="images-outline"
          variant="secondary"
          size="sm"
          fullWidth={false}
          disabled={full}
          onPress={() => void add('gallery')}
          testID="attach-gallery"
        />
        <Button
          title="PDF"
          icon="document-outline"
          variant="secondary"
          size="sm"
          fullWidth={false}
          disabled={full}
          onPress={() => void add('document')}
          testID="attach-document"
        />
      </View>
      <Text variant="caption" tone="muted">
        Up to {max} files: photos or PDFs, 10 MB each. {items.length} added.
      </Text>
      {notice ? (
        <Text variant="small" tone="bad" accessibilityLiveRegion="polite">
          {notice}
        </Text>
      ) : null}
      {items.map((item) => (
        <View
          key={item.key}
          style={[styles.item, { borderColor: item.status === 'error' ? colors.bad : colors.border, backgroundColor: colors.muted }]}
        >
          {item.mimeType.startsWith('image/') ? (
            <Image source={{ uri: item.uri }} style={styles.thumb} contentFit="cover" accessibilityLabel={item.name} />
          ) : (
            <View style={[styles.thumb, styles.pdf, { backgroundColor: colors.primarySoft }]}>
              <Icon name="document-text-outline" size={22} color={colors.primary} />
            </View>
          )}
          <View style={styles.itemText}>
            <Text variant="smallStrong" numberOfLines={1}>
              {item.name}
            </Text>
            {item.status === 'uploading' ? (
              <Text variant="caption" tone="muted">
                Uploading
              </Text>
            ) : item.status === 'error' ? (
              <Text variant="caption" tone="bad" numberOfLines={2}>
                {item.error ?? 'Upload failed'}
              </Text>
            ) : (
              <Text variant="caption" tone="good">
                Ready
              </Text>
            )}
          </View>
          {item.status === 'uploading' ? <ActivityIndicator color={colors.primary} /> : null}
          {item.status === 'error' ? (
            <Pressable onPress={() => retry(item.key)} accessibilityRole="button" accessibilityLabel={`Try ${item.name} again`} style={styles.iconButton}>
              <Icon name="refresh" size={20} color={colors.primary} />
            </Pressable>
          ) : null}
          <Pressable onPress={() => remove(item.key)} accessibilityRole="button" accessibilityLabel={`Remove ${item.name}`} style={styles.iconButton}>
            <Icon name="close-circle" size={22} color={colors.mutedForeground} />
          </Pressable>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.sm },
  buttons: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.sm,
    borderRadius: radius.md,
    borderWidth: 1,
  },
  thumb: { width: 44, height: 44, borderRadius: radius.sm },
  pdf: { alignItems: 'center', justifyContent: 'center' },
  itemText: { flex: 1, gap: 2 },
  iconButton: { width: MIN_TOUCH, height: MIN_TOUCH, alignItems: 'center', justifyContent: 'center' },
});
