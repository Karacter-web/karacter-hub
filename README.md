# KaracterHub

> **Ideas into working software.** Describe an app, run it live, and refine it in one workspace.

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)
[![Next.js](https://img.shields.io/badge/Next.js-14-black.svg)](https://nextjs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-blue.svg)](https://www.typescriptlang.org/)

## What is Karacter Hub?

KaracterHub is an AI-powered workspace that transforms natural language descriptions into complete, runnable web applications, with developer control over the generated files and runtime.

### Core Features

- **Natural Language → Code**: Describe any web app, AI generates the complete codebase
- **Live Preview**: See your app running instantly in the browser via WebContainer
- **Iterative Refinement**: Chat with AI to tweak and improve your code
- **One-Click Deploy**: Push your entire project to GitHub
- **Persistent Projects**: Save and reopen generated projects from a private browser-session library
- **Multi-Provider AI**: Support for Mistral, OpenAI, Anthropic, and more

## Quick Start

### Prerequisites

- Node.js 20.x
- npm or yarn
- A **Mistral AI API key** (recommended for development)

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
   
   Then edit `.env.local` and add your Mistral API key:
   ```
   MISTRAL_API_KEY=your_api_key_here
   NEXT_PUBLIC_AI_MODEL=mistral-large
  DATABASE_URL=your_neon_pooled_connection_string
   ```

4. Provision Neon and run the database migration:
  - Create a Postgres project in the Neon Console.
  - Copy its pooled connection string into `DATABASE_URL` in `.env.local`.
  - Run `npm run db:migrate` to create the session and project tables.
  - Run `npm run db:studio` to inspect the database locally.

5. Run the development server:
   ```bash
   npm run dev
   ```

6. Open [http://localhost:3000](http://localhost:3000) in your browser

## Usage

### 1. Generate a New App

1. Enter a description like: _"Build a Todo app with TypeScript, Tailwind CSS, and local storage"_
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

See [DATABASE.md](DATABASE.md) to provision Neon, configure the pooled
connection string, and apply Drizzle migrations.

### Environment Variables

Create a `.env.local` file in the root directory:

```env
# AI Model Configuration
NEXT_PUBLIC_AI_MODEL=mistral-large
MISTRAL_API_KEY=your_mistral_api_key
DATABASE_URL=your_neon_pooled_connection_string

# GitHub Configuration (for development)
GITHUB_PERSONAL_ACCESS_TOKEN=your_github_token

# Application
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

### Multiple AI Providers

The app supports multiple AI providers. To add a new provider:

1. Install the provider package (e.g., `@ai-sdk/openai`)
2. Import the model in the API routes
3. Add the API key to environment variables
4. Set `NEXT_PUBLIC_AI_MODEL` to the model name

Currently configured:
- Mistral (default): `mistral-large`, `mistral-small`, etc.

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/generate` | Generate a new app from a prompt |
| POST | `/api/refactor` | Refactor existing code |
| POST | `/api/github/push` | Deploy to GitHub |

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
  "fileTree": [...],
  "projectName": "my-app"
}
```

**Response:** Streaming JSON with operations and updated files

### GitHub Push Endpoint

**Request:**
```json
{
  "token": "ghp_...",
  "newRepoName": "my-new-app",
  "fileTree": [...],
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

- **Framework**: Next.js 14 (App Router)
- **Language**: TypeScript 5
- **State Management**: Zustand
- **Styling**: Tailwind CSS v4
- **AI Integration**: AI SDK
- **Code Execution**: @webcontainer/api
- **GitHub Integration**: @octokit/rest
- **AI Providers**: Mistral (primary), extensible to others

## Security Considerations

1. **API Keys**: Never commit `.env.local` to version control
2. **CORS**: Configure properly for production
3. **Rate Limiting**: Implement rate limiting for API endpoints in production
4. **Authentication**: Use OAuth for GitHub in production
5. **Input Validation**: All API endpoints validate input
6. **WebContainer**: Runs in a sandboxed iframe with restricted permissions

## License

MIT License - See [LICENSE](LICENSE) for details.

## Contributing

Contributions are welcome! Please feel free to submit issues or pull requests.

## Acknowledgments

- Inspired by [lovable.dev](https://lovable.dev) and [bolt.new](https://bolt.new)
- Built with [Next.js](https://nextjs.org), [AI SDK](https://ai-sdk.dev), and [WebContainer](https://webcontainer.io)
