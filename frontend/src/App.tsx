import React, { useState, useEffect, useRef } from 'react';
import Editor, { type OnMount, loader } from '@monaco-editor/react';
import axios from 'axios';
import { Play, Settings, Code, Info, X, Save, FileText, Layers, PanelLeft, PanelBottom, PanelRight } from 'lucide-react';
import { FileExplorer } from './components/FileExplorer';
import { Terminal } from './components/Terminal';
import { ResizablePanel } from './components/ResizablePanel';

// loader.config({
//   paths: { vs: '/monaco-editor/min/vs' },
// });

interface EnvConfig {
  goroot: string;
  gopath: string;
  goproxy: string;
}

// Configure Monaco Loader to use local files for offline support
// By default, @monaco-editor/react uses a CDN. 
// We should import monaco directly to bundle it.
import * as monaco from 'monaco-editor';
import editorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker';
import jsonWorker from 'monaco-editor/esm/vs/language/json/json.worker?worker';
import cssWorker from 'monaco-editor/esm/vs/language/css/css.worker?worker';
import htmlWorker from 'monaco-editor/esm/vs/language/html/html.worker?worker';
import tsWorker from 'monaco-editor/esm/vs/language/typescript/ts.worker?worker';

self.MonacoEnvironment = {
  getWorker(_, label) {
    if (label === 'json') {
      return new jsonWorker();
    }
    if (label === 'css' || label === 'scss' || label === 'less') {
      return new cssWorker();
    }
    if (label === 'html' || label === 'handlebars' || label === 'razor') {
      return new htmlWorker();
    }
    if (label === 'typescript' || label === 'javascript') {
      return new tsWorker();
    }
    return new editorWorker();
  },
};

loader.config({ monaco });


const DEFAULT_CODE = `package main

import (
	"fmt"
	"time"
)

func main() {
	fmt.Println("Hello, Go Editor!")
	fmt.Println("Time:", time.Now())
}
`;

