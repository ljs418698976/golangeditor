import React, { useRef, useEffect, useState } from 'react';

interface ResizablePanelProps {
    children: React.ReactNode;
    defaultSize: number;
    minSize?: number;
    maxSize?: number;
    position: 'left' | 'right' | 'bottom';
    className?: string;
    isFullHeight?: boolean;
}

export const ResizablePanel: React.FC<ResizablePanelProps> = ({
    children,
    defaultSize,
    minSize = 200,
    maxSize = 800,
    position,
    className = '',
    isFullHeight = false
}) => {
    const [size, setSize] = useState(defaultSize);
    const [isResizing, setIsResizing] = useState(false);
    const panelRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const handleMouseMove = (e: MouseEvent) => {
            if (!isResizing) return;

            let newSize: number;
            if (position === 'bottom') {
                newSize = window.innerHeight - e.clientY;
            } else if (position === 'left') {
                newSize = e.clientX;
            } else {
                newSize = window.innerWidth - e.clientX;
            }

            if (newSize >= minSize && newSize <= maxSize) {
                setSize(newSize);
            }
        };

        const handleMouseUp = () => {
            setIsResizing(false);
            document.body.style.cursor = 'default';
            document.body.style.userSelect = 'auto';
        };

        if (isResizing) {
            document.addEventListener('mousemove', handleMouseMove);
            document.addEventListener('mouseup', handleMouseUp);
            document.body.style.cursor = position === 'bottom' ? 'row-resize' : 'col-resize';
            document.body.style.userSelect = 'none';
        }

        return () => {
            document.removeEventListener('mousemove', handleMouseMove);
            document.removeEventListener('mouseup', handleMouseUp);
        };
    }, [isResizing, minSize, maxSize, position]);

    const handleMouseDown = () => {
        setIsResizing(true);
    };

    const isHorizontal = position === 'left' || position === 'right';

    return (
        <div
            ref={panelRef}
            className={`relative ${className}`}
            style={{
                [isHorizontal ? 'width' : 'height']: isFullHeight ? '100%' : `${size}px`,
                flex: isFullHeight ? '1 1 0%' : '0 0 auto',
                overflow: 'hidden'
            }}
        >
            {children}
            {!isFullHeight && (
                <div
                    className={`absolute ${position === 'left' ? 'top-0 right-0 w-1 h-full cursor-col-resize' :
                        position === 'right' ? 'top-0 left-0 w-1 h-full cursor-col-resize' :
                            'top-0 left-0 w-full h-1 cursor-row-resize'
                        } hover:bg-blue-500 transition-colors group z-10`}
                    onMouseDown={handleMouseDown}
                >
                    <div className={`absolute ${isHorizontal ? 'top-0 bottom-0 -left-1 -right-1' : 'left-0 right-0 -top-1 -bottom-1'
                        } group-hover:bg-blue-500/20`} />
                </div>
            )}
        </div>
    );
};
