import bcrypt from 'bcryptjs';
import { and, eq, isNull, or } from 'drizzle-orm';
import NextAuth, { type NextAuthConfig } from 'next-auth';
import Credentials from 'next-auth/providers/credentials';
import GitHub from 'next-auth/providers/github';
import Google from 'next-auth/providers/google';
import Resend from 'next-auth/providers/resend';
import { getDatabase, hasDatabaseConfiguration } from '@/lib/db';
import { getBrowserSession } from '@/lib/db/browser-session';
import { consumeRateLimit, getClientAddress } from '@/lib/auth/rate-limit';
import { createNetlifyAuthAdapter } from '@/lib/auth/adapter';
import { getAuthAvailability, getAuthSecret, shouldTrustHost } from '@/lib/auth/config';
import { projects, users } from '@/lib/db/schema';

const DUMMY_PASSWORD_HASH = bcrypt.hashSync(crypto.randomUUID(), 12);
const configuredProviders: NextAuthConfig['providers'] = [];
const availability = getAuthAvailability();

interface GitHubEmail {
  email: string;
  primary: boolean;
  verified: boolean;
}

if (availability.googleEnabled) {
  configuredProviders.push(Google({
    profile(profile) {
      return {
        id: profile.sub,
        name: profile.name,
        email: profile.email?.toLowerCase() ?? null,
        image: profile.picture,
        emailVerified: profile.email_verified ? new Date() : null,
      };
    },
  }));
}

if (availability.githubEnabled) {
  configuredProviders.push(GitHub({
    // Only verified addresses are trusted, which makes email-based linking safe.
    allowDangerousEmailAccountLinking: true,
    userinfo: {
      url: 'https://api.github.com/user',
      async request({ tokens }: { tokens: { access_token?: string } }) {
        const headers = { Authorization: `Bearer ${tokens.access_token}`, 'User-Agent': 'KaracterHub' };
        const profile = await fetch('https://api.github.com/user', { headers }).then(response => response.json());
        const emailsResponse = await fetch('https://api.github.com/user/emails', { headers });
        const emails: GitHubEmail[] = emailsResponse.ok ? await emailsResponse.json() : [];
        const verified = emails.find(entry => entry.primary && entry.verified) ?? emails.find(entry => entry.verified);
        return { ...profile, email: verified?.email ?? null, email_verified: Boolean(verified) };
      },
    },
    profile(profile) {
      return {
        id: String(profile.id),
        name: profile.name ?? profile.login,
        email: profile.email?.toLowerCase() ?? null,
        image: profile.avatar_url,
        emailVerified: (profile as typeof profile & { email_verified?: boolean }).email_verified ? new Date() : null,
      };
    },
  }));
}

if (availability.emailEnabled) {
  const resendProvider = Resend({
    apiKey: process.env.AUTH_RESEND_KEY,
    from: process.env.AUTH_EMAIL_FROM,
  });
  configuredProviders.push({
    ...resendProvider,
    async sendVerificationRequest(params) {
      const limit = await consumeRateLimit(`email-link:${params.identifier.toLowerCase()}`, 5, 60 * 60 * 1000);
      if (!limit.allowed) throw new Error('Too many email-link requests. Try again later.');
      await resendProvider.sendVerificationRequest(params);
    },
  });
}

configuredProviders.push(Credentials({
  credentials: {
    identifier: { label: 'Email or username', type: 'text' },
    password: { label: 'Password', type: 'password' },
  },
  async authorize(credentials, request) {
    const identifier = typeof credentials.identifier === 'string'
      ? credentials.identifier.trim().toLowerCase()
      : '';
    const password = typeof credentials.password === 'string' ? credentials.password : '';
    if (!identifier || !password || identifier.length > 254 || Buffer.byteLength(password, 'utf8') > 72) return null;

    const address = getClientAddress(request.headers);
    const limit = await consumeRateLimit(`credentials:${address}:${identifier}`, 8, 15 * 60 * 1000);
    if (!limit.allowed) return null;

    const [user] = await getDatabase()
      .select({
        id: users.id,
        name: users.name,
        email: users.email,
        emailVerified: users.emailVerified,
        image: users.image,
        passwordHash: users.passwordHash,
      })
      .from(users)
      .where(or(eq(users.email, identifier), eq(users.username, identifier)))
      .limit(1);

    const passwordHash = user?.passwordHash ?? DUMMY_PASSWORD_HASH;
    const passwordMatches = await bcrypt.compare(password, passwordHash);
    if (!user?.passwordHash || !user.emailVerified || !passwordMatches) return null;

    return { id: user.id, name: user.name, email: user.email, image: user.image };
  },
}));

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: hasDatabaseConfiguration() ? createNetlifyAuthAdapter() : undefined,
  session: { strategy: 'jwt', maxAge: 60 * 60 * 24 * 30 },
  secret: getAuthSecret(),
  trustHost: shouldTrustHost(),
  providers: configuredProviders,
  pages: { signIn: '/login', error: '/login', verifyRequest: '/verify-email' },
  events: {
    async linkAccount({ user, profile }) {
      // A verified OAuth email proves ownership. Drop any password set by whoever
      // registered the address before it was verified, so it can't be used later.
      if (!user.id || !profile || !('emailVerified' in profile) || !profile.emailVerified) return;
      await getDatabase()
        .update(users)
        .set({ emailVerified: new Date(), passwordHash: null })
        .where(and(eq(users.id, user.id), isNull(users.emailVerified)));
    },
  },
  callbacks: {
    async jwt({ token, user }) {
      if (user?.id) {
        token.sub = user.id;
        try {
          const browserSession = await getBrowserSession();
          if (browserSession) {
            await getDatabase()
              .update(projects)
              .set({ userId: user.id, sessionId: null })
              .where(and(eq(projects.sessionId, browserSession.id), isNull(projects.userId)));
          }
        } catch (error) {
          // Claiming guest projects is best-effort and must never block sign-in.
          console.error('Failed to claim guest projects on sign-in', error);
        }
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user && token.sub) session.user.id = token.sub;
      return session;
    },
  },
});