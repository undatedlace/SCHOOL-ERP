import { zodResolver } from '@hookform/resolvers/zod';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useRef, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { Pressable, StyleSheet, View } from 'react-native';
import { z } from 'zod';
import { isApiError } from '@/api/errors';
import { useAuth } from '@/auth';
import { MIN_TOUCH, radius, spacing, useTheme } from '@/theme';
import { Button, Icon, Text, TextField, type TextInputHandle } from '@/ui';
import { useAppInfo } from './useAppInfo';

const SCHOOL_CODE_KEY = 'pref.schoolCode';

const schema = z.object({
  identifier: z.string().trim().min(1, 'Enter your student ID or email'),
  password: z.string().min(1, 'Enter your password'),
  schoolCode: z.string().trim().max(30).optional(),
});
type FormValues = z.infer<typeof schema>;

/** What a person should read when sign-in fails. */
export function signInErrorMessage(error: unknown): string {
  if (!isApiError(error)) return 'Something went wrong. Please try again.';
  if (error.code === 'unauthorized') {
    // "Your temporary password has expired" is worth saying; "invalid credentials" is said kindly.
    if (error.serverMessage && /expired|paused/i.test(error.serverMessage)) return error.serverMessage;
    return 'That ID or password is not right. Check it and try again.';
  }
  return error.message;
}

interface SignInFormProps {
  /** Called after a successful sign-in (to close the "add account" screen). */
  onSignedIn?: () => void;
}

/** The sign-in fields: ID or email, password, and, when the server offers it, a school code. */
export function SignInForm({ onSignedIn }: SignInFormProps) {
  const { colors } = useTheme();
  const { signIn, notice, clearNotice } = useAuth();
  const { data: info } = useAppInfo();
  const [serverError, setServerError] = useState<string | null>(null);
  const [showSchool, setShowSchool] = useState(false);
  const passwordRef = useRef<TextInputHandle>(null);

  const {
    control,
    handleSubmit,
    setValue,
    formState: { isSubmitting, errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { identifier: '', password: '', schoolCode: '' },
  });

  // Remember the school code on this phone, so it is not typed again.
  useEffect(() => {
    AsyncStorage.getItem(SCHOOL_CODE_KEY)
      .then((code) => {
        if (code) {
          setValue('schoolCode', code);
          setShowSchool(true);
        }
      })
      .catch(() => undefined);
  }, [setValue]);

  const onSubmit = handleSubmit(async (values) => {
    setServerError(null);
    clearNotice();
    try {
      await signIn({
        identifier: values.identifier,
        password: values.password,
        schoolCode: showSchool ? values.schoolCode : undefined,
      });
      if (showSchool && values.schoolCode?.trim()) {
        AsyncStorage.setItem(SCHOOL_CODE_KEY, values.schoolCode.trim().toLowerCase()).catch(() => undefined);
      }
      onSignedIn?.();
    } catch (e) {
      setServerError(signInErrorMessage(e));
    }
  });

  const message = serverError ?? notice;

  return (
    <View style={styles.form}>
      {message ? (
        <View
          style={[styles.error, { backgroundColor: colors.badSoft }]}
          accessibilityRole="alert"
          accessibilityLiveRegion="polite"
        >
          <Icon name="alert-circle" size={20} color={colors.bad} />
          <Text variant="small" tone="bad" style={styles.errorText}>
            {message}
          </Text>
        </View>
      ) : null}

      <Controller
        control={control}
        name="identifier"
        render={({ field: { value, onChange, onBlur } }) => (
          <TextField
            label="Student ID or email"
            value={value}
            onChangeText={onChange}
            onBlur={onBlur}
            error={errors.identifier?.message}
            autoComplete="username"
            textContentType="username"
            returnKeyType="next"
            onSubmitEditing={() => passwordRef.current?.focus()}
            testID="sign-in-identifier"
          />
        )}
      />
      <Controller
        control={control}
        name="password"
        render={({ field: { value, onChange, onBlur } }) => (
          <TextField
            ref={passwordRef}
            label="Password"
            secure
            value={value}
            onChangeText={onChange}
            onBlur={onBlur}
            error={errors.password?.message}
            autoComplete="current-password"
            textContentType="password"
            returnKeyType="go"
            onSubmitEditing={() => void onSubmit()}
            testID="sign-in-password"
          />
        )}
      />

      {info?.schoolCodeOffered ? (
        showSchool ? (
          <Controller
            control={control}
            name="schoolCode"
            render={({ field: { value, onChange, onBlur } }) => (
              <TextField
                label="School code"
                hint="Leave empty for your own school."
                value={value ?? ''}
                onChangeText={onChange}
                onBlur={onBlur}
                returnKeyType="go"
                onSubmitEditing={() => void onSubmit()}
                testID="sign-in-school"
              />
            )}
          />
        ) : (
          <Pressable
            onPress={() => setShowSchool(true)}
            accessibilityRole="button"
            style={styles.link}
          >
            <Text variant="smallStrong" tone="primary">
              Signing in to another school?
            </Text>
          </Pressable>
        )
      ) : null}

      <Button title="Sign in" onPress={() => void onSubmit()} loading={isSubmitting} testID="sign-in-submit" />

      <Text variant="small" tone="muted" align="center">
        Forgot your password? Ask the school office to reset it.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  form: { gap: spacing.lg },
  link: { minHeight: MIN_TOUCH, justifyContent: 'center', alignSelf: 'flex-start' },
  error: {
    flexDirection: 'row',
    gap: spacing.sm,
    alignItems: 'flex-start',
    padding: spacing.md,
    borderRadius: radius.md,
  },
  errorText: { flex: 1 },
});
