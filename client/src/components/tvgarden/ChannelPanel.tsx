import { Search, Star, X, Sparkles, List, MapPin } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { LiveChannel } from '@/lib/tvgarden/types';
import {
  analyzeSearchQuery,
  filterCountriesByQuery,
  QUICK_SEARCHES,
  searchChannels,
} from '@/lib/tvgarden/smartSearch';

const PAGE_SIZE = 80;

interface CountryRow {
  code: string;
  name: string;
  flag: string;
  channelCount: number;
}

type SidebarTab = 'countries' | 'channels';

interface ChannelPanelProps {
  countries: CountryRow[];
  allChannels: LiveChannel[];
  channels: LiveChannel[];
  selectedCountry: string | null;
  selectedChannel: LiveChannel | null;
  search: string;
  category: string | null;
  categories: string[];
  favoriteIds: string[];
  onSearchChange: (q: string) => void;
  onCategoryChange: (cat: string | null) => void;
  onSelectCountry: (code: string | null) => void;
  onSelectChannel: (ch: LiveChannel) => void;
  onToggleFavorite: (id: string) => void;
}

function ChannelRow({
  ch,
  active,
  fav,
  showCountry,
  onSelectChannel,
  onToggleFavorite,
}: {
  ch: LiveChannel;
  active: boolean;
  fav: boolean;
  showCountry?: boolean;
  onSelectChannel: (ch: LiveChannel) => void;
  onToggleFavorite: (id: string) => void;
}) {
  const meta = ch.categories[0] ?? 'Live';
  return (
    <li className="[content-visibility:auto] [contain-intrinsic-size:0_36px]">
      <div
        className={`flex items-center gap-0.5 rounded-lg pr-0.5 ${
          active ? 'bg-brand-cyan/10 ring-1 ring-brand-cyan/25' : 'hover:bg-white/[0.04]'
        }`}
      >
        <button
          type="button"
          onClick={() => onSelectChannel(ch)}
          className="min-w-0 flex-1 px-2.5 py-1.5 text-left"
        >
          <p className="truncate text-[13px] font-medium leading-tight text-zinc-100">{ch.name}</p>
          <p className="truncate text-[10px] leading-tight text-zinc-500">
            {showCountry && (
              <span className="font-mono text-zinc-600">{ch.countryCode} · </span>
            )}
            <span className="capitalize">{meta}</span>
          </p>
        </button>
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onToggleFavorite(ch.id); }}
          className={`shrink-0 rounded-md p-1.5 ${fav ? 'text-amber-400/90' : 'text-zinc-700 hover:text-zinc-400'}`}
          title={fav ? 'Remove favorite' : 'Add favorite'}
        >
          <Star className={`size-3 ${fav ? 'fill-current' : ''}`} />
        </button>
      </div>
    </li>
  );
}

function InfiniteChannelList({
  items,
  selectedChannel,
  favoriteIds,
  showCountry,
  onSelectChannel,
  onToggleFavorite,
  emptyMessage,
}: {
  items: LiveChannel[];
  selectedChannel: LiveChannel | null;
  favoriteIds: string[];
  showCountry?: boolean;
  onSelectChannel: (ch: LiveChannel) => void;
  onToggleFavorite: (id: string) => void;
  emptyMessage: string;
}) {
  const [visible, setVisible] = useState(PAGE_SIZE);
  const sentinelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setVisible(PAGE_SIZE);
  }, [items]);

  useEffect(() => {
    const el = sentinelRef.current;
    if (!el || visible >= items.length) return;

    const io = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          setVisible((v) => Math.min(v + PAGE_SIZE, items.length));
        }
      },
      { rootMargin: '120px' },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [visible, items.length]);

  const slice = items.slice(0, visible);

  if (items.length === 0) {
    return <p className="px-3 py-8 text-center text-xs text-zinc-500">{emptyMessage}</p>;
  }

  return (
    <>
      <ul className="space-y-px">
        {slice.map((ch) => (
          <ChannelRow
            key={ch.id}
            ch={ch}
            active={selectedChannel?.id === ch.id}
            fav={favoriteIds.includes(ch.id)}
            showCountry={showCountry}
            onSelectChannel={onSelectChannel}
            onToggleFavorite={onToggleFavorite}
          />
        ))}
      </ul>
      {visible < items.length && (
        <div ref={sentinelRef} className="py-3 text-center text-[10px] text-zinc-600">
          Showing {visible} of {items.length} — scroll for more
        </div>
      )}
    </>
  );
}

