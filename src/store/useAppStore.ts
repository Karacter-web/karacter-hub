import { create } from 'zustand';

// ============================================================================
// Types and Interfaces
// ============================================================================

/** Project metadata for the current Karacter Hub project */
export interface ProjectMetadata {
  id: string;
  name: string;
  description: string;
  gitRepoUrl?: string;
}

/** Status types for file nodes in the virtual workspace */
export type FileNodeStatus = 'generating' | 'idle' | 'error';

/** Represents a file or directory in the virtual workspace tree */
export interface FileNode {
  path: string;
  content: string;
  status: FileNodeStatus;
  isDirectory?: boolean;
  children?: FileNode[];
}

/** Status types for prompt generation */
export type GenerationStatus = 'generating' | 'running' | 'error' | 'completed';

/** Log entry for tracking prompt generation */
export interface GenerationLog {
  id: string;
  prompt: string;
  status: GenerationStatus;
  logs: string[];
  timestamp: Date;
  duration?: number; // in milliseconds
}

// ============================================================================
// Store State Interface
// ============================================================================

interface AppState {
  // Current project metadata
  project: ProjectMetadata;

  // Virtual workspace file tree
  fileTree: FileNode[];

  // Active prompt generation logs
  generationLogs: GenerationLog[];

  // Currently selected file in the editor
  selectedFilePath: string | null;
}

// ============================================================================
// Actions Interface
// ============================================================================

interface AppActions {
  // Project actions
  setProject: (project: ProjectMetadata) => void;
  updateProject: (partial: Partial<ProjectMetadata>) => void;

  // File tree actions
  setFileTree: (tree: FileNode[]) => void;
  addFile: (file: FileNode) => void;
  updateFile: (path: string, updates: Partial<FileNode>) => void;
  removeFile: (path: string) => void;
  setFileStatus: (path: string, status: FileNodeStatus) => void;
  setFileContent: (path: string, content: string) => void;

  // Generation log actions
  addGenerationLog: (log: GenerationLog) => void;
  updateGenerationLog: (id: string, updates: Partial<GenerationLog>) => void;
  appendGenerationLog: (id: string, message: string) => void;
  setGenerationStatus: (id: string, status: GenerationStatus) => void;
  clearGenerationLogs: () => void;

  // Editor selection
  setSelectedFilePath: (path: string | null) => void;

  // Utility actions
  resetStore: () => void;
}

// ============================================================================
// Combined State and Actions Type
// ============================================================================

type AppStore = AppState & AppActions;

// ============================================================================
// Initial State
// ============================================================================

const initialProject: ProjectMetadata = {
  id: '',
  name: 'Untitled Project',
  description: '',
  gitRepoUrl: undefined,
};

const initialState: AppState = {
  project: initialProject,
  fileTree: [],
  generationLogs: [],
  selectedFilePath: null,
};

// ============================================================================
// Helper Functions
// ============================================================================

/** Find a file node by path in the tree (depth-first search) */
const findFileNode = (tree: FileNode[], path: string): FileNode | null => {
  for (const node of tree) {
    if (node.path === path) {
      return node;
    }
    if (node.children && node.children.length > 0) {
      const found = findFileNode(node.children, path);
      if (found) return found;
    }
  }
  return null;
};

/** Remove a file node by path from the tree */
const removeFileNode = (tree: FileNode[], path: string): FileNode[] => {
  return tree
    .map(node => {
      if (node.path === path) {
        return null;
      }
      if (node.children && node.children.length > 0) {
        return {
          ...node,
          children: removeFileNode(node.children, path),
        };
      }
      return node;
    })
    .filter(Boolean) as FileNode[];
};

/** Update a file node by path in the tree */
const updateFileNode = (
  tree: FileNode[],
  path: string,
  updates: Partial<FileNode>
): FileNode[] => {
  return tree.map(node => {
    if (node.path === path) {
      return { ...node, ...updates };
    }
    if (node.children && node.children.length > 0) {
      return {
        ...node,
        children: updateFileNode(node.children, path, updates),
      };
    }
    return node;
  });
};

// ============================================================================
// Zustand Store
// ============================================================================

