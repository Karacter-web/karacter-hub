import { NextResponse } from 'next/server';
import { Octokit } from '@octokit/rest';
import type { FileNode } from '@/store/useAppStore';

// ============================================================================
// Types
// ============================================================================

interface GitHubPushRequest {
  token: string;
  repo?: string; // Optional: existing repo name (format: owner/repo)
  newRepoName?: string; // Optional: name for new repository
  fileTree: FileNode[];
  commitMessage?: string;
  projectName?: string;
}

interface GitHubPushResponse {
  success: boolean;
  url?: string;
  repo?: {
    name: string;
    full_name: string;
    html_url: string;
    default_branch: string;
  };
  error?: string;
  files?: {
    created: string[];
    updated: string[];
    deleted: string[];
  };
}

// ============================================================================
// Constants
// ============================================================================

const DEFAULT_COMMIT_MESSAGE = 'Initial commit from Karacter Hub';
const GITHUB_API_BASE = 'https://api.github.com';
const TREE_CREATION_CHUNK_SIZE = 100; // Max files per tree creation

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Flatten file tree to path-content map
 */
function flattenFileTree(nodes: FileNode[], prefix = ''): Map<string, string> {
  const files = new Map<string, string>();
  
  nodes.forEach(node => {
    const fullPath = prefix ? `${prefix}/${node.path}` : node.path;
    
    if (node.isDirectory) {
      if (node.children && node.children.length > 0) {
        flattenFileTree(node.children, fullPath).forEach((content, path) => {
          files.set(path, content);
        });
      }
    } else {
      files.set(fullPath, node.content);
    }
  });
  
  return files;
}

/**
 * Convert file map to Git tree entries format
 */
function filesToTreeEntries(files: Map<string, string>): Array<{ path: string; type: 'blob'; mode: string; content: string }> {
  const entries: Array<{ path: string; type: string; mode: string; content?: string }> = [];
  
  files.forEach((content, path) => {
    // Skip empty directories
    if (!content && path.endsWith('/')) {
      return;
    }
    
    entries.push({
      path,
      type: 'blob',
      mode: '100644', // Regular file
      content,
    });
  });
  
  return entries;
}

/**
 * Create Git blobs for files
 */
async function createBlobs(
  octokit: Octokit,
  owner: string,
  repo: string,
  files: Map<string, string>
): Promise<Map<string, string>> {
  const blobs = new Map<string, string>();
  
  // Create blobs in parallel batches
  const entries = Array.from(files.entries());
  const BATCH_SIZE = 10;
  
  for (let i = 0; i < entries.length; i += BATCH_SIZE) {
    const batch = entries.slice(i, i + BATCH_SIZE);
    
    const blobPromises = batch.map(async ([path, content]) => {
      try {
        const { data } = await octokit.request('POST /repos/{owner}/{repo}/git/blobs', {
          owner,
          repo,
          content: Buffer.from(content).toString('base64'),
          encoding: 'base64',
        });
        return { path, sha: data.sha };
      } catch (err) {
        console.error(`Failed to create blob for ${path}:`, err);
        return null;
      }
    });
    
    const results = await Promise.all(blobPromises);
    results.forEach(result => {
      if (result) {
        blobs.set(result.path, result.sha);
      }
    });
  }
  
  return blobs;
}

/**
 * Create Git tree
 */
async function createTree(
  octokit: Octokit,
  owner: string,
  repo: string,
  baseTreeSha: string | null,
  treeEntries: Array<{ path: string; type: string; mode: string; sha?: string }>
): Promise<string> {
  try {
    const { data } = await octokit.request('POST /repos/{owner}/{repo}/git/trees', {
      owner,
      repo,
      tree: treeEntries,
      base_tree: baseTreeSha || undefined,
    });
    
    return data.sha;
  } catch (err) {
    console.error('Failed to create tree:', err);
    throw err;
  }
}

/**
 * Get user info from token
 */
async function getAuthenticatedUser(octokit: Octokit): Promise<{ login: string; id: number }> {
  try {
    const { data } = await octokit.rest.users.getAuthenticated();
    return { login: data.login, id: data.id };
  } catch (err) {
    throw new Error('Failed to authenticate with GitHub. Please check your token.');
  }
}

/**
 * Create a new repository
 */
