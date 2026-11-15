import { Image } from 'expo-image';
import { useCallback, useRef } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import { MIN_TOUCH, radius, spacing, useTheme } from '@/theme';
import { Icon, ListRow, Sheet, Text } from '@/ui';
import type { PendingAttachment } from './attachments';
import type { AttachSource } from './useAttachments';
import { isImage } from './format';

/** The pictures and papers chosen for a message, each with a remove button. */
export function AttachmentTray({
  items,
  onRemove,
}: {
  items: PendingAttachment[];
  onRemove: (key: string) => void;
}) {
  const { colors } = useTheme();
  if (items.length === 0) return null;
  return (
    <View style={styles.tray}>
      {items.map((a) => (
        <View key={a.key} style={styles.chipWrap}>
          <View style={[styles.chip, { backgroundColor: colors.accent, borderColor: a.status === 'error' ? colors.bad : colors.border }]}>
            {isImage(a.mimeType) ? (
              <Image source={{ uri: a.uri }} style={styles.thumb} contentFit="cover" accessibilityLabel={a.name} />
            ) : (
              <View style={styles.pdf}>
                <Icon name="document-text" size={22} color={colors.primary} />
                <Text variant="caption" tone="muted" numberOfLines={1} style={styles.pdfName}>
                  {a.name}
                </Text>
              </View>
            )}
            {a.status === 'uploading' ? (
              <View style={[styles.overlay, { backgroundColor: colors.scrim }]}>
                <ActivityIndicator color="#ffffff" />
              </View>
            ) : null}
            {a.status === 'error' ? (
              <View style={[styles.overlay, { backgroundColor: colors.badSoft }]}>
                <Icon name="alert-circle" size={22} color={colors.bad} />
              </View>
            ) : null}
          </View>
          <Pressable
            onPress={() => onRemove(a.key)}
            accessibilityRole="button"
            accessibilityLabel={`Remove ${a.name}`}
            hitSlop={8}
            style={[styles.remove, { backgroundColor: colors.foreground }]}
          >
            <Icon name="close" size={14} color={colors.background} />
          </Pressable>
        </View>
      ))}
    </View>
  );
}

/**
 * "Take a photo / Choose a photo / Choose a PDF". The picker opens only after the sheet has
 * finished closing (iOS cannot show two modals at once).
 */
export function AttachSheet({
  visible,
  onClose,
  onPick,
}: {
  visible: boolean;
  onClose: () => void;
  onPick: (source: AttachSource) => void;
}) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const choose = useCallback(
    (source: AttachSource) => {
      onClose();
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => onPick(source), 450);
    },
    [onClose, onPick],
  );
  return (
    <Sheet visible={visible} onClose={onClose} title="Attach">
      <ListRow title="Take a photo" icon="camera-outline" onPress={() => choose('camera')} testID="attach-camera" />
      <ListRow title="Choose from photos" icon="images-outline" onPress={() => choose('photos')} testID="attach-photos" />
      <ListRow title="Choose a PDF" icon="document-outline" onPress={() => choose('pdf')} testID="attach-pdf" />
      <Text variant="caption" tone="muted">
        Up to 3 files, 10 MB each. Photos and PDF files only.
      </Text>
    </Sheet>
  );
}

/** The paperclip button that opens the sheet. */
export function AttachButton({ onPress, disabled }: { onPress: () => void; disabled?: boolean }) {
  const { colors } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel="Attach a photo or PDF"
      accessibilityState={{ disabled: Boolean(disabled) }}
      style={[styles.attach, { backgroundColor: colors.primarySoft, opacity: disabled ? 0.5 : 1 }]}
      testID="attach-button"
    >
      <Icon name="attach" size={24} color={colors.primary} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  tray: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md, paddingTop: spacing.xs },
  chipWrap: { position: 'relative' },
  chip: {
    width: 76,
    height: 64,
    borderRadius: radius.md,
    borderWidth: 1,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  thumb: { width: '100%', height: '100%' },
  pdf: { alignItems: 'center', gap: 2, paddingHorizontal: 4 },
  pdfName: { maxWidth: 70 },
  overlay: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center' },
  remove: {
    position: 'absolute',
    top: -8,
    right: -8,
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  attach: {
    width: MIN_TOUCH,
    height: MIN_TOUCH,
    borderRadius: MIN_TOUCH / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
