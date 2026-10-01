import { redirect } from 'next/navigation';
import AuthPage from '@/components/auth/AuthPage';
import { getSafeCallbackUrl } from '@/lib/auth/redirect';
import { auth } from '@/lib/auth';

interface LoginPageProps {
  searchParams: Promise<{ callbackUrl?: string }>;
}

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const { callbackUrl } = await searchParams;
  const session = await auth();
  if (session?.user?.id) redirect(getSafeCallbackUrl(callbackUrl));

  return (
    <AuthPage
      mode="login"
      callbackUrl={getSafeCallbackUrl(callbackUrl)}
      databaseEnabled={Boolean(process.env.DATABASE_URL)}
      googleEnabled={Boolean(process.env.DATABASE_URL && process.env.AUTH_GOOGLE_ID && process.env.AUTH_GOOGLE_SECRET)}
      githubEnabled={Boolean(process.env.DATABASE_URL && process.env.AUTH_GITHUB_ID && process.env.AUTH_GITHUB_SECRET)}
      emailEnabled={Boolean(process.env.DATABASE_URL && process.env.AUTH_RESEND_KEY && process.env.AUTH_EMAIL_FROM)}
    />
  );
}