async function createRepository(
  octokit: Octokit,
  name: string,
  description?: string,
  privateRepo = false
): Promise<{ name: string; full_name: string; html_url: string; default_branch: string }> {
  try {
    const { data } = await octokit.rest.repos.createForAuthenticatedUser({
      name,
      description: description || `Created from Karacter Hub - ${new Date().toLocaleDateString()}`,
      private: privateRepo,
      auto_init: false, // We'll handle initialization
    });
    
    return {
      name: data.name,
      full_name: data.full_name,
      html_url: data.html_url,
      default_branch: data.default_branch,
    };
  } catch (err: any) {
    if (err.status === 422 && err.message?.includes('name already exists')) {
      throw new Error(`Repository with name '${name}' already exists for this user.`);
    }
    throw new Error(`Failed to create repository: ${err.message || 'Unknown error'}`);
  }
}

/**
 * Get existing repository info
 */
async function getRepository(
  octokit: Octokit,
  owner: string,
  repo: string
): Promise<{ name: string; full_name: string; html_url: string; default_branch: string }> {
  try {
    const { data } = await octokit.rest.repos.get({
      owner,
      repo,
    });
    
    return {
      name: data.name,
      full_name: data.full_name,
      html_url: data.html_url,
      default_branch: data.default_branch,
    };
  } catch (err: any) {
    if (err.status === 404) {
      throw new Error(`Repository '${owner}/${repo}' not found.`);
    }
    throw new Error(`Failed to get repository info: ${err.message || 'Unknown error'}`);
  }
}

/**
 * Create a commit
 */
async function createCommit(
  octokit: Octokit,
  owner: string,
  repo: string,
  treeSha: string,
  commitMessage: string,
  parentCommitSha: string | null
): Promise<string> {
  try {
    const { data } = await octokit.request('POST /repos/{owner}/{repo}/git/commits', {
      owner,
      repo,
      message: commitMessage,
      tree: treeSha,
      parents: parentCommitSha ? [parentCommitSha] : [],
    });
    
    return data.sha;
  } catch (err) {
    console.error('Failed to create commit:', err);
    throw err;
  }
}

/**
 * Update the reference (branch)
 */
async function updateReference(
  octokit: Octokit,
  owner: string,
  repo: string,
  ref: string,
  commitSha: string
): Promise<void> {
  try {
    await octokit.request('PATCH /repos/{owner}/{repo}/git/{ref}', {
      owner,
      repo,
      ref,
      sha: commitSha,
    });
  } catch (err) {
    console.error('Failed to update reference:', err);
    throw err;
  }
}

/**
 * Get the current commit SHA for a branch
 */
async function getBranchCommitSha(
  octokit: Octokit,
  owner: string,
  repo: string,
  branch: string
): Promise<string | null> {
  try {
    const { data } = await octokit.request('GET /repos/{owner}/{repo}/git/ref/{ref}', {
      owner,
      repo,
      ref: `heads/${branch}`,
    });
    
    return data.object.sha;
  } catch (err: any) {
    if (err.status === 404) {
      return null; // Branch doesn't exist yet
    }
    throw err;
  }
}

