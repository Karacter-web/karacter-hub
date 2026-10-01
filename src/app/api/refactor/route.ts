import { streamText } from 'ai';
import { mistral } from '@ai-sdk/mistral';
import { NextResponse } from 'next/server';
import type { FileNode } from '@/store/useAppStore';

// ============================================================================
// Types
// ============================================================================

interface RefactorRequest {
  prompt: string;
  fileTree: FileNode[];
  projectName?: string;
}

interface RefactorOperation {
  type: 'modify' | 'create' | 'delete';
  path: string;
  content?: string;
  oldContent?: string; // For diff display
}

interface RefactorResponse {
  summary: string;
  operations: RefactorOperation[];
  files: FileNode[];
}

// ============================================================================
// System Prompt for Refactoring
// ============================================================================

const REFACTOR_SYSTEM_PROMPT = `
You are Karacter Hub Refactor AI, an expert code refactoring assistant. You receive:
1. A user's refactoring request (the "tweak prompt")
2. The current file tree of a project

Your task is to generate MINIMAL, PRECISE changes that fulfill the user's request.

## Output Format

You MUST output a valid JSON object with this exact structure:

\`\`\`json
{
  "summary": "Brief description of changes made",
  "operations": [
    {
      "type": "modify" | "create" | "delete",
      "path": "string - file path",
      "content": "string - NEW content for modify/create (required for modify/create)",
      "oldContent": "string - OPTIONAL original content for diff reference"
    }
  ],
  "files": [
    {
      "path": "string",
      "content": "string",
      "language": "string",
      "status": "idle"
    }
  ]
}
\`\`\`

## Rules

1. **Be MINIMAL**: Only change what's necessary. Preserve all existing functionality.
2. **Be PRECISE**: Return complete file contents, not partial snippets.
3. **Preserve structure**: Maintain the same file organization unless explicitly asked to change it.
4. **No breaking changes**: Never remove functionality that isn't mentioned in the prompt.
5. **Framework awareness**: 
   - For Next.js: Use App Router, maintain metadata, keep server components intact
   - For React: Preserve hooks, state management, and component hierarchies
6. **TypeScript**: Maintain all type annotations. Never remove types.
7. **Imports**: Keep all existing imports. Add new ones only when necessary.
8. **Dependencies**: If new packages are needed, include package.json modifications.

## Common Request Patterns

### Styling Changes
- "Change to dark mode": Modify CSS variables or Tailwind config, add dark: classes
- "Add a search bar": Add Search component, integrate with existing state, style consistently
- "Make it responsive": Add media queries or responsive utility classes

### Functional Changes
- "Add authentication": Add auth provider, protect routes, create login page
- "Add a feature X": Create new component/file, integrate with minimal changes to existing code
- "Remove feature Y": Delete or comment out code, clean up dependencies

### Structural Changes
- "Convert to TypeScript": Add type definitions, convert .js to .ts/.tsx
- "Extract to utility": Move code to new utility file, update imports
- "Rename component": Update filename, all imports, and references

## Important Constraints

- NEVER rewrite the entire project unless explicitly asked
- NEVER change file paths unless necessary for the refactor
- NEVER remove existing files unless explicitly asked to delete them
- ALWAYS return the complete, updated file content for modified files
- ALWAYS include all files that need to change in the operations array
- The "files" array should contain the COMPLETE updated file tree

## Response Requirements

1. Output ONLY valid JSON - no markdown, no comments, no explanations
2. Every operation must have a valid type and path
3. For modify/create operations, content must be the complete file content
4. The files array must represent the complete updated state
5. Preserve file encoding and line endings from the original
`;

// ============================================================================
// Helper: Flatten file tree for context
// ============================================================================

function flattenFileTreeForContext(nodes: FileNode[], prefix = ''): Record<string, string> {
  const files: Record<string, string> = {};
  
  nodes.forEach(node => {
    const fullPath = prefix ? `${prefix}/${node.path}` : node.path;
    
    if (node.isDirectory) {
      if (node.children && node.children.length > 0) {
        Object.assign(files, flattenFileTreeForContext(node.children, fullPath));
      }
    } else {
      files[fullPath] = node.content;
    }
  });
  
  return files;
}

