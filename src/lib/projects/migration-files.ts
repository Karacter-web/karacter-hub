import type { StoredFileNode } from '@/lib/db/schema';
import type { ProjectMigration } from '@/lib/neon/migrations';

const MAX_MIGRATION_COUNT = 100;
const MAX_MIGRATION_BYTES = 2_000_000;
const MAX_TOTAL_BYTES = 8_000_000;

export function extractProjectMigrations(fileTree: StoredFileNode[]): ProjectMigration[] {
  const files: ProjectMigration[] = [];
  let totalBytes = 0;

  function visit(nodes: StoredFileNode[], parent: string) {
    for (const node of nodes) {
      const path = parent ? `${parent}/${node.path}` : node.path;
      if (node.isDirectory) {
        visit(node.children ?? [], path);
        continue;
      }
      if (!/^drizzle\/(?:migrations\/)?[^/]+\.sql$/i.test(path)) continue;
      const bytes = Buffer.byteLength(node.content, 'utf8');
      totalBytes += bytes;
      if (bytes > MAX_MIGRATION_BYTES || totalBytes > MAX_TOTAL_BYTES || files.length >= MAX_MIGRATION_COUNT) {
        throw new Error('Project migration files exceed the allowed limit.');
      }
      files.push({ name: path.slice('drizzle/'.length), sql: node.content });
    }
  }

  visit(fileTree, '');
  return files.sort((left, right) => left.name.localeCompare(right.name));
}