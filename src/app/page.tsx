'use client';

import { useCallback, useEffect, useState, type KeyboardEvent } from 'react';
import {
  ArrowRight,
  Check,
  Code2,
  FileCode2,
  FolderOpen,
  LoaderCircle,
  Menu,
  Plus,
  Save,
  Sparkles,
  WandSparkles,
  X,
  Zap,
} from 'lucide-react';
import { useAppStore, useFileTree, useGenerationLogs, useProject, type FileNode, type GenerationLog } from '@/store/useAppStore';
import PreviewPanel from '@/components/sandbox/PreviewPanel';
import RefactorChat from '@/components/chat/RefactorChat';

interface SavedProject {
  id: string;
  name: string;
  description: string;
  updatedAt: string;
}

interface GeneratedProject {
  name?: string;
  description?: string;
}

interface GeneratedResponse {
  project?: GeneratedProject;
  files?: Array<{ path: string; content: string }>;
}

const STARTER_PROMPTS = [
  'A calm dashboard for tracking the habits I want to keep',
  'A local-first recipe box with a weekly meal planner',
  'A tiny team wiki with search and Markdown pages',
  'A storefront for an independent ceramics studio',
];

function buildFileTree(files: Array<{ path: string; content: string }>): FileNode[] {
  const root: FileNode[] = [];
  const directories = new Map<string, FileNode>();

  for (const file of [...files].sort((left, right) => left.path.localeCompare(right.path))) {
    const parts = file.path.split('/').filter(Boolean);
    const filename = parts.pop();
    if (!filename || parts.some(part => part === '.' || part === '..')) continue;

    let parentPath = '';
    let siblings = root;
    for (const part of parts) {
      parentPath = parentPath ? `${parentPath}/${part}` : part;
      let directory = directories.get(parentPath);
      if (!directory) {
        directory = { path: part, content: '', status: 'idle', isDirectory: true, children: [] };
        siblings.push(directory);
        directories.set(parentPath, directory);
      }
      directory.children ??= [];
      siblings = directory.children;
    }

    siblings.push({ path: filename, content: file.content, status: 'idle', isDirectory: false });
  }

  return root;
}

function countFiles(nodes: FileNode[]): number {
  return nodes.reduce((count, node) =>
    node.isDirectory ? count + countFiles(node.children ?? []) : count + 1, 0
  );
}

function projectRevision(name: string, description: string, fileTree: FileNode[]) {
  return JSON.stringify([name, description, fileTree]);
}

