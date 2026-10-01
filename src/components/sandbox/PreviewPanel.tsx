'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import type { WebContainer } from '@webcontainer/api';
import { ExternalLink, LoaderCircle, RotateCw, Terminal, Trash2 } from 'lucide-react';
import { useFileTree, useProject, useGenerationLogs, type FileNode } from '@/store/useAppStore';

type WebContainerInstance = WebContainer;
type Process = Awaited<ReturnType<WebContainer['spawn']>>;

/**
 * PreviewPanel Component
 * 
 * Uses @webcontainer/api to run the generated project code in a browser-based
 * Node.js environment. Provides real-time terminal output and live preview.
 */
export default function PreviewPanel() {
  const fileTree = useFileTree();
  const project = useProject();
  const generationLogs = useGenerationLogs();
  
  const [webcontainerInstance, setWebcontainerInstance] = useState<WebContainerInstance | null>(null);
  const [terminalOutput, setTerminalOutput] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isServerReady, setIsServerReady] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const devProcessRef = useRef<Process | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  /**
   * Append text to terminal output with auto-scrolling
   */
  const appendTerminal = useCallback((text: string) => {
    setTerminalOutput(prev => {
      // Limit terminal output to prevent memory issues
      const newOutput = prev + text;
      return newOutput.slice(-10000); // Keep last 10k characters
    });
  }, []);

  /**
   * Clear terminal output
   */
  const clearTerminal = useCallback(() => {
    setTerminalOutput('');
  }, []);

  /**
   * Recursively flatten the file tree into a flat file map
   */
  const flattenFileTree = useCallback((
    nodes: FileNode[],
    prefix = ''
  ): Record<string, { content: string; isDirectory: boolean }> => {
    const files: Record<string, { content: string; isDirectory: boolean }> = {};

    nodes.forEach(node => {
      const fullPath = prefix ? `${prefix}/${node.path}` : node.path;

      if (node.isDirectory) {
        files[fullPath] = { content: '', isDirectory: true };
        if (node.children && node.children.length > 0) {
          Object.assign(files, flattenFileTree(node.children, fullPath));
        }
      } else {
        files[fullPath] = { content: node.content, isDirectory: false };
      }
    });

    return files;
  }, []);

  /**
   * Mount all files to the WebContainer filesystem
   */
  const mountFiles = useCallback(async (
    wc: WebContainerInstance,
    files: Record<string, { content: string; isDirectory: boolean }>
  ) => {
    // Sort by path to ensure directories are created before files
    const sortedEntries = Object.entries(files).sort(([a], [b]) => {
      const aDepth = a.split('/').length;
      const bDepth = b.split('/').length;
      return aDepth - bDepth;
    });

    for (const [path, { content, isDirectory }] of sortedEntries) {
      if (isDirectory) {
        await wc.fs.mkdir(path, { recursive: true });
      } else {
        await wc.fs.writeFile(path, content);
      }
    }
  }, []);

  /**
   * Create a writable stream that appends to terminal
   */
  const createTerminalStream = useCallback(() => {
    return new WritableStream<string>({
      write(chunk) {
        appendTerminal(chunk);
      },
    });
  }, [appendTerminal]);

  /**
   * Initialize WebContainer and run the application
   */
  const initializeContainer = useCallback(async () => {
    let isMounted = true;
    let wc: WebContainerInstance | null = null;
    let devProcess: Process | null = null;

    try {
      appendTerminal('🔧 Booting WebContainer...\n');

      // Dynamic import of WebContainer
      const { WebContainer } = await import('@webcontainer/api');
      wc = await WebContainer.boot();

      if (!isMounted) {
        await wc.teardown();
        return;
      }

      setWebcontainerInstance(wc);
      wc.on('server-ready', (_port, url) => {
        setPreviewUrl(url);
        setIsServerReady(true);
        if (iframeRef.current) {
          iframeRef.current.src = url;
        }
        appendTerminal(`✅ Server running at ${url}\n`);
      });
      appendTerminal('✅ WebContainer initialized\n');

      // Flatten and mount all files
      const files = flattenFileTree(fileTree);
      const fileCount = Object.keys(files).filter(k => !files[k].isDirectory).length;
      appendTerminal(`📁 Mounting ${fileCount} files to filesystem...
`);

      await mountFiles(wc, files);
      appendTerminal(`✅ Mounted ${fileCount} files
`);

      // Check for package.json and extract dev script
      let pkgJson: { name?: string; scripts?: { dev?: string } } = {};
      let devCommand = 'npx http-server . -p 3000';

      try {
        const pkgContent = await wc.fs.readFile('package.json', 'utf-8');
        pkgJson = JSON.parse(pkgContent);
        
        if (pkgJson.scripts?.dev) {
          devCommand = pkgJson.scripts.dev;
        }
      } catch (e) {
        appendTerminal('⚠️ No package.json found, using default dev server\n');
        // Create minimal package.json
        const defaultPkg = {
          name: project.name || 'karacter-app',
          version: '1.0.0',
          type: 'module',
          scripts: { dev: devCommand },
          dependencies: {},
        };
        await wc.fs.writeFile('package.json', JSON.stringify(defaultPkg, null, 2));
        pkgJson = defaultPkg;
      }

      // Install dependencies
      appendTerminal('📦 Installing dependencies (this may take a moment)...\n');
      const installProcess = await wc.spawn('npm', ['install']);
      await installProcess.output.pipeTo(createTerminalStream());
      await installProcess.exit;
      appendTerminal('✅ Dependencies installed\n');

      // Parse dev command and start server
      const devArgs = devCommand.split(' ');
      const command = devArgs[0];
      const args = devArgs.slice(1);

      appendTerminal(`▶️ Starting: ${devCommand}...
`);
      devProcess = await wc.spawn(command, args);
      devProcessRef.current = devProcess;

      // Pipe dev server output to terminal
      const devOutputStream = createTerminalStream();
      
      // Forward server output to the terminal once.
      devProcess.output.pipeTo(devOutputStream).catch(() => {});

      setIsLoading(false);

    } catch (err) {
      console.error('WebContainer initialization error:', err);
      if (isMounted) {
        const errorMessage = err instanceof Error ? err.message : 'Unknown error';
        setError(errorMessage);
        appendTerminal(`❌ Error: ${errorMessage}\n`);
        setIsLoading(false);
      }
      
      // Cleanup on error
      if (devProcess) {
        devProcess.kill();
      }
      if (wc) {
        wc.teardown();
      }
    }

    return () => {
      isMounted = false;
      // Cleanup
      if (devProcess) {
        devProcess.kill();
      }
      if (wc) {
        wc.teardown();
      }
    };
  }, [fileTree, project.name, appendTerminal, flattenFileTree, mountFiles, createTerminalStream]);

  /**
   * Re-initialize the container (e.g., after code changes)
   */
  const restartContainer = useCallback(async () => {
    if (devProcessRef.current) {
      devProcessRef.current.kill();
    }
    if (webcontainerInstance) {
      webcontainerInstance.teardown();
      setWebcontainerInstance(null);
      setIsServerReady(false);
      setPreviewUrl(null);
      setTerminalOutput('');
      setIsLoading(true);
    }
    await initializeContainer();
  }, [webcontainerInstance, initializeContainer]);

  /**
   * Initialize on mount and when files change
   */
  useEffect(() => {
    const cleanupPromise = initializeContainer();
    
    return () => {
      cleanupPromise.then(cleanup => cleanup?.()).catch(() => {});
    };
  }, [fileTree, initializeContainer]);

  /**
   * Cleanup on unmount
   */
  useEffect(() => {
    return () => {
      if (devProcessRef.current) {
        devProcessRef.current.kill();
      }
      if (webcontainerInstance) {
        webcontainerInstance.teardown();
      }
    };
  }, [webcontainerInstance]);

  // Error state
  if (error) {
    return (
      <div className="flex h-full flex-col bg-surface-inverse text-white">
        <div className="flex items-center justify-between border-b border-white/10 bg-[#321e1b] p-3">
          <h2 className="text-sm font-medium">Preview Error</h2>
          <button
            onClick={restartContainer}
            className="rounded-md bg-[#a74f41] px-3 py-1.5 text-xs font-medium hover:bg-[#bd5d4d]"
          >
            Retry
          </button>
        </div>
        <pre className="flex-1 overflow-auto bg-[#172622] p-4 font-mono text-sm">
          {error}
        </pre>
      </div>
    );
  }

  return (
    <div className="flex h-full min-w-0 flex-1 flex-col bg-[#111d1a] text-[#e8f0eb]" ref={containerRef}>
      {/* Header */}
      <div className="flex items-center justify-between border-b border-white/10 bg-[#172622] px-3 py-2.5">
        <h2 className="flex items-center gap-2 text-xs font-medium">
          <span className={`size-1.5 rounded-full ${isServerReady ? 'bg-[#8ddc84]' : isLoading ? 'animate-pulse bg-[#e7bb62]' : 'bg-white/30'}`}></span>
          Live Preview
        </h2>
        <div className="flex items-center gap-2 text-[11px]">
          {isLoading && (
            <span className="flex items-center gap-1.5 text-[#a7d8c1]">
              <LoaderCircle size={13} className="animate-spin" />
              Loading...
            </span>
          )}
          {isServerReady && (
            <a
              href={previewUrl || ''}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 text-[#b7e690] hover:text-white"
            >
              Open preview <ExternalLink size={12} />
            </a>
          )}
          <button
            onClick={clearTerminal}
            className="grid size-7 place-items-center rounded-md text-white/50 transition-colors hover:bg-white/10 hover:text-white"
            title="Clear terminal"
            aria-label="Clear terminal"
          >
            <Trash2 size={14} />
          </button>
          <button
            onClick={restartContainer}
            className="grid size-7 place-items-center rounded-md text-white/50 transition-colors hover:bg-white/10 hover:text-white"
            title="Restart container"
            aria-label="Restart container"
          >
            <RotateCw size={14} />
          </button>
        </div>
      </div>

      {/* Terminal Output */}
      <div className="border-b border-white/10">
        <div className="flex items-center gap-2 bg-[#14211e] px-3 py-2 font-mono text-[9px] uppercase tracking-[0.1em] text-white/45">
          <Terminal size={12} />
          <span>Terminal</span>
          <span className="text-white/30">
            {generationLogs.length > 0 && `(${generationLogs.length} generation${generationLogs.length > 1 ? 's' : ''} active)`}
          </span>
        </div>
        <div className="h-36 overflow-auto bg-[#0b1311] p-3 font-mono text-[10px] leading-5 text-[#c2d1c8]">
          <pre className="whitespace-pre-wrap">{terminalOutput || 'Waiting for output...'}</pre>
        </div>
      </div>

      {/* Preview Frame */}
      <div className="relative min-h-0 flex-1 bg-[#202e29]">
        <iframe
          ref={iframeRef}
          className="size-full border-none bg-white"
          sandbox="allow-same-origin allow-scripts allow-popups allow-forms allow-modals allow-downloads"
          title="Live Preview"
        />
        
        {/* Loading Overlay */}
        {isLoading && !isServerReady && (
          <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-[#172622]/90 backdrop-blur-sm">
            <div className="flex flex-col items-center gap-3">
              <div className="flex gap-2">
                <div className="size-2 animate-bounce rounded-full bg-brand" style={{ animationDelay: '0ms' }}></div>
                <div className="size-2 animate-bounce rounded-full bg-brand" style={{ animationDelay: '150ms' }}></div>
                <div className="size-2 animate-bounce rounded-full bg-brand" style={{ animationDelay: '300ms' }}></div>
              </div>
              <span className="text-sm text-white/75">
                {webcontainerInstance ? 'Mounting files...' : 'Initializing WebContainer...'}
              </span>
            </div>
          </div>
        )}
        
        {/* Waiting for Server Overlay */}
        {webcontainerInstance && !isServerReady && !isLoading && (
          <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-[#172622]/90 backdrop-blur-sm">
            <div className="flex flex-col items-center gap-3">
              <LoaderCircle size={28} className="animate-spin text-brand" />
              <span className="text-sm text-white/75">Starting development server...</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