// ============================================================================
// Helper: Format files for AI context
// ============================================================================

function formatFilesForContext(files: Record<string, string>, maxLength = 12000): string {
  const entries = Object.entries(files);
  let result = '';
  let currentLength = 0;
  
  for (const [path, content] of entries) {
    const entry = `### ${path}\n\`\`\`${getLanguageFromPath(path)}\n${content}\n\`\`\`\n\n`;
    
    if (currentLength + entry.length > maxLength) {
      result += `\n... (truncated ${entries.length - Object.keys(files).length + Object.keys(files).indexOf(path)} files for token limit)\n`;
      break;
    }
    
    result += entry;
    currentLength += entry.length;
  }
  
  return result;
}

function getLanguageFromPath(path: string): string {
  const extensionMap: Record<string, string> = {
    '.tsx': 'tsx',
    '.ts': 'typescript',
    '.jsx': 'jsx',
    '.js': 'javascript',
    '.json': 'json',
    '.css': 'css',
    '.scss': 'scss',
    '.less': 'less',
    '.md': 'markdown',
    '.html': 'html',
    '.yaml': 'yaml',
    '.yml': 'yaml',
  };
  
  const extension = path.match(/\.([^.]+)$/)?.[1] || '';
  return extensionMap[`.${extension}`] || 'text';
}

// ============================================================================
// API Handler
// ============================================================================

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { prompt, fileTree, projectName = 'karacter-app' }: RefactorRequest = body;

    if (!prompt || typeof prompt !== 'string') {
      return NextResponse.json(
        { error: 'Prompt is required and must be a string' },
        { status: 400 }
      );
    }

    if (!fileTree || !Array.isArray(fileTree)) {
      return NextResponse.json(
        { error: 'fileTree is required and must be an array' },
        { status: 400 }
      );
    }

    // Flatten files for context
    const files = flattenFileTreeForContext(fileTree);
    const fileContext = formatFilesForContext(files);

    // Build the user message
    const userMessage = `
Project: ${projectName}

User request: ${prompt}

Current file tree (${Object.keys(files).length} files):
${Object.keys(files).map(f => `- ${f}`).join('\n')}

--- FILE CONTENTS ---
${fileContext}

--- INSTRUCTIONS ---
Generate the MINIMAL changes needed to fulfill the user's request.
Return ONLY the JSON response as specified in the system prompt.
Do NOT add any explanations or comments outside the JSON.
`;

    // Determine model - support Mistral and other providers
    let model;
    const aiModel = process.env.AI_MODEL || process.env.NEXT_PUBLIC_AI_MODEL || 'mistral-large';
    
    if (aiModel.startsWith('mistral-') || aiModel.startsWith('mistral')) {
      model = mistral(aiModel);
    } else {
      // Fallback to generic model string
      model = aiModel;
    }

    // Stream the LLM response
    const result = await streamText({
      model,
      system: REFACTOR_SYSTEM_PROMPT,
      prompt: userMessage,
      temperature: 0.2, // Lower temperature for more precise refactoring
      maxOutputTokens: 16000,
    });

    return result.toTextStreamResponse({
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    });

  } catch (error) {
    console.error('Refactor API error:', error);
    
    if (error instanceof SyntaxError) {
      return NextResponse.json(
        { error: 'Invalid JSON in request body' },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { error: 'Internal server error during refactoring' },
      { status: 500 }
    );
  }
}

// GET for testing
export async function GET() {
  return NextResponse.json({
    message: 'POST to this endpoint with { prompt: string, fileTree: FileNode[] } to refactor code',
    example: {
      prompt: 'Change the theme to dark mode and add a search bar',
      fileTree: [
        { path: 'app/page.tsx', content: '...', status: 'idle' },
        { path: 'app/layout.tsx', content: '...', status: 'idle' },
      ],
    },
  });
}
