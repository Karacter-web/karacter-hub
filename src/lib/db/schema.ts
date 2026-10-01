import {
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

export interface StoredFileNode {
  path: string;
  content: string;
  status: 'generating' | 'idle' | 'error';
  isDirectory?: boolean;
  children?: StoredFileNode[];
}

export const browserSessions = pgTable(
  'browser_sessions',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    tokenHash: text('token_hash').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  },
  table => [uniqueIndex('browser_sessions_token_hash_idx').on(table.tokenHash)],
);

export const projects = pgTable(
  'projects',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    sessionId: uuid('session_id')
      .notNull()
      .references(() => browserSessions.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    description: text('description').notNull().default(''),
    gitRepoUrl: text('git_repo_url'),
    fileTree: jsonb('file_tree').$type<StoredFileNode[]>().notNull().default([]),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  table => [index('projects_session_updated_idx').on(table.sessionId, table.updatedAt)],
);