import { redirect } from 'next/navigation';
import AuthPage from '@/components/auth/AuthPage';
import { getSafeCallbackUrl } from '@/lib/auth/redirect';
import { auth } from '@/lib/auth';
import { getAuthAvailability, getAuthErrorMessage } from '@/lib/auth/config';

interface LoginPageProps {
  searchParams: Promise<{ callbackUrl?: string; error?: string }>;
}

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const { callbackUrl, error } = await searchParams;
  const availability = getAuthAvailability();
  const session = availability.authConfigured ? await auth().catch(() => null) : null;
  if (session?.user?.id) redirect(getSafeCallbackUrl(callbackUrl));

  return (
    <AuthPage
      mode="login"
      callbackUrl={getSafeCallbackUrl(callbackUrl)}
      initialError={getAuthErrorMessage(error)}
      {...availability}
    />
  );
}