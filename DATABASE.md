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

- Auth.js `users`, `accounts`, `sessions`, and `verification_tokens` tables store accounts and OAuth identities. Auth.js uses JWT sessions; the session table remains available to the adapter.
- `users.username` and `users.password_hash` support credentials sign-in. Passwords are bcrypt-hashed and never stored in plaintext; password sign-in is enabled only after email verification through the configured Resend provider.
- `projects.user_id` is the account owner for authenticated projects. Existing browser-session projects are claimed once at sign-in; the browser-session foreign key remains for anonymous projects and migration continuity.
- `auth_rate_limits` stores hashed keys and atomic counters for shared throttling across serverless instances.
- `browser_sessions` stores a SHA-256 hash of a random browser token and a
  30-day expiry. The raw token is only held in an HttpOnly, SameSite=Lax cookie.
- `projects` stores project metadata and its generated file tree as JSONB. New
   projects require an account. Legacy guest projects are claimed at sign-in and
   no longer depend on guest-session lifetime afterward.

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

Anonymous project ownership is browser-session scoped. Signed-in ownership is
account scoped, with both API paths checking the owner in every project query.
On successful sign-in, unclaimed projects from that browser session are assigned
to that account. A project UUID alone does not grant access. Expired browser
sessions and old rate-limit rows should be cleaned up with a scheduled database
task as the service scales.

The AI and GitHub credentials belong in Netlify's server environment settings.
Never put private values in `NEXT_PUBLIC_*` variables or generated project
files.