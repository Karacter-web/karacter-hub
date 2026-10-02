import Link from 'next/link';
import { redirect } from 'next/navigation';
import { eq } from 'drizzle-orm';
import { ArrowLeft, Database } from 'lucide-react';
import ProfileSettings from '@/components/auth/ProfileSettings';
import { auth } from '@/lib/auth';
import { getDatabase } from '@/lib/db';
import { accounts, users } from '@/lib/db/schema';

export default async function AccountSettingsPage() {
  const session = await auth();
  if (!session?.user?.id) redirect('/login?callbackUrl=%2Fapp%2Fsettings');

  const database = getDatabase();
  const [user] = await database
    .select({ name: users.name, username: users.username, email: users.email, hasPassword: users.passwordHash })
    .from(users)
    .where(eq(users.id, session.user.id))
    .limit(1);
  const linkedAccounts = await database
    .select({ provider: accounts.provider })
    .from(accounts)
    .where(eq(accounts.userId, session.user.id));
  const providers = new Set(linkedAccounts.map(account => account.provider));
  if (user?.hasPassword) providers.add('credentials');

  return (
    <main className="min-h-screen bg-canvas text-ink">
      <header className="flex h-[66px] items-center border-b border-line bg-white px-5 sm:px-9">
        <Link href="/app" className="inline-flex items-center gap-2 text-[12px] font-medium text-ink-soft hover:text-ink"><ArrowLeft size={15} /> Back to workspace</Link>
        <div className="ml-auto flex items-center gap-4">
          <Link href="/app/settings/database" className="inline-flex items-center gap-1.5 text-[11px] font-medium text-ink-soft hover:text-ink"><Database size={14} /> Database</Link>
          <span className="text-[12px] font-semibold">KaracterHub</span>
        </div>
      </header>
      <div className="mx-auto max-w-[980px] px-5 py-9 sm:px-9 sm:py-12">
        {user ? <ProfileSettings name={user.name ?? ''} username={user.username ?? ''} email={user.email ?? ''} providers={Array.from(providers)} /> : <p>Account not found.</p>}
      </div>
    </main>
  );
}