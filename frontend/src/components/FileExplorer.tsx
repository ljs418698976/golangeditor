import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Folder, FileCode, ChevronRight, ChevronDown, RefreshCw, FolderOpen } from 'lucide-react';

interface FileNode {
    name: string;
    path: string;
    isDir: boolean;
    children?: FileNode[]; // loaded dynamically
}

interface FileExplorerProps {
    onFileSelect: (path: string) => void;
    currentPath?: string; // Highlight current file
}

const FileTreeItem: React.FC<{
    node: FileNode;
    onSelect: (path: string) => void;
    level: number;
    currentPath?: string;
}> = ({ node, onSelect, level, currentPath }) => {
    const [isOpen, setIsOpen] = useState(false);
    const [children, setChildren] = useState<FileNode[]>([]);
    const [isLoading, setIsLoading] = useState(false);

    const fetchChildren = async () => {
        if (children.length > 0) {
            setIsOpen(!isOpen);
            return;
        }

        setIsLoading(true);
        try {
            const resp = await axios.get('http://localhost:8080/api/fs/list', {
                params: { path: node.path }
            });
            // safe sort: folders first
            const sorted = resp.data.sort((a: FileNode, b: FileNode) => {
                if (a.isDir === b.isDir) return a.name.localeCompare(b.name);
                return a.isDir ? -1 : 1;
            });
            setChildren(sorted);
            setIsOpen(true);
        } catch (e) {
            console.error("Failed to list dir", e);
        } finally {
            setIsLoading(false);
        }
    };

    const handleClick = () => {
        if (node.isDir) {
            if (isOpen) {
                setIsOpen(false);
            } else {
                fetchChildren();
            }
        } else {
            onSelect(node.path);
        }
    };

    return (
        <div>
            <div
                className={`flex items-center gap-1.5 py-1 px-2 cursor-pointer select-none transition-colors border-l-[2px] 
          ${node.path === currentPath ? 'bg-blue-600/20 border-blue-500' : 'hover:bg-[#23273a] border-transparent'}`}
                style={{ paddingLeft: `${level * 12 + 8}px` }}
                onClick={handleClick}
            >
                <span className="text-gray-400">
                    {node.isDir ? (
                        isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />
                    ) : <span className="w-[14px]" />}
                </span>

                {node.isDir ? (
                    <Folder size={16} className={`${isOpen ? 'text-blue-400' : 'text-blue-500/80'}`} />
                ) : (
                    <FileCode size={16} className="text-gray-400" />
                )}

                <span className={`text-sm truncate ${node.path === currentPath ? 'text-white font-medium' : 'text-gray-300'}`}>
                    {node.name}
                </span>
            </div>

            {isOpen && (
                <div>
                    {isLoading && <div className="pl-8 py-1 text-xs text-gray-500 italic">Loading...</div>}
                    {children.map((child) => (
                        <FileTreeItem
                            key={child.path}
                            node={child}
                            level={level + 1}
                            onSelect={onSelect}
                            currentPath={currentPath}
                        />
                    ))}
                </div>
            )}
        </div>
    );
};

export const FileExplorer: React.FC<FileExplorerProps> = ({ onFileSelect, currentPath }) => {
    const [roots, setRoots] = useState<FileNode[]>([]);
    const [loading, setLoading] = useState(false);

    // Initial load: get current directory contents of the backend
    const refresh = async () => {
        setLoading(true);
        try {
            const resp = await axios.get('http://localhost:8080/api/fs/list');
            // Sort folders first
            const sorted = resp.data.sort((a: FileNode, b: FileNode) => {
                if (a.isDir === b.isDir) return a.name.localeCompare(b.name);
                return a.isDir ? -1 : 1;
            });
            setRoots(sorted);
        } catch (e) {
            console.error("Failed to load root", e);
        } finally {
            setLoading(false);
        }
    };

    const handleImportProject = async () => {
        try {
            const resp = await axios.get('http://localhost:8080/api/fs/pickdir');
            if (resp.data.status === 'ok') {
                await refresh();
            }
        } catch (error: any) {
            alert('导入项目失败: ' + (error.response?.data || error.message));
        }
    };

    useEffect(() => {
        refresh();
    }, []);

    return (
        <div className="flex flex-col h-full bg-[#161925]">
            <div className="flex items-center justify-between px-4 py-4 bg-[#1a1d2d] border-b-2 border-[#475569]">
                <span className="text-xs font-bold uppercase tracking-wider text-gray-400">Explorer</span>
                <div className="flex items-center gap-2">
                    <button
                        onClick={handleImportProject}
                        className="text-gray-400 hover:text-white transition"
                        title="导入项目"
                    >
                        <FolderOpen size={14} />
                    </button>
                    <button onClick={refresh} className="text-gray-400 hover:text-white transition" title="刷新">
                        <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
                    </button>
                </div>
            </div>

            <div className="flex-1 overflow-auto py-2 custom-scrollbar">
                {roots.length === 0 && !loading ? (
                    <div className="flex flex-col items-center justify-center h-full px-4 text-center">
                        <FolderOpen size={48} className="text-gray-600 mb-4" />
                        <p className="text-sm text-gray-400 mb-2">文件列表为空</p>
                        <p className="text-xs text-gray-500 mb-4">点击上方的文件夹图标导入项目</p>
                        <button
                            onClick={handleImportProject}
                            className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-sm rounded-lg transition flex items-center gap-2"
                        >
                            <FolderOpen size={16} />
                            导入项目
                        </button>
                    </div>
                ) : (
                    roots.map(node => (
                        <FileTreeItem
                            key={node.path}
                            node={node}
                            level={0}
                            onSelect={onFileSelect}
                            currentPath={currentPath}
                        />
                    ))
                )}
            </div>
        </div>
    );
};

