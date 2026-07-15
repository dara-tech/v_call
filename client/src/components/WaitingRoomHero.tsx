import React from 'react';
import { Copy, Check, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface WaitingRoomHeroProps {
  roomId: string;
  onCopyInvite: () => void;
  isCopied: boolean;
}

export const WaitingRoomHero: React.FC<WaitingRoomHeroProps> = ({
  roomId,
  onCopyInvite,
  isCopied,
}) => {
  return (
    <div className="relative flex h-full min-h-0 w-full flex-col items-center justify-center px-safe py-6">
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute left-1/2 top-1/2 size-56 -translate-x-1/2 -translate-y-1/2 rounded-full bg-yellow-500/10 blur-3xl" />
      </div>

      <div className="relative z-10 flex w-full max-w-sm flex-col items-center gap-6 sm:gap-8">
        <div className="relative flex size-16 items-center justify-center sm:size-20">
          <span className="absolute inset-0 animate-ping rounded-full bg-amber-400/10" />
          <span className="absolute inset-2 rounded-full border border-white/10 bg-zinc-900/80 backdrop-blur-xl" />
          <Users className="relative size-8 text-amber-300/70 sm:size-9" />
        </div>

        <div
          onClick={onCopyInvite}
          role="button"
          tabIndex={0}
          className="flex w-full cursor-pointer items-center gap-3 rounded-2xl border border-white/10 bg-zinc-950/70 px-3 py-3 shadow-2xl backdrop-blur-xl transition-colors hover:border-white/20 hover:bg-zinc-900/80 sm:px-4"
        >
          <code className="flex-1 truncate text-left font-mono text-lg tracking-[0.12em] text-white sm:text-xl sm:tracking-[0.15em]">
            {roomId}
          </code>
          <Button
            type="button"
            variant="outline"
            onClick={(e) => {
              e.stopPropagation();
              onCopyInvite();
            }}
            className={`size-10 shrink-0 rounded-xl border-white/10 p-0 sm:size-11 ${
              isCopied
                ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400'
                : 'bg-white/5 text-zinc-200 hover:bg-white/10 hover:text-white'
            }`}
          >
            {isCopied ? <Check className="size-4" /> : <Copy className="size-4" />}
          </Button>
        </div>
      </div>
    </div>
  );
};
