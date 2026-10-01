'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import type { WebContainer } from '@webcontainer/api';
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
  }, [fileTree, project.name, appendTerminal, clearTerminal, flattenFileTree, mountFiles, createTerminalStream]);

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
      <div className="flex flex-col h-full bg-gray-900 text-white">
        <div className="flex items-center justify-between p-3 border-b border-gray-700 bg-red-900/30">
          <h2 className="text-sm font-medium">Preview Error</h2>
          <button
            onClick={restartContainer}
            className="text-xs bg-red-600 hover:bg-red-700 px-2 py-1 rounded"
          >
            Retry
          </button>
        </div>
        <pre className="flex-1 overflow-auto bg-gray-800 p-4 text-sm font-mono">
          {error}
        </pre>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-gray-900 text-white" ref={containerRef}>
      {/* Header */}
      <div className="flex items-center justify-between p-2 border-b border-gray-700 bg-gray-800">
        <h2 className="text-sm font-medium flex items-center gap-2">
          <span className={`w-2 h-2 rounded-full ${isServerReady ? 'bg-green-500' : isLoading ? 'bg-yellow-500 animate-pulse' : 'bg-gray-500'}`}></span>
          Live Preview
        </h2>
        <div className="flex items-center gap-2 text-xs">
          {isLoading && (
            <span className="text-blue-400">
              <span className="animate-spin inline-block w-3 h-3 border border-current border-t-transparent rounded-full mr-1"></span>
              Loading...
            </span>
          )}
          {isServerReady && (
            <a
              href={previewUrl || ''}
              target="_blank"
              rel="noopener noreferrer"
              className="text-green-400 hover:text-green-300 hover:underline"
            >
              Open in new tab
            </a>
          )}
          <button
            onClick={clearTerminal}
            className="text-gray-500 hover:text-white hover:bg-gray-700 px-2 py-1 rounded"
            title="Clear terminal"
          >
            🗑️
          </button>
          <button
            onClick={restartContainer}
            className="text-gray-500 hover:text-white hover:bg-gray-700 px-2 py-1 rounded"
            title="Restart container"
          >
            🔄
          </button>
        </div>
      </div>

      {/* Terminal Output */}
      <div className="border-b border-gray-700">
        <div className="bg-gray-800 px-2 py-1 text-xs text-gray-400 flex items-center gap-2">
          <span>🪟 Terminal</span>
          <span className="text-gray-500">
            {generationLogs.length > 0 && `(${generationLogs.length} generation${generationLogs.length > 1 ? 's' : ''} active)`}
          </span>
        </div>
        <div className="h-40 overflow-auto bg-black p-3 text-xs font-mono">
          <pre className="whitespace-pre-wrap">{terminalOutput || 'Waiting for output...'}</pre>
        </div>
      </div>

      {/* Preview Frame */}
      <div className="flex-1 relative bg-gray-800">
        <iframe
          ref={iframeRef}
          className="w-full h-full border-none bg-white"
          sandbox="allow-same-origin allow-scripts allow-popups allow-forms allow-modals allow-downloads"
          title="Live Preview"
        />
        
        {/* Loading Overlay */}
        {isLoading && !isServerReady && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-gray-800/90 backdrop-blur-sm z-10">
            <div className="flex flex-col items-center gap-3">
              <div className="flex gap-2">
                <div className="w-2 h-2 rounded-full bg-blue-500 animate-bounce" style={{ animationDelay: '0ms' }}></div>
                <div className="w-2 h-2 rounded-full bg-blue-500 animate-bounce" style={{ animationDelay: '150ms' }}></div>
                <div className="w-2 h-2 rounded-full bg-blue-500 animate-bounce" style={{ animationDelay: '300ms' }}></div>
              </div>
              <span className="text-gray-300 text-sm">
                {webcontainerInstance ? 'Mounting files...' : 'Initializing WebContainer...'}
              </span>
            </div>
          </div>
        )}
        
        {/* Waiting for Server Overlay */}
        {webcontainerInstance && !isServerReady && !isLoading && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-gray-800/90 backdrop-blur-sm z-10">
            <div className="flex flex-col items-center gap-3">
              <div className="animate-spin rounded-full h-8 w-8 border-4 border-blue-500 border-t-transparent"></div>
              <span className="text-gray-300 text-sm">Starting development server...</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