// ============================================================================
// Main Handler
// ============================================================================

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const {
      token,
      repo: existingRepo,
      newRepoName,
      fileTree,
      commitMessage = DEFAULT_COMMIT_MESSAGE,
      projectName = 'karacter-app',
    }: GitHubPushRequest = body;

    if (!token || typeof token !== 'string') {
      return NextResponse.json(
        { success: false, error: 'GitHub token is required' } as GitHubPushResponse,
        { status: 400 }
      );
    }

    if (!fileTree || !Array.isArray(fileTree)) {
      return NextResponse.json(
        { success: false, error: 'fileTree is required and must be an array' } as GitHubPushResponse,
        { status: 400 }
      );
    }

    if (!existingRepo && !newRepoName) {
      return NextResponse.json(
        { success: false, error: 'Either repo (existing) or newRepoName must be provided' } as GitHubPushResponse,
        { status: 400 }
      );
    }

    // Initialize Octokit
    const octokit = new Octokit({
      auth: token,
    });

    // Get authenticated user
    const user = await getAuthenticatedUser(octokit);

    // Determine target repository
    let targetRepo: { name: string; full_name: string; html_url: string; default_branch: string };
    let owner: string;
    let repo: string;
    let isNewRepo = false;

    if (existingRepo) {
      // Use existing repository
      const [repoOwner, repoName] = existingRepo.split('/');
      if (!repoOwner || !repoName) {
        return NextResponse.json(
          { success: false, error: 'Invalid repo format. Use "owner/repo"' } as GitHubPushResponse,
          { status: 400 }
        );
      }
      
      owner = repoOwner;
      repo = repoName;
      targetRepo = await getRepository(octokit, owner, repo);
      isNewRepo = false;
    } else {
      // Create new repository
      owner = user.login;
      repo = newRepoName || projectName;
      targetRepo = await createRepository(
        octokit,
        repo,
        projectName ? `Karacter Hub: ${projectName}` : undefined
      );
      isNewRepo = true;
    }

    // Flatten file tree
    const files = flattenFileTree(fileTree);
    const fileCount = files.size;

    if (fileCount === 0) {
      return NextResponse.json(
        { success: false, error: 'No files to commit' } as GitHubPushResponse,
        { status: 400 }
      );
    }

    // Convert to tree entries
    const treeEntries = filesToTreeEntries(files);

    // Create blobs for all files
    const blobs = await createBlobs(octokit, owner, repo, files);

    // Create tree entries with blob SHAs
    const entriesWithShas = treeEntries.map(entry => ({
      path: entry.path,
      type: entry.type,
      mode: entry.mode,
      sha: blobs.get(entry.path),
    }));

    // Chunk tree creation if needed (GitHub has a limit of 100 files per tree)
    const CHUNK_SIZE = 80; // Safe limit
    let baseTreeSha: string | null = null;
    let finalTreeSha = '';

    for (let i = 0; i < entriesWithShas.length; i += CHUNK_SIZE) {
      const chunk = entriesWithShas.slice(i, i + CHUNK_SIZE);
      const treeSha = await createTree(octokit, owner, repo, baseTreeSha, chunk);
      baseTreeSha = treeSha;
      finalTreeSha = treeSha;
    }

    // Get the current commit SHA for the main branch
    const parentCommitSha = await getBranchCommitSha(octokit, owner, repo, targetRepo.default_branch);

    // Create commit
    const commitSha = await createCommit(
      octokit,
      owner,
      repo,
      finalTreeSha,
      commitMessage,
      parentCommitSha
    );

    // Update the reference
    await updateReference(octokit, owner, repo, `heads/${targetRepo.default_branch}`, commitSha);

    // Track created/updated files
    const createdFiles: string[] = [];
    const updatedFiles: string[] = [];

    if (isNewRepo) {
      Array.from(files.keys()).forEach(path => createdFiles.push(path));
    } else {
      // For existing repos, we'd need to check what changed
      // For now, just mark all as updated
      Array.from(files.keys()).forEach(path => updatedFiles.push(path));
    }

    return NextResponse.json(
      {
        success: true,
        url: targetRepo.html_url,
        repo: targetRepo,
        files: {
          created: createdFiles,
          updated: updatedFiles,
          deleted: [],
        },
      } as GitHubPushResponse,
      { status: 200 }
    );

  } catch (error: any) {
    console.error('GitHub push error:', error);
    
    const errorMessage = error.message || 'Failed to push to GitHub';
    const statusCode = error.status || 500;

    return NextResponse.json(
      { success: false, error: errorMessage } as GitHubPushResponse,
      { status: statusCode }
    );
  }
}

// GET for testing/validation
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const token = searchParams.get('token');
    
    if (!token) {
      return NextResponse.json({
        message: 'GitHub Push API',
        usage: 'POST with { token, repo?: string, newRepoName?: string, fileTree, commitMessage?, projectName? }',
        example: {
          token: 'gho_...',
          newRepoName: 'my-new-app',
          fileTree: [{ path: 'index.html', content: '<h1>Hello</h1>', status: 'idle' }],
        },
      });
    }

    // Validate token
    const octokit = new Octokit({ auth: token });
    const user = await getAuthenticatedUser(octokit);

    return NextResponse.json({
      authenticated: true,
      user: user.login,
      message: 'Token is valid',
    });

  } catch (error: any) {
    return NextResponse.json(
      { authenticated: false, error: error.message || 'Invalid token' },
      { status: 401 }
    );
  }
}
