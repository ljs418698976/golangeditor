import React, { useRef, useEffect, useState } from 'react';
import { Terminal as TerminalIcon, Trash2 } from 'lucide-react';

interface TerminalProps {
    logs: string[];
    onCommand: (cmd: string) => void;
    isProcessing?: boolean;
    className?: string;
    onClear?: () => void;
}

export const Terminal: React.FC<TerminalProps> = ({ logs, onCommand, isProcessing = false, className, onClear }) => {
    const [input, setInput] = useState('');
    const scrollRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);

    // Auto scroll
    useEffect(() => {
        if (scrollRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
    }, [logs]);

    // Re-focus input when processing ends
    useEffect(() => {
        if (!isProcessing) {
            inputRef.current?.focus();
        }
    }, [isProcessing]);

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && !isProcessing) {
            if (input.trim()) {
                onCommand(input);
                setInput('');
            }
        }
    };

    const handleContainerClick = () => {
        inputRef.current?.focus();
    };

    return (
        <div
            className={`flex flex-col bg-[#1e1e1e] border-t border-[#334155] ${className}`}
            onClick={handleContainerClick}
        >
            <div className="flex items-center justify-between px-4 py-2.5 bg-[#2d2d2d] border-b border-[#334155]">
                <div className="flex items-center gap-2">
                    <TerminalIcon size={16} className="text-gray-400" />
                    <span className="text-sm font-semibold text-gray-300">Terminal</span>
                </div>
                <button
                    onClick={(e) => {
                        e.stopPropagation();
                        onClear?.();
                    }}
                    title="Clear"
                    className="text-gray-400 hover:text-white"
                >
                    <Trash2 size={14} />
                </button>
            </div>

            <div
                ref={scrollRef}
                className="flex-1 p-4 font-mono text-sm overflow-auto whitespace-pre-wrap text-gray-300 custom-scrollbar"
            >
                {logs.map((line, i) => (
                    <div key={i} className="mb-1 break-words">{line}</div>
                ))}

                <div className="flex items-center gap-2 mt-2">
                    <span className="text-green-500">$</span>
                    <input
                        ref={inputRef}
                        type="text"
                        value={input}
                        onChange={e => setInput(e.target.value)}
                        onKeyDown={handleKeyDown}
                        className="flex-1 bg-transparent border-none outline-none text-gray-200"
                        autoFocus
                        disabled={isProcessing}
                    />
                </div>
            </div>
        </div>
    );
};
