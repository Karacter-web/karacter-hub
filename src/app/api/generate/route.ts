import { streamText } from 'ai';
import { mistral } from '@ai-sdk/mistral';
import { NextResponse } from 'next/server';

// ============================================================================
// System Prompt
// ============================================================================

const SYSTEM_PROMPT = `
You are Karacter Hub AI, a code generation assistant that transforms user prompts into complete, runnable web applications.

## Your Task
Generate a complete Next.js application based on the user's prompt. Output MUST be a valid JSON object with the following structure:

\`\`\`json
{
  "project": {
    "name": "string - short project name",
    "description": "string - brief description",
    "framework": "nextjs" | "vite-react"
  },
  "files": [
    {
      "path": "string - file path from project root",
      "content": "string - full file content",
      "language": "string - file language/type (tsx, ts, js, json, css, etc.)"
    }
  ]
}
\`\`\`

## Output Requirements

1. **ALWAYS output valid JSON** - No markdown, no explanations, just the JSON object
2. Generate a complete, working application - include all necessary files
3. For Next.js: Include package.json, next.config.js, tsconfig.json, and at least one page
4. For Vite/React: Include package.json, vite.config.ts, index.html, and main entry
5. Include proper TypeScript configuration if using TypeScript
6. Each file must be complete and runnable

## Coding Rules

### Next.js Applications
- Use App Router (app/ directory)
- Include proper metadata in layout.tsx
- Use modern React patterns (hooks, server components where appropriate)
- Include proper typing for all props and components
- Use Tailwind CSS if styling is requested
- Structure: app/page.tsx as entry, app/layout.tsx for root layout
- Include necessary dependencies in package.json

### Vite/React Applications
- Use modern Vite configuration
- Include proper HTML entry point
- Use functional components with TypeScript
- Structure: src/main.tsx, src/App.tsx, public/index.html
- Include vite.config.ts with proper settings

### General Code Quality
- Always use TypeScript (unless user explicitly requests JavaScript)
- Use ES modules (import/export syntax)
- Include proper error handling where applicable
- Use semantic, clean code with consistent formatting
- Add basic error boundaries for React components
- Include proper accessibility attributes
- Use modern CSS solutions (Tailwind, CSS Modules, or styled-components)
- For data fetching, use modern patterns (React Query, SWR, or native fetch)
- Include proper environment variable handling

### File Organization
- Group related files logically (components/, hooks/, lib/, etc.)
- Use kebab-case for file names
- Use PascalCase for React components
- Include README.md with basic setup instructions
- Add .gitignore with appropriate entries

### Dependencies
- Include all required dependencies in package.json
- Specify exact versions or use caret (^) for patch updates
- Include devDependencies for build tools
- Add appropriate scripts (dev, build, start, lint)

## Response Format Example

For a "Todo app with TypeScript and Tailwind":

\`\`\`json
{
  "project": {
    "name": "todo-app",
    "description": "A simple todo application built with Next.js and Tailwind CSS",
    "framework": "nextjs"
  },
  "files": [
    {
      "path": "package.json",
      "content": "full file content",
      "language": "json"
    },
    {
      "path": "app/page.tsx",
      "content": "import { TodoList } from '@/components/TodoList'; ...",
      "language": "tsx"
    },
    {
      "path": "app/layout.tsx",
      "content": "import type { Metadata } from 'next'; ...",
      "language": "tsx"
    }
  ]
}
\`\`\`

## Important Notes
- NEVER add comments or explanations outside the JSON
- NEVER use markdown formatting in your response
- The JSON must be parseable
- Generate all necessary files for a complete application
- Assume the user wants a production-ready app structure
`;

// ============================================================================
// API Handler
// ============================================================================

export async function POST(request: Request) {
  try {
    const { prompt } = await request.json();

    if (!prompt || typeof prompt !== 'string') {
      return NextResponse.json(
        { error: 'Prompt is required and must be a string' },
        { status: 400 }
      );
    }

    // Determine model - support Mistral and other providers
    let model;
    const aiModel = process.env.AI_MODEL || process.env.NEXT_PUBLIC_AI_MODEL || 'mistral-large';
    
    if (aiModel.startsWith('mistral-') || aiModel.startsWith('mistral')) {
      model = mistral(aiModel);
    } else {
      // Fallback to generic model string (for OpenAI, etc.)
      model = aiModel;
    }

    // Stream the LLM response directly to the client
    const result = await streamText({
      model,
      system: SYSTEM_PROMPT,
      prompt: `User prompt: ${prompt}\n\nGenerate the complete application files as JSON.`,
      // Configuration for better JSON output
      temperature: 0.3,
      maxOutputTokens: 16000,
    });

    // The client parses the streamed JSON and populates the file tree.
    return result.toTextStreamResponse({
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    });

  } catch (error) {
    console.error('Generation error:', error);
    
    if (error instanceof SyntaxError) {
      return NextResponse.json(
        { error: 'Invalid JSON in request body' },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { error: 'Internal server error during generation' },
      { status: 500 }
    );
  }
}

// Allow GET for testing (returns the system prompt structure)
export async function GET() {
  return NextResponse.json({
    message: 'POST to this endpoint with { prompt: string } to generate an app',
    example: {
      prompt: 'Build a React Todo app with Tailwind CSS and TypeScript',
    },
  });
}