export const useAppStore = create<AppStore>((set, get) => ({
  // Initial state
  ...initialState,

  // ==========================================================================
  // Project Actions
  // ==========================================================================

  setProject: (project: ProjectMetadata) => {
    set({ project });
  },

  updateProject: (partial: Partial<ProjectMetadata>) => {
    set({ project: { ...get().project, ...partial } });
  },

  // ==========================================================================
  // File Tree Actions
  // ==========================================================================

  setFileTree: (tree: FileNode[]) => {
    set({ fileTree: tree });
  },

  addFile: (file: FileNode) => {
    set({ fileTree: [...get().fileTree, file] });
  },

  updateFile: (path: string, updates: Partial<FileNode>) => {
    set({ fileTree: updateFileNode(get().fileTree, path, updates) });
  },

  removeFile: (path: string) => {
    set({ fileTree: removeFileNode(get().fileTree, path) });
  },

  setFileStatus: (path: string, status: FileNodeStatus) => {
    set({
      fileTree: updateFileNode(get().fileTree, path, { status }),
    });
  },

  setFileContent: (path: string, content: string) => {
    set({
      fileTree: updateFileNode(get().fileTree, path, { content }),
    });
  },

  // ==========================================================================
  // Generation Log Actions
  // ==========================================================================

  addGenerationLog: (log: GenerationLog) => {
    set({ generationLogs: [...get().generationLogs, log] });
  },

  updateGenerationLog: (id: string, updates: Partial<GenerationLog>) => {
    set({
      generationLogs: get().generationLogs.map(l =>
        l.id === id ? { ...l, ...updates } : l
      ),
    });
  },

  appendGenerationLog: (id: string, message: string) => {
    set({
      generationLogs: get().generationLogs.map(l =>
        l.id === id
          ? { ...l, logs: [...l.logs, `[${new Date().toISOString()}] ${message}`] }
          : l
      ),
    });
  },

  setGenerationStatus: (id: string, status: GenerationStatus) => {
    set({
      generationLogs: get().generationLogs.map(l =>
        l.id === id ? { ...l, status } : l
      ),
    });
  },

  clearGenerationLogs: () => {
    set({ generationLogs: [] });
  },

  // ==========================================================================
  // Editor Selection Actions
  // ==========================================================================

  setSelectedFilePath: (path: string | null) => {
    set({ selectedFilePath: path });
  },

  // ==========================================================================
  // Utility Actions
  // ==========================================================================

  resetStore: () => {
    set(initialState);
  },
}));

// ============================================================================
// Selector Hooks for better performance and type safety
// ============================================================================

// Project selectors
export const useProject = () => useAppStore(state => state.project);
export const useProjectId = () => useAppStore(state => state.project.id);
export const useProjectName = () => useAppStore(state => state.project.name);

// File tree selectors
export const useFileTree = () => useAppStore(state => state.fileTree);
export const useSetFileTree = () => useAppStore(state => state.setFileTree);
export const useFileByPath = (path: string) =>
  useAppStore(state => findFileNode(state.fileTree, path));
export const useFileContent = (path: string) =>
  useAppStore(state => findFileNode(state.fileTree, path)?.content ?? '');
export const useFileStatus = (path: string) =>
  useAppStore(state => findFileNode(state.fileTree, path)?.status ?? 'idle');

// Generation log selectors
export const useGenerationLogs = () => useAppStore(state => state.generationLogs);
export const useActiveGeneration = () =>
  useAppStore(state => state.generationLogs.find(log => log.status === 'generating' || log.status === 'running') ?? null);
export const useLatestGeneration = () =>
  useAppStore(state => state.generationLogs.length > 0 ? state.generationLogs[state.generationLogs.length - 1] : null);

// Editor selection selectors
export const useSelectedFilePath = () => useAppStore(state => state.selectedFilePath);
export const useSelectedFile = () =>
  useAppStore(state => {
    const selectedPath = state.selectedFilePath;
    return selectedPath ? findFileNode(state.fileTree, selectedPath) : null;
  });

// Combined selectors
export const useAppState = () => useAppStore();
