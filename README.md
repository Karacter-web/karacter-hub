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
- **Managed AI**: Vercel AI Gateway routes requests to supported model providers

## Quick Start

### Prerequisites

- Node.js 22.x
- npm or yarn
- A Vercel account for deployment
- A Neon project for PostgreSQL

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
    is only needed if you connect a separate project Neon database:
   ```
    AUTH_SECRET=<output of openssl rand -base64 32>
    CREDENTIAL_ENCRYPTION_KEY=<output of openssl rand -base64 32>
   ```

4. Create a Neon project and set `DATABASE_URL` to its pooled connection string
   and `DATABASE_URL_UNPOOLED` to its direct connection string in `.env.local`.
   Initialize its schema with `npm run db:generate` followed by
   `npm run db:migrate`.

5. Set up authentication and AI keys as described below, then run `npm run dev`.
   To deploy, import the repository into Vercel and add the same server-side
   environment variables in the Vercel project settings. Add your Neon URLs to
   both local and Vercel environments.

6. Configure email verification and sign-in links:
   - In Resend, verify a sending domain and create an API key with email-send
     permission.
   - Set `AUTH_RESEND_KEY` to that key and `AUTH_EMAIL_FROM` to a sender on the
     verified domain, for example `KaracterHub <auth@example.com>`.
   - Password accounts cannot sign in until the verification link is used.
     Resend email links also provide passwordless sign-in and account recovery.

7. Configure optional OAuth providers:
   - **Google:** Create a Web OAuth client in Google Cloud Console. Add
     `http://localhost:3000` as an authorized JavaScript origin and
     `http://localhost:3000/api/auth/callback/google` as an authorized redirect
     URI. Set the client ID and secret as `AUTH_GOOGLE_ID` and
     `AUTH_GOOGLE_SECRET`.
   - **GitHub identity:** Create an OAuth App in GitHub Developer settings. Set
     its callback URL to
      `http://localhost:3000/api/auth/callback/github`. Set its client ID and
      secret as `AUTH_GITHUB_ID` and `AUTH_GITHUB_SECRET`.
   - For production, add the matching HTTPS application origin and callback
     URLs using the deployed KaracterHub domain. These OAuth credentials are
     only for signing in; they do not grant GitHub repository permissions.

8. Configure Vercel AI Gateway by setting `AI_GATEWAY_API_KEY`, or set a
   provider-specific server-side API key and `AI_PROVIDER_MODE=byo`. Keep all
   credentials server-side; never use a `NEXT_PUBLIC_` prefix.

9. Deploy from Vercel and open the deployed site. Create an account at `/signup`,
   then use `/app` for the protected workspace.

### Vercel AI Gateway

AI requests run only from authenticated server API routes. Set
`AI_GATEWAY_API_KEY` in Vercel project settings to use the Vercel AI Gateway.
For direct provider access instead, set a provider key and `AI_PROVIDER_MODE=byo`.
Supported direct providers are OpenAI, Anthropic, Gemini, OpenRouter, and Mistral.

### Neon Database

The application uses Neon as its primary database through `DATABASE_URL`. A
project owner can optionally select a saved project under
`/app/settings/database` and connect a separate Neon database for that project.
Optional project credentials are encrypted with AES-256-GCM using
`CREDENTIAL_ENCRYPTION_KEY`. Schema SQL for those project databases is applied
only after review and explicit confirmation. Removing a project's connection
record switches it back to the application Neon database and does not delete the
separate Neon project.

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

See [DATABASE.md](DATABASE.md) for Neon database
configuration and migration workflows.

### Environment Variables

Create a `.env.local` file in the root directory:

```env
# AI model selection is not a credential.
NEXT_PUBLIC_AI_MODEL=mistral-large
AUTH_SECRET=...
DATABASE_URL=...
DATABASE_URL_UNPOOLED=...
AI_GATEWAY_API_KEY=...
# CREDENTIAL_ENCRYPTION_KEY is only required for separate per-project Neon connections.

# GitHub Configuration (for development)
GITHUB_PERSONAL_ACCESS_TOKEN=your_github_token

# Application
NEXT_PUBLIC_APP_URL=http://localhost:3000
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
- **Persistence**: Neon PostgreSQL; optional encrypted per-project Neon connections
- **Authentication**: Auth.js with verified credentials, Google, and GitHub identity OAuth
- **Language**: TypeScript 5
- **State Management**: Zustand
- **Styling**: Tailwind CSS v4
- **AI Integration**: Vercel AI Gateway or server-side provider SDKs
- **Code Execution**: @webcontainer/api
- **GitHub Integration**: @octokit/rest
- **AI Providers**: OpenAI, Anthropic, Gemini, OpenRouter, and Mistral

## Security Considerations

1. **Auth.js**: Store `AUTH_SECRET` and OAuth client secrets only in server-side environment settings.
2. **Project ownership**: Authenticated project APIs scope every query to the account ID; guest projects are claimed by the first account signing in from that browser.
3. **GitHub access**: GitHub sign-in does not grant repository permissions. The current push route accepts a token in its request body; a GitHub App with short-lived installation tokens is the planned replacement.
4. **Rate limiting**: Registration, sign-in, generation, and refactoring use database-backed limits. Configure upstream edge protections as well for production.
5. **Input validation**: Project-scoped API routes verify ownership before accessing stored files or database settings.
6. **Database and AI secrets**: Neon connection strings, AI keys, and Auth.js secrets stay in server-side environment settings; optional per-project Neon credentials are AES-256-GCM encrypted at rest.
7. **WebContainer**: Runs in a sandboxed iframe with restricted permissions.

## License

MIT License - See [LICENSE](LICENSE) for details.

## Contributing

Contributions are welcome! Please feel free to submit issues or pull requests.

Run `npm run test:ai` and `npm run test:neon` for mocked provider, encryption,
connection, and migration tests. `npm run db:smoke` exercises the configured
Neon database when available.

## Acknowledgments

- Inspired by [lovable.dev](https://lovable.dev) and [bolt.new](https://bolt.new)
- Built with [Next.js](https://nextjs.org), [AI SDK](https://ai-sdk.dev), and [WebContainer](https://webcontainer.io)
