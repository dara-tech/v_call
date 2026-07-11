import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Video, Globe2 } from 'lucide-react';

interface PreCallLobbyProps {
  onJoin: (room: string, name: string, audioId: string, videoId: string) => void;
  onOpenTvGarden?: () => void;
  defaultRoom: string;
  defaultName?: string;
}

const GENZ_NAMES = [
  'VibeCheck',
  'MainCharacter',
  'Bruh',
  'Ghosted',
  'SlayQueen',
  'CEOofYapping',
  'NoCap',
  'BratSummer',
  'Sigma',
  'RizzlyBear',
  'Skibidi',
  'W_Rizz',
  'Based',
  'TouchGrass',
  'Delulu',
];

const generateName = () =>
  `${GENZ_NAMES[Math.floor(Math.random() * GENZ_NAMES.length)]}_${Math.floor(Math.random() * 999)}`;

export const PreCallLobby: React.FC<PreCallLobbyProps> = ({
  onJoin,
  onOpenTvGarden,
  defaultRoom,
  defaultName = '',
}) => {
  const [name] = useState(defaultName || generateName());
  const [room] = useState(defaultRoom);

  const handleJoinCall = () => {
    onJoin(room.trim().toLowerCase(), name.trim(), '', '');
  };

  return (
    <div className="relative flex min-h-dvh items-center justify-center overflow-hidden bg-[#070707] px-safe text-zinc-100">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute left-1/2 top-1/3 size-80 -translate-x-1/2 rounded-full bg-cyan-500/10 blur-3xl" />
        <div className="absolute bottom-1/4 right-1/4 size-64 rounded-full bg-violet-500/10 blur-3xl" />
      </div>

      <div className="relative z-10 flex w-full max-w-sm flex-col items-center text-center">
        <div className="mb-6 flex size-16 items-center justify-center rounded-2xl border border-white/10 bg-white/5 shadow-[0_0_40px_rgba(34,211,238,0.12)] backdrop-blur-xl">
          <Video className="size-7 text-cyan-300" />
        </div>

        <h1 className="text-3xl font-bold tracking-tight text-white">V-Call</h1>
        <p className="mt-2 text-sm text-zinc-500">minimal, fast, peer-to-peer.</p>

        <Button
          type="button"
          onClick={handleJoinCall}
          className="mt-10 h-12 min-w-[220px] rounded-xl border-0 bg-white px-8 text-sm font-semibold text-black shadow-[0_0_30px_rgba(255,255,255,0.15)] transition-all hover:bg-zinc-100 hover:shadow-[0_0_40px_rgba(255,255,255,0.22)]"
        >
          Join Room
        </Button>

        {onOpenTvGarden && (
          <Button
            type="button"
            variant="outline"
            onClick={onOpenTvGarden}
            className="mt-3 h-11 min-w-[220px] gap-2 rounded-xl border-white/15 bg-white/5 text-sm font-semibold text-zinc-200 hover:bg-white/10 hover:text-white"
          >
            <Globe2 className="size-4 text-brand-cyan" />
            TV Garden
          </Button>
        )}

        <p className="mt-4 text-[11px] text-zinc-600">
          Room <span className="font-mono text-zinc-400">{room}</span>
        </p>
      </div>
    </div>
  );
};