export function ChannelPanel({
  countries,
  allChannels,
  channels,
  selectedCountry,
  selectedChannel,
  search,
  category,
  categories,
  favoriteIds,
  onSearchChange,
  onCategoryChange,
  onSelectCountry,
  onSelectChannel,
  onToggleFavorite,
}: ChannelPanelProps) {
  const [tab, setTab] = useState<SidebarTab>(selectedCountry ? 'channels' : 'countries');
  const trimmed = search.trim();
  const analysis = useMemo(() => analyzeSearchQuery(search), [search]);

  useEffect(() => {
    if (selectedCountry) setTab('channels');
  }, [selectedCountry]);

  const globalResults = useMemo(
    () => (trimmed.length >= 2 ? searchChannels(allChannels, search, { category, limit: 800 }) : []),
    [allChannels, search, category, trimmed.length],
  );

  const allBrowseList = useMemo(() => {
    let list = allChannels;
    if (category) list = list.filter((ch) => ch.categories.includes(category));
    if (trimmed.length >= 2) list = searchChannels(list, search, { category: null, limit: 800 });
    return list;
  }, [allChannels, category, search, trimmed.length]);

  const localResults = useMemo(() => {
    let list = channels;
    if (category) list = list.filter((ch) => ch.categories.includes(category));
    if (trimmed.length >= 2) list = searchChannels(list, search, { category: null, limit: 800 });
    return list;
  }, [channels, category, search, trimmed.length]);

  const filteredCountries = filterCountriesByQuery(countries, search);
  const showGlobalSearch = trimmed.length >= 2 && (analysis.isTopic || globalResults.length > 0);

  const handlePickChannel = useCallback((ch: LiveChannel) => {
    if (ch.countryCode !== selectedCountry) {
      onSelectCountry(ch.countryCode);
    }
    onSelectChannel(ch);
  }, [selectedCountry, onSelectCountry, onSelectChannel]);

  const selectedCountryMeta = countries.find((c) => c.code === selectedCountry);
  const listCount = showGlobalSearch
    ? globalResults.length
    : tab === 'channels' && !selectedCountry
      ? allBrowseList.length
      : localResults.length;

  return (
    <aside className="flex max-h-[42dvh] w-full min-h-0 shrink-0 flex-col border-b border-white/10 bg-zinc-950/95 backdrop-blur-xl lg:max-h-none lg:h-full lg:shrink lg:w-[min(100%,22rem)] lg:border-b-0 lg:border-r">
      {/* Search + filters */}
      <div className="shrink-0 space-y-2 border-b border-white/10 p-2.5">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-zinc-600" />
          <input
            type="search"
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Football, news, BBC…"
            className="h-8 w-full rounded-lg border border-zinc-800/80 bg-zinc-900/60 pl-8 pr-2 text-xs text-zinc-100 placeholder:text-zinc-600 focus:border-brand-cyan/40 focus:outline-none focus:ring-1 focus:ring-brand-cyan/20"
          />
        </div>

        {analysis.intentLabel && trimmed.length >= 2 && (
          <p className="flex items-center gap-1 px-0.5 text-[10px] text-brand-cyan">
            <Sparkles className="size-3 shrink-0 opacity-80" />
            {analysis.intentLabel}
            {analysis.suggestedCategories[0] && (
              <span className="text-zinc-600"> · {analysis.suggestedCategories[0]}</span>
            )}
          </p>
        )}

        {!trimmed && (
          <div className="flex flex-wrap gap-1">
            {QUICK_SEARCHES.map(({ label, query }) => (
              <button
                key={query}
                type="button"
                onClick={() => onSearchChange(query)}
                className="rounded-md border border-zinc-800 bg-zinc-900/50 px-2 py-0.5 text-[10px] font-medium text-zinc-400 transition hover:border-zinc-700 hover:text-zinc-200"
              >
                {label}
              </button>
            ))}
          </div>
        )}

        {/* Countries vs All channels */}
        {!showGlobalSearch && (
          <div className="flex gap-1 rounded-lg bg-zinc-900/80 p-0.5">
            <button
              type="button"
              onClick={() => { setTab('countries'); onSelectCountry(null); }}
              className={`flex flex-1 items-center justify-center gap-1 rounded-md py-1 text-[10px] font-semibold transition ${
                tab === 'countries' && !selectedCountry ? 'bg-zinc-800 text-zinc-100' : 'text-zinc-500 hover:text-zinc-300'
              }`}
            >
              <MapPin className="size-3" /> Countries
            </button>
            <button
              type="button"
              onClick={() => { setTab('channels'); onSelectCountry(null); }}
              className={`flex flex-1 items-center justify-center gap-1 rounded-md py-1 text-[10px] font-semibold transition ${
                tab === 'channels' || selectedCountry ? 'bg-zinc-800 text-zinc-100' : 'text-zinc-500 hover:text-zinc-300'
              }`}
            >
              <List className="size-3" /> All channels
            </button>
          </div>
        )}

        {/* All categories — horizontal scroll, no cap */}
        {categories.length > 0 && (tab === 'channels' || selectedCountry || showGlobalSearch) && (
          <div className="flex gap-1 overflow-x-auto pb-0.5 scrollbar-none">
            <button
              type="button"
              onClick={() => onCategoryChange(null)}
              className={`shrink-0 rounded-md px-2 py-0.5 text-[10px] font-medium ${
                !category ? 'bg-brand-cyan/15 text-brand-cyan' : 'bg-zinc-900 text-zinc-500 hover:text-zinc-300'
              }`}
            >
              All
            </button>
            {categories.map((cat) => (
              <button
                key={cat}
                type="button"
                onClick={() => onCategoryChange(cat === category ? null : cat)}
                className={`shrink-0 rounded-md px-2 py-0.5 text-[10px] font-medium capitalize ${
                  category === cat ? 'bg-brand-cyan/15 text-brand-cyan' : 'bg-zinc-900 text-zinc-500 hover:text-zinc-300'
                }`}
              >
                {cat}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* List header */}
      {(showGlobalSearch || tab === 'channels' || selectedCountry) && (
        <div className="flex shrink-0 items-center justify-between border-b border-white/5 px-3 py-1.5">
          <p className="text-[10px] font-medium uppercase tracking-wider text-zinc-600">
            {showGlobalSearch
              ? `Search · ${listCount}`
              : selectedCountryMeta
                ? `${selectedCountryMeta.name} · ${listCount}`
                : `All channels · ${listCount}`}
          </p>
          {selectedCountry && (
            <button
              type="button"
              onClick={() => onSelectCountry(null)}
              className="flex items-center gap-0.5 text-[10px] text-brand-cyan hover:underline"
            >
              <X className="size-2.5" /> Clear
            </button>
          )}
        </div>
      )}

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-y-contain px-1.5 py-1 [-webkit-overflow-scrolling:touch]">
        {showGlobalSearch ? (
          <InfiniteChannelList
            items={globalResults}
            selectedChannel={selectedChannel}
            favoriteIds={favoriteIds}
            showCountry
            onSelectChannel={handlePickChannel}
            onToggleFavorite={onToggleFavorite}
            emptyMessage={`No results for "${search}"`}
          />
        ) : tab === 'channels' && !selectedCountry ? (
          <InfiniteChannelList
            items={allBrowseList}
            selectedChannel={selectedChannel}
            favoriteIds={favoriteIds}
            showCountry
            onSelectChannel={handlePickChannel}
            onToggleFavorite={onToggleFavorite}
            emptyMessage="No channels in this category"
          />
        ) : !selectedCountry ? (
          <ul className="space-y-px py-0.5">
            {filteredCountries.map((c) => (
              <li key={c.code} className="[content-visibility:auto]">
                <button
                  type="button"
                  onClick={() => onSelectCountry(c.code)}
                  className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left transition hover:bg-white/[0.04]"
                >
                  <span className="w-6 shrink-0 text-center font-mono text-[10px] font-semibold text-zinc-500">
                    {c.code}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-[13px] text-zinc-200">{c.name}</span>
                  <span className="shrink-0 font-mono text-[10px] tabular-nums text-zinc-600">{c.channelCount}</span>
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <InfiniteChannelList
            items={localResults}
            selectedChannel={selectedChannel}
            favoriteIds={favoriteIds}
            onSelectChannel={onSelectChannel}
            onToggleFavorite={onToggleFavorite}
            emptyMessage="No channels match your filters"
          />
        )}
      </div>
    </aside>
  );
}
