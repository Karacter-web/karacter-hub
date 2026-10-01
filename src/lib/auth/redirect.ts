export function getSafeCallbackUrl(value: unknown) {
  if (typeof value !== 'string' || !value.startsWith('/') || value.startsWith('//')) return '/app';
  if (value === '/login' || value.startsWith('/login?') || value === '/signup' || value.startsWith('/signup?')) return '/app';
  return value;
}