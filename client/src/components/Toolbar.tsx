import React, { useEffect } from 'react';
import { Button } from '@/components/ui/button';
import {
  Mic,
  MicOff,
  Video,
  VideoOff,
  Monitor,
  MessageSquare,
  PhoneOff,
  Popcorn,
  Hand,
  SmilePlus,
} from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

interface ToolbarProps {
  isMuted: boolean;
  isCameraOff: boolean;
  isScreenSharing: boolean;
  showChat: boolean;
  showStats: boolean;
  showWatchParty: boolean;
  unreadCount: number;
  isHandRaised: boolean;
  onToggleMute: () => void;
  onToggleCamera: () => void;
  onToggleScreenShare: () => void;
  onToggleChat: () => void;
  onToggleStats: () => void;
  onToggleWatchParty: () => void;
  onToggleHand: () => void;
  onSendReaction: (emoji: string) => void;
  onLeaveCall: () => void;
}

export const Toolbar: React.FC<ToolbarProps> = ({
  isMuted,
  isCameraOff,
  isScreenSharing,
  showChat,
  showStats: _showStats,
  showWatchParty,
  unreadCount,
  isHandRaised,
  onToggleMute,
  onToggleCamera,
  onToggleScreenShare,
  onToggleChat,
  onToggleStats,
  onToggleWatchParty,
  onToggleHand,
  onSendReaction,
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
      <div className="flex items-center gap-1.5 sm:gap-2 bg-zinc-950/80 backdrop-blur-md px-2 py-1.5 sm:px-4 sm:py-2 border border-zinc-800/80 rounded-full shadow-2xl relative z-10">
        
        {/* Toggle Audio */}
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="button"
              variant={isMuted ? 'destructive' : 'outline'}
              size="icon-sm"
              className="size-8 sm:size-9 rounded-full transition-all border-zinc-800/60 shadow-sm"
              onClick={onToggleMute}
            >
              {isMuted ? <MicOff className="size-3.5 sm:size-4" /> : <Mic className="size-3.5 sm:size-4" />}
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
              className="size-8 sm:size-9 rounded-full transition-all border-zinc-800/60 shadow-sm"
              onClick={onToggleCamera}
            >
              {isCameraOff ? <VideoOff className="size-3.5 sm:size-4" /> : <Video className="size-3.5 sm:size-4" />}
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
              className={`size-8 sm:size-9 rounded-full transition-all border-zinc-800/60 shadow-sm ${isScreenSharing ? 'text-brand-cyan bg-zinc-900/80 border-brand-cyan/20' : ''}`}
              onClick={onToggleScreenShare}
            >
              <Monitor className="size-3.5 sm:size-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent className="bg-zinc-900 border border-zinc-800 text-[10px] text-zinc-200">
            {isScreenSharing ? 'Stop Screen Share (S)' : 'Share Screen (S)'}
          </TooltipContent>
        </Tooltip>

        <div className="h-5 sm:h-6 w-px bg-zinc-800/60 mx-0.5 sm:mx-1" />


        {/* Toggle Watch Party */}
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="button"
              variant={showWatchParty ? 'secondary' : 'outline'}
              size="icon-sm"
              className={`size-8 sm:size-9 rounded-full transition-all border-zinc-800/60 shadow-sm ${showWatchParty ? 'text-brand-orange bg-zinc-900/80 border-brand-orange/20' : ''}`}
              onClick={onToggleWatchParty}
            >
              <Popcorn className="size-3.5 sm:size-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent className="bg-zinc-900 border border-zinc-800 text-[10px] text-zinc-200">
            {showWatchParty ? 'Hide Watch Party' : 'Watch Party'}
          </TooltipContent>
        </Tooltip>

        {/* Toggle Chat Panel */}
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="button"
              variant={showChat ? 'secondary' : 'outline'}
              size="icon-sm"
              className={`size-8 sm:size-9 rounded-full transition-all border-zinc-800/60 shadow-sm relative ${showChat ? 'text-brand-violet bg-zinc-900/80 border-brand-violet/20' : ''}`}
              onClick={onToggleChat}
            >
              <MessageSquare className="size-3.5 sm:size-4" />
              {unreadCount > 0 && (
                <span className="absolute -top-1 -right-1 size-3.5 sm:size-4 bg-brand-violet text-white text-[8px] font-bold flex items-center justify-center rounded-full animate-pulse border border-zinc-950">
                  {unreadCount}
                </span>
              )}
            </Button>
          </TooltipTrigger>
          <TooltipContent className="bg-zinc-900 border border-zinc-800 text-[10px] text-zinc-200">
            {showChat ? 'Hide Chat Sidebar (C)' : 'Show Chat Sidebar (C)'}
          </TooltipContent>
        </Tooltip>

        <div className="h-5 sm:h-6 w-px bg-zinc-800/60 mx-0.5 sm:mx-1" />

        {/* Raise Hand */}
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="button"
              variant={isHandRaised ? 'secondary' : 'outline'}
              size="icon-sm"
              className={`size-8 sm:size-9 rounded-full transition-all border-zinc-800/60 shadow-sm ${isHandRaised ? 'text-amber-400 bg-zinc-900/80 border-amber-400/20' : ''}`}
              onClick={onToggleHand}
            >
              <Hand className="size-3.5 sm:size-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent className="bg-zinc-900 border border-zinc-800 text-[10px] text-zinc-200">
            {isHandRaised ? 'Lower Hand' : 'Raise Hand'}
          </TooltipContent>
        </Tooltip>

        {/* Reactions */}
        <Popover>
          <PopoverTrigger asChild>
            <Button
              type="button"
              variant="outline"
              size="icon-sm"
              className="size-8 sm:size-9 rounded-full transition-all border-zinc-800/60 shadow-sm hover:text-brand-emerald hover:border-brand-emerald/40"
            >
              <SmilePlus className="size-3.5 sm:size-4" />
            </Button>
          </PopoverTrigger>
          <PopoverContent side="top" align="center" className="w-auto p-2 bg-zinc-900/90 backdrop-blur-md border-zinc-800 rounded-full flex gap-1 shadow-2xl mb-2">
            {['👍', '👎', '❤️', '😂', '🎉', '😮'].map((emoji) => (
              <Button
                key={emoji}
                variant="ghost"
                size="icon-sm"
                className="size-8 text-lg hover:bg-zinc-800 hover:scale-110 transition-transform rounded-full"
                onClick={() => onSendReaction(emoji)}
              >
                {emoji}
              </Button>
            ))}
          </PopoverContent>
        </Popover>

        <div className="h-5 sm:h-6 w-px bg-zinc-800/60 mx-0.5 sm:mx-1" />

        {/* End Call / Leave */}
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="button"
              variant="destructive"
              size="icon-sm"
              className="size-8 sm:size-9 bg-brand-rose hover:bg-brand-rose/90 rounded-full transition-all shadow-md"
              onClick={onLeaveCall}
            >
              <PhoneOff className="size-3.5 sm:size-4 text-white" />
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
