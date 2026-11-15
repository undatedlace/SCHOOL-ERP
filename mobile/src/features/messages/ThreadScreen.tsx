import { Stack, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState, type ComponentRef } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import { api } from '@/api';
import { errorMessage, isApiError } from '@/api/errors';
import { useApiQuery } from '@/api/hooks';
import { radius, spacing, useTheme } from '@/theme';
import { Avatar, Button, ErrorState, Icon, Skeleton, Text } from '@/ui';
import { Composer } from './Composer';
import { groupByDay, mergeMessages, teacherLine } from './format';
import { useRefreshMessages } from './hooks';
import { MessageBubble } from './MessageBubble';
import type { ConversationDetail, Message, SendResult } from './types';
import { useAttachments } from './useAttachments';

const PAGE = 30;

/** One conversation: bubbles, earlier pages on demand, a reply box, or a note saying why not. */
export function ThreadScreen() {
  const { id, quiet } = useLocalSearchParams<{ id: string; quiet?: string }>();
  const { colors } = useTheme();
  const refreshMessages = useRefreshMessages();

  const detail = useApiQuery<ConversationDetail>(`/messages/${id}`, {
    query: { limit: PAGE },
    refetchInterval: 15_000,
    enabled: Boolean(id),
  });
  const data = detail.data;

  // Pages older than the newest one, and the messages this phone just sent.
  const [older, setOlder] = useState<Message[]>([]);
  const [olderCursor, setOlderCursor] = useState<{ hasMore: boolean; nextBefore: string | null } | null>(null);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [olderError, setOlderError] = useState<string | null>(null);
  const [sent, setSent] = useState<Message[]>([]);

  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [quietNote, setQuietNote] = useState(quiet === '1');
  const attachments = useAttachments();

  const scroller = useRef<ComponentRef<typeof ScrollView>>(null);
  const nearBottom = useRef(true);
  const keepPosition = useRef(false);

  const messages = useMemo(() => mergeMessages(older, data?.messages ?? [], sent), [older, data?.messages, sent]);
  const groups = useMemo(() => groupByDay(messages), [messages]);
  const cursor = olderCursor ?? (data ? { hasMore: data.hasMore, nextBefore: data.nextBefore } : null);

  // Read receipts: once the messages are on screen, tell the server. Again when new ones arrive.
  const marking = useRef(false);
  const unread = data?.unreadCount ?? 0;
  useEffect(() => {
    if (!id || unread === 0 || marking.current) return;
    marking.current = true;
    api
      .post(`/messages/${id}/read`)
      .then(() => refreshMessages())
      .catch(() => undefined)
      .finally(() => {
        marking.current = false;
      });
  }, [id, unread, refreshMessages]);

  const loadOlder = useCallback(async () => {
    if (!id || !cursor?.nextBefore || loadingOlder) return;
    setLoadingOlder(true);
    setOlderError(null);
    keepPosition.current = true;
    try {
      const page = await api.get<ConversationDetail>(`/messages/${id}`, {
        query: { before: cursor.nextBefore, limit: PAGE },
      });
      setOlder((list) => mergeMessages(page.messages, list));
      setOlderCursor({ hasMore: page.hasMore, nextBefore: page.nextBefore });
    } catch (e) {
      keepPosition.current = false;
      setOlderError(errorMessage(e));
    } finally {
      setLoadingOlder(false);
    }
  }, [id, cursor?.nextBefore, loadingOlder]);

  const send = useCallback(async () => {
    const body = text.trim();
    if (!id || !body || sending || attachments.uploading) return;
    setSending(true);
    setSendError(null);
    try {
      const result = await api.post<SendResult>(`/messages/${id}/messages`, {
        body,
        ...(attachments.fileIds.length ? { fileIds: attachments.fileIds } : {}),
      });
      setSent((list) => mergeMessages(list, [result.message]));
      setText('');
      attachments.reset();
      setQuietNote(result.deliveredQuietly);
      nearBottom.current = true;
      void refreshMessages();
    } catch (e) {
      setSendError(errorMessage(e));
      // A refusal means the conversation changed (closed, teacher moved): show it as it is now.
      if (isApiError(e) && (e.status === 403 || e.status === 404)) void detail.refetch();
    } finally {
      setSending(false);
    }
  }, [id, text, sending, attachments, refreshMessages, detail]);

  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const { contentOffset, layoutMeasurement, contentSize } = e.nativeEvent;
    nearBottom.current = contentOffset.y + layoutMeasurement.height >= contentSize.height - 120;
  };

  // Top of the keyboard-avoiding area, so the reply box is not covered on iOS.
  const frame = useRef<ComponentRef<typeof View>>(null);
  const [top, setTop] = useState(0);

  if (detail.isLoading) {
    return (
      <View style={[styles.flex, styles.loading, { backgroundColor: colors.background }]}>
        <Skeleton height={80} />
        <Skeleton height={48} width="70%" />
        <Skeleton height={48} width="60%" style={{ alignSelf: 'flex-end' }} />
      </View>
    );
  }
  if (!data) {
    return (
      <View style={[styles.flex, { backgroundColor: colors.background }]}>
        <ErrorState
          message={detail.error ? errorMessage(detail.error) : 'We could not open this conversation.'}
          onRetry={() => void detail.refetch()}
          retrying={detail.isFetching}
        />
      </View>
    );
  }

  return (
    <View
      ref={frame}
      style={[styles.flex, { backgroundColor: colors.background }]}
      onLayout={() => frame.current?.measureInWindow((_x, y) => setTop(y))}
    >
      <Stack.Screen options={{ title: data.teacher.name }} />
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={top}
      >
        <ScrollView
          ref={scroller}
          style={styles.flex}
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="interactive"
          showsVerticalScrollIndicator={false}
          onScroll={onScroll}
          scrollEventThrottle={64}
          onContentSizeChange={() => {
            if (keepPosition.current) {
              keepPosition.current = false;
              return;
            }
            if (nearBottom.current) scroller.current?.scrollToEnd({ animated: false });
          }}
          testID="thread-scroll"
        >
          <View style={[styles.about, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Avatar name={data.teacher.name} size={44} />
            <View style={styles.aboutText}>
              <Text variant="bodyStrong" numberOfLines={1}>
                {data.teacher.name}
              </Text>
              <Text variant="small" tone="muted" numberOfLines={2}>
                {teacherLine(data.teacher)}
              </Text>
            </View>
          </View>
          <Text variant="subheading" align="center" accessibilityRole="header">
            {data.subject}
          </Text>
          <View style={styles.safety}>
            <Icon name="shield-checkmark-outline" size={14} color={colors.mutedForeground} />
            <Text variant="caption" tone="muted" style={styles.flexShrink}>
              {data.safetyNotice || 'The school can read messages for safety.'}
            </Text>
          </View>

          {cursor?.hasMore ? (
            <Button
              title="Load earlier messages"
              variant="ghost"
              size="sm"
              fullWidth={false}
              loading={loadingOlder}
              onPress={() => void loadOlder()}
              style={styles.center}
              testID="load-earlier"
            />
          ) : null}
          {olderError ? (
            <Text variant="caption" tone="bad" align="center">
              {olderError}
            </Text>
          ) : null}

          {groups.map((g) => (
            <View key={g.day} style={styles.group}>
              <View style={styles.dayRow}>
                <View style={[styles.dayLine, { backgroundColor: colors.border }]} />
                <Text variant="caption" tone="muted" style={styles.dayText}>
                  {g.label}
                </Text>
                <View style={[styles.dayLine, { backgroundColor: colors.border }]} />
              </View>
              {g.messages.map((m) => (
                <MessageBubble key={m.id} message={m} conversationId={data.id} />
              ))}
            </View>
          ))}

          {quietNote && data.canReply ? (
            <View style={[styles.quiet, { backgroundColor: colors.amberSoft }]} accessibilityLiveRegion="polite">
              <Icon name="moon-outline" size={16} color={colors.amberInk} />
              <Text variant="small" style={[styles.flexShrink, { color: colors.amberInk }]}>
                The teacher will see this in school hours.
              </Text>
            </View>
          ) : null}
        </ScrollView>

        {data.canReply ? (
          <Composer
            value={text}
            onChangeText={setText}
            attachments={attachments}
            sending={sending}
            error={sendError}
            onSend={() => void send()}
          />
        ) : (
          <ReadOnlyBanner
            reason={data.readOnlyReason ?? 'You cannot reply to this conversation.'}
            closed={data.status === 'CLOSED'}
            closeReason={data.closeReason}
          />
        )}
      </KeyboardAvoidingView>
    </View>
  );
}

function ReadOnlyBanner({ reason, closed, closeReason }: { reason: string; closed: boolean; closeReason: string | null }) {
  const { colors } = useTheme();
  return (
    <View
      accessibilityRole="alert"
      style={[styles.banner, { backgroundColor: colors.accent, borderTopColor: colors.border }]}
      testID="read-only-banner"
    >
      <Icon name="lock-closed" size={20} color={colors.mutedForeground} />
      <View style={styles.flexShrink}>
        <Text variant="smallStrong">You cannot reply to this conversation</Text>
        <Text variant="small" tone="muted">
          {reason}
        </Text>
        {closed && closeReason ? (
          <Text variant="small" tone="muted">
            Reason: {closeReason}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  flexShrink: { flexShrink: 1 },
  loading: { padding: spacing.lg, gap: spacing.md },
  content: { padding: spacing.lg, gap: spacing.md, flexGrow: 1 },
  about: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radius.xl,
    borderWidth: StyleSheet.hairlineWidth,
  },
  aboutText: { flex: 1 },
  safety: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.xs },
  center: { alignSelf: 'center' },
  group: { gap: spacing.sm },
  dayRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginVertical: spacing.xs },
  dayLine: { flex: 1, height: StyleSheet.hairlineWidth },
  dayText: {},
  quiet: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radius.md,
    alignSelf: 'flex-end',
    maxWidth: '90%',
  },
  banner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
    padding: spacing.lg,
    paddingBottom: spacing.xxxl,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
});
