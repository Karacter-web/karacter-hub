# Netlify Database and Optional Neon

KaracterHub uses `@netlify/database` and Drizzle's native Netlify adapter by
default. Netlify resolves the managed connection automatically; the app does
not need a database URL. Installing the package provisions the database on the
first deploy, and Netlify applies committed migration files during deployment.
Netlify Database is available on credit-based plans.

## Local Development

Run `npm run dev` (`netlify dev`) after authenticating and linking the project
with the Netlify CLI. Local database migrations are applied by
`npm run db:migrate:local`, which targets the Netlify CLI's local database.
Generate reviewed migration files with `npm run db:generate`; files are written
to `netlify/database/migrations/`.

Never run `drizzle-kit push`. Never run `drizzle-kit migrate` against a hosted
Netlify database. Hosted migrations are applied only through the Netlify deploy
lifecycle.

## Schema and Migrations

The product schema is in `src/lib/db/schema.ts`. It contains:

- Auth.js `users`, `accounts`, `sessions`, and `verification_tokens` tables.
- `auth_rate_limits` for shared throttling across serverless instances.
- `browser_sessions` for hashed guest-session tokens.
- `projects` for generated files, account ownership, and legacy guest ownership.
- `byo_databases` for a per-project provider selection and encrypted optional
  Neon credentials. The default Netlify path stores no connection string.

For schema changes, update the TypeScript schema and generate/review a migration:

```sh
npm run db:generate
npm run db:migrate:local
```

The second command applies to the local database only. Commit generated SQL and
snapshots; Netlify applies these during deploy. Use `npm run db:studio` for local
inspection. Drizzle config uses `NETLIFY_DB_URL` when supplied by Netlify CLI.

## Optional BYO Neon

The project owner can open `/app/settings/database`, select a saved project, and
choose **Bring your own Neon**. Paste a Neon PostgreSQL connection string and,
optionally, a Neon API key. The server validates the Neon host and tests the
connection before storing either credential encrypted with AES-256-GCM.

Set `CREDENTIAL_ENCRYPTION_KEY` to a base64-encoded random 32-byte key generated
with `openssl rand -base64 32` in local and Netlify server-side environment
settings. Do not prefix it with `NEXT_PUBLIC_`. Connection strings and API keys
are never returned to the browser or logged. Each BYO request verifies project
ownership, decrypts only for the request lifetime, and closes its Neon pool.

Disconnecting removes KaracterHub's encrypted connection record and returns
that project to Netlify Database; it does not alter or delete the external Neon
project. Netlify never automatically applies schema migrations to BYO Neon. The
owner must review the SQL preview and explicitly confirm **Push schema**. That
route runs pending migrations in one external transaction, uses a per-project
advisory lock, and records hashes in the external `schema_migrations` ledger.