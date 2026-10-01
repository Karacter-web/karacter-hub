# Neon PostgreSQL

KaracterHub uses Neon Postgres through `@neondatabase/serverless` and Drizzle
ORM. The Next.js API routes are the only database clients; the browser never
receives the connection string.

## Provision Neon

1. Create a project and database in the Neon Console.
2. Open the database's connection details and copy the **pooled** connection
   string. Keep its password private.
3. Set the string as `DATABASE_URL` in local `.env.local` and in Netlify's
   server-side environment variables for every deploy context that needs project
   storage. Do not prefix it with `NEXT_PUBLIC_`.
4. Run the committed migrations against that database:

   ```sh
   npm run db:migrate
   ```

5. Start the app and check the project library. When `DATABASE_URL` is absent
   or the database is unreachable, the app reports storage as unavailable;
   generation and preview remain separate features.

## Schema and Migrations

The schema lives in `src/lib/db/schema.ts`:

- `browser_sessions` stores a SHA-256 hash of a random browser token and a
  30-day expiry. The raw token is only held in an HttpOnly, SameSite=Lax cookie.
- `projects` stores project metadata and its generated file tree as JSONB. Each
  project belongs to one browser session, with a foreign key and a session/time
  index.

For schema changes, update the Drizzle schema, then create and review a
migration:

```sh
npm run db:generate
npm run db:migrate
```

Commit the generated SQL and Drizzle journal together with the schema change.
Use `npm run db:studio` for local inspection. `drizzle.config.ts` reads
`.env.local` for local commands.

## Current Identity Boundary

Project ownership is browser-session scoped, not account scoped. The API checks
the session cookie and includes its database ID in every project query, so a
project UUID alone does not grant access. Clearing the cookie or changing
browsers loses access to that anonymous library; account login and session
transfer should be added before promising cross-device recovery or team
workspaces. Expired session cleanup can be added as a scheduled database task.

The AI and GitHub credentials belong in Netlify's server environment settings.
Never put private values in `NEXT_PUBLIC_*` variables or generated project
files.