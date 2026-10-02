import { redirect } from 'next/navigation';
import AuthPage from '@/components/auth/AuthPage';
import { getSafeCallbackUrl } from '@/lib/auth/redirect';
import { auth } from '@/lib/auth';
import { hasDatabaseConfiguration } from '@/db';

interface SignupPageProps {
  searchParams: Promise<{ callbackUrl?: string }>;
}

export default async function SignupPage({ searchParams }: SignupPageProps) {
  const { callbackUrl } = await searchParams;
  const session = await auth();
  if (session?.user?.id) redirect(getSafeCallbackUrl(callbackUrl));

  return (
    <AuthPage
      mode="signup"
      callbackUrl={getSafeCallbackUrl(callbackUrl)}
      databaseEnabled={hasDatabaseConfiguration()}
      googleEnabled={Boolean(hasDatabaseConfiguration() && process.env.AUTH_GOOGLE_ID && process.env.AUTH_GOOGLE_SECRET)}
      githubEnabled={Boolean(hasDatabaseConfiguration() && process.env.AUTH_GITHUB_ID && process.env.AUTH_GITHUB_SECRET)}
      emailEnabled={Boolean(hasDatabaseConfiguration() && process.env.AUTH_RESEND_KEY && process.env.AUTH_EMAIL_FROM)}
    />
  );
}