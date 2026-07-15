import React from 'react';
import { X } from 'lucide-react';
import type { AIPersona } from '../lib/ai/types';
import { PERSONAS } from '../lib/ai/personas';
import { getPersonaAvatarUrlFromKey } from '../lib/ai/avatarStyles';
import { playFutureClick } from '../lib/ui/futureClickSound';
import { TooltipProvider } from './ui/tooltip';


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
  'hivsop',
  'polpot',
];

const DISPLAY_LABELS: Partial<Record<AIPersona, string>> = {
  developer: 'Senior Dev',
  madai: 'Mad AI',
  fifa2026: 'FIFA 2026',
  footballlegend: 'កំពូលបាល់',
  hivsop: 'HIV SOP',
  polpot: 'Pol Pot',
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
      <div className={className}>
        <div className="flex flex-wrap gap-3 p-1">
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
      </div>
    </TooltipProvider>
  );
};
