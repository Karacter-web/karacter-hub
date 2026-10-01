import type { StoredFileNode } from './schema';

export interface ProjectInput {
  name: string;
  description: string;
  gitRepoUrl: string | null;
  fileTree: StoredFileNode[];
}

const MAX_PROJECT_BYTES = 4_000_000;
const MAX_FILE_NODES = 5_000;

function isStoredFileNode(
  value: unknown,
  depth: number,
  count: { value: number },
): value is StoredFileNode {
  if (depth > 24 || count.value++ >= MAX_FILE_NODES || !value || typeof value !== 'object') {
    return false;
  }

  const node = value as Record<string, unknown>;
  if (
    typeof node.path !== 'string' ||
    node.path.length > 500 ||
    node.path.startsWith('/') ||
    node.path.split('/').includes('..') ||
    typeof node.content !== 'string' ||
    !['generating', 'idle', 'error'].includes(String(node.status)) ||
    (node.isDirectory !== undefined && typeof node.isDirectory !== 'boolean')
  ) {
    return false;
  }

  if (node.children === undefined) return true;
  return Array.isArray(node.children) && node.children.every(child =>
    isStoredFileNode(child, depth + 1, count)
  );
}

export function parseProjectInput(value: unknown): ProjectInput | null {
  if (!value || typeof value !== 'object') return null;

  const body = value as Record<string, unknown>;
  const name = typeof body.name === 'string' ? body.name.trim() : '';
  const description = typeof body.description === 'string' ? body.description : '';
  const gitRepoUrl = typeof body.gitRepoUrl === 'string' ? body.gitRepoUrl : null;
  const fileTree = body.fileTree;
  const count = { value: 0 };

  if (
    !name || name.length > 120 || description.length > 10_000 ||
    !Array.isArray(fileTree) ||
    !fileTree.every(node => isStoredFileNode(node, 0, count)) ||
    JSON.stringify(fileTree).length > MAX_PROJECT_BYTES ||
    (gitRepoUrl !== null && gitRepoUrl.length > 2_000)
  ) {
    return null;
  }

  return { name, description, gitRepoUrl, fileTree };
}