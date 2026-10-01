'use client';

import { useState, useCallback, useEffect, type KeyboardEvent } from 'react';
import { useAppStore, useProject, useFileTree, useSetFileTree, useGenerationLogs, type FileNode, type GenerationLog } from '@/store/useAppStore';
import PreviewPanel from '@/components/sandbox/PreviewPanel';
import RefactorChat from '@/components/chat/RefactorChat';

// ============================================================================
// Types
// ============================================================================

interface GenerationRequest {
  prompt: string;
}

// ============================================================================
// Helper: Build file tree from AI response
// ============================================================================

function buildFileTreeFromResponse(files: Array<{ path: string; content: string; language?: string }>): FileNode[] {
  const root: FileNode[] = [];
  const nodeMap = new Map<string, FileNode>();
  
  // Sort by path depth (shallow first)
  const sortedFiles = [...files].sort((a, b) => {
    const aDepth = a.path.split('/').length;
    const bDepth = b.path.split('/').length;
    return aDepth - bDepth;
  });
  
  for (const file of sortedFiles) {
    const pathParts = file.path.split('/');
    const filename = pathParts[pathParts.length - 1];
    
    // Skip empty paths
    if (!filename) continue;
    
    // Root file
    if (pathParts.length === 1) {
      const node: FileNode = {
        path: filename,
        content: file.content,
        status: 'idle',
        isDirectory: false,
      };
      root.push(node);
      nodeMap.set(file.path, node);
      continue;
    }
    
    // Nested file - find/create parent directory
    const parentPath = pathParts.slice(0, -1).join('/');
    let parentNode = nodeMap.get(parentPath);
    
    if (!parentNode) {
      // Create parent directory
      const parentPathParts = parentPath.split('/');
      const parentName = parentPathParts[parentPathParts.length - 1];
      
      parentNode = {
        path: parentName,
        content: '',
        status: 'idle',
        isDirectory: true,
        children: [],
      };
      
      // Find where to insert parent
      if (parentPathParts.length === 1) {
        // Root level directory
        root.push(parentNode);
      } else {
        const grandparentPath = parentPathParts.slice(0, -1).join('/');
        const grandparentNode = nodeMap.get(grandparentPath);
        if (grandparentNode && grandparentNode.isDirectory) {
          grandparentNode.children = [...(grandparentNode.children || []), parentNode];
        } else {
          // Fallback: add to root
          root.push(parentNode);
        }
      }
      nodeMap.set(parentPath, parentNode);
    }
    
    if (parentNode && parentNode.isDirectory) {
      const fileNode: FileNode = {
        path: filename,
        content: file.content,
        status: 'idle',
        isDirectory: false,
      };
      parentNode.children = [...(parentNode.children || []), fileNode];
      nodeMap.set(file.path, fileNode);
    }
  }
  
  return root;
}

// ============================================================================
// Placeholder prompts for generation
// ============================================================================

const GENERATION_PROMPTS = [
  'Build a React Todo app with TypeScript and Tailwind CSS',
  'Create a Next.js e-commerce store with product listing page',
  'Make a Vite React dashboard with dark mode and charts',
  'Build a blog with Next.js App Router and Markdown support',
  'Create a portfolio website with responsive design',
  'Build a weather app with API integration',
];

// ============================================================================
// Main Page Component
// ============================================================================

