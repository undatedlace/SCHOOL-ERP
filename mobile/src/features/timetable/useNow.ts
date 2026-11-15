import { useEffect, useState } from 'react';
import { AppState } from 'react-native';
import { minutesNowIST } from '@/lib/dates';

/**
 * The current moment, refreshed when the minute changes and when the app comes back to the
 * front, so a "now" line moves without anyone touching the screen.
 */
export function useNow(): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const tick = () =>
      setNow((previous) => {
        const next = new Date();
        return minutesNowIST(next) === minutesNowIST(previous) && next.getTime() - previous.getTime() < 60_000
          ? previous
          : next;
      });
    const timer = setInterval(tick, 15_000);
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') tick();
    });
    return () => {
      clearInterval(timer);
      sub.remove();
    };
  }, []);
  return now;
}
