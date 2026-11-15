import { zodResolver } from '@hookform/resolvers/zod';
import { useRef, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { StyleSheet, View } from 'react-native';
import { z } from 'zod';
import { isApiError } from '@/api/errors';
import { useAuth } from '@/auth';
import { spacing } from '@/theme';
import { Button, Text, TextField, type TextInputHandle } from '@/ui';

const schema = z
  .object({
    currentPassword: z.string().min(1, 'Enter your current password'),
    newPassword: z
      .string()
      .min(10, 'Use at least 10 characters')
      .max(128, 'Use at most 128 characters'),
    confirm: z.string(),
  })
  .refine((v) => v.newPassword === v.confirm, {
    path: ['confirm'],
    message: 'The two new passwords do not match',
  })
  .refine((v) => v.newPassword !== v.currentPassword, {
    path: ['newPassword'],
    message: 'Choose a password you have not used before',
  });
type FormValues = z.infer<typeof schema>;

interface ChangePasswordFormProps {
  /** Called after the password was changed. */
  onDone?: () => void;
  /** Label of the current-password box: forced change says "Temporary password". */
  currentLabel?: string;
}

/** Change the password. Used for the forced change after a temporary password, and from Profile. */
export function ChangePasswordForm({ onDone, currentLabel = 'Current password' }: ChangePasswordFormProps) {
  const { changePassword } = useAuth();
  const [serverError, setServerError] = useState<string | null>(null);
  const newRef = useRef<TextInputHandle>(null);
  const confirmRef = useRef<TextInputHandle>(null);

  const {
    control,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { currentPassword: '', newPassword: '', confirm: '' },
  });

  const onSubmit = handleSubmit(async ({ currentPassword, newPassword }) => {
    setServerError(null);
    try {
      await changePassword({ currentPassword, newPassword });
      onDone?.();
    } catch (e) {
      if (isApiError(e) && e.code === 'unauthorized') {
        setServerError('The current password is not right.');
      } else if (isApiError(e)) {
        setServerError(e.message);
      } else {
        setServerError('Something went wrong. Please try again.');
      }
    }
  });

  return (
    <View style={styles.form}>
      <Controller
        control={control}
        name="currentPassword"
        render={({ field: { value, onChange, onBlur } }) => (
          <TextField
            label={currentLabel}
            secure
            value={value}
            onChangeText={onChange}
            onBlur={onBlur}
            error={errors.currentPassword?.message}
            textContentType="password"
            returnKeyType="next"
            onSubmitEditing={() => newRef.current?.focus()}
            testID="change-current"
          />
        )}
      />
      <Controller
        control={control}
        name="newPassword"
        render={({ field: { value, onChange, onBlur } }) => (
          <TextField
            ref={newRef}
            label="New password"
            hint="At least 10 characters."
            secure
            value={value}
            onChangeText={onChange}
            onBlur={onBlur}
            error={errors.newPassword?.message}
            textContentType="newPassword"
            returnKeyType="next"
            onSubmitEditing={() => confirmRef.current?.focus()}
            testID="change-new"
          />
        )}
      />
      <Controller
        control={control}
        name="confirm"
        render={({ field: { value, onChange, onBlur } }) => (
          <TextField
            ref={confirmRef}
            label="Type the new password again"
            secure
            value={value}
            onChangeText={onChange}
            onBlur={onBlur}
            error={errors.confirm?.message}
            textContentType="newPassword"
            returnKeyType="go"
            onSubmitEditing={() => void onSubmit()}
            testID="change-confirm"
          />
        )}
      />
      {serverError ? (
        <Text variant="small" tone="bad" accessibilityRole="alert">
          {serverError}
        </Text>
      ) : null}
      <Button title="Save new password" onPress={() => void onSubmit()} loading={isSubmitting} testID="change-submit" />
    </View>
  );
}

const styles = StyleSheet.create({
  form: { gap: spacing.lg },
});