export default function HomePage() {
  const project = useProject();
  const fileTree = useFileTree();
  const setFileTree = useSetFileTree();
  const generationLogs = useGenerationLogs();
  const setProject = useAppStore(state => state.setProject);
  const addGenerationLog = useAppStore(state => state.addGenerationLog);
  const updateGenerationLog = useAppStore(state => state.updateGenerationLog);
  const appendGenerationLog = useAppStore(state => state.appendGenerationLog);
  const setGenerationStatus = useAppStore(state => state.setGenerationStatus);
  const clearGenerationLogs = useAppStore(state => state.clearGenerationLogs);
  
  const [generationPrompt, setGenerationPrompt] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [generationError, setGenerationError] = useState<string | null>(null);
  const [showRefactorChat, setShowRefactorChat] = useState(false);
  const [activeTab, setActiveTab] = useState<'generate' | 'refactor' | 'preview'>('generate');

  // Check if we have existing files
  const hasFiles = fileTree.length > 0;
  const fileCount = fileTree.reduce((count, node) => {
    if (node.isDirectory) {
      return count + (node.children?.length || 0);
    }
    return count + 1;
  }, 0);

  // Generate new application
  const handleGenerate = useCallback(async () => {
    if (!generationPrompt.trim() || isGenerating) return;

    setIsGenerating(true);
    setGenerationError(null);
    setShowRefactorChat(false);
    
    // Create generation log
    const logId = `gen-${Date.now()}`;
    const newLog: GenerationLog = {
      id: logId,
      prompt: generationPrompt.trim(),
      status: 'generating',
      logs: [`Starting generation for: ${generationPrompt.trim()}`],
      timestamp: new Date(),
    };
    addGenerationLog(newLog);

    try {
      // Set project metadata
      const projectName = generationPrompt.trim().split(' ').slice(0, 3).join('-').toLowerCase();
      setProject({
        id: logId,
        name: projectName,
        description: generationPrompt.trim(),
        gitRepoUrl: undefined,
      });

      // Call generation API
      const response = await fetch('/api/generate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          prompt: generationPrompt.trim(),
        }),
      });

      if (!response.ok) {
        throw new Error(`Generation failed: ${response.statusText}`);
      }

      if (!response.body) {
        throw new Error('No response body');
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let accumulatedText = '';
      let parsedResponse: any = null;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        
        const chunk = decoder.decode(value);
        accumulatedText += chunk;

        // Update log
        appendGenerationLog(logId, chunk);

        // Try to parse JSON
        try {
          if (accumulatedText.trim().startsWith('{')) {
            const jsonMatch = accumulatedText.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
              try {
                parsedResponse = JSON.parse(jsonMatch[0]);
                
                // Check if we have files
                if (parsedResponse?.files && Array.isArray(parsedResponse.files)) {
                  // Build file tree
                  const newTree = buildFileTreeFromResponse(parsedResponse.files);
                  setFileTree(newTree);
                  
                  // Update project metadata if provided
                  if (parsedResponse.project) {
                    setProject({
                      ...project,
                      ...parsedResponse.project,
                    });
                  }
                }
              } catch (e) {
                // Continue accumulating
              }
            }
          }
        } catch (e) {
          // Continue accumulating
        }
      }

      // Mark as complete
      updateGenerationLog(logId, { status: 'completed' });
      appendGenerationLog(logId, 'Generation complete!');

      // Switch to preview after generation
      setActiveTab('preview');
      setShowRefactorChat(true);

    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Generation failed';
      setGenerationError(errorMessage);
      appendGenerationLog(logId, `Error: ${errorMessage}`);
      updateGenerationLog(logId, { status: 'error' });
    } finally {
      setIsGenerating(false);
      setGenerationPrompt('');
    }
  }, [generationPrompt, isGenerating, addGenerationLog, appendGenerationLog, updateGenerationLog, setProject, setFileTree, project]);

  // Clear everything and start fresh
  const handleNewProject = useCallback(() => {
    setProject({
      id: '',
      name: 'Untitled Project',
      description: '',
      gitRepoUrl: undefined,
    });
    setFileTree([]);
    clearGenerationLogs();
    setGenerationPrompt('');
    setGenerationError(null);
    setActiveTab('generate');
    setShowRefactorChat(false);
  }, [setProject, setFileTree, clearGenerationLogs]);

  // Handle placeholder click
  const handlePlaceholderClick = useCallback((prompt: string) => {
    setGenerationPrompt(prompt);
  }, []);

  // Handle key down
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey && !isGenerating) {
      e.preventDefault();
      handleGenerate();
    }
  }, [isGenerating, handleGenerate]);

  // Auto-switch to preview when files exist
  useEffect(() => {
    if (hasFiles && activeTab === 'generate') {
      setActiveTab('preview');
      setShowRefactorChat(true);
    }
  }, [hasFiles, activeTab]);

  return (
    <main className="min-h-screen bg-gray-50 dark:bg-gray-900">
      {/* Header */}
      <header className="border-b border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-4">
              <button
                onClick={handleNewProject}
                className="flex items-center gap-2 px-3 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg text-sm font-medium transition-colors"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                </svg>
                New Project
              </button>
              
              <div className="flex items-baseline gap-2">
                <h1 className="text-xl font-bold text-gray-900 dark:text-white">
                  {project.name || 'Karacter Hub'}
                </h1>
                {project.description && (
                  <span className="text-sm text-gray-500 dark:text-gray-400">
                    - {project.description}
                  </span>
                )}
              </div>
            </div>

            <div className="flex items-center gap-4">
              {/* GitHub Deploy Button - Only show when we have files */}
              {hasFiles && (
                <button
                  className="flex items-center gap-2 px-3 py-2 bg-gray-800 dark:bg-white text-white dark:text-gray-800 rounded-lg text-sm font-medium hover:bg-gray-700 dark:hover:bg-gray-100 transition-colors"
                >
                  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/>
                  </svg>
                  Deploy to GitHub
                </button>
              )}

              {/* Theme Toggle */}
              <button className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800">
                <svg className="w-5 h-5 text-gray-600 dark:text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
                </svg>
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Generation Section (only show when no files) */}
        {!hasFiles && (
          <div className="max-w-3xl mx-auto">
            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
              <div className="p-6">
                <h2 className="text-lg font-semibold text-gray-800 dark:text-gray-200 mb-2">
                  Describe your web application
                </h2>
                <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
                  Be as specific as you like. For example: "Build a Todo app with TypeScript, Tailwind CSS, and drag-and-drop sorting"
                </p>

                <div className="flex gap-2 mb-4">
                  <textarea
                    value={generationPrompt}
                    onChange={(e) => setGenerationPrompt(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder="Describe the app you want to build..."
                    disabled={isGenerating}
                    className="flex-1 px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-200 placeholder-gray-500 dark:placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none min-h-[56px] max-h-[200px]"
                    rows={3}
                  />
                  <button
                    onClick={handleGenerate}
                    disabled={isGenerating || !generationPrompt.trim()}
                    className="px-6 py-3 bg-blue-500 hover:bg-blue-600 disabled:bg-blue-300 disabled:cursor-not-allowed text-white rounded-lg font-medium transition-colors flex items-center justify-center gap-2 whitespace-nowrap"
                  >
                    {isGenerating ? (
                      <>
                        <span className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent"></span>
                        Generating...
                      </>
                    ) : (
                      <>
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        Generate App
                      </>
                    )}
                  </button>
                </div>

                {generationError && (
                  <div className="p-3 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 rounded-lg text-sm text-red-600 dark:text-red-400">
                    {generationError}
                  </div>
                )}

                {/* Quick Start Prompts */}
                <div className="mt-4">
                  <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">Quick start:</p>
                  <div className="flex flex-wrap gap-2">
                    {GENERATION_PROMPTS.map((prompt, index) => (
                      <button
                        key={index}
                        onClick={() => handlePlaceholderClick(prompt)}
                        className="text-xs px-3 py-1.5 bg-gray-100 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-full hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 transition-colors"
                      >
                        {prompt}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Generation Logs */}
                {generationLogs.length > 0 && (
                  <div className="mt-6">
                    <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      Generation Logs
                    </h3>
                    <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-4 max-h-40 overflow-auto">
                      {generationLogs.map((log) => (
                        <div key={log.id} className="mb-3">
                          <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">
                            {new Date(log.timestamp).toLocaleTimeString()}
                          </p>
                          <p className="text-sm text-gray-800 dark:text-gray-200">
                            {log.prompt}
                          </p>
                          <p className="text-xs text-blue-600 dark:text-blue-400 mt-1">
                            {log.status}
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Workspace Layout (when we have files) */}
        {hasFiles && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 h-[calc(100vh-200px)] min-h-[600px]">
            {/* Left Panel - File Explorer (Future) / Generation Info */}
            <div className="lg:col-span-1 space-y-4">
              <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4">
                <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-200 mb-3">
                  Project Info
                </h3>
                <div className="space-y-3">
                  <div>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">Name</p>
                    <p className="text-sm text-gray-800 dark:text-gray-200">{project.name || 'Untitled'}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">Files</p>
                    <p className="text-sm text-gray-800 dark:text-gray-200">{fileCount} files</p>
                  </div>
                  {project.gitRepoUrl && (
                    <div>
                      <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">Repository</p>
                      <a
                        href={project.gitRepoUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sm text-blue-500 hover:text-blue-600 dark:text-blue-400 hover:underline"
                      >
                        View on GitHub
                      </a>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Center - Preview Panel */}
            <div className="lg:col-span-2">
              <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 h-full">
                <PreviewPanel />
              </div>
            </div>
          </div>
        )}

        {/* Refactor Chat - Overlay or Side Panel */}
        {showRefactorChat && hasFiles && (
          <div className="fixed bottom-0 left-0 right-0 lg:relative lg:bottom-auto lg:left-auto lg:right-0 lg:w-96 lg:mt-6 bg-white dark:bg-gray-800 border-t lg:border-t-0 lg:border lg:border-gray-200 dark:border-gray-700 rounded-t-xl lg:rounded-xl shadow-lg lg:shadow-none z-20">
            <div className="p-3 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-200 flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-blue-500"></span>
                Refactor & Improve
              </h3>
              <button
                onClick={() => setShowRefactorChat(false)}
                className="text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="h-[300px] lg:h-[400px]">
              <RefactorChat />
            </div>
          </div>
        )}
      </div>

      {/* Footer */}
      <footer className="mt-8 py-4 border-t border-gray-200 dark:border-gray-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <p className="text-xs text-gray-500 dark:text-gray-400">
            Karacter Hub - AI Web App Builder
          </p>
          <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
            Powered by Mistral AI • WebContainer • Next.js
          </p>
        </div>
      </footer>
    </main>
  );
}
