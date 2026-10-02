# KaracterHub

> **Ideas into working software.** Describe an app, run it live, and refine it in one workspace.

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)
[![Next.js](https://img.shields.io/badge/Next.js-16-black.svg)](https://nextjs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-blue.svg)](https://www.typescriptlang.org/)

## What is Karacter Hub?

KaracterHub is an AI-powered workspace that transforms natural language descriptions into complete, runnable web applications, with developer control over the generated files and runtime.

### Core Features

- **Natural Language → Code**: Describe any web app, AI generates the complete codebase
- **Live Preview**: See your app running instantly in the browser via WebContainer
- **Iterative Refinement**: Chat with AI to tweak and improve your code
- **One-Click Deploy**: Push your entire project to GitHub
- **Persistent Projects**: Save projects to your account and reopen them across devices
- **Account Access**: Sign in with a username/email and password, Google, or GitHub
- **Managed AI**: Netlify AI Gateway routes to OpenAI, Anthropic, Gemini, and OpenRouter by default

## Quick Start

### Prerequisites

- Node.js 22.x
- npm or yarn
- A Netlify account on a credit-based plan
- Netlify CLI authentication for local development (`netlify login`)

### Installation

1. Clone the repository:
   ```bash
   git clone https://github.com/your-repo/karacter.git
   cd karacter
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Set up environment variables:
   ```bash
   cp .env.example .env.local
   ```
   
    Then edit `.env.local` and generate the Auth.js secret. The encryption key
    is only needed if you connect a BYO Neon database:
   ```
    AUTH_SECRET=<output of openssl rand -base64 32>
    CREDENTIAL_ENCRYPTION_KEY=<output of openssl rand -base64 32>
   ```

4. Link the repo to your Netlify site (`netlify link`) and run `npm run dev`.
   The script uses `netlify dev`; Netlify Database resolves through the CLI.
   No `DATABASE_URL` is needed for the default path.

5. Netlify Database is available on credit-based plans. Installing
    `@netlify/database` provisions the managed database on the first deploy;
    Netlify applies committed migrations during that deploy. For local-only
    migration testing, use `npm run db:migrate:local`. Generate reviewed files
    with `npm run db:generate`; never run `drizzle-kit migrate` against a hosted
    Netlify database.

6. Configure email verification and sign-in links:
   - In Resend, verify a sending domain and create an API key with email-send
     permission.
   - Set `AUTH_RESEND_KEY` to that key and `AUTH_EMAIL_FROM` to a sender on the
     verified domain, for example `KaracterHub <auth@example.com>`.
   - Password accounts cannot sign in until the verification link is used.
     Resend email links also provide passwordless sign-in and account recovery.

7. Configure optional OAuth providers:
   - **Google:** Create a Web OAuth client in Google Cloud Console. Add
     `http://localhost:8888` as an authorized JavaScript origin and
     `http://localhost:8888/api/auth/callback/google` as an authorized redirect
     URI. Set the client ID and secret as `AUTH_GOOGLE_ID` and
     `AUTH_GOOGLE_SECRET`.
   - **GitHub identity:** Create an OAuth App in GitHub Developer settings. Set
     its callback URL to
      `http://localhost:8888/api/auth/callback/github`. Set its client ID and
      secret as `AUTH_GITHUB_ID` and `AUTH_GITHUB_SECRET`.
   - For production, add the matching HTTPS application origin and callback
     URLs using the deployed KaracterHub domain. These OAuth credentials are
     only for signing in; they do not grant GitHub repository permissions.

8. In Netlify, set `AUTH_SECRET`, `CREDENTIAL_ENCRYPTION_KEY` (for BYO Neon),
   and enabled provider secrets in Site configuration → Environment variables
   for each deploy context. Set
   `AUTH_TRUST_HOST=true` only for the trusted Netlify deployment. Keep all
   credentials server-side; never use a `NEXT_PUBLIC_` prefix.

    Do not add `DATABASE_URL` for Netlify Database.

9. Deploy once to activate Netlify AI Gateway, then open the Netlify site. Create
    an account at `/signup`, then use `/app` for the protected workspace.

### Netlify AI Gateway

AI requests run only from authenticated server API routes; static generation and
build scripts never call the Gateway. It requires at least one production deploy
to activate, is gated to credit-based plans, supports up to 200,000 input tokens,
and enforces per-team per-minute rate limits. Gateway credentials are injected at
runtime, so users do not need provider API keys. To opt out for a provider, set
that provider's server-side key and `AI_PROVIDER_MODE=byo`; supported providers
are OpenAI, Anthropic, Gemini, and OpenRouter (including Mistral, DeepSeek, xAI,
Meta, and Qwen models).

### Optional Neon Database

The default database remains Netlify-managed. A project owner can choose
**Bring your own Neon** in `/app/settings/database`, enter a Neon connection
string, and optionally add a Neon API key for Console API operations. Both
values are encrypted with AES-256-GCM using `CREDENTIAL_ENCRYPTION_KEY` before
storage. Netlify-native projects never need Neon credentials. For a Neon
project, schema SQL is only applied after reviewing the migration preview and
confirming **Push schema**; disconnecting only removes KaracterHub's encrypted
connection record and does not delete the external Neon project.

## Usage

### 1. Generate a New App

1. Create an account or sign in, then enter a description like: _"Build a Todo app with TypeScript, Tailwind CSS, and local storage"_
2. Click "Generate App" or press Enter
3. Wait for AI to generate the code (typically 10-30 seconds)
4. Watch the live preview load in the iframe

### 2. Refactor Your App

1. Open the "Refactor & Improve" chat panel
2. Ask for changes like: _"Add dark mode"_ or _"Add a search bar"_
3. AI will modify the files and update the preview automatically

### 3. Deploy to GitHub

1. Click "Deploy to GitHub" button
2. Enter your GitHub personal access token (or set up OAuth)
3. Choose a repository name
4. Your app is now live on GitHub!

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                        User Interface                          │
├─────────────────┬─────────────────┬──────────────────────────┤
│  RefactorChat    │   PreviewPanel   │   Generation Form           │
│  (Tweak UI)      │   (Live Preview) │   (Initial Creation)        │
└────────┬────────┴────────┬────────┴──────────────┬────────────┘
         │                 │                          │
         ▼                 ▼                          ▼
┌─────────────────┐ ┌─────────────┐           ┌────────────────┐
│  /api/refactor   │ │ /api/generate│           │   GitHub Push   │
│  (AI Refactor)   │ │ (AI Generate) │           │   /api/github    │
└────────┬────────┘ └────────┬───────┘           └──────────┬─────┘
         │                  │                            │
         └──────────┬───────┘                            │
                    │                                  │
                    ▼                                  ▼
┌─────────────────────────────────────────┐ ┌───────────────────┐
│            Zustand Store                  │ │  GitHub (Octokit)  │
│  • Project Metadata                       │ │  • Auth           │
│  • File Tree Structure                    │ │  • Repo Creation   │
│  • Generation Logs                       │ │  • Git Trees API   │
│  • Selected File                         │ └───────────────────┘
└───────────────────┬────────────────────────┘
                    │
                    ▼
┌─────────────────────────────────────────┐
│           WebContainer                     │
│  • Browser-based Node.js                  │
│  • Mounts virtual filesystem               │
│  • Runs npm install & npm run dev          │
│  • Streams terminal output                 │
│  • Serves live preview via iframe         │
└─────────────────────────────────────────┘
```

## Project Structure

```
karacter/
├── src/
│   ├── app/
│   │   ├── api/
│   │   │   ├── generate/route.ts      # AI code generation
│   │   │   ├── refactor/route.ts       # AI code refactoring
│   │   │   └── github/push/route.ts    # GitHub deployment
│   │   ├── layout.tsx                  # Root layout
│   │   ├── page.tsx                   # Main page
│   │   └── globals.css                # Global styles
│   ├── components/
│   │   ├── chat/
│   │   │   └── RefactorChat.tsx       # Refactoring chat UI
│   │   └── sandbox/
│   │       └── PreviewPanel.tsx       # WebContainer preview
│   └── store/
│       └── useAppStore.ts             # Zustand state management
├── next.config.mjs                    # Next.js configuration
├── tailwind.config.ts                 # Tailwind configuration
├── tsconfig.json                     # TypeScript configuration
└── package.json
```

## Configuration

See [PREVIEW_DEPLOYMENT.md](PREVIEW_DEPLOYMENT.md) for the current WebContainer
preview model, deployment requirements, and the recommended path to custom
preview domains.

See [DATABASE.md](DATABASE.md) for Netlify Database and optional Neon project
configuration and migration workflows.

### Environment Variables

Create a `.env.local` file in the root directory:

```env
# AI model selection is not a credential; the Gateway is the default.
NEXT_PUBLIC_AI_MODEL=mistral-large
AUTH_SECRET=...
# CREDENTIAL_ENCRYPTION_KEY is only required for optional BYO Neon.

# GitHub Configuration (for development)
GITHUB_PERSONAL_ACCESS_TOKEN=your_github_token

# Application
NEXT_PUBLIC_APP_URL=http://localhost:8888
```

### AI Provider Health

Signed-in users can check the active provider at `GET /api/ai/health`. The
response includes provider, model, and whether the configured path is Gateway or
BYO; it never returns keys or connection details.

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/generate` | Generate a new app from a prompt |
| POST | `/api/refactor` | Refactor existing code |
| POST | `/api/github/push` | Deploy to GitHub |
| GET | `/api/ai/health` | Check the active AI provider |
| GET/POST/DELETE | `/api/projects/[projectId]/database` | Manage project database selection |
| GET/POST | `/api/projects/[projectId]/database/migrate` | Preview or explicitly apply Neon migrations |
| GET | `/api/projects/[projectId]/database/migrations` | Read external migration history |

### Generate Endpoint

**Request:**
```json
{
  "prompt": "Build a React Todo app with TypeScript"
}
```

**Response:** Streaming JSON with file tree

### Refactor Endpoint

**Request:**
```json
{
  "prompt": "Add dark mode to the app",
  "projectId": "owned-project-uuid"
}
```

**Response:** Streaming JSON with operations and updated files

### GitHub Push Endpoint

**Request:**
```json
{
  "token": "ghp_...",
  "projectId": "owned-project-uuid",
  "newRepoName": "my-new-app",
  "commitMessage": "Initial commit"
}
```

**Response:**
```json
{
  "success": true,
  "url": "https://github.com/user/my-new-app",
  "repo": {...}
}
```

## Tech Stack

- **Framework**: Next.js 16 (App Router)
- **Persistence**: Netlify Database by default; optional encrypted per-project Neon connections
- **Authentication**: Auth.js with verified credentials, Google, and GitHub identity OAuth
- **Language**: TypeScript 5
- **State Management**: Zustand
- **Styling**: Tailwind CSS v4
- **AI Integration**: Netlify AI Gateway via server-side official provider SDKs
- **Code Execution**: @webcontainer/api
- **GitHub Integration**: @octokit/rest
- **AI Providers**: OpenAI, Anthropic, Gemini, and OpenRouter through Netlify AI Gateway

## Security Considerations

1. **Auth.js**: Store `AUTH_SECRET` and OAuth client secrets only in server-side environment settings.
2. **Project ownership**: Authenticated project APIs scope every query to the account ID; guest projects are claimed by the first account signing in from that browser.
3. **GitHub access**: GitHub sign-in does not grant repository permissions. The current push route accepts a token in its request body; a GitHub App with short-lived installation tokens is the planned replacement.
4. **Rate limiting**: Registration, sign-in, generation, and refactoring use database-backed limits. Configure upstream edge protections as well for production.
5. **Input validation**: Project-scoped API routes verify ownership before accessing stored files or database settings.
6. **BYO secrets**: Neon connection strings and API keys are AES-256-GCM encrypted at rest. AI and Auth.js secrets remain in server-side Netlify environment settings.
7. **WebContainer**: Runs in a sandboxed iframe with restricted permissions.

## License

MIT License - See [LICENSE](LICENSE) for details.

## Contributing

Contributions are welcome! Please feel free to submit issues or pull requests.

Run `npm run test:ai` and `npm run test:neon` for mocked provider, encryption,
connection, and migration tests. `npm run db:smoke` exercises the local Netlify
database when it is available.

## Acknowledgments

- Inspired by [lovable.dev](https://lovable.dev) and [bolt.new](https://bolt.new)
- Built with [Next.js](https://nextjs.org), [AI SDK](https://ai-sdk.dev), and [WebContainer](https://webcontainer.io)
