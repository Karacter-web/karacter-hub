import { DrizzleAdapter } from '@auth/drizzle-adapter';
import bcrypt from 'bcryptjs';
import { and, eq, isNull, or } from 'drizzle-orm';
import NextAuth, { type NextAuthConfig } from 'next-auth';
import Credentials from 'next-auth/providers/credentials';
import GitHub from 'next-auth/providers/github';
import Google from 'next-auth/providers/google';
import Resend from 'next-auth/providers/resend';
import { getDatabase } from '@/lib/db';
import { getBrowserSession } from '@/lib/db/browser-session';
import { consumeRateLimit, getClientAddress } from '@/lib/auth/rate-limit';
import { accounts, projects, sessions, users, verificationTokens } from '@/lib/db/schema';

const DUMMY_PASSWORD_HASH = bcrypt.hashSync(crypto.randomUUID(), 12);
const configuredProviders: NextAuthConfig['providers'] = [];

if (process.env.DATABASE_URL && process.env.AUTH_GOOGLE_ID && process.env.AUTH_GOOGLE_SECRET) {
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

if (process.env.DATABASE_URL && process.env.AUTH_GITHUB_ID && process.env.AUTH_GITHUB_SECRET) {
  configuredProviders.push(GitHub({
    profile(profile) {
      return {
        id: String(profile.id),
        name: profile.name ?? profile.login,
        email: profile.email?.toLowerCase() ?? null,
        image: profile.avatar_url,
      };
    },
  }));
}

if (process.env.DATABASE_URL && process.env.AUTH_RESEND_KEY && process.env.AUTH_EMAIL_FROM) {
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
    if (!identifier || !password || identifier.length > 254 || password.length > 72) return null;

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
  adapter: process.env.DATABASE_URL
    ? DrizzleAdapter(getDatabase(), {
      usersTable: users,
      accountsTable: accounts,
      sessionsTable: sessions,
      verificationTokensTable: verificationTokens,
    })
    : undefined,
  session: { strategy: 'jwt', maxAge: 60 * 60 * 24 * 30 },
  secret: process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET,
  trustHost: process.env.AUTH_TRUST_HOST === 'true',
  providers: configuredProviders,
  pages: { signIn: '/login', error: '/login', verifyRequest: '/verify-email' },
  callbacks: {
    async jwt({ token, user }) {
      if (user?.id) {
        token.sub = user.id;
        const browserSession = await getBrowserSession();
        if (browserSession) {
          await getDatabase()
            .update(projects)
            .set({ userId: user.id, sessionId: null })
            .where(and(eq(projects.sessionId, browserSession.id), isNull(projects.userId)));
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