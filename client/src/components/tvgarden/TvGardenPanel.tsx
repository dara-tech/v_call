import { useCallback, useMemo, useState } from 'react';
import { X, Globe2, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ChannelPanel } from './ChannelPanel';
import { GlobeScene } from './GlobeScene';
import { TvGardenHeader } from './TvGardenHeader';
import { LivePlayer } from './LivePlayer';
import { useIptvCatalog } from '@/hooks/useIptvCatalog';
import { loadFavorites, toggleFavorite } from '@/lib/tvgarden/favorites';
import type { LiveChannel, ViewMode } from '@/lib/tvgarden/types';

interface TvGardenPanelProps {
  onClose?: () => void;
  /** Fill parent height (in-call) vs full viewport (lobby). */
  embedded?: boolean;
}

export function TvGardenPanel({ onClose, embedded = false }: TvGardenPanelProps) {
  const { loading, error, countriesWithChannels, channels, categories, getChannelsByCountry, pickRandom } = useIptvCatalog();
  const [view, setView] = useState<ViewMode>('explore');
  const [selectedCountry, setSelectedCountry] = useState<string | null>(null);
  const [selectedChannel, setSelectedChannel] = useState<LiveChannel | null>(null);
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState<string | null>(null);
  const [favoriteIds, setFavoriteIds] = useState<string[]>(() => loadFavorites());

  const countryChannels = useMemo(
    () => (selectedCountry ? getChannelsByCountry(selectedCountry) : []),
    [selectedCountry, getChannelsByCountry],
  );

  const favoriteChannels = useMemo(
    () => channels.filter((c) => favoriteIds.includes(c.id)),
    [channels, favoriteIds],
  );

  const globeMarkers = useMemo(
    () => countriesWithChannels.map((c) => ({
      code: c.code,
      name: c.name,
      flag: c.flag,
      channelCount: c.channelCount,
    })),
    [countriesWithChannels],
  );

  const handleSelectCountry = useCallback((code: string | null) => {
    setSelectedCountry(code);
    setSelectedChannel(null);
    if (!code) setCategory(null);
    setView('explore');
  }, []);

  const handleGlobeSelect = useCallback((code: string) => {
    handleSelectCountry(code);
  }, [handleSelectCountry]);

  const handleRandom = useCallback(() => {
    const ch = pickRandom();
    if (!ch) return;
    setSelectedCountry(ch.countryCode);
    setSelectedChannel(ch);
    setView('explore');
  }, [pickRandom]);

  const handleToggleFavorite = useCallback((id: string) => {
    setFavoriteIds(toggleFavorite(id));
  }, []);

  const shellClass = embedded ? 'h-full min-h-0' : 'h-dvh';

  if (loading) {
    return (
      <div className={`flex ${shellClass} items-center justify-center bg-[#050810] text-zinc-400`}>
        <div className="text-center">
          <Globe2 className="mx-auto mb-3 size-10 animate-pulse text-brand-cyan/60" />
          <Loader2 className="mx-auto mb-2 size-5 animate-spin text-brand-cyan" />
          <p className="text-sm">Loading world TV catalog…</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className={`flex ${shellClass} items-center justify-center bg-[#050810] p-6 text-center text-zinc-300`}>
        <div>
          <p className="text-lg font-semibold text-brand-rose">Could not load channels</p>
          <p className="mt-2 text-sm text-zinc-500">{error}</p>
          {onClose && (
            <Button variant="outline" size="sm" onClick={onClose} className="mt-4">
              Back
            </Button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className={`flex ${shellClass} flex-col overflow-hidden bg-[#050810] text-zinc-100`}>
      <div className="relative shrink-0">
        <TvGardenHeader view={view} onViewChange={setView} onRandom={handleRandom} channelCount={channels.length} />
        {onClose && (
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={onClose}
            className="absolute right-3 top-1/2 size-8 -translate-y-1/2 text-zinc-500 hover:text-white"
          >
            <X className="size-4" />
          </Button>
        )}
      </div>

      {view === 'about' ? (
        <main className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-8">
          <div className="mx-auto max-w-2xl space-y-4 text-sm leading-relaxed text-zinc-400">
            <h2 className="text-xl font-bold text-white">Watch global live TV — free</h2>
            <p>
              Spin the globe, pick a country, and stream free-to-air channels from the IPTV-org catalog.
              Built into V-Call — watch alone or keep the call open on the side.
            </p>
            <p className="text-xs text-zinc-600">
              Many streams go offline; try another channel if playback fails.
            </p>
          </div>
        </main>
      ) : view === 'favorites' ? (
        <main className="flex min-h-0 flex-1 flex-col gap-3 p-3 lg:flex-row">
          <section className="min-h-0 flex-1 overflow-y-auto rounded-2xl border border-white/10 bg-zinc-950/50 p-3">
            <h2 className="mb-3 text-xs font-bold uppercase tracking-wider text-zinc-500">Your favorites</h2>
            {favoriteChannels.length === 0 ? (
              <p className="text-sm text-zinc-500">Star channels while browsing to save them here.</p>
            ) : (
              <ul className="space-y-1">
                {favoriteChannels.map((ch) => (
                  <li key={ch.id}>
                    <button
                      type="button"
                      onClick={() => { setSelectedCountry(ch.countryCode); setSelectedChannel(ch); setView('explore'); }}
                      className="w-full rounded-xl px-3 py-2 text-left hover:bg-white/5"
                    >
                      <p className="text-sm text-zinc-100">{ch.name}</p>
                      <p className="text-[10px] text-zinc-500">{ch.countryCode} · {ch.countryName}</p>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>
          <section className="w-full shrink-0 lg:w-[min(480px,45%)]">
            <LivePlayer channel={selectedChannel} />
          </section>
        </main>
      ) : (
        <main className="flex min-h-0 flex-1 flex-col overflow-hidden lg:flex-row">
          <ChannelPanel
            countries={countriesWithChannels}
            allChannels={channels}
            channels={countryChannels}
            selectedCountry={selectedCountry}
            selectedChannel={selectedChannel}
            search={search}
            category={category}
            categories={categories}
            favoriteIds={favoriteIds}
            onSearchChange={setSearch}
            onCategoryChange={setCategory}
            onSelectCountry={(code) => {
              handleSelectCountry(code);
            }}
            onSelectChannel={setSelectedChannel}
            onToggleFavorite={handleToggleFavorite}
          />

          <section className="relative min-h-0 flex-1 lg:min-h-0">
            <div className="absolute inset-0 min-h-[200px]">
              <GlobeScene
                markers={globeMarkers}
                selectedCode={selectedCountry}
                onSelectCountry={handleGlobeSelect}
              />
            </div>

            <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 p-2 sm:p-3">
              <div className="pointer-events-auto mx-auto max-w-xl">
                <LivePlayer channel={selectedChannel} />
              </div>
            </div>

            {selectedCountry && !selectedChannel && (
              <div className="pointer-events-none absolute inset-x-0 top-3 z-10 flex justify-center">
                <p className="rounded-full bg-black/60 px-3 py-1 text-[11px] text-zinc-300 backdrop-blur-md">
                  {countriesWithChannels.find((c) => c.code === selectedCountry)?.name} — pick a channel
                </p>
              </div>
            )}
          </section>
        </main>
      )}

      <nav className="flex shrink-0 border-t border-white/10 bg-zinc-950/90 px-2 py-2 sm:hidden">
        {(['explore', 'favorites', 'about'] as ViewMode[]).map((id) => (
          <button
            key={id}
            type="button"
            onClick={() => setView(id)}
            className={`flex-1 rounded-lg py-2 text-xs font-semibold capitalize ${view === id ? 'text-brand-cyan' : 'text-zinc-500'}`}
          >
            {id}
          </button>
        ))}
      </nav>
    </div>
  );
}
