import Link from 'next/link';
import { redirect } from 'next/navigation';
import { and, desc, eq } from 'drizzle-orm';
import { ArrowLeft } from 'lucide-react';
import DatabaseSettingsPanel from '@/components/database/DatabaseSettingsPanel';
import { auth } from '@/lib/auth';
import { getDatabase } from '@/db';
import { projects } from '@/lib/db/schema';

interface DatabaseSettingsPageProps {
  searchParams: Promise<{ projectId?: string }>;
}

export default async function DatabaseSettingsPage({ searchParams }: DatabaseSettingsPageProps) {
  const session = await auth();
  if (!session?.user?.id) redirect('/login?callbackUrl=%2Fapp%2Fsettings%2Fdatabase');
  const { projectId } = await searchParams;

  const savedProjects = await getDatabase()
    .select({ id: projects.id, name: projects.name })
    .from(projects)
    .where(and(eq(projects.userId, session.user.id)))
    .orderBy(desc(projects.updatedAt));
  const initialProjectId = savedProjects.some(project => project.id === projectId)
    ? projectId!
    : savedProjects[0]?.id ?? '';

  return (
    <main className="min-h-screen bg-canvas text-ink">
      <header className="flex h-[66px] items-center border-b border-line bg-white px-5 sm:px-9">
        <Link href="/app/settings" className="inline-flex items-center gap-2 text-[12px] font-medium text-ink-soft hover:text-ink"><ArrowLeft size={15} /> Account settings</Link>
        <span className="ml-auto text-[12px] font-semibold">KaracterHub</span>
      </header>
      <div className="mx-auto max-w-[980px] px-5 py-9 sm:px-9 sm:py-12">
        <DatabaseSettingsPanel projects={savedProjects} initialProjectId={initialProjectId} />
      </div>
    </main>
  );
}