import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import type { ReactNode } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AuthProvider } from '@/auth';
import { ThemeProvider } from '@/theme';
import { SignInScreen } from './SignInScreen';

const metrics = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
};

function Providers({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    <SafeAreaProvider initialMetrics={metrics}>
      <ThemeProvider>
        <QueryClientProvider client={client}>
          <AuthProvider>{children}</AuthProvider>
        </QueryClientProvider>
      </ThemeProvider>
    </SafeAreaProvider>
  );
}

function mockServer(appInfo: object) {
  const calls: { url: string; init?: RequestInit }[] = [];
  globalThis.fetch = jest.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ url: String(url), init });
    const path = String(url);
    if (path.endsWith('/app-info')) return new Response(JSON.stringify(appInfo), { status: 200 });
    if (path.endsWith('/auth/login')) {
      return new Response(JSON.stringify({ message: 'Invalid credentials', statusCode: 401 }), { status: 401 });
    }
    return new Response('{}', { status: 200 });
  }) as unknown as typeof fetch;
  return calls;
}

describe('SignInScreen', () => {
  it('shows the sign-in fields and the forgotten-password hint', async () => {
    mockServer({ environmentLabel: null, feedbackUrl: null, schoolCodeOffered: false });
    await render(<SignInScreen />, { wrapper: Providers });

    expect(await screen.findByLabelText('Student ID or email')).toBeTruthy();
    expect(screen.getByLabelText('Password')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Sign in' })).toBeTruthy();
    expect(screen.getByText(/Ask the school office to reset it/)).toBeTruthy();
    // No school code link when the server has only one school; no test strip in production.
    expect(screen.queryByText('Signing in to another school?')).toBeNull();
    expect(screen.queryByText(/Sample data only/)).toBeNull();
  });

  it('offers a school code only when the server says so, and shows the test-copy strip', async () => {
    mockServer({
      environmentLabel: 'Test copy',
      feedbackUrl: 'https://forms.example/feedback',
      schoolCodeOffered: true,
    });
    await render(<SignInScreen />, { wrapper: Providers });

    expect(await screen.findByText(/Test copy\. Sample data only\./)).toBeTruthy();
    expect(screen.getByText('Send feedback')).toBeTruthy();

    const link = await screen.findByText('Signing in to another school?');
    expect(screen.queryByLabelText('School code')).toBeNull();
    await fireEvent.press(link);
    expect(await screen.findByLabelText('School code')).toBeTruthy();
  });

  it('asks for both fields before sending anything', async () => {
    const calls = mockServer({ environmentLabel: null, feedbackUrl: null, schoolCodeOffered: false });
    await render(<SignInScreen />, { wrapper: Providers });

    await fireEvent.press(await screen.findByRole('button', { name: 'Sign in' }));

    expect(await screen.findByText('Enter your student ID or email')).toBeTruthy();
    expect(screen.getByText('Enter your password')).toBeTruthy();
    expect(calls.some((c) => c.url.endsWith('/auth/login'))).toBe(false);
  });

  it('says it kindly when the ID or password is wrong, and sends the mobile headers without a token', async () => {
    const calls = mockServer({ environmentLabel: null, feedbackUrl: null, schoolCodeOffered: false });
    await render(<SignInScreen />, { wrapper: Providers });

    await fireEvent.changeText(await screen.findByLabelText('Student ID or email'), 'ds0002');
    await fireEvent.changeText(screen.getByLabelText('Password'), 'wrong-password');
    await fireEvent.press(screen.getByRole('button', { name: 'Sign in' }));

    expect(await screen.findByText(/That ID or password is not right/)).toBeTruthy();

    await waitFor(() => expect(calls.some((c) => c.url.endsWith('/api/v1/auth/login'))).toBe(true));
    const login = calls.find((c) => c.url.endsWith('/api/v1/auth/login'))!;
    const headers = login.init!.headers as Record<string, string>;
    expect(headers['X-Client']).toBe('mobile');
    expect(headers.Authorization).toBeUndefined();
    expect(JSON.parse(String(login.init!.body))).toEqual({ identifier: 'ds0002', password: 'wrong-password' });
  });
});
