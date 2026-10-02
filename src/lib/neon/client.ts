export class NeonApiError extends Error {
  constructor(readonly status: number) {
    super('Neon API request failed.');
    this.name = 'NeonApiError';
  }
}

interface NeonApiOptions {
  fetcher?: typeof fetch;
}

interface NeonProject {
  id: string;
  name: string;
  region_id: string;
}

interface NeonDatabase {
  id: number;
  name: string;
  owner_name?: string;
}

export function createNeonClient(apiKey: string, { fetcher = fetch }: NeonApiOptions = {}) {
  if (!apiKey.trim()) throw new Error('A Neon API key is required.');

  async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const response = await fetcher(`https://console.neon.tech/api/v2${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        ...init.headers,
      },
      signal: init.signal ?? AbortSignal.timeout(10_000),
    });
    if (!response.ok) throw new NeonApiError(response.status);
    return response.json() as Promise<T>;
  }

  return {
    async listProjects() {
      const result = await request<{ projects: NeonProject[] }>('/projects');
      return result.projects;
    },
    async createProject({ name, region }: { name: string; region: string }) {
      const result = await request<{ project: NeonProject }>('/projects', {
        method: 'POST',
        body: JSON.stringify({ project: { name, region_id: region } }),
      });
      return result.project;
    },
    async listDatabases(projectId: string) {
      const branchesResult = await request<{ branches: Array<{ id: string; primary?: boolean }> }>(
        `/projects/${encodeURIComponent(projectId)}/branches`,
      );
      const branch = branchesResult.branches.find(item => item.primary) ?? branchesResult.branches[0];
      if (!branch) return [] as NeonDatabase[];
      const result = await request<{ databases: NeonDatabase[] }>(
        `/projects/${encodeURIComponent(projectId)}/branches/${encodeURIComponent(branch.id)}/databases`,
      );
      return result.databases;
    },
    async getConnectionString(projectId: string, database: string, role: string) {
      const query = new URLSearchParams({ database_name: database, role_name: role });
      const result = await request<{ uri: string }>(
        `/projects/${encodeURIComponent(projectId)}/connection_uri?${query.toString()}`,
      );
      return result.uri;
    },
  };
}