function App() {
  const [code, setCode] = useState(DEFAULT_CODE);
  const [currentFile, setCurrentFile] = useState<string | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isEnvOpen, setIsEnvOpen] = useState(false);
  const [envData, setEnvData] = useState<any>(null);
  const [showTerminal, setShowTerminal] = useState(false);
  const [terminalLogs, setTerminalLogs] = useState<string[]>([]);
  const [isTerminalProcessing, setIsTerminalProcessing] = useState(false);
  const [consoleOutput, setConsoleOutput] = useState('');
  const [config, setConfig] = useState<EnvConfig>(() => {
    const saved = localStorage.getItem('go_editor_config');
    return saved ? JSON.parse(saved) : {
      goroot: '',
      gopath: '',
      goproxy: 'https://goproxy.cn,direct',
    };
  });

  const [isLeftVisible, setIsLeftVisible] = useState(true);
  const [isBottomVisible, setIsBottomVisible] = useState(true);
  const [isEditorVisible, setIsEditorVisible] = useState(true);

  const editorRef = useRef<any>(null);
  const pendingJumpRef = useRef<{ path: string; selection: any } | null>(null);

  useEffect(() => {
    localStorage.setItem('go_editor_config', JSON.stringify(config));
  }, [config]);

  useEffect(() => {
    const handleUnload = () => {
      // Use sendBeacon for reliable delivery during unload
      navigator.sendBeacon('http://localhost:8080/api/exit');
    };
    window.addEventListener('beforeunload', handleUnload);
    return () => window.removeEventListener('beforeunload', handleUnload);
  }, []);

  // Handle pending jumps (e.g. from Go to Definition across files)
  useEffect(() => {
    if (pendingJumpRef.current && currentFile) {
      const { path, selection } = pendingJumpRef.current;
      const normalize = (p: string) => p.replace(/\\/g, '/').toLowerCase();

      // Check if we are now in the target file
      if (normalize(path) === normalize(currentFile)) {
        // use setTimeout to ensure Editor component has time to switch models
        setTimeout(() => {
          if (editorRef.current) {
            const editor = editorRef.current;
            editor.revealRangeInCenterIfOutsideViewport(selection);
            editor.setPosition({
              lineNumber: selection.startLineNumber,
              column: selection.startColumn
            });
            editor.focus();
            console.log('[App] Applied pending jump to', selection);
          }
        }, 100);
        pendingJumpRef.current = null;
      }
    }
  }, [currentFile]);

  const handleEditorDidMount: OnMount = (editor, monaco) => {
    console.log('[App] Editor mounted successfully');
    editorRef.current = editor;

    // Register a custom command to open files
    editor.addCommand(0, (_ctx: any, path: string) => {
      handleFileSelect(path);
    });

    // Register Editor Opener to handle custom URI schemes
    const openerService = (editor as any)._openerService;
    if (openerService) {
      const originalOpen = openerService.open.bind(openerService);
      openerService.open = async (resource: any, options: any) => {
        // Handle 'open-file' custom scheme (from links)
        if (resource && resource.scheme === 'open-file') {
          const importPath = resource.path;
          const currentPath = editor.getModel()?.uri.fsPath;
          if (currentPath) {
            try {
              const resp = await axios.get('http://localhost:8080/api/fs/resolve', {
                params: { base: currentPath, import: importPath }
              });
              if (resp.data.path) {
                handleFileSelect(resp.data.path);
                return true;
              }
            } catch (e) {
              console.warn('[Editor] Failed to resolve path:', importPath);
            }
          }
        }

        // Handle 'file' scheme (from Go to Definition)
        if (resource && resource.scheme === 'file') {
          const targetPath = resource.fsPath;
          const currentPath = editor.getModel()?.uri.fsPath;

          // Same file check
          if (currentPath && targetPath.toLowerCase() === currentPath.toLowerCase()) {
            if (options && options.selection) {
              const range = options.selection;
              editor.revealRangeInCenterIfOutsideViewport(range);
              editor.setPosition({
                lineNumber: range.startLineNumber,
                column: range.startColumn
              });
              return true;
            }
            return originalOpen(resource, options);
          }

          // Different file
          console.log(`[Editor] Jumping to file: ${targetPath}`);

          // Store the selection to be applied after file load
          if (options && options.selection) {
            pendingJumpRef.current = {
              path: targetPath,
              selection: options.selection
            };
          }

          await handleFileSelect(targetPath);
          return true;
        }

        return originalOpen(resource, options);
      };
    }

    // Link Provider (unchanged) works well
    monaco.languages.registerLinkProvider('*', {
      provideLinks: (model) => {
        const links: any[] = [];
        const lines = model.getLinesContent();
        for (let i = 0; i < lines.length; i++) {
          const line = lines[i];
          const re = /["'](@\/[^"']+)["']|["'](\.\.?[^"']+)["']|["']([^"']+\/[^"']+)["']/g;
          let match;
          while ((match = re.exec(line)) !== null) {
            const pathStr = match[1] || match[2] || match[3];
            if (!pathStr || pathStr.startsWith('http')) continue; // Skip urls
            const startColumn = match.index + 2;
            const endColumn = startColumn + pathStr.length;
            links.push({
              range: new monaco.Range(i + 1, startColumn, i + 1, endColumn),
              url: monaco.Uri.parse(`open-file:${pathStr}`).toString()
            });
          }
        }
        return { links };
      }
    });

    // Content Provider explicitly REMOVED as it is not supported in monaco-editor standalone
    // We handle model loading manually in provideDefinition


    // Sync React state when model changes (e.g. after Go To Definition navigation)
    editor.onDidChangeModel((e) => {
      const model = editor.getModel();
      if (model) {
        const newPath = model.uri.fsPath;
        console.log('[Editor] Model changed to:', newPath);

        const normalizePath = (p: string) => p.replace(/\\/g, '/');

        // We need to update currentFile so the UI reflects the change
        // But we must avoid re-triggering a reload loop
        setCurrentFile(prev => {
          if (!prev) return normalizePath(newPath);

          if (normalizePath(prev) !== normalizePath(newPath)) {
            // Update valid file path
            return normalizePath(newPath);
          }
          return prev;
        });
        // Also update code to current model content to keep React in sync
        setCode(model.getValue());
      }
    });

    // Symbol Cache & Refresh Logic
    let symbolCache: any[] = [];
    const refreshSymbols = async () => {
      try {
        const resp = await axios.get('http://localhost:8080/api/symbols');
        if (Array.isArray(resp.data)) {
          symbolCache = resp.data;
          console.log(`[App] Loaded ${symbolCache.length} symbols`);
        }
      } catch (e) {
        console.error("Failed to load symbols", e);
      }
    };
    refreshSymbols();
    // Use window.setInterval to avoid TS issues if any
    window.setInterval(refreshSymbols, 10000);

    monaco.languages.registerDefinitionProvider('go', {
      provideDefinition: async (model, position) => {
        const word = model.getWordAtPosition(position);
        if (!word) return null;

        console.log(`[DefProvider] Lookup: ${word.word}`);

        // Normalization helper
        const normalize = (p: string) => p.replace(/\\/g, '/').toLowerCase();

        const currentFsPath = model.uri.fsPath;
        const currentFsPathNorm = normalize(currentFsPath);
        const currentDirNorm = currentFsPathNorm.substring(0, currentFsPathNorm.lastIndexOf('/'));

        // Smart Search
        const candidates = symbolCache.filter(s => s.name === word.word);
        console.log(`[DefProvider] Found ${candidates.length} candidates for ${word.word}`, candidates);

        if (candidates.length === 0) return null;

        // 1. Exact match in current file
        // 2. Match in same directory
        // 3. Match anywhere
        // Priority to "Function" or "Method" if strict, but ignoring for now
        let target = candidates.find(s => normalize(s.path) === currentFsPathNorm) ||
          candidates.find(s => normalize(s.path).startsWith(currentDirNorm)) ||
          candidates[0];

        console.log(`[DefProvider] Selected target:`, target);

        if (target) {
          console.log(`[DefProvider] Target found:`, target);
          let uri = monaco.Uri.file(target.path);

          // If target is current file, use exact current model URI
          if (normalize(target.path) === currentFsPathNorm) {
            uri = model.uri;
          } else {
            // CRITICAL: Pre-load model for the target file
            // Monaco standalone requires the model to exist in memory to jump to it.
            // We check if it exists, if not, we fetch and create it.
            if (!monaco.editor.getModel(uri)) {
              try {
                console.log(`[DefProvider] Lazily loading content for: ${target.path}`);
                const resp = await axios.get('http://localhost:8080/api/fs/read', {
                  params: { path: target.path }
                });
                if (resp.data) {
                  // Double check existence to avoid race conditions
                  if (!monaco.editor.getModel(uri)) {
                    monaco.editor.createModel(resp.data.content || '', 'go', uri);
                    console.log(`[DefProvider] Model created for: ${target.path}`);
                  }
                }
              } catch (e) {
                console.error("[DefProvider] Failed to load file content:", target.path, e);
                // If loading fails, we still return the location, hoping maybe the user can handle it (or it fails gracefully)
              }
            }
          }

          return {
            uri: uri,
            range: new monaco.Range(target.line, target.character, target.line, target.character + word.word.length)
          };
        }
        return null;
      }
    });

    // Register Generic Path Definition Provider
    monaco.languages.registerDefinitionProvider('*', {
      provideDefinition: async (model, position) => {
        const line = model.getLineContent(position.lineNumber);
        const re = /["']([^"']+)["']/g;
        let match;
        while ((match = re.exec(line)) !== null) {
          const start = match.index + 1;
          const end = start + match[1].length + 1;
          if (position.column >= start && position.column <= end) {
            const pathStr = match[1];
            if (pathStr.startsWith('http')) return null; // Ignore URLs
            if (pathStr.includes('/') || pathStr.startsWith('.')) {
              return {
                uri: monaco.Uri.parse(`open-file:${pathStr}`),
                range: new monaco.Range(1, 1, 1, 1)
              };
            }
          }
        }
        return null;
      }
    });

    // Register Go Completions
    monaco.languages.registerCompletionItemProvider('go', {
      provideCompletionItems: (model, position) => {
        const suggestions = [
          {
            label: 'fmt.Println',
            kind: monaco.languages.CompletionItemKind.Function,
            insertText: 'fmt.Println("${1:text}")',
            insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
            documentation: 'Log to console'
          },
          {
            label: 'func',
            kind: monaco.languages.CompletionItemKind.Snippet,
            insertText: 'func ${1:name}(${2:params}) {\n\t${3}\n}',
            insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
            documentation: 'Function definition'
          }
        ];
        return { suggestions: suggestions };
      }
    });
  };

  const getLanguage = (path: string) => {
    const ext = path.split('.').pop()?.toLowerCase();
    switch (ext) {
      case 'go': return 'go';
      case 'md': return 'markdown';
      case 'json': return 'json';
      case 'js': return 'javascript';
      case 'ts': return 'typescript';
      case 'tsx': return 'typescript';
      case 'html': return 'html';
      case 'css': return 'css';
      default: return 'plaintext';
    }
  };

  const handleFileSelect = async (path: string) => {
    console.log('[App] handleFileSelect:', path);
    setConsoleOutput(`Loading: ${path}...`);
    try {
      const resp = await axios.get('http://localhost:8080/api/fs/read', {
        params: { path }
      });
      console.log('[App] Content received, length:', resp.data?.content?.length);

      if (resp.data && typeof resp.data.content === 'string') {
        const content = resp.data.content;
        // Important: Set current file first so Editor key updates
        setCurrentFile(path.replace(/\\/g, '/'));
        // Then set code
        setCode(content);
        setConsoleOutput(`Loaded: ${path} (${content.length} chars)`);
        console.log('[App] State updated for:', path);
      } else {
        setConsoleOutput(`Error: Invalid response format from server for ${path}`);
      }
    } catch (e: any) {
      const errorMsg = e.response?.data || e.message;
      setConsoleOutput(`Error loading ${path}: ${errorMsg}`);
      console.error('[App] Error reading file:', e);
    }
  };

  const handleSaveFile = async () => {
    if (!currentFile) {
      alert('No file is currently open');
      return;
    }
    try {
      await axios.post('http://localhost:8080/api/fs/save', {
        path: currentFile,
        content: code
      });
      alert('File saved successfully!');
    } catch (e: any) {
      alert('Failed to save file: ' + e.message);
    }
  };

  const runCode = async () => {
    setIsRunning(true);
    setConsoleOutput('Running...');
    try {
      const response = await axios.post('http://localhost:8080/api/run', {
        code,
        path: currentFile,
        env: config
      });
      if (response.data.error) {
        setConsoleOutput('Error:\n' + response.data.error + '\n\nOutput:\n' + response.data.output);
      } else {
        setConsoleOutput(response.data.output);
      }
    } catch (error: any) {
      setConsoleOutput('Failed to execute: ' + error.message);
    } finally {
      setIsRunning(false);
    }
  };

  const handleTerminalCommand = async (cmd: string) => {
    setTerminalLogs(prev => [...prev, `$ ${cmd}`]);
    setIsTerminalProcessing(true);

    if (cmd === 'clear') {
      setTerminalLogs([]);
      setIsTerminalProcessing(false);
      return;
    }

    try {
      const resp = await axios.post('http://localhost:8080/api/cmd', {
        command: cmd,
        env: config
      });
      if (resp.data.error) {
        setTerminalLogs(prev => [...prev, `Error: ${resp.data.error}`]);
      }
      if (resp.data.output) {
        setTerminalLogs(prev => [...prev, resp.data.output]);
      }
      if (!resp.data.error && !resp.data.output) {
        setTerminalLogs(prev => [...prev, '(no output)']);
      }
    } catch (e: any) {
      setTerminalLogs(prev => [...prev, `Failed to execute: ${e.message}`]);
    } finally {
      setIsTerminalProcessing(false);
    }
  };

  const fetchEnv = async () => {
    try {
      const resp = await axios.get('http://localhost:8080/api/env', {
        params: { goroot: config.goroot }
      });
      setEnvData(resp.data);
      setIsEnvOpen(true);
    } catch (e) {
      alert("Failed to fetch environment info");
    }
  };

  return (
    <div className="flex flex-col h-screen bg-[#0f111a] text-[#e2e8f0]">
      {/* Header */}
      <header className="flex items-center justify-between px-6 py-4 border-b border-[#334155] bg-[#1a1d2d]">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-blue-600 rounded-lg">
            <Code size={20} className="text-white" />
          </div>
          <h1 className="text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-blue-400 to-purple-500">
            GoFast Editor
          </h1>
          {currentFile && (
            <div className="flex items-center gap-2 ml-4 px-3 py-1 bg-[#0f111a] rounded-lg border border-[#334155]">
              <FileText size={14} className="text-gray-400" />
              <span className="text-xs text-gray-300">{currentFile.replace(/\\/g, '/').split('/').pop()}</span>
            </div>
          )}
        </div>

        <div className="flex items-center gap-4">
          <div className="flex items-center gap-1 mr-4 px-2 py-1 bg-[#0f111a] rounded-lg border border-[#334155]">
            <button
              onClick={() => setIsLeftVisible(!isLeftVisible)}
              className={`p-1.5 rounded transition ${isLeftVisible ? 'text-blue-400 bg-blue-400/10' : 'text-gray-400 hover:text-white'}`}
              title="Toggle Sidebar"
            >
              <PanelLeft size={18} />
            </button>
            <button
              onClick={() => setIsBottomVisible(!isBottomVisible)}
              className={`p-1.5 rounded transition ${isBottomVisible ? 'text-blue-400 bg-blue-400/10' : 'text-gray-400 hover:text-white'}`}
              title="Toggle Bottom Panel"
            >
              <PanelBottom size={18} />
            </button>
            <button
              onClick={() => setIsEditorVisible(!isEditorVisible)}
              className={`p-1.5 rounded transition ${isEditorVisible ? 'text-blue-400 bg-blue-400/10' : 'text-gray-400 hover:text-white'}`}
              title="Toggle Editor"
            >
              <PanelRight size={18} />
            </button>
          </div>

          <button
            onClick={handleSaveFile}
            disabled={!currentFile}
            className={`flex items-center gap-2 px-3 py-1.5 text-sm font-medium transition ${currentFile ? 'text-gray-400 hover:text-white' : 'text-gray-600 cursor-not-allowed'
              }`}
          >
            <Save size={16} />
            Save
          </button>

          <button
            onClick={fetchEnv}
            className="flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-gray-400 hover:text-white transition"
          >
            <Info size={16} />
            Env Info
          </button>

          <button
            onClick={() => setIsSettingsOpen(true)}
            className="flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-gray-400 hover:text-white transition"
          >
            <Settings size={16} />
            Settings
          </button>

          <button
            onClick={runCode}
            className={`flex items-center gap-2 px-6 py-2 rounded-lg font-bold transition shadow-lg shadow-blue-500/20 ${isRunning ? 'bg-gray-600 cursor-not-allowed' : 'bg-blue-600 hover:bg-blue-500 text-white'
              }`}
            disabled={isRunning}
          >
            <Play size={18} fill="currentColor" />
            {isRunning ? 'Running...' : 'Run Code'}
          </button>
        </div>
      </header>

      {/* Main Content Area */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left Panel - File Explorer */}
        {isLeftVisible && (
          <ResizablePanel
            defaultSize={250}
            minSize={150}
            maxSize={500}
            position="left"
            className="border-r border-[#334155]"
          >
            <FileExplorer onFileSelect={handleFileSelect} currentPath={currentFile || undefined} />
          </ResizablePanel>
        )}

        {/* Center Area */}
        <div className="flex-1 flex flex-col min-w-0 overflow-hidden relative">
          <div className={`flex-1 relative min-h-0 ${!isEditorVisible ? 'hidden' : ''}`}>
            <Editor
              height="100%"
              path={currentFile || 'main.go'}
              language={currentFile ? getLanguage(currentFile) : 'go'}
              theme="vs-dark"
              value={code}
              onChange={(value) => setCode(value || '')}
              onMount={handleEditorDidMount}
              options={{
                minimap: { enabled: false },
                fontSize: 14,
                fontFamily: 'JetBrains Mono, monospace',
                padding: { top: 20 },
                scrollBeyondLastLine: false,
                automaticLayout: true,
              }}
            />
          </div>

          {/* Bottom Panel - Console/Terminal */}
          {isBottomVisible && (
            <ResizablePanel
              key={isEditorVisible ? 'bottom-mini' : 'bottom-full'}
              defaultSize={350}
              minSize={100}
              maxSize={800}
              position="bottom"
              isFullHeight={!isEditorVisible}
              className="border-t border-[#334155] bg-[#1a1d2d]"
            >
              <div className="flex flex-col h-full">
                {/* Tab Switcher */}
                <div className="flex items-center gap-1 px-4 py-2 bg-[#1a1d2d] border-b border-[#334155]">
                  <button
                    onClick={() => setShowTerminal(false)}
                    className={`flex items-center gap-2 px-3 py-1 text-xs font-semibold rounded-md transition ${!showTerminal ? 'bg-[#334155] text-white' : 'text-gray-400 hover:text-white'
                      }`}
                  >
                    <FileText size={14} />
                    Console
                  </button>
                  <button
                    onClick={() => setShowTerminal(true)}
                    className={`flex items-center gap-2 px-3 py-1 text-xs font-semibold rounded-md transition ${showTerminal ? 'bg-[#334155] text-white' : 'text-gray-400 hover:text-white'
                      }`}
                  >
                    <Layers size={14} />
                    Terminal
                  </button>
                </div>

                {/* Content Area */}
                <div className="flex-1 overflow-hidden">
                  {!showTerminal ? (
                    <div className="h-full p-4 font-mono text-sm overflow-auto whitespace-pre-wrap text-gray-300">
                      {consoleOutput ? consoleOutput : <span className="text-gray-600 italic">Ready to execute...</span>}
                    </div>
                  ) : (
                    <Terminal
                      logs={terminalLogs}
                      onCommand={handleTerminalCommand}
                      isProcessing={isTerminalProcessing}
                      onClear={() => setTerminalLogs([])}
                      className="h-full"
                    />
                  )}
                </div>
              </div>
            </ResizablePanel>
          )}
        </div>

        {/* Right Panel - Removed or handled by Editor toggle */}
      </div>

      {/* Settings Modal */}
      {isSettingsOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="w-[500px] bg-[#1a1d2d] border border-[#334155] rounded-xl shadow-2xl p-6">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-xl font-bold flex items-center gap-2">
                <Settings size={20} className="text-blue-400" />
                Configuration
              </h2>
              <button onClick={() => setIsSettingsOpen(false)} className="text-gray-400 hover:text-white">
                <X size={20} />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-400 mb-1">GOROOT</label>
                <input
                  type="text"
                  value={config.goroot}
                  onChange={e => setConfig({ ...config, goroot: e.target.value })}
                  placeholder="e.g. C:\Go"
                  className="w-full bg-[#0f111a] border border-[#334155] rounded-lg px-3 py-2 text-white focus:outline-none focus:border-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-400 mb-1">GOPATH</label>
                <input
                  type="text"
                  value={config.gopath}
                  onChange={e => setConfig({ ...config, gopath: e.target.value })}
                  placeholder="e.g. D:\GoProjects"
                  className="w-full bg-[#0f111a] border border-[#334155] rounded-lg px-3 py-2 text-white focus:outline-none focus:border-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-400 mb-1">GOPROXY</label>
                <input
                  type="text"
                  value={config.goproxy}
                  onChange={e => setConfig({ ...config, goproxy: e.target.value })}
                  className="w-full bg-[#0f111a] border border-[#334155] rounded-lg px-3 py-2 text-white focus:outline-none focus:border-blue-500"
                />
              </div>
            </div>

            <div className="mt-8 flex justify-end">
              <button
                onClick={() => setIsSettingsOpen(false)}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg font-medium transition"
              >
                Save & Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Env Info Modal */}
      {isEnvOpen && envData && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="w-[600px] max-h-[80vh] flex flex-col bg-[#1a1d2d] border border-[#334155] rounded-xl shadow-2xl p-6">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-xl font-bold flex items-center gap-2">
                <Info size={20} className="text-purple-400" />
                Go Environment
              </h2>
              <button onClick={() => setIsEnvOpen(false)} className="text-gray-400 hover:text-white">
                <X size={20} />
              </button>
            </div>

            <div className="grid grid-cols-3 gap-4 mb-4">
              <div className="p-3 bg-[#0f111a] rounded-lg border border-[#334155]">
                <div className="text-xs text-gray-500 uppercase">Version</div>
                <div className="font-mono text-sm">{envData.goVersion}</div>
              </div>
              <div className="p-3 bg-[#0f111a] rounded-lg border border-[#334155]">
                <div className="text-xs text-gray-500 uppercase">OS</div>
                <div className="font-mono text-sm">{envData.goOS}</div>
              </div>
              <div className="p-3 bg-[#0f111a] rounded-lg border border-[#334155]">
                <div className="text-xs text-gray-500 uppercase">Arch</div>
                <div className="font-mono text-sm">{envData.goArch}</div>
              </div>
            </div>

            <div className="flex-1 overflow-auto bg-[#0f111a] p-4 rounded-lg border border-[#334155] font-mono text-xs whitespace-pre-wrap">
              {envData.envVars}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
