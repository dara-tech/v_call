import React, { useEffect } from 'react';
import { Button } from '@/components/ui/button';
import {
  Mic,
  MicOff,
  Video,
  VideoOff,
  Monitor,
  MessageSquare,
  Activity,
  PhoneOff,
} from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

interface ToolbarProps {
  isMuted: boolean;
  isCameraOff: boolean;
  isScreenSharing: boolean;
  showChat: boolean;
  showStats: boolean;
  unreadCount: number;
  onToggleMute: () => void;
  onToggleCamera: () => void;
  onToggleScreenShare: () => void;
  onToggleChat: () => void;
  onToggleStats: () => void;
  onLeaveCall: () => void;
}

export const Toolbar: React.FC<ToolbarProps> = ({
  isMuted,
  isCameraOff,
  isScreenSharing,
  showChat,
  showStats,
  unreadCount,
  onToggleMute,
  onToggleCamera,
  onToggleScreenShare,
  onToggleChat,
  onToggleStats,
  onLeaveCall,
}) => {

  // Global key listeners inside call
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const activeTag = document.activeElement?.tagName.toLowerCase();
      // Ignore key events if user is typing in chat input
      if (activeTag === 'input' || activeTag === 'textarea') return;

      switch (e.key.toLowerCase()) {
        case 'm':
          e.preventDefault();
          onToggleMute();
          break;
        case 'v':
          e.preventDefault();
          onToggleCamera();
          break;
        case 's':
          e.preventDefault();
          onToggleScreenShare();
          break;
        case 'c':
          e.preventDefault();
          onToggleChat();
          break;
        case 'd':
          e.preventDefault();
          onToggleStats();
          break;
        default:
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [onToggleMute, onToggleCamera, onToggleScreenShare, onToggleChat, onToggleStats]);

  return (
    <TooltipProvider delayDuration={200}>
      <div className="flex items-center gap-2 bg-zinc-950/80 backdrop-blur-md px-4 py-2 border border-zinc-800 rounded-lg shadow-xl relative z-10">
        
        {/* Toggle Audio */}
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="button"
              variant={isMuted ? 'destructive' : 'outline'}
              size="icon-sm"
              className="size-9 rounded-md transition-all border-zinc-800"
              onClick={onToggleMute}
            >
              {isMuted ? <MicOff className="size-4" /> : <Mic className="size-4" />}
            </Button>
          </TooltipTrigger>
          <TooltipContent className="bg-zinc-900 border border-zinc-800 text-[10px] text-zinc-200">
            {isMuted ? 'Unmute Audio (M)' : 'Mute Audio (M)'}
          </TooltipContent>
        </Tooltip>

        {/* Toggle Video */}
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="button"
              variant={isCameraOff ? 'destructive' : 'outline'}
              size="icon-sm"
              className="size-9 rounded-md transition-all border-zinc-800"
              onClick={onToggleCamera}
            >
              {isCameraOff ? <VideoOff className="size-4" /> : <Video className="size-4" />}
            </Button>
          </TooltipTrigger>
          <TooltipContent className="bg-zinc-900 border border-zinc-800 text-[10px] text-zinc-200">
            {isCameraOff ? 'Enable Camera (V)' : 'Disable Camera (V)'}
          </TooltipContent>
        </Tooltip>

        {/* Toggle Screen Share */}
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="button"
              variant={isScreenSharing ? 'secondary' : 'outline'}
              size="icon-sm"
              className={`size-9 rounded-md transition-all border-zinc-800 ${isScreenSharing ? 'text-brand-cyan bg-zinc-900/80 border-brand-cyan/20' : ''}`}
              onClick={onToggleScreenShare}
            >
              <Monitor className="size-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent className="bg-zinc-900 border border-zinc-800 text-[10px] text-zinc-200">
            {isScreenSharing ? 'Stop Screen Share (S)' : 'Share Screen (S)'}
          </TooltipContent>
        </Tooltip>

        <div className="h-6 w-px bg-zinc-800 mx-1" />

        {/* Toggle Diagnostics Stats */}
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="button"
              variant={showStats ? 'secondary' : 'outline'}
              size="icon-sm"
              className={`size-9 rounded-md transition-all border-zinc-800 ${showStats ? 'text-brand-emerald bg-zinc-900/80 border-brand-emerald/20' : ''}`}
              onClick={onToggleStats}
            >
              <Activity className="size-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent className="bg-zinc-900 border border-zinc-800 text-[10px] text-zinc-200">
            {showStats ? 'Hide Diagnostics (D)' : 'Show Diagnostics (D)'}
          </TooltipContent>
        </Tooltip>

        {/* Toggle Chat Panel */}
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="button"
              variant={showChat ? 'secondary' : 'outline'}
              size="icon-sm"
              className={`size-9 rounded-md transition-all border-zinc-800 relative ${showChat ? 'text-brand-violet bg-zinc-900/80 border-brand-violet/20' : ''}`}
              onClick={onToggleChat}
            >
              <MessageSquare className="size-4" />
              {unreadCount > 0 && (
                <span className="absolute -top-1 -right-1 size-4 bg-brand-violet text-white text-[8px] font-bold flex items-center justify-center rounded-full animate-pulse border border-zinc-950">
                  {unreadCount}
                </span>
              )}
            </Button>
          </TooltipTrigger>
          <TooltipContent className="bg-zinc-900 border border-zinc-800 text-[10px] text-zinc-200">
            {showChat ? 'Hide Chat Sidebar (C)' : 'Show Chat Sidebar (C)'}
          </TooltipContent>
        </Tooltip>

        <div className="h-6 w-px bg-zinc-800 mx-1" />

        {/* End Call / Leave */}
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="button"
              variant="destructive"
              size="icon-sm"
              className="size-9 bg-brand-rose hover:bg-brand-rose/90 rounded-md transition-all"
              onClick={onLeaveCall}
            >
              <PhoneOff className="size-4 text-white" />
            </Button>
          </TooltipTrigger>
          <TooltipContent className="bg-zinc-900 border border-zinc-800 text-[10px] text-zinc-200">
            Leave Room
          </TooltipContent>
        </Tooltip>

      </div>
    </TooltipProvider>
  );
};
