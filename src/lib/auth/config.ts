import { hasDatabaseConfiguration } from '@/db';

export function getAuthSecret() {
  return process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET;
}

/**
 * Netlify terminates TLS and forwards the original host, so the incoming host
 * is trustworthy there. AUTH_TRUST_HOST still overrides this when set.
 */
export function shouldTrustHost() {
  if (process.env.AUTH_TRUST_HOST) return process.env.AUTH_TRUST_HOST === 'true';
  return Boolean(
    process.env.AUTH_URL
    || process.env.NETLIFY
    || process.env.NETLIFY_LOCAL
    || process.env.SITE_ID
    || process.env.NODE_ENV !== 'production',
  );
}

export function getAuthAvailability() {
  const databaseEnabled = hasDatabaseConfiguration();
  return {
    authConfigured: Boolean(getAuthSecret()),
    databaseEnabled,
    googleEnabled: Boolean(databaseEnabled && process.env.AUTH_GOOGLE_ID && process.env.AUTH_GOOGLE_SECRET),
    githubEnabled: Boolean(databaseEnabled && process.env.AUTH_GITHUB_ID && process.env.AUTH_GITHUB_SECRET),
    emailEnabled: Boolean(databaseEnabled && process.env.AUTH_RESEND_KEY && process.env.AUTH_EMAIL_FROM),
  };
}

const AUTH_ERROR_MESSAGES: Record<string, string> = {
  Configuration: 'Sign-in is misconfigured on the server. Please try again later.',
  AccessDenied: 'Access was denied. Please try a different sign-in method.',
  Verification: 'That sign-in link has expired or was already used. Request a new one.',
  OAuthAccountNotLinked: 'This email is already linked to another sign-in method. Use the method you signed up with.',
  OAuthCallbackError: 'GitHub or Google did not complete the sign-in. Please try again.',
  OAuthSignin: 'The identity provider could not start sign-in. Please try again.',
  CredentialsSignin: 'Those sign-in details were not accepted.',
};

export function getAuthErrorMessage(error: unknown) {
  if (typeof error !== 'string' || !error) return '';
  return AUTH_ERROR_MESSAGES[error] ?? 'Sign-in could not be completed. Please try again.';
}
