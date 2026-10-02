import { and, eq } from 'drizzle-orm';
import { getDatabase } from '@/db';
import { projects } from '@/lib/db/schema';

export async function getOwnedProject(projectId: string, userId: string) {
  const [project] = await getDatabase()
    .select()
    .from(projects)
    .where(and(eq(projects.id, projectId), eq(projects.userId, userId)))
    .limit(1);
  return project ?? null;
}