import { usePreventRemove } from 'expo-router';
import { useState } from 'react';
import { Alert } from 'react-native';

/**
 * Asks before leaving a screen with marks that are not saved yet (back button or swipe), so a
 * morning's register is not lost by a stray tap.
 */
export function useUnsavedGuard(dirty: boolean) {
  const [discarding, setDiscarding] = useState(false);
  usePreventRemove(dirty && !discarding, ({ repeat }) => {
    Alert.alert('Leave without saving?', 'The marks you chose have not been saved.', [
      { text: 'Stay', style: 'cancel' },
      {
        text: 'Leave',
        style: 'destructive',
        onPress: () => {
          setDiscarding(true);
          repeat();
        },
      },
    ]);
  });
}
