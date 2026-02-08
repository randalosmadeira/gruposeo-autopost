import { ReactNode } from 'react';
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from '@/components/ui/resizable';
import { cn } from '@/lib/utils';

interface ResizablePanelLayoutProps {
  leftPanel: ReactNode;
  rightPanel: ReactNode;
  leftPanelDefaultSize?: number;
  leftPanelMinSize?: number;
  leftPanelMaxSize?: number;
  rightPanelMinSize?: number;
  direction?: 'horizontal' | 'vertical';
  className?: string;
  showHandle?: boolean;
}

export function ResizablePanelLayout({
  leftPanel,
  rightPanel,
  leftPanelDefaultSize = 50,
  leftPanelMinSize = 30,
  leftPanelMaxSize = 70,
  rightPanelMinSize = 25,
  direction = 'horizontal',
  className,
  showHandle = true,
}: ResizablePanelLayoutProps) {
  return (
    <ResizablePanelGroup
      direction={direction}
      className={cn('min-h-full', className)}
    >
      <ResizablePanel
        defaultSize={leftPanelDefaultSize}
        minSize={leftPanelMinSize}
        maxSize={leftPanelMaxSize}
        className="overflow-auto"
      >
        {leftPanel}
      </ResizablePanel>
      
      {showHandle && (
        <ResizableHandle 
          withHandle 
          className="w-2 bg-border hover:bg-primary/20 transition-colors data-[resize-handle-active]:bg-primary/40"
        />
      )}
      
      <ResizablePanel
        minSize={rightPanelMinSize}
        className="overflow-auto"
      >
        {rightPanel}
      </ResizablePanel>
    </ResizablePanelGroup>
  );
}

interface ThreePanelLayoutProps {
  leftPanel: ReactNode;
  centerPanel: ReactNode;
  rightPanel: ReactNode;
  leftPanelDefaultSize?: number;
  centerPanelDefaultSize?: number;
  leftPanelMinSize?: number;
  centerPanelMinSize?: number;
  rightPanelMinSize?: number;
  className?: string;
}

export function ThreePanelLayout({
  leftPanel,
  centerPanel,
  rightPanel,
  leftPanelDefaultSize = 25,
  centerPanelDefaultSize = 50,
  leftPanelMinSize = 15,
  centerPanelMinSize = 30,
  rightPanelMinSize = 15,
  className,
}: ThreePanelLayoutProps) {
  return (
    <ResizablePanelGroup
      direction="horizontal"
      className={cn('min-h-full', className)}
    >
      <ResizablePanel
        defaultSize={leftPanelDefaultSize}
        minSize={leftPanelMinSize}
        className="overflow-auto"
      >
        {leftPanel}
      </ResizablePanel>
      
      <ResizableHandle 
        withHandle 
        className="w-2 bg-border hover:bg-primary/20 transition-colors data-[resize-handle-active]:bg-primary/40"
      />
      
      <ResizablePanel
        defaultSize={centerPanelDefaultSize}
        minSize={centerPanelMinSize}
        className="overflow-auto"
      >
        {centerPanel}
      </ResizablePanel>
      
      <ResizableHandle 
        withHandle 
        className="w-2 bg-border hover:bg-primary/20 transition-colors data-[resize-handle-active]:bg-primary/40"
      />
      
      <ResizablePanel
        minSize={rightPanelMinSize}
        className="overflow-auto"
      >
        {rightPanel}
      </ResizablePanel>
    </ResizablePanelGroup>
  );
}
