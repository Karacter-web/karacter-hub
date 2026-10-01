'use client';

import { useState, useRef, useEffect, useCallback, type KeyboardEvent } from 'react';
import { useFileTree, useProject, useAppStore, type FileNode } from '@/store/useAppStore';

// ============================================================================
// Types
// ============================================================================

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  status?: 'streaming' | 'complete' | 'error';
}

interface RefactorOperation {
  type: 'modify' | 'create' | 'delete';
  path: string;
  content?: string;
  oldContent?: string;
}

interface RefactorResponse {
  summary?: string;
  operations?: RefactorOperation[];
  files?: FileNode[];
}

// ============================================================================
// Constants
// ============================================================================

const PLACEHOLDER_PROMPTS = [
  'Change the theme to dark mode',
  'Add a search bar to the navigation',
  'Make the layout responsive for mobile',
  'Add authentication with NextAuth',
  'Extract the API calls to a separate utility file',
  'Add TypeScript types to all components',
  'Add a loading spinner to the form submission',
  'Change the color scheme to blue and white',
];

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Get full path of a node
 */
function getFullPath(node: FileNode, prefix: string): string {
  const currentPath = prefix ? `${prefix}/${node.path}` : node.path;
  return currentPath;
}

/**
 * Find file node by path in tree
 */
function findFileNodeByPath(tree: FileNode[], targetPath: string): FileNode | null {
  for (const node of tree) {
    if (node.path === targetPath) {
      return node;
    }
    if (node.children && node.children.length > 0) {
      const found = findFileNodeByPath(node.children, targetPath);
      if (found) return found;
    }
  }
  return null;
}

/**
 * Convert file tree to flat file map
 */
function fileTreeToMap(nodes: FileNode[], prefix = ''): Map<string, FileNode> {
  const fileMap = new Map<string, FileNode>();
  
  nodes.forEach(node => {
    const fullPath = prefix ? `${prefix}/${node.path}` : node.path;
    
    if (node.isDirectory) {
      if (node.children && node.children.length > 0) {
        fileTreeToMap(node.children, fullPath).forEach((value, key) => {
          fileMap.set(key, value);
        });
      }
    } else {
      fileMap.set(fullPath, node);
    }
  });
  
  return fileMap;
}

/**
 * Apply refactor operations to the file tree (fallback for operations-based response)
 */
function applyOperations(
  currentTree: FileNode[],
  operations: RefactorOperation[]
): FileNode[] {
  const fileMap = fileTreeToMap(currentTree);
  
  // Apply operations recursively
  const applyOpToTree = (nodes: FileNode[]): FileNode[] => {
    return nodes.map(node => {
      const nodeFullPath = getFullPath(node, '');
      
      // Find operation for this node
      const op = operations.find(o => o.path === nodeFullPath);
      
      if (op && (op.type === 'modify' || op.type === 'create') && op.content) {
        return { ...node, content: op.content, status: 'generating' };
      }
      
      if (op && op.type === 'delete') {
        return null as any; // Filter out
      }
      
      if (node.children && node.children.length > 0) {
        const updatedChildren = applyOpToTree(node.children).filter(Boolean) as FileNode[];
        return { ...node, children: updatedChildren };
      }
      
      return node;
    }).filter(Boolean) as FileNode[];
  };
  
  let newTree = applyOpToTree(currentTree);
  
  // Add new files that don't exist yet
  for (const op of operations) {
    const content = op.content;
    if ((op.type === 'create' || op.type === 'modify') && content) {
      const existing = fileMap.get(op.path);
      if (!existing) {
        // Add to appropriate directory
        const pathParts = op.path.split('/');
        const filename = pathParts.pop()!;
        const dirPath = pathParts.join('/');
        
        if (dirPath) {
          // Find directory in tree
          const addToDir = (nodes: FileNode[]): FileNode[] => {
            return nodes.map(node => {
              const nodeFullPath = getFullPath(node, '');
              if (nodeFullPath === dirPath && node.isDirectory) {
                return {
                  ...node,
                  children: [
                    ...(node.children || []),
                    { path: filename, content, status: 'generating', isDirectory: false }
                  ]
                };
              }
              if (node.children && node.children.length > 0) {
                return { ...node, children: addToDir(node.children) };
              }
              return node;
            });
          };
          newTree = addToDir(newTree);
        } else {
          // Root level
          newTree.push({ path: filename, content, status: 'generating', isDirectory: false });
        }
      }
    }
  }
  
  return newTree;
}

/**
 * Parse partial JSON from streaming response
 */
function parseStreamingJson(chunk: string): Partial<RefactorResponse> | null {
  try {
    // Try to parse complete JSON
    return JSON.parse(chunk);
  } catch (e) {
    // Try to extract JSON from the chunk
    const jsonMatch = chunk.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      try {
        return JSON.parse(jsonMatch[0]);
      } catch (e2) {
        return null;
      }
    }
    return null;
  }
}

// ============================================================================
// Component
// ============================================================================

