export function hasVerifiedOAuthEmail(profile: unknown): profile is Record<string, unknown> & { email: string } {
  if (!profile || typeof profile !== 'object') return false;
  const fields = profile as Record<string, unknown>;
  return (
    typeof fields.email === 'string'
    && fields.email.length > 0
    && (fields.email_verified === true || fields.emailVerified === true
      || fields.emailVerified instanceof Date)
  );
}
