# Repository Instructions for GitHub Copilot: Karacter Hub

You are assisting in building "Karacter Hub," an AI app builder and personal workspace that compiles user text prompts into fully functional, dynamic web applications running in an in-browser sandbox with optional GitHub sync.

## Key Technical Stack
- **Frontend / Framework:** Next.js (App Router), React, Tailwind CSS, TypeScript, Shadcn UI
- **Code Execution / Preview Sandbox:** `@webcontainer/api` (StackBlitz WebContainers) or Docker-based server sandbox via API.
- **LLM / Code Generation:** AI SDK (`ai` / `@ai-sdk/openai` or Anthropic), generating structured JSON file-trees or multi-file system streams.
- **Git Sync:** Octokit (`@octokit/rest`) for authenticating users and committing code directly to GitHub repositories.
- **State & Storage:** Zustand / React Query, Prisma ORM with PostgreSQL (or Supabase/Firebase) for storing user sessions and app history.

## Development Directives & Rules
1. **Security & Sandboxing:** Ensure all generated apps run isolated in WebContainers or mock runtimes. User credentials and AI API keys must be securely stored on server-side environment variables.
2. **Streaming AI Code:** When generating projects, stream file content chunk-by-chunk to update the internal file tree state live.
3. **Component Architecture:** Write modular, type-safe Next.js client and server components. Ensure proper error boundaries around the dynamic preview component.
4. **Clean Code:** Use TypeScript strict modes, clear JSDoc annotations, and standard React hooks.
