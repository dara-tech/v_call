import { Globe2, Heart, Info, Shuffle } from 'lucide-react';
import type { ViewMode } from '@/lib/tvgarden/types';

interface HeaderProps {
  view: ViewMode;
  onViewChange: (view: ViewMode) => void;
  onRandom: () => void;
  channelCount: number;
}

export function TvGardenHeader({ view, onViewChange, onRandom, channelCount }: HeaderProps) {
  const nav = [
    { id: 'explore' as const, label: 'Explore', icon: Globe2 },
    { id: 'favorites' as const, label: 'Favorites', icon: Heart },
    { id: 'about' as const, label: 'About', icon: Info },
  ];

  return (
    <header className="flex shrink-0 items-center justify-between gap-3 border-b border-white/10 bg-zinc-950/80 px-4 py-3 pr-12 backdrop-blur-xl sm:pr-14">
      <div className="flex items-center gap-2.5">
        <div className="flex size-8 shrink-0 items-center justify-center rounded-lg border border-white/10 bg-white/5">
          <Globe2 className="size-4 text-brand-cyan" />
        </div>
        <div>
          <h1 className="text-sm font-bold tracking-wide text-white sm:text-base">TV Garden</h1>
          <p className="text-[10px] text-zinc-500">{channelCount.toLocaleString()} live channels</p>
        </div>
      </div>

      <nav className="hidden items-center gap-1 sm:flex">
        {nav.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            type="button"
            onClick={() => onViewChange(id)}
            className={`flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-semibold transition ${
              view === id ? 'bg-brand-cyan/15 text-brand-cyan' : 'text-zinc-400 hover:bg-white/5 hover:text-zinc-200'
            }`}
          >
            <Icon className="size-3.5" />
            {label}
          </button>
        ))}
      </nav>

      <button
        type="button"
        onClick={onRandom}
        className="flex items-center gap-1.5 rounded-xl border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-xs font-semibold text-zinc-300 transition hover:border-zinc-600 hover:text-white"
      >
        <Shuffle className="size-3.5" />
        <span className="hidden sm:inline">Random</span>
      </button>
    </header>
  );
}
