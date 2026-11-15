import type { ReactNode } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { spacing, useTheme } from '@/theme';

interface ScreenProps {
  children: ReactNode;
  /** Pull to refresh: give both. */
  onRefresh?: () => void;
  refreshing?: boolean;
  /** Leave room for the status bar. Not needed under a header. Default false. */
  safeTop?: boolean;
  /** Leave room for the home indicator. Not needed above a tab bar. Default false. */
  safeBottom?: boolean;
  /** Scroll the content. Default true. Use false for screens that manage their own list. */
  scroll?: boolean;
  /** Move up when the keyboard opens (forms). Default false. */
  keyboard?: boolean;
  /** Space around the content. Default lg. */
  padding?: number;
  contentStyle?: StyleProp<ViewStyle>;
  testID?: string;
}

/** The base of every screen: background, safe areas, scrolling, pull to refresh. */
export function Screen({
  children,
  onRefresh,
  refreshing = false,
  safeTop = false,
  safeBottom = false,
  scroll = true,
  keyboard = false,
  padding = spacing.lg,
  contentStyle,
  testID,
}: ScreenProps) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();

  const pad: ViewStyle = {
    padding,
    paddingTop: padding + (safeTop ? insets.top : 0),
    paddingBottom: padding + (safeBottom ? insets.bottom : 0),
  };

  const body = scroll ? (
    <ScrollView
      testID={testID}
      style={styles.flex}
      contentContainerStyle={[styles.content, pad, contentStyle]}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
      refreshControl={
        onRefresh ? (
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.primary}
            colors={[colors.primary]}
          />
        ) : undefined
      }
    >
      {children}
    </ScrollView>
  ) : (
    <View testID={testID} style={[styles.flex, pad, contentStyle]}>
      {children}
    </View>
  );

  return (
    <View style={[styles.flex, { backgroundColor: colors.background }]}>
      {keyboard ? (
        <KeyboardAvoidingView
          style={styles.flex}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          {body}
        </KeyboardAvoidingView>
      ) : (
        body
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { gap: spacing.lg, flexGrow: 1 },
});
