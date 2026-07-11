import React, { useState } from 'react';
import { Button } from './ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from './ui/tooltip';
import { Popover, PopoverContent, PopoverTrigger } from './ui/popover';
import {
  Mic,
  MicOff,
  Video,
  VideoOff,
  Monitor,
  PhoneOff,
  Popcorn,
  Globe2,
  Copy,
  Check,
  Languages,
  CircleDot,
} from 'lucide-react';
import { LIVE_TRANSLATE_LANGUAGES } from '../lib/ai/liveConfig';
import { playFutureClick } from '../lib/ui/futureClickSound';

interface ToolbarProps {
  isMuted: boolean;
  isCameraOff: boolean;
  isScreenSharing: boolean;
  showChat?: boolean;
  showStats: boolean;
  showWatchParty: boolean;
  showTvGarden?: boolean;
  unreadCount?: number;
  isTranslateActive?: boolean;
  translateTargetLanguage?: string;
  translateState?: string;
  onStartLiveTranslate?: (langCode: string) => void;
  onStopLiveTranslate?: () => void;
  onToggleMute: () => void;
  onToggleCamera: () => void;
  onToggleScreenShare: () => void;
  onToggleChat?: () => void;
  onToggleStats: () => void;
  onToggleWatchParty: () => void;
  onToggleTvGarden?: () => void;
  onLeaveCall: () => void;
  onCopyInvite?: () => void;
  isCopied?: boolean;
  isScreenRecording?: boolean;
  recordingDurationSec?: number;
  onToggleScreenRecording?: () => void;
}

export const Toolbar: React.FC<ToolbarProps> = ({
  isMuted,
  isCameraOff,
  isScreenSharing,
  showWatchParty,
  showTvGarden = false,
  isTranslateActive = false,
  translateTargetLanguage = 'km',
  onStartLiveTranslate,
  onStopLiveTranslate,
  onToggleMute,
  onToggleCamera,
  onToggleScreenShare,
  onToggleWatchParty,
  onToggleTvGarden,
  onLeaveCall,
  onCopyInvite,
  isCopied,
  isScreenRecording = false,
  recordingDurationSec = 0,
  onToggleScreenRecording,
}) => {
  const [translateOpen, setTranslateOpen] = useState(false);
  const targetLabel =
    LIVE_TRANSLATE_LANGUAGES.find((l) => l.code === translateTargetLanguage)?.label ??
    translateTargetLanguage;

  const handleStopTranslate = () => {
    playFutureClick('dismiss');
    onStopLiveTranslate?.();
    setTranslateOpen(false);
  };

  const handlePickLanguage = (code: string) => {
    playFutureClick('summon');
    onStartLiveTranslate?.(code);
    setTranslateOpen(false);
  };

  return (
    <TooltipProvider delayDuration={200}>
      <div className="flex w-full max-w-full items-center justify-center gap-0.5 overflow-x-auto rounded-2xl border border-white/10 bg-zinc-900/60 p-1.5 shadow-[0_8px_32px_rgba(0,0,0,0.6)] backdrop-blur-3xl scrollbar-none sm:gap-2 sm:rounded-full sm:p-2 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none]">

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

        {/* Screen recording — screen + mic + call/system audio */}
        {onToggleScreenRecording && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                variant={isScreenRecording ? 'destructive' : 'outline'}
                size="icon-sm"
                className={`shrink-0 snap-center size-[2.25rem] sm:size-[2.75rem] rounded-full transition-all shadow-sm ${
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

        {/* Live Translate */}
        {onStartLiveTranslate && onStopLiveTranslate && (
          <Popover open={translateOpen} onOpenChange={setTranslateOpen}>
            <Tooltip>
              <TooltipTrigger asChild>
                {isTranslateActive ? (
                  <Button
                    type="button"
                    variant="secondary"
                    size="icon-sm"
                    className="shrink-0 snap-center size-[2.25rem] sm:size-[2.75rem] rounded-full border-brand-cyan/40 bg-brand-cyan/20 text-brand-cyan shadow-[0_0_14px_rgba(34,211,238,0.35)] transition-all active:scale-95"
                    onClick={handleStopTranslate}
                  >
                    <Languages className="size-3.5 sm:size-4" />
                  </Button>
                ) : (
                  <PopoverTrigger asChild>
                    <Button
                      type="button"
                      variant="outline"
                      size="icon-sm"
                      className="shrink-0 snap-center size-[2.25rem] sm:size-[2.75rem] rounded-full border-white/5 shadow-sm transition-all hover:bg-white/10 hover:shadow-[0_0_10px_rgba(34,211,238,0.25)] active:scale-95"
                      onClick={() => playFutureClick('summon')}
                    >
                      <Languages className="size-3.5 sm:size-4" />
                    </Button>
                  </PopoverTrigger>
                )}
              </TooltipTrigger>
              <TooltipContent side="top" className="max-w-[220px] border-white/10 bg-zinc-950 text-white text-xs hidden sm:block">
                {isTranslateActive ? (
                  <p>Translate → {targetLabel} — tap to stop</p>
                ) : (
                  <p>Live Translate</p>
                )}
              </TooltipContent>
            </Tooltip>
            <PopoverContent
              side="top"
              align="center"
              className="w-52 border-white/10 bg-zinc-950 p-2 text-zinc-200"
            >
              <p className="px-1 text-[10px] font-medium uppercase tracking-wide text-zinc-500">
                Target language
              </p>
              <div className="mt-1.5 grid grid-cols-2 gap-1">
                {LIVE_TRANSLATE_LANGUAGES.map((lang) => (
                  <button
                    key={lang.code}
                    type="button"
                    onClick={() => handlePickLanguage(lang.code)}
                    className="rounded-md border border-white/10 px-2 py-1 text-left text-[11px] transition-colors hover:border-cyan-500/30 hover:bg-cyan-500/10 hover:text-cyan-200"
                  >
                    {lang.label}
                  </button>
                ))}
              </div>
            </PopoverContent>
          </Popover>
        )}

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

        {/* TV Garden — live global channels */}
        {onToggleTvGarden && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                variant={showTvGarden ? 'secondary' : 'outline'}
                size="icon-sm"
                className={`shrink-0 snap-center size-[2.25rem] sm:size-[2.75rem] rounded-full transition-all border-white/5 shadow-sm ${showTvGarden ? 'text-brand-cyan bg-brand-cyan/20 border-brand-cyan/30' : 'hover:bg-white/10'}`}
                onClick={onToggleTvGarden}
              >
                <Globe2 className="size-3.5 sm:size-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="top" className="bg-zinc-950 text-white border-white/10 text-xs hidden sm:block">
              <p>{showTvGarden ? 'Close TV Garden' : 'Open TV Garden'}</p>
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
                className={`shrink-0 snap-center size-[2.25rem] sm:size-[2.75rem] rounded-full transition-all border-white/5 shadow-sm ${isCopied ? 'text-brand-emerald bg-brand-emerald/20 border-brand-emerald/30' : 'hover:bg-white/10'}`}
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
