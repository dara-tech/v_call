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
  Copy,
  Check,
  CircleDot,
  MessageSquare,
  Users,
  Settings as SettingsIcon,
} from 'lucide-react';

interface ToolbarProps {
  isMuted: boolean;
  isCameraOff: boolean;
  isScreenSharing: boolean;
  showChat?: boolean;
  showParticipants?: boolean;
  participantCount?: number;
  unreadCount?: number;
  translateState?: string;
  onToggleMute: () => void;
  onToggleCamera: () => void;
  onToggleScreenShare: () => void;
  onToggleChat?: () => void;
  onToggleParticipants?: () => void;
  onLeaveCall: () => void;
  onCopyInvite?: () => void;
  isCopied?: boolean;
  isScreenRecording?: boolean;
  recordingDurationSec?: number;
  onToggleScreenRecording?: () => void;
  onOpenSettings?: () => void;
}

export const Toolbar: React.FC<ToolbarProps> = ({
  isMuted,
  isCameraOff,
  isScreenSharing,
  showChat,
  showParticipants,
  participantCount = 0,
  onToggleChat,
  onToggleParticipants,
  onToggleMute,
  onToggleCamera,
  onToggleScreenShare,
  onLeaveCall,
  onCopyInvite,
  isCopied,
  isScreenRecording = false,
  recordingDurationSec = 0,
  unreadCount = 0,
  onToggleScreenRecording,
  onOpenSettings,
}) => {


  return (
    <TooltipProvider delayDuration={200}>
      <div className="flex w-full max-w-full items-center justify-center gap-0.5 overflow-x-auto p-1.5 scrollbar-none sm:gap-2 sm:p-2 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none]">

        {/* Toggle Audio */}
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="button"
              variant={isMuted ? 'destructive' : 'outline'}
              size="icon-sm"
              className="shrink-0 snap-center size-[2.25rem] sm:size-[2.75rem] rounded-xl transition-all border-white/5 hover:bg-white/10 shadow-sm"
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
              className="shrink-0 snap-center size-[2.25rem] sm:size-[2.75rem] rounded-xl transition-all border-white/5 hover:bg-white/10 shadow-sm"
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
              className={`shrink-0 snap-center size-[2.25rem] sm:size-[2.75rem] rounded-xl transition-all border-white/5 shadow-sm ${isScreenSharing ? 'text-brand-cyan bg-brand-cyan/20 border-brand-cyan/30' : 'hover:bg-white/10'}`}
              onClick={onToggleScreenShare}
            >
              <Monitor className="size-3.5 sm:size-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="top" className="bg-zinc-950 text-white border-white/10 text-xs hidden sm:block">
            <p>{isScreenSharing ? 'Stop sharing' : 'Share screen'}</p>
          </TooltipContent>
        </Tooltip>

        {/* Screen recording — screen + mic + call/system audio */}
        {onToggleScreenRecording && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                variant={isScreenRecording ? 'destructive' : 'outline'}
                size="icon-sm"
                className={`shrink-0 snap-center size-[2.25rem] sm:size-[2.75rem] rounded-xl transition-all shadow-sm ${
                  isScreenRecording
                    ? 'animate-pulse border-brand-rose bg-brand-rose hover:bg-brand-rose'
                    : 'border-brand-rose/40 text-brand-rose hover:bg-brand-rose/10'
                }`}
                onClick={onToggleScreenRecording}
                aria-label={isScreenRecording ? 'Stop screen recording' : 'Start screen recording'}
              >
                <CircleDot className={`size-4 sm:size-5 ${isScreenRecording ? 'text-white' : ''}`} />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="top" className="bg-zinc-950 text-white border-white/10 text-xs hidden sm:block">
              <p>
                {isScreenRecording
                  ? `Stop recording (${String(Math.floor(recordingDurationSec / 60)).padStart(2, '0')}:${String(recordingDurationSec % 60).padStart(2, '0')})`
                  : 'Record screen (mic + call audio)'}
              </p>
            </TooltipContent>
          </Tooltip>
        )}



        {/* Chat Toggle */}
        {onToggleChat && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                variant={showChat ? 'secondary' : 'outline'}
                size="icon-sm"
                className={`shrink-0 snap-center size-[2.25rem] sm:size-[2.75rem] rounded-xl transition-all border-white/5 shadow-sm relative ${showChat ? 'text-brand-violet bg-brand-violet/20 border-brand-violet/30' : 'hover:bg-white/10'}`}
                onClick={onToggleChat}
              >
                <MessageSquare className="size-3.5 sm:size-4" />
                {!showChat && unreadCount > 0 && (
                  <span className="absolute -top-1 -right-1 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-brand-rose px-1 text-[9px] font-bold text-white shadow ring-2 ring-zinc-950">
                    {unreadCount > 99 ? '99+' : unreadCount}
                  </span>
                )}
              </Button>
            </TooltipTrigger>
            <TooltipContent side="top" className="bg-zinc-950 text-white border-white/10 text-xs hidden sm:block">
              <p>{showChat ? 'Close chat' : 'Open chat'}</p>
            </TooltipContent>
          </Tooltip>
        )}

        {/* Participants */}
        {onToggleParticipants && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                variant={showParticipants ? 'secondary' : 'outline'}
                size="icon-sm"
                className={`shrink-0 snap-center size-[2.25rem] sm:size-[2.75rem] rounded-xl transition-all border-white/5 shadow-sm relative ${showParticipants ? 'text-brand-cyan bg-brand-cyan/20 border-brand-cyan/30' : 'hover:bg-white/10'}`}
                onClick={onToggleParticipants}
              >
                <Users className="size-3.5 sm:size-4" />
                {participantCount > 0 && (
                  <span className="absolute -top-1 -right-1 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-zinc-700 px-1 text-[9px] font-bold text-white shadow ring-2 ring-zinc-950">
                    {participantCount > 99 ? '99+' : participantCount}
                  </span>
                )}
              </Button>
            </TooltipTrigger>
            <TooltipContent side="top" className="bg-zinc-950 text-white border-white/10 text-xs hidden sm:block">
              <p>{showParticipants ? 'Hide participants' : 'Participants'}</p>
            </TooltipContent>
          </Tooltip>
        )}

        {/* Copy Invite Link */}
        {onCopyInvite && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                variant="outline"
                size="icon-sm"
                className={`shrink-0 snap-center size-[2.25rem] sm:size-[2.75rem] rounded-xl transition-all border-white/5 shadow-sm ${isCopied ? 'text-brand-emerald bg-brand-emerald/20 border-brand-emerald/30' : 'hover:bg-white/10'}`}
                onClick={onCopyInvite}
              >
                {isCopied ? <Check className="size-3.5 sm:size-4" /> : <Copy className="size-3.5 sm:size-4" />}
              </Button>
            </TooltipTrigger>
            <TooltipContent side="top" className="bg-zinc-950 text-white border-white/10 text-xs hidden sm:block">
              <p>{isCopied ? 'Copied!' : 'Copy Room ID'}</p>
            </TooltipContent>
          </Tooltip>
        )}

        {/* Settings */}
        {onOpenSettings && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                variant="outline"
                size="icon-sm"
                className="shrink-0 snap-center size-[2.25rem] sm:size-[2.75rem] rounded-xl transition-all border-white/5 hover:bg-white/10 shadow-sm"
                onClick={onOpenSettings}
              >
                <SettingsIcon className="size-3.5 sm:size-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="top" className="bg-zinc-950 text-white border-white/10 text-xs hidden sm:block">
              <p>Settings & AI Features</p>
            </TooltipContent>
          </Tooltip>
        )}

        <div className="shrink-0 snap-center h-6 sm:h-7 w-px bg-white/10 mx-1" />

        {/* End Call / Leave */}
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="button"
              variant="destructive"
              size="icon-sm"
              className="shrink-0 snap-center size-[2.25rem] sm:size-[2.75rem] bg-brand-rose hover:bg-brand-rose/90 rounded-xl transition-all shadow-md"
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
