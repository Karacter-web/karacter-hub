# Neon Database

KaracterHub uses Neon PostgreSQL as its application database. Set
`DATABASE_URL` to the pooled Neon connection string for runtime queries and
`DATABASE_URL_UNPOOLED` to the direct connection string for Drizzle tooling.
Both values must remain server-side.

## Local Development and Deployment

1. Create a Neon project and copy its pooled and direct connection strings.
2. Add them to `.env.local` as `DATABASE_URL` and `DATABASE_URL_UNPOOLED`.
3. Initialize the schema with `npm run db:generate`, review the generated SQL,
   and apply it with `npm run db:migrate`.
4. Add both URLs to the Vercel project's environment variables for the
   appropriate deploy environments.

`vercel.json` configures the Next.js framework. Vercel builds the app with
`npm run build`; local development uses `npm run dev`.

## Schema and Migrations

The application schema is in `src/lib/db/schema.ts`. It contains:

- Auth.js users, accounts, sessions, and verification tokens.
- Shared authentication and API rate limits.
- Hashed browser sessions and saved projects.
- Encrypted credentials for optional project-specific Neon databases.

For schema changes, update the schema, generate and review a migration, then
apply it to the intended Neon database:

```sh
npm run db:generate
npm run db:migrate
```

Use `DATABASE_URL_UNPOOLED` for migration operations. Review generated SQL and
back up production data before applying schema changes. `npm run db:smoke`
checks connectivity and basic database access.

## Optional Project-Specific Neon Databases

An owner can open `/app/settings/database`, select a saved project, and connect
a separate Neon database. The server validates the Neon host and tests the
connection before storing credentials encrypted with AES-256-GCM.

Set `CREDENTIAL_ENCRYPTION_KEY` to a base64-encoded random 32-byte key generated
with `openssl rand -base64 32` in local and Vercel server-side environment
settings. Never prefix it with `NEXT_PUBLIC_`. Connection strings and API keys
are never returned to the browser or logged. Each request verifies project
ownership, decrypts credentials only for the request lifetime, and closes the
per-project Neon pool.

Disconnecting removes only KaracterHub's encrypted connection record. That
project then uses the application's Neon database; the separate Neon project is
not changed or deleted. Project schema changes are shown for review and require
explicit confirmation before being applied in one transaction. A per-project
advisory lock and the `schema_migrations` hash ledger prevent duplicate or
modified migrations from being applied silently.

## Moving an Existing Database

Changing the deployment configuration does not copy data from an existing
database. Create the schema in Neon from the current migrations, then export
data-only from the source PostgreSQL database and import it to Neon. Back up the
source first, validate imported users and projects, and only then update
Vercel's `DATABASE_URL` values.
