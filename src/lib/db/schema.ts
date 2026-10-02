import {
  index,
  integer,
  jsonb,
  primaryKey,
  pgTable,
  pgEnum,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

export const users = pgTable(
  'users',
  {
    id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
    name: text('name'),
    email: text('email'),
    emailVerified: timestamp('email_verified', { withTimezone: true }),
    image: text('image'),
    username: text('username'),
    passwordHash: text('password_hash'),
  },
  table => [
    uniqueIndex('users_email_idx').on(table.email),
    uniqueIndex('users_username_idx').on(table.username),
  ],
);

export const accounts = pgTable(
  'accounts',
  {
    userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    type: text('type').notNull(),
    provider: text('provider').notNull(),
    providerAccountId: text('provider_account_id').notNull(),
    refresh_token: text('refresh_token'),
    access_token: text('access_token'),
    expires_at: integer('expires_at'),
    token_type: text('token_type'),
    scope: text('scope'),
    id_token: text('id_token'),
    session_state: text('session_state'),
  },
  table => [primaryKey({ columns: [table.provider, table.providerAccountId] })],
);

export const sessions = pgTable('sessions', {
  sessionToken: text('session_token').primaryKey(),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  expires: timestamp('expires', { withTimezone: true }).notNull(),
});

export const verificationTokens = pgTable(
  'verification_tokens',
  {
    identifier: text('identifier').notNull(),
    token: text('token').notNull(),
    expires: timestamp('expires', { withTimezone: true }).notNull(),
  },
  table => [primaryKey({ columns: [table.identifier, table.token] })],
);

export const authRateLimits = pgTable('auth_rate_limits', {
  key: text('key').primaryKey(),
  count: integer('count').notNull().default(0),
  windowStartedAt: timestamp('window_started_at', { withTimezone: true }).notNull(),
});

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
      .references(() => browserSessions.id, { onDelete: 'set null' }),
    userId: text('user_id').references(() => users.id, { onDelete: 'set null' }),
    name: text('name').notNull(),
    description: text('description').notNull().default(''),
    gitRepoUrl: text('git_repo_url'),
    fileTree: jsonb('file_tree').$type<StoredFileNode[]>().notNull().default([]),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  table => [
    index('projects_session_updated_idx').on(table.sessionId, table.updatedAt),
    index('projects_user_updated_idx').on(table.userId, table.updatedAt),
  ],
);

export const databaseProvider = pgEnum('database_provider', ['netlify', 'neon']);

export const byoDatabases = pgTable(
  'byo_databases',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    provider: databaseProvider('provider').notNull().default('netlify'),
    connectionStringEncrypted: text('connection_string_encrypted'),
    neonApiKeyEncrypted: text('neon_api_key_encrypted'),
    neonProjectId: text('neon_project_id'),
    neonDatabaseName: text('neon_database_name'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  table => [uniqueIndex('byo_databases_project_id_idx').on(table.projectId)],
);