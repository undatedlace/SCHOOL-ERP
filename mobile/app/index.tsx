import { Redirect } from 'expo-router';
import { useAuth } from '@/auth';

/** The front door: sends each person to where they belong. */
export default function Index() {
  const { status, active, locked, mustChangePassword } = useAuth();

  if (status !== 'ready' || !active) return <Redirect href="/sign-in" />;
  if (locked) return <Redirect href="/locked" />;
  if (mustChangePassword) return <Redirect href="/change-password" />;
  if (active.kind === 'family') return <Redirect href="/family" />;
  if (active.kind === 'teacher') return <Redirect href="/teacher" />;
  return <Redirect href="/unsupported" />;
}
