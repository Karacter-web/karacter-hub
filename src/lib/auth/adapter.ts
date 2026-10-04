import type { Adapter, AdapterAccount, AdapterSession, AdapterUser, VerificationToken } from '@auth/core/adapters';
import { and, eq } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { getDatabase } from '@/db';
import { accounts, sessions, users, verificationTokens } from '@/lib/db/schema';

export function createAuthAdapter(): Adapter {
  return {
    async createUser(user) {
      const [created] = await getDatabase()
        .insert(users)
        .values({
          id: randomUUID(),
          name: user.name,
          email: user.email,
          emailVerified: user.emailVerified,
          image: user.image,
        })
        .returning();
      return created as AdapterUser;
    },
    async getUser(id) {
      const [user] = await getDatabase().select().from(users).where(eq(users.id, id)).limit(1);
      return (user as AdapterUser | undefined) ?? null;
    },
    async getUserByEmail(email) {
      const [user] = await getDatabase().select().from(users).where(eq(users.email, email)).limit(1);
      return (user as AdapterUser | undefined) ?? null;
    },
    async getUserByAccount({ provider, providerAccountId }) {
      const [result] = await getDatabase()
        .select({ user: users })
        .from(accounts)
        .innerJoin(users, eq(accounts.userId, users.id))
        .where(and(eq(accounts.provider, provider), eq(accounts.providerAccountId, providerAccountId)))
        .limit(1);
      return (result?.user as AdapterUser | undefined) ?? null;
    },
    async updateUser({ id, ...updates }) {
      const [user] = await getDatabase()
        .update(users)
        .set(updates)
        .where(eq(users.id, id))
        .returning();
      if (!user) throw new Error('Auth user not found.');
      return user as AdapterUser;
    },
    async deleteUser(id) {
      const [user] = await getDatabase().delete(users).where(eq(users.id, id)).returning();
      return (user as AdapterUser | undefined) ?? null;
    },
    async linkAccount(account) {
      const [linked] = await getDatabase().insert(accounts).values(account).returning();
      return (linked as AdapterAccount | undefined) ?? null;
    },
    async unlinkAccount({ provider, providerAccountId }) {
      const [unlinked] = await getDatabase()
        .delete(accounts)
        .where(and(eq(accounts.provider, provider), eq(accounts.providerAccountId, providerAccountId)))
        .returning();
      return unlinked as AdapterAccount | undefined;
    },
    async createSession(session) {
      const [created] = await getDatabase().insert(sessions).values(session).returning();
      return created as AdapterSession;
    },
    async getSessionAndUser(sessionToken) {
      const [result] = await getDatabase()
        .select({ session: sessions, user: users })
        .from(sessions)
        .innerJoin(users, eq(sessions.userId, users.id))
        .where(eq(sessions.sessionToken, sessionToken))
        .limit(1);
      if (!result) return null;
      return { session: result.session as AdapterSession, user: result.user as AdapterUser };
    },
    async updateSession({ sessionToken, ...updates }) {
      const [session] = await getDatabase()
        .update(sessions)
        .set(updates)
        .where(eq(sessions.sessionToken, sessionToken))
        .returning();
      return (session as AdapterSession | undefined) ?? null;
    },
    async deleteSession(sessionToken) {
      const [session] = await getDatabase().delete(sessions).where(eq(sessions.sessionToken, sessionToken)).returning();
      return (session as AdapterSession | undefined) ?? null;
    },
    async createVerificationToken(token) {
      const [created] = await getDatabase().insert(verificationTokens).values(token).returning();
      return (created as VerificationToken | undefined) ?? null;
    },
    async useVerificationToken({ identifier, token }) {
      const [used] = await getDatabase()
        .delete(verificationTokens)
        .where(and(eq(verificationTokens.identifier, identifier), eq(verificationTokens.token, token)))
        .returning();
      return (used as VerificationToken | undefined) ?? null;
    },
    async getAccount(providerAccountId, provider) {
      const [account] = await getDatabase()
        .select()
        .from(accounts)
        .where(and(eq(accounts.provider, provider), eq(accounts.providerAccountId, providerAccountId)))
        .limit(1);
      return (account as AdapterAccount | undefined) ?? null;
    },
  };
}