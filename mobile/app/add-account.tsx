import { SignInScreen } from '@/features/auth/SignInScreen';

/** Opened from the account pill and from Profile. After signing in, the app switches to the new account. */
export default function AddAccount() {
  return <SignInScreen adding />;
}
