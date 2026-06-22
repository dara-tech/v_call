import React from 'react';
import { Button } from './ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from './ui/tooltip';
import { 
  Mic, 
  MicOff, 
  Video, 
  VideoOff, 
  Monitor, 
  PhoneOff, 
  Popcorn
} from 'lucide-react';



interface ToolbarProps {
  isMuted: boolean;
  isCameraOff: boolean;
  isScreenSharing: boolean;
  showChat?: boolean;
  showStats: boolean;
  showWatchParty: boolean;
  unreadCount?: number;
  onToggleMute: () => void;
  onToggleCamera: () => void;
  onToggleScreenShare: () => void;
  onToggleChat?: () => void;
  onToggleStats: () => void;
  onToggleWatchParty: () => void;
  onLeaveCall: () => void;
}

export const Toolbar: React.FC<ToolbarProps> = ({
  isMuted,
  isCameraOff,
  isScreenSharing,
  showWatchParty,
  onToggleMute,
  onToggleCamera,
  onToggleScreenShare,
  onToggleWatchParty,
  onLeaveCall
}) => {

  return (
    <TooltipProvider delayDuration={200}>
      <div className="flex items-center justify-center gap-1 sm:gap-2 bg-zinc-900/60 backdrop-blur-3xl p-2 sm:p-2 border border-white/10 rounded-[2rem] sm:rounded-full shadow-[0_8px_32px_rgba(0,0,0,0.6)] relative z-10 hover:bg-zinc-900/70 transition-colors w-max max-w-[95vw] overflow-x-auto snap-x snap-mandatory [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
        
        {/* Toggle Audio */}
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="button"
              variant={isMuted ? 'destructive' : 'outline'}
              size="icon-sm"
              className="shrink-0 snap-center size-[2.25rem] sm:size-[2.75rem] rounded-full transition-all border-white/5 hover:bg-white/10 shadow-sm"
              onClick={onToggleMute}
            >
              {isMuted ? <MicOff className="size-3.5 sm:size-4" /> : <Mic className="size-3.5 sm:size-4" />}
            </Button>
          </TooltipTrigger>
          <TooltipContent side="top" className="bg-zinc-950 text-white border-white/10 text-xs hidden sm:block">
            <p>{isMuted ? 'Unmute' : 'Mute'}</p>
          </TooltipContent>
        </Tooltip>

        {/* Toggle Video */}
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="button"
              variant={isCameraOff ? 'destructive' : 'outline'}
              size="icon-sm"
              className="shrink-0 snap-center size-[2.25rem] sm:size-[2.75rem] rounded-full transition-all border-white/5 hover:bg-white/10 shadow-sm"
              onClick={onToggleCamera}
            >
              {isCameraOff ? <VideoOff className="size-3.5 sm:size-4" /> : <Video className="size-3.5 sm:size-4" />}
            </Button>
          </TooltipTrigger>
          <TooltipContent side="top" className="bg-zinc-950 text-white border-white/10 text-xs hidden sm:block">
            <p>{isCameraOff ? 'Turn on camera' : 'Turn off camera'}</p>
          </TooltipContent>
        </Tooltip>

        {/* Screen Share */}
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="button"
              variant={isScreenSharing ? 'secondary' : 'outline'}
              size="icon-sm"
              className={`shrink-0 snap-center size-[2.25rem] sm:size-[2.75rem] rounded-full transition-all border-white/5 shadow-sm ${isScreenSharing ? 'text-brand-cyan bg-brand-cyan/20 border-brand-cyan/30' : 'hover:bg-white/10'}`}
              onClick={onToggleScreenShare}
            >
              <Monitor className="size-3.5 sm:size-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="top" className="bg-zinc-950 text-white border-white/10 text-xs hidden sm:block">
            <p>{isScreenSharing ? 'Stop sharing' : 'Share screen'}</p>
          </TooltipContent>
        </Tooltip>

        <div className="shrink-0 snap-center h-6 sm:h-7 w-px bg-white/10 mx-1" />

        {/* Toggle Watch Party */}
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="button"
              variant={showWatchParty ? 'secondary' : 'outline'}
              size="icon-sm"
              className={`shrink-0 snap-center size-[2.25rem] sm:size-[2.75rem] rounded-full transition-all border-white/5 shadow-sm ${showWatchParty ? 'text-brand-orange bg-brand-orange/20 border-brand-orange/30' : 'hover:bg-white/10'}`}
              onClick={onToggleWatchParty}
            >
              <Popcorn className="size-3.5 sm:size-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="top" className="bg-zinc-950 text-white border-white/10 text-xs hidden sm:block">
            <p>{showWatchParty ? 'Close Watch Party' : 'Open Watch Party'}</p>
          </TooltipContent>
        </Tooltip>

        <div className="shrink-0 snap-center h-6 sm:h-7 w-px bg-white/10 mx-1" />

        {/* End Call / Leave */}
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="button"
              variant="destructive"
              size="icon-sm"
              className="shrink-0 snap-center size-[2.25rem] sm:size-[2.75rem] bg-brand-rose hover:bg-brand-rose/90 rounded-full transition-all shadow-md"
              onClick={onLeaveCall}
            >
              <PhoneOff className="size-3.5 sm:size-4 text-white" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="top" className="bg-zinc-950 text-white border-brand-rose/50 text-xs hidden sm:block">
            <p className="font-semibold">Leave Call</p>
          </TooltipContent>
        </Tooltip>

      </div>
    </TooltipProvider>
  );
};
