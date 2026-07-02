import React from 'react';
import { X } from 'lucide-react';
import type { AIPersona } from '../lib/ai/types';
import { PERSONAS } from '../lib/ai/personas';
import { getPersonaAvatarUrlFromKey } from '../lib/ai/avatarStyles';

const PERSONA_ORDER: AIPersona[] = [
  'lily',
  'dara',
  'monk',
  'sisamouth',
  'developer',
  'teacher',
  'priest',
  'imam',
  'lucifer',
  'satan',
  'baphomet',
  'god',
  'ganthy',
  'newtorn',
  'buddah',
];

const DISPLAY_LABELS: Partial<Record<AIPersona, string>> = {
  developer: 'Senior Dev',
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
    <div className={`px-safe ${className}`}>
      <div className="rounded-full border border-white/10 bg-black/50 px-2 py-2 shadow-lg backdrop-blur-xl">
        <div className="flex gap-2 overflow-x-auto scrollbar-none [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
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
                onClick={() => (isActive && activeId ? onRemove(activeId) : onSummon(key))}
                className={`relative size-9 shrink-0 overflow-hidden rounded-full transition-all sm:size-10 ${
                  isActive
                    ? 'ring-2 ring-white/40 ring-offset-2 ring-offset-black/50'
                    : 'opacity-90 hover:scale-105 hover:opacity-100'
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
    </div>
  );
};