export default function HomePage() {
  const project = useProject();
  const fileTree = useFileTree();
  const generationLogs = useGenerationLogs();
  const setProject = useAppStore(state => state.setProject);
  const setFileTree = useAppStore(state => state.setFileTree);
  const addGenerationLog = useAppStore(state => state.addGenerationLog);
  const appendGenerationLog = useAppStore(state => state.appendGenerationLog);
  const updateGenerationLog = useAppStore(state => state.updateGenerationLog);

  const [prompt, setPrompt] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [generationError, setGenerationError] = useState<string | null>(null);
  const [storageError, setStorageError] = useState<string | null>(null);
  const [libraryState, setLibraryState] = useState<'loading' | 'ready' | 'unavailable'>('loading');
  const [savedProjects, setSavedProjects] = useState<SavedProject[]>([]);
  const [savedRevision, setSavedRevision] = useState('');
  const [mobileLibraryOpen, setMobileLibraryOpen] = useState(false);
  const [mobilePane, setMobilePane] = useState<'preview' | 'refine'>('preview');

  const hasFiles = fileTree.length > 0;
  const fileCount = countFiles(fileTree);
  const currentRevision = projectRevision(project.name, project.description, fileTree);
  const isSaved = Boolean(project.id) && currentRevision === savedRevision;

  const refreshLibrary = useCallback(async () => {
    try {
      const response = await fetch('/api/projects');
      if (!response.ok) throw new Error('Project storage is not configured yet.');
      const data = await response.json() as { projects: SavedProject[] };
      setSavedProjects(data.projects);
      setLibraryState('ready');
      setStorageError(null);
    } catch (error) {
      setLibraryState('unavailable');
      setStorageError(error instanceof Error ? error.message : 'Project storage is unavailable.');
    }
  }, []);

  useEffect(() => {
    void refreshLibrary();
  }, [refreshLibrary]);

  const handleNewProject = useCallback(() => {
    setProject({ id: '', name: 'Untitled project', description: '', gitRepoUrl: undefined });
    setFileTree([]);
    setPrompt('');
    setGenerationError(null);
    setSavedRevision('');
    setMobileLibraryOpen(false);
  }, [setFileTree, setProject]);

  const handleGenerate = useCallback(async () => {
    const requestPrompt = prompt.trim();
    if (!requestPrompt || isGenerating) return;

    setIsGenerating(true);
    setGenerationError(null);
    setStorageError(null);
    setFileTree([]);

    const logId = `gen-${Date.now()}`;
    const log: GenerationLog = {
      id: logId,
      prompt: requestPrompt,
      status: 'generating',
      logs: [`Starting generation for: ${requestPrompt}`],
      timestamp: new Date(),
    };
    addGenerationLog(log);

    const fallbackName = requestPrompt.split(/\s+/).slice(0, 4).join(' ');
    setProject({ id: '', name: fallbackName, description: requestPrompt, gitRepoUrl: undefined });

    try {
      const response = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: requestPrompt }),
      });
      if (!response.ok || !response.body) {
        throw new Error(`Generation failed (${response.status}). Check the server logs and AI credentials.`);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let output = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        output += chunk;
        appendGenerationLog(logId, chunk);
      }
      output += decoder.decode();

      const jsonStart = output.indexOf('{');
      const jsonEnd = output.lastIndexOf('}');
      if (jsonStart < 0 || jsonEnd <= jsonStart) throw new Error('The AI response did not contain a complete project.');
      const generated = JSON.parse(output.slice(jsonStart, jsonEnd + 1)) as GeneratedResponse;
      const files = generated.files?.filter(file =>
        typeof file.path === 'string' && typeof file.content === 'string'
      ) ?? [];
      if (!files.length) throw new Error('The AI response did not include any project files.');

      const nextTree = buildFileTree(files);
      setProject({
        id: '',
        name: generated.project?.name?.trim() || fallbackName,
        description: generated.project?.description?.trim() || requestPrompt,
        gitRepoUrl: undefined,
      });
      setFileTree(nextTree);
      setSavedRevision('');
      updateGenerationLog(logId, { status: 'completed' });
      appendGenerationLog(logId, `Generated ${files.length} files.`);
      setMobilePane('preview');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Generation failed.';
      setGenerationError(message);
      updateGenerationLog(logId, { status: 'error' });
      appendGenerationLog(logId, `Error: ${message}`);
    } finally {
      setIsGenerating(false);
    }
  }, [prompt, isGenerating, setFileTree, addGenerationLog, appendGenerationLog, setProject, updateGenerationLog]);

  const handleSave = useCallback(async () => {
    if (!hasFiles || isSaving) return;
    setIsSaving(true);
    setStorageError(null);

    try {
      const isExistingProject = /^[0-9a-f-]{36}$/i.test(project.id);
      const response = await fetch(
        isExistingProject ? `/api/projects/${project.id}` : '/api/projects',
        {
          method: isExistingProject ? 'PUT' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: project.name,
            description: project.description,
            gitRepoUrl: project.gitRepoUrl,
            fileTree,
          }),
        },
      );
      const data = await response.json() as { project?: SavedProject & { gitRepoUrl?: string | null }; error?: string };
      if (!response.ok || !data.project) throw new Error(data.error || 'Unable to save this project.');

      setProject({
        id: data.project.id,
        name: data.project.name,
        description: data.project.description,
        gitRepoUrl: data.project.gitRepoUrl ?? undefined,
      });
      setSavedRevision(currentRevision);
      await refreshLibrary();
    } catch (error) {
      setStorageError(error instanceof Error ? error.message : 'Project storage is unavailable.');
    } finally {
      setIsSaving(false);
    }
  }, [hasFiles, isSaving, project, fileTree, currentRevision, setProject, refreshLibrary]);

  const handleOpenProject = useCallback(async (id: string) => {
    setStorageError(null);
    try {
      const response = await fetch(`/api/projects/${id}`);
      const data = await response.json() as {
        project?: SavedProject & { gitRepoUrl?: string | null; fileTree: FileNode[] };
        error?: string;
      };
      if (!response.ok || !data.project) throw new Error(data.error || 'Unable to load this project.');

      const saved = data.project;
      setProject({
        id: saved.id,
        name: saved.name,
        description: saved.description,
        gitRepoUrl: saved.gitRepoUrl ?? undefined,
      });
      setFileTree(saved.fileTree);
      setSavedRevision(projectRevision(saved.name, saved.description, saved.fileTree));
      setMobilePane('preview');
      setMobileLibraryOpen(false);
    } catch (error) {
      setStorageError(error instanceof Error ? error.message : 'Unable to load this project.');
    }
  }, [setFileTree, setProject]);

  const handleKeyDown = useCallback((event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey && !isGenerating) {
      event.preventDefault();
      void handleGenerate();
    }
  }, [handleGenerate, isGenerating]);

  return (
    <main className="min-h-screen bg-canvas text-ink md:flex">
      {mobileLibraryOpen && (
        <button
          aria-label="Close project library"
          className="fixed inset-0 z-30 bg-ink/30 md:hidden"
          onClick={() => setMobileLibraryOpen(false)}
        />
      )}

      <aside className={`${mobileLibraryOpen ? 'fixed inset-y-0 left-0 z-40 flex w-[min(84vw,300px)]' : 'hidden'} flex-col border-r border-line bg-surface md:sticky md:top-0 md:flex md:h-screen md:w-[252px] md:shrink-0`}>
        <div className="flex h-[68px] items-center justify-between border-b border-line px-5">
          <a href="#workspace" className="flex items-center gap-3" onClick={() => setMobileLibraryOpen(false)}>
            <span className="grid size-9 place-items-center rounded-[11px] bg-brand text-brand-deep">
              <Sparkles size={19} strokeWidth={2.4} />
            </span>
            <span>
              <span className="block text-[15px] font-semibold">KaracterHub</span>
              <span className="mt-0.5 block font-mono text-[9px] uppercase tracking-[0.12em] text-muted">Idea to interface</span>
            </span>
          </a>
          <button className="grid size-8 place-items-center text-muted md:hidden" onClick={() => setMobileLibraryOpen(false)} aria-label="Close navigation">
            <X size={17} />
          </button>
        </div>

        <div className="p-4">
          <button
            onClick={handleNewProject}
            className="flex h-10 w-full items-center justify-center gap-2 rounded-[10px] bg-brand px-3 text-[13px] font-semibold text-brand-deep transition-colors hover:bg-brand-hover"
          >
            <Plus size={16} /> New build
          </button>
        </div>

        <div className="flex items-center justify-between px-5 pb-2 pt-1">
          <p className="font-mono text-[10px] font-medium uppercase tracking-[0.12em] text-muted">Your projects</p>
          <span className="font-mono text-[10px] text-muted">{savedProjects.length.toString().padStart(2, '0')}</span>
        </div>
        <nav className="min-h-0 flex-1 overflow-y-auto px-3 pb-4" aria-label="Saved projects">
          {libraryState === 'loading' && (
            <div className="flex items-center gap-2 px-2 py-3 text-xs text-muted"><LoaderCircle size={14} className="animate-spin" /> Loading library</div>
          )}
          {libraryState === 'ready' && savedProjects.length === 0 && (
            <p className="px-2 py-3 text-xs leading-5 text-muted">Saved builds will live here.</p>
          )}
          {savedProjects.map(saved => (
            <button
              key={saved.id}
              onClick={() => void handleOpenProject(saved.id)}
              className={`mb-1 flex w-full items-start gap-2.5 rounded-[9px] px-2.5 py-2.5 text-left transition-colors hover:bg-surface-soft ${project.id === saved.id ? 'bg-surface-soft text-ink' : 'text-ink-soft'}`}
            >
              <FileCode2 className="mt-0.5 shrink-0 text-muted" size={15} />
              <span className="min-w-0">
                <span className="block truncate text-[12px] font-medium">{saved.name}</span>
                <span className="mt-1 block truncate text-[10px] text-muted">{saved.description || 'Untitled build'}</span>
              </span>
            </button>
          ))}
          {libraryState === 'unavailable' && (
            <p className="mx-1 mt-2 rounded-lg border border-line bg-surface-soft p-3 text-[11px] leading-5 text-muted">
              Connect Neon with <code className="font-mono text-ink-soft">DATABASE_URL</code> to save and reopen projects.
            </p>
          )}
        </nav>

        <div className="border-t border-line p-4">
          <div className="flex items-center gap-3 rounded-[10px] bg-surface-soft p-3">
            <span className="grid size-8 shrink-0 place-items-center rounded-full bg-mint text-[11px] font-semibold text-brand-deep">KH</span>
            <span className="min-w-0">
              <span className="block text-xs font-medium">Private workspace</span>
              <span className="mt-0.5 block truncate text-[10px] text-muted">This browser session</span>
            </span>
            <span className="ml-auto size-1.5 rounded-full bg-[#59ad70]" aria-label="Workspace active" />
          </div>
        </div>
      </aside>

      <div id="workspace" className="flex min-h-screen min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 flex h-[68px] items-center justify-between border-b border-line bg-canvas/95 px-4 backdrop-blur-md sm:px-7 lg:px-9">
          <div className="flex min-w-0 items-center gap-3">
            <button className="grid size-9 place-items-center rounded-lg border border-line bg-surface md:hidden" onClick={() => setMobileLibraryOpen(true)} aria-label="Open project library">
              <Menu size={17} />
            </button>
            <div className="min-w-0">
              <p className="font-mono text-[9px] uppercase tracking-[0.14em] text-muted">Workspace <span className="px-1.5 text-line-strong">/</span> {hasFiles ? 'Build' : 'New idea'}</p>
              <h1 className="mt-0.5 truncate text-[14px] font-semibold">{hasFiles ? project.name : 'Start with a thought'}</h1>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2 sm:gap-3">
            {hasFiles && (
              <span className={`hidden items-center gap-1.5 text-[11px] sm:flex ${isSaved ? 'text-[#39734c]' : 'text-muted'}`}>
                {isSaving ? <LoaderCircle size={13} className="animate-spin" /> : isSaved ? <Check size={13} /> : <span className="size-1.5 rounded-full bg-[#d08d47]" />}
                {isSaving ? 'Saving' : isSaved ? 'Saved' : 'Unsaved'}
              </span>
            )}
            {hasFiles && (
              <button
                onClick={() => void handleSave()}
                disabled={isSaving || isSaved || libraryState === 'unavailable'}
                className="flex h-9 items-center gap-2 rounded-[9px] border border-line-strong bg-surface px-3 text-xs font-semibold transition-colors hover:bg-surface-soft disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isSaving ? <LoaderCircle size={14} className="animate-spin" /> : isSaved ? <Check size={14} /> : <Save size={14} />}
                <span className="hidden sm:inline">{isSaved ? 'Saved' : 'Save build'}</span>
              </button>
            )}
          </div>
        </header>

        {(storageError || generationError) && (
          <div className="mx-4 mt-4 rounded-[10px] border border-[#e5c6b9] bg-[#fff8f4] px-4 py-3 text-xs text-[#8c4938] sm:mx-7 lg:mx-9">
            {generationError || storageError}
          </div>
        )}

        {!hasFiles ? (
          <section className="mx-auto flex w-full max-w-[1050px] flex-1 flex-col px-5 pb-12 pt-12 sm:px-9 sm:pt-[72px] lg:px-12">
            <div className="animate-enter max-w-[760px]">
              <div className="mb-6 flex items-center gap-2 font-mono text-[10px] font-medium uppercase tracking-[0.13em] text-ink-soft">
                <span className="grid size-6 place-items-center rounded-md bg-mint text-brand-deep"><WandSparkles size={13} /></span>
                Your AI app workspace
              </div>
              <h2 className="max-w-[700px] text-[40px] font-semibold leading-[1.08] sm:text-[54px]">
                From first thought
                <br />
                to <span className="relative inline-block">something real<span className="absolute -bottom-1 left-0 -z-10 h-[13px] w-full bg-brand/70" /></span>.
              </h2>
              <p className="mt-5 max-w-[535px] text-[15px] leading-7 text-ink-soft">
                Describe what you want to make. KaracterHub builds the starting point, runs it live, and gives you room to keep shaping it.
              </p>
            </div>

            <form
              className="animate-enter mt-9 w-full max-w-[790px] rounded-[14px] border border-line-strong bg-surface p-2 shadow-panel sm:mt-10"
              style={{ animationDelay: '70ms' }}
              onSubmit={event => { event.preventDefault(); void handleGenerate(); }}
            >
              <label htmlFor="build-prompt" className="sr-only">Describe your application</label>
              <textarea
                id="build-prompt"
                value={prompt}
                onChange={event => setPrompt(event.target.value)}
                onKeyDown={handleKeyDown}
                disabled={isGenerating}
                placeholder="A neighborhood tool library with lending, returns, and a map..."
                className="min-h-[116px] w-full resize-y border-0 bg-transparent px-4 py-4 text-[15px] leading-6 text-ink outline-none placeholder:text-[#96a39b] focus-visible:outline-none disabled:opacity-60"
                rows={3}
              />
              <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line px-3 pb-1 pt-2.5">
                <span className="flex items-center gap-2 pl-1 text-[11px] text-muted"><Code2 size={14} /> Next.js workspace <span className="text-line-strong">/</span> Live preview</span>
                <button
                  type="submit"
                  disabled={isGenerating || !prompt.trim()}
                  className="flex h-10 items-center gap-2 rounded-[9px] bg-brand px-4 text-[13px] font-semibold text-brand-deep transition-colors hover:bg-brand-hover disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {isGenerating ? <><LoaderCircle size={15} className="animate-spin" /> Building</> : <>Build with Karacter <ArrowRight size={15} /></>}
                </button>
              </div>
            </form>

            <div className="mt-5 flex max-w-[790px] flex-wrap items-center gap-2">
              <span className="mr-1 font-mono text-[9px] uppercase tracking-[0.12em] text-muted">Try a direction</span>
              {STARTER_PROMPTS.map(starter => (
                <button key={starter} onClick={() => setPrompt(starter)} className="rounded-full border border-line bg-surface/70 px-3 py-1.5 text-left text-[11px] text-ink-soft transition-colors hover:border-line-strong hover:bg-surface">
                  {starter}
                </button>
              ))}
            </div>

            {generationLogs.length > 0 && (
              <div className="mt-8 max-w-[790px] border-t border-line pt-5">
                <div className="mb-3 flex items-center justify-between">
                  <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-muted">Recent activity</p>
                  <span className="text-[10px] text-muted">{generationLogs.length} runs</span>
                </div>
                {generationLogs.slice(-3).reverse().map(log => (
                  <div key={log.id} className="flex items-center gap-3 py-2 text-xs">
                    <span className={`size-1.5 rounded-full ${log.status === 'error' ? 'bg-danger' : log.status === 'completed' ? 'bg-[#59ad70]' : 'animate-pulse bg-[#d08d47]'}`} />
                    <span className="min-w-0 flex-1 truncate text-ink-soft">{log.prompt}</span>
                    <span className="font-mono text-[9px] uppercase text-muted">{log.status}</span>
                  </div>
                ))}
              </div>
            )}

            <div className="mt-auto grid max-w-[790px] grid-cols-1 gap-5 border-t border-line pt-7 sm:grid-cols-3 sm:gap-7">
              <div className="animate-enter" style={{ animationDelay: '120ms' }}>
                <span className="grid size-8 place-items-center rounded-[9px] bg-mint text-brand-deep"><Sparkles size={15} /></span>
                <h3 className="mt-3 text-[13px] font-semibold">A useful first draft</h3>
                <p className="mt-1.5 text-[11px] leading-5 text-muted">Turn product intent into files you can inspect and change.</p>
              </div>
              <div className="animate-enter" style={{ animationDelay: '180ms' }}>
                <span className="grid size-8 place-items-center rounded-[9px] bg-blue-soft text-[#355f82]"><Zap size={15} /></span>
                <h3 className="mt-3 text-[13px] font-semibold">A real runtime</h3>
                <p className="mt-1.5 text-[11px] leading-5 text-muted">Run the generated project in an isolated browser preview.</p>
              </div>
              <div className="animate-enter" style={{ animationDelay: '240ms' }}>
                <span className="grid size-8 place-items-center rounded-[9px] bg-[#f7e9ce] text-[#8d632b]"><FolderOpen size={15} /></span>
                <h3 className="mt-3 text-[13px] font-semibold">A workspace that lasts</h3>
                <p className="mt-1.5 text-[11px] leading-5 text-muted">Save builds to your private project library and return later.</p>
              </div>
            </div>
          </section>
        ) : (
          <section className="flex min-h-0 flex-1 flex-col px-4 pb-4 pt-5 sm:px-7 sm:pt-6 lg:px-9">
            <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
              <div className="min-w-0">
                <p className="font-mono text-[9px] uppercase tracking-[0.14em] text-muted">Generated workspace <span className="px-1 text-line-strong">/</span> {fileCount} files</p>
                <h2 className="mt-1 truncate text-xl font-semibold">{project.name}</h2>
                <p className="mt-1 max-w-[660px] truncate text-xs text-muted">{project.description}</p>
              </div>
              <div className="flex items-center gap-2 rounded-[9px] border border-line bg-surface p-1 xl:hidden">
                <button onClick={() => setMobilePane('preview')} className={`rounded-[7px] px-3 py-1.5 text-[11px] font-medium ${mobilePane === 'preview' ? 'bg-surface-inverse text-white' : 'text-muted'}`}>Preview</button>
                <button onClick={() => setMobilePane('refine')} className={`rounded-[7px] px-3 py-1.5 text-[11px] font-medium ${mobilePane === 'refine' ? 'bg-surface-inverse text-white' : 'text-muted'}`}>Refine</button>
              </div>
            </div>

            <div className="grid min-h-[620px] flex-1 grid-cols-1 gap-3 xl:grid-cols-[minmax(0,1fr)_360px]">
              <div className={`${mobilePane === 'preview' ? 'flex' : 'hidden'} min-h-[620px] overflow-hidden rounded-panel border border-[#263b34] bg-surface-inverse shadow-panel xl:flex`}>
                <PreviewPanel />
              </div>
              <div className={`${mobilePane === 'refine' ? 'flex' : 'hidden'} min-h-[620px] overflow-hidden rounded-panel border border-line bg-surface shadow-panel xl:flex`}>
                <RefactorChat />
              </div>
            </div>
          </section>
        )}

        <footer className="flex items-center justify-between border-t border-line px-5 py-3 text-[10px] text-muted sm:px-9">
          <span>KaracterHub <span className="px-1 text-line-strong">·</span> Make the idea tangible.</span>
          <span className="hidden items-center gap-1.5 sm:flex"><span className="size-1.5 rounded-full bg-[#59ad70]" /> Mistral <span className="px-1 text-line-strong">·</span> WebContainer</span>
        </footer>
      </div>
    </main>
  );
}