export default function RefactorChat() {
  const fileTree = useFileTree();
  const project = useProject();
  const setFileTree = useAppStore(state => state.setFileTree);
  const updateFile = useAppStore(state => state.updateFile);
  const addFile = useAppStore(state => state.addFile);
  
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastResponse, setLastResponse] = useState<RefactorResponse | null>(null);
  const [fileCount, setFileCount] = useState(0);
  
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  // Update file count when file tree changes
  useEffect(() => {
    const flatFiles = fileTreeToMap(fileTree);
    setFileCount(flatFiles.size);
  }, [fileTree]);

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Focus input on mount
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Apply refactor changes to the store
  const applyRefactorChanges = useCallback((response: RefactorResponse) => {
    if (!response.files || response.files.length === 0) {
      // Fallback: try to use operations
      if (response.operations && response.operations.length > 0) {
        const newTree = applyOperations(fileTree, response.operations);
        setFileTree(newTree);
      }
      return;
    }

    // If we have complete files array from AI, convert to tree structure
    // The AI returns flat files with full paths, we need to nest them
    const flatFilesMap = new Map(response.files.map(f => [f.path, f]));
    
    // Build tree from flat files
    const buildTreeFromFlat = (flatFiles: FileNode[]): FileNode[] => {
      const root: FileNode[] = [];
      const nodeMap = new Map<string, FileNode>();
      
      // Sort by path depth (shallow first)
      const sortedFiles = [...flatFiles].sort((a, b) => {
        const aDepth = a.path.split('/').length;
        const bDepth = b.path.split('/').length;
        return aDepth - bDepth;
      });
      
      for (const file of sortedFiles) {
        const pathParts = file.path.split('/');
        const filename = pathParts[pathParts.length - 1];
        
        // Root file
        if (pathParts.length === 1) {
          root.push({ ...file, path: filename });
          nodeMap.set(file.path, root[root.length - 1]);
          continue;
        }
        
        // Nested file - find parent directory
        const parentPath = pathParts.slice(0, -1).join('/');
        let parentNode = nodeMap.get(parentPath);
        
        if (!parentNode) {
          // Create parent directory if it doesn't exist
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
            }
          }
          nodeMap.set(parentPath, parentNode);
        }
        
        if (parentNode && parentNode.isDirectory) {
          parentNode.children = [...(parentNode.children || []), {
            path: filename,
            content: file.content,
            status: 'generating',
            isDirectory: false,
          }];
        }
      }
      
      return root;
    };

    // Build new tree from response files
    const newTree = buildTreeFromFlat(response.files);
    setFileTree(newTree);
  }, [fileTree, setFileTree]);

  // Handle sending a message
  const handleSend = useCallback(async () => {
    if (!input.trim() || isStreaming) return;

    const userMessage: Message = {
      id: `msg-${Date.now()}`,
      role: 'user',
      content: input.trim(),
      timestamp: new Date(),
    };

    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setIsStreaming(true);
    setError(null);
    setLastResponse(null);

    // Abort any previous request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    try {
      // Add assistant placeholder
      const assistantMessage: Message = {
        id: `assistant-${Date.now()}`,
        role: 'assistant',
        content: '',
        timestamp: new Date(),
        status: 'streaming',
      };

      setMessages(prev => [...prev, assistantMessage]);

      const response = await fetch('/api/refactor', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          prompt: input.trim(),
          fileTree,
          projectName: project.name,
        }),
        signal: abortController.signal,
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      if (!response.body) {
        throw new Error('No response body');
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let accumulatedText = '';
      let parsedResponse: Partial<RefactorResponse> | null = null;

      while (true) {
        const { done, value } = await reader.read();
        
        if (done) break;
        
        const chunk = decoder.decode(value);
        accumulatedText += chunk;

        // Try to parse the accumulated text
        try {
          // Check for JSON start
          if (!accumulatedText.trim().startsWith('{')) {
            // Skip non-JSON content
            continue;
          }
          
          // Try to parse complete JSON
          const jsonMatch = accumulatedText.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            try {
              const parsed = JSON.parse(jsonMatch[0]) as RefactorResponse;
              parsedResponse = parsed;
              
              // Apply changes immediately
              if (parsed.files || parsed.operations) {
                applyRefactorChanges(parsed as RefactorResponse);
              }
            } catch (e) {
              // Partial JSON, continue accumulating
            }
          }
        } catch (e) {
          // Continue accumulating
        }

        // Update assistant message with streamed content
        setMessages(prev => {
          const lastMessage = prev[prev.length - 1];
          if (lastMessage?.role === 'assistant' && lastMessage.status === 'streaming') {
            return [
              ...prev.slice(0, -1),
              { ...lastMessage, content: accumulatedText },
            ];
          }
          return prev;
        });
      }

      // Mark as complete
      setMessages(prev => {
        const lastMessage = prev[prev.length - 1];
        if (lastMessage?.role === 'assistant') {
          return [
            ...prev.slice(0, -1),
            { ...lastMessage, status: 'complete' },
          ];
        }
        return prev;
      });

      if (parsedResponse) {
        setLastResponse(parsedResponse as RefactorResponse);
      }

    } catch (err) {
      if (abortController.signal.aborted) {
        // Request was aborted
        setMessages(prev => {
          const lastMessage = prev[prev.length - 1];
          if (lastMessage?.role === 'assistant') {
            return [
              ...prev.slice(0, -1),
              { ...lastMessage, status: 'error', content: 'Request aborted' },
            ];
          }
          return prev;
        });
      } else {
        const errorMessage = err instanceof Error ? err.message : 'Failed to get response';
        setError(errorMessage);
        setMessages(prev => {
          const lastMessage = prev[prev.length - 1];
          if (lastMessage?.role === 'assistant') {
            return [
              ...prev.slice(0, -1),
              { ...lastMessage, status: 'error', content: errorMessage },
            ];
          }
          return prev;
        });
      }
    } finally {
      setIsStreaming(false);
      abortControllerRef.current = null;
    }
  }, [input, isStreaming, fileTree, project.name, applyRefactorChanges]);

  // Handle placeholder selection
  const handlePlaceholderClick = useCallback((prompt: string) => {
    setInput(prompt);
    inputRef.current?.focus();
  }, []);

  // Handle key down
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }, [handleSend]);

  return (
    <div className="flex flex-col h-full bg-gray-100 dark:bg-gray-800 border-l border-gray-200 dark:border-gray-700">
      {/* Header */}
      <div className="flex items-center justify-between p-3 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900">
        <h2 className="text-sm font-medium text-gray-800 dark:text-gray-200 flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-blue-500"></span>
          Refactor Chat
        </h2>
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-500 dark:text-gray-400">
            {fileCount} files
          </span>
        </div>
      </div>

      {/* Messages Area */}
      <div className="flex-1 overflow-auto p-4 space-y-4 bg-gray-50 dark:bg-gray-800">
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-center text-gray-500 dark:text-gray-400">
            <div className="mb-4">
              <svg className="w-12 h-12 mx-auto text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
              </svg>
            </div>
            <p className="mb-4">Ask me to refactor your code</p>
            <div className="flex flex-wrap gap-2 justify-center">
              {PLACEHOLDER_PROMPTS.map((prompt, index) => (
                <button
                  key={index}
                  onClick={() => handlePlaceholderClick(prompt)}
                  className="text-xs px-3 py-1 bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-full hover:bg-gray-100 dark:hover:bg-gray-600 transition-colors"
                >
                  {prompt}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((message) => (
          <div
            key={message.id}
            className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'} gap-2`}
          >
            <div
              className={`max-w-xs md:max-w-md lg:max-w-lg xl:max-w-xl rounded-lg p-3 ${message.role === 'user' 
                ? 'bg-blue-500 text-white rounded-br-none' 
                : 'bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-200 rounded-bl-none'}`}
            >
              <p className="whitespace-pre-wrap text-sm">{message.content || '...'}</p>
              <p className={`text-xs mt-1 text-right ${message.role === 'user' ? 'text-blue-100' : 'text-gray-500 dark:text-gray-400'}`}>
                {message.timestamp.toLocaleTimeString()}
              </p>
            </div>
          </div>
        ))}

        {isStreaming && (
          <div className="flex justify-start gap-2">
            <div className="bg-gray-200 dark:bg-gray-700 rounded-lg p-3 rounded-bl-none">
              <div className="flex items-center gap-2">
                <div className="animate-pulse flex gap-1">
                  <span className="w-2 h-2 rounded-full bg-gray-400"></span>
                  <span className="w-2 h-2 rounded-full bg-gray-400"></span>
                  <span className="w-2 h-2 rounded-full bg-gray-400"></span>
                </div>
                <span className="text-sm text-gray-600 dark:text-gray-300">Thinking...</span>
              </div>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input Area */}
      <div className="p-3 bg-white dark:bg-gray-900 border-t border-gray-200 dark:border-gray-700">
        <div className="flex gap-2">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={isStreaming ? 'Waiting for response...' : 'Ask me to refactor something...'}
            disabled={isStreaming}
            className="flex-1 px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-200 placeholder-gray-500 dark:placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none min-h-[44px] max-h-[120px]"
            rows={1}
          />
          <button
            onClick={handleSend}
            disabled={isStreaming || !input.trim()}
            className="px-4 py-2 bg-blue-500 hover:bg-blue-600 disabled:bg-blue-300 disabled:cursor-not-allowed text-white rounded-lg transition-colors flex items-center justify-center"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
            </svg>
          </button>
        </div>

        {error && (
          <div className="mt-2 p-2 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 rounded text-sm text-red-600 dark:text-red-400">
            {error}
          </div>
        )}

        {lastResponse?.summary && (
          <div className="mt-2 p-2 bg-green-50 dark:bg-green-900/30 border border-green-200 dark:border-green-800 rounded text-sm text-green-700 dark:text-green-300">
            ✅ {lastResponse.summary}
          </div>
        )}
      </div>
    </div>
  );
}
