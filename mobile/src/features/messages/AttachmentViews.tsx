import { Directory, File, Paths } from 'expo-file-system';
import { Image } from 'expo-image';
import * as Sharing from 'expo-sharing';
import { useState } from 'react';
import { ActivityIndicator, Modal, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { api } from '@/api';
import { errorMessage } from '@/api/errors';
import { MIN_TOUCH, radius, spacing, useTheme } from '@/theme';
import { Button, Icon, Text } from '@/ui';
import { isImage } from './format';
import type { MessageFile } from './types';

const safeName = (name: string) => name.replace(/[^\w.-]+/g, '_').slice(0, 80) || 'file';

/** The address and headers of one attachment (the API checks the sender's token). */
function fileRequest(conversationId: string, file: MessageFile) {
  return {
    url: api.url(`/messages/${conversationId}/files/${file.id}`),
    headers: api.authHeaders(),
  };
}

/**
 * Downloads an attachment into the cache, hands it to the system (preview or share sheet), and
 * removes the copy again afterwards, so nothing stays on the phone.
 */
export async function openAttachment(conversationId: string, file: MessageFile): Promise<void> {
  const { url, headers } = fileRequest(conversationId, file);
  const folder = new Directory(Paths.cache, 'message-files');
  if (!folder.exists) folder.create({ intermediates: true, idempotent: true });
  const destination = new File(folder, `${file.id}-${safeName(file.name)}`);
  const saved = await File.downloadFileAsync(url, destination, { headers, idempotent: true });
  try {
    await Sharing.shareAsync(saved.uri, {
      mimeType: file.mimeType,
      dialogTitle: file.name,
      UTI: file.mimeType === 'application/pdf' ? 'com.adobe.pdf' : undefined,
    });
  } finally {
    try {
      saved.delete();
    } catch {
      // The system clears the cache folder anyway.
    }
  }
}

/** A photo as a thumbnail, or a PDF as a row. Tap to open. */
export function AttachmentItem({
  conversationId,
  file,
  mine,
}: {
  conversationId: string;
  file: MessageFile;
  mine: boolean;
}) {
  const { colors } = useTheme();
  const [viewer, setViewer] = useState(false);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  const open = async () => {
    setProblem(null);
    setBusy(true);
    try {
      await openAttachment(conversationId, file);
    } catch (e) {
      setProblem(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  if (isImage(file.mimeType)) {
    const { url, headers } = fileRequest(conversationId, file);
    return (
      <>
        <Pressable
          onPress={() => setViewer(true)}
          accessibilityRole="imagebutton"
          accessibilityLabel={`Photo ${file.name}. Tap to view`}
          style={[styles.photo, { backgroundColor: colors.accent }]}
          testID={`attachment-${file.id}`}
        >
          <Image source={{ uri: url, headers }} style={styles.photoImage} contentFit="cover" transition={150} />
        </Pressable>
        <PhotoViewer
          visible={viewer}
          onClose={() => setViewer(false)}
          source={{ uri: url, headers }}
          name={file.name}
          onShare={open}
          sharing={busy}
          problem={problem}
        />
      </>
    );
  }

  return (
    <View>
      <Pressable
        onPress={() => void open()}
        accessibilityRole="button"
        accessibilityLabel={`PDF ${file.name}. Tap to open`}
        style={[
          styles.pdf,
          { backgroundColor: mine ? 'rgba(255,255,255,0.16)' : colors.accent, borderColor: mine ? 'transparent' : colors.border },
        ]}
        testID={`attachment-${file.id}`}
      >
        <Icon name="document-text" size={24} color={mine ? colors.primaryForeground : colors.primary} />
        <View style={styles.pdfText}>
          <Text variant="smallStrong" numberOfLines={1} style={{ color: mine ? colors.primaryForeground : colors.foreground }}>
            {file.name}
          </Text>
          <Text variant="caption" style={{ color: mine ? colors.primaryForeground : colors.mutedForeground }}>
            PDF · {formatSize(file.sizeBytes)}
          </Text>
        </View>
        {busy ? <ActivityIndicator color={mine ? colors.primaryForeground : colors.primary} /> : null}
      </Pressable>
      {problem ? (
        <Text variant="caption" tone="bad">
          {problem}
        </Text>
      ) : null}
    </View>
  );
}

export function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function PhotoViewer({
  visible,
  onClose,
  source,
  name,
  onShare,
  sharing,
  problem,
}: {
  visible: boolean;
  onClose: () => void;
  source: { uri: string; headers: Record<string, string> };
  name: string;
  onShare: () => void;
  sharing: boolean;
  problem: string | null;
}) {
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <View style={styles.viewer}>
        <Image source={source} style={StyleSheet.absoluteFill} contentFit="contain" accessibilityLabel={name} />
        <View style={[styles.viewerBar, { paddingTop: insets.top + spacing.sm }]}>
          <Pressable
            onPress={onClose}
            accessibilityRole="button"
            accessibilityLabel="Close photo"
            style={styles.viewerClose}
            testID="close-photo"
          >
            <Icon name="close" size={26} color="#ffffff" />
          </Pressable>
        </View>
        <View style={[styles.viewerFoot, { paddingBottom: insets.bottom + spacing.lg }]}>
          {problem ? (
            <Text variant="small" style={styles.viewerProblem}>
              {problem}
            </Text>
          ) : null}
          <Button title="Share or save" icon="share-outline" variant="secondary" fullWidth={false} size="sm" loading={sharing} onPress={onShare} />
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  photo: { width: 200, height: 150, borderRadius: radius.md, overflow: 'hidden' },
  photoImage: { width: '100%', height: '100%' },
  pdf: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    minHeight: MIN_TOUCH,
    minWidth: 200,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
  },
  pdfText: { flex: 1 },
  viewer: { flex: 1, backgroundColor: '#000000' },
  viewerBar: { position: 'absolute', top: 0, left: 0, right: 0, flexDirection: 'row', justifyContent: 'flex-end', paddingHorizontal: spacing.lg },
  viewerClose: {
    width: MIN_TOUCH,
    height: MIN_TOUCH,
    borderRadius: MIN_TOUCH / 2,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  viewerFoot: { position: 'absolute', bottom: 0, left: 0, right: 0, alignItems: 'center', gap: spacing.sm },
  viewerProblem: { color: '#ffffff' },
});
