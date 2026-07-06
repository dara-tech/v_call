import React from 'react';
import { Info, X } from 'lucide-react';
import type { AIPersona } from '../lib/ai/types';
import { PERSONAS } from '../lib/ai/personas';
import { getPersonaAvatarUrlFromKey } from '../lib/ai/avatarStyles';
import { GEMINI_LIVE_TRANSLATE_DOCS_URL } from '../lib/ai/liveConfig';
import { playFutureClick } from '../lib/ui/futureClickSound';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from './ui/tooltip';

const PERSONA_ORDER: AIPersona[] = [
  'lily',
  'dara',
  'monk',
  'sisamouth',
  'developer',
  'madai',
  'terminator',
  'fifa2026',
  'footballlegend',
  'teacher',
  'questioner',
  'priest',
  'imam',
  'vishnu',
  'lucifer',
  'satan',
  'baphomet',
  'god',
  'ganthy',
  'genghis',
  'newtorn',
  'buddah',
  'angel',
  'hochiminh',
];

const DISPLAY_LABELS: Partial<Record<AIPersona, string>> = {
  developer: 'Senior Dev',
  madai: 'Mad AI',
  fifa2026: 'FIFA 2026',
  footballlegend: 'កំពូលបាល់',
};

interface AiPersonaBarProps {
  activePersonas: Partial<Record<AIPersona, string>>;
  onSummon: (persona: AIPersona) => void;
  onRemove: (socketId: string) => void;
  className?: string;
}

export const AiPersonaBar: React.FC<AiPersonaBarProps> = ({
  activePersonas,
  onSummon,
  onRemove,
  className = '',
}) => {
  return (
    <TooltipProvider delayDuration={200}>
      <div className={`px-safe ${className}`}>
        <div className="flex items-center gap-2 rounded-full border border-white/10 bg-black/50 px-2 py-2 shadow-lg backdrop-blur-xl">
          <div className="flex min-w-0 flex-1 gap-2 overflow-x-auto scrollbar-none [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
            {PERSONA_ORDER.map((key) => {
            const label = DISPLAY_LABELS[key] ?? PERSONAS[key].name;
            const activeId = activePersonas[key];
            const isActive = Boolean(activeId);

            return (
              <button
                key={key}
                type="button"
                title={label}
                aria-label={isActive ? `Remove ${label}` : `Invite ${label}`}
                onClick={() => {
                  if (isActive && activeId) {
                    playFutureClick('dismiss');
                    onRemove(activeId);
                  } else {
                    playFutureClick('summon');
                    onSummon(key);
                  }
                }}
                className={`relative size-9 shrink-0 overflow-hidden rounded-full transition-all active:scale-95 active:ring-2 active:ring-cyan-400/50 sm:size-10 ${
                  isActive
                    ? 'ring-2 ring-white/40 ring-offset-2 ring-offset-black/50'
                    : 'opacity-90 hover:scale-105 hover:opacity-100 hover:shadow-[0_0_12px_rgba(34,211,238,0.35)]'
                }`}
              >
                <img
                  src={getPersonaAvatarUrlFromKey(key)}
                  alt={label}
                  className="size-full object-cover"
                  draggable={false}
                />
                {isActive && (
                  <span className="absolute -right-0.5 -top-0.5 flex size-3.5 items-center justify-center rounded-full bg-zinc-950 ring-1 ring-white/20">
                    <X className="size-2 text-red-400" />
                  </span>
                )}
              </button>
            );
          })}
          </div>

          <Tooltip>
            <TooltipTrigger asChild>
              <a
                href={GEMINI_LIVE_TRANSLATE_DOCS_URL}
                target="_blank"
                rel="noopener noreferrer"
                aria-label="Gemini Live Translate documentation"
                className="flex size-8 shrink-0 items-center justify-center rounded-full text-zinc-400 transition-all hover:bg-white/10 hover:text-cyan-300 hover:shadow-[0_0_10px_rgba(34,211,238,0.4)] active:scale-90"
                onClick={(e) => {
                  e.stopPropagation();
                  playFutureClick('info');
                }}
              >
                <Info className="size-4" />
              </a>
            </TooltipTrigger>
            <TooltipContent
              side="bottom"
              className="max-w-xs border-white/10 bg-zinc-950 text-white text-xs sm:max-w-sm"
            >
              <p className="font-semibold text-cyan-300">Gemini Live</p>
              <p className="mt-1 text-zinc-300">
                AI personas use <span className="text-white">Live Agent</span> mode.
                For real-time voice translation, use the{' '}
                <span className="text-white">Languages</span> button in the call toolbar.
              </p>
              <p className="mt-2 text-cyan-400/90">Click icon for Google docs →</p>
            </TooltipContent>
          </Tooltip>
        </div>
      </div>
    </TooltipProvider>
  );
};
